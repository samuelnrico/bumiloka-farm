(function () {
  'use strict';
  const api = window.BumiLoka;
  const itemsBox = document.getElementById('cartItems');
  if (!api || !itemsBox) return;

  const notice = document.getElementById('cartNotice');
  const itemCount = document.getElementById('cartItemCount');
  const summaryKinds = document.getElementById('summaryKinds');
  const summaryQuantity = document.getElementById('summaryQuantity');
  const summaryTotal = document.getElementById('summaryTotal');
  const checkoutButton = document.getElementById('checkoutButton');
  let latestProducts = [];
  let stockChecked = false;

  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const number = value => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(Number(value) || 0);
  const rupiah = value => api.formatRupiah(value);
  const productCategory = p => String(p.kategori || p.jenis_produk || 'Produk BumiLoka').trim() || 'Produk BumiLoka';

  function getItems() { return api.bacaKeranjang(); }
  function setNotice(message) {
    if (!notice) return;
    notice.textContent = message || '';
    notice.hidden = !message;
  }
  function productImage(item) {
    const url = String(item.url_foto || '').trim();
    if (!/^https?:\/\//i.test(url)) return '<div class="cart-product-placeholder" aria-label="Foto produk belum tersedia">✳</div>';
    return `<img class="cart-product-image" src="${escapeHTML(url)}" alt="${escapeHTML(item.nama_produk || 'Produk BumiLoka')}" loading="lazy">`;
  }
  function itemStock(item) {
    const live = latestProducts.find(p => Number(p.id) === Number(item.id));
    if (live) return Math.max(0, Number(live.stok_tersedia) || 0);
    return stockChecked ? 0 : Math.max(0, Number(item.stok_tersedia) || 0);
  }
  function isAvailable(item) { return !stockChecked || latestProducts.some(p => Number(p.id) === Number(item.id)) && itemStock(item) > 0; }
  function render() {
    const items = getItems();
    const qty = items.reduce((sum, item) => sum + Math.max(0, Number(item.jumlah) || 0), 0);
    if (itemCount) itemCount.textContent = `${items.length} jenis produk · ${number(qty)} item`;
    if (!items.length) {
      itemsBox.innerHTML = `<div class="cart-empty"><div class="cart-empty-icon" aria-hidden="true">⌑</div><h3>Keranjang masih kosong</h3><p>Pilih produk dari katalog BumiLoka Farm. Produk yang Anda tambahkan akan tersimpan di keranjang ini.</p><a class="button button-primary" href="/katalog">Jelajahi katalog <span aria-hidden="true">→</span></a></div>`;
      summaryKinds.textContent = '0'; summaryQuantity.textContent = '0'; summaryTotal.textContent = rupiah(0); checkoutButton.disabled = true;
      return;
    }

    let total = 0;
    let validQty = 0;
    let unavailableCount = 0;
    itemsBox.innerHTML = items.map((item, index) => {
      const live = latestProducts.find(p => Number(p.id) === Number(item.id));
      const stock = itemStock(item);
      const available = isAvailable(item);
      const price = live ? Number(live.harga_jual) || 0 : Number(item.harga_jual) || 0;
      const unit = live?.satuan_jual || item.satuan_jual || 'satuan';
      const name = live?.nama_produk || item.nama_produk || 'Produk';
      const image = live?.url_foto || item.url_foto || '';
      const category = live ? productCategory(live) : 'BUMILOKA FARM';
      const amount = Math.max(0, Number(item.jumlah) || 0);
      const safeAmount = available ? Math.min(amount, stock) : 0;
      const subtotal = price * safeAmount;
      if (available) { total += subtotal; validQty += safeAmount; } else unavailableCount++;
      const lineClass = available ? 'cart-line' : 'cart-line unavailable';
      let stockText = !stockChecked ? 'Stok akan diperiksa…' : available ? `Tersedia ${number(stock)} ${escapeHTML(live?.satuan_stok || unit)}` : 'Stok habis atau produk tidak lagi tersedia';
      if (available && amount > stock) stockText = `Stok berubah. Maksimal ${number(stock)} ${escapeHTML(live?.satuan_stok || unit)}`;
      return `<article class="${lineClass}" data-cart-line="${Number(item.id)}" style="animation-delay:${Math.min(index * 55, 330)}ms">
        <a href="/produk/${encodeURIComponent(Number(item.id))}" aria-label="Lihat detail ${escapeHTML(name)}">${productImage({ ...item, nama_produk: name, url_foto: image })}</a>
        <div class="cart-product-info"><div class="cart-product-category">${escapeHTML(category)}</div><h3 class="cart-product-name"><a href="/produk/${encodeURIComponent(Number(item.id))}">${escapeHTML(name)}</a></h3><div><span class="cart-product-price">${rupiah(price)}</span> <span class="cart-product-unit">/ ${escapeHTML(unit)}</span></div>
          <div class="cart-product-stock ${!available ? 'unavailable' : amount > stock ? 'warning' : ''}">${stockText}</div>
          <div class="cart-line-actions"><div class="quantity-control" aria-label="Jumlah ${escapeHTML(name)}"><button type="button" data-decrease="${Number(item.id)}" aria-label="Kurangi jumlah" ${amount <= 1 || !available ? 'disabled' : ''}>−</button><output>${number(amount)}</output><button type="button" data-increase="${Number(item.id)}" aria-label="Tambah jumlah" ${!available || amount >= stock ? 'disabled' : ''}>+</button></div><button type="button" class="remove-cart-item" data-remove="${Number(item.id)}">Hapus</button></div>
        </div>
        <div class="cart-line-subtotal"><small>Subtotal</small><strong>${rupiah(subtotal)}</strong></div>
      </article>`;
    }).join('');

    summaryKinds.textContent = String(items.length);
    summaryQuantity.textContent = number(validQty);
    summaryTotal.textContent = rupiah(total);
    checkoutButton.disabled = !stockChecked || !items.length || validQty <= 0 || unavailableCount > 0 || items.some(item => Number(item.jumlah) > itemStock(item));
    if (unavailableCount > 0) setNotice(`${unavailableCount} produk tidak tersedia lagi. Hapus produk tersebut dari keranjang untuk melanjutkan.`);
    else if (stockChecked && items.some(item => Number(item.jumlah) > itemStock(item))) setNotice('Ada jumlah yang melebihi stok terbaru. Kurangi jumlah produk sebelum melanjutkan.');
    else if (stockChecked) setNotice('Stok dan harga sudah diperbarui dari katalog.');
  }

  function updateQuantity(id, delta) {
    const items = getItems();
    const item = items.find(row => Number(row.id) === Number(id));
    if (!item) return;
    const stock = itemStock(item);
    if (delta > 0 && stockChecked && Number(item.jumlah) + delta > stock) {
      api.tampilkanToast('Jumlah sudah mencapai stok yang tersedia.');
      return;
    }
    const next = Number(item.jumlah) + delta;
    if (next < 1) return;
    item.jumlah = next;
    const live = latestProducts.find(p => Number(p.id) === Number(id));
    if (live) Object.assign(item, { nama_produk: live.nama_produk, harga_jual: Number(live.harga_jual) || 0, satuan_jual: live.satuan_jual || '', stok_tersedia: Number(live.stok_tersedia) || 0, url_foto: live.url_foto || '' });
    api.simpanKeranjang(items);
  }

  itemsBox.addEventListener('click', event => {
    const decrease = event.target.closest('[data-decrease]');
    const increase = event.target.closest('[data-increase]');
    const remove = event.target.closest('[data-remove]');
    if (decrease) updateQuantity(decrease.dataset.decrease, -1);
    if (increase) updateQuantity(increase.dataset.increase, 1);
    if (remove) {
      const id = Number(remove.dataset.remove);
      api.simpanKeranjang(getItems().filter(item => Number(item.id) !== id));
      api.tampilkanToast('Produk dihapus dari keranjang.');
    }
  });

  checkoutButton.addEventListener('click', () => {
    if (checkoutButton.disabled) return;
    window.location.href = '/checkout';
  });
  document.addEventListener('bumiloka:keranjang-berubah', render);

  async function validateCart() {
    try {
      const response = await fetch('/api/katalog', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const json = await response.json();
      if (!response.ok || json.status !== 'berhasil' || !Array.isArray(json.data)) throw new Error(json.pesan || 'Respons katalog tidak valid.');
      latestProducts = json.data;
      stockChecked = true;
      const current = getItems();
      current.forEach(item => {
        const live = latestProducts.find(p => Number(p.id) === Number(item.id));
        if (!live) return;
        item.nama_produk = live.nama_produk;
        item.harga_jual = Number(live.harga_jual) || 0;
        item.satuan_jual = live.satuan_jual || '';
        item.stok_tersedia = Math.max(0, Number(live.stok_tersedia) || 0);
        item.url_foto = live.url_foto || '';
        if (item.stok_tersedia > 0 && Number(item.jumlah) > item.stok_tersedia) item.jumlah = item.stok_tersedia;
      });
      api.simpanKeranjang(current);
    } catch (error) {
      console.error('Gagal memeriksa stok keranjang:', error);
      stockChecked = false;
      render();
      setNotice('Katalog belum dapat diperiksa. Periksa koneksi lalu muat ulang halaman sebelum checkout.');
      checkoutButton.disabled = true;
    }
  }

  render();
  validateCart();
})();
