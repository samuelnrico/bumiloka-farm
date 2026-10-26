(() => {
  const $ = (id) => document.getElementById(id);
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  $('tanggal_produksi').value = localDate;
  $('tanggal_perubahan').value = localDate;
  let produk = [];
  let hasilProduksi = [];
  const jenisLabel = { sayuran: 'Panen kebun', telur: 'Produksi telur', daging_ayam: 'Pemrosesan ayam' };
  const ternakLabel = { ayam_petelur: 'Ayam petelur', ayam_potong: 'Ayam potong' };
  const perubahanLabel = { penambahan: 'Penambahan', kematian: 'Kematian', penjualan_hidup: 'Penjualan hidup (populasi)', pemrosesan: 'Pemrosesan', koreksi_tambah: 'Koreksi tambah', koreksi_kurang: 'Koreksi kurang' };
  const formatAngka = (v) => Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 3 });
  const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const request = async (url, options = {}) => {
    const res = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status === 'gagal') throw new Error(data.pesan || `Permintaan gagal (${res.status}).`);
    return data;
  };
  const message = (id, text, error = false) => { $(id).textContent = text; $(id).className = `pesan${error ? ' error' : ''}`; };

  function updateFormJenis() {
    const jenis = $('jenis_produksi').value;
    const filter = produk.filter(p => p.jenis_produk === jenis);
    $('produk_id').innerHTML = '<option value="">Pilih produk</option>' + filter.map(p => `<option value="${p.id}">${escapeHtml(p.nama_produk)} (${escapeHtml(p.satuan_stok)})</option>`).join('');
    $('label-jumlah').firstChild.textContent = `Jumlah hasil (${jenis === 'telur' ? 'butir' : 'kg'}) *`;
    $('jumlah_hasil').step = jenis === 'telur' ? '1' : '0.001';
    $('jumlah_hasil').min = jenis === 'telur' ? '1' : '0.001';
    $('jumlah_hasil').placeholder = jenis === 'telur' ? 'Contoh: 120' : 'Contoh: 25.5';
    $('label-ayam').classList.toggle('tersembunyi', jenis !== 'daging_ayam');
    $('jumlah_ayam_diproses').required = jenis === 'daging_ayam';
    $('jumlah_ayam_diproses').disabled = jenis !== 'daging_ayam';
    $('info-jenis').textContent = jenis === 'sayuran' ? 'Catat total hasil panen. Jumlah yang siap dijual ditetapkan pada tahap konfirmasi.' : jenis === 'telur' ? 'Masukkan jumlah telur terkumpul. Jumlah layak dan tidak layak ditentukan saat konfirmasi.' : 'Masukkan total berat daging yang dihasilkan dan jumlah ayam yang diproses. Populasi ayam akan berkurang saat catatan disimpan.';
  }

  async function loadOptions() {
    const data = await request('/api/hasil-produksi/opsi');
    produk = data.data || [];
    updateFormJenis();
  }

  function renderHistory() {
    const tbody = $('riwayat-produksi');
    if (!hasilProduksi.length) { tbody.innerHTML = '<tr><td colspan="6" class="kosong">Belum ada catatan produksi.</td></tr>'; return; }
    tbody.innerHTML = hasilProduksi.map(h => `<tr><td>${escapeHtml(String(h.tanggal_produksi).slice(0,10))}</td><td>${escapeHtml(jenisLabel[h.jenis_produksi] || h.jenis_produksi)}</td><td>${escapeHtml(h.nama_produk)}</td><td>${formatAngka(h.jumlah_hasil)} ${escapeHtml(h.satuan_stok)}</td><td><span class="status status-${escapeHtml(h.status_verifikasi)}">${h.status_verifikasi === 'menunggu' ? 'Menunggu konfirmasi' : h.status_verifikasi === 'dikonfirmasi' ? 'Dikonfirmasi' : 'Ditolak'}</span></td><td>${h.jumlah_layak == null ? 'Belum dikonfirmasi' : `${formatAngka(h.jumlah_layak)} ${escapeHtml(h.satuan_stok)}`}</td></tr>`).join('');
  }

  function pasangKalkulasiLayak() {
    document.querySelectorAll('.form-konfirmasi').forEach(form => {
      const total = Number(form.dataset.total);
      const layakInput = form.elements.jumlah_layak;
      const tidakInput = form.elements.jumlah_tidak_layak;
      const unitInteger = form.dataset.jenis === 'telur';
      const hitung = () => {
        const layak = Number(layakInput.value);
        if (layakInput.value === '' || !Number.isFinite(layak) || layak < 0) {
          tidakInput.value = '';
          return;
        }
        const sisa = Math.max(0, total - layak);
        tidakInput.value = unitInteger ? String(Math.round(sisa)) : String(Math.round((sisa + Number.EPSILON) * 1000) / 1000);
      };
      layakInput.addEventListener('input', hitung);
      layakInput.addEventListener('change', hitung);
      hitung();
    });
  }

  function renderPending() {
    const pending = hasilProduksi.filter(h => h.status_verifikasi === 'menunggu');
    $('jumlah-menunggu').textContent = String(pending.length);
    const root = $('daftar-menunggu');
    if (!pending.length) { root.innerHTML = '<p class="kosong">Tidak ada hasil produksi yang menunggu konfirmasi.</p>'; return; }
    root.innerHTML = pending.map(h => `<article class="item-menunggu"><div class="item-head"><div><h3>${escapeHtml(h.nama_produk)}</h3><p>${escapeHtml(jenisLabel[h.jenis_produksi])} · ${escapeHtml(String(h.tanggal_produksi).slice(0,10))}</p></div><strong>${formatAngka(h.jumlah_hasil)} ${escapeHtml(h.satuan_stok)}</strong></div>${h.jenis_produksi === 'daging_ayam' ? `<p class="meta">Ayam diproses: ${formatAngka(h.jumlah_ayam_diproses)} ekor</p>` : ''}${h.catatan ? `<p class="meta">${escapeHtml(h.catatan)}</p>` : ''}<form class="form-konfirmasi" data-id="${h.id}" data-total="${h.jumlah_hasil}" data-unit="${escapeHtml(h.satuan_stok)}" data-jenis="${h.jenis_produksi}"><div class="form-grid"><label>Jumlah layak jual (${escapeHtml(h.satuan_stok)}) *<input name="jumlah_layak" type="number" min="0" step="${h.jenis_produksi === 'telur' ? '1' : '0.001'}" required value="${h.jumlah_hasil}"></label><label>Jumlah tidak layak (${escapeHtml(h.satuan_stok)}) *<input name="jumlah_tidak_layak" type="number" min="0" step="${h.jenis_produksi === 'telur' ? '1' : '0.001'}" required value="0"></label><label class="lebar-penuh">Alasan tidak layak (opsional)<input name="alasan_tidak_layak" maxlength="1000" placeholder="Contoh: rusak atau ukuran tidak sesuai"></label><div class="lebar-penuh"><p class="pesan pesan-konfirmasi" role="status"></p><button class="utama" type="submit">Konfirmasi dan masukkan stok layak jual</button></div></div></form></article>`).join('');
    root.querySelectorAll('.form-konfirmasi').forEach(form => form.addEventListener('submit', submitConfirmation));
    pasangKalkulasiLayak();
  }

  async function loadProduction() {
    try {
      const data = await request('/api/hasil-produksi');
      hasilProduksi = data.data || [];
      renderHistory(); renderPending();
    } catch (e) { $('riwayat-produksi').innerHTML = `<tr><td colspan="6" class="error-text">${escapeHtml(e.message)}</td></tr>`; $('daftar-menunggu').innerHTML = `<p class="error-text">${escapeHtml(e.message)}</p>`; }
  }

  async function submitConfirmation(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const id = form.dataset.id;
    const total = Number(form.dataset.total);
    const layak = Number(form.elements.jumlah_layak.value);
    const tidak = Number(form.elements.jumlah_tidak_layak.value);
    const status = form.querySelector('.pesan-konfirmasi');
    if (!Number.isFinite(layak) || !Number.isFinite(tidak) || layak < 0 || tidak < 0 || Math.abs(layak + tidak - total) > 0.0005) { status.textContent = `Jumlah layak dan tidak layak harus berjumlah ${formatAngka(total)} ${form.dataset.unit}.`; status.className = 'pesan error pesan-konfirmasi'; return; }
    if (form.dataset.jenis === 'telur' && (!Number.isInteger(layak) || !Number.isInteger(tidak))) { status.textContent = 'Jumlah telur harus berupa bilangan bulat.'; status.className = 'pesan error pesan-konfirmasi'; return; }
    if (tidak > 0 && !form.elements.alasan_tidak_layak.value.trim()) { status.textContent = 'Isi alasan jika ada hasil yang tidak layak jual.'; status.className = 'pesan error pesan-konfirmasi'; form.elements.alasan_tidak_layak.focus(); return; }
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      const data = await request(`/api/hasil-produksi/${id}/konfirmasi`, { method: 'POST', body: JSON.stringify({ jumlah_layak: layak, jumlah_tidak_layak: tidak, alasan_tidak_layak: form.elements.alasan_tidak_layak.value }) });
      status.textContent = data.pesan; status.className = 'pesan pesan-konfirmasi';
      await loadProduction();
    } catch (e) { status.textContent = e.message; status.className = 'pesan error pesan-konfirmasi'; button.disabled = false; }
  }

  async function loadPopulasi() {
    try {
      const data = await request('/api/hasil-produksi/populasi');
      const ringkasan = data.data.ringkasan || [];
      $('ringkasan-populasi').innerHTML = ringkasan.map(r => `<div class="kartu"><span>${escapeHtml(ternakLabel[r.jenis_ternak] || r.jenis_ternak)}</span><strong>${formatAngka(r.jumlah_tersisa)} ekor</strong></div>`).join('');
      const rows = data.data.riwayat || [];
      $('riwayat-ternak').innerHTML = rows.length ? rows.map(r => `<tr><td>${escapeHtml(String(r.tanggal_perubahan).slice(0,10))}</td><td>${escapeHtml(ternakLabel[r.jenis_ternak] || r.jenis_ternak)}</td><td>${escapeHtml(perubahanLabel[r.jenis_perubahan] || r.jenis_perubahan)}</td><td>${formatAngka(r.jumlah)} ekor</td><td>${r.catatan ? escapeHtml(r.catatan) : '<span class="teks-sekunder">Tidak ada catatan</span>'}</td></tr>`).join('') : '<tr><td colspan="5" class="kosong">Belum ada perubahan ternak baru. Data kelompok lama tetap dihitung.</td></tr>';
    } catch (e) { $('ringkasan-populasi').innerHTML = `<p class="error-text">${escapeHtml(e.message)}</p>`; $('riwayat-ternak').innerHTML = `<tr><td colspan="5" class="error-text">${escapeHtml(e.message)}</td></tr>`; }
  }

  document.querySelectorAll('.tab-button').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.tab-button').forEach(b => b.classList.toggle('aktif', b === button));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('tersembunyi', panel.id !== `panel-${button.dataset.tab}`));
  }));
  $('jenis_produksi').addEventListener('change', updateFormJenis);
  $('jenis_perubahan').addEventListener('change', () => {
    const perluAlasan = ['koreksi_tambah', 'koreksi_kurang'].includes($('jenis_perubahan').value);
    $('label-alasan-koreksi').classList.toggle('tersembunyi', !perluAlasan);
    $('alasan_koreksi').required = perluAlasan;
    $('alasan_koreksi').disabled = !perluAlasan;
    if (!perluAlasan) $('alasan_koreksi').value = '';
  });
  $('jenis_perubahan').dispatchEvent(new Event('change'));
  $('form-produksi').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('simpan-produksi'); button.disabled = true; message('pesan-produksi', 'Menyimpan...');
    try {
      const body = { jenis_produksi: $('jenis_produksi').value, produk_id: $('produk_id').value, tanggal_produksi: $('tanggal_produksi').value, jumlah_hasil: $('jumlah_hasil').value };
      if (body.jenis_produksi === 'daging_ayam') body.jumlah_ayam_diproses = $('jumlah_ayam_diproses').value;
      const result = await request('/api/hasil-produksi', { method: 'POST', body: JSON.stringify(body) });
      message('pesan-produksi', result.pesan);
      $('form-produksi').reset(); $('tanggal_produksi').value = localDate; updateFormJenis();
      await loadProduction();
      document.querySelector('[data-tab="konfirmasi"]').click();
    } catch (e) { message('pesan-produksi', e.message, true); }
    finally { button.disabled = false; }
  });
  $('form-ternak').addEventListener('submit', async (event) => {
    event.preventDefault(); const button = $('simpan-ternak'); button.disabled = true; message('pesan-ternak', 'Menyimpan...');
    try {
      const result = await request('/api/hasil-produksi/populasi', { method: 'POST', body: JSON.stringify({ jenis_ternak: $('jenis_ternak').value, jenis_perubahan: $('jenis_perubahan').value, tanggal_perubahan: $('tanggal_perubahan').value, jumlah: $('jumlah_ternak').value, catatan: ['koreksi_tambah', 'koreksi_kurang'].includes($('jenis_perubahan').value) ? $('alasan_koreksi').value : '' }) });
      message('pesan-ternak', result.pesan); $('form-ternak').reset(); $('tanggal_perubahan').value = localDate; $('jenis_perubahan').dispatchEvent(new Event('change')); await loadPopulasi();
    } catch (e) { message('pesan-ternak', e.message, true); }
    finally { button.disabled = false; }
  });
  $('muat-ulang-produksi').addEventListener('click', loadProduction);
  $('muat-ulang-semua').addEventListener('click', async () => { await Promise.all([loadProduction(), loadPopulasi()]); });

  Promise.all([loadOptions(), loadProduction(), loadPopulasi()]).catch(e => message('pesan-produksi', e.message, true));
})();
