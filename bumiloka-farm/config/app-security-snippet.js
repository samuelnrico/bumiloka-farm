/*
  POTONGAN KONFIGURASI UNTUK app.js, BUKAN file pengganti app.js.
  Terapkan sesuai PETUNJUK_PERBAIKAN_11A.md.
*/

const helmet = require('helmet');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const pool = require('./config/database');

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET wajib diisi dan minimal 32 karakter.');
}

// Jika aplikasi berjalan di belakang reverse proxy HTTPS, set TRUST_PROXY=1.
// Jangan mengaktifkan trust proxy sembarangan jika server tidak berada di belakang proxy tepercaya.
if (process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
}

// Header keamanan. CSP dimatikan sementara agar script/style lama tidak rusak;
// kebijakan CSP khusus perlu diuji terpisah sebelum diaktifkan.
app.use(helmet({ contentSecurityPolicy: false }));

// Batasi ukuran body untuk mencegah payload besar yang tidak diperlukan.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb', parameterLimit: 1000 }));

// Session disimpan di PostgreSQL, bukan MemoryStore bawaan Express.
app.use(session({
    store: new pgSession({
        pool,
        tableName: 'sesi_express',
        createTableIfMissing: true,
        pruneSessionInterval: 15 * 60
    }),
    name: 'bumiloka.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 4
    }
}));
