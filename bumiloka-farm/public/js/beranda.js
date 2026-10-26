(function () {
  'use strict';
  // Halaman Beranda. Fungsi bersama (kartu produk, keranjang, identitas usaha,
  // menu aktif) ada di publik.js agar tidak ditulis dua kali.
  const BL = window.BumiLoka;
  const perkebunanGrid = document.getElementById('perkebunanGrid');
  const peternakanGrid = document.getElementById('peternakanGrid');
  if (!BL || !perkebunanGrid || !peternakanGrid) return;

  const bidang = produk => String(produk.kategori || '').toLowerCase() === 'peternakan' ? 'peternakan' : 'perkebunan';
  let semuaProduk = [];

  function tampilkanKosong(el, judul, deskripsi) {
    el.innerHTML = `<div class="shelf-empty"><span>✳</span><strong>${judul}</strong><p>${deskripsi}</p></div>`;
  }

  function isiRak(el, daftar, judulKosong) {
    if (!daftar.length) return tampilkanKosong(el, judulKosong, 'Produk akan muncul di sini saat stok siap jual tersedia.');
    el.innerHTML = daftar.map((p, i) => BL.kartuProduk(p, i)).join('');
    BL.pasangTombolKeranjang(el, semuaProduk);
  }

  async function muatProduk() {
    try {
      const response = await fetch('/api/katalog', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const json = await response.json();
      if (!response.ok || json.status !== 'berhasil' || !Array.isArray(json.data)) throw new Error(json.pesan || 'Respons katalog tidak valid.');
      semuaProduk = json.data;
      isiRak(perkebunanGrid, semuaProduk.filter(p => bidang(p) === 'perkebunan'), 'Belum ada hasil perkebunan');
      isiRak(peternakanGrid, semuaProduk.filter(p => bidang(p) === 'peternakan'), 'Belum ada hasil peternakan');
    } catch (error) {
      console.error('Gagal memuat produk publik:', error);
      tampilkanKosong(perkebunanGrid, 'Katalog belum dapat dimuat', 'Periksa koneksi lalu muat ulang halaman.');
      tampilkanKosong(peternakanGrid, 'Katalog belum dapat dimuat', 'Periksa koneksi lalu muat ulang halaman.');
    }
  }

  // Tombol geser rak produk
  document.querySelectorAll('[data-scroll-shelf]').forEach(button => button.addEventListener('click', () => {
    const target = document.getElementById(button.dataset.scrollShelf === 'perkebunan' ? 'perkebunanGrid' : 'peternakanGrid');
    if (target) target.scrollBy({ left: Number(button.dataset.direction || 1) * Math.max(260, target.clientWidth * .8), behavior: 'smooth' });
  }));

  // Animasi masuk (menghormati reduced motion)
  const elemenReveal = document.querySelectorAll('.reveal-on-scroll');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), { threshold: .16 });
    elemenReveal.forEach(el => observer.observe(el));
  } else elemenReveal.forEach(el => el.classList.add('is-visible'));

  muatProduk().finally(() => document.dispatchEvent(new Event('bumiloka:tata-letak-berubah')));
})();
