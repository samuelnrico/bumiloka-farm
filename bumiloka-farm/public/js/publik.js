(function () {
  'use strict';
  const CART_KEY = 'bumiloka_keranjang_v1';

  function bacaKeranjang() {
    try {
      const data = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      return Array.isArray(data) ? data.filter(item => item && Number.isInteger(Number(item.id)) && Number(item.jumlah) > 0) : [];
    } catch (_) { return []; }
  }

  function simpanKeranjang(data) {
    localStorage.setItem(CART_KEY, JSON.stringify(data));
    perbaruiJumlahKeranjang();
    document.dispatchEvent(new CustomEvent('bumiloka:keranjang-berubah', { detail: { keranjang: data } }));
  }

  function perbaruiJumlahKeranjang() {
    const jumlah = bacaKeranjang().reduce((total, item) => total + Number(item.jumlah || 0), 0);
    document.querySelectorAll('#cartCount, [data-cart-count]').forEach(el => { el.textContent = jumlah > 99 ? '99+' : String(jumlah); });
  }

  function tambahKeKeranjang(produk, jumlah) {
    const data = bacaKeranjang();
    const id = Number(produk.id);
    const banyak = Math.max(1, Number(jumlah) || 1);
    const item = data.find(row => Number(row.id) === id);
    if (item) {
      item.jumlah = Number(item.jumlah) + banyak;
      item.nama_produk = produk.nama_produk;
      item.harga_jual = Number(produk.harga_jual) || 0;
      item.satuan_jual = produk.satuan_jual || '';
      item.stok_tersedia = Number(produk.stok_tersedia) || 0;
      item.url_foto = produk.url_foto || '';
    } else {
      data.push({ id, nama_produk: produk.nama_produk, harga_jual: Number(produk.harga_jual) || 0, satuan_jual: produk.satuan_jual || '', jumlah: banyak, stok_tersedia: Number(produk.stok_tersedia) || 0, url_foto: produk.url_foto || '' });
    }
    if (item && Number(item.jumlah) > Number(item.stok_tersedia)) {
      item.jumlah = Number(item.stok_tersedia);
      simpanKeranjang(data);
      tampilkanToast('Jumlah disesuaikan dengan stok yang tersedia.');
      return false;
    }
    if (Number(produk.stok_tersedia) > 0 && banyak > Number(produk.stok_tersedia)) {
      const baru = data.find(row => Number(row.id) === id);
      if (baru) baru.jumlah = Number(produk.stok_tersedia);
      simpanKeranjang(data);
      tampilkanToast('Jumlah disesuaikan dengan stok yang tersedia.');
      return false;
    }
    simpanKeranjang(data);
    tampilkanToast(produk.nama_produk + ' ditambahkan ke keranjang.');
    return true;
  }

  let toastTimer;
  function tampilkanToast(pesan) {
    const toast = document.getElementById('siteToast');
    if (!toast) return;
    toast.textContent = pesan;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }


  // ------------------------------------------------------------------
  // Helper bersama (dipakai beranda & katalog agar tidak ada kode ganda)
  // ------------------------------------------------------------------
  const aman = teks => String(teks ?? '').replace(/[&<>"']/g, k => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[k]);
  const formatRupiah = nilai => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(nilai) || 0);
  const formatJumlah = nilai => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(Math.max(0, Number(nilai) || 0));
  const PLACEHOLDER = '<div class="product-placeholder" aria-label="Foto produk belum tersedia"><span>✳</span></div>';

  function gambarProduk(produk) {
    const url = String(produk.url_foto || '').trim();
    const sah = /^https?:\/\//i.test(url) || /^\/uploads\/produk\/[a-zA-Z0-9._-]+$/.test(url);
    if (!sah) return PLACEHOLDER;
    return `<img src="${aman(url)}" alt="${aman(produk.nama_produk)}" loading="lazy" onerror="this.outerHTML=this.dataset.fallback" data-fallback="${aman(PLACEHOLDER)}">`;
  }

  // Satu-satunya template kartu produk untuk seluruh situs publik.
  function kartuProduk(produk, index) {
    const stok = Math.max(0, Number(produk.stok_tersedia) || 0);
    const url = `/produk/${encodeURIComponent(Number(produk.id))}`;
    const nama = aman(produk.nama_produk);
    const kategori = aman(String(produk.kategori || produk.jenis_produk || 'Produk').replaceAll('_', ' '));
    const jenis = aman(String(produk.jenis_produk || 'BumiLoka Farm').replaceAll('_', ' '));
    const deskripsi = String(produk.deskripsi || '').trim() || 'Produk tersedia sesuai stok siap jual.';
    return `<article class="product-card" style="--card-index:${Math.min(index || 0, 10)}">
      <a class="product-card-image" href="${url}" aria-label="Lihat detail ${nama}">${gambarProduk(produk)}<span class="product-tag">${kategori}</span><span class="image-arrow" aria-hidden="true">↗</span></a>
      <div class="product-card-body"><span class="product-category">${jenis}</span><h3 class="product-name"><a href="${url}">${nama}</a></h3><p class="product-card-desc">${aman(deskripsi)}</p>
        <div class="product-card-price"><strong>${formatRupiah(produk.harga_jual)}</strong><span>/${aman(produk.satuan_jual || 'satuan')}</span></div>
        <div class="product-card-stock"><i></i> Stok ${formatJumlah(stok)} ${aman(produk.satuan_stok || produk.satuan_jual || '')}</div>
        <div class="product-card-actions"><a href="${url}" class="product-detail-button">Detail produk</a><button class="product-add-button" type="button" data-add-product="${Number(produk.id)}" aria-label="Tambah ${nama} ke keranjang" ${stok <= 0 ? 'disabled' : ''}><span aria-hidden="true">＋</span> Tambah</button></div></div></article>`;
  }

  // Pasang tombol "Tambah" pada kartu di dalam elemen root.
  function pasangTombolKeranjang(root, daftarProduk) {
    root.querySelectorAll('[data-add-product]').forEach(button => button.addEventListener('click', () => {
      const produk = daftarProduk.find(item => Number(item.id) === Number(button.dataset.addProduct));
      if (!produk) return;
      tambahKeKeranjang(produk, 1);
      const labelAwal = button.innerHTML;
      button.classList.add('just-added');
      button.innerHTML = '<span aria-hidden="true">✓</span> Ditambahkan';
      button.disabled = true;
      window.setTimeout(() => { if (button.isConnected) { button.innerHTML = labelAwal; button.classList.remove('just-added'); button.disabled = false; } }, 1000);
    }));
  }

  // Identitas usaha (nama, slogan, logo, kontak) dari Pengaturan Usaha.
  // Dijalankan di SEMUA halaman publik sehingga header & footer selalu sama.
  async function muatIdentitasUsaha() {
    try {
      const response = await fetch('/api/pengaturan-usaha/publik', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) return;
      const json = await response.json();
      const data = json.data || json.pengaturan || json;
      const setTeks = (ids, nilai) => ids.forEach(id => { const el = document.getElementById(id); if (el && nilai) el.textContent = nilai; });
      const nama = data.nama_usaha || data.nama || 'BumiLoka Farm';
      setTeks(['namaUsahaHeader', 'namaUsahaFooter', 'namaUsahaCopyright'], nama);
      setTeks(['sloganUsahaHeader', 'sloganUsahaFooter'], data.slogan || data.deskripsi_singkat);

      const urlLogo = typeof data.url_logo === 'string' ? data.url_logo.trim() : '';
      ['logoUsahaHeader', 'logoUsahaFooter'].forEach(id => {
        const logo = document.getElementById(id);
        if (!logo) return;
        if (!urlLogo) { logo.hidden = true; logo.removeAttribute('src'); return; }
        logo.onload = () => { logo.hidden = false; };
        logo.onerror = () => { logo.hidden = true; logo.removeAttribute('src'); };
        logo.src = urlLogo;
      });

      const alamat = data.alamat || data.alamat_usaha;
      const elAlamat = document.getElementById('alamatUsahaFooter');
      if (alamat && elAlamat) elAlamat.textContent = alamat;

      const nomor = String(data.whatsapp || data.nomor_whatsapp || data.no_whatsapp || '').replace(/\D/g, '');
      const waLink = document.getElementById('footerWhatsapp');
      const waIkon = document.getElementById('footerWhatsappIcon');
      if (nomor) {
        [waLink, waIkon].forEach(el => { if (el) { el.href = `https://wa.me/${nomor}`; el.hidden = false; } });
        const teks = document.getElementById('footerContactText');
        if (teks) teks.textContent = 'Hubungi kami untuk menanyakan ketersediaan produk dan informasi pemesanan.';
      } else {
        if (waIkon) waIkon.hidden = true;
        if (waLink) waLink.addEventListener('click', e => { e.preventDefault(); tampilkanToast('Nomor WhatsApp usaha belum diatur.'); });
      }

      [['footerInstagram', data.instagram || data.url_instagram, 'https://www.instagram.com/'], ['footerFacebook', data.facebook || data.url_facebook, 'https://www.facebook.com/']].forEach(([id, nilai, cadangan]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.hidden = false;
        el.href = /^https:\/\//i.test(nilai || '') ? nilai : cadangan;
        el.target = '_blank';
        el.rel = 'noopener noreferrer';
      });
    } catch (error) { console.warn('Informasi usaha publik belum dapat dimuat:', error); }
  }

  const toggle = document.getElementById('mobileMenuToggle');
  const nav = document.getElementById('mainNav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const terbuka = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(terbuka));
      toggle.setAttribute('aria-label', terbuka ? 'Tutup navigasi' : 'Buka navigasi');
      document.body.classList.toggle('menu-open', terbuka);
    });
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
    }));
  }

  const header = document.getElementById('siteHeader');
  function headerScroll() { if (header) header.classList.toggle('scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', headerScroll, { passive: true });
  headerScroll();
  const year = document.getElementById('currentYear');
  if (year) year.textContent = new Date().getFullYear();
  perbaruiJumlahKeranjang();

  // Penanda menu aktif (scroll-spy) hanya di beranda; halaman lain menandai menunya di HTML.
  const diBeranda = window.location.pathname === '/' || window.location.pathname === '';
  if (diBeranda && nav) {
    const petaBagian = [['beranda', '/'], ['produk', '/#produk'], ['tentang', '/#tentang'], ['kontak', '/#kontak']]
      .map(([id, href]) => ({ id, href, element: document.getElementById(id), link: nav.querySelector(`.nav-link[href="${href}"]`) }))
      .filter(item => item.element && item.link);
    const tandai = aktif => petaBagian.forEach(item => {
      const cocok = item === aktif;
      item.link.classList.toggle('active', cocok);
      if (cocok) item.link.setAttribute('aria-current', 'page'); else item.link.removeAttribute('aria-current');
    });
    const perbaruiMenuAktif = () => {
      const garis = (header?.offsetHeight || 76) + 80;
      let aktif = petaBagian[0];
      petaBagian.forEach(item => { if (item.element.getBoundingClientRect().top <= garis) aktif = item; });
      // Footer (Kontak) pendek: saat sudah mentok di bawah halaman, anggap Kontak aktif.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 48) aktif = petaBagian[petaBagian.length - 1];
      tandai(aktif);
    };
    // Setelah klik menu, tahan penanda sampai animasi scroll selesai agar tidak berkedip.
    let kunci = false, timerKunci;
    window.addEventListener('scroll', () => {
      if (kunci) { clearTimeout(timerKunci); timerKunci = setTimeout(() => { kunci = false; perbaruiMenuAktif(); }, 160); return; }
      requestAnimationFrame(perbaruiMenuAktif);
    }, { passive: true });
    nav.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', event => {
      const item = petaBagian.find(x => x.link === link);
      if (!item) return;
      event.preventDefault();
      kunci = true; tandai(item);
      clearTimeout(timerKunci); timerKunci = setTimeout(() => { kunci = false; perbaruiMenuAktif(); }, 900);
      if (item.id === 'beranda') { window.scrollTo({ top: 0, behavior: 'smooth' }); history.replaceState(null, '', '/'); }
      else { item.element.scrollIntoView({ behavior: 'smooth', block: 'start' }); history.replaceState(null, '', '/#' + item.id); }
    }));
    // Tiba dari halaman lain lewat /#tentang dll: tinggi halaman masih berubah saat produk & gambar dimuat,
    // sehingga lompatan awal browser bisa meleset. Lompat ulang sampai pengunjung mulai menggulir sendiri.
    let lompatanAwal = Boolean(location.hash);
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(nama => window.addEventListener(nama, () => { lompatanAwal = false; }, { passive: true, once: true }));
    const lompatKeHash = () => {
      if (!lompatanAwal) return;
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) { document.documentElement.style.scrollBehavior = 'auto'; target.scrollIntoView({ block: 'start' }); document.documentElement.style.scrollBehavior = ''; }
      perbaruiMenuAktif();
    };
    document.addEventListener('bumiloka:tata-letak-berubah', lompatKeHash);
    window.addEventListener('load', lompatKeHash);
    window.addEventListener('resize', perbaruiMenuAktif, { passive: true });
    window.addEventListener('hashchange', perbaruiMenuAktif);
    window.addEventListener('load', () => setTimeout(perbaruiMenuAktif, 150));
    perbaruiMenuAktif();
  }

  muatIdentitasUsaha();

  window.BumiLoka = {
    CART_KEY,
    bacaKeranjang,
    simpanKeranjang,
    tambahKeKeranjang,
    perbaruiJumlahKeranjang,
    tampilkanToast,
    formatRupiah,
    formatJumlah,
    aman,
    kartuProduk,
    pasangTombolKeranjang
  };
})();
