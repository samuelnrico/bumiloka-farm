(() => {
  const $ = (selector) => document.querySelector(selector);
  const fmtAngka = (v) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(Number(v || 0));
  const fmtRupiah = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v || 0));
  const fmtTanggal = (v) => {
    if (!v) return '-';
    const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('id-ID');
  };
  const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let barang = [], pembelian = [], pemakaian = [];
  const kategoriLabel = {bibit:'Bibit',pupuk:'Pupuk',pestisida:'Pestisida',pakan:'Pakan',obat_ternak:'Obat ternak',kemasan:'Kemasan',perlengkapan:'Perlengkapan',lainnya:'Lainnya'};

  async function api(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', headers: {'Content-Type':'application/json', ...(options.headers || {})}, ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.status === 'gagal') throw new Error(body.pesan || 'Permintaan gagal.');
    return body;
  }
  function tampilPesan(teks, error = false) {
    const el = $('#pesan'); el.textContent = teks; el.hidden = false; el.classList.toggle('error', error);
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function sembunyikanPesan() { $('#pesan').hidden = true; }
  function setTanggalDefault() {
    const now = new Date(); const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0,10);
    document.querySelectorAll('input[type="date"]').forEach((el) => { if (!el.value) el.value = local; });
  }
  function renderStok() {
    const body = $('#tabel-stok');
    if (!barang.length) { body.innerHTML = '<tr><td colspan="7" class="empty">Belum ada barang operasional. Tambahkan barang melalui formulir di atas.</td></tr>'; }
    else body.innerHTML = barang.map((b) => {
      const stok = Number(b.stok_tersedia || 0), min = Number(b.stok_minimum || 0);
      const status = !b.aktif ? '<span class="status off">Nonaktif</span>' : (stok <= min ? '<span class="status warning">Stok menipis</span>' : '<span class="status">Tersedia</span>');
      return `<tr><td><strong>${escapeHtml(b.nama_barang)}</strong><br><span class="muted">${escapeHtml(b.satuan)}</span></td><td>${escapeHtml(kategoriLabel[b.kategori] || b.kategori)}</td><td>${fmtAngka(b.total_masuk)} ${escapeHtml(b.satuan)}</td><td>${fmtAngka(b.total_pemakaian)} ${escapeHtml(b.satuan)}</td><td><strong>${fmtAngka(stok)} ${escapeHtml(b.satuan)}</strong></td><td>${fmtRupiah(b.total_biaya_pembelian)}</td><td>${status}</td></tr>`;
    }).join('');
    $('#jumlah-jenis').textContent = barang.filter((b) => b.aktif).length;
    $('#jumlah-menipis').textContent = barang.filter((b) => b.aktif && Number(b.stok_tersedia || 0) <= Number(b.stok_minimum || 0)).length;
    $('#total-pembelian').textContent = fmtRupiah(barang.reduce((sum,b) => sum + Number(b.total_biaya_pembelian || 0), 0));
    renderPilihan();
  }
  function renderPilihan() {
    const aktif = barang.filter((b) => b.aktif);
    for (const id of ['#pilih-beli','#pilih-pakai']) {
      const el = $(id), current = el.value;
      el.innerHTML = '<option value="">Pilih barang</option>' + aktif.map((b) => `<option value="${b.id}">${escapeHtml(b.nama_barang)} · stok ${fmtAngka(b.stok_tersedia)} ${escapeHtml(b.satuan)}</option>`).join('');
      if (aktif.some((b) => String(b.id) === current)) el.value = current;
    }
  }
  async function muatBarang() { const r = await api('/api/barang-operasional'); barang = r.data || []; renderStok(); }
  async function muatRiwayat() {
    const [p, m] = await Promise.all([api('/api/barang-operasional/pembelian'), api('/api/barang-operasional/pemakaian')]);
    pembelian = (p.data || []).map((x) => ({...x, jenis:'pembelian', tanggal:x.tanggal_pembelian, jumlahTampil:`${fmtAngka(x.jumlah)} ${x.satuan}`, detail:fmtRupiah(x.total_biaya), pelengkap:x.pemasok || '-'}));
    pemakaian = (m.data || []).map((x) => ({...x, jenis:'pemakaian', tanggal:x.tanggal_pemakaian, jumlahTampil:`${fmtAngka(x.jumlah)} ${x.satuan}`, detail:x.keterangan, pelengkap:x.keterangan || '-'}));
    renderRiwayat();
  }
  function renderRiwayat() {
    const tabelPembelian = $('#tabel-riwayat-pembelian');
    const tabelPemakaian = $('#tabel-riwayat-pemakaian');
    const urutPembelian = [...pembelian].sort((a,b) => String(b.tanggal).localeCompare(String(a.tanggal)) || Number(b.id)-Number(a.id));
    const urutPemakaian = [...pemakaian].sort((a,b) => String(b.tanggal).localeCompare(String(a.tanggal)) || Number(b.id)-Number(a.id));
    tabelPembelian.innerHTML = urutPembelian.length ? urutPembelian.map((x) => `<tr><td>${fmtTanggal(x.tanggal)}</td><td>${escapeHtml(x.nama_barang)}</td><td>+${escapeHtml(x.jumlahTampil)}</td><td>${escapeHtml(x.detail)}</td><td>${escapeHtml(x.pelengkap)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">Belum ada pembelian.</td></tr>';
    tabelPemakaian.innerHTML = urutPemakaian.length ? urutPemakaian.map((x) => `<tr><td>${fmtTanggal(x.tanggal)}</td><td>${escapeHtml(x.nama_barang)}</td><td>-${escapeHtml(x.jumlahTampil)}</td><td>${escapeHtml(x.detail)}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">Belum ada pemakaian.</td></tr>';
  }
  document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === button));
    document.querySelectorAll('.tab-panel').forEach((panel) => { panel.hidden = panel.id !== `panel-${button.dataset.tab}`; });
    sembunyikanPesan();
  }));
  $('#form-barang').addEventListener('submit', async (event) => {
    event.preventDefault(); sembunyikanPesan(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form).entries());
    try { const r = await api('/api/barang-operasional', {method:'POST',body:JSON.stringify(data)}); form.reset(); form.elements.stok_minimum.value = '0'; await muatBarang(); tampilPesan(r.pesan || 'Barang berhasil ditambahkan.'); }
    catch (e) { tampilPesan(e.message, true); }
  });
  $('#form-beli').addEventListener('submit', async (event) => {
    event.preventDefault(); sembunyikanPesan(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form).entries());
    try { const r = await api('/api/barang-operasional/pembelian', {method:'POST',body:JSON.stringify(data)}); const tanggal = form.elements.tanggal_pembelian.value; form.reset(); form.elements.tanggal_pembelian.value = tanggal; await Promise.all([muatBarang(),muatRiwayat()]); tampilPesan(`${r.pesan} Total: ${fmtRupiah(r.data.total_biaya)}.`); }
    catch (e) { tampilPesan(e.message, true); }
  });
  $('#form-pakai').addEventListener('submit', async (event) => {
    event.preventDefault(); sembunyikanPesan(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form).entries());
    try { const r = await api('/api/barang-operasional/pemakaian', {method:'POST',body:JSON.stringify(data)}); const tanggal = form.elements.tanggal_pemakaian.value; form.reset(); form.elements.tanggal_pemakaian.value = tanggal; await Promise.all([muatBarang(),muatRiwayat()]); tampilPesan(r.pesan); }
    catch (e) { tampilPesan(e.message, true); }
  });
  $('#muat-riwayat').addEventListener('click', async () => { try { await muatRiwayat(); tampilPesan('Riwayat diperbarui.'); } catch(e) { tampilPesan(e.message,true); } });
  setTanggalDefault();
  Promise.all([muatBarang(),muatRiwayat()]).catch((e) => tampilPesan(e.message, true));
})();
