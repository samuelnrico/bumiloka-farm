const express = require('express');
const crypto = require('crypto');
const pool = require('../config/database');
const { wajibLogin } = require('../middleware/auth');
const { bulat3, hitungJumlahStok, hitungFaktorStok, bacaSaldoBatch, catatDetailPenjualan } = require('../services/stok-penjualan');

const router = express.Router();

function angkaValid(raw) {
    if (raw === '' || raw === null || raw === undefined) return false;
    return /^\d+(?:\.\d{1,3})?$/.test(String(raw)) && Number.isFinite(Number(raw));
}

function buatKodePermintaan() {
    const sekarang = new Date();
    const tanggal = `${sekarang.getFullYear()}${String(sekarang.getMonth() + 1).padStart(2, '0')}${String(sekarang.getDate()).padStart(2, '0')}`;
    return `REQ-${tanggal}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function balasPermintaan(res, row, statusCode = 201) {
    return res.status(statusCode).json({
        status: 'berhasil',
        pesan: 'Permintaan pesanan berhasil dicatat. Pesanan belum diterima pemilik dan stok belum dikurangi.',
        data: {
            id: row.id,
            kode_permintaan: row.kode_permintaan,
            status_permintaan: row.status_permintaan,
            total_perkiraan: row.total_perkiraan,
            item_pesanan: row.item_pesanan,
            tanggal_permintaan: row.tanggal_permintaan
        }
    });
}

// Endpoint ringkas untuk lonceng dashboard. Hanya mengembalikan hitungan dan beberapa permintaan terbaru.
router.get('/admin/notifikasi', wajibLogin, async (req, res) => {
    try {
        const [jumlah, terbaru] = await Promise.all([
            pool.query(`
                SELECT COUNT(*)::int AS jumlah
                FROM permintaan_pesanan_publik
                WHERE status_permintaan = 'menunggu_konfirmasi'
            `),
            pool.query(`
                SELECT id, kode_permintaan, nama_pelanggan, total_perkiraan, tanggal_permintaan
                FROM permintaan_pesanan_publik
                WHERE status_permintaan = 'menunggu_konfirmasi'
                ORDER BY tanggal_permintaan DESC
                LIMIT 5
            `)
        ]);
        return res.json({
            status: 'berhasil',
            data: {
                jumlah: Number(jumlah.rows[0].jumlah) || 0,
                terbaru: terbaru.rows
            }
        });
    } catch (error) {
        console.error('Gagal memuat notifikasi permintaan pesanan:', error.message);
        return res.status(500).json({ status: 'gagal', pesan: 'Notifikasi permintaan gagal dimuat.' });
    }
});

// Endpoint khusus pemilik: daftar permintaan. Aksi menerima/menolak dibuat pada Tahap 10D.
router.get('/admin', wajibLogin, async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : 'semua';
    const cari = typeof req.query.cari === 'string' ? req.query.cari.trim().slice(0, 120) : '';
    const statusValid = ['semua', 'menunggu_konfirmasi', 'dikonfirmasi', 'ditolak'];

    if (!statusValid.includes(status)) {
        return res.status(400).json({ status: 'gagal', pesan: 'Filter status tidak valid.' });
    }

    try {
        const hasil = await pool.query(`
            SELECT
                id, kode_permintaan, tanggal_permintaan,
                nama_pelanggan, whatsapp_pelanggan, catatan_pelanggan,
                item_pesanan, total_perkiraan, status_permintaan,
                alasan_penolakan, penjualan_id, diproses_pada,
                dibuat_pada, diperbarui_pada
            FROM permintaan_pesanan_publik
            WHERE ($1 = 'semua' OR status_permintaan = $1)
              AND (
                    $2 = ''
                    OR kode_permintaan ILIKE '%' || $2 || '%'
                    OR nama_pelanggan ILIKE '%' || $2 || '%'
                    OR whatsapp_pelanggan ILIKE '%' || $2 || '%'
                  )
            ORDER BY
                CASE WHEN status_permintaan = 'menunggu_konfirmasi' THEN 0 ELSE 1 END,
                tanggal_permintaan DESC
            LIMIT 200
        `, [status, cari]);

        const ringkasan = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE status_permintaan = 'menunggu_konfirmasi')::int AS menunggu,
                COUNT(*) FILTER (WHERE status_permintaan = 'dikonfirmasi')::int AS dikonfirmasi,
                COUNT(*) FILTER (WHERE status_permintaan = 'ditolak')::int AS ditolak,
                COUNT(*)::int AS total
            FROM permintaan_pesanan_publik
        `);

        return res.json({
            status: 'berhasil',
            data: hasil.rows,
            ringkasan: ringkasan.rows[0],
            batas: 200
        });
    } catch (error) {
        console.error('Gagal memuat daftar permintaan pesanan:', error.message);
        return res.status(500).json({ status: 'gagal', pesan: 'Daftar permintaan pesanan gagal dimuat.' });
    }
});

// Endpoint publik. Pembuatan permintaan tidak membuat penjualan resmi dan tidak mengurangi stok.
router.post('/', async (req, res) => {
    const nama = typeof req.body.nama_pelanggan === 'string' ? req.body.nama_pelanggan.trim() : '';
    const whatsappRaw = typeof req.body.whatsapp_pelanggan === 'string' ? req.body.whatsapp_pelanggan.trim() : '';
    const whatsapp = whatsappRaw.replace(/[\s().-]/g, '');
    const catatan = typeof req.body.catatan === 'string' ? req.body.catatan.trim() : '';
    const kunci = typeof req.body.kunci_idempotensi === 'string' ? req.body.kunci_idempotensi.trim() : '';
    const items = req.body.items;

    if (nama.length < 2 || nama.length > 120) {
        return res.status(400).json({ status: 'gagal', pesan: 'Nama pelanggan harus berisi 2 sampai 120 karakter.' });
    }
    if (!/^\+?\d{8,20}$/.test(whatsapp)) {
        return res.status(400).json({ status: 'gagal', pesan: 'Nomor WhatsApp pelanggan tidak valid.' });
    }
    if (catatan.length > 2000) {
        return res.status(400).json({ status: 'gagal', pesan: 'Catatan pesanan maksimal 2.000 karakter.' });
    }
    if (!/^[A-Za-z0-9-]{16,100}$/.test(kunci)) {
        return res.status(400).json({ status: 'gagal', pesan: 'Token checkout tidak valid. Muat ulang halaman checkout.' });
    }
    if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
        return res.status(400).json({ status: 'gagal', pesan: 'Pesanan harus memiliki 1 sampai 50 jenis produk.' });
    }

    try {
        // Permintaan dengan token yang sama selalu mengembalikan catatan awal, bukan membuat duplikat.
        const sebelumnya = await pool.query(`
            SELECT id, kode_permintaan, status_permintaan, total_perkiraan, item_pesanan, tanggal_permintaan
            FROM permintaan_pesanan_publik
            WHERE kunci_idempotensi = $1
            LIMIT 1
        `, [kunci]);
        if (sebelumnya.rowCount) return balasPermintaan(res, sebelumnya.rows[0], 200);

        const jumlahPerProduk = new Map();
        for (const item of items) {
            const id = String(item.produk_id ?? '');
            if (!/^\d+$/.test(id) || Number(id) <= 0) {
                return res.status(400).json({ status: 'gagal', pesan: 'Salah satu produk tidak valid.' });
            }
            if (!angkaValid(item.jumlah) || Number(item.jumlah) <= 0) {
                return res.status(400).json({ status: 'gagal', pesan: 'Jumlah setiap produk harus lebih dari nol dengan maksimal 3 angka desimal.' });
            }
            if (jumlahPerProduk.has(id)) {
                return res.status(400).json({ status: 'gagal', pesan: 'Produk yang sama tidak boleh muncul dua kali dalam pesanan.' });
            }
            jumlahPerProduk.set(id, Number(item.jumlah));
        }

        const ids = [...jumlahPerProduk.keys()];
        const hasilProduk = await pool.query(`
            WITH stok AS (
                SELECT bp.produk_id, SUM(CASE WHEN ps.jenis_pergerakan IN ('masuk', 'koreksi_masuk') THEN ps.jumlah WHEN ps.jenis_pergerakan IN ('keluar', 'koreksi_keluar') THEN -ps.jumlah ELSE 0 END) AS stok_tersedia FROM batch_persediaan bp LEFT JOIN pergerakan_stok ps ON ps.batch_persediaan_id = bp.id GROUP BY bp.produk_id
            )
            SELECT p.id, p.nama_produk, p.satuan_jual, p.satuan_stok,
                   p.harga_jual, p.berat_paket_kg,
                   COALESCE(s.stok_tersedia, 0) AS stok_tersedia
            FROM produk p
            LEFT JOIN stok s ON s.produk_id = p.id
            WHERE p.id = ANY($1::bigint[])
              AND p.aktif = TRUE
              AND p.ditampilkan = TRUE
        `, [ids]);

        const produkMap = new Map(hasilProduk.rows.map(p => [String(p.id), p]));
        if (produkMap.size !== ids.length) {
            return res.status(409).json({ status: 'gagal', pesan: 'Ada produk yang sudah tidak tersedia. Muat ulang katalog dan periksa keranjang.' });
        }

        const snapshot = [];
        let total = 0;
        for (const [id, jumlah] of jumlahPerProduk) {
            const produk = produkMap.get(id);
            const stok = Number(produk.stok_tersedia) || 0;
            let jumlahStok;
            try {
                jumlahStok = hitungJumlahStok(jumlah, produk);
            } catch (error) {
                return res.status(409).json({ status: 'gagal', pesan: error.message });
            }
            if (stok <= 0 || jumlahStok > stok + 0.000001) {
                return res.status(409).json({ status: 'gagal', pesan: `Stok ${produk.nama_produk} tidak mencukupi. Muat ulang katalog dan sesuaikan jumlah.` });
            }
            const harga = Number(produk.harga_jual) || 0;
            const subtotal = Math.round((harga * jumlah + Number.EPSILON) * 100) / 100;
            total += subtotal;
            snapshot.push({
                produk_id: Number(produk.id),
                nama_produk: produk.nama_produk,
                jumlah,
                satuan: produk.satuan_jual,
                harga_satuan: harga,
                subtotal
            });
        }
        total = Math.round((total + Number.EPSILON) * 100) / 100;

        const kode = buatKodePermintaan();
        const simpan = await pool.query(`
            INSERT INTO permintaan_pesanan_publik (
                kode_permintaan, kunci_idempotensi, nama_pelanggan,
                whatsapp_pelanggan, catatan_pelanggan, item_pesanan,
                total_perkiraan, status_permintaan
            ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'menunggu_konfirmasi')
            RETURNING id, kode_permintaan, status_permintaan, total_perkiraan, item_pesanan, tanggal_permintaan
        `, [kode, kunci, nama, whatsapp, catatan || null, JSON.stringify(snapshot), total]);

        return balasPermintaan(res, simpan.rows[0], 201);
    } catch (error) {
        // Jika dua request dengan token sama tiba bersamaan, unique constraint tetap mencegah duplikat.
        if (error.code === '23505') {
            try {
                const duplikat = await pool.query(`
                    SELECT id, kode_permintaan, status_permintaan, total_perkiraan, item_pesanan, tanggal_permintaan
                    FROM permintaan_pesanan_publik WHERE kunci_idempotensi = $1 LIMIT 1
                `, [kunci]);
                if (duplikat.rowCount) return balasPermintaan(res, duplikat.rows[0], 200);
            } catch (lookupError) {
                console.error('Gagal mengambil permintaan checkout yang sudah ada:', lookupError.message);
            }
        }
        console.error('Gagal menyimpan permintaan pesanan publik:', error.message);
        return res.status(500).json({ status: 'gagal', pesan: 'Permintaan belum dapat disimpan. Silakan coba kembali.' });
    }
});


function buatKodePenjualan() {
    const sekarang = new Date();
    const tanggal = `${sekarang.getFullYear()}${String(sekarang.getMonth() + 1).padStart(2, '0')}${String(sekarang.getDate()).padStart(2, '0')}`;
    return `JUAL-${tanggal}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

// Keputusan pemilik: menerima permintaan menjadi transaksi resmi atau menolaknya.
// Penerimaan dan pengurangan stok berlangsung dalam satu transaksi PostgreSQL.
router.put('/admin/:id/keputusan', wajibLogin, async (req, res) => {
    const id = String(req.params.id || '');
    const keputusan = req.body.keputusan;
    const alasan = typeof req.body.alasan_penolakan === 'string' ? req.body.alasan_penolakan.trim() : '';

    if (!/^\d+$/.test(id) || Number(id) <= 0) {
        return res.status(400).json({ status: 'gagal', pesan: 'ID permintaan tidak valid.' });
    }
    if (!['terima', 'tolak'].includes(keputusan)) {
        return res.status(400).json({ status: 'gagal', pesan: 'Keputusan harus berupa terima atau tolak.' });
    }
    if (alasan.length > 1000) {
        return res.status(400).json({ status: 'gagal', pesan: 'Alasan penolakan maksimal 1.000 karakter.' });
    }

    let client;
    let transaksiAktif = false;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        transaksiAktif = true;

        const permintaanHasil = await client.query(`
            SELECT * FROM permintaan_pesanan_publik
            WHERE id = $1
            FOR UPDATE
        `, [id]);
        if (!permintaanHasil.rowCount) {
            await client.query('ROLLBACK'); transaksiAktif = false;
            return res.status(404).json({ status: 'gagal', pesan: 'Permintaan pesanan tidak ditemukan.' });
        }
        const permintaan = permintaanHasil.rows[0];
        if (permintaan.status_permintaan !== 'menunggu_konfirmasi') {
            await client.query('ROLLBACK'); transaksiAktif = false;
            return res.status(409).json({
                status: 'gagal',
                pesan: `Permintaan ini sudah diproses dengan status ${permintaan.status_permintaan}. Keputusan tidak dapat diulang.`,
                data: { status_permintaan: permintaan.status_permintaan, penjualan_id: permintaan.penjualan_id }
            });
        }

        if (keputusan === 'tolak') {
            const ditolak = await client.query(`
                UPDATE permintaan_pesanan_publik
                SET status_permintaan = 'ditolak', alasan_penolakan = $2,
                    diproses_pada = NOW(), diperbarui_pada = NOW()
                WHERE id = $1
                RETURNING id, kode_permintaan, status_permintaan, penjualan_id
            `, [id, alasan || null]);
            await client.query('COMMIT'); transaksiAktif = false;
            return res.json({ status: 'berhasil', pesan: 'Permintaan ditolak. Tidak ada penjualan atau perubahan stok yang dibuat.', data: ditolak.rows[0] });
        }

        const items = permintaan.item_pesanan;
        if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
            throw new Error('Snapshot item permintaan tidak valid. Permintaan tidak dapat diterima.');
        }
        const jumlahPerProduk = new Map();
        for (const item of items) {
            const produkId = String(item.produk_id ?? '');
            const jumlah = Number(item.jumlah);
            const harga = Number(item.harga_satuan);
            if (!/^\d+$/.test(produkId) || Number(produkId) <= 0 || !Number.isFinite(jumlah) || jumlah <= 0 || !Number.isFinite(harga) || harga < 0) {
                throw new Error('Data barang atau harga pada permintaan tidak valid.');
            }
            if (jumlahPerProduk.has(produkId)) throw new Error('Snapshot memuat produk ganda. Permintaan tidak dapat diproses.');
            jumlahPerProduk.set(produkId, { ...item, produk_id: Number(produkId), jumlah, harga_satuan: harga });
        }

        const produkIds = [...jumlahPerProduk.keys()].map(Number).sort((a, b) => a - b);
        // Kunci semua batch produk terkait secara konsisten agar transaksi penjualan bersamaan
        // tidak memakai stok batch yang sama tanpa saling menunggu.
        const batchHasil = await client.query(`
            SELECT bp.id AS batch_persediaan_id, bp.kode_batch, bp.produk_id,
                   pr.nama_produk, pr.satuan_stok, pr.satuan_jual,
                   pr.berat_paket_kg, pr.aktif
            FROM batch_persediaan bp
            JOIN produk pr ON pr.id = bp.produk_id
            WHERE bp.produk_id = ANY($1::bigint[])
            ORDER BY bp.id
            FOR UPDATE OF bp
        `, [produkIds]);

        const batchPerProduk = new Map();
        for (const batch of batchHasil.rows) {
            if (!batchPerProduk.has(String(batch.produk_id))) batchPerProduk.set(String(batch.produk_id), []);
            batchPerProduk.get(String(batch.produk_id)).push(batch);
        }

        const detailSiap = [];
        for (const [produkId, item] of jumlahPerProduk) {
            const batches = batchPerProduk.get(produkId) || [];
            if (!batches.length || batches.some(batch => !batch.aktif)) {
                throw new Error(`Produk ${item.nama_produk || produkId} sudah tidak tersedia atau tidak aktif.`);
            }
            const contoh = batches[0];
            const faktor = hitungFaktorStok(contoh);
            let sisaJual = bulat3(item.jumlah);
            for (const batch of batches) {
                if (sisaJual <= 0.000001) break;
                const stokTersedia = Math.max(0, await bacaSaldoBatch(client, batch.batch_persediaan_id));
                const jumlahJual = bulat3(Math.min(sisaJual, stokTersedia / faktor));
                if (jumlahJual <= 0) continue;
                const jumlahStok = bulat3(jumlahJual * faktor);
                detailSiap.push({
                    batch,
                    jumlahJual,
                    jumlahStok,
                    satuanJual: batch.satuan_jual,
                    harga: item.harga_satuan,
                    namaProduk: item.nama_produk || batch.nama_produk
                });
                sisaJual = bulat3(sisaJual - jumlahJual);
            }
            if (sisaJual > 0.000001) {
                throw new Error(`Stok ${contoh.nama_produk} tidak mencukupi. Kekurangan ${sisaJual} ${contoh.satuan_jual}. Permintaan belum diterima dan stok tidak diubah.`);
            }
        }

        if (!detailSiap.length) throw new Error('Tidak ada detail barang yang dapat diproses.');

        const kodePenjualan = buatKodePenjualan();
        const header = await client.query(`
            INSERT INTO penjualan (
                kode_penjualan, nama_pelanggan, whatsapp_pelanggan,
                sumber_penjualan, status_penjualan, status_pembayaran, catatan
            ) VALUES ($1, $2, $3, 'whatsapp', 'dikonfirmasi', 'belum_bayar', $4)
            RETURNING id, kode_penjualan, tanggal_penjualan
        `, [kodePenjualan, permintaan.nama_pelanggan, permintaan.whatsapp_pelanggan,
            permintaan.catatan_pelanggan || `Dari permintaan ${permintaan.kode_permintaan}`]);
        const penjualan = header.rows[0];
        const totalPenjualan = await catatDetailPenjualan(client, penjualan.id, detailSiap.map((item) => ({
            batchId: item.batch.batch_persediaan_id,
            jumlahJual: item.jumlahJual,
            satuanJual: item.satuanJual,
            harga: item.harga,
            jumlahStok: item.jumlahStok,
            catatan: `Penjualan ${penjualan.kode_penjualan} dari permintaan ${permintaan.kode_permintaan}`
        })));

        const diperbarui = await client.query(`
            UPDATE permintaan_pesanan_publik
            SET status_permintaan = 'dikonfirmasi', penjualan_id = $2,
                diproses_pada = NOW(), diperbarui_pada = NOW(), alasan_penolakan = NULL
            WHERE id = $1 AND status_permintaan = 'menunggu_konfirmasi'
            RETURNING id, kode_permintaan, status_permintaan, penjualan_id
        `, [id, penjualan.id]);
        if (!diperbarui.rowCount) throw new Error('Status permintaan berubah saat diproses. Transaksi dibatalkan.');

        await client.query('COMMIT'); transaksiAktif = false;
        return res.json({
            status: 'berhasil',
            pesan: `Permintaan diterima. Penjualan ${penjualan.kode_penjualan} dibuat dan stok diperbarui. Status pembayaran tetap belum dibayar.`,
            data: { ...diperbarui.rows[0], kode_penjualan: penjualan.kode_penjualan, total_penjualan: Number(totalPenjualan.toFixed(2)) }
        });
    } catch (error) {
        if (client && transaksiAktif) {
            try { await client.query('ROLLBACK'); } catch (_) {}
        }
        const pesan = error.message || 'Keputusan permintaan gagal diproses.';
        console.error('Gagal memproses keputusan permintaan pesanan:', pesan);
        const konflik = /stok .* tidak mencukupi|sudah tidak tersedia|tidak aktif|tidak valid|satuan|produk ganda/i.test(pesan);
        return res.status(konflik ? 409 : 500).json({ status: 'gagal', pesan });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
