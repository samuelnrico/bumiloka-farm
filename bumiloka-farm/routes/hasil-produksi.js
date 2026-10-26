const express = require('express');
const pool = require('../config/database');
const { wajibLogin } = require('../middleware/auth');

const router = express.Router();
router.use(wajibLogin);

const teks = (v) => typeof v === 'string' ? v.trim() : '';
const idValid = (v) => /^\d+$/.test(String(v ?? '')) && Number(v) > 0;
const tanggalValid = (v) => {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const angkaPositif = (v, integer = false) => {
    if (v === '' || v === null || v === undefined) return false;
    const s = String(v).trim();
    if (!(integer ? /^\d+$/.test(s) : /^\d+(\.\d{1,3})?$/.test(s))) return false;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 && (!integer || Number.isSafeInteger(n));
};
const angkaNolPlus = (v) => {
    if (v === '' || v === null || v === undefined || !/^\d+(\.\d{1,3})?$/.test(String(v))) return false;
    return Number.isFinite(Number(v)) && Number(v) >= 0;
};

async function ringkasanPopulasi(db = pool) {
    const result = await db.query(`
        WITH saldo_lama AS (
            SELECT k.jenis_ternak,
                   GREATEST(0, k.jumlah_awal + COALESCE(SUM(
                       CASE
                           WHEN p.jenis_perubahan IN ('kematian','penjualan_hidup','pemrosesan') THEN -p.jumlah
                           WHEN p.jenis_perubahan IN ('penambahan','koreksi') THEN p.jumlah
                           ELSE 0
                       END
                   ), 0)) AS jumlah
            FROM kelompok_ternak k
            LEFT JOIN perubahan_jumlah_ternak p ON p.kelompok_ternak_id = k.id
            GROUP BY k.id, k.jenis_ternak, k.jumlah_awal
        ), lama AS (
            SELECT jenis_ternak, SUM(jumlah)::BIGINT AS jumlah FROM saldo_lama GROUP BY jenis_ternak
        ), baru AS (
            SELECT jenis_ternak,
                   SUM(CASE WHEN jenis_perubahan IN ('penambahan','koreksi_tambah') THEN jumlah
                            WHEN jenis_perubahan IN ('kematian','penjualan_hidup','pemrosesan','koreksi_kurang') THEN -jumlah
                            ELSE 0 END)::BIGINT AS jumlah
            FROM catatan_populasi_ternak GROUP BY jenis_ternak
        )
        SELECT jenis_ternak,
               GREATEST(0, COALESCE(lama.jumlah,0) + COALESCE(baru.jumlah,0))::BIGINT AS jumlah_tersisa
        FROM (VALUES ('ayam_petelur'::VARCHAR), ('ayam_potong'::VARCHAR)) AS jenis(jenis_ternak)
        LEFT JOIN lama USING (jenis_ternak)
        LEFT JOIN baru USING (jenis_ternak)
        ORDER BY jenis_ternak`);
    return result.rows;
}

router.get('/opsi', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, nama_produk, kategori, jenis_produk, satuan_stok
            FROM produk
            WHERE aktif = TRUE AND (
                (jenis_produk = 'sayuran' AND kategori = 'perkebunan' AND satuan_stok = 'kg') OR
                (jenis_produk = 'telur' AND kategori = 'peternakan' AND satuan_stok = 'butir') OR
                (jenis_produk = 'daging_ayam' AND kategori = 'peternakan' AND satuan_stok = 'kg')
            )
            ORDER BY kategori, nama_produk`);
        res.json({ status: 'berhasil', data: result.rows });
    } catch (error) {
        console.error('Gagal memuat opsi hasil produksi:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Pilihan produk gagal dimuat.' });
    }
});

router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT h.id, h.jenis_produksi, h.tanggal_produksi, h.jumlah_hasil,
                   h.jumlah_ayam_diproses, h.status_verifikasi, h.jumlah_layak,
                   h.jumlah_tidak_layak, h.alasan_tidak_layak, h.catatan,
                   h.dibuat_pada, h.dikonfirmasi_pada,
                   p.nama_produk, p.satuan_stok
            FROM hasil_produksi_admin h
            JOIN produk p ON p.id = h.produk_id
            ORDER BY CASE WHEN h.status_verifikasi = 'menunggu' THEN 0 ELSE 1 END,
                     h.tanggal_produksi DESC, h.id DESC
            LIMIT 500`);
        res.json({ status: 'berhasil', data: result.rows });
    } catch (error) {
        console.error('Gagal memuat hasil produksi:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Riwayat produksi gagal dimuat. Pastikan migrasi tahap 3 sudah dijalankan.' });
    }
});

router.post('/', async (req, res) => {
    const jenis = teks(req.body.jenis_produksi);
    const produkId = req.body.produk_id;
    const tanggal = teks(req.body.tanggal_produksi);
    const jumlahRaw = req.body.jumlah_hasil;
    const ayamRaw = req.body.jumlah_ayam_diproses;
    const catatan = teks(req.body.catatan);
    if (!['sayuran', 'telur', 'daging_ayam'].includes(jenis)) return res.status(400).json({ status: 'gagal', pesan: 'Pilih jenis produksi yang valid.' });
    if (!idValid(produkId)) return res.status(400).json({ status: 'gagal', pesan: 'Pilih produk yang sesuai.' });
    if (!tanggalValid(tanggal)) return res.status(400).json({ status: 'gagal', pesan: 'Tanggal produksi tidak valid.' });
    const unitInteger = jenis === 'telur';
    if (!angkaPositif(jumlahRaw, unitInteger)) return res.status(400).json({ status: 'gagal', pesan: unitInteger ? 'Jumlah telur harus berupa bilangan bulat lebih dari nol.' : 'Jumlah hasil harus lebih dari nol, maksimal 3 angka desimal.' });
    if (jenis === 'daging_ayam' && !angkaPositif(ayamRaw, true)) return res.status(400).json({ status: 'gagal', pesan: 'Jumlah ayam diproses harus berupa bilangan bulat lebih dari nol.' });
    if (jenis !== 'daging_ayam' && ayamRaw !== undefined && ayamRaw !== '') return res.status(400).json({ status: 'gagal', pesan: 'Jumlah ayam hanya diisi untuk pemrosesan ayam.' });
    if (catatan.length > 1000) return res.status(400).json({ status: 'gagal', pesan: 'Catatan maksimal 1000 karakter.' });

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const produk = await client.query(`SELECT id, jenis_produk, kategori, satuan_stok, aktif FROM produk WHERE id=$1 FOR SHARE`, [produkId]);
        if (!produk.rowCount || !produk.rows[0].aktif) {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'gagal', pesan: 'Produk tidak ditemukan atau tidak aktif.' });
        }
        const p = produk.rows[0];
        const cocok = (jenis === 'sayuran' && p.jenis_produk === 'sayuran' && p.kategori === 'perkebunan' && p.satuan_stok === 'kg') ||
            (jenis === 'telur' && p.jenis_produk === 'telur' && p.kategori === 'peternakan' && p.satuan_stok === 'butir') ||
            (jenis === 'daging_ayam' && p.jenis_produk === 'daging_ayam' && p.kategori === 'peternakan' && p.satuan_stok === 'kg');
        if (!cocok) {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'gagal', pesan: 'Jenis dan satuan produk tidak sesuai dengan jenis produksi.' });
        }

        if (jenis === 'daging_ayam') {
            await client.query("SELECT pg_advisory_xact_lock(hashtext('bumiloka-populasi-ayam_potong'))");
            const populasi = await ringkasanPopulasi(client);
            const tersedia = Number(populasi.find(x => x.jenis_ternak === 'ayam_potong')?.jumlah_tersisa || 0);
            if (Number(ayamRaw) > tersedia) {
                await client.query('ROLLBACK');
                return res.status(400).json({ status: 'gagal', pesan: `Jumlah ayam yang diproses melebihi populasi. Ternak ayam potong tersisa ${tersedia} ekor.` });
            }
        }

        const inserted = await client.query(`
            INSERT INTO hasil_produksi_admin
                (jenis_produksi, produk_id, tanggal_produksi, jumlah_hasil, jumlah_ayam_diproses, catatan)
            VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, jenis_produksi, jumlah_hasil, status_verifikasi`,
            [jenis, produkId, tanggal, Number(jumlahRaw), jenis === 'daging_ayam' ? Number(ayamRaw) : null, catatan || null]);
        const h = inserted.rows[0];

        if (jenis === 'daging_ayam') {
            await client.query(`
                INSERT INTO catatan_populasi_ternak
                    (jenis_ternak, tanggal_perubahan, jenis_perubahan, jumlah, catatan, hasil_produksi_id)
                VALUES ('ayam_potong', $1, 'pemrosesan', $2, $3, $4)`,
                [tanggal, Number(ayamRaw), `Pemrosesan ayam pada hasil produksi #${h.id}`, h.id]);
        }
        await client.query('COMMIT');
        res.status(201).json({ status: 'berhasil', pesan: 'Hasil produksi dicatat dan menunggu konfirmasi jumlah siap jual.', data: h });
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('Gagal menyimpan hasil produksi:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Hasil produksi gagal disimpan.' });
    } finally { if (client) client.release(); }
});

router.post('/:id/konfirmasi', async (req, res) => {
    if (!idValid(req.params.id)) return res.status(400).json({ status: 'gagal', pesan: 'ID hasil produksi tidak valid.' });
    const layakRaw = req.body.jumlah_layak;
    const tidakRaw = req.body.jumlah_tidak_layak;
    const alasan = teks(req.body.alasan_tidak_layak);
    if (!angkaNolPlus(layakRaw) || !angkaNolPlus(tidakRaw)) return res.status(400).json({ status: 'gagal', pesan: 'Jumlah layak dan tidak layak harus nol atau lebih.' });
    if (alasan.length > 1000) return res.status(400).json({ status: 'gagal', pesan: 'Alasan maksimal 1000 karakter.' });
    if (Number(tidakRaw) > 0 && !alasan) return res.status(400).json({ status: 'gagal', pesan: 'Alasan wajib diisi jika ada hasil yang tidak layak jual.' });

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const result = await client.query(`
            SELECT h.*, p.nama_produk, p.satuan_stok
            FROM hasil_produksi_admin h JOIN produk p ON p.id=h.produk_id
            WHERE h.id=$1 FOR UPDATE OF h`, [req.params.id]);
        if (!result.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ status: 'gagal', pesan: 'Catatan produksi tidak ditemukan.' });
        }
        const h = result.rows[0];
        if (h.status_verifikasi !== 'menunggu') {
            await client.query('ROLLBACK');
            return res.status(409).json({ status: 'gagal', pesan: 'Catatan produksi ini sudah diproses sebelumnya.' });
        }
        const layak = Number(layakRaw);
        const tidak = Number(tidakRaw);
        const total = Number(h.jumlah_hasil);
        if (Math.abs(layak + tidak - total) > 0.0005) {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'gagal', pesan: `Jumlah layak dan tidak layak harus sama dengan total produksi ${total} ${h.satuan_stok}.` });
        }
        if (h.jenis_produksi === 'telur' && (!Number.isInteger(layak) || !Number.isInteger(tidak))) {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'gagal', pesan: 'Jumlah telur layak dan tidak layak harus berupa bilangan bulat.' });
        }
        const status = 'dikonfirmasi';
        await client.query(`UPDATE hasil_produksi_admin SET status_verifikasi=$1, jumlah_layak=$2, jumlah_tidak_layak=$3, alasan_tidak_layak=$4, dikonfirmasi_pada=NOW() WHERE id=$5`,
            [status, layak, tidak, alasan || null, req.params.id]);

        let batchId = null;
        let kodeBatch = null;
        if (layak > 0) {
            kodeBatch = `PROD-${h.id}`;
            const batch = await client.query(`
                INSERT INTO batch_persediaan (produk_id, kode_batch, hasil_produksi_admin_id, tanggal_dibuat)
                VALUES ($1,$2,$3,NOW()) RETURNING id`, [h.produk_id, kodeBatch, h.id]);
            batchId = batch.rows[0].id;
            await client.query(`
                INSERT INTO pergerakan_stok (batch_persediaan_id, jenis_pergerakan, jumlah, tanggal_pergerakan, catatan)
                VALUES ($1, 'masuk', $2, NOW(), $3)`, [batchId, layak, `Hasil produksi #${h.id} dikonfirmasi siap jual`]);
        }
        await client.query('COMMIT');
        res.json({ status: 'berhasil', pesan: layak > 0 ? 'Konfirmasi berhasil. Jumlah layak jual sudah ditambahkan ke stok.' : 'Konfirmasi tersimpan. Tidak ada stok yang ditambahkan karena jumlah layak jual nol.', data: { id: Number(req.params.id), status_verifikasi: status, jumlah_layak: layak, jumlah_tidak_layak: tidak, batch_persediaan_id: batchId, kode_batch: kodeBatch, stok_ditambahkan: layak } });
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('Gagal mengonfirmasi hasil produksi:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Konfirmasi produksi gagal disimpan.' });
    } finally { if (client) client.release(); }
});

router.get('/populasi', async (req, res) => {
    try {
        const [populasi, riwayat] = await Promise.all([
            ringkasanPopulasi(),
            pool.query(`SELECT id, jenis_ternak, tanggal_perubahan, jenis_perubahan, jumlah, catatan FROM catatan_populasi_ternak ORDER BY tanggal_perubahan DESC, id DESC LIMIT 200`)
        ]);
        res.json({ status: 'berhasil', data: { ringkasan: populasi, riwayat: riwayat.rows } });
    } catch (error) {
        console.error('Gagal memuat populasi ternak:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Populasi ternak gagal dimuat. Pastikan migrasi tahap 3 sudah dijalankan.' });
    }
});

router.post('/populasi', async (req, res) => {
    const jenis = teks(req.body.jenis_ternak);
    const perubahan = teks(req.body.jenis_perubahan);
    const tanggal = teks(req.body.tanggal_perubahan);
    const jumlahRaw = req.body.jumlah;
    const catatan = teks(req.body.catatan);
    const jenisValid = ['ayam_petelur', 'ayam_potong'].includes(jenis);
    const perubahanValid = ['penambahan', 'kematian', 'koreksi_tambah', 'koreksi_kurang'].includes(perubahan);
    if (!jenisValid || !perubahanValid) return res.status(400).json({ status: 'gagal', pesan: 'Jenis ternak atau perubahan jumlah tidak valid.' });
    if (!tanggalValid(tanggal)) return res.status(400).json({ status: 'gagal', pesan: 'Tanggal perubahan tidak valid.' });
    if (!angkaPositif(jumlahRaw, true)) return res.status(400).json({ status: 'gagal', pesan: 'Jumlah ternak harus berupa bilangan bulat lebih dari nol.' });
    if (catatan.length > 1000) return res.status(400).json({ status: 'gagal', pesan: 'Catatan maksimal 1000 karakter.' });
    if (['koreksi_tambah', 'koreksi_kurang'].includes(perubahan) && !catatan) return res.status(400).json({ status: 'gagal', pesan: 'Alasan wajib diisi untuk koreksi populasi.' });

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`bumiloka-populasi-${jenis}`]);
        const before = await ringkasanPopulasi(client);
        const current = Number(before.find(x => x.jenis_ternak === jenis)?.jumlah_tersisa || 0);
        if (['kematian', 'koreksi_kurang'].includes(perubahan) && Number(jumlahRaw) > current) {
            await client.query('ROLLBACK');
            return res.status(400).json({ status: 'gagal', pesan: `Jumlah perubahan melebihi populasi saat ini (${current} ekor).` });
        }
        const result = await client.query(`INSERT INTO catatan_populasi_ternak (jenis_ternak, tanggal_perubahan, jenis_perubahan, jumlah, catatan) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [jenis, tanggal, perubahan, Number(jumlahRaw), catatan || null]);
        await client.query('COMMIT');
        res.status(201).json({ status: 'berhasil', pesan: 'Perubahan populasi ternak berhasil dicatat.', data: result.rows[0] });
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('Gagal mencatat populasi ternak:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Perubahan populasi ternak gagal disimpan.' });
    } finally { if (client) client.release(); }
});

module.exports = router;
