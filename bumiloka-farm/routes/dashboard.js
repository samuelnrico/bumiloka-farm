const express = require('express');
const pool = require('../config/database');
const { wajibLogin } = require('../middleware/auth');

const router = express.Router();
router.use(wajibLogin);

function tanggalValid(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

router.get('/ringkasan', async (req, res) => {
    const sekarang = new Date();
    const hariIni = `${sekarang.getFullYear()}-${String(sekarang.getMonth() + 1).padStart(2, '0')}-${String(sekarang.getDate()).padStart(2, '0')}`;
    const awalBulan = `${sekarang.getFullYear()}-${String(sekarang.getMonth() + 1).padStart(2, '0')}-01`;
    const dari = req.query.dari || awalBulan;
    const sampai = req.query.sampai || hariIni;

    if (!tanggalValid(dari) || !tanggalValid(sampai) || dari > sampai) {
        return res.status(400).json({ status: 'gagal', pesan: 'Rentang tanggal dashboard tidak valid.' });
    }

    try {
        const [produk, stok, penjualan, biaya, produksi, stokTerendah, barangMenipis, produksiMenunggu, penjualanTerbaru, grafik] = await Promise.all([
            pool.query(`SELECT COUNT(*)::int AS jumlah FROM produk WHERE aktif = TRUE`),
            pool.query(`
                WITH saldo_batch AS (
                    SELECT bp.id AS batch_id, bp.produk_id,
                           COALESCE(SUM(CASE
                               WHEN ps.jenis_pergerakan IN ('masuk','koreksi_masuk') THEN ps.jumlah
                               WHEN ps.jenis_pergerakan IN ('keluar','koreksi_keluar') THEN -ps.jumlah
                               ELSE 0 END), 0) AS saldo
                    FROM batch_persediaan bp
                    LEFT JOIN pergerakan_stok ps ON ps.batch_persediaan_id = bp.id
                    GROUP BY bp.id, bp.produk_id
                ), saldo_produk AS (
                    SELECT produk_id, SUM(saldo) AS stok
                    FROM saldo_batch GROUP BY produk_id
                )
                SELECT COUNT(*) FILTER (WHERE saldo > 0)::int AS batch_tersedia,
                       COALESCE(SUM(saldo), 0) AS total_unit
                FROM saldo_batch`),
            pool.query(`
                SELECT COUNT(*) FILTER (WHERE pj.status_penjualan <> 'dibatalkan')::int AS transaksi,
                       COUNT(*) FILTER (WHERE pj.status_penjualan = 'selesai' AND pj.status_pembayaran = 'dibayar')::int AS transaksi_selesai,
                       COUNT(*) FILTER (WHERE pj.status_penjualan <> 'dibatalkan' AND pj.status_pembayaran = 'belum_bayar')::int AS belum_dibayar,
                       COALESCE(SUM(CASE WHEN pj.status_penjualan = 'selesai' AND pj.status_pembayaran = 'dibayar'
                           THEN dp.total ELSE 0 END), 0) AS pendapatan
                FROM penjualan pj
                LEFT JOIN (
                    SELECT penjualan_id, SUM(jumlah_jual * harga_satuan) AS total
                    FROM detail_penjualan GROUP BY penjualan_id
                ) dp ON dp.penjualan_id = pj.id
                WHERE pj.tanggal_penjualan >= $1::date
                  AND pj.tanggal_penjualan < ($2::date + INTERVAL '1 day')`, [dari, sampai]),
            pool.query(`
                SELECT
                    (SELECT COALESCE(SUM(total_biaya), 0) FROM biaya_produksi WHERE tanggal_biaya >= $1::date AND tanggal_biaya <= $2::date) AS biaya_produksi,
                    (SELECT COALESCE(SUM(total_biaya), 0) FROM pembelian_operasional WHERE tanggal_pembelian >= $1::date AND tanggal_pembelian < ($2::date + INTERVAL '1 day')) AS pembelian_operasional`, [dari, sampai]),
            pool.query(`
                SELECT COUNT(*)::int AS jumlah,
                       (SELECT COALESCE(json_agg(json_build_object('satuan', q.satuan_stok, 'jumlah', q.total) ORDER BY q.satuan_stok), '[]'::json)
                        FROM (
                            SELECT p.satuan_stok, SUM(h.jumlah_hasil) AS total
                            FROM hasil_produksi_admin h
                            JOIN produk p ON p.id = h.produk_id
                            WHERE h.tanggal_produksi >= $1::date AND h.tanggal_produksi <= $2::date
                            GROUP BY p.satuan_stok
                        ) q) AS hasil_per_satuan
                FROM hasil_produksi_admin
                WHERE tanggal_produksi >= $1::date AND tanggal_produksi <= $2::date`, [dari, sampai]),
            pool.query(`
                WITH saldo_batch AS (
                    SELECT bp.produk_id,
                           COALESCE(SUM(CASE
                               WHEN ps.jenis_pergerakan IN ('masuk','koreksi_masuk') THEN ps.jumlah
                               WHEN ps.jenis_pergerakan IN ('keluar','koreksi_keluar') THEN -ps.jumlah
                               ELSE 0 END), 0) AS stok
                    FROM batch_persediaan bp
                    LEFT JOIN pergerakan_stok ps ON ps.batch_persediaan_id = bp.id
                    GROUP BY bp.id, bp.produk_id
                ), saldo_produk AS (
                    SELECT produk_id, SUM(stok) AS stok FROM saldo_batch GROUP BY produk_id
                )
                SELECT p.id, p.nama_produk, p.satuan_stok,
                       COALESCE(sp.stok, 0) AS stok
                FROM produk p LEFT JOIN saldo_produk sp ON sp.produk_id = p.id
                WHERE p.aktif = TRUE
                GROUP BY p.id, p.nama_produk, p.satuan_stok, sp.stok
                ORDER BY COALESCE(sp.stok, 0) ASC, p.nama_produk ASC
                LIMIT 5`),
            pool.query(`
                SELECT b.id, b.nama_barang, b.satuan,
                       COALESCE(v.stok_tersedia, 0) AS stok_tersedia,
                       COALESCE(b.stok_minimum, 0) AS stok_minimum
                FROM barang_operasional b
                LEFT JOIN v_stok_operasional v ON v.barang_operasional_id = b.id
                WHERE b.aktif = TRUE AND COALESCE(v.stok_tersedia, 0) <= COALESCE(b.stok_minimum, 0)
                ORDER BY COALESCE(v.stok_tersedia, 0) ASC, b.nama_barang ASC
                LIMIT 5`),
            pool.query(`
                SELECT h.id, h.jenis_produksi, h.tanggal_produksi, h.jumlah_hasil,
                       p.nama_produk, p.satuan_stok
                FROM hasil_produksi_admin h
                JOIN produk p ON p.id = h.produk_id
                WHERE h.status_verifikasi = 'menunggu'
                ORDER BY h.tanggal_produksi ASC, h.id ASC
                LIMIT 5`),
            pool.query(`
                SELECT pj.id, pj.kode_penjualan, pj.tanggal_penjualan, pj.nama_pelanggan,
                       pj.status_penjualan, pj.status_pembayaran,
                       COALESCE(SUM(dp.jumlah_jual * dp.harga_satuan), 0) AS total
                FROM penjualan pj
                LEFT JOIN detail_penjualan dp ON dp.penjualan_id = pj.id
                GROUP BY pj.id
                ORDER BY pj.tanggal_penjualan DESC, pj.id DESC
                LIMIT 6`),
            pool.query(`
                WITH hari AS (
                    SELECT generate_series($1::date, $2::date, INTERVAL '1 day')::date AS tanggal
                ), pemasukan AS (
                    SELECT pj.tanggal_penjualan::date AS tanggal,
                           SUM(dp.jumlah_jual * dp.harga_satuan) AS total
                    FROM penjualan pj JOIN detail_penjualan dp ON dp.penjualan_id = pj.id
                    WHERE pj.status_penjualan = 'selesai' AND pj.status_pembayaran = 'dibayar'
                      AND pj.tanggal_penjualan >= $1::date
                      AND pj.tanggal_penjualan < ($2::date + INTERVAL '1 day')
                    GROUP BY pj.tanggal_penjualan::date
                ), biaya AS (
                    SELECT tanggal, SUM(total) AS total FROM (
                        SELECT tanggal_biaya AS tanggal, total_biaya AS total
                        FROM biaya_produksi WHERE tanggal_biaya >= $1::date AND tanggal_biaya <= $2::date
                        UNION ALL
                        SELECT tanggal_pembelian::date AS tanggal, total_biaya AS total
                        FROM pembelian_operasional WHERE tanggal_pembelian >= $1::date AND tanggal_pembelian < ($2::date + INTERVAL '1 day')
                    ) semua_biaya GROUP BY tanggal
                )
                SELECT hari.tanggal,
                       COALESCE(pemasukan.total, 0) AS pendapatan,
                       COALESCE(biaya.total, 0) AS pengeluaran
                FROM hari LEFT JOIN pemasukan USING (tanggal) LEFT JOIN biaya USING (tanggal)
                ORDER BY hari.tanggal`, [dari, sampai])
        ]);

        const pendapatan = Number(penjualan.rows[0].pendapatan || 0);
        const biayaProduksi = Number(biaya.rows[0].biaya_produksi || 0);
        const biayaOperasional = Number(biaya.rows[0].pembelian_operasional || 0);
        const totalBiaya = biayaProduksi + biayaOperasional;

        res.set('Cache-Control', 'no-store');
        res.json({
            status: 'berhasil',
            periode: { dari, sampai },
            data: {
                produk_aktif: Number(produk.rows[0].jumlah || 0),
                batch_tersedia: Number(stok.rows[0].batch_tersedia || 0),
                total_stok: Number(stok.rows[0].total_unit || 0),
                transaksi: Number(penjualan.rows[0].transaksi || 0),
                transaksi_selesai: Number(penjualan.rows[0].transaksi_selesai || 0),
                belum_dibayar: Number(penjualan.rows[0].belum_dibayar || 0),
                pendapatan,
                biaya_produksi: biayaProduksi,
                pembelian_operasional: biayaOperasional,
                total_pengeluaran: totalBiaya,
                selisih_tercatat: pendapatan - totalBiaya,
                laba_bersih_tercatat: pendapatan - totalBiaya,
                jumlah_produksi: Number(produksi.rows[0].jumlah || 0),
                hasil_per_satuan: produksi.rows[0].hasil_per_satuan || [],
                produksi_menunggu: produksiMenunggu.rowCount,
                stok_terendah: stokTerendah.rows,
                barang_menipis: barangMenipis.rows,
                daftar_produksi_menunggu: produksiMenunggu.rows,
                penjualan_terbaru: penjualanTerbaru.rows,
                grafik: grafik.rows
            }
        });
    } catch (error) {
        console.error('Gagal memuat ringkasan dashboard:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Dashboard gagal memuat data. Periksa struktur tabel produksi dan barang operasional.' });
    }
});

module.exports = router;
