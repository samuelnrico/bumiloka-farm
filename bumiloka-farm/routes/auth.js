
const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../config/database');
const { rateLimit } = require('express-rate-limit');

const router = express.Router();

// Batasi percobaan login untuk mengurangi brute-force.
// Untuk deployment multi-instance, gunakan store rate-limit bersama (misalnya Redis).
const batasLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
        status: 'gagal',
        pesan: 'Terlalu banyak percobaan login. Coba lagi setelah 15 menit.'
    }
});

// Login pemilik
router.post('/login', batasLogin, async (req, res) => {
    const { nama_pengguna, kata_sandi } = req.body;

    if (
        typeof nama_pengguna !== 'string' ||
        typeof kata_sandi !== 'string' ||
        !nama_pengguna.trim() ||
        !kata_sandi
    ) {
        return res.status(400).json({
            status: 'gagal',
            pesan: 'Nama pengguna dan kata sandi wajib diisi.',
        });
    }

    try {
        const hasil = await pool.query(
            `SELECT id, nama_pengguna, kata_sandi_hash
             FROM pengguna
             WHERE nama_pengguna = $1`,
            [nama_pengguna.trim()]
        );

        if (hasil.rows.length === 0) {
            return res.status(401).json({
                status: 'gagal',
                pesan: 'Nama pengguna atau kata sandi salah.',
            });
        }

        const pemilik = hasil.rows[0];
        const cocok = await bcrypt.compare(
            kata_sandi,
            pemilik.kata_sandi_hash
        );

        if (!cocok) {
            return res.status(401).json({
                status: 'gagal',
                pesan: 'Nama pengguna atau kata sandi salah.',
            });
        }

        // Buat sesi baru setelah kredensial valid
        req.session.regenerate((error) => {
            if (error) {
                console.error('Gagal membuat sesi:', error.message);
                return res.status(500).json({
                    status: 'gagal',
                    pesan: 'Login belum dapat diproses.',
                });
            }

            req.session.pemilikId = pemilik.id;
            req.session.namaPengguna = pemilik.nama_pengguna;

            req.session.save((saveError) => {
                if (saveError) {
                    console.error('Gagal menyimpan sesi:', saveError.message);
                    return res.status(500).json({
                        status: 'gagal',
                        pesan: 'Sesi login gagal disimpan.',
                    });
                }

                return res.json({
                    status: 'berhasil',
                    pesan: 'Login berhasil.',
                    nama_pengguna: pemilik.nama_pengguna,
                });
            });
        });
    } catch (error) {
        console.error('Kesalahan login:', error.message);

        res.status(500).json({
            status: 'gagal',
            pesan: 'Terjadi kesalahan pada server.',
        });
    }
});

// Logout pemilik
router.post('/logout', (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error('Gagal logout:', error.message);
            return res.status(500).json({
                status: 'gagal',
                pesan: 'Logout gagal diproses.',
            });
        }

        res.clearCookie('bumiloka.sid');

        res.json({
            status: 'berhasil',
            pesan: 'Logout berhasil.',
        });
    });
});

module.exports = router;
