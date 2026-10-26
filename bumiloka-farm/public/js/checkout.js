(function () {
  'use strict';

  const api = window.BumiLoka;
  const form = document.getElementById('checkoutForm');
  const itemsBox = document.getElementById('checkoutItems');
  const countEl = document.getElementById('checkoutItemCount');
  const totalEl = document.getElementById('checkoutTotal');
  const submitButton = document.getElementById('sendOrderButton');
  const notice = document.getElementById('checkoutNotice');
  const nameInput = document.getElementById('customerName');
  const phoneInput = document.getElementById('customerPhone');
  const noteInput = document.getElementById('orderNote');

  if (!api || !form || !itemsBox) return;

  let products = [];
  let checked = false;
  let validCart = [];
  let total = 0;
  let sedangMengirim = false;

  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const formatNumber = value => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(Number(value) || 0);
  const rupiah = value => api.formatRupiah(value);

  function showNotice(message) {
    notice.textContent = message || '';
    notice.hidden = !message;
  }

  function cartItems() { return api.bacaKeranjang(); }

  function render() {
    const cart = cartItems();
    validCart = [];
    total = 0;
    if (!checked) {
      itemsBox.innerHTML = '<div class="checkout-loading">Memeriksa harga dan stok terbaru...</div>';
      countEl.textContent = 'Memeriksa produk...';
      totalEl.textContent = rupiah(0);
      submitButton.disabled = true;
      return;
    }
    if (!cart.length) {
      itemsBox.innerHTML = '<div class="checkout-empty"><h3>Keranjang masih kosong</h3><p>Pilih produk terlebih dahulu sebelum checkout.</p><a class="button button-primary" href="/katalog">Jelajahi katalog</a></div>';
      countEl.textContent = '0 produk';
      totalEl.textContent = rupiah(0);
      submitButton.disabled = true;
      return;
    }

    const missing = [];
    itemsBox.innerHTML = cart.map(item => {
      const product = products.find(p => Number(p.id) === Number(item.id));
      const qty = Math.max(0, Number(item.jumlah) || 0);
      if (!product || Number(product.stok_tersedia) <= 0) {
        missing.push(item.nama_produk || 'Satu produk');
        return `<article class="checkout-item checkout-item-unavailable"><div class="checkout-item-placeholder">!</div><div class="checkout-item-info"><strong>${escapeHTML(item.nama_produk || 'Produk tidak tersedia')}</strong><small>Produk habis atau tidak lagi tersedia. Hapus dari keranjang untuk melanjutkan.</small></div><a href="/keranjang" class="checkout-item-change">Ubah</a></article>`;
      }
      const stock = Math.max(0, Number(product.stok_tersedia) || 0);
      const unit = product.satuan_jual || 'satuan';
      // Untuk paket berbasis kg, stok katalog disimpan dalam kg.
      const stockNeeded = unit === product.satuan_stok ? qty : (unit === 'paket' && product.satuan_stok === 'kg' && Number(product.berat_paket_kg) > 0 ? qty * Number(product.berat_paket_kg) : qty);
      if (stockNeeded > stock + 0.000001) missing.push(`${product.nama_produk}: jumlah melebihi stok`);
      const price = Math.max(0, Number(product.harga_jual) || 0);
      const subtotal = price * qty;
      total += subtotal;
      validCart.push({ id: Number(product.id), nama_produk: product.nama_produk, jumlah: qty, harga_jual: price, satuan_jual: unit, stok_tersedia: stock, url_foto: product.url_foto || '', valid: qty > 0 && stockNeeded <= stock + 0.000001 });
      const image = /^https?:\/\//i.test(String(product.url_foto || '')) ? `<img src="${escapeHTML(product.url_foto)}" alt="${escapeHTML(product.nama_produk)}" loading="lazy">` : '<span aria-hidden="true">✳</span>';
      return `<article class="checkout-item"><div class="checkout-item-image">${image}</div><div class="checkout-item-info"><strong>${escapeHTML(product.nama_produk)}</strong><small>${rupiah(price)} / ${escapeHTML(unit)} · ${formatNumber(qty)} ${escapeHTML(unit)}</small>${stockNeeded > stock + 0.000001 ? `<small class="checkout-stock-warning">Stok tidak mencukupi. Ubah jumlah di keranjang.</small>` : ''}</div><strong class="checkout-item-subtotal">${rupiah(subtotal)}</strong></article>`;
    }).join('');

    countEl.textContent = `${cart.length} jenis produk · ${formatNumber(cart.reduce((sum, item) => sum + Number(item.jumlah || 0), 0))} item`;
    totalEl.textContent = rupiah(total);
    const cartValid = validCart.length === cart.length && validCart.every(item => item.valid) && missing.length === 0;
    submitButton.disabled = !cartValid || sedangMengirim;
    if (missing.length) showNotice('Ada produk yang habis atau jumlahnya melebihi stok. Kembali ke keranjang untuk memperbaikinya.');
    else if (!sedangMengirim) showNotice('Harga dan stok telah diperiksa dari katalog terbaru. Stok akan diperiksa kembali saat permintaan disimpan.');
  }

  async function validateCart() {
    checked = false;
    render();
    try {
      const response = await fetch('/api/katalog', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const json = await response.json();
      if (!response.ok || json.status !== 'berhasil' || !Array.isArray(json.data)) throw new Error(json.pesan || 'Respons katalog tidak valid.');
      products = json.data;
      const cart = cartItems();
      const updated = cart.map(item => {
        const product = products.find(p => Number(p.id) === Number(item.id));
        if (!product) return item;
        return { ...item, nama_produk: product.nama_produk, harga_jual: Number(product.harga_jual) || 0, satuan_jual: product.satuan_jual || '', stok_tersedia: Number(product.stok_tersedia) || 0, url_foto: product.url_foto || '' };
      });
      api.simpanKeranjang(updated);
      checked = true;
      render();
    } catch (error) {
      console.error('Gagal memeriksa katalog untuk checkout:', error);
      checked = false;
      render();
      showNotice('Harga dan stok belum bisa diperiksa. Periksa koneksi lalu muat ulang halaman.');
    }
  }

  function normalisasiNomor(nomor) {
    let hasil = String(nomor || '').replace(/\D/g, '');
    if (hasil.startsWith('0')) hasil = '62' + hasil.slice(1);
    return hasil;
  }

  function buatKunciCheckout() {
    const keyName = 'bumiloka_checkout_idempotensi';
    let key = sessionStorage.getItem(keyName);
    if (!key) {
      key = (window.crypto && typeof window.crypto.randomUUID === 'function')
        ? window.crypto.randomUUID()
        : `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(keyName, key);
    }
    return key;
  }

  function buatPesanWhatsApp(name, customerPhone, note, kodePermintaan, items, totalPesanan) {
    const lines = [
      '*PERMINTAAN PESANAN - BUMILOKA FARM*',
      '',
      `Kode permintaan: ${kodePermintaan}`,
      `Nama: ${name}`,
      `WhatsApp pelanggan: ${customerPhone}`,
      '',
      '*Rincian produk:*'
    ];
    items.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.nama_produk}`);
      lines.push(`   ${formatNumber(item.jumlah)} ${item.satuan_jual} x ${rupiah(item.harga_jual)} = ${rupiah(item.jumlah * item.harga_jual)}`);
    });
    lines.push('', `*Perkiraan total harga produk: ${rupiah(totalPesanan)}*`, 'Biaya pengiriman/biaya tambahan (jika ada) dikonfirmasi terpisah.', '', 'Permintaan ini menunggu konfirmasi pemilik BumiLoka Farm.');
    if (note) lines.push('', `Catatan: ${note}`);
    lines.push('', 'Mohon periksa permintaan dengan kode tersebut dan konfirmasi ketersediaannya.');
    return lines.join('\n');
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sedangMengirim) return;
    if (!checked || submitButton.disabled) {
      showNotice('Periksa kembali stok dan jumlah produk sebelum melanjutkan.');
      return;
    }

    const name = nameInput.value.trim();
    const customerPhone = phoneInput.value.trim();
    const note = noteInput.value.trim();
    const phoneDigits = customerPhone.replace(/\D/g, '');
    if (name.length < 2 || name.length > 120) { showNotice('Masukkan nama pelanggan minimal 2 karakter.'); nameInput.focus(); return; }
    if (phoneDigits.length < 8 || phoneDigits.length > 20) { showNotice('Masukkan nomor WhatsApp pelanggan yang valid.'); phoneInput.focus(); return; }
    if (validCart.length !== cartItems().length || !validCart.every(item => item.valid)) { showNotice('Ada produk yang perlu diperbaiki di keranjang.'); return; }

    // Buka tab kosong saat masih berada di aksi klik agar tidak diblokir setelah fetch selesai.
    const whatsappTab = window.open('about:blank', '_blank');
    if (!whatsappTab) {
      showNotice('Browser memblokir tab WhatsApp. Izinkan pop-up lalu tekan checkout kembali. Permintaan belum dikirim.');
      return;
    }
    try { whatsappTab.opener = null; } catch (_) {}

    sedangMengirim = true;
    submitButton.disabled = true;
    submitButton.textContent = 'Menyimpan permintaan...';
    showNotice('Menyimpan permintaan pesanan ke database. Jangan tutup halaman ini.');

    try {
      const settingsResponse = await fetch('/api/pengaturan-usaha/publik', { headers: { Accept: 'application/json' } });
      const settingsJson = settingsResponse.ok ? await settingsResponse.json() : null;
      const nomorUsaha = settingsJson && settingsJson.status === 'berhasil' ? settingsJson.data?.nomor_whatsapp : '';
      const destination = normalisasiNomor(nomorUsaha || '');
      if (!destination || destination.length < 10 || destination.length > 15) {
        whatsappTab.close();
        showNotice('Nomor WhatsApp usaha belum diatur atau formatnya tidak valid. Minta admin memperbaikinya di Pengaturan Usaha.');
        return;
      }
      const response = await fetch('/api/permintaan-pesanan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          kunci_idempotensi: buatKunciCheckout(),
          nama_pelanggan: name,
          whatsapp_pelanggan: customerPhone,
          catatan: note,
          items: validCart.map(item => ({ produk_id: item.id, jumlah: item.jumlah }))
        })
      });
      const json = await response.json();
      if (!response.ok || json.status !== 'berhasil' || !json.data || !json.data.kode_permintaan) {
        throw new Error(json.pesan || 'Permintaan belum dapat disimpan.');
      }

      const requestItems = (Array.isArray(json.data.item_pesanan) ? json.data.item_pesanan : []).map(item => ({
        nama_produk: item.nama_produk, jumlah: Number(item.jumlah), satuan_jual: item.satuan, harga_jual: Number(item.harga_satuan)
      }));
      if (!requestItems.length) throw new Error('Permintaan tersimpan, tetapi rincian pesanan tidak dapat dibaca. Hubungi pemilik dengan kode permintaan yang tersedia.');
      const message = buatPesanWhatsApp(name, customerPhone, note, json.data.kode_permintaan, requestItems, Number(json.data.total_perkiraan));
      whatsappTab.location.href = `https://wa.me/${destination}?text=${encodeURIComponent(message)}`;
      api.simpanKeranjang([]);
      if (typeof api.perbaruiJumlahKeranjang === 'function') api.perbaruiJumlahKeranjang();
      sessionStorage.removeItem('bumiloka_checkout_idempotensi');
      itemsBox.innerHTML = `<div class="checkout-empty"><h3>Permintaan berhasil dicatat</h3><p>Kode permintaan: <strong>${escapeHTML(json.data.kode_permintaan)}</strong></p><p>Lanjutkan di WhatsApp untuk mengirim pesan kepada BumiLoka Farm. Permintaan belum diterima pemilik dan belum mengurangi stok.</p><a class="button button-primary" href="/katalog">Kembali ke katalog</a></div>`;
      countEl.textContent = 'Permintaan tercatat';
      totalEl.textContent = rupiah(json.data.total_perkiraan);
      showNotice(`Permintaan ${json.data.kode_permintaan} sudah tersimpan. WhatsApp dibuka untuk melanjutkan komunikasi.`);
      submitButton.textContent = 'Permintaan tersimpan';
      submitButton.disabled = true;
    } catch (error) {
      console.error('Gagal menyimpan permintaan checkout:', error);
      try { whatsappTab.close(); } catch (_) {}
      sedangMengirim = false;
      submitButton.textContent = 'Lanjutkan ke WhatsApp ↗';
      submitButton.disabled = false;
      showNotice(`${error.message || 'Permintaan belum dapat disimpan.'} Keranjang tetap tersimpan. Periksa koneksi dan coba lagi.`);
      render();
    }
  });

  validateCart();
})();
