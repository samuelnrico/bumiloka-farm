const formPengaturan = document.getElementById('form-pengaturan');
const statusPengaturan = document.getElementById('status');
const tombolSimpan = document.getElementById('simpan');
const inputNama = document.getElementById('nama_usaha');
const inputSlogan = document.getElementById('slogan');
const inputWhatsApp = document.getElementById('nomor_whatsapp');
const inputAlamat = document.getElementById('alamat');
const inputLogoFile = document.getElementById('file_logo');
const tombolUnggahLogo = document.getElementById('unggah-logo');
const logoPreview = document.getElementById('logo-preview');
const logoPlaceholder = document.getElementById('logo-placeholder');
const previewAlamat = document.getElementById('preview-alamat');
let dataAwal = {};
let urlLogoSaatIni = '';

function perbaruiPratinjau() {
    document.getElementById('preview-nama').textContent = inputNama.value.trim() || 'BumiLoka Farm';
    document.getElementById('preview-slogan').textContent = inputSlogan.value.trim() || 'Slogan usaha';
    if (previewAlamat) previewAlamat.textContent = inputAlamat.value.trim();
}
function tampilkanLogo(url) {
    urlLogoSaatIni = url || '';
    if (!urlLogoSaatIni) {
        logoPreview.removeAttribute('src'); logoPreview.hidden = true; logoPlaceholder.hidden = false; return;
    }
    logoPreview.src = urlLogoSaatIni;
    logoPreview.hidden = false;
    logoPlaceholder.hidden = true;
}
[inputNama, inputSlogan, inputAlamat].forEach(el => el.addEventListener('input', perbaruiPratinjau));
logoPreview.addEventListener('error', () => { logoPreview.hidden = true; logoPlaceholder.hidden = false; });
logoPreview.addEventListener('load', () => { logoPreview.hidden = false; logoPlaceholder.hidden = true; });

async function muatPengaturan() {
    try {
        const response = await fetch('/api/pengaturan-usaha');
        if (response.status === 401) { window.location.href = '/login'; return; }
        const hasil = await response.json();
        if (!response.ok || hasil.status !== 'berhasil') throw new Error(hasil.pesan || 'Pengaturan gagal dimuat.');
        const d = hasil.data || {};
        dataAwal = { nama_usaha: d.nama_usaha || 'BumiLoka Farm', slogan: d.slogan || '', nomor_whatsapp: d.nomor_whatsapp || '', alamat: d.alamat || '' };
        inputNama.value = dataAwal.nama_usaha;
        inputSlogan.value = dataAwal.slogan;
        inputWhatsApp.value = dataAwal.nomor_whatsapp;
        inputAlamat.value = dataAwal.alamat;
        tampilkanLogo(d.url_logo || '');
        perbaruiPratinjau();
        statusPengaturan.textContent = 'Pengaturan berhasil dimuat. Anda boleh mengubah satu bagian saja.';
    } catch (error) { statusPengaturan.textContent = error.message || 'Terjadi kesalahan saat memuat pengaturan.'; }
}

formPengaturan.addEventListener('submit', async event => {
    event.preventDefault();
    const nilai = { nama_usaha: inputNama.value.trim(), slogan: inputSlogan.value.trim(), nomor_whatsapp: inputWhatsApp.value.trim(), alamat: inputAlamat.value.trim() };
    const payload = {};
    Object.keys(nilai).forEach(k => { if (nilai[k] !== dataAwal[k]) payload[k] = nilai[k]; });
    if (!Object.keys(payload).length) { statusPengaturan.textContent = 'Tidak ada perubahan untuk disimpan.'; return; }
    tombolSimpan.disabled = true; statusPengaturan.textContent = 'Menyimpan perubahan...';
    try {
        const response = await fetch('/api/pengaturan-usaha', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (response.status === 401) { window.location.href = '/login'; return; }
        const hasil = await response.json();
        if (!response.ok || hasil.status !== 'berhasil') throw new Error(hasil.pesan || 'Perubahan gagal disimpan.');
        dataAwal = { nama_usaha: hasil.data.nama_usaha || '', slogan: hasil.data.slogan || '', nomor_whatsapp: hasil.data.nomor_whatsapp || '', alamat: hasil.data.alamat || '' };
        statusPengaturan.textContent = hasil.pesan || 'Perubahan berhasil disimpan.';
    } catch (error) { statusPengaturan.textContent = error.message || 'Terjadi kesalahan saat menyimpan.'; }
    finally { tombolSimpan.disabled = false; }
});

tombolUnggahLogo.addEventListener('click', async () => {
    const file = inputLogoFile.files[0];
    if (!file) { statusPengaturan.textContent = 'Pilih file logo dari perangkat terlebih dahulu.'; return; }
    if (file.size > 3 * 1024 * 1024) { statusPengaturan.textContent = 'Ukuran logo maksimal 3 MB.'; return; }
    const formData = new FormData(); formData.append('logo', file);
    tombolUnggahLogo.disabled = true; statusPengaturan.textContent = 'Mengunggah logo...';
    try {
        const response = await fetch('/api/pengaturan-usaha/logo', { method: 'POST', body: formData });
        if (response.status === 401) { window.location.href = '/login'; return; }
        const hasil = await response.json();
        if (!response.ok || hasil.status !== 'berhasil') throw new Error(hasil.pesan || 'Logo gagal diunggah.');
        tampilkanLogo(hasil.data.url_logo || ''); inputLogoFile.value = '';
        statusPengaturan.textContent = hasil.pesan || 'Logo berhasil diunggah.';
    } catch (error) { statusPengaturan.textContent = error.message || 'Terjadi kesalahan saat mengunggah logo.'; }
    finally { tombolUnggahLogo.disabled = false; }
});

muatPengaturan();
