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
      navigator.serviceWorker.register('sw.js').then(function (reg) {
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

  // ---- Tombol "Pasang aplikasi" (Chrome/Edge/Android) + petunjuk iPhone ----
  var deferredPrompt = null;
  function loginCard() { return document.querySelector('.login-card'); }
  function removeInstallButton() { var b = document.getElementById('bdInstallBtn'); if (b) b.remove(); }
  function addInstallButton() {
    var card = loginCard();
    if (!card || document.getElementById('bdInstallBtn')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'bdInstallBtn';
    b.className = 'small-link';
    b.style.cssText = 'margin-top:14px;display:inline-block;';
    b.textContent = 'Pasang aplikasi di layar utama';
    b.onclick = function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () { deferredPrompt = null; removeInstallButton(); });
    };
    card.appendChild(b);
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; addInstallButton(); });
  window.addEventListener('appinstalled', function () { deferredPrompt = null; removeInstallButton(); });

  var isIos = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  var standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  if (isIos && !standalone) {
    var card = loginCard();
    if (card) {
      var hint = document.createElement('div');
      hint.className = 'login-session-hint';
      hint.textContent = 'Di iPhone: ketuk tombol Bagikan lalu pilih "Tambah ke Layar Utama".';
      card.appendChild(hint);
    }
  }
})();
