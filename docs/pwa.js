/*!
 * pwa.js — pendaftaran service worker, banner pembaruan, penanda offline, dan tombol "Pasang aplikasi".
 * Dimuat setelah app.js (memakai showToast() milik aplikasi bila ada).
 */
(function () {
  'use strict';

  function toast(msg) { if (typeof window.showToast === 'function') window.showToast(msg); }

  window.addEventListener('offline', function () { toast('Anda sedang offline. Data tidak dapat disimpan.'); });
  window.addEventListener('online', function () { toast('Kembali online.'); });

  // ---- Banner "Versi baru tersedia" (pemuatan ulang hanya atas pilihan pengguna, agar input tidak hilang) ----
  function showUpdateBanner(worker) {
    if (document.getElementById('bdUpdateBanner')) return;
    var bar = document.createElement('div');
    bar.id = 'bdUpdateBanner';
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(5rem + env(safe-area-inset-bottom,0px));' +
      'z-index:70;display:flex;align-items:center;gap:10px;background:#2b1f17;color:#fff;padding:10px 12px 10px 16px;' +
      'border-radius:999px;box-shadow:0 16px 30px rgba(0,0,0,.25);font:600 13px system-ui,sans-serif;max-width:92vw;';
    var txt = document.createElement('span');
    txt.textContent = 'Versi baru tersedia.';
    var ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = 'Muat ulang';
    ok.style.cssText = 'border:0;border-radius:999px;padding:8px 14px;background:#f6dfc4;color:#2b1f17;font:800 13px system-ui,sans-serif;cursor:pointer;';
    ok.onclick = function () { ok.disabled = true; worker.postMessage({ type: 'SKIP_WAITING' }); };
    var later = document.createElement('button');
    later.type = 'button';
    later.textContent = 'Nanti';
    later.style.cssText = 'border:0;background:none;color:#e8cfb4;font:700 13px system-ui,sans-serif;cursor:pointer;padding:8px 6px;';
    later.onclick = function () { bar.remove(); };
    bar.appendChild(txt); bar.appendChild(ok); bar.appendChild(later);
    document.body.appendChild(bar);
  }

  // ---- Service worker ----
  if ('serviceWorker' in navigator) {
    var hadController = !!navigator.serviceWorker.controller;
    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) { hadController = true; return; }   // instalasi pertama: jangan muat ulang
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });

    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { scope: './' }).then(function (reg) {
        if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting);
        reg.addEventListener('updatefound', function () {
          var nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', function () {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(nw);
          });
        });
        setInterval(function () { reg.update().catch(function () {}); }, 30 * 60 * 1000); // aplikasi dibuka lama
      }).catch(function (e) { if (window.console) console.warn('Service worker gagal didaftarkan:', e); });
    });
  }

  // ---- Pasang aplikasi: tombol SELALU terlihat (login + Dashboard) selama belum berjalan sebagai aplikasi ----
  // Ada prompt bawaan Chrome (beforeinstallprompt) -> dipakai. Tidak ada (iPhone, browser lain, atau Chrome yang
  // salah mengira "sudah diinstal") -> tombol membuka panduan langkah demi langkah.
  var deferredPrompt = null;
  var ua = navigator.userAgent || '';
  var isIos = /iphone|ipad|ipod/i.test(ua);
  var isAndroid = /android/i.test(ua);

  var installed = false;                         // sudah dipasang (diterima / appinstalled) -> tombol tidak ditampilkan lagi
  var DISPLAY_MODES = ['(display-mode: standalone)', '(display-mode: minimal-ui)', '(display-mode: fullscreen)', '(display-mode: window-controls-overlay)'];

  function isStandalone() {
    if (window.navigator.standalone === true) return true;      // iOS: dibuka dari ikon "Layar Utama"
    if (!window.matchMedia) return false;
    return DISPLAY_MODES.some(function (q) { try { return window.matchMedia(q).matches; } catch (_) { return false; } });
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function closeInstallHelp() { var d = document.getElementById('bdInstallHelp'); if (d) d.remove(); }

  function showInstallHelp() {
    closeInstallHelp();
    var steps;
    if (isIos) {
      steps = ['Buka situs ini di <b>Safari</b>.', 'Ketuk tombol <b>Bagikan</b> (kotak dengan panah ke atas).', 'Pilih <b>Tambah ke Layar Utama</b>, lalu ketuk <b>Tambah</b>.'];
    } else if (isAndroid) {
      steps = ['Ketuk menu <b>&#8942;</b> di pojok kanan atas Chrome.', 'Pilih <b>Instal aplikasi</b> (atau <b>Tambahkan ke layar utama</b>).', 'Ketuk <b>Instal</b>.'];
    } else {
      steps = ['Buka menu browser Anda.', 'Pilih <b>Instal aplikasi</b> atau <b>Tambahkan ke layar utama</b>.'];
    }
    var lead = deferredPrompt ? '' : '<p style="margin:0 0 10px;color:#7a6a5d;">Browser ini belum menawarkan pemasangan otomatis, jadi pasang lewat menu:</p>';
    var fix = '<details style="margin-top:14px;border:1px solid #ebe3da;border-radius:12px;padding:10px 12px;background:#faf6f1;">' +
      '<summary style="font-weight:700;cursor:pointer;">Chrome menulis "sudah diinstal" tetapi aplikasinya tidak ada / tidak bisa dibuka?</summary>' +
      '<ol style="margin:10px 0 0;padding-left:20px;line-height:1.5;">' +
      '<li>Pengaturan HP &rarr; <b>Aplikasi</b> &rarr; cari "Barang Dapur". Jika ada, hapus instalannya.</li>' +
      '<li>Chrome &rarr; &#8942; &rarr; <b>Setelan</b> &rarr; <b>Setelan situs</b> &rarr; <b>Semua situs</b> &rarr; pilih situs ini &rarr; <b>Hapus &amp; reset</b>.</li>' +
      '<li>Tutup Chrome sepenuhnya (geser dari daftar aplikasi terbaru), lalu buka situs ini lagi.</li>' +
      '<li>Masih sama? Ada aplikasi web lain dari domain yang sama yang membuat Chrome salah mengira. Minta pengelola mengecek <code>chrome://webapks</code>.</li>' +
      '</ol></details>';
    var overlay = document.createElement('div');
    overlay.id = 'bdInstallHelp';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Cara memasang aplikasi');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:80;background:rgba(43,31,23,.5);display:flex;align-items:flex-end;justify-content:center;';
    overlay.innerHTML =
      '<div style="width:100%;max-width:32rem;max-height:85vh;overflow-y:auto;background:#fff;border-radius:22px 22px 0 0;padding:20px 18px calc(18px + env(safe-area-inset-bottom,0px));font:14px/1.45 system-ui,sans-serif;color:#2b1f17;">' +
      '<h3 style="margin:0 0 10px;font-size:17px;">Pasang Barang Dapur di HP</h3>' + lead +
      '<ol style="margin:0;padding-left:20px;line-height:1.6;">' + steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' +
      fix +
      '<button type="button" id="bdInstallHelpClose" class="btn btn-primary" style="width:100%;margin-top:16px;">Tutup</button></div>';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeInstallHelp(); });
    document.body.appendChild(overlay);
    var close = document.getElementById('bdInstallHelpClose');
    close.addEventListener('click', closeInstallHelp);
    if (close.focus) close.focus();
  }

  function onInstallClick() {
    if (!deferredPrompt) { showInstallHelp(); return; }
    var p = deferredPrompt;
    deferredPrompt = null;                       // prompt bawaan hanya bisa dipakai sekali
    p.prompt();
    p.userChoice.then(function (choice) {
      if (choice && choice.outcome === 'accepted') { installed = true; removeInstallButtons(); }
    });
  }

  function removeInstallButtons() {
    Array.prototype.slice.call(document.querySelectorAll('.bd-install-btn')).forEach(function (b) { b.remove(); });
    closeInstallHelp();
  }

  function makeInstallButton() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'bd-install-btn btn btn-secondary';
    b.style.cssText = 'width:100%;margin-top:14px;';
    b.textContent = 'Pasang Aplikasi';
    b.setAttribute('aria-label', 'Pasang aplikasi Barang Dapur di layar utama');
    b.addEventListener('click', onInstallClick);
    return b;
  }

  // Satu pintu untuk menampilkan/menyembunyikan tombol: dipanggil saat awal, saat mode tampilan berubah, dan setelah pemasangan.
  function syncInstallUi() {
    if (installed || isStandalone()) { removeInstallButtons(); return; }   // sudah terpasang / sedang berjalan sebagai aplikasi
    if (document.querySelector('.bd-install-btn')) return;                  // sudah tampil
    var login = document.querySelector('.login-card');
    if (login) { var b1 = makeInstallButton(); b1.id = 'bdInstallBtn'; login.appendChild(b1); }
    var howto = document.querySelector('#viewDashboard .howto-card');
    if (howto) howto.appendChild(makeInstallButton());
  }

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; });
  window.addEventListener('appinstalled', function () { installed = true; deferredPrompt = null; removeInstallButtons(); });
  // Aplikasi dibuka dari ikon (standalone) atau beralih mode tampilan: sembunyikan/tampilkan otomatis.
  if (window.matchMedia) DISPLAY_MODES.forEach(function (q) {
    try {
      var mq = window.matchMedia(q);
      if (mq.addEventListener) mq.addEventListener('change', syncInstallUi); else if (mq.addListener) mq.addListener(syncInstallUi);
    } catch (_) { /* abaikan */ }
  });
  syncInstallUi();
})();
