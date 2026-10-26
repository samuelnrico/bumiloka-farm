const express = require('express');
const crypto = require('crypto');
const pool = require('../config/database');
const { wajibLogin } = require('../middleware/auth');
const { STOK_BATCH_SQL, bulat3, hitungJumlahStok, bacaSaldoBatch, catatDetailPenjualan } = require('../services/stok-penjualan');

const router = express.Router();
router.use(wajibLogin);

function angkaValid(raw, maksDesimal = 3) {
    if (raw === '' || raw === null || raw === undefined) return false;
    const teks = String(raw);
    const pola = maksDesimal === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${maksDesimal}})?$`);
    return pola.test(teks) && Number.isFinite(Number(teks));
}

function formatKodePenjualan() {
    const tanggal = new Date();
    const tanggalKode = `${tanggal.getFullYear()}${String(tanggal.getMonth() + 1).padStart(2, '0')}${String(tanggal.getDate()).padStart(2, '0')}`;
    return `JUAL-${tanggalKode}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

// Batch yang tersedia untuk ditambahkan ke transaksi.
router.get('/opsi-batch', async (req, res) => {
    try {
        const hasil = await pool.query(`
            WITH stok_batch AS (${STOK_BATCH_SQL})
            SELECT
                bp.id AS batch_persediaan_id,
                bp.kode_batch,
                bp.tanggal_dibuat,
                pr.id AS produk_id,
                pr.nama_produk,
                pr.satuan_stok,
                pr.satuan_jual,
                pr.harga_jual,
                pr.berat_paket_kg,
                COALESCE(sb.stok_tersedia, 0) AS stok_tersedia
            FROM batch_persediaan bp
            JOIN produk pr ON pr.id = bp.produk_id
            LEFT JOIN stok_batch sb ON sb.batch_persediaan_id = bp.id
            WHERE pr.aktif = TRUE AND COALESCE(sb.stok_tersedia, 0) > 0
            ORDER BY pr.nama_produk ASC, bp.tanggal_dibuat ASC, bp.id ASC
        `);
        res.json({ status: 'berhasil', data: hasil.rows });
    } catch (error) {
        console.error('Gagal memuat pilihan batch penjualan:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Pilihan stok untuk penjualan gagal dimuat.' });
    }
});

// Riwayat penjualan dengan total transaksi dihitung dari detail.
router.get('/riwayat', async (req, res) => {
    try {
        const hasil = await pool.query(`
            SELECT
                pj.id,
                pj.kode_penjualan,
                pj.tanggal_penjualan,
                pj.nama_pelanggan,
                pj.whatsapp_pelanggan,
                pj.sumber_penjualan,
                pj.status_penjualan,
                pj.status_pembayaran,
                pj.catatan,
                COALESCE(dp.jumlah_item, 0)::integer AS jumlah_item,
                COALESCE(dp.total_penjualan, 0) AS total_penjualan
            FROM penjualan pj
            LEFT JOIN (
                SELECT penjualan_id, COUNT(*)::integer AS jumlah_item,
                       SUM(jumlah_jual * harga_satuan) AS total_penjualan
                FROM detail_penjualan GROUP BY penjualan_id
            ) dp ON dp.penjualan_id = pj.id
            ORDER BY pj.tanggal_penjualan DESC, pj.id DESC
            LIMIT 200
        `);
        const ringkasan = await pool.query(`
            SELECT
                COUNT(*)::integer AS jumlah_transaksi,
                COALESCE(SUM(CASE WHEN pj.status_penjualan <> 'dibatalkan'
                    THEN COALESCE(dp.total_penjualan, 0) ELSE 0 END), 0) AS nilai_transaksi_aktif,
                COUNT(*) FILTER (
                    WHERE pj.status_pembayaran = 'belum_bayar'
                    AND pj.status_penjualan <> 'dibatalkan'
                )::integer AS menunggu_pembayaran
            FROM penjualan pj
            LEFT JOIN (
                SELECT penjualan_id, SUM(jumlah_jual * harga_satuan) AS total_penjualan
                FROM detail_penjualan GROUP BY penjualan_id
            ) dp ON dp.penjualan_id = pj.id
        `);
        res.json({ status: 'berhasil', data: hasil.rows, ringkasan: ringkasan.rows[0] });
    } catch (error) {
        console.error('Gagal memuat riwayat penjualan:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Riwayat penjualan gagal dimuat.' });
    }
});

// Detail satu transaksi.
router.get('/:id', async (req, res) => {
    const id = req.params.id;
    if (!/^\d+$/.test(id) || Number(id) <= 0) {
        return res.status(400).json({ status: 'gagal', pesan: 'ID penjualan tidak valid.' });
    }

    try {
        const header = await pool.query(`
            SELECT id, kode_penjualan, tanggal_penjualan, nama_pelanggan,
                   whatsapp_pelanggan, sumber_penjualan, status_penjualan,
                   status_pembayaran, catatan
            FROM penjualan WHERE id = $1
        `, [id]);
        if (!header.rowCount) {
            return res.status(404).json({ status: 'gagal', pesan: 'Transaksi penjualan tidak ditemukan.' });
        }

        const detail = await pool.query(`
            SELECT dp.id, dp.batch_persediaan_id, bp.kode_batch, pr.nama_produk,
                   dp.jumlah_jual, dp.satuan_jual, dp.harga_satuan,
                   dp.jumlah_stok, pr.satuan_stok,
                   (dp.jumlah_jual * dp.harga_satuan) AS subtotal
            FROM detail_penjualan dp
            JOIN batch_persediaan bp ON bp.id = dp.batch_persediaan_id
            JOIN produk pr ON pr.id = bp.produk_id
            WHERE dp.penjualan_id = $1
            ORDER BY dp.id
        `, [id]);

        const total = detail.rows.reduce((sum, item) => sum + Number(item.subtotal), 0);
        res.json({ status: 'berhasil', data: { ...header.rows[0], detail: detail.rows, total_penjualan: total } });
    } catch (error) {
        console.error('Gagal memuat detail penjualan:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Detail penjualan gagal dimuat.' });
    }
});

// Membuat transaksi dan mengurangi stok dalam satu transaksi database.
router.post('/', async (req, res) => {
    const namaPelanggan = typeof req.body.nama_pelanggan === 'string' ? req.body.nama_pelanggan.trim() : '';
    const whatsapp = typeof req.body.whatsapp_pelanggan === 'string' ? req.body.whatsapp_pelanggan.trim() : '';
    const sumber = req.body.sumber_penjualan;
    const catatan = typeof req.body.catatan === 'string' ? req.body.catatan.trim() : '';
    const items = req.body.items;

    if (namaPelanggan.length > 120 || whatsapp.length > 25 || catatan.length > 2000) {
        return res.status(400).json({ status: 'gagal', pesan: 'Nama pelanggan, WhatsApp, atau catatan terlalu panjang.' });
    }
    if (!['whatsapp', 'telepon', 'langsung', 'lainnya'].includes(sumber)) {
        return res.status(400).json({ status: 'gagal', pesan: 'Sumber penjualan tidak valid.' });
    }
    if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
        return res.status(400).json({ status: 'gagal', pesan: 'Transaksi harus memiliki 1 sampai 50 item.' });
    }

    const itemNormal = [];
    const batchTerpilih = new Set();
    for (const item of items) {
        const batchId = String(item.batch_persediaan_id ?? '');
        if (!/^\d+$/.test(batchId) || Number(batchId) <= 0) {
            return res.status(400).json({ status: 'gagal', pesan: 'Salah satu batch penjualan tidak valid.' });
        }
        if (batchTerpilih.has(batchId)) {
            return res.status(400).json({ status: 'gagal', pesan: 'Batch yang sama tidak boleh ditambahkan dua kali. Ubah jumlah pada satu baris item.' });
        }
        batchTerpilih.add(batchId);
        if (!angkaValid(item.jumlah_jual, 3) || Number(item.jumlah_jual) <= 0) {
            return res.status(400).json({ status: 'gagal', pesan: 'Jumlah jual harus lebih dari nol dan maksimal 3 angka desimal.' });
        }
        itemNormal.push({ batchId, jumlahJual: Number(item.jumlah_jual) });
    }

    let client;
    let transaksiAktif = false;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        transaksiAktif = true;

        const idsUrut = itemNormal.map((item) => item.batchId).sort((a, b) => Number(a) - Number(b));
        const batchHasil = await client.query(`
            SELECT bp.id AS batch_persediaan_id, bp.kode_batch,
                   pr.id AS produk_id, pr.nama_produk, pr.satuan_stok,
                   pr.satuan_jual, pr.harga_jual, pr.berat_paket_kg, pr.aktif
            FROM batch_persediaan bp
            JOIN produk pr ON pr.id = bp.produk_id
            WHERE bp.id = ANY($1::bigint[])
            ORDER BY bp.id
            FOR UPDATE OF bp
        `, [idsUrut]);

        if (batchHasil.rowCount !== itemNormal.length) {
            await client.query('ROLLBACK'); transaksiAktif = false;
            return res.status(400).json({ status: 'gagal', pesan: 'Satu atau lebih batch tidak ditemukan.' });
        }

        const petaBatch = new Map(batchHasil.rows.map((row) => [String(row.batch_persediaan_id), row]));
        const detailSiap = [];
        for (const item of itemNormal) {
            const batch = petaBatch.get(item.batchId);
            if (!batch || !batch.aktif) {
                await client.query('ROLLBACK'); transaksiAktif = false;
                return res.status(400).json({ status: 'gagal', pesan: 'Produk pada salah satu batch sudah tidak aktif.' });
            }

            let jumlahStok;
            try {
                jumlahStok = hitungJumlahStok(item.jumlahJual, batch);
            } catch (error) {
                await client.query('ROLLBACK'); transaksiAktif = false;
                return res.status(400).json({ status: 'gagal', pesan: error.message });
            }
            if (jumlahStok <= 0) {
                await client.query('ROLLBACK'); transaksiAktif = false;
                return res.status(400).json({ status: 'gagal', pesan: `Jumlah stok untuk ${batch.nama_produk} tidak valid.` });
            }

            const stokTersedia = await bacaSaldoBatch(client, item.batchId);
            if (jumlahStok > stokTersedia + 0.000001) {
                await client.query('ROLLBACK'); transaksiAktif = false;
                return res.status(400).json({
                    status: 'gagal',
                    pesan: `Stok ${batch.nama_produk} tidak cukup. Tersedia ${stokTersedia} ${batch.satuan_stok}, dibutuhkan ${jumlahStok} ${batch.satuan_stok}.`,
                });
            }
            detailSiap.push({ ...item, batch, jumlahStok, harga: Number(batch.harga_jual) });
        }

        const kode = formatKodePenjualan();
        const header = await client.query(`
            INSERT INTO penjualan (
                kode_penjualan, nama_pelanggan, whatsapp_pelanggan,
                sumber_penjualan, status_penjualan, status_pembayaran, catatan
            ) VALUES ($1, $2, $3, $4, 'dikonfirmasi', 'belum_bayar', $5)
            RETURNING id, kode_penjualan, tanggal_penjualan
        `, [kode, namaPelanggan || null, whatsapp || null, sumber, catatan || null]);
        const penjualan = header.rows[0];
        const total = await catatDetailPenjualan(client, penjualan.id, detailSiap.map((item) => ({
            batchId: item.batch.batch_persediaan_id,
            jumlahJual: item.jumlahJual,
            satuanJual: item.batch.satuan_jual,
            harga: item.harga,
            jumlahStok: item.jumlahStok,
            catatan: `Penjualan ${penjualan.kode_penjualan}`
        })));

        await client.query('COMMIT');
        transaksiAktif = false;
        res.status(201).json({
            status: 'berhasil',
            pesan: `Penjualan ${penjualan.kode_penjualan} berhasil dicatat dan stok diperbarui.`,
            data: { ...penjualan, total_penjualan: Number(total.toFixed(2)) },
        });
    } catch (error) {
        if (client && transaksiAktif) {
            try { await client.query('ROLLBACK'); } catch (_) {}
        }
        console.error('Gagal membuat penjualan:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Transaksi penjualan gagal disimpan.' });
    } finally {
        if (client) client.release();
    }
});

// Memperbarui status transaksi/pembayaran. Pembatalan mengembalikan stok satu kali.
router.put('/:id/status', async (req, res) => {
    const id = req.params.id;
    const statusPenjualan = req.body.status_penjualan;
    const statusPembayaran = req.body.status_pembayaran;
    const statusPenjualanValid = ['menunggu', 'dikonfirmasi', 'selesai', 'dibatalkan'];
    const statusPembayaranValid = ['belum_bayar', 'dibayar', 'dikembalikan']; // kompatibilitas data lama; bukan pilihan status baru

    if (!/^\d+$/.test(id) || Number(id) <= 0) {
        return res.status(400).json({ status: 'gagal', pesan: 'ID penjualan tidak valid.' });
    }
    if (statusPenjualan !== undefined && !statusPenjualanValid.includes(statusPenjualan)) {
        return res.status(400).json({ status: 'gagal', pesan: 'Status penjualan tidak valid.' });
    }
    if (statusPembayaran !== undefined && !statusPembayaranValid.includes(statusPembayaran)) {
        return res.status(400).json({ status: 'gagal', pesan: 'Status pembayaran tidak valid.' });
    }
    if (statusPenjualan === undefined && statusPembayaran === undefined) {
        return res.status(400).json({ status: 'gagal', pesan: 'Tidak ada status yang diperbarui.' });
    }

    let client;
    let transaksiAktif = false;
    try {
        client = await pool.connect();
        await client.query('BEGIN'); transaksiAktif = true;
        const hasil = await client.query(`SELECT * FROM penjualan WHERE id = $1 FOR UPDATE`, [id]);
        if (!hasil.rowCount) {
            await client.query('ROLLBACK'); transaksiAktif = false;
            return res.status(404).json({ status: 'gagal', pesan: 'Transaksi penjualan tidak ditemukan.' });
        }
        const lama = hasil.rows[0];
        const statusBaru = statusPenjualan ?? lama.status_penjualan;
        const pembayaranBaru = statusPembayaran ?? lama.status_pembayaran;

                // Transaksi hanya dapat selesai setelah pembayaran tercatat lunas.
        if (statusBaru === 'selesai' && pembayaranBaru !== 'dibayar') {
            await client.query('ROLLBACK'); transaksiAktif = false;
            return res.status(400).json({ status: 'gagal', pesan: 'Penjualan hanya dapat diselesaikan setelah pembayaran ditandai Dibayar.' });
        }
        if (lama.status_pembayaran === 'dibayar' && pembayaranBaru !== 'dibayar') {
            await client.query('ROLLBACK'); transaksiAktif = false;
            return res.status(400).json({ status: 'gagal', pesan: 'Pembayaran yang sudah tercatat Dibayar tidak dapat diubah menjadi Belum Dibayar.' });
        }
        if (lama.status_penjualan === 'dibatalkan' && statusBaru !== 'dibatalkan') {
            await client.query('ROLLBACK'); transaksiAktif = false;
            return res.status(400).json({ status: 'gagal', pesan: 'Transaksi yang sudah dibatalkan tidak dapat diaktifkan kembali. Buat transaksi baru jika diperlukan.' });
        }
        if (statusBaru === 'menunggu' && lama.status_penjualan !== 'menunggu') {
            await client.query('ROLLBACK'); transaksiAktif = false;
            return res.status(400).json({ status: 'gagal', pesan: 'Status transaksi tidak dapat dikembalikan ke Menunggu.' });
        }
        if (lama.status_penjualan === 'selesai' && statusBaru !== 'selesai') {
            await client.query('ROLLBACK'); transaksiAktif = false;
            return res.status(400).json({ status: 'gagal', pesan: 'Transaksi selesai tidak dapat diubah kembali melalui modul ini.' });
        }
        if (statusBaru === 'dibatalkan' && pembayaranBaru === 'dibayar') {
            await client.query('ROLLBACK'); transaksiAktif = false;
            return res.status(400).json({ status: 'gagal', pesan: 'Transaksi yang sudah dibayar tidak dapat dibatalkan dari modul sederhana ini. Selesaikan penanganan pengembalian uang terlebih dahulu.' });
        }

        if (lama.status_penjualan !== 'dibatalkan' && statusBaru === 'dibatalkan') {
            const detail = await client.query(`
                SELECT dp.id, dp.batch_persediaan_id, dp.jumlah_stok
                FROM detail_penjualan dp
                JOIN batch_persediaan bp ON bp.id = dp.batch_persediaan_id
                WHERE dp.penjualan_id = $1
                ORDER BY dp.batch_persediaan_id
                FOR UPDATE OF dp, bp
            `, [id]);
            for (const item of detail.rows) {
                await client.query(`
                    INSERT INTO pergerakan_stok (
                        batch_persediaan_id, jenis_pergerakan, jumlah, catatan
                    ) VALUES ($1, 'koreksi_masuk', $2, $3)
                `, [item.batch_persediaan_id, item.jumlah_stok,
                    `Pengembalian stok penjualan ${lama.kode_penjualan} (detail #${item.id})`]);
            }
        }

        await client.query(`
            UPDATE penjualan SET status_penjualan = $1, status_pembayaran = $2 WHERE id = $3
        `, [statusBaru, pembayaranBaru, id]);
        await client.query('COMMIT'); transaksiAktif = false;
        res.json({ status: 'berhasil', pesan: 'Status transaksi berhasil diperbarui. Jika dibatalkan, stok telah dikembalikan.' });
    } catch (error) {
        if (client && transaksiAktif) {
            try { await client.query('ROLLBACK'); } catch (_) {}
        }
        console.error('Gagal memperbarui status penjualan:', error.message);
        res.status(500).json({ status: 'gagal', pesan: 'Status penjualan gagal diperbarui.' });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
