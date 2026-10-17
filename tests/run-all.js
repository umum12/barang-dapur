#!/usr/bin/env node
/**
 * Menjalankan seluruh tes:  npm test   (atau  node tests/run-all.js [--verbose])
 * Langkah 1 membangun situs Pages uji ke tests/.dist (URL palsu); langkah 2 menjalankan tiap berkas *.test.js.
 */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const verbose = process.argv.includes('--verbose');

const build = spawnSync(process.execPath, ['tools/build.js', '--out', 'tests/.dist', '--exec-url', 'https://script.google.com/macros/s/AKfycbTEST123/exec'], { cwd: ROOT, encoding: 'utf8' });
if (build.status !== 0) { console.error(build.stderr || build.stdout); console.error('Build uji gagal; tes dihentikan.'); process.exit(1); }

const suites = [
  ['backend.e2e.test.js', 'Backend GAS (transaksi, edit/hapus, koreksi, riwayat, laporan, gateway & token)'],
  ['dist.static.test.js', 'Hasil build: struktur, manifest, ikon, versi, penjaga build'],
  ['sw.test.js', 'Service worker: cache & strategi fetch'],
  ['pwa.test.js', 'PWA: banner pembaruan, tombol pasang, offline'],
  ['pages.integration.test.js', 'Situs Pages -> fetch -> backend asli (end-to-end)'],
  ['gas-ui.lazy.test.js', 'UI versi GAS: riwayat dimuat saat dibuka'],
  ['gas-ui.actions.test.js', 'UI versi GAS: menu aksi, edit, klik-hantu, hak akses'],
  ['gas-ui.riwayat.test.js', 'UI versi GAS: tampilan & beban Riwayat']
];

let failed = 0, totalPass = 0, totalFail = 0;
for (const [file, desc] of suites) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join('tests', file)], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const p = (out.match(/^PASS/gm) || []).length, f = (out.match(/^FAIL/gm) || []).length;
  const bad = r.status !== 0 || f > 0 || /^CRASH/m.test(out);
  totalPass += p; totalFail += f; if (bad) failed++;
  console.log(`${bad ? 'GAGAL' : 'LULUS'}  ${file.padEnd(30)} ${String(p).padStart(3)} lulus ${String(f).padStart(2)} gagal  ${((Date.now() - t0) / 1000).toFixed(1)}s  ${desc}`);
  if (verbose || bad) console.log(out.split('\n').filter((l) => verbose || /^FAIL|^CRASH|Error/.test(l)).map((l) => '    ' + l).join('\n'));
}
console.log(`\nTotal: ${totalPass} lulus, ${totalFail} gagal, ${failed} berkas bermasalah`);
process.exit(failed ? 1 : 0);
