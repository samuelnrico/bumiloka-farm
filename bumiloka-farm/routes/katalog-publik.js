const express = require('express');
const pool = require('../config/database');

const router = express.Router();

// Endpoint publik: hanya menampilkan produk aktif, ditampilkan, dan memiliki stok siap jual.
// Stok dihitung dari pergerakan batch, bukan dari jumlah panen agar tidak terjadi hitung ganda.
const STOK_PER_PRODUK = `
    SELECT
        bp.produk_id,
        COALESCE(SUM(
            CASE
                WHEN ps.jenis_pergerakan IN ('masuk', 'koreksi_masuk') THEN ps.jumlah
                WHEN ps.jenis_pergerakan IN ('keluar', 'koreksi_keluar') THEN -ps.jumlah
                ELSE 0
            END
        ), 0) AS stok_tersedia
    FROM batch_persediaan bp
    LEFT JOIN pergerakan_stok ps ON ps.batch_persediaan_id = bp.id
    GROUP BY bp.produk_id
`;

router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            WITH stok AS (${STOK_PER_PRODUK})
            SELECT
                p.id,
                p.nama_produk,
                p.kategori,
                p.jenis_produk,
                p.satuan_jual,
                p.harga_jual,
                p.berat_paket_kg,
                p.deskripsi,
                p.url_foto,
                p.satuan_stok,
                COALESCE(s.stok_tersedia, 0) AS stok_tersedia
            FROM produk p
            LEFT JOIN stok s ON s.produk_id = p.id
            WHERE p.aktif = TRUE
              AND p.ditampilkan = TRUE
              AND COALESCE(s.stok_tersedia, 0) > 0
            ORDER BY p.kategori, p.nama_produk
        `);

        res.set('Cache-Control', 'no-store');
        res.json({ status: 'berhasil', data: result.rows });
    } catch (error) {
        console.error('Gagal memuat katalog publik:', error.message);
        res.status(500).json({
            status: 'gagal',
            pesan: 'Katalog produk sedang tidak dapat dimuat.'
        });
    }
});

router.get('/:id', async (req, res) => {
    const id = req.params.id;
    if (!/^\d+$/.test(id) || Number(id) <= 0) {
        return res.status(400).json({ status: 'gagal', pesan: 'ID produk tidak valid.' });
    }

    try {
        const result = await pool.query(`
            WITH stok AS (${STOK_PER_PRODUK})
            SELECT
                p.id,
                p.nama_produk,
                p.kategori,
                p.jenis_produk,
                p.satuan_jual,
                p.harga_jual,
                p.berat_paket_kg,
                p.deskripsi,
                p.url_foto,
                p.satuan_stok,
                COALESCE(s.stok_tersedia, 0) AS stok_tersedia
            FROM produk p
            LEFT JOIN stok s ON s.produk_id = p.id
            WHERE p.id = $1
              AND p.aktif = TRUE
              AND p.ditampilkan = TRUE
              AND COALESCE(s.stok_tersedia, 0) > 0
            LIMIT 1
        `, [id]);

        if (!result.rowCount) {
            return res.status(404).json({
                status: 'gagal',
                pesan: 'Produk tidak tersedia di katalog.'
            });
        }

        res.set('Cache-Control', 'no-store');
        res.json({ status: 'berhasil', data: result.rows[0] });
    } catch (error) {
        console.error('Gagal memuat detail katalog:', error.message);
        res.status(500).json({
            status: 'gagal',
            pesan: 'Detail produk sedang tidak dapat dimuat.'
        });
    }
});

module.exports = router;
