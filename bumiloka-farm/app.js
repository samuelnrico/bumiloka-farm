
require('dotenv').config();

const produkRoutes = require('./routes/produk');
const persediaanRoutes = require('./routes/persediaan');
const penjualanRoutes = require('./routes/penjualan');
const keuanganRoutes = require('./routes/keuangan');
const dashboardRoutes = require('./routes/dashboard');
const laporanAdminRoutes = require('./routes/laporan-admin');
const pengaturanUsahaRoutes = require('./routes/pengaturan-usaha');
const barangOperasionalRoutes = require('./routes/barang-operasional');
const hasilProduksiRoutes = require('./routes/hasil-produksi');
const katalogPublikRoutes = require('./routes/katalog-publik');
const permintaanPesananPublikRoutes = require('./routes/permintaan-pesanan-publik');

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');                              // ← TAMBAH
const pgSession = require('connect-pg-simple')(session); 
const path = require('path');
const pool = require('./config/database');
const authRoutes = require('./routes/auth');
const { wajibLogin } = require('./middleware/auth');

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb', parameterLimit: 1000 }));

app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'sesi_express',
        createTableIfMissing: true,
    }),
    name: 'bumiloka.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',   // ← otomatis true di production
        maxAge: 1000 * 60 * 60 * 4,
    },
}));

// Header keamanan (CSP dinonaktifkan sementara agar script/style lama tidak terputus)
app.use(helmet({ contentSecurityPolicy: false }));

app.use(express.static(path.join(__dirname, 'public')));

// Halaman publik utama, tidak memerlukan login.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'beranda.html'));
});

 // Halaman katalog publik
app.get('/katalog', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'katalog.html'));
});

// Halaman detail produk publik
app.get('/produk/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'detail-produk.html'));
});

// Halaman keranjang publik
app.get('/keranjang', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'keranjang.html'));
});

app.get('/checkout', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'checkout.html'));
});

// Halaman login
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});


// Route login dan logout
app.use('/api/auth', authRoutes);
app.use('/api/produk', produkRoutes);
app.use('/api/persediaan', persediaanRoutes);
app.use('/api/penjualan', penjualanRoutes);
app.use('/api/keuangan', keuanganRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/laporan-admin', laporanAdminRoutes);
app.use('/api/pengaturan-usaha', pengaturanUsahaRoutes);
app.use('/api/barang-operasional', barangOperasionalRoutes);
app.use('/api/hasil-produksi', hasilProduksiRoutes);
app.use('/api/katalog', katalogPublikRoutes);
app.use('/api/permintaan-pesanan', permintaanPesananPublikRoutes);

// Tes koneksi database
app.get('/api/status-db', wajibLogin, async (req, res) => {
    try {
        const hasil = await pool.query(
            'SELECT current_database() AS nama_database'
        );

        res.json({
            status: 'berhasil',
            database: hasil.rows[0].nama_database,
        });
    } catch (error) {
        console.error('Kesalahan database:', error.message);
        res.status(500).json({
            status: 'gagal',
            pesan: 'Koneksi database bermasalah.',
        });
    }
});

// Halaman dashboard yang dilindungi
app.get('/dashboard', wajibLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.get('/produk', wajibLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'produk.html'));
});

app.get('/persediaan', wajibLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'persediaan.html'));
});

app.get('/penjualan', wajibLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'penjualan.html'));
});

app.get('/keuangan', wajibLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'keuangan.html'));
});

app.get('/laporan-admin', wajibLogin, (req, res) => {
    res.sendFile(
        path.join(__dirname, 'views', 'laporan-admin.html')
    );
});

app.get('/pengaturan-usaha', wajibLogin, (req, res) => {
    res.sendFile(
        path.join(__dirname, 'views', 'pengaturan-usaha.html')
    );
});

app.get('/barang-masuk', wajibLogin, (req, res) => {
    res.sendFile(
        path.join(__dirname, 'views', 'barang-masuk.html')
    );
});

app.get('/hasil-produksi', wajibLogin, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'hasil-produksi.html'));
});




// Contoh endpoint profil pemilik yang dilindungi
app.get('/api/pemilik/profil', wajibLogin, (req, res) => {
    res.json({
        status: 'berhasil',
        nama_pengguna: req.session.namaPengguna,
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server BumiLoka Farm berjalan di http://localhost:${PORT}`);
});
