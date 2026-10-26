# Modul Penjualan BumiLoka Farm

## Fitur
- Membuat transaksi dengan beberapa item dari batch persediaan.
- Harga diambil dari `produk.harga_jual` saat transaksi dicatat.
- Menyimpan header transaksi di `penjualan` dan baris item di `detail_penjualan`.
- Mengurangi stok melalui `pergerakan_stok` jenis `keluar` yang terhubung ke detail penjualan.
- Memeriksa stok di backend dalam transaksi PostgreSQL dan mengunci batch saat membuat penjualan.
- Melihat riwayat, detail transaksi, total, dan status penjualan/pembayaran.
- Membatalkan transaksi yang belum selesai dengan mengembalikan stok melalui `koreksi_masuk`.
- Menolak pembatalan transaksi selesai; retur memerlukan alur terpisah.
- Mengonversi jumlah jual `paket` ke stok `kg` berdasarkan `produk.berat_paket_kg` jika konfigurasi produk mendukungnya.

## Endpoint
- `GET /api/penjualan/opsi-batch`
- `GET /api/penjualan/riwayat`
- `GET /api/penjualan/:id`
- `POST /api/penjualan`
- `PUT /api/penjualan/:id/status`

Semua endpoint dilindungi middleware `wajibLogin`.

## Menjalankan
1. Pertahankan `.env` lokal dan konfigurasi PostgreSQL yang sudah ada.
2. Tidak ada tabel baru atau migrasi SQL yang diperlukan; modul memakai tabel `penjualan`, `detail_penjualan`, `batch_persediaan`, `produk`, dan `pergerakan_stok` yang sudah tersedia.
3. Jalankan `npm run dev`, login, kemudian buka `/penjualan`.

## Checklist pengujian di database lokal
- Buat transaksi satu item; pastikan satu header, satu detail, dan satu pergerakan `keluar` dibuat.
- Buat transaksi multi-item; pastikan semua detail dan pergerakan tersimpan bersama atau semuanya rollback jika salah satu gagal.
- Coba menjual lebih dari stok; transaksi harus ditolak dan tidak meninggalkan data parsial.
- Pastikan harga dan total mengikuti harga produk pada saat transaksi dibuat.
- Batalkan transaksi yang belum selesai; stok harus kembali satu kali dan status menjadi `dibatalkan`.
- Coba membatalkan ulang atau membatalkan transaksi `selesai`; operasi harus ditolak.
- Untuk transaksi yang sudah dibayar/sebagian, pembatalan wajib sekaligus menandai pembayaran `dikembalikan`.
- Uji penjualan `paket` dari stok `kg` pada produk yang memiliki `berat_paket_kg`.
