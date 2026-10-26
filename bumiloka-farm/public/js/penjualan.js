const el = {
    pesanGlobal: document.getElementById('pesan-global'),
    statTransaksi: document.getElementById('stat-transaksi'),
    statNilai: document.getElementById('stat-nilai'),
    statBelumBayar: document.getElementById('stat-belum-bayar'),
    form: document.getElementById('form-penjualan'),
    nama: document.getElementById('nama-pelanggan'),
    whatsapp: document.getElementById('whatsapp-pelanggan'),
    sumber: document.getElementById('sumber-penjualan'),
    catatan: document.getElementById('catatan-penjualan'),
    pilihBatch: document.getElementById('pilih-batch'),
    infoBatch: document.getElementById('info-batch'),
    jumlahJual: document.getElementById('jumlah-jual'),
    tambahItem: document.getElementById('tombol-tambah-item'),
    daftarItem: document.getElementById('daftar-item'),
    total: document.getElementById('total-penjualan'),
    pesanForm: document.getElementById('pesan-form'),
    tombolSimpan: document.getElementById('tombol-simpan'),
    cari: document.getElementById('cari-transaksi'),
    cariRiwayat: document.getElementById('cari-riwayat'),
    statusBerjalan: document.getElementById('status-berjalan'),
    daftarBerjalan: document.getElementById('daftar-berjalan'),
    statusRiwayat: document.getElementById('status-riwayat'),
    daftarRiwayat: document.getElementById('daftar-riwayat'),
    muatUlang: document.getElementById('tombol-muat-ulang'),
    panelDetail: document.getElementById('panel-detail'),
    judulDetail: document.getElementById('judul-detail'),
    infoDetail: document.getElementById('info-detail'),
    daftarDetail: document.getElementById('daftar-detail'),
    totalDetail: document.getElementById('total-detail'),
    tutupDetail: document.getElementById('tutup-detail'),
};

let batchTersedia = [];
let keranjang = [];
let riwayat = [];
let ringkasanServer = null;

function rupiah(nilai) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(nilai || 0));
}
function angka(nilai) {
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(Number(nilai || 0));
}
function tanggal(nilai) {
    if (!nilai) return '-';
    const d = new Date(nilai);
    return Number.isNaN(d.getTime()) ? '-' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}
function labelStatus(value) {
    return ({
        menunggu: 'Menunggu',
        dikonfirmasi: 'Dikonfirmasi',
        selesai: 'Selesai',
        dibatalkan: 'Dibatalkan',
        belum_bayar: 'Belum Bayar',
        dibayar: 'Dibayar',
    })[value] || value || '-';
}
function buatSel(teks) {
    const td = document.createElement('td');
    td.textContent = teks ?? '-';
    return td;
}
function pesan(teks, error = false) {
    el.pesanGlobal.textContent = teks;
    el.pesanGlobal.classList.toggle('error', error);
    el.pesanGlobal.hidden = !teks;
}
async function api(url, opsi = {}) {
    const response = await fetch(url, {
        credentials: 'same-origin', ...opsi,
        headers: { ...(opsi.body ? { 'Content-Type': 'application/json' } : {}), ...(opsi.headers || {}) },
    });
    if (response.status === 401) {
        window.location.href = '/login';
        throw new Error('Sesi login berakhir. Silakan login kembali.');
    }
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(data.pesan || 'Permintaan gagal.');
    return data;
}
function jumlahJualDariStok(stok, produk) {
    if (produk.satuan_jual === produk.satuan_stok) return Number(stok);
    if (produk.satuan_jual === 'paket' && produk.satuan_stok === 'kg' && Number(produk.berat_paket_kg) > 0) return Number(stok) / Number(produk.berat_paket_kg);
    return 0;
}
function jumlahStokDariJual(jumlah, produk) {
    if (produk.satuan_jual === produk.satuan_stok) return Number(jumlah);
    if (produk.satuan_jual === 'paket' && produk.satuan_stok === 'kg' && Number(produk.berat_paket_kg) > 0) return Number(jumlah) * Number(produk.berat_paket_kg);
    return NaN;
}
function kelompokProduk() {
    const map = new Map();
    batchTersedia.forEach((batch) => {
        const key = String(batch.produk_id);
        if (!map.has(key)) map.set(key, { ...batch, batches: [], stok_total: 0 });
        const produk = map.get(key);
        produk.batches.push(batch);
        produk.stok_total += Number(batch.stok_tersedia || 0);
    });
    return [...map.values()].map((p) => ({ ...p, stok_jual_total: p.batches.reduce((sum, b) => sum + jumlahJualDariStok(b.stok_tersedia, p), 0) }))
        .sort((a, b) => a.nama_produk.localeCompare(b.nama_produk, 'id-ID'));
}
function hitungTotal() {
    return keranjang.reduce((sum, item) => sum + item.jumlah * Number(item.harga_jual), 0);
}
function renderKeranjang() {
    el.daftarItem.replaceChildren();
    if (!keranjang.length) {
        const tr = document.createElement('tr');
        const td = buatSel('Belum ada produk.'); td.colSpan = 5; tr.append(td); el.daftarItem.append(tr);
    } else {
        keranjang.forEach((item, index) => {
            const tr = document.createElement('tr');
            const nama = document.createElement('td');
            const utama = document.createElement('span'); utama.className = 'item-nama'; utama.textContent = item.nama_produk;
            const sub = document.createElement('span'); sub.className = 'item-sub'; sub.textContent = `${item.batches.length} batch stok · Total tersedia ${angka(item.stok_jual_total)} ${item.satuan_jual}`;
            nama.append(utama, sub);
            tr.append(nama, buatSel(`${angka(item.jumlah)} ${item.satuan_jual}`), buatSel(rupiah(item.harga_jual)), buatSel(rupiah(item.jumlah * Number(item.harga_jual))));
            const aksi = document.createElement('td');
            const hapus = document.createElement('button'); hapus.type = 'button'; hapus.className = 'tombol bahaya'; hapus.textContent = 'Hapus';
            hapus.addEventListener('click', () => { keranjang.splice(index, 1); renderKeranjang(); renderPilihanBatch(); });
            aksi.append(hapus); tr.append(aksi); el.daftarItem.append(tr);
        });
    }
    el.total.textContent = rupiah(hitungTotal());
}
function renderPilihanBatch() {
    const nilaiLama = el.pilihBatch.value;
    const produkList = kelompokProduk();
    el.pilihBatch.replaceChildren();
    const awal = document.createElement('option'); awal.value = '';
    awal.textContent = produkList.length ? 'Pilih produk...' : 'Tidak ada stok tersedia';
    el.pilihBatch.append(awal);
    produkList.forEach((produk) => {
        const option = document.createElement('option');
        option.value = produk.produk_id;
        option.textContent = `${produk.nama_produk} · stok ${angka(produk.stok_jual_total)} ${produk.satuan_jual}`;
        el.pilihBatch.append(option);
    });
    if ([...el.pilihBatch.options].some(option => option.value === nilaiLama)) el.pilihBatch.value = nilaiLama;
    updateInfoBatch();
}
function produkTerpilih() {
    return kelompokProduk().find((item) => String(item.produk_id) === el.pilihBatch.value);
}
function updateInfoBatch() {
    const produk = produkTerpilih();
    el.infoBatch.textContent = produk
        ? `Total stok: ${angka(produk.stok_jual_total)} ${produk.satuan_jual} · Harga: ${rupiah(produk.harga_jual)} per ${produk.satuan_jual} · Tersedia dari ${produk.batches.length} batch`
        : 'Pilih produk untuk melihat total stok dan harga.';
    if (produk) el.jumlahJual.max = produk.stok_jual_total;
    else el.jumlahJual.removeAttribute('max');
}
function tambahProdukKeKeranjang(tampilkanPesan = true) {
    const produk = produkTerpilih();
    const jumlahRaw = el.jumlahJual.value;
    const jumlah = Number(jumlahRaw);
    el.pesanForm.textContent = ''; el.pesanForm.classList.remove('error');
    if (!produk) { if (tampilkanPesan) { el.pesanForm.textContent = 'Pilih produk terlebih dahulu.'; el.pesanForm.classList.add('error'); } return false; }
    if (!Number.isFinite(jumlah) || jumlah <= 0 || !/^\d+(\.\d{1,3})?$/.test(jumlahRaw)) {
        if (tampilkanPesan) { el.pesanForm.textContent = 'Jumlah jual harus lebih dari nol dan maksimal 3 angka desimal.'; el.pesanForm.classList.add('error'); } return false;
    }
    const lama = keranjang.find((item) => String(item.produk_id) === String(produk.produk_id));
    const jumlahBaru = Math.round((jumlah + Number(lama?.jumlah || 0) + Number.EPSILON) * 1000) / 1000;
    if (jumlahBaru > Number(produk.stok_jual_total) + 0.000001) {
        if (tampilkanPesan) { el.pesanForm.textContent = `Stok ${produk.nama_produk} tidak cukup. Total tersedia ${angka(produk.stok_jual_total)} ${produk.satuan_jual}.`; el.pesanForm.classList.add('error'); } return false;
    }
    if (lama) lama.jumlah = jumlahBaru;
    else keranjang.push({ ...produk, jumlah: jumlahBaru });
    renderKeranjang();
    el.pilihBatch.value = ''; el.jumlahJual.value = ''; updateInfoBatch();
    return true;
}
function alokasikanKeBatch(item) {
    let sisa = Number(item.jumlah);
    const hasil = [];
    // Urutkan batch terlama lebih dahulu; catatan stok tetap disimpan per batch oleh backend.
    for (const batch of [...item.batches].sort((a, b) => String(a.tanggal_dibuat).localeCompare(String(b.tanggal_dibuat)) || Number(a.batch_persediaan_id) - Number(b.batch_persediaan_id))) {
        if (sisa <= 0.0000001) break;
        const kapasitas = jumlahJualDariStok(batch.stok_tersedia, item);
        if (kapasitas <= 0) continue;
        const jumlahAmbil = Math.min(sisa, kapasitas);
        hasil.push({ batch_persediaan_id: batch.batch_persediaan_id, jumlah_jual: Math.round((jumlahAmbil + Number.EPSILON) * 1000) / 1000 });
        sisa = Math.round((sisa - jumlahAmbil + Number.EPSILON) * 1000) / 1000;
    }
    if (sisa > 0.0001) throw new Error(`Stok ${item.nama_produk} berubah atau tidak cukup. Muat ulang data lalu coba lagi.`);
    return hasil;
}
function cocokPencarian(item, cari) {
    return `${item.kode_penjualan} ${item.nama_pelanggan || ''} ${item.whatsapp_pelanggan || ''}`
        .toLocaleLowerCase('id-ID').includes(cari);
}
function buatBarisTransaksi(item, mode) {
    const tr = document.createElement('tr');
    tr.append(buatSel(tanggal(item.tanggal_penjualan)), buatSel(item.kode_penjualan), buatSel(item.nama_pelanggan || '-'), buatSel(angka(item.jumlah_item)), buatSel(rupiah(item.total_penjualan)));
    tr.append(buatSel(labelStatus(item.status_penjualan)), buatSel(labelStatus(item.status_pembayaran)));
    const tdAksi = document.createElement('td'); const aksi = document.createElement('div'); aksi.className = 'aksi-riwayat';
    const detail = document.createElement('button'); detail.type = 'button'; detail.className = 'tombol sekunder'; detail.textContent = 'Detail'; detail.addEventListener('click', () => muatDetail(item.id));
    aksi.append(detail);
    if (mode === 'berjalan') {
        const tdStatus = tr.children[5]; tdStatus.replaceChildren();
        const pilihStatus = document.createElement('select'); pilihStatus.className = 'status-select';
        const statusPilihan = item.status_penjualan === 'menunggu' ? ['menunggu', 'dikonfirmasi', 'dibatalkan'] : ['dikonfirmasi', 'selesai', 'dibatalkan'];
        statusPilihan.forEach((s) => { const o = document.createElement('option'); o.value = s; o.textContent = labelStatus(s); pilihStatus.append(o); });
        pilihStatus.value = item.status_penjualan; tdStatus.append(pilihStatus);
        const tdBayar = tr.children[6]; tdBayar.replaceChildren();
        const pilihBayar = document.createElement('select'); pilihBayar.className = 'status-select';
        ['belum_bayar', 'dibayar'].forEach((s) => { const o = document.createElement('option'); o.value = s; o.textContent = labelStatus(s); pilihBayar.append(o); });
        pilihBayar.value = item.status_pembayaran;
        pilihBayar.disabled = item.status_pembayaran === 'dikembalikan'; tdBayar.append(pilihBayar);
        const simpan = document.createElement('button'); simpan.type = 'button'; simpan.className = 'tombol utama'; simpan.textContent = 'Simpan Status';
        simpan.addEventListener('click', async () => {
            if (pilihStatus.value === 'dibatalkan' && item.status_pembayaran === 'dibayar') { pesan('Transaksi yang sudah dibayar tidak dapat dibatalkan melalui modul ini.', true); return; }
            if (pilihStatus.value === 'dibatalkan' && !window.confirm(`Batalkan ${item.kode_penjualan}? Stok semua item akan dikembalikan.`)) return;
            simpan.disabled = true;
            try {
                const hasilApi = await api(`/api/penjualan/${item.id}/status`, { method: 'PUT', body: JSON.stringify({ status_penjualan: pilihStatus.value, status_pembayaran: pilihBayar.value }) });
                pesan(hasilApi.pesan); await Promise.all([muatRiwayat(), muatBatch()]);
            } catch (error) { pesan(error.message, true); simpan.disabled = false; }
        });
        aksi.append(simpan);
    }
    tdAksi.append(aksi); tr.append(tdAksi); return tr;
}
function isiTabel(tbody, data, mode) {
    tbody.replaceChildren();
    if (!data.length) {
        const tr = document.createElement('tr'); const td = buatSel(mode === 'berjalan' ? 'Tidak ada transaksi yang sedang berjalan.' : 'Belum ada riwayat transaksi.'); td.colSpan = 8; tr.append(td); tbody.append(tr); return;
    }
    data.forEach(item => tbody.append(buatBarisTransaksi(item, mode)));
}
function renderRiwayat() {
    const cariBerjalan = el.cari.value.trim().toLocaleLowerCase('id-ID');
    const cariRiwayat = el.cariRiwayat.value.trim().toLocaleLowerCase('id-ID');
    // Selesai dan sudah dibayar masuk riwayat. Transaksi dibatalkan juga disimpan di riwayat.
    // Yang belum selesai atau belum dibayar tetap berada di daftar berjalan.
    const berjalan = riwayat.filter(item => item.status_penjualan !== 'dibatalkan' && !(item.status_penjualan === 'selesai' && item.status_pembayaran === 'dibayar'));
    const selesai = riwayat.filter(item => item.status_penjualan === 'dibatalkan' || (item.status_penjualan === 'selesai' && item.status_pembayaran === 'dibayar'));
    const hasilBerjalan = berjalan.filter(item => cocokPencarian(item, cariBerjalan));
    const hasilRiwayat = selesai.filter(item => cocokPencarian(item, cariRiwayat));
    el.statusBerjalan.textContent = `${hasilBerjalan.length} transaksi berjalan ditampilkan dari ${berjalan.length} transaksi.`;
    el.statusRiwayat.textContent = `${hasilRiwayat.length} riwayat ditampilkan dari ${selesai.length} transaksi selesai atau dibatalkan.`;
    isiTabel(el.daftarBerjalan, hasilBerjalan, 'berjalan');
    isiTabel(el.daftarRiwayat, hasilRiwayat, 'riwayat');
    el.statTransaksi.textContent = angka(ringkasanServer?.jumlah_transaksi ?? riwayat.length);
    el.statNilai.textContent = rupiah(ringkasanServer?.nilai_transaksi_aktif ?? riwayat.filter(item => item.status_penjualan !== 'dibatalkan').reduce((sum, item) => sum + Number(item.total_penjualan), 0));
    el.statBelumBayar.textContent = angka(ringkasanServer?.menunggu_pembayaran ?? berjalan.filter(item => item.status_pembayaran === 'belum_bayar').length);
}
async function muatBatch() {
    const hasil = await api('/api/penjualan/opsi-batch'); batchTersedia = hasil.data || []; renderPilihanBatch();
}
async function muatRiwayat() {
    const hasil = await api('/api/penjualan/riwayat'); riwayat = hasil.data || []; ringkasanServer = hasil.ringkasan || null; renderRiwayat();
}
async function muatDetail(id) {
    try {
        const hasil = await api(`/api/penjualan/${id}`); const data = hasil.data;
        el.judulDetail.textContent = `Detail ${data.kode_penjualan}`;
        el.infoDetail.textContent = `${tanggal(data.tanggal_penjualan)} · ${data.nama_pelanggan || 'Pelanggan tidak dicantumkan'} · ${labelStatus(data.status_penjualan)} · ${labelStatus(data.status_pembayaran)}`;
        el.daftarDetail.replaceChildren();
        data.detail.forEach((item) => {
            const tr = document.createElement('tr');
            tr.append(buatSel(item.nama_produk), buatSel(item.kode_batch), buatSel(`${angka(item.jumlah_jual)} ${item.satuan_jual}`), buatSel(rupiah(item.harga_satuan)), buatSel(rupiah(item.subtotal)), buatSel(`${angka(item.jumlah_stok)} ${item.satuan_stok}`));
            el.daftarDetail.append(tr);
        });
        el.totalDetail.textContent = rupiah(data.total_penjualan); el.panelDetail.hidden = false; el.panelDetail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { pesan(error.message, true); }
}

el.pilihBatch.addEventListener('change', updateInfoBatch);
el.tambahItem.addEventListener('click', () => {
    if (tambahProdukKeKeranjang(true)) el.tambahItem.textContent = 'Tambah Produk';
});
el.form.addEventListener('submit', async (event) => {
    event.preventDefault(); el.pesanForm.textContent = ''; el.pesanForm.classList.remove('error');
    // Untuk transaksi satu produk, tombol Simpan juga memasukkan pilihan aktif sehingga tidak wajib menekan Tambah Produk.
    if (!keranjang.length && el.pilihBatch.value && el.jumlahJual.value) {
        if (!tambahProdukKeKeranjang(true)) return;
    }
    if (!keranjang.length) { el.pesanForm.textContent = 'Pilih produk dan jumlah jual, atau tambahkan produk ke daftar sebelum menyimpan.'; el.pesanForm.classList.add('error'); return; }
    el.tombolSimpan.disabled = true; el.tombolSimpan.textContent = 'Menyimpan...';
    try {
        const items = keranjang.flatMap(alokasikanKeBatch);
        const hasil = await api('/api/penjualan', { method: 'POST', body: JSON.stringify({
            nama_pelanggan: el.nama.value, whatsapp_pelanggan: el.whatsapp.value,
            sumber_penjualan: el.sumber.value, catatan: el.catatan.value, items,
        }) });
        pesan(hasil.pesan); el.form.reset(); keranjang = []; renderKeranjang(); renderPilihanBatch();
        await Promise.all([muatBatch(), muatRiwayat()]);
    } catch (error) { el.pesanForm.textContent = error.message; el.pesanForm.classList.add('error'); }
    finally { el.tombolSimpan.disabled = false; el.tombolSimpan.textContent = 'Simpan Penjualan'; }
});
el.cari.addEventListener('input', renderRiwayat);
el.cariRiwayat.addEventListener('input', renderRiwayat);
el.muatUlang.addEventListener('click', async () => { try { await Promise.all([muatBatch(), muatRiwayat()]); pesan('Data penjualan diperbarui.'); } catch (error) { pesan(error.message, true); } });
el.tutupDetail.addEventListener('click', () => { el.panelDetail.hidden = true; });

(async function mulai() {
    try { await Promise.all([muatBatch(), muatRiwayat()]); }
    catch (error) { pesan(error.message, true); el.statusRiwayat.textContent = 'Riwayat penjualan gagal dimuat.'; }
})();
