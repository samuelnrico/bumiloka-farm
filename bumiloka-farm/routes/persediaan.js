const express = require('express');
const pool = require('../config/database');
const { wajibLogin } = require('../middleware/auth');

const router = express.Router();
router.use(wajibLogin);

const RINGKASAN_STOK_SQL = `
    SELECT
        bp.id AS batch_persediaan_id,
        COALESCE(SUM(
            CASE
                WHEN ps.jenis_pergerakan IN ('masuk', 'koreksi_masuk')
                    THEN ps.jumlah
                ELSE -ps.jumlah
            END
        ), 0) AS stok_tersedia,
        COALESCE(SUM(
            CASE WHEN ps.jenis_pergerakan IN ('masuk', 'koreksi_masuk')
                THEN ps.jumlah ELSE 0 END
        ), 0) AS total_masuk,
        COALESCE(SUM(
            CASE WHEN ps.jenis_pergerakan IN ('keluar', 'koreksi_keluar')
                THEN ps.jumlah ELSE 0 END
        ), 0) AS total_keluar
    FROM batch_persediaan bp
    LEFT JOIN pergerakan_stok ps ON ps.batch_persediaan_id = bp.id
    GROUP BY bp.id
`;

// Pemeriksaan skema baca-saja untuk membantu menemukan penyebab data tidak tampil.
router.get('/diagnostik', async (req, res) => {
    try {
        const hasil = await pool.query(`
            SELECT nama, tersedia
            FROM (VALUES
                ('produk', to_regclass('public.produk') IS NOT NULL),
                ('batch_persediaan', to_regclass('public.batch_persediaan') IS NOT NULL),
                ('pergerakan_stok', to_regclass('public.pergerakan_stok') IS NOT NULL),
                ('barang_operasional', to_regclass('public.barang_operasional') IS NOT NULL),
                ('pembelian_operasional', to_regclass('public.pembelian_operasional') IS NOT NULL),
                ('pemakaian_operasional', to_regclass('public.pemakaian_operasional') IS NOT NULL),
                ('v_stok_operasional', to_regclass('public.v_stok_operasional') IS NOT NULL),
                ('hasil_produksi_admin', to_regclass('public.hasil_produksi_admin') IS NOT NULL),
                ('biaya_produksi', to_regclass('public.biaya_produksi') IS NOT NULL),
                ('penjualan', to_regclass('public.penjualan') IS NOT NULL),
                ('detail_penjualan', to_regclass('public.detail_penjualan') IS NOT NULL)
            ) AS pemeriksaan(nama, tersedia)
        `);
        const hilang = hasil.rows.filter(x => !x.tersedia).map(x => x.nama);
        res.json({ status: 'berhasil', database: (await pool.query('SELECT current_database() AS nama')).rows[0].nama, pemeriksaan: hasil.rows, tabel_belum_tersedia: hilang });
    } catch (error) {
        console.error('Diagnostik persediaan gagal:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Pemeriksaan database gagal. Periksa koneksi dan log server.' });
    }
});

// Ringkasan stok per produk. Produk tanpa batch tetap tampil dengan stok nol.
router.get('/ringkasan', async (req, res) => {
    try {
        const hasil = await pool.query(`
            WITH stok_batch AS (${RINGKASAN_STOK_SQL})
            SELECT
                pr.id AS produk_id,
                pr.nama_produk,
                pr.kategori,
                pr.jenis_produk,
                pr.satuan_stok,
                pr.satuan_jual,
                pr.harga_jual,
                pr.aktif,
                COALESCE(SUM(sb.stok_tersedia), 0) AS stok_tersedia,
                COUNT(DISTINCT bp.id)::integer AS jumlah_batch
            FROM produk pr
            LEFT JOIN batch_persediaan bp ON bp.produk_id = pr.id
            LEFT JOIN stok_batch sb ON sb.batch_persediaan_id = bp.id
            GROUP BY pr.id
            ORDER BY pr.aktif DESC, pr.nama_produk ASC
        `);

        const data = hasil.rows;
        res.json({
            status: 'berhasil',
            data,
            ringkasan: {
                jumlah_produk: data.length,
                produk_tersedia: data.filter((item) => Number(item.stok_tersedia) > 0).length,
                produk_habis: data.filter((item) => Number(item.stok_tersedia) <= 0).length,
                jumlah_batch: data.reduce((total, item) => total + Number(item.jumlah_batch), 0),
            },
        });
    } catch (error) {
        console.error('Gagal mengambil ringkasan persediaan:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Ringkasan persediaan gagal dimuat.' });
    }
});

// Daftar batch beserta asal dan stok hasil pergerakannya.
router.get('/batch', async (req, res) => {
    try {
        const hasil = await pool.query(`
            WITH stok_batch AS (${RINGKASAN_STOK_SQL})
            SELECT
                bp.id AS batch_persediaan_id,
                bp.kode_batch,
                bp.tanggal_dibuat,
                pr.id AS produk_id,
                pr.nama_produk,
                pr.kategori,
                pr.satuan_stok,
                COALESCE(sb.total_masuk, 0) AS total_masuk,
                COALESCE(sb.total_keluar, 0) AS total_keluar,
                COALESCE(sb.stok_tersedia, 0) AS stok_tersedia,
                CASE
                    WHEN bp.penyortiran_id IS NOT NULL THEN 'Penyortiran panen'
                    WHEN bp.produksi_telur_id IS NOT NULL THEN 'Produksi telur'
                    WHEN bp.pemrosesan_ayam_id IS NOT NULL THEN 'Pemrosesan ayam'
                    WHEN bp.hasil_produksi_admin_id IS NOT NULL THEN 'Hasil produksi'
                    ELSE 'Sumber tidak diketahui'
                END AS sumber_stok,
                COALESCE(bp.penyortiran_id, bp.produksi_telur_id, bp.pemrosesan_ayam_id, bp.hasil_produksi_admin_id) AS sumber_id
            FROM batch_persediaan bp
            JOIN produk pr ON pr.id = bp.produk_id
            LEFT JOIN stok_batch sb ON sb.batch_persediaan_id = bp.id
            ORDER BY bp.tanggal_dibuat DESC, bp.id DESC
        `);

        res.json({ status: 'berhasil', data: hasil.rows });
    } catch (error) {
        console.error('Gagal mengambil batch persediaan:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Daftar batch gagal dimuat.' });
    }
});

// Opsi batch untuk pencatatan koreksi stok.
router.get('/opsi-batch', async (req, res) => {
    try {
        const hasil = await pool.query(`
            WITH stok_batch AS (${RINGKASAN_STOK_SQL})
            SELECT
                bp.id AS batch_persediaan_id,
                bp.kode_batch,
                pr.nama_produk,
                pr.satuan_stok,
                COALESCE(sb.stok_tersedia, 0) AS stok_tersedia
            FROM batch_persediaan bp
            JOIN produk pr ON pr.id = bp.produk_id
            LEFT JOIN stok_batch sb ON sb.batch_persediaan_id = bp.id
            ORDER BY pr.nama_produk ASC, bp.tanggal_dibuat DESC, bp.id DESC
        `);

        res.json({ status: 'berhasil', data: hasil.rows });
    } catch (error) {
        console.error('Gagal mengambil opsi batch:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Pilihan batch gagal dimuat.' });
    }
});

// Riwayat 200 pergerakan stok terbaru.
router.get('/pergerakan', async (req, res) => {
    try {
        const hasil = await pool.query(`
            SELECT
                ps.id,
                ps.tanggal_pergerakan,
                ps.jenis_pergerakan,
                ps.jumlah,
                ps.catatan,
                bp.id AS batch_persediaan_id,
                bp.kode_batch,
                pr.nama_produk,
                pr.satuan_stok,
                pj.kode_penjualan
            FROM pergerakan_stok ps
            JOIN batch_persediaan bp ON bp.id = ps.batch_persediaan_id
            JOIN produk pr ON pr.id = bp.produk_id
            LEFT JOIN detail_penjualan dp ON dp.id = ps.detail_penjualan_id
            LEFT JOIN penjualan pj ON pj.id = dp.penjualan_id
            ORDER BY ps.tanggal_pergerakan DESC, ps.id DESC
            LIMIT 200
        `);

        res.json({ status: 'berhasil', data: hasil.rows });
    } catch (error) {
        console.error('Gagal mengambil riwayat pergerakan stok:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Riwayat pergerakan stok gagal dimuat.' });
    }
});

// Koreksi stok manual untuk penyesuaian fisik. Stok produksi dan penjualan tetap lewat modul asalnya.
router.post('/koreksi', async (req, res) => {
    const batchId = String(req.body.batch_persediaan_id ?? '');
    const jenis = req.body.jenis_pergerakan;
    const jumlahRaw = req.body.jumlah;
    const jumlah = Number(jumlahRaw);
    const catatan = typeof req.body.catatan === 'string' ? req.body.catatan.trim() : '';

    if (!/^\d+$/.test(batchId) || Number(batchId) <= 0) {
        return res.status(400).json({ status: 'gagal', pesan: 'Batch persediaan tidak valid.' });
    }
    if (!['koreksi_masuk', 'koreksi_keluar'].includes(jenis)) {
        return res.status(400).json({ status: 'gagal', pesan: 'Jenis koreksi tidak valid.' });
    }
    if (
        jumlahRaw === '' || jumlahRaw === null || jumlahRaw === undefined ||
        !Number.isFinite(jumlah) || jumlah <= 0 ||
        !/^\d+(\.\d{1,3})?$/.test(String(jumlahRaw))
    ) {
        return res.status(400).json({ status: 'gagal', pesan: 'Jumlah koreksi harus lebih dari nol dan maksimal 3 angka desimal.' });
    }
    if (!catatan || catatan.length > 500) {
        return res.status(400).json({ status: 'gagal', pesan: 'Catatan koreksi wajib diisi, maksimal 500 karakter.' });
    }

    let client;
    let transaksiAktif = false;

    try {
        client = await pool.connect();
        await client.query('BEGIN');
        transaksiAktif = true;

        // Kunci batch agar dua koreksi bersamaan tidak sama-sama memakai stok lama.
        const batch = await client.query(`
            SELECT id, kode_batch
            FROM batch_persediaan
            WHERE id = $1
            FOR UPDATE
        `, [batchId]);

        if (batch.rowCount === 0) {
            await client.query('ROLLBACK');
            transaksiAktif = false;
            return res.status(404).json({ status: 'gagal', pesan: 'Batch persediaan tidak ditemukan.' });
        }

        const stokHasil = await client.query(`
            SELECT COALESCE(SUM(
                CASE
                    WHEN jenis_pergerakan IN ('masuk', 'koreksi_masuk') THEN jumlah
                    ELSE -jumlah
                END
            ), 0) AS stok_tersedia
            FROM pergerakan_stok
            WHERE batch_persediaan_id = $1
        `, [batchId]);
        const stokSaatIni = Number(stokHasil.rows[0].stok_tersedia);

        if (jenis === 'koreksi_keluar' && jumlah > stokSaatIni) {
            await client.query('ROLLBACK');
            transaksiAktif = false;
            return res.status(400).json({
                status: 'gagal',
                pesan: `Stok tidak cukup. Stok batch saat ini ${stokSaatIni}.`,
            });
        }

        await client.query(`
            INSERT INTO pergerakan_stok (
                batch_persediaan_id, jenis_pergerakan, jumlah, catatan
            ) VALUES ($1, $2, $3, $4)
        `, [batchId, jenis, jumlah, catatan]);

        await client.query('COMMIT');
        transaksiAktif = false;

        res.status(201).json({
            status: 'berhasil',
            pesan: 'Koreksi stok berhasil disimpan.',
            data: {
                batch_persediaan_id: Number(batchId),
                kode_batch: batch.rows[0].kode_batch,
                jenis_pergerakan: jenis,
                jumlah,
                stok_sebelumnya: stokSaatIni,
                stok_sekarang: jenis === 'koreksi_masuk' ? stokSaatIni + jumlah : stokSaatIni - jumlah,
            },
        });
    } catch (error) {
        if (client && transaksiAktif) {
            try { await client.query('ROLLBACK'); } catch (_) {}
        }
        console.error('Gagal menyimpan koreksi stok:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Koreksi stok gagal disimpan.' });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
