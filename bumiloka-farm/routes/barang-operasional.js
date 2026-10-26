const express = require('express');
const pool = require('../config/database');
const { wajibLogin } = require('../middleware/auth');

const router = express.Router();
router.use(wajibLogin);

const KATEGORI = ['bibit', 'pupuk', 'pestisida', 'pakan', 'obat_ternak', 'kemasan', 'perlengkapan', 'lainnya'];
const teks = (v) => typeof v === 'string' ? v.trim() : '';
const angkaPositif = (v, desimal = 3) => {
    if (v === '' || v === null || v === undefined) return false;
    const s = String(v).trim();
    if (!new RegExp(`^\\d+(\\.\\d{1,${desimal}})?$`).test(s)) return false;
    const n = Number(s);
    return Number.isFinite(n) && n > 0;
};
const idValid = (v) => /^\d+$/.test(String(v ?? '')) && Number(v) > 0;

router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT b.id, b.nama_barang, b.kategori, b.satuan, b.stok_minimum, b.aktif,
                   COALESCE(s.total_masuk, 0) AS total_masuk,
                   COALESCE(s.total_pemakaian, 0) AS total_pemakaian,
                   COALESCE(s.stok_tersedia, 0) AS stok_tersedia,
                   COALESCE(s.total_biaya_pembelian, 0) AS total_biaya_pembelian
            FROM barang_operasional b
            LEFT JOIN v_stok_operasional s ON s.barang_operasional_id = b.id
            ORDER BY b.aktif DESC, b.nama_barang ASC`);
        res.json({ status: 'berhasil', data: result.rows });
    } catch (error) {
        console.error('Gagal mengambil barang operasional:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Data barang operasional gagal dimuat. Pastikan migrasi database tahap 1 sudah dijalankan.' });
    }
});

router.post('/', async (req, res) => {
    const nama = teks(req.body.nama_barang);
    const kategori = teks(req.body.kategori) || 'lainnya';
    const satuan = teks(req.body.satuan);
    const minimumRaw = req.body.stok_minimum === '' || req.body.stok_minimum == null ? '0' : String(req.body.stok_minimum);
    const minimum = Number(minimumRaw);
    if (!nama || nama.length > 150) return res.status(400).json({ status: 'gagal', pesan: 'Nama barang wajib diisi, maksimal 150 karakter.' });
    if (!KATEGORI.includes(kategori)) return res.status(400).json({ status: 'gagal', pesan: 'Kategori barang tidak valid.' });
    if (!satuan || satuan.length > 20) return res.status(400).json({ status: 'gagal', pesan: 'Satuan wajib diisi, maksimal 20 karakter.' });
    if (!Number.isFinite(minimum) || minimum < 0 || !/^\d+(\.\d{1,3})?$/.test(minimumRaw)) return res.status(400).json({ status: 'gagal', pesan: 'Stok minimum harus nol atau lebih, maksimal 3 angka desimal.' });
    try {
        const result = await pool.query(`
            INSERT INTO barang_operasional (nama_barang, kategori, satuan, stok_minimum)
            VALUES ($1, $2, $3, $4)
            RETURNING id, nama_barang, kategori, satuan, stok_minimum, aktif`, [nama, kategori, satuan, minimum]);
        res.status(201).json({ status: 'berhasil', pesan: 'Barang operasional berhasil ditambahkan.', data: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ status: 'gagal', pesan: 'Nama barang dengan satuan tersebut sudah terdaftar.' });
        console.error('Gagal menambah barang operasional:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Barang operasional gagal disimpan.' });
    }
});

router.patch('/:id', async (req, res) => {
    if (!idValid(req.params.id)) return res.status(400).json({ status: 'gagal', pesan: 'ID barang tidak valid.' });
    const nama = teks(req.body.nama_barang);
    const kategori = teks(req.body.kategori);
    const satuan = teks(req.body.satuan);
    const minimumRaw = String(req.body.stok_minimum ?? '0');
    const minimum = Number(minimumRaw);
    const aktif = req.body.aktif;
    if (!nama || nama.length > 150 || !KATEGORI.includes(kategori) || !satuan || satuan.length > 20 || !Number.isFinite(minimum) || minimum < 0 || !/^\d+(\.\d{1,3})?$/.test(minimumRaw) || typeof aktif !== 'boolean') {
        return res.status(400).json({ status: 'gagal', pesan: 'Data perubahan barang tidak valid.' });
    }
    try {
        const result = await pool.query(`UPDATE barang_operasional SET nama_barang=$1, kategori=$2, satuan=$3, stok_minimum=$4, aktif=$5 WHERE id=$6 RETURNING id, nama_barang, kategori, satuan, stok_minimum, aktif`, [nama, kategori, satuan, minimum, aktif, req.params.id]);
        if (!result.rowCount) return res.status(404).json({ status: 'gagal', pesan: 'Barang tidak ditemukan.' });
        res.json({ status: 'berhasil', pesan: 'Data barang diperbarui.', data: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') return res.status(409).json({ status: 'gagal', pesan: 'Nama barang dengan satuan tersebut sudah terdaftar.' });
        console.error('Gagal mengubah barang operasional:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Data barang gagal diperbarui.' });
    }
});

router.get('/pembelian', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.id, p.tanggal_pembelian, p.jumlah, p.satuan, p.harga_satuan, p.total_biaya, p.pemasok, p.catatan,
                   b.id AS barang_operasional_id, b.nama_barang
            FROM pembelian_operasional p JOIN barang_operasional b ON b.id=p.barang_operasional_id
            ORDER BY p.tanggal_pembelian DESC, p.id DESC LIMIT 300`);
        res.json({ status: 'berhasil', data: result.rows });
    } catch (error) {
        console.error('Gagal mengambil riwayat pembelian:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Riwayat pembelian gagal dimuat.' });
    }
});

router.post('/pembelian', async (req, res) => {
    const barangId = req.body.barang_operasional_id;
    const tanggal = teks(req.body.tanggal_pembelian);
    const jumlahRaw = req.body.jumlah;
    const hargaRaw = req.body.harga_satuan;
    const jumlah = Number(jumlahRaw);
    const harga = Number(hargaRaw);
    const pemasok = teks(req.body.pemasok);
    const catatan = teks(req.body.catatan);
    if (!idValid(barangId)) return res.status(400).json({ status: 'gagal', pesan: 'Pilih barang operasional.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal) || Number.isNaN(Date.parse(tanggal))) return res.status(400).json({ status: 'gagal', pesan: 'Tanggal pembelian tidak valid.' });
    if (!angkaPositif(jumlahRaw, 3)) return res.status(400).json({ status: 'gagal', pesan: 'Jumlah pembelian harus lebih dari nol, maksimal 3 angka desimal.' });
    if (hargaRaw === '' || hargaRaw === null || hargaRaw === undefined || !/^\d+(\.\d{1,2})?$/.test(String(hargaRaw)) || !Number.isFinite(harga) || harga < 0) return res.status(400).json({ status: 'gagal', pesan: 'Harga satuan tidak valid.' });
    if (pemasok.length > 150 || catatan.length > 1000) return res.status(400).json({ status: 'gagal', pesan: 'Pemasok atau catatan terlalu panjang.' });
    const total = Math.round((jumlah * harga + Number.EPSILON) * 100) / 100;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const barang = await client.query('SELECT id, satuan, aktif FROM barang_operasional WHERE id=$1 FOR UPDATE', [barangId]);
        if (!barang.rowCount || !barang.rows[0].aktif) {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'gagal', pesan: 'Barang tidak ditemukan atau sudah dinonaktifkan.' });
        }
        const satuan = barang.rows[0].satuan;
        const result = await client.query(`INSERT INTO pembelian_operasional (barang_operasional_id, tanggal_pembelian, jumlah, satuan, harga_satuan, total_biaya, pemasok, catatan) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [barangId, tanggal, jumlah, satuan, harga, total, pemasok || null, catatan || null]);
        await client.query('COMMIT');
        res.status(201).json({ status: 'berhasil', pesan: 'Pembelian berhasil dicatat.', data: result.rows[0] });
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('Gagal menyimpan pembelian operasional:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Pembelian gagal disimpan.' });
    } finally { if (client) client.release(); }
});

router.get('/pemakaian', async (req, res) => {
    try {
        const result = await pool.query(`SELECT m.id, m.tanggal_pemakaian, m.jumlah, m.satuan, m.keterangan, m.catatan, b.id AS barang_operasional_id, b.nama_barang FROM pemakaian_operasional m JOIN barang_operasional b ON b.id=m.barang_operasional_id ORDER BY m.tanggal_pemakaian DESC, m.id DESC LIMIT 300`);
        res.json({ status: 'berhasil', data: result.rows });
    } catch (error) {
        console.error('Gagal mengambil riwayat pemakaian:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Riwayat pemakaian gagal dimuat.' });
    }
});

router.post('/pemakaian', async (req, res) => {
    const barangId = req.body.barang_operasional_id;
    const tanggal = teks(req.body.tanggal_pemakaian);
    const jumlahRaw = req.body.jumlah;
    const jumlah = Number(jumlahRaw);
    const keterangan = teks(req.body.keterangan);
    const catatan = teks(req.body.catatan);
    if (!idValid(barangId)) return res.status(400).json({ status: 'gagal', pesan: 'Pilih barang operasional.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal) || Number.isNaN(Date.parse(tanggal))) return res.status(400).json({ status: 'gagal', pesan: 'Tanggal pemakaian tidak valid.' });
    if (!angkaPositif(jumlahRaw, 3)) return res.status(400).json({ status: 'gagal', pesan: 'Jumlah pemakaian harus lebih dari nol, maksimal 3 angka desimal.' });
    if (!keterangan || keterangan.length > 300 || catatan.length > 1000) return res.status(400).json({ status: 'gagal', pesan: 'Keterangan wajib diisi, maksimal 300 karakter.' });
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const barang = await client.query('SELECT id, satuan, aktif FROM barang_operasional WHERE id=$1 FOR UPDATE', [barangId]);
        if (!barang.rowCount || !barang.rows[0].aktif) {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'gagal', pesan: 'Barang tidak ditemukan atau sudah dinonaktifkan.' });
        }
        const saldo = await client.query(`SELECT stok_tersedia FROM v_stok_operasional WHERE barang_operasional_id=$1`, [barangId]);
        const tersedia = Number(saldo.rows[0]?.stok_tersedia ?? 0);
        if (jumlah > tersedia) {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'gagal', pesan: `Stok tidak cukup. Stok tersedia ${tersedia} ${barang.rows[0].satuan}.` });
        }
        const result = await client.query(`INSERT INTO pemakaian_operasional (barang_operasional_id, tanggal_pemakaian, jumlah, satuan, keterangan, catatan) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [barangId, tanggal, jumlah, barang.rows[0].satuan, keterangan, catatan || null]);
        await client.query('COMMIT');
        res.status(201).json({ status: 'berhasil', pesan: 'Pemakaian berhasil dicatat.', data: result.rows[0] });
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('Gagal menyimpan pemakaian operasional:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Pemakaian gagal disimpan.' });
    } finally { if (client) client.release(); }
});

module.exports = router;
