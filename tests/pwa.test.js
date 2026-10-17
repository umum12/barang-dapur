// pwa.js: banner pembaruan, tombol pasang, petunjuk iPhone, penanda offline/online.
const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('path');
const { DIST, ok, sleep, until, finish } = require('./helpers');

async function open({ controller, ua } = {}) {
  const errs = [], posted = [], sw = {};
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errs.push(e.message));
  const worker = { postMessage: (m) => posted.push(m) };
  const reg = { waiting: worker, installing: null, addEventListener() {}, update: () => Promise.resolve() };
  const dom = await JSDOM.fromFile(path.join(DIST, 'index.html'), {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.Element.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
      Object.defineProperty(w.navigator, 'serviceWorker', { configurable: true, value: {
        controller: controller ? {} : null,
        register: (url) => { sw.url = url; return Promise.resolve(reg); },
        addEventListener: (t, f) => { sw[t] = f; } } });
      if (ua) Object.defineProperty(w.navigator, 'userAgent', { configurable: true, value: ua });
    } });
  await new Promise((r) => dom.window.addEventListener('load', r));
  return { w: dom.window, d: dom.window.document, errs, posted, sw };
}
const reloads = (errs) => errs.filter((e) => /navigation/i.test(e)).length;

(async () => {
  // --- pembaruan: sudah ada controller + versi baru menunggu
  let P = await open({ controller: true });
  await until(() => P.sw.url);
  ok('mendaftarkan sw.js relatif terhadap scope', P.sw.url === 'sw.js');
  ok('banner "Versi baru tersedia" tampil', !!(await until(() => P.d.getElementById('bdUpdateBanner'))));
  const btn = [...P.d.querySelectorAll('#bdUpdateBanner button')].find((b) => /Muat ulang/.test(b.textContent));
  btn.click();
  ok('tombol "Muat ulang" mengirim SKIP_WAITING ke worker baru', P.posted.some((m) => m.type === 'SKIP_WAITING'));
  ok('belum memuat ulang sebelum controller berganti (input pengguna aman)', reloads(P.errs) === 0);
  P.sw.controllerchange(); P.sw.controllerchange(); await sleep(50);
  ok('controller berganti -> muat ulang SEKALI saja', reloads(P.errs) === 1, 'reload=' + reloads(P.errs));
  const later = [...P.d.querySelectorAll('#bdUpdateBanner button')].find((b) => /Nanti/.test(b.textContent));
  later.click();
  ok('tombol "Nanti" menutup banner', !P.d.getElementById('bdUpdateBanner'));

  // --- instalasi pertama: controller berganti karena clients.claim -> JANGAN muat ulang
  P = await open({ controller: false });
  await until(() => P.sw.url);
  ok('instalasi pertama: tidak ada banner', !P.d.getElementById('bdUpdateBanner'));
  P.sw.controllerchange(); await sleep(50);
  ok('instalasi pertama: controllerchange tidak memuat ulang halaman', reloads(P.errs) === 0);

  // --- tombol pasang aplikasi
  let prompted = 0;
  const ev = new P.w.Event('beforeinstallprompt', { cancelable: true });
  ev.prompt = () => { prompted++; }; ev.userChoice = Promise.resolve({ outcome: 'accepted' });
  P.w.dispatchEvent(ev);
  ok('beforeinstallprompt ditahan & tombol "Pasang aplikasi" muncul di kartu login', ev.defaultPrevented && !!P.d.querySelector('.login-card #bdInstallBtn'));
  P.d.getElementById('bdInstallBtn').click();
  ok('klik tombol memanggil prompt() bawaan browser', prompted === 1);
  ok('setelah dipilih, tombol hilang', !!(await until(() => !P.d.getElementById('bdInstallBtn'))));

  // --- offline / online
  P.w.dispatchEvent(new P.w.Event('offline'));
  ok('offline -> pemberitahuan', /offline/i.test(P.d.getElementById('toast').textContent));
  P.w.dispatchEvent(new P.w.Event('online'));
  ok('online -> pemberitahuan', /online/i.test(P.d.getElementById('toast').textContent));

  // --- iPhone (tanpa beforeinstallprompt)
  P = await open({ controller: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' });
  ok('iPhone Safari: petunjuk "Tambah ke Layar Utama" di kartu login', /Layar Utama/.test(P.d.querySelector('.login-card').textContent));
  P = await open({ controller: true });
  ok('non-iPhone: tidak ada petunjuk iPhone', !/Layar Utama/.test(P.d.querySelector('.login-card').textContent));
  finish();
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
