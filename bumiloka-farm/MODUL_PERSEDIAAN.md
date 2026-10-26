# Modul Manajemen Persediaan - BumiLoka Farm

Modul ini menambahkan halaman `/persediaan` dan API privat `/api/persediaan`. Tidak ada tabel baru; stok dihitung dari `batch_persediaan` dan `pergerakan_stok`.

## Fitur
- Ringkasan jumlah produk, produk yang memiliki stok, produk habis, dan jumlah batch.
- Stok per produk dengan filter nama, kategori, dan status stok.
- Daftar batch dengan sumber produksi, total masuk, total keluar, dan stok tersedia.
- Riwayat maksimal 200 pergerakan terbaru, termasuk referensi penjualan bila ada.
- Koreksi masuk/keluar untuk penyesuaian stok fisik, wajib disertai catatan.
- Koreksi keluar ditolak jika jumlah melebihi stok batch.
- Seluruh halaman dan endpoint dilindungi middleware `wajibLogin`.

## API
- `GET /api/persediaan/ringkasan`
- `GET /api/persediaan/batch`
- `GET /api/persediaan/opsi-batch`
- `GET /api/persediaan/pergerakan`
- `POST /api/persediaan/koreksi`

Contoh body `POST /api/persediaan/koreksi`:

```json
{
  "batch_persediaan_id": "1",
  "jenis_pergerakan": "koreksi_keluar",
  "jumlah": "0.500",
  "catatan": "Penyesuaian setelah pemeriksaan stok fisik"
}
```

Jenis koreksi yang diterima hanya `koreksi_masuk` dan `koreksi_keluar`. Pencatatan produksi tetap dilakukan melalui modul produksi terkait, dan penjualan harus tetap dicatat melalui modul penjualan. Jangan memakai koreksi untuk menggantikan transaksi produksi atau penjualan.

## Pemeriksaan yang dilakukan
- Pemeriksaan sintaks Node.js dengan `node --check` untuk seluruh berkas JavaScript proyek berhasil.
- Semua 26 ID elemen yang dipakai `public/js/persediaan.js` tersedia di `views/persediaan.html`.
- Pengujian end-to-end belum dilakukan karena memerlukan server PostgreSQL yang berjalan dan data database lokal.
