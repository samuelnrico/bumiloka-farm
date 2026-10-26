const form = document.getElementById('form-produk');
const daftar = document.getElementById('daftar-produk');
const statusDaftar = document.getElementById('status-daftar');
const pesan = document.getElementById('pesan');
const tombolSimpan = document.getElementById('tombol-simpan');
const tombolBatal = document.getElementById('tombol-batal');
const pencarian = document.getElementById('cari-produk');
const filterKategori = document.getElementById('filter-kategori');
const infoSatuan = document.getElementById('info-satuan');
const detailTambahan = form.querySelector('details');
const fotoPreview = document.getElementById('foto-preview');
const fotoPreviewImg = document.getElementById('foto-preview-img');
const fotoPreviewKeterangan = document.getElementById('foto-preview-keterangan');
let urlPratinjauLokal = null;

const field = {
    id: document.getElementById('produk-id'),
    nama: document.getElementById('nama_produk'),
    jenis: document.getElementById('jenis_produk'),
    stok: null,
    kategori: null,
    jual: document.getElementById('satuan_jual'),
    berat: document.getElementById('berat_paket_kg'),
    harga: document.getElementById('harga_jual'),
    foto: document.getElementById('foto_produk'),
    fotoLama: document.getElementById('foto_lama'),
    deskripsi: document.getElementById('deskripsi'),
    ditampilkan: document.getElementById('ditampilkan'),
};
let produkTersimpan = [];
let modeEdit = false;

function aturModeEdit(aktif) {
    modeEdit = Boolean(aktif);
    tombolBatal.hidden = !modeEdit;
    tombolBatal.style.display = modeEdit ? 'inline-flex' : 'none';
}

function formatRupiah(nilai) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 2 }).format(Number(nilai || 0));
}
function formatJumlah(nilai) {
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(Number(nilai || 0));
}
function propertiJenis(jenis) {
    if (jenis === 'sayuran') return { kategori: 'perkebunan', stok: 'kg', label: 'Stok dicatat dalam kg.' };
    if (jenis === 'telur') return { kategori: 'peternakan', stok: 'butir', label: 'Stok dicatat dalam butir.' };
    return { kategori: 'peternakan', stok: 'kg', label: 'Stok dicatat dalam kg.' };
}
function perbaruiFormJenis() {
    const aturan = propertiJenis(field.jenis.value);
    infoSatuan.textContent = `${aturan.label} Kategori dan satuan stok ditentukan otomatis berdasarkan jenis produk.`;
    const opsiPaket = field.jenis.value !== 'telur';
    [...field.jual.options].forEach((opsi) => {
        if (opsi.value === 'paket') opsi.disabled = !opsiPaket;
    });
    if (!opsiPaket && field.jual.value === 'paket') field.jual.value = 'butir';
    const perluBerat = field.jual.value === 'paket';
    document.getElementById('bagian-berat').hidden = !perluBerat;
    field.berat.required = perluBerat;
    if (!perluBerat) field.berat.value = '';
}
field.jenis.addEventListener('change', perbaruiFormJenis);
field.jual.addEventListener('change', perbaruiFormJenis);

async function requestAPI(url, opsi = {}) {
    const response = await fetch(url, {
        credentials: 'same-origin', ...opsi,
        headers: { ...(opsi.body && !(opsi.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(opsi.headers || {}) },
    });
    if (response.status === 401) { window.location.href = '/login'; throw new Error('Sesi login berakhir. Silakan login kembali.'); }
    const hasil = await response.json();
    if (!response.ok) throw new Error(hasil.pesan || 'Permintaan gagal.');
    return hasil;
}
function buatSel(teks) { const td = document.createElement('td'); td.textContent = teks; return td; }
function renderProduk() {
    daftar.replaceChildren();
    const kata = pencarian.value.trim().toLocaleLowerCase('id-ID');
    const kategoriDipilih = filterKategori.value;
    const data = produkTersimpan.filter((p) => p.nama_produk.toLocaleLowerCase('id-ID').includes(kata) && (kategoriDipilih === 'semua' || p.kategori === kategoriDipilih));
    statusDaftar.textContent = `${data.length} dari ${produkTersimpan.length} produk`;
    if (!data.length) {
        const tr = document.createElement('tr'); const td = buatSel(produkTersimpan.length ? 'Tidak ada produk yang cocok dengan pencarian.' : 'Belum ada produk. Tambahkan produk pertama.'); td.colSpan = 6; td.className = 'empty'; tr.append(td); daftar.append(tr); return;
    }
    data.forEach((produk) => {
        const tr = document.createElement('tr');
        const tdNama = document.createElement('td');
        const nama = document.createElement('div'); nama.className = 'product-name'; nama.textContent = produk.nama_produk;
        const sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = ({ sayuran: 'Hasil kebun', telur: 'Peternakan · Telur', daging_ayam: 'Peternakan · Daging ayam' })[produk.jenis_produk] || produk.jenis_produk;
        tdNama.append(nama, sub);
        tr.append(tdNama, buatSel(produk.kategori === 'perkebunan' ? 'Perkebunan' : 'Peternakan'));
        const tdStok = document.createElement('td'); tdStok.className = 'stock';
        tdStok.textContent = `${formatJumlah(produk.stok_tersedia)} ${produk.satuan_stok}`;
        tr.append(tdStok, buatSel(formatRupiah(produk.harga_jual) + (produk.satuan_jual === 'paket' ? ` / paket (${produk.berat_paket_kg} kg)` : ` / ${produk.satuan_jual}`)));
        const tdStatus = document.createElement('td'); const pill = document.createElement('span');
        pill.className = `pill${!produk.aktif ? ' off' : !produk.ditampilkan ? ' hidden' : ''}`;
        pill.textContent = !produk.aktif ? 'Nonaktif' : produk.ditampilkan ? 'Tampil di katalog' : 'Disembunyikan'; tdStatus.append(pill); tr.append(tdStatus);
        const tdAksi = document.createElement('td'); const aksi = document.createElement('div'); aksi.className = 'row-actions';
        const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit'; edit.className = 'secondary'; edit.disabled = !produk.aktif; edit.addEventListener('click', () => mulaiEdit(produk.id));
        const status = document.createElement('button'); status.type = 'button'; status.className = 'secondary'; status.textContent = produk.aktif ? 'Nonaktifkan' : 'Aktifkan'; status.addEventListener('click', () => ubahStatus(produk));
        aksi.append(edit, status); tdAksi.append(aksi); tr.append(tdAksi); daftar.append(tr);
    });
}
async function muatProduk() {
    statusDaftar.textContent = 'Memuat data produk...';
    try { const hasil = await requestAPI('/api/produk'); produkTersimpan = hasil.data || []; renderProduk(); }
    catch (error) { statusDaftar.textContent = error.message; }
}
function mulaiEdit(id) {
    if (urlPratinjauLokal) URL.revokeObjectURL(urlPratinjauLokal); urlPratinjauLokal = null;
    const p = produkTersimpan.find((item) => String(item.id) === String(id)); if (!p) return;
    field.id.value = p.id; field.nama.value = p.nama_produk; field.jenis.value = p.jenis_produk;
    field.jual.value = p.satuan_jual; field.berat.value = p.berat_paket_kg ?? ''; field.harga.value = p.harga_jual;
    field.foto.value = ''; field.fotoLama.value = p.url_foto ?? ''; field.deskripsi.value = p.deskripsi ?? ''; field.ditampilkan.checked = p.ditampilkan;
    tampilkanPratinjauFoto(p.url_foto ?? '', p.url_foto ? 'Foto saat ini. Pilih file baru jika ingin menggantinya.' : 'Belum ada foto produk.');
    perbaruiFormJenis();
    document.getElementById('judul-form').textContent = `Edit produk: ${p.nama_produk}`;
    tombolSimpan.textContent = 'Simpan perubahan'; aturModeEdit(true); pesan.textContent = '';
    detailTambahan.open = Boolean(p.url_foto || p.deskripsi);
    document.getElementById('panel-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function resetForm() {
    form.reset(); field.id.value = ''; field.fotoLama.value = ''; field.jenis.value = 'sayuran'; field.jual.value = 'kg'; field.ditampilkan.checked = true;
    field.foto.value = ''; if (urlPratinjauLokal) URL.revokeObjectURL(urlPratinjauLokal); urlPratinjauLokal = null; tampilkanPratinjauFoto('', 'Belum ada foto yang dipilih.');
    document.getElementById('judul-form').textContent = 'Tambah produk'; tombolSimpan.textContent = 'Simpan produk'; aturModeEdit(false);
    detailTambahan.open = false; pesan.textContent = ''; perbaruiFormJenis();
}
tombolBatal.addEventListener('click', () => { if (modeEdit) resetForm(); });
// Pastikan tombol Batal Edit tidak muncul akibat aturan CSS dari halaman lain.
aturModeEdit(false);
pencarian.addEventListener('input', renderProduk);
filterKategori.addEventListener('change', renderProduk);
function tampilkanPratinjauFoto(url, keterangan) {
    if (!url) { fotoPreview.hidden = true; fotoPreviewImg.removeAttribute('src'); fotoPreviewKeterangan.textContent = keterangan || ''; return; }
    fotoPreview.hidden = false; fotoPreviewImg.src = url; fotoPreviewKeterangan.textContent = keterangan || '';
}
field.foto.addEventListener('change', () => {
    const file = field.foto.files?.[0];
    if (!file) { tampilkanPratinjauFoto(field.fotoLama.value, field.fotoLama.value ? 'Foto saat ini.' : 'Belum ada foto yang dipilih.'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
        field.foto.value = ''; pesan.textContent = 'Format gambar harus JPG, PNG, WEBP, atau GIF.'; return;
    }
    if (file.size > 3 * 1024 * 1024) {
        field.foto.value = ''; pesan.textContent = 'Ukuran gambar maksimal 3 MB.'; return;
    }
    if (urlPratinjauLokal) URL.revokeObjectURL(urlPratinjauLokal);
    urlPratinjauLokal = URL.createObjectURL(file);
    tampilkanPratinjauFoto(urlPratinjauLokal, `${file.name} · ${(file.size / 1024).toFixed(0)} KB`);
});
form.addEventListener('submit', async (event) => {
    event.preventDefault(); tombolSimpan.disabled = true; pesan.textContent = 'Menyimpan produk...';
    const aturan = propertiJenis(field.jenis.value);
    const data = new FormData();
    data.append('nama_produk', field.nama.value);
    data.append('kategori', aturan.kategori);
    data.append('jenis_produk', field.jenis.value);
    data.append('satuan_stok', aturan.stok);
    data.append('satuan_jual', field.jual.value);
    data.append('berat_paket_kg', field.berat.value || '');
    data.append('harga_jual', field.harga.value);
    data.append('url_foto', field.fotoLama.value || '');
    data.append('deskripsi', field.deskripsi.value);
    data.append('ditampilkan', String(field.ditampilkan.checked));
    if (field.foto.files?.[0]) data.append('foto', field.foto.files[0]);
    try {
        const id = field.id.value;
        const hasil = await requestAPI(id ? `/api/produk/${id}` : '/api/produk', { method: id ? 'PUT' : 'POST', body: data });
        pesan.textContent = hasil.pesan; resetForm(); await muatProduk();
    } catch (error) { pesan.textContent = error.message; }
    finally { tombolSimpan.disabled = false; }
});
async function ubahStatus(produk) {
    const aksi = produk.aktif ? 'menonaktifkan' : 'mengaktifkan';
    if (!window.confirm(`Yakin ingin ${aksi} produk "${produk.nama_produk}"?`)) return;
    try { const hasil = await requestAPI(`/api/produk/${produk.id}/status`, { method: 'PATCH', body: JSON.stringify({ aktif: !produk.aktif }) }); pesan.textContent = hasil.pesan; await muatProduk(); }
    catch (error) { pesan.textContent = error.message; }
}
perbaruiFormJenis();
muatProduk();
