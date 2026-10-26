# BumiLoka Farm

Aplikasi web untuk membantu usaha perkebunan dan peternakan skala kecil hingga menengah dalam mencatat produksi, mengelola persediaan, memantau penjualan, serta menampilkan katalog produk kepada pelanggan.

## Tentang Proyek

BumiLoka Farm menggabungkan pengelolaan internal usaha dengan katalog publik. Pemilik usaha dapat masuk ke sistem untuk mengelola data dan aktivitas operasional, sedangkan pengunjung dapat melihat produk tanpa harus memiliki akun.

**Tujuan proyek**
- Membantu pencatatan hasil produksi dan persediaan.
- Mempermudah pencatatan transaksi penjualan.
- Menyediakan informasi produk dan harga untuk pelanggan.
- Memusatkan pengelolaan data usaha dalam satu aplikasi web.

## Fitur

Fitur yang tersedia pada kode proyek meliputi:
- Autentikasi pemilik atau admin.
- Pengelolaan produk.
- Manajemen persediaan dan pergerakan stok.
- Pencatatan penjualan dan riwayat transaksi.
- Pengelolaan hasil produksi.
- Dashboard dan laporan administrasi.
- Pengaturan informasi usaha.
- Katalog produk publik.
- Keranjang belanja dan alur permintaan pesanan publik.

Ketersediaan dan kelengkapan setiap fitur mengikuti implementasi pada versi kode yang diunggah.

## Teknologi

- **Backend:** Node.js dan Express
- **Database:** PostgreSQL
- **Frontend:** HTML, CSS, dan JavaScript
- **Autentikasi:** Express Session
- **Keamanan password:** bcrypt

## Persyaratan

Sebelum menjalankan aplikasi, siapkan:
- Node.js dan npm.
- PostgreSQL.
- Git, jika ingin mengunduh kode melalui Git.

## Instalasi

1. Unduh atau clone repositori:

   ```bash
   git clone https://github.com/USERNAME/bumiloka-farm.git
   ```

2. Masuk ke folder proyek:

   ```bash
   cd bumiloka-farm
   ```

3. Pasang dependensi:

   ```bash
   npm install
   ```

4. Buat database PostgreSQL bernama `bumiloka_farm`.

5. Siapkan struktur tabel dan data awal menggunakan file cadangan SQL yang disediakan, setelah memastikan file tersebut sesuai dengan versi aplikasi. Ikuti petunjuk pemulihan database pada bagian Database.

6. Buat file `.env` di folder utama berdasarkan `.env.example`, kemudian isi konfigurasi lokal.

7. Jalankan aplikasi:

   ```bash
   npm run dev
   ```

   Alternatif untuk menjalankan aplikasi tanpa nodemon:

   ```bash
   npm start
   ```

8. Buka alamat lokal sesuai port yang dikonfigurasi, misalnya `http://localhost:3000`, jika `PORT` diatur ke `3000`.

## Panduan Pengguna

Petunjuk penggunaan aplikasi tersedia pada file [`PANDUAN_PENGGUNA.md`](PANDUAN_PENGGUNA.md).

Dokumentasi screenshot dapat ditemukan pada folder [`docs/screenshots/`](docs/screenshots/).

## Konfigurasi Environment

Contoh isi `.env`:

```dotenv
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bumiloka_farm
DB_USER=postgres
DB_PASSWORD=isi_password_database_lokal
SESSION_SECRET=ganti_dengan_secret_acak_yang_panjang
```

## Membuat Akun Admin Pertama

1. Pastikan PostgreSQL berjalan dan database `bumiloka_farm` telah dibuat.
2. Pastikan seluruh tabel dan constraint telah disiapkan dari skema database proyek.
3. Buat akun admin pertama menggunakan mekanisme inisialisasi admin yang disediakan aplikasi.
4. Gunakan password yang kuat dan simpan kredensial secara aman.
5. Buka `/login`, lalu masuk menggunakan akun yang telah dibuat.
6. Setelah berhasil masuk, periksa dashboard dan pastikan data usaha dapat dikelola.

## Penggunaan Aplikasi

### Pemilik atau Admin

1. Jalankan aplikasi dan buka halaman login melalui `/login`.
2. Masuk menggunakan akun yang sudah dibuat dan disiapkan pada database.
3. Buka dashboard untuk mengakses modul administrasi yang tersedia.
4. Kelola data produk, hasil produksi, persediaan, penjualan, dan laporan sesuai kebutuhan usaha.
5. Periksa perubahan stok setelah pencatatan produksi, koreksi persediaan, atau transaksi penjualan.

Akun awal tidak dicantumkan di dokumentasi ini. Gunakan mekanisme pembuatan akun atau data pengguna yang sesuai dengan konfigurasi proyek.

### Pengunjung atau Pelanggan

1. Buka halaman utama aplikasi.
2. Jelajahi katalog produk dan informasi harga yang ditampilkan.
3. Periksa detail produk dan ketersediaan.
4. Gunakan keranjang atau alur permintaan pesanan yang disediakan aplikasi.

Tampilan katalog mengikuti data produk dan stok yang tersimpan pada database.

## Rute Halaman Utama

| Alamat | Kegunaan |
|---|---|
| `/` | Halaman beranda publik |
| `/katalog` | Katalog produk |
| `/produk/:id` | Detail produk |
| `/keranjang` | Keranjang belanja |
| `/checkout` | Halaman checkout |
| `/login` | Login admin |

Halaman administrasi dan endpoint API tertentu memerlukan autentikasi.

## Database

Aplikasi menggunakan PostgreSQL. Konfigurasi koneksi dibaca dari environment variables melalui `config/database.js`.

Jika repositori menyertakan file cadangan SQL, periksa terlebih dahulu isi dan versi skemanya sebelum mengimpor. Gunakan database lokal atau database pengujian agar data yang sudah ada tidak tertimpa.

Contoh pembuatan database:

```sql
CREATE DATABASE bumiloka_farm;
```

Setelah database dibuat, pulihkan skema dan data menggunakan metode yang sesuai dengan format file SQL yang tersedia. Pastikan tabel, constraint, indeks, dan data awal cocok dengan versi aplikasi.

## Dokumentasi Modul

- `MODUL_PENJUALAN.md`: dokumentasi fitur dan endpoint modul penjualan.
- `MODUL_PERSEDIAAN.md`: dokumentasi fitur dan endpoint manajemen persediaan.

## Keamanan

- Jangan publikasikan `.env`, password, token, atau secret sesi.
- Jangan menggunakan password akun database produksi pada contoh dokumentasi.
- Gunakan akun database dengan hak akses yang sesuai.
- Uji perubahan pada database pengembangan sebelum diterapkan ke data usaha.
- Jangan menganggap aplikasi siap produksi hanya karena berhasil berjalan di komputer lokal.

## Status Pengembangan

BumiLoka Farm dikembangkan sebagai aplikasi web pengelolaan usaha perkebunan dan peternakan. Pengujian, penyempurnaan fitur, dan kesiapan deployment perlu dinilai berdasarkan versi kode yang digunakan.

## Lisensi

Lisensi proyek belum ditentukan. Hubungi pemilik repositori sebelum menggunakan kembali atau mendistribusikan kode untuk tujuan lain.
