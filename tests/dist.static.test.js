// Struktur hasil build, manifest/ikon, determinisme versi, dan penjaga build. Berjalan pada SALINAN SEMENTARA repo.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const sharp = require('sharp');
const { ROOT, ok, finish } = require('./helpers');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-static-'));
for (const dir of ['gas', 'web', 'brand', 'tools']) fs.cpSync(path.join(ROOT, dir), path.join(TMP, dir), { recursive: true });
const D = path.join(TMP, 'dist');
const URL_OK = 'https://script.google.com/macros/s/AKfycbTEST123/exec';
const build = (args = `--exec-url ${URL_OK}`) => cp.execSync(`node tools/build.js --out dist ${args}`, { cwd: TMP, stdio: 'pipe' }).toString();
const ver = () => JSON.parse(fs.readFileSync(path.join(D, 'version.json'))).version;
const tryBuild = (args) => { try { build(args); return ''; } catch (e) { return String(e.stderr || e.message); } };

(async () => {
  build();
  const html = fs.readFileSync(path.join(D, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/\b(?:src|href)="([^"#]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|data:|mailto:)/.test(u));
  const missing = refs.filter((u) => !fs.existsSync(path.join(D, u.split('?')[0])));
  ok('semua src/href lokal di index.html ada (' + refs.length + ' berkas)', !missing.length, missing.join(','));
  ok('tanpa scriptlet <? ?>', !/<\?|\?>/.test(html));
  ok('tag PWA di <head>: manifest, theme-color, apple-touch-icon, viewport', /rel="manifest"/.test(html) && /theme-color" content="#6f4428"/.test(html) && /apple-touch-icon/.test(html) && /viewport-fit=cover/.test(html));
  const order = ['config.js', 'api-shim.js', 'app.js', 'pwa.js'].map((f) => html.indexOf('src="' + f));
  ok('urutan skrip: config -> shim -> app -> pwa', order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])));
  ok('tidak ada <script>/<style> inline sisa dari GAS', !/<script>[\s\S]/.test(html.replace(/<script src[^>]*><\/script>/g, '')) && !/<style>/.test(html));
  for (const f of ['app.js', 'sw.js', 'config.js', 'api-shim.js', 'pwa.js']) {
    let good = true; try { cp.execSync('node --check ' + path.join(D, f), { stdio: 'pipe' }); } catch (e) { good = false; }
    ok('sintaks valid: ' + f, good);
  }
  const m = JSON.parse(fs.readFileSync(path.join(D, 'manifest.webmanifest')));
  ok('manifest: name/short_name(<=12)/display/lang/id', m.name === 'Barang Dapur' && m.short_name.length <= 12 && m.display === 'standalone' && m.lang === 'id' && m.id === './');
  ok('manifest: start_url di dalam scope (relatif)', m.start_url.startsWith('./') && m.scope === './');
  ok('manifest: warna tema coklat', m.theme_color === '#6f4428' && m.background_color === '#f7f3ee');
  let iconsOk = true; const detail = [];
  for (const ic of m.icons) {
    const p = path.join(D, ic.src);
    if (!fs.existsSync(p)) { iconsOk = false; detail.push('hilang ' + ic.src); continue; }
    const meta = await sharp(p).metadata(); const [w, h] = ic.sizes.split('x').map(Number);
    if (meta.width !== w || meta.height !== h) { iconsOk = false; detail.push(ic.src + ' ' + meta.width + 'x' + meta.height); }
  }
  ok('manifest: semua ikon ada & ukuran sesuai deklarasi', iconsOk, detail.join(','));
  ok('manifest: ada 192 & 512 untuk purpose any DAN maskable', ['any', 'maskable'].every((p) => [192, 512].every((s) => m.icons.some((i) => i.purpose === p && i.sizes === s + 'x' + s))));
  ok('config.js memuat EXEC_URL', /AKfycbTEST123\/exec/.test(fs.readFileSync(path.join(D, 'config.js'), 'utf8')));
  ok('.nojekyll ada', fs.existsSync(path.join(D, '.nojekyll')));

  const v1 = ver(); build(); ok('build ulang tanpa perubahan -> versi sama', v1 === ver(), v1);
  const css = path.join(TMP, 'gas', 'Styles.html'), cssO = fs.readFileSync(css, 'utf8');
  fs.writeFileSync(css, cssO.replace('</style>', '.x{color:red}\n</style>')); build(); const v3 = ver(); fs.writeFileSync(css, cssO);
  ok('ubah CSS -> versi berubah (cache pasti diperbarui)', v3 !== v1);

  const rb = path.join(TMP, 'gas', 'JsRiwayat.html'), rbo = fs.readFileSync(rb, 'utf8');
  fs.writeFileSync(rb, rbo.trimEnd() + '\nfunction nyasar(){}\n');
  let msg = tryBuild(); fs.writeFileSync(rb, rbo);
  ok('BUILD MENOLAK kode di luar <script> (kelas bug yang dulu lolos)', /tanpa konten di luar/.test(msg));
  const jb = path.join(TMP, 'gas', 'JsBoot.html'), jbo = fs.readFileSync(jb, 'utf8');
  fs.writeFileSync(jb, jbo.replace('showLogin_();', 'fetch("/x");showLogin_();'));
  msg = tryBuild(); fs.writeFileSync(jb, jbo);
  ok('BUILD MENOLAK fetch() langsung di kode aplikasi', /fetch\(\) langsung/.test(msg));
  ok('BUILD MENOLAK tanpa URL (kecuali --allow-empty)', /belum diisi/.test(tryBuild('')) && tryBuild('--allow-empty') === '');
  ok('--out di luar subfolder repo ditolak (tidak menghapus repo)', /subfolder/.test(String(cp.spawnSync('node', ['tools/build.js', '--out', '.', '--allow-empty'], { cwd: TMP }).stderr)));

  fs.rmSync(TMP, { recursive: true, force: true });
  finish();
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
