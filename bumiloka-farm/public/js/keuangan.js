
const formBiaya = document.getElementById('form-biaya');
const pesanGlobal = document.getElementById('pesan-global');
const pesanForm = document.getElementById('pesan-form');

let daftarBiaya = [];
let idBiayaEdit = null;

function tanggalLokal(date = new Date()) {
    const tahun = date.getFullYear();
    const bulan = String(date.getMonth() + 1).padStart(2, '0');
    const hari = String(date.getDate()).padStart(2, '0');
    return `${tahun}-${bulan}-${hari}`;
}

function rupiah(nilai) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
    }).format(Number(nilai) || 0);
}

function angka(nilai) {
    return new Intl.NumberFormat('id-ID', {
        maximumFractionDigits: 3
    }).format(Number(nilai) || 0);
}

function tampilkanPesan(teks, error = false) {
    pesanGlobal.textContent = teks;
    pesanGlobal.hidden = !teks;
    pesanGlobal.classList.toggle('error', error);
}

function tampilkanPesanForm(teks, error = false) {
    pesanForm.textContent = teks;
    pesanForm.classList.toggle('error', error);
}

async function requestJson(url, opsi = {}) {
    const response = await fetch(url, {
        ...opsi,
        headers: {
            ...(opsi.body ? { 'Content-Type': 'application/json' } : {}),
            ...(opsi.headers || {})
        }
    });

    const hasil = await response.json().catch(() => ({
        status: 'gagal',
        pesan: 'Respons server tidak dapat dibaca.'
    }));

    if (response.status === 401) {
        window.location.href = '/login';
        throw new Error('Sesi login berakhir.');
    }

    if (!response.ok || hasil.status !== 'berhasil') {
        throw new Error(hasil.pesan || 'Permintaan gagal.');
    }

    return hasil;
}


async function muatOpsi() {
    // Tidak diperlukan dropdown produk/siklus pada biaya tingkat usaha.
    return;
}

function buatSel(nilai) {
    const td = document.createElement('td');
    td.textContent = nilai ?? '-';
    return td;
}

function resetForm() {
    idBiayaEdit = null;
    formBiaya.reset();

    document.getElementById('tanggal-biaya').value = tanggalLokal();
    document.getElementById('judul-form-biaya').textContent =
        'Catat Biaya Tambahan';
    document.getElementById('tombol-simpan-biaya').textContent =
        'Simpan Biaya';
    document.getElementById('tombol-batal-edit').hidden = true;

    tampilkanPesanForm('');
}

function mulaiEdit(item) {
    idBiayaEdit = item.id;

    document.getElementById('tanggal-biaya').value =
        String(item.tanggal_biaya).slice(0, 10);

    document.getElementById('kategori-biaya').value =
        item.kategori_biaya;

    document.getElementById('keterangan-biaya').value =
        item.keterangan || '';

    document.getElementById('total-biaya').value =
        item.total_biaya;

    document.getElementById('catatan-biaya').value =
        item.catatan || '';

    document.getElementById('judul-form-biaya').textContent =
        'Edit Biaya Tambahan';

    document.getElementById('tombol-simpan-biaya').textContent =
        'Simpan Perubahan';

    document.getElementById('tombol-batal-edit').hidden = false;

    tampilkanPesanForm('');
    document.getElementById('judul-form-biaya')
        .scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function muatBiaya() {
    const tbody = document.getElementById('daftar-biaya');
    tbody.replaceChildren();

    const barisMemuat = document.createElement('tr');
    const selMemuat = buatSel('Memuat data biaya...');
    selMemuat.colSpan = 7;
    barisMemuat.appendChild(selMemuat);
    tbody.appendChild(barisMemuat);

    try {
        const hasil = await requestJson('/api/keuangan/biaya');
        daftarBiaya = hasil.data;
        tbody.replaceChildren();

        if (!daftarBiaya.length) {
            const tr = document.createElement('tr');
            const td = buatSel('Belum ada catatan biaya produksi.');
            td.colSpan = 7;
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        daftarBiaya.forEach((item) => {
            const tr = document.createElement('tr');

            const jumlah = item.jumlah === null
                ? '-'
                : `${angka(item.jumlah)} ${item.satuan || ''}`.trim();

            [
                String(item.tanggal_biaya).slice(0, 10),
                item.kategori_biaya.replaceAll('_', ' '),
                item.keterangan,
                jumlah,
                rupiah(item.total_biaya),
                item.catatan || '-'
            ].forEach((nilai) => tr.appendChild(buatSel(nilai)));

            const tdAksi = document.createElement('td');
            const tombolEdit = document.createElement('button');
            tombolEdit.type = 'button';
            tombolEdit.className = 'tombol sekunder';
            tombolEdit.textContent = 'Edit';
            tombolEdit.addEventListener('click', () => mulaiEdit(item));

            const tombolHapus = document.createElement('button');
            tombolHapus.type = 'button';
            tombolHapus.className = 'tombol bahaya';
            tombolHapus.textContent = 'Hapus';
            tombolHapus.style.marginTop = '6px';

            tombolHapus.addEventListener('click', async () => {
                const yakin = window.confirm(
                    `Hapus catatan biaya "${item.keterangan}" sebesar ${rupiah(item.total_biaya)}?`
                );

                if (!yakin) return;

                try {
                    await requestJson(`/api/keuangan/biaya/${item.id}`, {
                        method: 'DELETE'
                    });

                    tampilkanPesan('Catatan biaya berhasil dihapus.');

                    if (String(idBiayaEdit) === String(item.id)) {
                        resetForm();
                    }

                    await Promise.all([muatBiaya(), muatLaporan()]);
                } catch (error) {
                    tampilkanPesan(error.message, true);
                }
            });

            tdAksi.append(tombolEdit, document.createElement('br'), tombolHapus);
            tr.appendChild(tdAksi);
            tbody.appendChild(tr);
        });
    } catch (error) {
        tbody.replaceChildren();
        const tr = document.createElement('tr');
        const td = buatSel(error.message);
        td.colSpan = 7;
        tr.appendChild(td);
        tbody.appendChild(tr);
    }
}

async function muatLaporan() {
    const status = document.getElementById('status-laporan');
    status.textContent = 'Memuat laporan...';

    const dari = document.getElementById('laporan-dari').value;
    const sampai = document.getElementById('laporan-sampai').value;

    try {
        const params = new URLSearchParams({ dari, sampai });
        const hasil = await requestJson(
            `/api/keuangan/laporan?${params.toString()}`
        );

        const ringkasan = hasil.ringkasan;

        document.getElementById('laporan-pendapatan').textContent =
            rupiah(ringkasan.pendapatan);

        document.getElementById('laporan-pembelian').textContent =
            rupiah(ringkasan.total_pembelian_operasional);

        document.getElementById('laporan-biaya-tambahan').textContent =
            rupiah(ringkasan.biaya_tambahan);

        document.getElementById('laporan-biaya').textContent =
            rupiah(ringkasan.total_biaya);

        document.getElementById('laporan-laba').textContent =
            rupiah(ringkasan.laba);

        document.getElementById('info-alokasi').textContent =
            'Pendapatan hanya menghitung penjualan Selesai dan Dibayar. Pengeluaran menggabungkan pembelian bahan operasional dan biaya tambahan. Selisih ini adalah ringkasan arus transaksi tercatat, bukan laba akuntansi penuh.';

        const daftarProduk = document.getElementById('daftar-laba-produk');
        daftarProduk.replaceChildren();

        if (!hasil.per_produk.length) {
            const kosong = document.createElement('p');
            kosong.className = 'kartu-pendapatan-kosong';
            kosong.textContent =
                'Belum ada pendapatan terealisasi per produk pada periode ini.';
            daftarProduk.appendChild(kosong);
        } else {
            hasil.per_produk.forEach((item) => {
                const kartu = document.createElement('article');
                kartu.className = 'kartu-pendapatan-produk';

                const nama = document.createElement('span');
                nama.className = 'nama-produk-pendapatan';
                nama.textContent = item.nama_produk || 'Produk tanpa nama';

                const nilai = document.createElement('strong');
                nilai.className = 'nilai-pendapatan-produk';
                nilai.textContent = rupiah(item.pendapatan);

                const label = document.createElement('small');
                label.textContent = 'Pendapatan terealisasi';

                kartu.append(nama, nilai, label);
                daftarProduk.appendChild(kartu);
            });
        }

        status.textContent =
            `Periode laporan: ${hasil.periode.dari} sampai ${hasil.periode.sampai}.`;
    } catch (error) {
        status.textContent = `Laporan gagal dimuat: ${error.message}`;
        try {
            const diagnostik = await requestJson('/api/keuangan/diagnostik');
            const hilang = diagnostik.tabel_belum_tersedia || [];
            if (hilang.length) {
                status.textContent += ` Database ${diagnostik.database} belum memiliki tabel: ${hilang.join(', ')}. Jalankan migrasi yang sesuai.`;
            } else {
                status.textContent += ` Tabel utama terdeteksi pada database ${diagnostik.database}; periksa log server untuk detail query.`;
            }
        } catch (diagnostikError) {
            status.textContent += ` Pemeriksaan skema juga gagal: ${diagnostikError.message}`;
        }
    }
}

formBiaya.addEventListener('submit', async (event) => {
    event.preventDefault();
    tampilkanPesanForm('');

    const tombol = document.getElementById('tombol-simpan-biaya');
    tombol.disabled = true;

    const body = {
        tanggal_biaya: document.getElementById('tanggal-biaya').value,
        kategori_biaya: document.getElementById('kategori-biaya').value,
        keterangan: document.getElementById('keterangan-biaya').value,
        jumlah: document.getElementById('jumlah-biaya')?.value || '',
        satuan: document.getElementById('satuan-biaya')?.value || '',
        total_biaya: document.getElementById('total-biaya').value,
        catatan: document.getElementById('catatan-biaya').value
    };

    try {
        const url = idBiayaEdit
            ? `/api/keuangan/biaya/${idBiayaEdit}`
            : '/api/keuangan/biaya';

        const hasil = await requestJson(url, {
            method: idBiayaEdit ? 'PUT' : 'POST',
            body: JSON.stringify(body)
        });

        tampilkanPesanForm(hasil.pesan);
        resetForm();

        await Promise.all([muatBiaya(), muatLaporan()]);
        tampilkanPesan(hasil.pesan);
    } catch (error) {
        tampilkanPesanForm(error.message, true);
    } finally {
        tombol.disabled = false;
    }
});

document.getElementById('tombol-batal-edit')
    .addEventListener('click', resetForm);

document.getElementById('tombol-muat-biaya')
    .addEventListener('click', async () => {
        await Promise.all([muatBiaya(), muatLaporan()]);
        tampilkanPesan('Data biaya dan laporan telah dimuat ulang.');
    });

document.getElementById('form-filter-laporan')
    .addEventListener('submit', async (event) => {
        event.preventDefault();
        await muatLaporan();
    });


async function mulaiHalaman() {
    const sekarang = new Date();
    document.getElementById('laporan-dari').value =
        tanggalLokal(new Date(sekarang.getFullYear(), sekarang.getMonth(), 1));
    document.getElementById('laporan-sampai').value = tanggalLokal();
    document.getElementById('tanggal-biaya').value = tanggalLokal();

    await muatOpsi();
    const hasilAwal = await Promise.allSettled([muatBiaya(), muatLaporan()]);
    const gagal = hasilAwal.filter(x => x.status === 'rejected');
    if (gagal.length) tampilkanPesan('Sebagian data keuangan gagal dimuat. Lihat pesan pada bagian yang bermasalah.', true);
}

mulaiHalaman();
