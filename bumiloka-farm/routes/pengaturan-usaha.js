const express = require('express');
const pool = require('../config/database');
const { wajibLogin } = require('../middleware/auth');

const router = express.Router();

const PILIH_KOLOM = `
    SELECT nama_usaha, slogan, nomor_whatsapp, alamat, url_logo
    FROM pengaturan_usaha
    WHERE id = 1
`;

// Endpoint publik: aman dibaca tanpa login untuk frontend umum.
router.get('/publik', async (req, res) => {
    try {
        const hasil = await pool.query(PILIH_KOLOM);
        if (!hasil.rowCount) {
            return res.json({
                status: 'berhasil',
                data: {
                    nama_usaha: 'BumiLoka Farm',
                    slogan: '',
                    nomor_whatsapp: '',
                    alamat: '',
                    url_logo: ''
                }
            });
        }
        res.json({ status: 'berhasil', data: hasil.rows[0] });
    } catch (error) {
        console.error('Gagal membaca profil usaha:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Informasi usaha gagal dimuat.' });
    }
});

// Semua endpoint pengelolaan di bawah ini hanya untuk admin yang login.
router.get('/', wajibLogin, async (req, res) => {
    try {
        const hasil = await pool.query(PILIH_KOLOM);
        res.json({
            status: 'berhasil',
            data: hasil.rows[0] || {
                nama_usaha: 'BumiLoka Farm', slogan: '', nomor_whatsapp: '', alamat: '', url_logo: ''
            }
        });
    } catch (error) {
        console.error('Gagal membaca pengaturan usaha:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Pengaturan usaha gagal dimuat.' });
    }
});

// Simpan hanya kolom yang dikirim. Kolom lain tetap memakai nilai database.
router.put('/', wajibLogin, async (req, res) => {
    const kolomDiizinkan = {
        nama_usaha: { sql: 'nama_usaha', max: 150, wajib: true },
        slogan: { sql: 'slogan', max: 200 },
        nomor_whatsapp: { sql: 'nomor_whatsapp', max: 25 },
        alamat: { sql: 'alamat', max: 2000 }
    };
    const entri = Object.entries(kolomDiizinkan).filter(([k]) => Object.prototype.hasOwnProperty.call(req.body || {}, k));
    if (!entri.length) return res.status(400).json({ status: 'gagal', pesan: 'Tidak ada perubahan yang dikirim.' });

    for (const [k, aturan] of entri) {
        const nilai = req.body[k];
        if (typeof nilai !== 'string') return res.status(400).json({ status: 'gagal', pesan: `Nilai ${k} tidak valid.` });
        if (aturan.wajib && !nilai.trim()) return res.status(400).json({ status: 'gagal', pesan: 'Nama usaha tidak boleh kosong.' });
        if (nilai.trim().length > aturan.max) return res.status(400).json({ status: 'gagal', pesan: `Nilai ${k} melebihi batas karakter.` });
    }

    try {
        await pool.query(`INSERT INTO pengaturan_usaha (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
        const sets = [];
        const values = [];
        entri.forEach(([k], i) => {
            values.push(req.body[k].trim() || null);
            sets.push(`${kolomDiizinkan[k].sql} = $${i + 1}`);
        });
        const hasil = await pool.query(`UPDATE pengaturan_usaha SET ${sets.join(', ')} WHERE id = 1 RETURNING nama_usaha, slogan, nomor_whatsapp, alamat, url_logo`, values);
        res.json({ status: 'berhasil', pesan: 'Perubahan pengaturan berhasil disimpan.', data: hasil.rows[0] });
    } catch (error) {
        console.error('Gagal menyimpan pengaturan usaha:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Pengaturan usaha gagal disimpan.' });
    }
});

// Upload logo dari perangkat pengguna. File disimpan di public/uploads/logos.
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const direktoriLogo = path.join(__dirname, '..', 'public', 'uploads', 'logos');
fs.mkdirSync(direktoriLogo, { recursive: true });
const penyimpananLogo = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, direktoriLogo),
    filename: (_req, file, cb) => {
        const ekstensi = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' })[file.mimetype];
        cb(null, `logo-${Date.now()}-${Math.round(Math.random() * 1e9)}${ekstensi || ''}`);
    }
});
const unggahLogo = multer({
    storage: penyimpananLogo,
    limits: { fileSize: 3 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
            return cb(new Error('Format logo harus JPG, PNG, WEBP, atau GIF.'));
        }
        cb(null, true);
    }
});

router.post('/logo', wajibLogin, (req, res) => {
    unggahLogo.single('logo')(req, res, async (error) => {
        if (error) return res.status(400).json({ status: 'gagal', pesan: error.message || 'Logo gagal diunggah.' });
        if (!req.file) return res.status(400).json({ status: 'gagal', pesan: 'Pilih file gambar terlebih dahulu.' });
        const urlLogo = `/uploads/logos/${req.file.filename}`;
        try {
            await pool.query(`INSERT INTO pengaturan_usaha (id, url_logo) VALUES (1, $1)
                ON CONFLICT (id) DO UPDATE SET url_logo = EXCLUDED.url_logo`, [urlLogo]);
            const hasil = await pool.query(PILIH_KOLOM);
            res.json({ status: 'berhasil', pesan: 'Logo berhasil diunggah dan disimpan.', data: hasil.rows[0] });
        } catch (dbError) {
            fs.unlink(req.file.path, () => {});
            console.error('Gagal menyimpan logo usaha:', dbError.message);
            res.status(500).json({ status: 'gagal', pesan: 'Logo terunggah tetapi gagal disimpan ke pengaturan.' });
        }
    });
});

module.exports = router;
