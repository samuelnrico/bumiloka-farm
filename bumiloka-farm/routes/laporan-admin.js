const express = require('express');
const pool = require('../config/database');
const { wajibLogin } = require('../middleware/auth');
const router = express.Router();
router.use(wajibLogin);

function filterTanggal(req) {
  const valid = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const mulai = valid(req.query.mulai) ? req.query.mulai : new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const selesai = valid(req.query.selesai) ? req.query.selesai : new Date().toISOString().slice(0, 10);
  return { mulai, selesai };
}
function params(req) { const f = filterTanggal(req); return [f.mulai, f.selesai]; }
function gagal(res, error) {
  console.error('Laporan admin:', error.message);
  return res.status(500).json({ status: 'gagal', pesan: 'Laporan tidak dapat dimuat. Periksa koneksi dan struktur database.' });
}

// Produksi hanya membaca tabel baru yang dipakai modul Hasil Produksi Admin.
// Tabel lama hasil_panen, produksi_telur, dan pemrosesan_ayam sengaja tidak dibaca.
router.get('/produksi', async (req, res) => {
  try {
    const p = params(req);
    const q = await pool.query(`
      SELECT h.id,
        h.tanggal_produksi AS tanggal,
        CASE h.jenis_produksi
          WHEN 'sayuran' THEN 'Panen perkebunan'
          WHEN 'telur' THEN 'Produksi telur'
          WHEN 'daging_ayam' THEN 'Pemrosesan ayam'
          ELSE h.jenis_produksi
        END AS jenis,
        COALESCE(pr.nama_produk, 'Produk tidak tersedia') AS produk,
        h.jumlah_hasil AS jumlah,
        COALESCE(pr.satuan_stok, CASE WHEN h.jenis_produksi='telur' THEN 'butir' ELSE 'kg' END) AS satuan,
        h.jumlah_layak,
        h.jumlah_tidak_layak,
        h.status_verifikasi AS status,
        h.jumlah_ayam_diproses,
        h.catatan,
        h.alasan_tidak_layak
      FROM hasil_produksi_admin h
      LEFT JOIN produk pr ON pr.id = h.produk_id
      WHERE h.tanggal_produksi BETWEEN $1 AND $2
      ORDER BY h.tanggal_produksi DESC, h.id DESC`, p);
    res.json({ status: 'berhasil', data: q.rows });
  } catch (e) { return gagal(res, e); }
});

// Persediaan diringkas per nama produk, bukan per kode batch dari sistem lama.
router.get('/stok', async (req, res) => {
  try {
    const p = params(req);
    const q = await pool.query(`SELECT pr.nama_produk, pr.satuan_stok,
      COALESCE(SUM(CASE WHEN ps.jenis_pergerakan IN ('masuk','koreksi_masuk') THEN ps.jumlah WHEN ps.jenis_pergerakan IN ('keluar','koreksi_keluar') THEN -ps.jumlah ELSE 0 END),0) AS stok_akhir,
      COALESCE(SUM(CASE WHEN ps.jenis_pergerakan IN ('masuk','koreksi_masuk') AND ps.tanggal_pergerakan::date BETWEEN $1 AND $2 THEN ps.jumlah ELSE 0 END),0) AS stok_masuk_periode,
      COALESCE(SUM(CASE WHEN ps.jenis_pergerakan IN ('keluar','koreksi_keluar') AND ps.tanggal_pergerakan::date BETWEEN $1 AND $2 THEN ps.jumlah ELSE 0 END),0) AS stok_keluar_periode
      FROM produk pr LEFT JOIN batch_persediaan b ON b.produk_id=pr.id LEFT JOIN pergerakan_stok ps ON ps.batch_persediaan_id=b.id
      GROUP BY pr.id,pr.nama_produk,pr.satuan_stok ORDER BY pr.nama_produk`, p);
    res.json({ status: 'berhasil', data: q.rows });
  } catch (e) { return gagal(res, e); }
});

router.get('/penjualan', async (req, res) => {
  try {
    const p = params(req);
    const q = await pool.query(`SELECT pj.kode_penjualan, pj.tanggal_penjualan, COALESCE(pj.nama_pelanggan,'Pelanggan tidak dicatat') AS nama_pelanggan,
      pj.sumber_penjualan, pj.status_penjualan, pj.status_pembayaran,
      COALESCE(SUM(dp.jumlah_jual*dp.harga_satuan),0) AS total_transaksi,
      CASE WHEN pj.status_penjualan='selesai' AND pj.status_pembayaran='dibayar' THEN COALESCE(SUM(dp.jumlah_jual*dp.harga_satuan),0) ELSE 0 END AS pendapatan_terealisasi
      FROM penjualan pj LEFT JOIN detail_penjualan dp ON dp.penjualan_id=pj.id
      WHERE pj.tanggal_penjualan::date BETWEEN $1 AND $2 GROUP BY pj.id ORDER BY pj.tanggal_penjualan DESC`, p);
    res.json({ status: 'berhasil', data: q.rows });
  } catch (e) { return gagal(res, e); }
});

// Biaya diambil dari pembelian_operasional; pemakaian dicantumkan sebagai aktivitas tanpa mengarang nilai rupiah.
router.get('/operasional', async (req, res) => {
  try {
    const p = params(req);
    const q = await pool.query(`
      SELECT p.tanggal_pembelian::date AS tanggal, 'Pembelian'::text AS jenis, b.nama_barang AS barang,
        p.jumlah, p.satuan, p.total_biaya AS nilai_rupiah, COALESCE(p.pemasok,'—') AS keterangan
      FROM pembelian_operasional p JOIN barang_operasional b ON b.id=p.barang_operasional_id
      WHERE p.tanggal_pembelian::date BETWEEN $1 AND $2
      UNION ALL
      SELECT m.tanggal_pemakaian::date, 'Pemakaian'::text, b.nama_barang, m.jumlah, m.satuan, NULL::numeric,
        COALESCE(m.keterangan,'—') AS keterangan
      FROM pemakaian_operasional m JOIN barang_operasional b ON b.id=m.barang_operasional_id
      WHERE m.tanggal_pemakaian::date BETWEEN $1 AND $2
      ORDER BY tanggal DESC`, p);
    res.json({ status: 'berhasil', data: q.rows });
  } catch (e) { return gagal(res, e); }
});

// Buku kas sederhana: hanya uang masuk dari penjualan lunas dan uang keluar dari pembelian operasional.
// Tidak memakai tabel biaya_produksi lama dan tidak menyamakan pemakaian stok dengan arus kas.
router.get('/keuangan', async (req, res) => {
  try {
    const p = params(req);
    const q = await pool.query(`
      SELECT tanggal, jenis, kategori, keterangan, referensi, uang_masuk, uang_keluar
      FROM (
        SELECT pj.tanggal_penjualan::date AS tanggal,
          'Uang masuk'::text AS jenis,
          'Penjualan'::text AS kategori,
          COALESCE(pj.nama_pelanggan, 'Pelanggan tidak dicatat')::text AS keterangan,
          pj.kode_penjualan::text AS referensi,
          COALESCE(SUM(dp.jumlah_jual * dp.harga_satuan), 0)::numeric AS uang_masuk,
          0::numeric AS uang_keluar
        FROM penjualan pj
        JOIN detail_penjualan dp ON dp.penjualan_id = pj.id
        WHERE pj.status_penjualan = 'selesai'
          AND pj.status_pembayaran = 'dibayar'
          AND pj.tanggal_penjualan::date BETWEEN $1 AND $2
        GROUP BY pj.id
        UNION ALL
        SELECT p.tanggal_pembelian::date,
          'Uang keluar'::text,
          'Pembelian operasional'::text,
          COALESCE(b.nama_barang, 'Barang tidak tersedia')::text,
          COALESCE(p.pemasok, 'Pemasok tidak dicatat')::text,
          0::numeric,
          COALESCE(p.total_biaya, 0)::numeric
        FROM pembelian_operasional p
        LEFT JOIN barang_operasional b ON b.id = p.barang_operasional_id
        WHERE p.tanggal_pembelian::date BETWEEN $1 AND $2
      ) buku_kas
      ORDER BY tanggal DESC, jenis ASC`, p);
    res.json({ status: 'berhasil', data: q.rows });
  } catch (e) { return gagal(res, e); }
});

module.exports = router;
