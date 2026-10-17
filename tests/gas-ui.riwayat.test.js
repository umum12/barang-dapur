// Versi GAS: tampilan Riwayat — 10 awal, "Lihat Selengkapnya", label tanggal seragam, warna bergantian per hari, beban 61 hari.
const { openGas, loginUi, mkTx, ok, sleep, until, finish } = require('./helpers');

const p = (n) => String(n).padStart(2, '0');
function rows(days, perDay) {
  const out = []; let n = 0;
  for (let d = 0; d < days; d++) {
    const dt = new Date(2026, 9, 31 - d);
    for (let k = 0; k < perDay; k++) out.push(mkTx('H' + String(n++).padStart(7, '0'), { timestamp: `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()} ${p(16 - k * 2)}:00:00` }));
  }
  return out;
}
const LABEL = /^(Minggu|Senin|Selasa|Rabu|Kamis|Jum'at|Sabtu), \d{2} (Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember) \d{4}$/;
async function open(recent) {
  const P = await openGas({ recent }); await loginUi(P);
  P.w.switchView('riwayat'); await until(() => P.d.querySelector('.recent-item'));
  return P;
}
const items = (P) => P.d.querySelectorAll('.recent-item').length;

(async () => {
  let P = await open(rows(10, 2));   // 20 transaksi
  const btn = P.d.getElementById('riwayatToggleBtn');
  ok('awal: hanya 10 transaksi tampil', items(P) === 10);
  ok('tombol "Lihat Selengkapnya (10 lagi)"', /Lihat Selengkapnya \(10 lagi\)/.test(btn.textContent));
  btn.click(); await sleep(20);
  ok('klik: semua 20 tampil, tombol jadi "Sembunyikan Item"', items(P) === 20 && /Sembunyikan Item/.test(btn.textContent));
  btn.click(); await sleep(20);
  ok('klik lagi: kembali 10', items(P) === 10);
  btn.click(); await sleep(20);

  const hdrs = [...P.d.querySelectorAll('.recent-day-hdr')].map((e) => e.textContent);
  ok('label hari seragam "dddd, dd mmmm yyyy" (mis. ' + hdrs[0] + ')', hdrs.length > 0 && hdrs.every((h) => LABEL.test(h)));
  ok('tidak ada label relatif (Hari Ini / Kemarin / Hari Lalu)', !/Hari Ini|Kemarin|Hari Lalu/.test(P.d.getElementById('recentList').textContent));
  const tones = [...P.d.querySelectorAll('.recent-day')].map((g) => g.className.match(/tone-\d/)[0]);
  ok('hari berdampingan selalu berbeda warna (' + tones.join(' ') + ')', tones.length > 1 && tones.every((t, i) => i === 0 || t !== tones[i - 1]));

  P = await open(rows(4, 2));        // 8 transaksi
  ok('<= 10 transaksi: tombol tersembunyi', P.d.getElementById('riwayatToggleBtn').classList.contains('hidden') && items(P) === 8);

  P = await open(rows(61, 4));       // skenario terberat: 61 hari x 4
  ok('61 hari x 4: awal tetap 10 item di DOM (ringan)', items(P) === 10);
  const t0 = Date.now(); P.d.getElementById('riwayatToggleBtn').click(); const ms = Date.now() - t0;
  ok('expand 244 transaksi: semua tampil, 61 grup hari (render ' + ms + ' ms di simulator)', items(P) === 244 && P.d.querySelectorAll('.recent-day').length === 61 && ms < 3000);
  ok('tidak ada error runtime', P.errs.length === 0, P.errs.join('|'));
  finish();
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
