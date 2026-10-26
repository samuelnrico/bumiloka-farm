(function () {
  'use strict';
  // Halaman /katalog. Kartu produk memakai template bersama dari publik.js.
  const BL = window.BumiLoka;
  const grid = document.getElementById('catalogGrid');
  if (!BL || !grid) return;
  const search = document.getElementById('catalogSearch');
  const sort = document.getElementById('catalogSort');
  const categoryBox = document.getElementById('catalogCategories');
  const count = document.getElementById('catalogCount');
  const label = document.getElementById('activeFilterLabel');
  const clear = document.getElementById('clearFilters');
  let products = [];
  let activeCategory = 'semua';

  const categoryOf = p => String(p.kategori || p.jenis_produk || 'Lainnya').trim() || 'Lainnya';

  function renderCategories() {
    const categories = [...new Set(products.map(categoryOf))].sort((a, b) => a.localeCompare(b, 'id'));
    const chip = (value, text, n) => `<button type="button" class="chip ${activeCategory === value ? 'active' : ''}" data-category="${BL.aman(value)}">${BL.aman(text)} <span class="chip-count">${n}</span></button>`;
    categoryBox.innerHTML = chip('semua', 'Semua produk', products.length) + categories.map(c => chip(c, c, products.filter(p => categoryOf(p) === c).length)).join('');
    categoryBox.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
      activeCategory = button.dataset.category || 'semua';
      categoryBox.querySelectorAll('[data-category]').forEach(el => el.classList.toggle('active', el === button));
      render();
    }));
  }

  function showState(title, message, retry) {
    grid.innerHTML = `<div class="catalog-state"><span>${retry ? '!' : '✳'}</span><strong>${BL.aman(title)}</strong><p>${BL.aman(message)}</p>${retry ? '<button class="button button-light" type="button" id="retryCatalog">Coba lagi</button>' : ''}</div>`;
    document.getElementById('retryCatalog')?.addEventListener('click', load);
  }

  function render() {
    const q = String(search.value || '').trim().toLocaleLowerCase('id-ID');
    const filtered = products.filter(p => {
      const catOK = activeCategory === 'semua' || categoryOf(p) === activeCategory;
      const text = [p.nama_produk, p.kategori, p.jenis_produk, p.deskripsi].map(v => String(v || '')).join(' ').toLocaleLowerCase('id-ID');
      return catOK && (!q || text.includes(q));
    });
    const mode = sort.value;
    if (mode === 'nama') filtered.sort((a, b) => String(a.nama_produk).localeCompare(String(b.nama_produk), 'id'));
    if (mode === 'harga-naik') filtered.sort((a, b) => Number(a.harga_jual) - Number(b.harga_jual));
    if (mode === 'harga-turun') filtered.sort((a, b) => Number(b.harga_jual) - Number(a.harga_jual));

    count.textContent = `${filtered.length} produk tersedia`;
    if (label) label.textContent = `${activeCategory === 'semua' ? 'Semua kategori' : activeCategory}${q ? ` · pencarian “${q}”` : ''}`;
    if (clear) clear.hidden = !(q || activeCategory !== 'semua' || mode !== 'relevan');

    if (!filtered.length) {
      showState(products.length ? 'Produk tidak ditemukan' : 'Belum ada produk tersedia',
        products.length ? 'Coba kata kunci, kategori, atau urutan yang berbeda.' : 'Produk akan tampil setelah aktif, ditampilkan di katalog, dan memiliki stok siap jual.', false);
      return;
    }
    grid.innerHTML = filtered.map((p, i) => BL.kartuProduk(p, i)).join('');
    BL.pasangTombolKeranjang(grid, products);
  }

  async function load() {
    showState('Memuat katalog', 'Mengambil produk dan ketersediaan stok terbaru.', false);
    try {
      const response = await fetch('/api/katalog', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const json = await response.json();
      if (!response.ok || json.status !== 'berhasil' || !Array.isArray(json.data)) throw new Error(json.pesan || 'Respons katalog tidak valid.');
      products = json.data;
      renderCategories();
      render();
    } catch (error) {
      console.error('Gagal memuat katalog publik:', error);
      count.textContent = 'Katalog belum tersedia';
      showState('Katalog belum dapat dimuat', 'Periksa koneksi server, lalu coba muat ulang katalog.', true);
    }
  }

  search.addEventListener('input', render);
  sort.addEventListener('change', render);
  clear?.addEventListener('click', () => { search.value = ''; sort.value = 'relevan'; activeCategory = 'semua'; renderCategories(); render(); });

  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }), { threshold: .12 }) : null;
  document.querySelectorAll('.reveal').forEach(el => observer ? observer.observe(el) : el.classList.add('is-visible'));
  load();
})();
