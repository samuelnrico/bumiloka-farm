const el={
 pesan:document.getElementById('pesan-global'),statProduk:document.getElementById('stat-produk'),statTersedia:document.getElementById('stat-tersedia'),statBahan:document.getElementById('stat-bahan'),statMenipis:document.getElementById('stat-menipis'),
 cariProduk:document.getElementById('cari-produk'),kategori:document.getElementById('filter-kategori'),statusStok:document.getElementById('filter-stok'),statusProduk:document.getElementById('status-produk'),produk:document.getElementById('daftar-produk'),
 cariBahan:document.getElementById('cari-bahan'),kategoriBahan:document.getElementById('filter-kategori-bahan'),statusBahanFilter:document.getElementById('filter-status-bahan'),statusBahan:document.getElementById('status-bahan'),bahan:document.getElementById('daftar-bahan'),
 cariRiwayat:document.getElementById('cari-pergerakan'),statusRiwayat:document.getElementById('status-pergerakan'),riwayat:document.getElementById('daftar-pergerakan'),muat:document.getElementById('tombol-muat-ulang')};
let produk=[],bahan=[],riwayat=[];
const angka=v=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(Number(v)||0);
const uang=v=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(v)||0);
function tanggal(v){if(!v)return '-';const d=new Date(v);return Number.isNaN(d.getTime())?String(v).slice(0,10):new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d)}
function sel(v){const td=document.createElement('td');td.textContent=v??'-';return td}
function badge(label,cls){const s=document.createElement('span');s.className=`badge ${cls}`;s.textContent=label;return s}
function pesan(t,error=false){el.pesan.textContent=t;el.pesan.hidden=!t;el.pesan.classList.toggle('error',error)}
async function api(url){const r=await fetch(url,{credentials:'same-origin'});const d=await r.json().catch(()=>({}));if(r.status===401){location.href='/login';throw Error('Sesi login berakhir.')}if(!r.ok||d.status!=='berhasil')throw Error(d.pesan||'Data gagal dimuat.');return d}
function renderProduk(){const q=el.cariProduk.value.trim().toLocaleLowerCase('id-ID'),k=el.kategori.value,s=el.statusStok.value;const list=produk.filter(x=>(x.nama_produk||'').toLocaleLowerCase('id-ID').includes(q)&&(k==='semua'||x.kategori===k)&&(s==='semua'||(s==='tersedia'?Number(x.stok_tersedia)>0:Number(x.stok_tersedia)<=0)));el.produk.replaceChildren();el.statusProduk.textContent=`${list.length} dari ${produk.length} produk ditampilkan.`;if(!list.length){const tr=document.createElement('tr'),td=sel('Tidak ada produk yang sesuai.');td.colSpan=4;tr.append(td);el.produk.append(tr);return}for(const x of list){const tr=document.createElement('tr'),td=sel(x.nama_produk),status=Number(x.stok_tersedia)>0?'Tersedia':'Habis';td.className='nama-item';tr.append(td,sel(x.kategori==='perkebunan'?'Perkebunan':'Peternakan'),sel(`${angka(x.stok_tersedia)} ${x.satuan_stok||''}`.trim()),sel(''));tr.lastChild.replaceChildren(badge(!x.aktif?'Produk nonaktif':status,!x.aktif?'netral':status==='Tersedia'?'aman':'bahaya'));el.produk.append(tr)}}
function kategoriNama(k){return ({bibit:'Bibit',pupuk:'Pupuk',pestisida:'Pestisida',pakan:'Pakan',obat_ternak:'Obat ternak',kemasan:'Kemasan',perlengkapan:'Perlengkapan',lainnya:'Lainnya'})[k]||k||'-'}
function renderBahan(){const q=el.cariBahan.value.trim().toLocaleLowerCase('id-ID'),k=el.kategoriBahan.value,s=el.statusBahanFilter.value;const list=bahan.filter(x=>{const stok=Number(x.stok_tersedia),min=Number(x.stok_minimum);const status=stok<=0?'habis':stok<=min?'menipis':'aman';return (x.nama_barang||'').toLocaleLowerCase('id-ID').includes(q)&&(k==='semua'||x.kategori===k)&&(s==='semua'||s===status)});el.bahan.replaceChildren();el.statusBahan.textContent=`${list.length} dari ${bahan.length} jenis bahan ditampilkan.`;if(!list.length){const tr=document.createElement('tr'),td=sel('Belum ada bahan terdaftar atau tidak ada yang sesuai.');td.colSpan=5;tr.append(td);el.bahan.append(tr);return}for(const x of list){const stok=Number(x.stok_tersedia),min=Number(x.stok_minimum),status=stok<=0?'Habis':stok<=min?'Menipis':'Aman',tr=document.createElement('tr'),td=sel(x.nama_barang);td.className='nama-item';tr.append(td,sel(kategoriNama(x.kategori)),sel(`${angka(stok)} ${x.satuan||''}`.trim()),sel(`${angka(min)} ${x.satuan||''}`.trim()),sel(''));tr.lastChild.replaceChildren(badge(status,status==='Aman'?'aman':status==='Menipis'?'peringatan':'bahaya'));el.bahan.append(tr)}}
function namaPergerakan(v){return ({masuk:'Stok masuk',keluar:'Stok keluar',koreksi_masuk:'Penyesuaian tambah',koreksi_keluar:'Penyesuaian kurang'})[v]||v||'-'}
function renderRiwayat(){const q=el.cariRiwayat.value.trim().toLocaleLowerCase('id-ID'),list=riwayat.filter(x=>[x.nama_produk,x.jenis_pergerakan,x.catatan,x.kode_penjualan].filter(Boolean).join(' ').toLocaleLowerCase('id-ID').includes(q));el.riwayat.replaceChildren();el.statusRiwayat.textContent=`${list.length} dari maksimal 200 perubahan terbaru ditampilkan.`;if(!list.length){const tr=document.createElement('tr'),td=sel('Belum ada perubahan stok produk atau pencarian tidak ditemukan.');td.colSpan=5;tr.append(td);el.riwayat.append(tr);return}for(const x of list){const keluar=['keluar','koreksi_keluar'].includes(x.jenis_pergerakan),ket=[x.catatan,x.kode_penjualan?`Penjualan ${x.kode_penjualan}`:null].filter(Boolean).join(' · ')||'-',tr=document.createElement('tr');tr.append(sel(tanggal(x.tanggal_pergerakan)),sel(x.nama_produk),sel(namaPergerakan(x.jenis_pergerakan)),sel(`${keluar?'−':'+'}${angka(x.jumlah)} ${x.satuan_stok||''}`.trim()),sel(ket));el.riwayat.append(tr)}}
function tampilkanErrorTabel(tbody, kolom, teks) {
 const tr=document.createElement('tr'),td=sel(teks);td.colSpan=kolom;tr.append(td);tbody.replaceChildren(tr);
}
async function muat(){
 el.muat.disabled=true;pesan('Memuat persediaan...');
 const tugas=await Promise.allSettled([
  api('/api/persediaan/ringkasan'),
  api('/api/barang-operasional'),
  api('/api/persediaan/pergerakan')
 ]);
 const masalah=[];
 if(tugas[0].status==='fulfilled'){
  produk=Array.isArray(tugas[0].value.data)?tugas[0].value.data:[];
  el.statProduk.textContent=angka(produk.length);el.statTersedia.textContent=angka(produk.filter(x=>Number(x.stok_tersedia)>0).length);renderProduk();
 }else{
  produk=[];el.statProduk.textContent='-';el.statTersedia.textContent='-';el.statusProduk.textContent=`Gagal memuat stok produk: ${tugas[0].reason.message}`;tampilkanErrorTabel(el.produk,4,tugas[0].reason.message);masalah.push('stok produk');
 }
 if(tugas[1].status==='fulfilled'){
  bahan=Array.isArray(tugas[1].value.data)?tugas[1].value.data:[];
  el.statBahan.textContent=angka(bahan.length);el.statMenipis.textContent=angka(bahan.filter(x=>Number(x.stok_tersedia)<=Number(x.stok_minimum)).length);renderBahan();
 }else{
  bahan=[];el.statBahan.textContent='-';el.statMenipis.textContent='-';el.statusBahan.textContent=`Gagal memuat stok bahan: ${tugas[1].reason.message}`;tampilkanErrorTabel(el.bahan,5,tugas[1].reason.message);masalah.push('stok bahan');
 }
 if(tugas[2].status==='fulfilled'){
  riwayat=Array.isArray(tugas[2].value.data)?tugas[2].value.data:[];renderRiwayat();
 }else{
  riwayat=[];el.statusRiwayat.textContent=`Gagal memuat riwayat: ${tugas[2].reason.message}`;tampilkanErrorTabel(el.riwayat,5,tugas[2].reason.message);masalah.push('riwayat stok');
 }
 if(masalah.length){
  try{const d=await api('/api/persediaan/diagnostik');const hilang=d.tabel_belum_tersedia||[];pesan(`Sebagian data gagal dimuat (${masalah.join(', ')}). Database: ${d.database}. ${hilang.length?'Tabel/view belum tersedia: '+hilang.join(', ')+'. Periksa migrasi database.':'Tabel utama terdeteksi. Periksa pesan tiap bagian dan log server.'}`,true)}catch(e){pesan(`Sebagian data gagal dimuat (${masalah.join(', ')}). ${e.message}`,true)}
 }else{pesan('Persediaan berhasil diperbarui.');setTimeout(()=>el.pesan.hidden=true,2200)}
 el.muat.disabled=false;
}
[el.cariProduk,el.kategori,el.statusStok].forEach((x)=>x.addEventListener(x.tagName==='INPUT'?'input':'change',renderProduk));[el.cariBahan,el.kategoriBahan,el.statusBahanFilter].forEach(x=>x.addEventListener(x.tagName==='INPUT'?'input':'change',renderBahan));el.cariRiwayat.addEventListener('input',renderRiwayat);el.muat.addEventListener('click',muat);muat();