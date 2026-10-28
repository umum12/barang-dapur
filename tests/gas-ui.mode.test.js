// Warna mode transaksi: AMBIL = merah, DATANG = hijau (tombol mode, baris aktif, tombol Kirim, konfirmasi, form edit) + kontras.
const fs = require('fs');
const path = require('path');
const { GAS, openGas, loginUi, longPress, mkTx, STOCKS, ok, sleep, until, finish } = require('./helpers');

const css = fs.readFileSync(path.join(GAS, 'Styles.html'), 'utf8');
const root = (name) => (css.match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})')) || [])[1];
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const rule = (sel) => { const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}')); return m ? m[1] : ''; };
const cls = (el) => [...el.classList];

(async () => {
  // ---- CSS & kontras (statis)
  ok('.mode-btn.out.active memakai var(--out); .mode-btn.in.active memakai var(--in)', /var\(--out\)/.test(rule('.mode-btn.out.active')) && /var\(--in\)/.test(rule('.mode-btn.in.active')));
  ok('tombol Kirim: .mode-out merah, .mode-in hijau', /var\(--out\)/.test(rule('.txn-submit-btn.mode-out')) && /var\(--in\)/.test(rule('.txn-submit-btn.mode-in')));
  ok('tombol .txn-submit-btn dasar (dipakai "Render Laporan") TETAP warna utama, tidak ikut merah', /var\(--primary\)/.test(rule('.txn-submit-btn')));
  ok('.btn-out merah & .btn-in hijau (konfirmasi)', /var\(--out\)/.test(rule('.btn-out')) && /var\(--in\)/.test(rule('.btn-in')));
  const out = root('out'), inn = root('in');
  ok(`kontras teks putih di merah ${out}: ${contrast('#ffffff', out).toFixed(1)}:1 (>= 4,5)`, contrast('#ffffff', out) >= 4.5);
  ok(`kontras teks putih di hijau ${inn}: ${contrast('#ffffff', inn).toFixed(1)}:1 (>= 4,5)`, contrast('#ffffff', inn) >= 4.5);
  ok('merah/hijau mode selaras dengan lencana Riwayat (merah = AMBIL, hijau = DATANG)', /\.recent-action\.in\{[^}]*--aman/.test(css.replace(/\s+/g, '')) && /\.recent-action\.out\{[^}]*--kritis/.test(css.replace(/\s+/g, '')));

  // ---- perilaku UI
  const P = await openGas(); await loginUi(P);
  const { w, d } = P;
  w.switchView('input');
  const submit = d.getElementById('txnSubmitBtn'), card = d.getElementById('txnCard'), confirmBtn = d.getElementById('confirmModalBtn');
  ok('awal (AMBIL): tombol Kirim bertanda mode-out, bukan mode-in; kartu terang', cls(submit).includes('mode-out') && !cls(submit).includes('mode-in') && !cls(card).includes('dark'));
  ok('awal: tombol mode AMBIL aktif', cls(d.getElementById('modeOutBtn')).includes('active') && !cls(d.getElementById('modeInBtn')).includes('active'));
  d.querySelector('.qty-btn[data-action="inc"][data-key="kopi"]').click();
  ok('baris yang diisi bertanda active-qty', !!d.querySelector('.txn-row.active-qty'));
  submit.click(); await sleep(600);
  ok('konfirmasi AMBIL: tombol OK merah (btn-out), bukan btn-primary', cls(confirmBtn).includes('btn-out') && !cls(confirmBtn).includes('btn-primary') && !cls(confirmBtn).includes('btn-in'));
  d.getElementById('cancelModalBtn').click();
  ok('modal ditutup: warna mode dibersihkan, kembali btn-primary', !cls(confirmBtn).includes('btn-out') && !cls(confirmBtn).includes('btn-in') && cls(confirmBtn).includes('btn-primary'));

  d.getElementById('modeInBtn').click();
  ok('mode DATANG: tombol Kirim bertanda mode-in (hijau), bukan mode-out; kartu gelap', cls(submit).includes('mode-in') && !cls(submit).includes('mode-out') && cls(card).includes('dark'));
  d.querySelector('.qty-btn[data-action="inc"][data-key="teh"]').click();
  w.eval('state.invoice = { data: "AAAA", mimeType: "image/jpeg" }'); w.renderTxnSection();
  submit.click(); await sleep(600);
  ok('konfirmasi DATANG: tombol OK hijau (btn-in)', cls(confirmBtn).includes('btn-in') && !cls(confirmBtn).includes('btn-out') && !cls(confirmBtn).includes('btn-primary'));
  d.getElementById('cancelModalBtn').click();
  d.getElementById('modeOutBtn').click();
  ok('kembali ke AMBIL: Kirim kembali merah', cls(submit).includes('mode-out') && !cls(submit).includes('mode-in'));
  d.getElementById('logoutBtn').click(); await sleep(50);
  ok('konfirmasi lain (logout) TIDAK ikut berwarna mode', cls(confirmBtn).includes('btn-primary') && !cls(confirmBtn).includes('btn-out') && !cls(confirmBtn).includes('btn-in'));
  d.getElementById('cancelModalBtn').click();

  // ---- form edit mengikuti jenis transaksi
  for (const [type, want, btn] of [['KELUAR', 'out', 'btn-out'], ['MASUK', 'in', 'btn-in']]) {
    const Q = await openGas({ recent: [mkTx('TX' + type, { type, itemsJson: '[{"key":"kopi","qty":3}]' })] }); await loginUi(Q);
    Q.w.switchView('riwayat'); await until(() => Q.d.querySelector('.recent-item'));
    await longPress(Q, Q.d.querySelector('.recent-item')); Q.d.getElementById('txActEditBtn').click(); await sleep(600);
    const rows = [...Q.d.querySelectorAll('.edit-row')], active = Q.d.querySelector('.edit-row.active-qty');
    const c = cls(Q.d.getElementById('confirmModalBtn'));
    ok(`edit ${type === 'KELUAR' ? 'AMBIL' : 'DATANG'}: baris bertanda "${want}" & tombol Simpan ${btn}`, rows.length === 8 && rows.every((r) => cls(r).includes(want)) && !!active && c.includes(btn) && !c.includes('btn-primary'));
    ok('tidak ada error runtime', Q.errs.length === 0, Q.errs.join('|'));
  }
  ok('tidak ada error runtime (utama)', P.errs.length === 0, P.errs.join('|'));
  finish();
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
