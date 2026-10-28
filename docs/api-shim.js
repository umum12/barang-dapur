/*!
 * api-shim.js — pengganti google.script.run untuk versi GitHub Pages.
 *
 * Seluruh kode aplikasi (App.html) memanggil  google.script.run.withSuccessHandler(..).withFailureHandler(..).namaFungsi(arg).
 * Berkas ini meniru API itu lewat fetch() ke Web App GAS (/exec -> Gateway.gs), sehingga kode aplikasi
 * TIDAK perlu diubah. Di dalam halaman GAS asli, google.script.run sudah ada dan berkas ini tidak berbuat apa-apa.
 *
 * Aturan CORS Apps Script: tanpa preflight -> POST berisi string (Content-Type otomatis text/plain),
 * TANPA header khusus dan TANPA cookie.
 */
(function () {
  'use strict';
  if (window.google && window.google.script && window.google.script.run) return;

  var CFG = window.BD_CONFIG || {};
  var TIMEOUT_MS = 60000;   // cold start Apps Script bisa beberapa detik; unggah foto invoice lebih lama
  var token = null;         // hanya di memori: tidak disimpan di localStorage/sessionStorage

  function makeError(message, code) {
    var e = new Error(message);
    e.code = code || 'CLIENT';
    return e;
  }
  function fire(name) {
    try { window.dispatchEvent(new CustomEvent(name)); } catch (_) { /* abaikan */ }
  }

  function postJson(body) {
    if (!CFG.EXEC_URL) {
      return Promise.reject(makeError('Alamat server (EXEC_URL) belum diisi di config.js.', 'CONFIG'));
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return Promise.reject(makeError('Anda sedang offline. Sambungkan internet lalu coba lagi.', 'OFFLINE'));
    }
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
    function done() { if (timer) clearTimeout(timer); }

    return fetch(CFG.EXEC_URL, {
      method: 'POST',
      body: JSON.stringify(body),
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      done();
      if (!res.ok) throw makeError('Server menjawab HTTP ' + res.status + '.', 'HTTP');
      return res.json().catch(function () {
        throw makeError('Jawaban server bukan JSON. Pastikan Web App di-deploy dengan akses "Anyone".', 'BADJSON');
      });
    }).catch(function (e) {
      done();
      if (e && e.code) throw e;
      if (e && e.name === 'AbortError') throw makeError('Server terlalu lama menjawab. Coba lagi.', 'TIMEOUT');
      throw makeError('Tidak dapat terhubung ke server. Periksa koneksi internet.', 'NETWORK');
    });
  }

  function call(fn, args) {
    if (fn !== 'login' && fn !== 'logout' && !token) {
      fire('bd:auth-expired');
      return Promise.reject(makeError('Sesi berakhir. Silakan masuk lagi.', 'AUTH'));
    }
    if (fn === 'logout' && !token) return Promise.resolve({ ok: true });

    var body = { fn: fn, args: args };
    if (fn !== 'login') body.token = token;

    return postJson(body).then(function (data) {
      if (!data || data.status !== 'ok') {
        var code = data && data.code;
        var msg = (data && data.message) || 'Terjadi kesalahan pada server.';
        if (code === 'AUTH') { token = null; fire('bd:auth-expired'); }
        throw makeError(msg, code || 'SERVER');
      }
      if (fn === 'login') token = data.token || null;   // login gagal: result.ok=false, tanpa token
      if (fn === 'logout') token = null;
      return data.result;
    });
  }

  // Meniru rantai google.script.run: .withSuccessHandler(f).withFailureHandler(g).namaFungsi(...args)
  function runner(onOk, onFail) {
    return new Proxy({}, {
      get: function (_t, prop) {
        if (prop === 'withSuccessHandler') return function (f) { return runner(f, onFail); };
        if (prop === 'withFailureHandler') return function (f) { return runner(onOk, f); };
        if (prop === 'withUserObject') return function () { return runner(onOk, onFail); };
        if (typeof prop !== 'string' || prop === 'then') return undefined;
        return function () {
          var args = Array.prototype.slice.call(arguments);
          call(prop, args).then(
            function (r) { if (onOk) onOk(r); },
            function (e) { if (onFail) onFail(e); else if (window.console) console.error(e); }
          );
        };
      }
    });
  }

  window.google = { script: { run: runner(null, null) } };

  // Dipanggil showLogin_() saat logout / idle: cabut token di server (tanpa menunggu hasilnya).
  window.onBdSessionEnd = function () {
    if (!token) return;
    var t = token;
    token = null;
    postJson({ fn: 'logout', args: [], token: t }).catch(function () { /* sesi server toh habis sendiri */ });
  };

  window.BD_API = { hasSession: function () { return !!token; } };
})();
