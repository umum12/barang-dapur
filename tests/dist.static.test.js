// Struktur hasil build, manifest/ikon, determinisme versi, dan penjaga build. Berjalan pada SALINAN SEMENTARA repo.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const sharp = require('sharp');
const { ROOT, ok, finish } = require('./helpers');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-static-'));
for (const dir of ['gas', 'web', 'brand', 'tools']) fs.cpSync(path.join(ROOT, dir), path.join(TMP, dir), { recursive: true });
const D = path.join(TMP, 'dist');
const URL_OK = 'https://script.google.com/macros/s/AKfycbTEST123/exec';
// Lingkungan bersih: di GitHub Actions GITHUB_REPOSITORY terisi otomatis dan akan mengubah manifest.id; tes harus deterministik.
const CLEAN_ENV = Object.assign({}, process.env, { GITHUB_REPOSITORY: '', BD_BASE_PATH: '', BD_EXEC_URL: '' });
const build = (args = `--exec-url ${URL_OK}`, env = {}) => cp.execSync(`node tools/build.js --out dist ${args}`, { cwd: TMP, stdio: 'pipe', env: Object.assign({}, CLEAN_ENV, env) }).toString();
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
  ok('manifest: name/short_name(<=12)/display/lang', m.name === 'Barang Dapur' && m.short_name.length <= 12 && m.display === 'standalone' && m.lang === 'id');
  // Identitas PWA sesuai spesifikasi: id di-resolve terhadap ORIGIN start_url; tanpa id = start_url.
  const identity = (man, repo) => { const start = new URL(man.start_url, `https://user.github.io/${repo}/manifest.webmanifest`); return man.id ? new URL(man.id, start.origin).href : start.href; };
  ok('identitas PWA unik per repo (bukan akar domain): ' + identity(m, 'barang-dapur'), identity(m, 'barang-dapur') === 'https://user.github.io/barang-dapur/' && identity(m, 'barang-dapur') !== identity(m, 'aplikasi-lain'));
  ok('start_url "./" tanpa query dan di dalam scope', m.start_url === './' && m.scope === './' && m.id === undefined);
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

  // Penjaga untuk file besar: Apps Script DIAM-DIAM memakai deklarasi terakhir bila ada nama fungsi/konstanta ganda.
  const gasDir = path.join(TMP, 'gas');
  const decl = (txt) => [...txt.matchAll(/^(?:async\s+)?function\s+(\w+)|^(?:const|let|var)\s+(\w+)/gm)].map((m) => m[1] || m[2]);
  const names = [];
  for (const f of fs.readdirSync(gasDir).filter((x) => x.endsWith('.gs'))) names.push(...decl(fs.readFileSync(path.join(gasDir, f), 'utf8')));
  const dupGs = names.filter((n, i) => names.indexOf(n) !== i);
  const appJs = fs.readFileSync(path.join(gasDir, 'App.html'), 'utf8');
  const namesJs = decl(appJs); const dupJs = namesJs.filter((n, i) => namesJs.indexOf(n) !== i);
  ok('tidak ada fungsi/konstanta top-level GANDA di *.gs (' + names.length + ' nama)', !dupGs.length, dupGs.join(','));
  ok('tidak ada fungsi/konstanta top-level GANDA di App.html (' + namesJs.length + ' nama)', !dupJs.length, dupJs.join(','));
  const files = fs.readdirSync(gasDir).sort().join(',');
  ok('struktur gas/: Code.gs, Gateway.gs, index.html, App.html, Styles.html', files === 'App.html,Code.gs,Gateway.gs,Styles.html,index.html', files);

  const v1 = ver(); build(); ok('build ulang tanpa perubahan -> versi sama', v1 === ver(), v1);
  const css = path.join(TMP, 'gas', 'Styles.html'), cssO = fs.readFileSync(css, 'utf8');
  fs.writeFileSync(css, cssO.replace('</style>', '.x{color:red}\n</style>')); build(); const v3 = ver(); fs.writeFileSync(css, cssO);
  ok('ubah CSS -> versi berubah (cache pasti diperbarui)', v3 !== v1);

  const mf = path.join(TMP, 'brand', 'manifest.webmanifest'), mfO = fs.readFileSync(mf, 'utf8');
  fs.writeFileSync(mf, mfO.replace('#6f4428', '#123456')); build(); const v4 = ver(); fs.writeFileSync(mf, mfO);
  ok('ubah manifest -> versi berubah (HP terpasang tidak memakai manifest lama dari cache)', v4 !== v1);
  const ic = path.join(TMP, 'brand', 'icons', 'icon-192.png'), icO = fs.readFileSync(ic);
  fs.writeFileSync(ic, Buffer.concat([icO, Buffer.from([0])])); build(); const v5 = ver(); fs.writeFileSync(ic, icO);
  ok('ubah ikon -> versi berubah', v5 !== v1);
  build(); ok('dikembalikan -> versi kembali sama (deterministik)', ver() === v1);

  const rb = path.join(TMP, 'gas', 'App.html'), rbo = fs.readFileSync(rb, 'utf8');
  fs.writeFileSync(rb, rbo.trimEnd() + '\nfunction nyasar(){}\n');
  let msg = tryBuild(); fs.writeFileSync(rb, rbo);
  ok('BUILD MENOLAK kode di luar <script> (kelas bug yang dulu lolos)', /tanpa konten di luar/.test(msg));
  const jb = path.join(TMP, 'gas', 'App.html'), jbo = fs.readFileSync(jb, 'utf8');
  fs.writeFileSync(jb, jbo.replace('showLogin_();', 'fetch("/x");showLogin_();'));
  msg = tryBuild(); fs.writeFileSync(jb, jbo);
  ok('BUILD MENOLAK fetch() langsung di kode aplikasi', /fetch\(\) langsung/.test(msg));
  ok('BUILD MENOLAK tanpa URL (kecuali --allow-empty)', /belum diisi/.test(tryBuild('')) && tryBuild('--allow-empty') === '');
  ok('--out di luar subfolder repo ditolak (tidak menghapus repo)', /subfolder/.test(String(cp.spawnSync('node', ['tools/build.js', '--out', '.', '--allow-empty'], { cwd: TMP }).stderr)));

  // ---- identitas manifest per repo (id = path repo mutlak; tidak menabrak PWA lain di user.github.io)
  const mid = () => JSON.parse(fs.readFileSync(path.join(D, 'manifest.webmanifest'))).id;
  build(); const vNo = ver();
  ok('tanpa path repo: manifest tanpa id (identitas = start_url, tetap unik per repo)', mid() === undefined);
  build(`--exec-url ${URL_OK} --base-path /barang-dapur/`); const vBase = ver();
  ok('--base-path /barang-dapur/ -> manifest.id = "/barang-dapur/" (bukan "./")', mid() === '/barang-dapur/');
  ok('id manifest ikut sidik jari versi (HP yang sudah memasang pasti mengambil manifest baru)', vBase !== vNo);
  build(`--exec-url ${URL_OK}`, { GITHUB_REPOSITORY: 'pemilik/barang-dapur' });
  ok('GITHUB_REPOSITORY (otomatis di Actions) pemilik/barang-dapur -> id "/barang-dapur/"', mid() === '/barang-dapur/');
  build(`--exec-url ${URL_OK}`, { GITHUB_REPOSITORY: 'pemilik/pemilik.github.io' });
  ok('repo situs-pengguna (pemilik.github.io) -> id "/"', mid() === '/');
  build(`--exec-url ${URL_OK} --base-path /dari-argumen/`, { GITHUB_REPOSITORY: 'pemilik/barang-dapur' });
  ok('--base-path menang atas GITHUB_REPOSITORY', mid() === '/dari-argumen/');
  fs.writeFileSync(path.join(TMP, 'tools', 'pages.config.json'), JSON.stringify({ execUrl: URL_OK, basePath: '/dari-config' }));
  cp.execSync('node tools/build.js --out dist', { cwd: TMP, stdio: 'pipe', env: CLEAN_ENV });
  ok('pages.config.json {basePath} dipakai & dinormalisasi ("/dari-config" -> "/dari-config/")', mid() === '/dari-config/');
  fs.rmSync(path.join(TMP, 'tools', 'pages.config.json'));
  for (const bad of ['../luar/', '/a b/', 'tanpa-garis']) {
    ok('--base-path tidak valid ditolak: ' + bad, /base-path tidak valid/.test(tryBuild(`--base-path "${bad}"`)));
  }

  fs.rmSync(TMP, { recursive: true, force: true });
  finish();
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
