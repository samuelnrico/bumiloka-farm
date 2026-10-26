
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const pool = require('../config/database');
const { wajibLogin } = require('../middleware/auth');

const router = express.Router();

router.use(wajibLogin);

const direktoriFoto = path.join(__dirname, '..', 'public', 'uploads', 'produk');
fs.mkdirSync(direktoriFoto, { recursive: true });
const tipeFoto = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const penyimpananFoto = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, direktoriFoto),
    filename: (_req, file, cb) => cb(null, `produk-${Date.now()}-${Math.round(Math.random() * 1e9)}${tipeFoto[file.mimetype] || ''}`)
});
const unggahFoto = multer({
    storage: penyimpananFoto,
    limits: { fileSize: 3 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        if (!tipeFoto[file.mimetype]) return cb(new Error('Format foto harus JPG, PNG, WEBP, atau GIF.'));
        cb(null, true);
    }
});
function prosesUnggahFoto(req, res, next) {
    unggahFoto.single('foto')(req, res, (error) => {
        if (!error) return next();
        const pesan = error.code === 'LIMIT_FILE_SIZE' ? 'Ukuran foto maksimal 3 MB.' : (error.message || 'Foto gagal diunggah.');
        return res.status(400).json({ status: 'gagal', pesan });
    });
}
function hapusFotoLokal(urlFoto) {
    if (typeof urlFoto !== 'string' || !urlFoto.startsWith('/uploads/produk/')) return;
    const nama = path.basename(urlFoto);
    fs.unlink(path.join(direktoriFoto, nama), () => {});
}

const kategoriValid = ['perkebunan', 'peternakan'];
const jenisValid = ['sayuran', 'telur', 'daging_ayam'];
const satuanValid = ['kg', 'butir', 'paket'];

function validasiProduk(data) {
    const nama = typeof data.nama_produk === 'string'
        ? data.nama_produk.trim()
        : '';

    const kategori = data.kategori;
    const jenis = data.jenis_produk;
    const satuanStok = data.satuan_stok;
    const satuanJual = data.satuan_jual;
    const harga = Number(data.harga_jual);
    const berat = data.berat_paket_kg === '' ||
        data.berat_paket_kg === null ||
        data.berat_paket_kg === undefined
        ? null
        : Number(data.berat_paket_kg);

    if (!nama || nama.length > 150) {
        return { error: 'Nama produk wajib diisi, maksimal 150 karakter.' };
    }

    if (!kategoriValid.includes(kategori)) {
        return { error: 'Kategori produk tidak valid.' };
    }

    if (!jenisValid.includes(jenis)) {
        return { error: 'Jenis produk tidak valid.' };
    }

    if (
        (jenis === 'sayuran' && kategori !== 'perkebunan') ||
        (jenis !== 'sayuran' && kategori !== 'peternakan')
    ) {
        return { error: 'Kategori tidak sesuai dengan jenis produk.' };
    }

    if (!satuanValid.includes(satuanStok) ||
        !satuanValid.includes(satuanJual)) {
        return { error: 'Satuan stok atau satuan jual tidak valid.' };
    }

    if (!Number.isFinite(harga) || harga < 0) {
        return { error: 'Harga jual harus berupa angka nol atau lebih.' };
    }

    if (
        (jenis === 'sayuran' && satuanStok !== 'kg') ||
        (jenis === 'telur' && satuanStok !== 'butir') ||
        (jenis === 'daging_ayam' && satuanStok !== 'kg')
    ) {
        return { error: 'Satuan stok tidak sesuai dengan jenis produk.' };
    }

    // Konversi paket sementara hanya mendukung stok berbasis kg.
    if (satuanJual === 'paket') {
        if (satuanStok !== 'kg') {
            return {
                error: 'Penjualan dalam paket sementara hanya didukung untuk produk dengan stok kg.'
            };
        }

        if (!Number.isFinite(berat) || berat <= 0) {
            return {
                error: 'Isi berat paket dalam kg dengan angka lebih dari nol.'
            };
        }
    } else if (satuanJual !== satuanStok) {
        return {
            error: 'Satuan jual harus sama dengan satuan stok, kecuali paket berbasis kg.'
        };
    }

    if (
        berat !== null &&
        (!Number.isFinite(berat) || berat <= 0)
    ) {
        return { error: 'Berat paket harus lebih dari nol.' };
    }

    return {
        value: {
            nama_produk: nama,
            kategori,
            jenis_produk: jenis,
            satuan_stok: satuanStok,
            satuan_jual: satuanJual,
            harga_jual: harga,
            berat_paket_kg: satuanJual === 'paket' ? berat : null,
            deskripsi: typeof data.deskripsi === 'string'
                ? data.deskripsi.trim() || null
                : null,
            url_foto: typeof data.url_foto === 'string'
                ? data.url_foto.trim() || null
                : null,
            ditampilkan: data.ditampilkan === true ||
                data.ditampilkan === 'true',
        }
    };
}

// Melihat daftar produk, termasuk produk nonaktif
router.get('/', async (req, res) => {
    try {
        const hasil = await pool.query(`
            WITH stok AS (
                SELECT
                    bp.produk_id,
                    COALESCE(SUM(CASE
                        WHEN ps.jenis_pergerakan IN ('masuk', 'koreksi_masuk') THEN ps.jumlah
                        WHEN ps.jenis_pergerakan IN ('keluar', 'koreksi_keluar') THEN -ps.jumlah
                        ELSE 0
                    END), 0) AS stok_tersedia
                FROM batch_persediaan bp
                LEFT JOIN pergerakan_stok ps ON ps.batch_persediaan_id = bp.id
                GROUP BY bp.produk_id
            )
            SELECT
                p.id, p.nama_produk, p.kategori, p.jenis_produk,
                p.satuan_stok, p.satuan_jual, p.harga_jual,
                p.berat_paket_kg, p.deskripsi, p.url_foto,
                p.ditampilkan, p.aktif, p.dibuat_pada,
                COALESCE(s.stok_tersedia, 0) AS stok_tersedia
            FROM produk p
            LEFT JOIN stok s ON s.produk_id = p.id
            ORDER BY p.dibuat_pada DESC, p.id DESC
        `);

        res.json({ status: 'berhasil', data: hasil.rows });
    } catch (error) {
        console.error('Gagal mengambil produk:', error.message);
        res.status(500).json({
            status: 'gagal',
            pesan: 'Daftar produk gagal dimuat.'
        });
    }
});

// Menambahkan produk
router.post('/', prosesUnggahFoto, async (req, res) => {
    if (req.file) req.body.url_foto = `/uploads/produk/${req.file.filename}`;
    const validasi = validasiProduk(req.body);

    if (validasi.error) {
        if (req.file) hapusFotoLokal(`/uploads/produk/${req.file.filename}`);
        return res.status(400).json({
            status: 'gagal',
            pesan: validasi.error
        });
    }

    const p = validasi.value;

    try {
        const hasil = await pool.query(`
            INSERT INTO produk (
                nama_produk, kategori, jenis_produk,
                satuan_stok, satuan_jual, harga_jual,
                berat_paket_kg, deskripsi, url_foto, ditampilkan
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `, [
            p.nama_produk, p.kategori, p.jenis_produk,
            p.satuan_stok, p.satuan_jual, p.harga_jual,
            p.berat_paket_kg, p.deskripsi, p.url_foto,
            p.ditampilkan
        ]);

        res.status(201).json({
            status: 'berhasil',
            pesan: 'Produk berhasil ditambahkan.',
            data: hasil.rows[0]
        });
    } catch (error) {
        if (req.file) hapusFotoLokal(`/uploads/produk/${req.file.filename}`);
        console.error('Gagal menambahkan produk:', error.message);
        res.status(500).json({
            status: 'gagal',
            pesan: 'Produk gagal disimpan.'
        });
    }
});

// Mengubah informasi produk
router.put('/:id', prosesUnggahFoto, async (req, res) => {
    const id = req.params.id;
    if (req.file) req.body.url_foto = `/uploads/produk/${req.file.filename}`;

    if (!/^\d+$/.test(id)) {
        if (req.file) hapusFotoLokal(`/uploads/produk/${req.file.filename}`);
        return res.status(400).json({
            status: 'gagal',
            pesan: 'ID produk tidak valid.'
        });
    }

    const validasi = validasiProduk(req.body);

    if (validasi.error) {
        if (req.file) hapusFotoLokal(`/uploads/produk/${req.file.filename}`);
        return res.status(400).json({
            status: 'gagal',
            pesan: validasi.error
        });
    }

    const p = validasi.value;

    try {
        const fotoLama = await pool.query('SELECT url_foto FROM produk WHERE id = $1 AND aktif = TRUE', [id]);
        const hasil = await pool.query(`
            UPDATE produk SET
                nama_produk = $1,
                kategori = $2,
                jenis_produk = $3,
                satuan_stok = $4,
                satuan_jual = $5,
                harga_jual = $6,
                berat_paket_kg = $7,
                deskripsi = $8,
                url_foto = $9,
                ditampilkan = $10
            WHERE id = $11 AND aktif = TRUE
            RETURNING *
        `, [
            p.nama_produk, p.kategori, p.jenis_produk,
            p.satuan_stok, p.satuan_jual, p.harga_jual,
            p.berat_paket_kg, p.deskripsi, p.url_foto,
            p.ditampilkan, id
        ]);

        if (hasil.rowCount === 0) {
            if (req.file) hapusFotoLokal(`/uploads/produk/${req.file.filename}`);
            return res.status(404).json({
                status: 'gagal',
                pesan: 'Produk tidak ditemukan atau sudah dinonaktifkan.'
            });
        }

        if (req.file && fotoLama.rows[0]?.url_foto && fotoLama.rows[0].url_foto !== p.url_foto) hapusFotoLokal(fotoLama.rows[0].url_foto);
        res.json({
            status: 'berhasil',
            pesan: 'Produk berhasil diperbarui.',
            data: hasil.rows[0]
        });
    } catch (error) {
        if (req.file) hapusFotoLokal(`/uploads/produk/${req.file.filename}`);
        console.error('Gagal memperbarui produk:', error.message);
        res.status(500).json({
            status: 'gagal',
            pesan: 'Perubahan produk gagal disimpan.'
        });
    }
});

// Mengaktifkan atau menonaktifkan produk
router.patch('/:id/status', async (req, res) => {
    const id = req.params.id;

    if (!/^\d+$/.test(id) || typeof req.body.aktif !== 'boolean') {
        return res.status(400).json({
            status: 'gagal',
            pesan: 'ID atau status produk tidak valid.'
        });
    }

    try {
        const hasil = await pool.query(`
            UPDATE produk
            SET aktif = $1,
                ditampilkan = CASE WHEN $1 = FALSE THEN FALSE ELSE ditampilkan END
            WHERE id = $2
            RETURNING id, nama_produk, aktif, ditampilkan
        `, [req.body.aktif, id]);

        if (hasil.rowCount === 0) {
            return res.status(404).json({
                status: 'gagal',
                pesan: 'Produk tidak ditemukan.'
            });
        }

        res.json({
            status: 'berhasil',
            pesan: req.body.aktif
                ? 'Produk berhasil diaktifkan.'
                : 'Produk berhasil dinonaktifkan.',
            data: hasil.rows[0]
        });
    } catch (error) {
        console.error('Gagal mengubah status produk:', error.message);
        res.status(500).json({
            status: 'gagal',
            pesan: 'Status produk gagal diperbarui.'
        });
    }
});

module.exports = router;
