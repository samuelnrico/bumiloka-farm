(function () {
  'use strict';
  const host = document.getElementById('detailContent');
  if (!host) return;
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
  const formatNumber = value => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(Number(value) || 0);
  const id = window.location.pathname.match(/^\/produk\/(\d+)\/?$/)?.[1];
  function imageMarkup(p) {
    const url = String(p.url_foto || '').trim();
    if (!(/^https?:\/\//i.test(url) || /^\/uploads\/produk\/[a-zA-Z0-9._-]+$/.test(url))) return '<div class="image-placeholder" aria-label="Foto produk belum tersedia">✳</div>';
    return `<img src="${escapeHTML(url)}" alt="${escapeHTML(p.nama_produk)}" onerror="this.outerHTML='<div class=&quot;image-placeholder&quot; aria-label=&quot;Foto tidak tersedia&quot;>✳</div>'">`;
  }
  function fail(title, text) {
    host.innerHTML = `<div class="detail-error"><span class="detail-error-icon">!</span><h1>${escapeHTML(title)}</h1><p>${escapeHTML(text)}</p><a class="button button-light" href="/katalog">Kembali ke katalog <span>↗</span></a></div>`;
  }
  function render(p) {
    document.title = `${p.nama_produk} | BumiLoka Farm`;
    document.getElementById('breadcrumbProduct').textContent = p.nama_produk;
    const stock = Math.max(0, Number(p.stok_tersedia) || 0);
    const category = String(p.kategori || p.jenis_produk || 'Produk BumiLoka');
    host.innerHTML = `<div class="detail-layout"><div><div class="detail-gallery">${imageMarkup(p)}<span class="detail-gallery-badge">${escapeHTML(category)}</span></div><div class="detail-gallery-caption"><span>✳</span><div>Foto produk sebagai referensi. Informasi harga dan ketersediaan mengikuti data katalog.</div></div></div>
      <section class="detail-info"><div class="detail-kicker">PRODUK BUMILOKA FARM</div><h1>${escapeHTML(p.nama_produk)}</h1><p class="detail-description">${escapeHTML(String(p.deskripsi || '').trim() || 'Produk dari kegiatan perkebunan dan peternakan BumiLoka Farm. Ketersediaan mengikuti stok siap jual yang tercatat.')}</p>
      <div class="detail-price-wrap"><span class="detail-price">${window.BumiLoka.formatRupiah(p.harga_jual)}</span><span class="detail-unit">/ ${escapeHTML(p.satuan_jual || 'satuan')}</span><div class="detail-stock-row"><i></i> Tersedia ${formatNumber(stock)} ${escapeHTML(p.satuan_stok || p.satuan_jual || '')}</div></div>
      <div class="detail-meta"><div class="detail-meta-item"><span>Kategori</span><strong>${escapeHTML(category)}</strong></div><div class="detail-meta-item"><span>Satuan penjualan</span><strong>${escapeHTML(p.satuan_jual || 'Satuan')}</strong></div></div>
      <div class="detail-buy-row"><div class="quantity-control"><button type="button" id="qtyMinus" aria-label="Kurangi jumlah">−</button><input id="productQuantity" type="number" min="1" max="${Math.max(1, stock)}" value="1" inputmode="numeric" aria-label="Jumlah produk"><button type="button" id="qtyPlus" aria-label="Tambah jumlah">＋</button></div><button type="button" class="detail-add-button" id="detailAdd" ${stock <= 0 ? 'disabled' : ''}><span>＋</span> Tambah ke keranjang</button></div>
      <div class="detail-order-note"><span>↗</span><p>Pesanan dilanjutkan melalui WhatsApp. Menambahkan produk ke keranjang belum berarti pesanan telah dikonfirmasi atau dibayar.</p></div></section></div>`;
    const qty = document.getElementById('productQuantity');
    const minus = document.getElementById('qtyMinus');
    const plus = document.getElementById('qtyPlus');
    const add = document.getElementById('detailAdd');
    function setQty(value) { const n = Math.max(1, Math.min(stock || 1, Math.floor(Number(value) || 1))); qty.value = n; }
    minus.addEventListener('click', () => setQty(Number(qty.value) - 1));
    plus.addEventListener('click', () => setQty(Number(qty.value) + 1));
    qty.addEventListener('change', () => setQty(qty.value));
    add.addEventListener('click', () => {
      const n = Math.max(1, Math.floor(Number(qty.value) || 1));
      if (n > stock) { setQty(stock); window.BumiLoka.tampilkanToast('Jumlah melebihi stok yang tersedia.'); return; }
      window.BumiLoka.tambahKeKeranjang(p, n);
      add.innerHTML = '<span>✓</span> Ditambahkan';
      add.classList.add('added');
      setTimeout(() => { if (add.isConnected) { add.innerHTML = '<span>＋</span> Tambah ke keranjang'; add.classList.remove('added'); } }, 1100);
    });
  }
  async function load() {
    if (!id) return fail('Alamat produk tidak valid', 'ID produk pada alamat halaman tidak dapat dibaca.');
    try {
      let produk = null;
      // Utamakan endpoint detail. Jika endpoint detail tidak tersedia pada server yang terpasang,
      // gunakan daftar katalog yang sama lalu cari produk berdasarkan ID.
      try {
        const response = await fetch(`/api/katalog/${encodeURIComponent(id)}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
        const json = await response.json();
        if (response.ok && json.status === 'berhasil' && json.data) produk = json.data;
      } catch (_) { /* fallback katalog di bawah */ }
      if (!produk) {
        const responseList = await fetch('/api/katalog', { headers: { Accept: 'application/json' }, cache: 'no-store' });
        const jsonList = await responseList.json();
        if (responseList.ok && jsonList.status === 'berhasil' && Array.isArray(jsonList.data)) {
          produk = jsonList.data.find(item => Number(item.id) === Number(id)) || null;
        }
      }
      if (!produk) throw new Error('Produk tidak ditemukan pada katalog aktif.');
      render(produk);
    } catch (error) {
      console.error('Gagal memuat detail produk:', error);
      fail('Produk tidak tersedia', 'Produk mungkin sudah habis atau tidak lagi ditampilkan. Kembali ke katalog untuk melihat produk yang tersedia.');
    }
  }
  load();
})();
