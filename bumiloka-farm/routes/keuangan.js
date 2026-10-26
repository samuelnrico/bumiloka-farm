
const express = require('express');
const pool = require('../config/database');
const { wajibLogin } = require('../middleware/auth');

const router = express.Router();
router.use(wajibLogin);

const KATEGORI_BIAYA_TAMBAHAN = ['kemasan', 'pemrosesan', 'lainnya'];
const KATEGORI_LAMA = ['bibit', 'pupuk', 'pestisida', 'pakan', 'obat_ternak'];

function tanggalValid(tanggal) {
    if (typeof tanggal !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
        return false;
    }

    const date = new Date(`${tanggal}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === tanggal;
}

function tanggalLokal(date = new Date()) {
    const tahun = date.getFullYear();
    const bulan = String(date.getMonth() + 1).padStart(2, '0');
    const hari = String(date.getDate()).padStart(2, '0');
    return `${tahun}-${bulan}-${hari}`;
}

function validasiBiaya(body, izinkanKategoriLama = false) {
    const tanggal = body.tanggal_biaya;
    const kategori = body.kategori_biaya;
    const keterangan = typeof body.keterangan === 'string'
        ? body.keterangan.trim()
        : '';

    const jumlah = body.jumlah === '' || body.jumlah === null || body.jumlah === undefined
        ? NaN
        : Number(body.jumlah);

    const satuan = typeof body.satuan === 'string' ? body.satuan.trim() : '';

    const total = Number(body.total_biaya);
    const catatan = typeof body.catatan === 'string'
        ? body.catatan.trim() || null
        : null;

    if (!tanggalValid(tanggal)) {
        return { error: 'Tanggal biaya tidak valid.' };
    }

    const kategoriValid = KATEGORI_BIAYA_TAMBAHAN.includes(kategori) || (izinkanKategoriLama && KATEGORI_LAMA.includes(kategori));
    if (!kategoriValid) {
        return { error: 'Untuk pupuk, bibit, pestisida, pakan, dan obat, catat pembelian melalui Barang Masuk. Di sini hanya catat biaya tambahan.' };
    }

    if (!keterangan || keterangan.length > 1000) {
        return { error: 'Keterangan wajib diisi, maksimal 1000 karakter.' };
    }

    const jumlahKosong = body.jumlah === '' || body.jumlah === null || body.jumlah === undefined;
    const satuanKosong = !satuan;
    if (!jumlahKosong && (!Number.isFinite(jumlah) || jumlah <= 0 || !/^\d+(\.\d{1,3})?$/.test(String(body.jumlah)))) {
        return { error: 'Jumlah harus lebih dari nol dan maksimal 3 desimal jika diisi.' };
    }
    if (!satuanKosong && satuan.length > 20) return { error: 'Satuan maksimal 20 karakter.' };
    if (jumlahKosong !== satuanKosong) return { error: 'Jumlah dan satuan harus diisi bersama atau sama-sama dikosongkan.' };

    if (!Number.isFinite(total) || total <= 0 ||
        !/^\d+(\.\d{1,2})?$/.test(String(body.total_biaya))) {
        return { error: 'Total biaya harus lebih dari nol dan maksimal 2 desimal.' };
    }

    if (catatan && catatan.length > 2000) {
        return { error: 'Catatan maksimal 2000 karakter.' };
    }

    return {
        value: {
            tanggal, kategori, keterangan, jumlah: jumlahKosong ? null : jumlah, satuan: satuanKosong ? null : satuan, total, catatan
        }
    };
}

// Pemeriksaan baca-saja untuk menjelaskan jika laporan tidak dapat mengambil data.
router.get('/diagnostik', async (req, res) => {
    try {
        const hasil = await pool.query(`
            SELECT nama, tersedia
            FROM (VALUES
                ('penjualan', to_regclass('public.penjualan') IS NOT NULL),
                ('detail_penjualan', to_regclass('public.detail_penjualan') IS NOT NULL),
                ('produk', to_regclass('public.produk') IS NOT NULL),
                ('batch_persediaan', to_regclass('public.batch_persediaan') IS NOT NULL),
                ('biaya_produksi', to_regclass('public.biaya_produksi') IS NOT NULL),
                ('pembelian_operasional', to_regclass('public.pembelian_operasional') IS NOT NULL)
            ) AS pemeriksaan(nama, tersedia)
        `);
        const hilang = hasil.rows.filter(x => !x.tersedia).map(x => x.nama);
        res.json({ status: 'berhasil', database: (await pool.query('SELECT current_database() AS nama')).rows[0].nama, pemeriksaan: hasil.rows, tabel_belum_tersedia: hilang });
    } catch (error) {
        console.error('Diagnostik keuangan gagal:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Pemeriksaan database gagal. Periksa koneksi dan log server.' });
    }
});

// Tidak ada pilihan produk atau siklus: biaya dicatat pada tingkat usaha.
router.get('/opsi', (req, res) => {
    res.json({ status: 'berhasil' });
});

// Daftar biaya produksi.
router.get('/biaya', async (req, res) => {
    try {
        const hasil = await pool.query(`
            SELECT
                b.id,
                b.tanggal_biaya,
                b.kategori_biaya,
                b.keterangan,
                b.jumlah,
                b.satuan,
                b.total_biaya,
                b.catatan
            FROM biaya_produksi b
            ORDER BY b.tanggal_biaya DESC, b.id DESC
            LIMIT 500
        `);

        res.json({ status: 'berhasil', data: hasil.rows });
    } catch (error) {
        console.error('Gagal memuat biaya produksi:', error.message);
        res.status(500).json({
            status: 'gagal',
            pesan: 'Riwayat biaya produksi gagal dimuat.'
        });
    }
});

// Menambahkan biaya produksi.
router.post('/biaya', async (req, res) => {
    const validasi = validasiBiaya(req.body, false);

    if (validasi.error) {
        return res.status(400).json({
            status: 'gagal',
            pesan: validasi.error
        });
    }

    const b = validasi.value;

    try {
        const hasil = await pool.query(`
            INSERT INTO biaya_produksi (
                tanggal_biaya,
                kategori_biaya,
                keterangan,
                jumlah,
                satuan,
                total_biaya,
                catatan
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            b.tanggal,
            b.kategori,
            b.keterangan,
            b.jumlah,
            b.satuan,
            b.total,
            b.catatan
        ]);

        res.status(201).json({
            status: 'berhasil',
            pesan: 'Biaya produksi berhasil dicatat.',
            data: hasil.rows[0]
        });
    } catch (error) {
        console.error('Gagal menyimpan biaya:', error.message);
        res.status(500).json({
            status: 'gagal',
            pesan: 'Biaya produksi gagal disimpan.'
        });
    }
});

// Mengedit biaya produksi.
router.put('/biaya/:id', async (req, res) => {
    if (!/^\d+$/.test(req.params.id) || Number(req.params.id) <= 0) {
        return res.status(400).json({
            status: 'gagal',
            pesan: 'ID biaya tidak valid.'
        });
    }

    const validasi = validasiBiaya(req.body, true);

    if (validasi.error) {
        return res.status(400).json({
            status: 'gagal',
            pesan: validasi.error
        });
    }

    const b = validasi.value;

    try {
        const hasil = await pool.query(`
            UPDATE biaya_produksi SET
                tanggal_biaya = $1,
                kategori_biaya = $2,
                keterangan = $3,
                jumlah = $4,
                satuan = $5,
                total_biaya = $6,
                catatan = $7
            WHERE id = $8
            RETURNING *
        `, [
            b.tanggal,
            b.kategori,
            b.keterangan,
            b.jumlah,
            b.satuan,
            b.total,
            b.catatan,
            req.params.id
        ]);

        if (!hasil.rowCount) {
            return res.status(404).json({
                status: 'gagal',
                pesan: 'Catatan biaya tidak ditemukan.'
            });
        }

        res.json({
            status: 'berhasil',
            pesan: 'Biaya produksi berhasil diperbarui.'
        });
    } catch (error) {
        console.error('Gagal mengedit biaya:', error.message);
        res.status(500).json({
            status: 'gagal',
            pesan: 'Biaya produksi gagal diperbarui.'
        });
    }
});

// Menghapus catatan biaya yang salah.
router.delete('/biaya/:id', async (req, res) => {
    if (!/^\d+$/.test(req.params.id) || Number(req.params.id) <= 0) {
        return res.status(400).json({
            status: 'gagal',
            pesan: 'ID biaya tidak valid.'
        });
    }

    try {
        const hasil = await pool.query(
            'DELETE FROM biaya_produksi WHERE id = $1 RETURNING id',
            [req.params.id]
        );

        if (!hasil.rowCount) {
            return res.status(404).json({
                status: 'gagal',
                pesan: 'Catatan biaya tidak ditemukan.'
            });
        }

        res.json({
            status: 'berhasil',
            pesan: 'Catatan biaya berhasil dihapus.'
        });
    } catch (error) {
        console.error('Gagal menghapus biaya:', error.message);
        res.status(500).json({
            status: 'gagal',
            pesan: 'Catatan biaya gagal dihapus.'
        });
    }
});

// Laporan pendapatan terealisasi dan biaya produksi pada tingkat usaha.
router.get('/laporan', async (req, res) => {
    const sekarang = new Date();
    const sampaiDefault = tanggalLokal(sekarang);
    const dariDefault = tanggalLokal(new Date(sekarang.getFullYear(), sekarang.getMonth(), 1));
    const dari = req.query.dari || dariDefault;
    const sampai = req.query.sampai || sampaiDefault;

    if (!tanggalValid(dari) || !tanggalValid(sampai) || dari > sampai) {
        return res.status(400).json({ status: 'gagal', pesan: 'Rentang tanggal laporan tidak valid.' });
    }

    try {
        const hasil = await pool.query(`
            WITH pendapatan AS (
                SELECT COALESCE(SUM(dp.jumlah_jual * dp.harga_satuan), 0) AS total
                FROM penjualan pj
                JOIN detail_penjualan dp ON dp.penjualan_id = pj.id
                WHERE pj.status_penjualan = 'selesai'
                  AND pj.status_pembayaran = 'dibayar'
                  AND pj.tanggal_penjualan >= $1::date
                  AND pj.tanggal_penjualan < ($2::date + INTERVAL '1 day')
            ), biaya_tambahan AS (
                SELECT COALESCE(SUM(total_biaya), 0) AS total
                FROM biaya_produksi
                WHERE tanggal_biaya >= $1::date AND tanggal_biaya <= $2::date
            ), pembelian AS (
                SELECT COALESCE(SUM(total_biaya), 0) AS total
                FROM pembelian_operasional
                WHERE tanggal_pembelian >= $1::date AND tanggal_pembelian <= $2::date
            )
            SELECT pendapatan.total AS pendapatan,
                   pembelian.total AS total_pembelian_operasional,
                   biaya_tambahan.total AS biaya_tambahan,
                   pembelian.total + biaya_tambahan.total AS total_biaya,
                   pendapatan.total - (pembelian.total + biaya_tambahan.total) AS laba
            FROM pendapatan CROSS JOIN biaya_tambahan CROSS JOIN pembelian
        `, [dari, sampai]);

        const perProduk = await pool.query(`
            SELECT pr.id AS produk_id, pr.nama_produk,
                   COALESCE(SUM(dp.jumlah_jual * dp.harga_satuan), 0) AS pendapatan
            FROM detail_penjualan dp
            JOIN penjualan pj ON pj.id = dp.penjualan_id
            JOIN batch_persediaan bp ON bp.id = dp.batch_persediaan_id
            JOIN produk pr ON pr.id = bp.produk_id
            WHERE pj.status_penjualan = 'selesai'
              AND pj.status_pembayaran = 'dibayar'
              AND pj.tanggal_penjualan >= $1::date
              AND pj.tanggal_penjualan < ($2::date + INTERVAL '1 day')
            GROUP BY pr.id, pr.nama_produk
            ORDER BY pendapatan DESC, pr.nama_produk
        `, [dari, sampai]);

        res.json({
            status: 'berhasil',
            periode: { dari, sampai },
            ringkasan: hasil.rows[0],
            per_produk: perProduk.rows
        });
    } catch (error) {
        console.error('Gagal membuat laporan keuangan:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Laporan keuangan gagal dihitung.' });
    }
});

module.exports = router;
