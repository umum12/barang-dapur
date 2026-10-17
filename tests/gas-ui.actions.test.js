// Versi GAS: menu aksi long-press, perisai klik-hantu, edit transaksi DATANG, ID transaksi bertipe angka, hak akses.
const { openGas, loginUi, longPress, mkTx, STOCKS, ok, sleep, until, finish } = require('./helpers');

const IN = (id, extra = {}) => mkTx(id, Object.assign({ type: 'MASUK', itemsJson: '[{"key":"teh","qty":10}]', note: 'dus' }, extra));
async function openRiwayat(opts) {
  const P = await openGas(opts); await loginUi(P);
  P.w.switchView('riwayat'); await until(() => P.d.querySelector('.recent-item'));
  return P;
}
const popup = (P) => P.d.getElementById('modalBackdrop').style.display === 'flex';

(async () => {
  // ---- perisai klik-hantu
  let P = await openRiwayat({ recent: [mkTx('AAA11111')] });
  let el = P.d.querySelector('.recent-item'), bd = P.d.getElementById('modalBackdrop');
  const click = () => bd.dispatchEvent(new P.w.MouseEvent('click', { bubbles: true }));
  el.dispatchEvent(new P.w.Event('touchstart', { bubbles: true })); await sleep(700);
  ok('tahan 0,7 dtk: menu aksi muncul', popup(P));
  el.dispatchEvent(new P.w.Event('touchend', { bubbles: true })); await sleep(80); click(); await sleep(30);
  ok('klik hantu tepat setelah jari diangkat TIDAK menutup menu', popup(P));
  await sleep(600); click(); await sleep(30);
  ok('klik sungguhan di luar menu (>0,5 dtk) menutup menu', !popup(P));
  bd.style.display = 'none'; await sleep(600);
  el.dispatchEvent(new P.w.Event('touchstart', { bubbles: true })); await sleep(2200);
  el.dispatchEvent(new P.w.Event('touchend', { bubbles: true })); await sleep(80); click(); await sleep(30);
  ok('tahan LAMA (2,2 dtk) lalu lepas + klik hantu: menu tetap ada', popup(P));
  bd.style.display = 'none'; await sleep(600);
  await longPress(P, el); P.d.getElementById('txActDeleteBtn').dispatchEvent(new P.w.MouseEvent('click', { bubbles: true }));
  ok('menu aksi: tombol Hapus membuka konfirmasi hapus', P.d.getElementById('modalTitle').textContent === 'Hapus Transaksi');

  // ---- edit transaksi DATANG
  let payload = null;
  P = await openRiwayat({ recent: [IN('BBB22222', { invoiceUrl: 'https://drive.google.com/file/d/abcdefghijklmnopqrstuvwxyz1234/view' })],
    handlers: { editTransaction: (p) => { payload = p; return { ok: true, message: 'Transaksi diperbarui.', stocks: STOCKS, recent: [IN('BBB22222', { edited: true, editInfo: 'x' })] }; } } });
  await longPress(P, P.d.querySelector('.recent-item')); P.d.getElementById('txActEditBtn').click(); await sleep(600);
  ok('form edit DATANG: judul, 8 baris item, tombol Simpan Perubahan', P.d.getElementById('modalTitle').textContent.includes('Edit Transaksi') && P.d.querySelectorAll('.edit-row').length === 8 && P.d.getElementById('confirmModalBtn').textContent === 'Simpan Perubahan');
  ok('form edit: nilai awal dari transaksi (teh=10, catatan=dus)', P.d.querySelector('.edit-qty-input[data-key="teh"]').value === '10' && P.d.getElementById('editNoteInput').value === 'dus');
  const dec = P.d.querySelector('.edit-qty-btn[data-action="dec"][data-key="teh"]'); for (let i = 0; i < 6; i++) dec.click();
  ok('minus 6x: jumlah 4, proyeksi stok ditampilkan', P.d.querySelector('.edit-qty-input[data-key="teh"]').value === '4' && /stok → 14/.test(P.d.getElementById('editProj_teh').textContent));
  P.d.getElementById('confirmModalBtn').click(); await until(() => payload);
  ok('payload edit benar (txId, item, catatan, waktu tak diubah = kosong)', payload && payload.txId === 'BBB22222' && JSON.stringify(payload.items) === '[{"key":"teh","qty":4}]' && payload.note === 'dus' && payload.txTime === '');
  await until(() => P.d.querySelector('.recent-edited'));
  ok('berhasil: popup tertutup & badge DIEDIT', !popup(P) && !!P.d.querySelector('.recent-edited'));

  // ---- tanpa perubahan / validasi klien
  P = await openRiwayat({ recent: [IN('CCC33333')] });
  await longPress(P, P.d.querySelector('.recent-item')); P.d.getElementById('txActEditBtn').click(); await sleep(600);
  P.d.getElementById('confirmModalBtn').click(); await sleep(30);
  ok('simpan tanpa perubahan ditolak di klien', /Tidak ada perubahan/.test(P.d.getElementById('editTxError').textContent) && !P.calls.editTransaction);

  // ---- ID transaksi bertipe angka (Sheets menyimpan ID mirip angka sebagai bilangan)
  P = await openRiwayat({ recent: [mkTx(20250301123045), mkTx('7F3A9C1B')] });
  const rows = [...P.d.querySelectorAll('.recent-item')];
  await longPress(P, rows[0]);
  ok('ID bertipe ANGKA: menu aksi tetap terbuka', popup(P));
  P.d.getElementById('modalBackdrop').style.display = 'none'; await sleep(600);
  await longPress(P, rows[1]);
  ok('ID bertipe teks: menu aksi terbuka', popup(P));

  // ---- hak akses di klien
  P = await openRiwayat({ recent: [mkTx('KOR00001', { type: 'KOREKSI', userCode: 'ADMIN' })] });
  await longPress(P, P.d.querySelector('.recent-item'));
  ok('transaksi KOREKSI: tidak ada menu, muncul pemberitahuan', !popup(P) && /koreksi stok tidak dapat/i.test(P.d.getElementById('centerNotice').textContent));
  P = await openRiwayat({ recent: [mkTx('WAY00001', { userCode: 'WAY' })] });
  await longPress(P, P.d.querySelector('.recent-item'));
  ok('milik orang lain (bukan Admin): tidak ada menu, muncul pemberitahuan', !popup(P) && /milik sendiri/i.test(P.d.getElementById('centerNotice').textContent));
  P = await openRiwayat({ user: { code: 'ADMIN', name: 'Admin', role: 'ADMIN', labelRole: 'ADMIN', canSubmit: true }, recent: [mkTx('WAY00002', { userCode: 'WAY' })] });
  await longPress(P, P.d.querySelector('.recent-item'));
  ok('Admin: boleh membuka menu transaksi orang lain', popup(P));
  P = await openRiwayat({ user: { code: 'DEMO', name: 'Demo', role: 'DEMO', labelRole: 'READ ONLY', canSubmit: false }, recent: [mkTx('DEM00001')] });
  await longPress(P, P.d.querySelector('.recent-item'));
  ok('Demo (hanya-baca): long-press tidak membuka menu', !popup(P));
  finish();
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
