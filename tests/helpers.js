// Utilitas bersama untuk semua tes.
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const GAS = path.join(ROOT, 'gas');
const DIST = path.join(ROOT, 'tests', '.dist');       // dibangun oleh run-all.js
const EXEC = 'https://script.google.com/macros/s/AKfycbTEST123/exec';

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => { console.log((cond ? 'PASS' : 'FAIL').padEnd(5), label, extra); cond ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { const v = fn(); if (v) return v; } catch (_) { /* coba lagi */ } await sleep(15); }
  return false;
}
// HTML GAS (dengan <?!= include('X') ?>) -> HTML utuh untuk jsdom.
function gasPage() {
  return fs.readFileSync(path.join(GAS, 'index.html'), 'utf8')
    .replace(/<\?!= include\('(\w+)'\) \?>/g, (_, n) => fs.readFileSync(path.join(GAS, n + '.html'), 'utf8'));
}
const STOCKS = ['kopi', 'gula', 'teh', 'sabun', 'air330', 'airCup', 'tisu', 'spons']
  .map((k) => ({ key: k, label: k, icon: '•', stock: 20, level: 'safe', isSecondary: false, divisor: 1 }));
const mkTx = (id, extra = {}) => Object.assign({
  timestamp: '03/10/2026 10:00:00', txId: id, userCode: 'EDO', userName: 'EDO', role: 'FS',
  itemsJson: '[{"key":"kopi","qty":3}]', itemsText: 'x', totalQty: 3, note: '', type: 'KELUAR', invoiceUrl: '',
  createdAt: '', backdated: false, editInfo: '', edited: false
}, extra);
const { JSDOM, VirtualConsole } = require('jsdom');
// Halaman GAS (index.html + Js*.html) dengan google.script.run TIRUAN. handlers[fn](...args) -> hasil;
// hasil boleh {__fail:'pesan'} (memicu failure handler) atau {__delay:ms, value:hasil}.
async function openGas({ recent = [], user, handlers = {} } = {}) {
  const u = user || { code: 'EDO', name: 'EDO', role: 'USER', labelRole: 'FS', canSubmit: true };
  const errs = [], calls = { _log: [] };
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errs.push(e.message));
  const defaults = {
    login: () => ({ ok: true, user: u, canSubmit: true, stocks: STOCKS, config: { backdateMaxDays: 7, maxQtyPerItem: 999 } }),
    getDashboard: () => ({ ok: true, user: u, canSubmit: true, stocks: STOCKS, config: {} }),
    getRiwayat: () => ({ ok: true, recent })
  };
  const dom = new JSDOM(gasPage(), { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'https://x.test/',
    beforeParse(w) {
      w.Element.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
      const run = (s, f) => new Proxy({}, { get(_t, p) {
        if (p === 'withSuccessHandler') return (g) => run(g, f);
        if (p === 'withFailureHandler') return (g) => run(s, g);
        return (...args) => {
          calls[p] = (calls[p] || 0) + 1; calls._log.push({ fn: p, args });
          let res; try { res = (handlers[p] || defaults[p])(...args); } catch (e) { res = { __fail: e.message }; }
          setTimeout(() => {
            if (res && res.__fail) { if (f) f(new Error(res.__fail)); return; }
            if (s) s(res && res.__delay ? res.value : res);
          }, res && res.__delay ? res.__delay : 5);
        };
      } });
      w.google = { script: { run: run(null, null) } };
    } });
  return { w: dom.window, d: dom.window.document, errs, calls };
}
async function loginUi(P, code = 'EDO') {
  P.d.getElementById('loginCodeInput').value = code;
  P.d.getElementById('loginSubmitBtn').click();
  return until(() => !P.d.getElementById('appView').classList.contains('hidden'));
}
// Tahan baris riwayat (touchstart -> tahan -> touchend); jeda setelahnya melewati perisai klik-hantu 0,5 dtk.
async function longPress(P, el, holdMs = 700) {
  el.dispatchEvent(new P.w.Event('touchstart', { bubbles: true })); await sleep(holdMs);
  el.dispatchEvent(new P.w.Event('touchend', { bubbles: true })); await sleep(600);
}
function finish() { console.log(`\n${pass} lulus, ${fail} gagal`); process.exit(fail ? 1 : 0); }
module.exports = { openGas, loginUi, longPress, ROOT, GAS, DIST, EXEC, ok, sleep, until, gasPage, STOCKS, mkTx, finish };
