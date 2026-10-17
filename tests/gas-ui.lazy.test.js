// Versi GAS (google.script.run tiruan): riwayat dimuat saat menu dibuka — lazy, cache, usang, race, gagal, coba lagi, refresh.
const { openGas, loginUi, longPress, mkTx, ok, sleep, until, finish } = require('./helpers');

(async () => {
  let queue = [];
  const P = await openGas({ handlers: {
    getRiwayat: () => queue.shift() || { ok: true, recent: [mkTx('A0000001')] },
    editTransaction: () => ({ ok: true, message: 'Transaksi diperbarui.', stocks: require('./helpers').STOCKS, recent: [mkTx('A0000001', { edited: true, editInfo: 'x' })] })
  } });
  const { w, d, calls } = P;
  const list = () => d.getElementById('recentList');
  const state = () => list().querySelector('.report-spinner') ? 'SPINNER' : list().querySelector('#riwayatRetryBtn') ? 'ERROR' : list().querySelectorAll('.recent-item').length + ' tx';
  const STOCKS = require('./helpers').STOCKS;

  await loginUi(P);
  ok('setelah login: getRiwayat BELUM dipanggil', !calls.getRiwayat);
  queue = [{ __delay: 80, value: { ok: true, recent: [mkTx('A0000001')] } }];
  w.switchView('riwayat'); await sleep(10);
  ok('buka Riwayat: spinner tampil saat memuat', state() === 'SPINNER');
  await until(() => state() === '1 tx');
  ok('selesai: daftar tampil, 1x panggilan', state() === '1 tx' && calls.getRiwayat === 1);
  w.switchView('dashboard'); w.switchView('riwayat'); await sleep(30);
  ok('buka lagi tanpa perubahan: TIDAK memuat ulang', calls.getRiwayat === 1);
  w.applyServerResult_({ stocks: STOCKS, message: 'ok' });                        // simulasi simpan/koreksi
  w.switchView('input'); w.switchView('riwayat'); await until(() => calls.getRiwayat === 2);
  ok('setelah simpan: buka Riwayat memuat ulang', calls.getRiwayat === 2);
  await until(() => state() === '1 tx');

  await longPress(P, d.querySelector('.recent-item'));
  d.getElementById('txActEditBtn').click(); await sleep(600);
  w.setEditQty_('kopi', 5); d.getElementById('confirmModalBtn').click();
  await until(() => d.querySelector('.recent-edited'));
  ok('edit: daftar langsung diperbarui tanpa getRiwayat tambahan', calls.getRiwayat === 2 && !!d.querySelector('.recent-edited'));

  // race: simpan terjadi saat riwayat sedang dimuat -> hasil usang dibuang, dimuat ulang
  w.applyServerResult_({ stocks: STOCKS, message: 'ok' });
  queue = [{ __delay: 150, value: { ok: true, recent: [mkTx('OLD00001')] } }, { ok: true, recent: [mkTx('NEW00001'), mkTx('NEW00002')] }];
  const c = calls.getRiwayat; w.switchView('dashboard'); w.switchView('riwayat'); await sleep(40);
  w.applyServerResult_({ stocks: STOCKS, message: 'ok' });
  await until(() => [...d.querySelectorAll('.recent-item')].map((e) => e.dataset.txId).join() === 'NEW00001,NEW00002', 2000);
  ok('race: hasil usang dibuang, data terbaru dipakai', calls.getRiwayat === c + 2 && [...d.querySelectorAll('.recent-item')].map((e) => e.dataset.txId).join() === 'NEW00001,NEW00002');

  // gagal muat + coba lagi
  w.applyServerResult_({ stocks: STOCKS, message: 'ok' });
  queue = [{ __fail: 'x' }, { ok: true, recent: [mkTx('B1'), mkTx('B2'), mkTx('B3')] }];
  w.switchView('dashboard'); w.switchView('riwayat'); await until(() => state() === 'ERROR');
  ok('gagal muat: pesan + tombol "Coba lagi"', state() === 'ERROR');
  d.getElementById('riwayatRetryBtn').click(); await until(() => state() === '3 tx');
  ok('"Coba lagi" berhasil memuat', state() === '3 tx');

  // refresh saat di Riwayat
  const c2 = calls.getRiwayat; queue = [{ ok: true, recent: [mkTx('R1')] }];
  w.refreshDashboard(); await until(() => calls.getRiwayat === c2 + 1 && state() === '1 tx');
  ok('tombol refresh di Riwayat memuat ulang riwayat', calls.getRiwayat === c2 + 1 && state() === '1 tx');
  ok('tidak ada error runtime', P.errs.length === 0, P.errs.join('|'));
  finish();
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
