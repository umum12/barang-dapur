// pwa.js: banner pembaruan, tombol "Pasang Aplikasi" (selalu terlihat + panduan), deteksi mode aplikasi, penanda offline/online.
const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('path');
const { DIST, ok, sleep, until, finish } = require('./helpers');

async function open({ controller, ua, displayMode, iosStandalone } = {}) {
  const errs = [], posted = [], sw = {}, mqListeners = [], mode = { current: displayMode || null };
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errs.push(e.message));
  const worker = { postMessage: (m) => posted.push(m) };
  const reg = { waiting: worker, installing: null, addEventListener() {}, update: () => Promise.resolve() };
  const dom = await JSDOM.fromFile(path.join(DIST, 'index.html'), {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.Element.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
      w.matchMedia = (q) => ({ matches: !!mode.current && q.includes(mode.current), addEventListener: (_t, f) => mqListeners.push(f), removeEventListener() {} });
      Object.defineProperty(w.navigator, 'serviceWorker', { configurable: true, value: {
        controller: controller ? {} : null,
        register: (url, opts) => { sw.url = url; sw.opts = opts; return Promise.resolve(reg); },
        addEventListener: (t, f) => { sw[t] = f; } } });
      if (ua) Object.defineProperty(w.navigator, 'userAgent', { configurable: true, value: ua });
      if (iosStandalone) Object.defineProperty(w.navigator, 'standalone', { configurable: true, value: true });
    } });
  await new Promise((r) => dom.window.addEventListener('load', r));
  return { w: dom.window, d: dom.window.document, errs, posted, sw, mode, fireModeChange: () => mqListeners.forEach((f) => f()) };
}
const reloads = (errs) => errs.filter((e) => /navigation/i.test(e)).length;
const btns = (P) => P.d.querySelectorAll('.bd-install-btn').length;
const help = (P) => P.d.getElementById('bdInstallHelp');
const UA = {
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0'
};

(async () => {
  // ================= pembaruan (service worker) =================
  let P = await open({ controller: true });
  await until(() => P.sw.url);
  ok('mendaftarkan sw.js relatif, dengan scope "./" (hanya folder aplikasi ini)', P.sw.url === 'sw.js' && P.sw.opts && P.sw.opts.scope === './');
  ok('banner "Versi baru tersedia" tampil', !!(await until(() => P.d.getElementById('bdUpdateBanner'))));
  [...P.d.querySelectorAll('#bdUpdateBanner button')].find((b) => /Muat ulang/.test(b.textContent)).click();
  ok('tombol "Muat ulang" mengirim SKIP_WAITING ke worker baru', P.posted.some((m) => m.type === 'SKIP_WAITING'));
  ok('belum memuat ulang sebelum controller berganti (input pengguna aman)', reloads(P.errs) === 0);
  P.sw.controllerchange(); P.sw.controllerchange(); await sleep(50);
  ok('controller berganti -> muat ulang SEKALI saja', reloads(P.errs) === 1, 'reload=' + reloads(P.errs));
  [...P.d.querySelectorAll('#bdUpdateBanner button')].find((b) => /Nanti/.test(b.textContent)).click();
  ok('tombol "Nanti" menutup banner', !P.d.getElementById('bdUpdateBanner'));
  P = await open({ controller: false }); await until(() => P.sw.url);
  ok('instalasi pertama: tidak ada banner', !P.d.getElementById('bdUpdateBanner'));
  P.sw.controllerchange(); await sleep(50);
  ok('instalasi pertama: controllerchange tidak memuat ulang halaman', reloads(P.errs) === 0);

  // ================= tombol Pasang Aplikasi =================
  P = await open({ controller: true, ua: UA.desktop });
  ok('tombol "Pasang Aplikasi" SELALU terlihat: di kartu login DAN di Dashboard', !!P.d.querySelector('.login-card #bdInstallBtn') && !!P.d.querySelector('#viewDashboard .howto-card .bd-install-btn') && btns(P) === 2);
  P.d.getElementById('bdInstallBtn').click();
  ok('tanpa prompt bawaan: klik membuka panduan langkah demi langkah', !!help(P) && /belum menawarkan pemasangan otomatis/.test(help(P).textContent) && /Instal aplikasi/.test(help(P).textContent));
  ok('panduan memuat bantuan "sudah diinstal tetapi tidak ada"', /sudah diinstal/.test(help(P).textContent) && !!help(P).querySelector('details'));
  ok('panduan dapat ditutup (tombol Tutup)', (P.d.getElementById('bdInstallHelpClose').click(), !help(P)));
  P.d.getElementById('bdInstallBtn').click(); help(P).dispatchEvent(new P.w.MouseEvent('click', { bubbles: true }));
  ok('panduan dapat ditutup (klik di luar kartu)', !help(P));

  P = await open({ controller: true, ua: UA.ios }); P.d.getElementById('bdInstallBtn').click();
  ok('iPhone: panduan Safari -> Bagikan -> Tambah ke Layar Utama', /Safari/.test(help(P).textContent) && /Bagikan/.test(help(P).textContent) && /Tambah ke Layar Utama/.test(help(P).textContent));
  P = await open({ controller: true, ua: UA.android }); P.d.getElementById('bdInstallBtn').click();
  ok('Android: panduan menu Chrome -> Instal aplikasi', /menu/.test(help(P).textContent) && /Instal aplikasi/.test(help(P).textContent));

  // prompt bawaan tersedia
  P = await open({ controller: true, ua: UA.android });
  let prompted = 0, choice = 'accepted';
  const ev = new P.w.Event('beforeinstallprompt', { cancelable: true });
  ev.prompt = () => { prompted++; }; ev.userChoice = new Promise((r) => { ev.resolveChoice = () => r({ outcome: choice }); });
  P.w.dispatchEvent(ev);
  ok('beforeinstallprompt ditahan; tombol tidak dobel', ev.defaultPrevented && btns(P) === 2);
  P.d.getElementById('bdInstallBtn').click();
  ok('ada prompt bawaan: klik memanggil prompt() (tanpa panduan)', prompted === 1 && !help(P));
  ev.resolveChoice(); await until(() => btns(P) === 0);
  ok('diterima -> semua tombol Pasang hilang', btns(P) === 0);

  P = await open({ controller: true, ua: UA.android });
  const ev2 = new P.w.Event('beforeinstallprompt', { cancelable: true }); let p2 = 0;
  ev2.prompt = () => { p2++; }; ev2.userChoice = Promise.resolve({ outcome: 'dismissed' });
  P.w.dispatchEvent(ev2); P.d.getElementById('bdInstallBtn').click(); await sleep(30);
  ok('ditolak pengguna -> tombol tetap ada', btns(P) === 2 && p2 === 1);
  P.d.getElementById('bdInstallBtn').click();
  ok('prompt bawaan hanya sekali: klik berikutnya membuka panduan', p2 === 1 && !!help(P));

  P = await open({ controller: true, ua: UA.android }); P.w.dispatchEvent(new P.w.Event('appinstalled'));
  ok('event appinstalled -> tombol hilang', btns(P) === 0);

  // sedang berjalan sebagai aplikasi
  P = await open({ controller: true, displayMode: 'standalone' });
  ok('dibuka sebagai aplikasi (display-mode: standalone): tombol tidak ditampilkan', btns(P) === 0);
  P = await open({ controller: true, iosStandalone: true });
  ok('iOS dibuka dari ikon Layar Utama (navigator.standalone): tombol tidak ditampilkan', btns(P) === 0);
  P = await open({ controller: true });
  ok('di tab browser biasa: tombol tampil', btns(P) === 2);
  P.mode.current = 'standalone'; P.fireModeChange();
  ok('mode tampilan berubah ke standalone: tombol hilang otomatis', btns(P) === 0);
  P.mode.current = null; P.fireModeChange();
  ok('kembali ke tab browser: tombol muncul lagi', btns(P) === 2);

  // ================= offline / online =================
  P.w.dispatchEvent(new P.w.Event('offline'));
  ok('offline -> pemberitahuan', /offline/i.test(P.d.getElementById('toast').textContent));
  P.w.dispatchEvent(new P.w.Event('online'));
  ok('online -> pemberitahuan', /online/i.test(P.d.getElementById('toast').textContent));
  ok('tidak ada error runtime', P.errs.filter((e) => !/navigation/i.test(e)).length === 0, P.errs.join('|'));
  finish();
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
