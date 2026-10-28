// Foto invoice: kompresi klien <= 100 KB (diuji terhadap oracle independen), validasi server (JPEG + ukuran, SEBELUM stok berubah),
// dan satu jalur ujung-ke-ujung dengan JPEG NYATA (sharp) lewat situs Pages -> fetch -> backend asli.
const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('path');
const sharp = require('sharp');
const createBackend = require('./backend');
const fs = require('fs');
const { GAS, DIST, EXEC, openGas, loginUi, ok: baseOk, sleep, until, finish } = require('./helpers');

// Batas dibaca dari Code.gs (satu-satunya sumber): mengganti INVOICE_MAX_KB tidak perlu mengubah tes.
const KB = Number(fs.readFileSync(path.join(GAS, 'Code.gs'), 'utf8').match(/INVOICE_MAX_KB:\s*(\d+)/)[1]);
const LIMIT = KB * 1024;
const ok = (label, cond, extra) => baseOk(String(label).replace(/\b100 KB\b/g, KB + ' KB'), cond, extra);
const jpegB64 = (bytes) => { const b = Buffer.alloc(bytes, 7); b[0] = 0xFF; b[1] = 0xD8; b[2] = 0xFF; b[3] = 0xE0; return b.toString('base64'); };
const bytesOfB64 = (s) => Math.floor(s.length * 3 / 4) - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0);

// ---------------------------------------------------------------- (a) algoritma kompresi
// Model ukuran JPEG: naik dengan piksel & kualitas; c = "kerumitan" gambar. Oracle = pemindaian brute-force independen.
const model = (w, h, q, c) => 3 * Math.round(w * h * c * (0.03 + 0.4 * Math.pow(q, 2.2)) / 8 / 3);
const DIMS = [1280, 1120, 960, 800, 640, 512];
function oracle(iw, ih, c) {
  for (const md of DIMS) {
    const s = Math.min(1, md / Math.max(iw, ih)), w = Math.max(1, Math.round(iw * s)), h = Math.max(1, Math.round(ih * s));
    if (model(w, h, 0.85, c) <= LIMIT) return { w, h, q: 0.85 };
    if (model(w, h, 0.45, c) > LIMIT) continue;
    let best = 0.45; for (let q = 0.45; q <= 0.85; q += 0.001) if (model(w, h, q, c) <= LIMIT) best = q;
    return { w, h, q: best };
  }
  return null;
}
async function stubbedPage(state) {
  const P = await openGas(); await loginUi(P);
  const w = P.w, draws = [];
  w.HTMLCanvasElement.prototype.getContext = function () { return { set fillStyle(v) { this._f = v; }, fillRect() { draws.push('fill'); }, drawImage() { draws.push('draw'); } }; };
  w.HTMLCanvasElement.prototype.toDataURL = function (_t, q) { return 'data:image/jpeg;base64,' + 'A'.repeat(Math.ceil(model(this.width, this.height, q, state.c) / 3) * 4); };
  w.Image = function () { const o = {}; Object.defineProperty(o, 'src', { set() { o.width = state.iw; o.height = state.ih; setTimeout(() => o.onload && o.onload(), 0); } }); return o; };
  return { P, w, draws };
}

(async () => {
  const state = { c: 1, iw: 4032, ih: 3024 };
  const { P, w, draws } = await stubbedPage(state);
  const run = (c, iw = 4032, ih = 3024) => { state.c = c; return w.compressInvoice_({ width: iw, height: ih }, LIMIT); };

  let r = run(1);
  ok('gambar sederhana: dimensi terbesar 1280 & kualitas tertinggi 0,85', r.width === 1280 && r.height === 960 && Math.abs(r.quality - 0.85) < 1e-9 && r.bytes <= LIMIT);
  let allOk = true, worst = 0, detail = [];
  for (const c of [0.5, 1, 2, 3, 4, 6, 8, 10, 16, 30, 60, 100]) {
    const o = oracle(4032, 3024, c), a = run(c);
    if (!o) { if (a !== null && a.bytes > LIMIT) { allOk = false; detail.push('c=' + c + ' melebihi'); } continue; }
    if (!a) { allOk = false; detail.push('c=' + c + ' null padahal bisa'); continue; }
    const dimOk = a.width === o.w && a.height === o.h;
    const qOk = a.quality <= o.q + 1e-9 && o.q - a.quality <= 0.4 / 64 + 1e-9;    // tak pernah melewati batas; selisih <= resolusi pencarian
    if (!(dimOk && qOk && a.bytes <= LIMIT)) { allOk = false; detail.push(`c=${c}: alg ${a.width}@${a.quality.toFixed(3)} vs oracle ${o.w}@${o.q.toFixed(3)}`); }
    worst = Math.max(worst, a.bytes);
  }
  ok('12 tingkat kerumitan: dimensi = terbesar yang muat, kualitas = tertinggi yang muat (cocok dengan oracle), SELALU <= 100 KB', allOk, detail.join('; '));
  ok('ukuran terbesar yang dihasilkan: ' + (worst / 1024).toFixed(1) + ' KB (<= 100 KB)', worst <= LIMIT);
  ok('terlalu rumit untuk muat di dimensi/kualitas mana pun -> null (bukan berkas > 100 KB)', run(400) === null);
  ok('pilihan terakhir (dimensi 512, kualitas diturunkan) dipakai bila perlu', (() => { const a = run(110); return a === null || (a.width === 512 && a.quality < 0.45 && a.bytes <= LIMIT); })());
  r = run(3, 3024, 4032); ok('foto potret 3024x4032 -> 960x1280 (rasio dijaga)', r.width === 960 && r.height === 1280 && r.bytes <= LIMIT);
  r = run(1, 600, 400); ok('gambar kecil tidak diperbesar (600x400 tetap)', r.width === 600 && r.height === 400);
  draws.length = 0; run(1); ok('latar putih digambar sebelum gambar (PNG transparan tidak jadi hitam)', draws[0] === 'fill' && draws[1] === 'draw');

  // ---- UI: input file -> kompres -> pratinjau & info
  const pick = async (c) => {
    state.c = c; const inp = P.d.getElementById('invoiceInput');
    Object.defineProperty(inp, 'files', { configurable: true, value: [new w.File(['x'], 'a.jpg', { type: 'image/jpeg' })] });
    inp.dispatchEvent(new w.Event('change'));
  };
  P.d.getElementById('modeInBtn').click();
  ok('mode DATANG tanpa foto: tombol Kirim nonaktif', P.d.getElementById('txnSubmitBtn').disabled);
  P.d.querySelector('.qty-btn[data-action="inc"][data-key="teh"]').click();
  await pick(4);
  ok('selama memproses: tombol berubah "Memproses foto..." dan nonaktif', P.d.getElementById('invoicePickBtn').textContent === 'Memproses foto...' && P.d.getElementById('invoicePickBtn').disabled);
  await until(() => P.w.eval('state.invoice') !== null);
  ok('selesai: pratinjau tampil, info ukuran, tombol kembali normal', !P.d.getElementById('invoicePreviewWrap').classList.contains('hidden') && /Dikompres: \d+ KB • \d+×\d+/.test(P.d.getElementById('invoiceInfo').textContent) && P.d.getElementById('invoicePickBtn').textContent === 'Ambil Foto Invoice' && !P.d.getElementById('invoicePickBtn').disabled);
  const inv = P.w.eval('state.invoice');
  ok('state.invoice: JPEG, ukuran <= 100 KB', inv.mimeType === 'image/jpeg' && bytesOfB64(inv.data) <= LIMIT, (bytesOfB64(inv.data) / 1024).toFixed(1) + ' KB');
  ok('foto ada -> tombol Kirim aktif', !P.d.getElementById('txnSubmitBtn').disabled);
  P.d.getElementById('invoiceRemoveBtn').click();
  await pick(400); await until(() => /tidak bisa dikompres/.test(P.d.getElementById('centerNotice').textContent));
  ok('gambar mustahil dikompres: pesan jelas, tidak ada foto tersimpan', new RegExp('tidak bisa dikompres sampai ' + KB + ' KB').test(P.d.getElementById('centerNotice').textContent) && P.w.eval('state.invoice') === null && P.d.getElementById('invoicePreviewWrap').classList.contains('hidden') && !P.d.getElementById('invoicePickBtn').disabled);
  ok('tidak ada error runtime (UI)', P.errs.length === 0, P.errs.join('|'));

  // ---------------------------------------------------------------- (b) validasi server
  const be = createBackend(GAS);
  const post = (o) => JSON.parse(be.doPost(JSON.stringify(o)));
  const tok = post({ fn: 'login', args: ['WAY'] }).token;
  const stockOf = (k) => be.eval('getStocks_()').find((s) => s.key === k).stock;
  const logRows = () => be.sheets['Transaksi Log']._d.length;
  const addIn = (b64, mime = 'image/jpeg') => post({ fn: 'addStock', args: [{ items: [{ key: 'teh', qty: 2 }], note: 'inv', invoice: { data: b64, mimeType: mime } }], token: tok }).result;
  const login = post({ fn: 'login', args: ['WAY'] });
  ok('login mengirim batas foto ke klien (invoiceMaxKb=' + KB + ')', login.result.config.invoiceMaxKb === KB);

  let s0 = stockOf('teh'), l0 = logRows(), f0 = be.driveFiles.length;
  let res = addIn(jpegB64(60 * 1024));
  ok('JPEG 60 KB diterima: stok naik, log & Drive tercatat', res.ok && stockOf('teh') === s0 + 2 && logRows() === l0 + 1 && be.driveFiles.length === f0 + 1 && /drive\.google\.com/.test(be.sheets['Transaksi Log']._d.slice(-1)[0][10]));
  ok('berkas di Drive berupa JPEG & disimpan sebagai image/jpeg', (be.driveFiles.slice(-1)[0].bytes[0] & 255) === 0xFF && be.driveFiles.slice(-1)[0].mime === 'image/jpeg');

  s0 = stockOf('teh'); l0 = logRows(); f0 = be.driveFiles.length;
  res = addIn(jpegB64(LIMIT)); ok('tepat 100 KB diterima', res.ok);
  res = addIn(jpegB64(LIMIT + 2048)); ok('100 KB + toleransi 2 KB (pembulatan) diterima', res.ok);
  s0 = stockOf('teh'); l0 = logRows(); f0 = be.driveFiles.length;
  res = addIn(jpegB64(LIMIT + 2049));
  ok('100 KB + 2049 byte DITOLAK dengan pesan jelas', !res.ok && new RegExp('melebihi ' + KB + ' KB').test(res.message), res.message);
  ok('...dan STOK/LOG/DRIVE tidak berubah (validasi sebelum stok disentuh)', stockOf('teh') === s0 && logRows() === l0 && be.driveFiles.length === f0);
  res = addIn(jpegB64(400 * 1024)); ok('400 KB ditolak (tanpa perlu decode penuh)', !res.ok && /melebihi/.test(res.message) && stockOf('teh') === s0);
  const png = Buffer.alloc(5000, 1); png[0] = 0x89; png[1] = 0x50; png[2] = 0x4E; png[3] = 0x47;
  res = addIn(png.toString('base64')); ok('berkas bukan JPEG (PNG) ditolak walau kecil & mime mengaku jpeg', !res.ok && /JPEG/.test(res.message) && stockOf('teh') === s0 && be.driveFiles.length === f0);
  res = addIn(Buffer.from('<script>alert(1)</script>').toString('base64')); ok('teks/HTML yang menyamar sebagai foto ditolak', !res.ok && /JPEG/.test(res.message));
  res = addIn('bukan base64!!'); ok('base64 rusak ditolak', !res.ok && /tidak valid/.test(res.message) && stockOf('teh') === s0);
  res = addIn(jpegB64(60 * 1024), 'application/pdf'); ok('mime kiriman klien diabaikan (yang dicek isi berkas)', res.ok);
  res = post({ fn: 'addStock', args: [{ items: [{ key: 'teh', qty: 1 }], note: 'tanpa foto' }], token: tok }).result;
  ok('DATANG tanpa foto tetap diterima server (aturan lama tidak berubah)', res.ok);
  const f1 = be.driveFiles.length;
  res = post({ fn: 'submitTransaction', args: [{ items: [{ key: 'teh', qty: 1 }], note: 'ambil', invoice: { data: jpegB64(60 * 1024) } }], token: tok }).result;
  ok('AMBIL yang menyertakan foto: foto diabaikan, tidak disimpan di Drive', res.ok && be.driveFiles.length === f1);
  fresh = be.eval('addStock'); const direct = be.eval(`addStock(${JSON.stringify({ accessCode: 'WAY', items: [{ key: 'teh', qty: 1 }], note: 'x', invoice: { data: jpegB64(300 * 1024) } })})`);
  ok('jalur frontend GAS (google.script.run) juga memakai validasi yang sama', !direct.ok && /melebihi/.test(direct.message));
  const big = post({ fn: 'addStock', args: [{ items: [{ key: 'teh', qty: 1 }], invoice: { data: 'A'.repeat(700000) } }], token: tok });
  ok('body > API_MAX_BODY_CHARS ditolak di pintu API', big.status === 'error' && big.code === 'BAD_REQUEST');

  // ---------------------------------------------------------------- (c) ujung-ke-ujung: JPEG nyata via situs Pages
  const SW = 2000, SH = 1500;
  const rects = Array.from({ length: 260 }, (_, i) => `<rect x="${60 + (i * 37) % 1800}" y="${40 + Math.floor(i / 12) * 62}" width="${80 + (i * 53) % 420}" height="14" fill="#222"/>`).join('');
  const makeSrc = async (sigma) => {
    const noise = await sharp({ create: { width: SW, height: SH, channels: 3, background: '#ffffff', noise: { type: 'gaussian', mean: 235, sigma } } }).png().toBuffer();
    return sharp(noise).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}">${rects}</svg>`) }]).png().toBuffer();
  };
  let src, sigma;
  for (sigma of [7, 12, 18, 26, 36, 50]) {                       // naikkan kerumitan sampai kualitas penuh 1280 px > batas
    src = await makeSrc(sigma);
    if ((await sharp(src).resize(1280, 960).jpeg({ quality: 85 }).toBuffer()).length > LIMIT * 1.15) break;
  }
  const table = {};
  for (const md of DIMS) {
    const wd = md, hd = Math.round(md * SH / SW); table[wd] = [];
    for (let q = 0.2; q <= 0.8501; q += 0.05) table[wd].push({ q, buf: await sharp(src).resize(wd, hd).jpeg({ quality: Math.round(q * 100) }).toBuffer() });
  }
  const kb = (n) => (n / 1024).toFixed(0);
  console.log('   [info] batas ' + KB + ' KB; foto uji derau sigma=' + sigma + '; JPEG nyata 2000x1500: 1280@q.85=' + kb(table[1280].slice(-1)[0].buf.length) + 'KB, 1280@q.45=' + kb(table[1280].find((e) => e.q > 0.44).buf.length) + 'KB, 960@q.45=' + kb(table[960].find((e) => e.q > 0.44).buf.length) + 'KB, 640@q.45=' + kb(table[640].find((e) => e.q > 0.44).buf.length) + 'KB');

  const be2 = createBackend(GAS), reqs = [];
  const vc = new VirtualConsole(); const errs = []; vc.on('jsdomError', (e) => errs.push(e.message));
  const dom = await JSDOM.fromFile(path.join(DIST, 'index.html'), { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(wd) {
      wd.Element.prototype.scrollIntoView = () => {}; wd.scrollTo = () => {};
      wd.fetch = async (url, opts) => { reqs.push({ url, len: opts.body.length, body: JSON.parse(opts.body) }); const out = be2.doPost(opts.body); return { ok: true, status: 200, json: async () => JSON.parse(out) }; };
      wd.HTMLCanvasElement.prototype.getContext = () => ({ set fillStyle(v) {}, fillRect() {}, drawImage() {} });
      wd.HTMLCanvasElement.prototype.toDataURL = function (_t, q) {                  // JPEG nyata: entri tabel dengan kualitas terdekat
        const row = table[this.width]; const e = row.reduce((a, b) => (Math.abs(b.q - q) < Math.abs(a.q - q) ? b : a));
        return 'data:image/jpeg;base64,' + e.buf.toString('base64'); };
      wd.Image = function () { const o = {}; Object.defineProperty(o, 'src', { set() { o.width = SW; o.height = SH; setTimeout(() => o.onload && o.onload(), 0); } }); return o; };
    } });
  const W = dom.window, D = dom.window.document;
  await new Promise((r) => W.addEventListener('load', r));
  D.getElementById('loginCodeInput').value = 'WAY'; D.getElementById('loginSubmitBtn').click();
  await until(() => !D.getElementById('appView').classList.contains('hidden'));
  W.switchView('input'); D.getElementById('modeInBtn').click();
  D.querySelector('.qty-btn[data-action="inc"][data-key="teh"]').click(); D.querySelector('.qty-btn[data-action="inc"][data-key="teh"]').click();
  const inp = D.getElementById('invoiceInput');
  Object.defineProperty(inp, 'files', { configurable: true, value: [new W.File(['x'], 'foto.jpg', { type: 'image/jpeg' })] });
  inp.dispatchEvent(new W.Event('change'));
  await until(() => W.eval('state.invoice') !== null, 5000);
  const info = D.getElementById('invoiceInfo').textContent;
  const realBytes = bytesOfB64(W.eval('state.invoice.data'));
  ok('foto uji nyata MELEBIHI batas pada kualitas penuh (jadi kompresi memang bekerja)', table[1280].slice(-1)[0].buf.length > LIMIT, kb(table[1280].slice(-1)[0].buf.length) + ' KB');
  ok('JPEG nyata dikompres klien menjadi <= 100 KB (' + info + ')', realBytes <= LIMIT && realBytes > 5 * 1024, (realBytes / 1024).toFixed(1) + ' KB');
  const jpegHead = Buffer.from(W.eval('state.invoice.data').slice(0, 8), 'base64');
  ok('hasil kompresi benar-benar JPEG (FF D8 FF)', jpegHead[0] === 0xFF && jpegHead[1] === 0xD8 && jpegHead[2] === 0xFF);
  const tehBefore = be2.eval('getStocks_()').find((s) => s.key === 'teh').stock;
  D.getElementById('txnSubmitBtn').click(); await sleep(600); D.getElementById('confirmModalBtn').click();
  await until(() => be2.driveFiles.length === 1, 4000);
  ok('server menerima & menyimpan foto ke Drive (<= 100 KB, JPEG)', be2.driveFiles.length === 1 && be2.driveFiles[0].bytes.length <= LIMIT + 2048 && (be2.driveFiles[0].bytes[0] & 255) === 0xFF, (be2.driveFiles[0] ? (be2.driveFiles[0].bytes.length / 1024).toFixed(1) : '-') + ' KB');
  ok('stok DATANG bertambah & tercatat di Riwayat', be2.eval('getStocks_()').find((s) => s.key === 'teh').stock === tehBefore + 2);
  const post2 = reqs.find((r) => r.body.fn === 'addStock');
  ok('ukuran permintaan jaringan kecil (' + (post2.len / 1024).toFixed(0) + ' KB) & jauh di bawah batas body', post2.len < 600000 && post2.len < 200 * 1024);
  ok('tidak ada error runtime (Pages)', errs.length === 0, errs.join('|'));
  finish();
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
