#!/usr/bin/env node
/**
 * tools/build.js — membangun situs statis GitHub Pages dari SUMBER YANG SAMA dengan frontend GAS.
 *
 *   node tools/build.js --exec-url https://script.google.com/macros/s/XXXX/exec        (hasil: docs/)
 *   node tools/build.js --out dist                                                     (CI; URL dari env BD_EXEC_URL)
 *   node tools/build.js --allow-empty                                                  (tanpa URL; isi config.js manual)
 *
 * URL /exec dicari berurutan: --exec-url, env BD_EXEC_URL, tools/pages.config.json {"execUrl": "..."}.
 * Tanpa dependensi npm. Hanya butuh Node 16+.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const GAS = path.join(ROOT, 'gas');
const BRAND = path.join(ROOT, 'brand');
const WEB = path.join(ROOT, 'web');

function fail(msg) { console.error('\nBUILD GAGAL: ' + msg + '\n'); process.exit(1); }
function sha(...parts) { const h = crypto.createHash('sha256'); parts.forEach((p) => h.update(p)); return h.digest('hex').slice(0, 10); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { fail('Tidak bisa membaca ' + path.relative(ROOT, p)); } }

// ---------- argumen ----------
const argv = process.argv.slice(2);
function opt(name) { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : undefined; }
const allowEmpty = argv.includes('--allow-empty');
const outDir = path.resolve(ROOT, opt('out') || 'docs');

if (outDir === ROOT || !outDir.startsWith(ROOT + path.sep)) fail('--out harus berupa subfolder di dalam repo (mis. docs atau dist).');

let pagesCfg = {};
const cfgPath = path.join(__dirname, 'pages.config.json');
if (fs.existsSync(cfgPath)) { try { pagesCfg = JSON.parse(read(cfgPath)); } catch (e) { fail('tools/pages.config.json bukan JSON valid.'); } }
let execUrl = opt('exec-url') || process.env.BD_EXEC_URL || pagesCfg.execUrl || '';

// Alamat dasar situs (path repo), mis. /barang-dapur/ -> dipakai sebagai "id" manifest. Urutan: --base-path, env BD_BASE_PATH,
// GITHUB_REPOSITORY (otomatis di GitHub Actions), pages.config.json {"basePath"}. Tidak diketahui -> id dihilangkan.
function normBasePath(v) {
  let p = String(v || '').trim();
  if (!p) return '';
  if (!/^\/[A-Za-z0-9._~\-\/]*$/.test(p) || /\.\./.test(p)) fail('--base-path tidak valid: "' + p + '". Contoh: /barang-dapur/');
  if (!p.endsWith('/')) p += '/';
  return p.replace(/\/{2,}/g, '/');
}
let basePath = normBasePath(opt('base-path') || process.env.BD_BASE_PATH || '');
if (!basePath && process.env.GITHUB_REPOSITORY) {
  const repoName = process.env.GITHUB_REPOSITORY.split('/')[1] || '';
  if (repoName) basePath = /\.github\.io$/i.test(repoName) ? '/' : '/' + repoName + '/';
}
if (!basePath) basePath = normBasePath(pagesCfg.basePath);
execUrl = String(execUrl).trim();
const URL_RE = /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+\/)?macros\/s\/[A-Za-z0-9_-]+\/exec$/;
if (!execUrl && !allowEmpty) fail('URL Web App belum diisi. Pakai --exec-url, env BD_EXEC_URL, atau tools/pages.config.json (atau --allow-empty lalu edit config.js).');
if (execUrl && !URL_RE.test(execUrl)) console.warn('PERINGATAN: URL tidak berbentuk https://script.google.com/macros/s/<ID>/exec — pastikan itu URL deployment "Web app" (bukan /dev).');

// ---------- baca sumber GAS ----------
const indexSrc = read(path.join(GAS, 'index.html'));
const INCLUDE_RE = /<\?!=\s*include\('([A-Za-z0-9_]+)'\)\s*\?>/g;
const includes = [...indexSrc.matchAll(INCLUDE_RE)].map((m) => m[1]);
if (!includes.includes('Styles')) fail("index.html tidak meng-include 'Styles'.");
const jsModules = includes.filter((n) => n !== 'Styles');
if (!jsModules.length) fail('index.html tidak meng-include modul JavaScript (mis. include(\'App\')).');

function unwrap(name, tag) {
  const text = read(path.join(GAS, name + '.html'));
  const m = new RegExp('^\\s*<' + tag + '>([\\s\\S]*)</' + tag + '>\\s*$').exec(text);
  if (!m) fail(name + '.html harus persis satu blok <' + tag + '>…</' + tag + '> tanpa konten di luarnya.');
  if (/<\?|\?>/.test(m[1])) fail(name + '.html memuat scriptlet <? ?> yang tidak bisa dijalankan di situs statis.');
  return m[1].replace(/^\n+|\s+$/g, '') + '\n';
}

const css = unwrap('Styles', 'style');
const appJs = jsModules.map((n) => '/* ===== ' + n + ' ===== */\n' + unwrap(n, 'script')).join('\n');
const shim = read(path.join(WEB, 'api-shim.js'));
const pwa = read(path.join(WEB, 'pwa.js'));
const swTemplate = read(path.join(WEB, 'sw.template.js'));

// Aplikasi harus memanggil server hanya lewat google.script.run (yang disediakan shim).
if (/\bfetch\s*\(/.test(appJs)) fail('Kode aplikasi memanggil fetch() langsung; semua panggilan server harus lewat google.script.run.');

// ---------- manifest ----------
const manifest = JSON.parse(read(path.join(BRAND, 'manifest.webmanifest')));
// ISOLASI IDENTITAS. Chrome meng-resolve "id" terhadap ORIGIN, BUKAN folder repo: id "./" => https://user.github.io/ dan
// menabrak semua PWA lain di domain itu ("sudah terpasang" padahal bukan). Maka id ditulis sebagai path repo yang mutlak
// (mis. "/barang-dapur/") sehingga identitasnya https://user.github.io/barang-dapur/ — SAMA dengan identitas yang diturunkan dari
// start_url, jadi tidak mengubah identitas aplikasi yang sudah terpasang. Bila path repo tak diketahui, id dihilangkan
// (identitas otomatis = start_url, tetap unik per repo). start_url & scope relatif ("./") tidak pernah menyentuh folder lain.
if (basePath) manifest.id = basePath; else delete manifest.id;

// Versi = sidik jari SEMUA yang disajikan dari cache service worker (kode, manifest, ikon). Bila manifest/ikon berubah tetapi
// versi tidak, HP yang sudah memasang aplikasi akan terus memakai salinan lama dari cache.
const assetFiles = ['favicon.svg', 'favicon.ico'].map((f) => path.join(BRAND, f))
  .concat(fs.readdirSync(path.join(BRAND, 'icons')).filter((f) => f.endsWith('.png')).sort().map((f) => path.join(BRAND, 'icons', f)));
const version = sha(css, appJs, shim, pwa, indexSrc, swTemplate, JSON.stringify(manifest), ...assetFiles.map((f) => fs.readFileSync(f)));

// ---------- index.html ----------
const headExtra = [
  '  <meta name="theme-color" content="#6f4428" />',
  '  <link rel="manifest" href="manifest.webmanifest" />',
  '  <link rel="icon" href="favicon.svg" type="image/svg+xml" />',
  '  <link rel="icon" href="favicon.ico" sizes="48x48" />',
  '  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png" />',
  '  <meta name="mobile-web-app-capable" content="yes" />',
  '  <meta name="apple-mobile-web-app-capable" content="yes" />',
  '  <meta name="apple-mobile-web-app-title" content="Barang Dapur" />',
  '  <meta name="apple-mobile-web-app-status-bar-style" content="default" />'
].join('\n');

let seenJs = false;
let index = indexSrc.replace(INCLUDE_RE, (_m, name) => {
  if (name === 'Styles') return '<link rel="stylesheet" href="app.css?v=' + version + '" />';
  if (seenJs) return '';
  seenJs = true;
  return [
    '<script src="config.js"></script>',
    '  <script src="api-shim.js?v=' + version + '"></script>',
    '  <script src="app.js?v=' + version + '"></script>',
    '  <script src="pwa.js?v=' + version + '"></script>'
  ].join('\n');
});
if (!/<\/head>/.test(index)) fail('index.html tidak punya </head>.');
index = index.replace('</head>', headExtra + '\n</head>').replace(/\n[ \t]*\n[ \t]*\n+/g, '\n\n');
if (/<\?|\?>/.test(index)) fail('Masih ada scriptlet <? ?> di index.html hasil build.');


// ---------- tulis keluaran ----------
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'icons'), { recursive: true });
const put = (rel, data) => fs.writeFileSync(path.join(outDir, rel), data);

put('index.html', index);
put('app.css', css);
put('app.js', appJs);
put('api-shim.js', shim);
put('pwa.js', pwa);
put('config.js',
  '// Dibuat oleh tools/build.js. BOLEH diedit manual: cukup ganti EXEC_URL lalu muat ulang (tanpa build ulang).\n' +
  'window.BD_CONFIG = ' + JSON.stringify({ EXEC_URL: execUrl, APP_VERSION: version }, null, 2) + ';\n');
put('manifest.webmanifest', JSON.stringify(manifest, null, 2) + '\n');
['favicon.svg', 'favicon.ico'].forEach((f) => fs.copyFileSync(path.join(BRAND, f), path.join(outDir, f)));
fs.readdirSync(path.join(BRAND, 'icons')).filter((f) => f.endsWith('.png'))
  .forEach((f) => fs.copyFileSync(path.join(BRAND, 'icons', f), path.join(outDir, 'icons', f)));
put('.nojekyll', '');

const precache = [
  'index.html',
  'app.css?v=' + version, 'app.js?v=' + version, 'api-shim.js?v=' + version, 'pwa.js?v=' + version,
  'manifest.webmanifest', 'favicon.svg', 'favicon.ico',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];
precache.forEach((u) => { if (!fs.existsSync(path.join(outDir, u.split('?')[0]))) fail('Berkas precache tidak ada: ' + u); });
put('sw.js', swTemplate.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache, null, 2)));
put('version.json', JSON.stringify({ version }, null, 2) + '\n');

const kb = (f) => (fs.statSync(path.join(outDir, f)).size / 1024).toFixed(0) + ' KB';
console.log('Build selesai -> ' + path.relative(ROOT, outDir) + '/');
console.log('  versi   : ' + version);
console.log('  base path: ' + (basePath ? basePath + '  (id manifest = "' + basePath + '")' : '(tidak diketahui -> manifest tanpa id; identitas = start_url)'));
console.log('  exec URL: ' + (execUrl || '(kosong — isi config.js)'));
console.log('  modul   : ' + jsModules.join(', '));
console.log('  ukuran  : app.js ' + kb('app.js') + ' | app.css ' + kb('app.css') + ' | index.html ' + kb('index.html'));
