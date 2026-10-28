# Barang Dapur

Pencatatan stok barang dapur: **satu backend** (Google Apps Script + Spreadsheet + Drive) dengan **dua frontend** dari kode UI yang sama —
halaman GAS (tetap seperti semula) dan **PWA di GitHub Pages** yang bisa dipasang di layar utama HP.

```
Frontend GAS   index.html + App.html + Styles.html ──google.script.run──┐
                                                                        ├─► Code.gs (logika) ─► Spreadsheet + Drive
Frontend PWA   app.js + api-shim.js ──fetch POST /exec + token──► Gateway.gs ┘
               (dibangun otomatis dari App.html + Styles.html oleh tools/build.js)
```
`api-shim.js` meniru `google.script.run` lewat `fetch()`, jadi kode aplikasi **tidak ditulis dua kali**. Mengubah UI cukup di `gas/` lalu build.

## 1. Isi repo
| Folder | Isi |
|---|---|
| `gas/` | Seluruh project Apps Script, **hanya 5 file**: `Code.gs` (logika backend), `Gateway.gs` (doGet / doPost / token), `index.html` (markup), `App.html` (seluruh JavaScript), `Styles.html` (CSS). Salin ke editor GAS / `clasp push`. |
| `web/` | Khusus Pages: `api-shim.js` (pengganti google.script.run), `pwa.js` (service worker, banner update, tombol pasang), `sw.template.js`. |
| `tools/` | `build.js` — membangun situs statis dari `gas/` + `web/` + `brand/`. |
| `brand/` | Ikon, favicon, manifest PWA, logo (tema kopi/coklat). Lihat `brand/README.md`. |
| `docs/` | Situs Pages **yang sudah dibangun tanpa URL** (untuk cara pasang manual B). |
| `tests/` | 334 pengujian otomatis (`npm test`). |
| `.github/workflows/pages.yml` | Deploy otomatis ke GitHub Pages (cara A). |

**Peta kode** — file besar tetap mudah dinavigasi: tiap file diawali daftar isi, dan tiap bagian bertanda `[n/total]` (cari tanda itu di editor).
- `Code.gs` `[1/12]`…: CONFIG · CACHE · AUTH · SETUP · API · TRANSACTIONS · EDIT · REPORT · STOCK · LOG · INVOICE · UTILS.
- `Gateway.gs` `[1/2]`…`[2/2]`: HALAMAN WEB (doGet, include, ping) · API HTTP (doPost, token, pembatasan login).
- `App.html` `[1/7]`…`[7/7]`: CORE · DASHBOARD · INPUT · STOK · RIWAYAT · LAPORAN · BOOT (BOOT harus paling akhir).

Aturan menjaga file besar tetap sehat: jangan membuat dua fungsi/konstanta top-level bernama sama — Apps Script **diam-diam** memakai yang terakhir. Tes `dist.static` menolak nama ganda di `Code.gs`, `Gateway.gs`, dan `App.html`.

## 2. Memasang backend (sekali, atau tiap `.gs` berubah)
Ikuti **Checklist deploy backend** di bagian 4. Intinya: deploy sebagai Web app, *Execute as: Me*, *Who has access: **Anyone***, lalu uji `<URL>/exec?api=ping`.
Opsional: isi `APP_CONFIG.FAVICON_URL` (`Code.gs`, bagian `[1/12] CONFIG`) dengan `https://<user>.github.io/<repo>/favicon.ico` agar halaman GAS punya favicon (halaman GAS di dalam iframe; hanya `setFaviconUrl` yang bekerja).

## 3. Memasang frontend GitHub Pages
Anda butuh **URL Web App** (`https://script.google.com/macros/s/…/exec`) dari langkah 2.

**Cara A — GitHub Actions (disarankan, otomatis tiap push)**
1. Buat repo GitHub dan unggah seluruh isi folder ini.
2. *Settings → Pages → Build and deployment → Source: **GitHub Actions***.
3. *Settings → Secrets and variables → Actions → **Variables** → New repository variable*: nama `BD_EXEC_URL`, isi URL `/exec`.
4. Push ke `main` (atau *Actions → Deploy GitHub Pages → Run workflow*). Situs: `https://<user>.github.io/<repo>/`. Path repo (untuk identitas aplikasi) diambil otomatis dari `GITHUB_REPOSITORY`.

**Cara B — manual, tanpa Node/Actions**
1. Buka `docs/config.js`, isi `EXEC_URL` dengan URL `/exec`. (File ini boleh diedit tanpa build ulang.)
2. Unggah repo ke GitHub. *Settings → Pages → Source: Deploy from a branch → `main` / `docs`*.
3. Setelah mengubah kode di `gas/`: jalankan `node tools/build.js --exec-url <URL> --base-path /<nama-repo>/` (hasil ke `docs/`) lalu commit. `--base-path` boleh juga lewat env `BD_BASE_PATH` atau `basePath` di `tools/pages.config.json` (contoh: `pages.config.example.json`); repo bernama `<user>.github.io` memakai `/`.

Buka situsnya di HP → menu browser → *Pasang aplikasi / Tambah ke Layar Utama*. Di iPhone: Bagikan → *Tambah ke Layar Utama* (iOS tidak punya tombol pasang otomatis).

### Migrasi bertahap: GitHub Pages utama, `/exec` cadangan
- **Dua alamat, satu sistem.** Pages dan `/exec` memakai backend, Spreadsheet, Drive, dan kode akses yang sama. Hanya sesi login yang terpisah (token Pages tidak berlaku di halaman GAS dan sebaliknya) — pengguna cukup masuk lagi.
- **Tahapan.** (1) Pasang Pages dan uji dengan beberapa pengguna. (2) Umumkan URL Pages sebagai alamat utama; simpan URL `/exec` sebagai cadangan (bookmark atau pesan tetap di grup). (3) Setelah stabil, berhenti membagikan `/exec`, tetapi **jangan menghapus deployment**: ia tetap menjadi cadangan dan juga melayani API untuk Pages.
- **Saat GitHub Pages maintenance/gangguan**: buka `/exec` — tampilan dan fungsinya sama, tanpa mengubah apa pun. Aplikasi yang sudah dipasang di HP umumnya tetap terbuka dari cache service worker dan tetap bicara langsung ke backend GAS (tidak dijamin bila cache dibersihkan).
- **Sebaliknya tidak berlaku**: bila Apps Script yang bermasalah, kedua alamat ikut terganggu karena backend-nya sama; Pages bukan cadangan untuk backend.
- **Menjaga cadangan tetap sehat.** (a) Deployment tetap *Anyone*, dan versi baru dideploy pada deployment yang sama. (b) UI di kedua sisi bersumber dari folder `gas/` yang sama: setelah mengubah UI, salin ke editor GAS **dan** push ke GitHub agar versinya tidak berbeda. (c) Perubahan backend harus kompatibel mundur (lihat alur kerja di bawah).

### Alur kerja sehari-hari
1. Ubah kode di `gas/` (UI dan backend satu tempat).
2. Bila `Code.gs`/`Gateway.gs` (atau UI untuk versi cadangan) berubah: salin ke editor GAS lalu **Deploy → Manage deployments → New version** (URL `/exec` tidak berubah).
3. Push ke GitHub → Pages ter-update (Cara A otomatis; Cara B jalankan build).
4. Pengguna PWA melihat banner **"Versi baru tersedia — Muat ulang"**. Pemuatan ulang tidak pernah otomatis, agar isian yang sedang diketik tidak hilang.
5. Jaga **kompatibilitas mundur** backend: PWA lama yang ter-cache bisa memanggil API versi sebelumnya sampai penggunanya memuat ulang.

### Perilaku PWA yang perlu diketahui
- **Offline**: aplikasi (shell) tetap terbuka, tetapi data/transaksi **tidak** bisa disimpan tanpa internet — sengaja, agar stok tidak salah hitung. Tidak ada antrean tulis offline.
- Token sesi hanya di memori (tidak di localStorage): menutup/menyegarkan aplikasi = masuk lagi dengan kode akses.
- Panggilan ke Web App GAS tidak pernah di-cache oleh service worker.

### Pemecahan masalah
| Gejala | Penyebab umum | Solusi |
|---|---|---|
| "Tidak dapat terhubung ke server" padahal internet ada | Deployment bukan *Anyone*, URL salah (mis. `/dev`), atau belum deploy versi baru | Buka `<URL>/exec?api=ping` di jendela samaran: harus tampil JSON. Perbaiki akses ke **Anyone**, deploy *New version*. |
| "Jawaban server bukan JSON…" | Server membalas halaman login/galat Google | Sama seperti di atas. |
| "Alamat server (EXEC_URL) belum diisi" | `config.js` kosong | Isi `EXEC_URL` (Cara A: variabel `BD_EXEC_URL`; Cara B: edit `docs/config.js`). |
| "Terlalu banyak percobaan login gagal" | Batas global 20 gagal / 10 menit | Tunggu; sesi yang sudah login tidak terpengaruh. |
| "Sesi berakhir" lebih cepat dari 30 menit | Google membuang cache token (best-effort) | Masuk lagi. |
| PWA masih tampil versi lama | Service worker menunggu | Ketuk **Muat ulang** pada banner; atau tutup semua tab aplikasi lalu buka lagi. |
| Chrome: "Aplikasi ini sudah diinstal" tapi tidak bisa dibuka | Sisa catatan instalasi di Chrome (lihat di bawah tabel) | Ikuti langkah **Chrome mengira sudah terpasang** di bawah. |
| Build gagal "tanpa konten di luarnya" | Ada kode di luar `<script>…</script>` pada `App.html` | Pindahkan kode ke dalam tag (penjaga ini mencegah bug yang pernah lolos). |
| Build gagal "memanggil fetch() langsung" | Kode aplikasi memanggil server tanpa `google.script.run` | Pakai `google.script.run` agar jalan di kedua frontend. |

### Chrome mengira aplikasi "sudah diinstal" padahal belum
Gejala: menu Chrome menampilkan **"Aplikasi ini sudah diinstal — Klik untuk membuka aplikasi"**, tetapi ikon tidak ada di HP dan ketukannya tidak membuka apa pun; di HP lain normal.
Penyebab: Chrome memutuskan "terpasang" dari **identitas dan scope** aplikasi di domain itu, bukan dari ada-tidaknya ikon. Catatan sisa dari instalasi/uji sebelumnya — atau PWA lain di domain `github.io` yang sama — bisa membuatnya keliru.
Versi awal manifest memakai `"id": "./"`, yang oleh Chrome dihitung dari **akar domain** (`https://user.github.io/`), sehingga bertabrakan dengan PWA lain di domain yang sama. Sekarang `build.js` menulis `id` sebagai **path repo mutlak** (mis. `/barang-dapur/`, dari `--base-path` / `GITHUB_REPOSITORY`), yang identitasnya sama dengan yang diturunkan dari `start_url` (`https://user.github.io/<repo>/`), unik per repo. Bila path repo tidak diketahui, `id` dihilangkan (identitas = `start_url`). `start_url` dan `scope` tetap relatif (`./`). Nama cache service worker juga diberi awalan per-scope sehingga tidak pernah menyentuh cache proyek lain di domain yang sama.

Di HP yang terdampak, berurutan:
1. *Pengaturan Android → Aplikasi* → cari "Barang Dapur". Bila ada, **Hapus instalan**.
2. Di Chrome buka `chrome://webapks` untuk melihat daftar aplikasi web terpasang. Entri untuk situs ini yang tidak punya aplikasi di daftar HP = catatan sisa.
3. Chrome → ⋮ → *Setelan → Setelan situs → Semua situs* → situs `github.io` Anda → **Hapus & reset**.
4. Tutup Chrome sepenuhnya (geser dari daftar aplikasi terbaru), buka lagi, muat situs → opsi **Instal** kembali muncul.
5. Bila belum: perbarui Chrome dan Google Play services. HP **tanpa Google Play services** (sebagian HP Huawei/ROM China) tidak bisa membuat aplikasi terpasang; hanya "Buat pintasan" yang berfungsi.

Yang sudah terlanjur dipasang dengan manifest lama: hapus lalu pasang ulang **sekali** agar memakai identitas baru.
Solusi paling bersih jangka panjang: host di domain sendiri (akun/organisasi GitHub khusus atau custom domain), supaya tidak berbagi origin dengan proyek lain.

## 4. API HTTP (Gateway.gs)
Frontend GAS TIDAK berubah (tetap `google.script.run` + kode akses). Bagian `[2/2] API HTTP` di `Gateway.gs` hanya menambah pintu `doPost` untuk GitHub Pages PWA.

**Permintaan** — `POST <URL /exec>` dengan `Content-Type: text/plain;charset=utf-8` (request "simple": tanpa preflight, wajib karena Apps Script tidak menjawab OPTIONS), tanpa header khusus, tanpa cookie:
```js
const res = await fetch(EXEC_URL, { method: 'POST', body: JSON.stringify({ fn: 'login', args: ['DEMO'] }) });
const data = await res.json();   // {status:'ok', result:{...}, token:'…', expiresInSec:1800, v:1}
// panggilan berikutnya:
fetch(EXEC_URL, { method:'POST', body: JSON.stringify({ fn:'getRiwayat', args:[], token }) });
```
`args` = argumen persis seperti `google.script.run` (satu objek/teks). Untuk fungsi bertoken, `accessCode` di argumen **diabaikan/ditimpa** server; identitas selalu dari token.

| fn | argumen | catatan |
|---|---|---|
| login | [kode] | satu-satunya yang tanpa token; mengembalikan `token` |
| logout | [] | mencabut token |
| getDashboard, getRiwayat | [] | |
| submitTransaction, addStock, correctStock, deleteTransaction, editTransaction, getMonthlyReport | [payload] | sama seperti versi GAS |

**Balasan error** `{status:'error', code, message}` — `AUTH` (token salah/habis -> kembali ke login), `RATE_LIMIT` (login gagal terlalu sering), `BAD_REQUEST`, `FORBIDDEN_FN`, `SERVER`. Hasil bisnis (mis. stok tidak cukup) tetap di `result.ok=false` seperti sebelumnya.

**Sesi**: token acak 256-bit di CacheService; habis 30 menit tanpa aktivitas (bergeser) dan maksimal 12 jam (`TOKEN_IDLE_SEC`, `TOKEN_MAX_AGE_SEC` di `Code.gs` `[1/12]`). Cache bersifat best-effort: bila Google membuangnya, klien menerima `AUTH` dan cukup login ulang.
**Pembatasan login**: maks 20 login gagal (global) per 10 menit (`LOGIN_FAIL_MAX`, `LOGIN_FAIL_WINDOW_SEC`). Sesi yang sudah login tidak terpengaruh.

### Checklist deploy backend
1. **Pindah ke struktur 5 file** (sekali): di editor Apps Script **hapus file lama** (semua `.gs` dan `Js*.html` lama), lalu buat `Code.gs` dan `Gateway.gs` (tipe *Script*) serta `index.html`, `App.html`, `Styles.html` (tipe *HTML*) dari folder `gas/`. Nama harus persis sama (`include('App')` memanggil `App.html`). Pastikan tidak ada dua file yang sama-sama mendefinisikan `doGet`/`doPost` — Apps Script diam-diam memakai salah satunya. Pemakai `clasp`: hapus file lama di folder lokal, lalu `clasp push`.
2. Deploy > Manage deployments > pensil > Version: **New version** > Deploy (URL `/exec` tetap sama). Pengaturan wajib: *Execute as: Me*, *Who has access: **Anyone***. Jika "Anyone with Google account"/domain saja, `fetch` dari github.io akan gagal.
3. Uji di browser: `<URL>/exec?api=ping` harus menampilkan JSON `{"status":"ok",...}`.
4. Uji dari terminal: `curl -L -X POST "<URL>" -H "Content-Type: text/plain" -d '{"fn":"login","args":["DEMO"]}'`.

### Keamanan — mohon dibaca
- Mulai sekarang fungsi backend bisa dipanggil siapa pun yang tahu URL `/exec`, bukan hanya lewat halaman GAS. Kode akses 3 huruf (mis. EDO) mudah ditebak; **`ADMIN` adalah tebakan pertama setiap orang**. Pembatasan login hanya memperlambat penebakan, tidak membuat kode pendek aman.
- Disarankan mengganti kode di `USERS` (`Code.gs`, `[1/12] CONFIG`) menjadi acak minimal 8 karakter, terutama ADMIN (DEMO boleh tetap karena hanya-baca). Ini hanya mengganti kredensial; hak akses dan alur tidak berubah.
- Server tidak bisa membatasi asal (Origin) permintaan; yang menjaga adalah token + daftar fungsi yang diizinkan.

## 5. Aturan & fitur aplikasi
### Menambah barang baru
Cukup 1 tempat: `ITEMS` di `Code.gs` `[1/12] CONFIG` (label, icon, initialStock, isSecondary, consumptionDivisor).
Opsional: tambahkan key ke `REPORT_ITEM_ORDER` agar muncul di Laporan.
Sheet Stok yang sudah ada: tambahkan baris barang baru secara manual (key, label, icon, stock, level)
atau hapus sheet Stok agar dibuat ulang (stok kembali ke initialStock).

### Stok minus & transaksi susulan
- Stok boleh minus (AMBIL tanpa cek stok). Koreksi Stok (opname) tetap minimal 0.
- Waktu transaksi: default "Sekarang"; tombol "Ubah" membuka tanggal + jam. Batas: 7 hari kalender ke belakang, tidak boleh masa depan. Semua role non-demo.
- Parameter ada di `APP_CONFIG` (`Code.gs` `[1/12]`): BACKDATE_MAX_DAYS, MAX_QTY_PER_ITEM, INVOICE_MAX_KB, dst. Frontend mengambil yang relevan dari backend.

### Warna mode transaksi & foto invoice
- **AMBIL = merah, DATANG = hijau**, konsisten di tombol mode, baris yang diisi, tombol Kirim, tombol konfirmasi, dan form edit — selaras dengan lencana di Riwayat. Warnanya variabel `--out` / `--in` di `Styles.html` (kontras teks putih >= 5,4:1). Merah/hijau di sini penanda **mode**; warna status stok (hijau/kuning/oranye/merah) tetap terpisah.
- **Foto invoice dikompres di HP sampai maksimal 150 KB** (`APP_CONFIG.INVOICE_MAX_KB`; ganti satu angka itu untuk mengubah batas — klien, server, dan tes mengikuti). Algoritma memilih gambar **terbesar yang masih muat** (1280 → 1120 → 960 → 800 → 640 → 512 px) dan, pada ukuran itu, kualitas JPEG **tertinggi** yang masih muat (pencarian biner), agar teks invoice tetap terbaca. Setelah dikompres, pratinjau menampilkan ukuran dan dimensi akhir.
- **Server memeriksa ulang**, karena API HTTP bisa dipanggil tanpa melewati aplikasi: foto harus **JPEG** (dicek isi berkas, bukan label `mimeType`) dan <= batas + 2 KB toleransi pembulatan. Pemeriksaan terjadi **sebelum stok diubah**, sehingga foto yang ditolak tidak meninggalkan stok yang sudah berubah. Batas body `doPost` (`API_MAX_BODY_CHARS`) kini 600.000 karakter.
- Sheet "Transaksi Log" kolom ke-12 `Dicatat Pada` = waktu input sebenarnya (header dibuat otomatis).
  Kolom Timestamp (A) = waktu transaksi. Beda > 10 menit -> badge SUSULAN di Riwayat.
- Transaksi susulan ditolak bila berwaktu sebelum Koreksi Stok terakhir item yang sama.

### Edit transaksi
- Riwayat: tahan baris transaksi -> pilih Edit / Hapus. KOREKSI tidak bisa diedit/dihapus.
- Bisa diubah: item & jumlah (tambah/hapus item), keterangan, waktu. Tidak bisa: tipe AMBIL<->DATANG, mengganti foto invoice (foto lama tetap).
- Hak akses sama seperti hapus: pemilik transaksi atau Admin; Demo tidak bisa.
- Edit di tempat (Tx ID tetap). Stok disesuaikan dengan selisih saja. Kolom 13 `Riwayat Edit` menyimpan kondisi sebelum tiap edit.
- Ditolak bila transaksi (atau waktu barunya) berada sebelum Koreksi Stok terakhir item terkait.
- Edit dijalankan dengan LockService agar tidak bentrok dengan input/hapus bersamaan.

### Riwayat dimuat saat menu dibuka
- `getRiwayat(accessCode)` (`Code.gs` `[5/12] API`) mengembalikan transaksi bulan ini + bulan lalu. Frontend memanggilnya hanya saat menu Riwayat dibuka dan datanya belum ada/usang.
- getDashboard, login, simpan (AMBIL/DATANG), dan koreksi stok TIDAK lagi membaca sheet Log untuk riwayat -> lebih ringan. Setelah simpan/koreksi, riwayat ditandai usang dan dimuat ulang saat dibuka.
- Edit/hapus (dipanggil dari Riwayat) mengembalikan daftar terbaru langsung.
- Semua transaksi dalam jendela 2 bulan boleh diedit/dihapus oleh pemilik atau Admin (tanpa batas umur); laporan bulan terkait ikut berubah. Pengecualian (edit DAN hapus, semua role): transaksi yang berada sebelum Koreksi Stok terakhir item terkait tidak bisa diubah/dihapus -- lakukan koreksi stok baru.

## 6. Pengujian
```bash
npm install     # sekali (jsdom, sharp)
npm test        # membangun situs uji lalu menjalankan 10 rangkaian tes (334 pengujian, ~1 menit)
```
Cakupan: backend asli di vm dengan Spreadsheet/Cache tiruan (transaksi, edit/hapus, guard koreksi, riwayat, laporan, token, pembatasan login, serangan menimpa `accessCode`);
struktur hasil build, manifest & ikon; service worker (Cache API tiruan); skrip PWA; **uji ujung-ke-ujung situs Pages → fetch → backend asli**; dan UI versi GAS (riwayat lazy, menu aksi, edit, klik-hantu, hak akses, beban 61 hari).
Catatan: ini simulasi (jsdom + tiruan layanan Google). Perilaku CORS dan kuota Apps Script yang sesungguhnya hanya bisa dipastikan setelah deploy — gunakan checklist di bagian 4.
