
require('dotenv').config();

const bcrypt = require('bcrypt');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');
const pool = require('../config/database');

async function main() {
    const rl = readline.createInterface({ input: stdin, output: stdout });

    try {
        const namaPengguna = (await rl.question('Nama pengguna pemilik: ')).trim();
        const kataSandi = await rl.question('Kata sandi pemilik: ');

        if (!namaPengguna || !kataSandi) {
            throw new Error('Nama pengguna dan kata sandi wajib diisi.');
        }

        if (kataSandi.length < 12) {
            throw new Error('Gunakan kata sandi minimal 12 karakter.');
        }

        const hash = await bcrypt.hash(kataSandi, 12);

        const hasil = await pool.query(
            `INSERT INTO pengguna (nama_pengguna, kata_sandi_hash)
             VALUES ($1, $2)
             RETURNING id, nama_pengguna`,
            [namaPengguna, hash]
        );

        console.log('Akun pemilik berhasil dibuat:', hasil.rows[0]);
    } catch (error) {
        console.error('Gagal membuat akun:', error.message);
        process.exitCode = 1;
    } finally {
        rl.close();
        await pool.end();
    }
}

main();
