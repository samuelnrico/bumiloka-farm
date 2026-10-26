(() => {
  'use strict';
  const root = document.getElementById('notifikasi-pesanan');
  if (!root) return;
  const tombol = root.querySelector('[data-notifikasi-toggle]');
  const badge = root.querySelector('[data-notifikasi-badge]');
  const panel = root.querySelector('[data-notifikasi-panel]');
  const daftar = root.querySelector('[data-notifikasi-daftar]');
  const ringkasan = root.querySelector('[data-notifikasi-ringkasan]');
  const linkSemua = root.querySelector('[data-notifikasi-semua]');
  const endpoint = '/api/permintaan-pesanan/admin/notifikasi';
  let terbuka = false;
  let sedangMemuat = false;

  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const rupiah = value => new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0
  }).format(Number(value || 0));
  const tanggal = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
  };

  function render(data) {
    const jumlah = Math.max(0, Number(data?.jumlah) || 0);
    const terbaru = Array.isArray(data?.terbaru) ? data.terbaru : [];
    badge.textContent = jumlah > 99 ? '99+' : String(jumlah);
    badge.hidden = jumlah === 0;
    tombol.setAttribute('aria-label', jumlah ? `Notifikasi, ${jumlah} pesanan menunggu konfirmasi` : 'Notifikasi pesanan');
    ringkasan.textContent = jumlah === 0 ? 'Tidak ada pesanan yang menunggu konfirmasi.' : `${jumlah} pesanan menunggu konfirmasi.`;

    if (!terbaru.length) {
      daftar.innerHTML = '<div class="notif-empty">Belum ada permintaan baru.</div>';
      return;
    }
    daftar.innerHTML = terbaru.map(item => `
      <a class="notif-item" href="/permintaan-pesanan">
        <span class="notif-item-mark" aria-hidden="true"></span>
        <span class="notif-item-copy">
          <span class="notif-item-title">${escapeHTML(item.nama_pelanggan || 'Pelanggan')}</span>
          <span class="notif-item-meta">${escapeHTML(item.kode_permintaan || '')} · ${escapeHTML(tanggal(item.tanggal_permintaan))}</span>
          <span class="notif-item-total">${escapeHTML(rupiah(item.total_perkiraan))}</span>
        </span>
      </a>`).join('');
  }

  async function muatNotifikasi() {
    if (sedangMemuat || document.hidden) return;
    sedangMemuat = true;
    try {
      const response = await fetch(endpoint, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      if (response.status === 401) return;
      const json = await response.json();
      if (!response.ok || json.status !== 'berhasil') throw new Error('Notifikasi gagal dimuat');
      render(json.data);
    } catch (error) {
      // Notifikasi bersifat tambahan; kegagalannya tidak boleh mengganggu dashboard.
      console.warn('Notifikasi pesanan tidak dapat diperbarui.');
    } finally {
      sedangMemuat = false;
    }
  }

  function setTerbuka(value) {
    terbuka = Boolean(value);
    panel.hidden = !terbuka;
    tombol.setAttribute('aria-expanded', String(terbuka));
    if (terbuka) muatNotifikasi();
  }

  tombol.addEventListener('click', event => {
    event.stopPropagation();
    setTerbuka(!terbuka);
  });
  linkSemua.addEventListener('click', () => setTerbuka(false));
  document.addEventListener('click', event => {
    if (terbuka && !root.contains(event.target)) setTerbuka(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setTerbuka(false);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) muatNotifikasi();
  });

  muatNotifikasi();
  window.setInterval(muatNotifikasi, 30000);
})();
