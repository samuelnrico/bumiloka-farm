// Logika bersama untuk saldo stok dan pencatatan detail penjualan.
const STOK_BATCH_SQL = `
    SELECT bp.id AS batch_persediaan_id,
           COALESCE(SUM(CASE
               WHEN ps.jenis_pergerakan IN ('masuk', 'koreksi_masuk') THEN ps.jumlah
               WHEN ps.jenis_pergerakan IN ('keluar', 'koreksi_keluar') THEN -ps.jumlah
               ELSE 0
           END), 0) AS stok_tersedia
    FROM batch_persediaan bp
    LEFT JOIN pergerakan_stok ps ON ps.batch_persediaan_id = bp.id
    GROUP BY bp.id
`;
// Fungsi yang menulis data wajib menerima client dari transaksi aktif.
function bulat3(nilai) {
    return Math.round((Number(nilai) + Number.EPSILON) * 1000) / 1000;
}

function hitungJumlahStok(jumlahJual, produk) {
    if (produk.satuan_jual === produk.satuan_stok) return bulat3(jumlahJual);
    if (produk.satuan_jual === 'paket' && produk.satuan_stok === 'kg' && Number(produk.berat_paket_kg) > 0) {
        return bulat3(jumlahJual * Number(produk.berat_paket_kg));
    }
    throw new Error(`Konfigurasi satuan produk ${produk.nama_produk} belum mendukung penjualan (${produk.satuan_jual} dari stok ${produk.satuan_stok}).`);
}

function hitungFaktorStok(produk) {
    if (produk.satuan_jual === produk.satuan_stok) return 1;
    if (produk.satuan_jual === 'paket' && produk.satuan_stok === 'kg' && Number(produk.berat_paket_kg) > 0) {
        return Number(produk.berat_paket_kg);
    }
    throw new Error(`Konfigurasi satuan produk ${produk.nama_produk} belum mendukung penjualan.`);
}

async function bacaSaldoBatch(client, batchId) {
    const hasil = await client.query(`
        SELECT COALESCE(SUM(
            CASE
                WHEN jenis_pergerakan IN ('masuk', 'koreksi_masuk') THEN jumlah
                WHEN jenis_pergerakan IN ('keluar', 'koreksi_keluar') THEN -jumlah
                ELSE 0
            END
        ), 0) AS stok_tersedia
        FROM pergerakan_stok
        WHERE batch_persediaan_id = $1
    `, [batchId]);
    return Number(hasil.rows[0]?.stok_tersedia) || 0;
}

// Menulis detail penjualan dan pergerakan keluar dalam transaksi pemanggil.
// item: { batchId, jumlahJual, satuanJual, harga, jumlahStok, catatan }
async function catatDetailPenjualan(client, penjualanId, items) {
    let total = 0;
    for (const item of items) {
        const detail = await client.query(`
            INSERT INTO detail_penjualan (
                penjualan_id, batch_persediaan_id, jumlah_jual,
                satuan_jual, harga_satuan, jumlah_stok
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `, [penjualanId, item.batchId, item.jumlahJual, item.satuanJual, item.harga, item.jumlahStok]);

        await client.query(`
            INSERT INTO pergerakan_stok (
                batch_persediaan_id, jenis_pergerakan, jumlah,
                catatan, detail_penjualan_id
            ) VALUES ($1, 'keluar', $2, $3, $4)
        `, [item.batchId, item.jumlahStok, item.catatan, detail.rows[0].id]);
        total += Number(item.jumlahJual) * Number(item.harga);
    }
    return total;
}

module.exports = { STOK_BATCH_SQL, bulat3, hitungJumlahStok, hitungFaktorStok, bacaSaldoBatch, catatDetailPenjualan };
