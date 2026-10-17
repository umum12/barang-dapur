// ============================================================
//  Report.gs — getMonthlyReport.
// ============================================================

function getMonthlyReport(payload) {
  setupSystem_();

  const accessCode = String(payload && payload.accessCode ? payload.accessCode : '').trim().toUpperCase();
  const user = resolveUserOrAdmin_(accessCode);

  const now   = new Date();
  const year  = parseInt(payload && payload.year,  10) || now.getFullYear();
  const month = parseInt(payload && payload.month, 10) || (now.getMonth() + 1);

  const monthStart  = new Date(year, month - 1, 1, 0, 0, 0);
  const monthEnd    = new Date(year, month,     1, 0, 0, 0);
  const daysInMonth = new Date(year, month,     0).getDate();

  const rows     = getAllLogRows_();
  const stockNow = getStockMap_();

  const monthStartTime = monthStart.getTime();
  const monthEndTime   = monthEnd.getTime();

  const itemKeys = Object.keys(ITEMS);
  const perItem  = {};
  itemKeys.forEach(key => {
    perItem[key] = {
      key, label: ITEMS[key].label, icon: ITEMS[key].icon,
      masukBulanIni: 0, keluarBulanIni: 0,
      masukSetelahBulan: 0, keluarSetelahBulan: 0,
      // [Revisi] Koreksi dipisah total dari masuk/keluar asli -- supaya
      // tidak ikut tercampur ke kolom "Tambahan Stok" / "Usage" di laporan,
      // tapi tetap dihormati di rekonsiliasi mundur (stokAwal/stokAkhir).
      koreksiNaikBulanIni: 0, koreksiTurunBulanIni: 0,
      koreksiNaikSetelahBulan: 0, koreksiTurunSetelahBulan: 0,
      dailyUsage: new Array(daysInMonth).fill(0)
    };
  });

  // [Poin 3] Catat detail tiap koreksi BULAN INI (item, before→after, delta,
  // alasan, siapa, kapan) untuk ditampilkan sebagai catatan kecil di laporan.
  const koreksiLog = [];

  rows.forEach(row => {
    const ts = row[0];
    if (!(ts instanceof Date)) return;
    const tsTime = ts.getTime();

    const inThisMonth    = tsTime >= monthStartTime && tsTime < monthEndTime;
    const afterThisMonth = tsTime >= monthEndTime;
    if (!inThisMonth && !afterThisMonth) return;

    let items = [];
    try { items = JSON.parse(row[5] || '[]'); } catch (_) { items = []; }
    const txType    = String(row[9] || '');
    const isInbound = txType === 'MASUK';
    const isKoreksi = txType === 'KOREKSI';

    items.forEach(it => {
      const key = resolveItemKey_(it.key);
      const qty = Number(it.qty || 0);
      if (!key || !perItem[key] || qty <= 0) return;

      if (isKoreksi) {
        const deltaUp = String(row[6] || '').includes('(+');
        if (inThisMonth) {
          if (deltaUp) perItem[key].koreksiNaikBulanIni  += qty;
          else         perItem[key].koreksiTurunBulanIni += qty;

          koreksiLog.push({
            key,
            label: ITEMS[key].label,
            icon: ITEMS[key].icon,
            timestamp: formatDate_(ts),
            delta: deltaUp ? qty : -qty,
            itemsText: row[6] || '',
            note: String(row[8] || '').replace(/^Koreksi Stok:\s*/i, ''),
            userName: row[3] || ''
          });
        } else {
          if (deltaUp) perItem[key].koreksiNaikSetelahBulan  += qty;
          else         perItem[key].koreksiTurunSetelahBulan += qty;
        }
        return;
      }

      if (inThisMonth) {
        if (isInbound) { perItem[key].masukBulanIni += qty; }
        else           { perItem[key].keluarBulanIni += qty; perItem[key].dailyUsage[ts.getDate() - 1] += qty; }
      } else {
        if (isInbound) perItem[key].masukSetelahBulan  += qty;
        else           perItem[key].keluarSetelahBulan += qty;
      }
    });
  });

  const items = REPORT_ITEM_ORDER
    .filter(key => ITEMS[key] && !ITEMS[key].isSecondary)
    .map(key => {
      const p       = perItem[key];
      const current = Number(stockNow[key] || 0);

      // Rekonsiliasi mundur: koreksi dihitung sebagai pergerakan stok juga
      // (supaya stokAwal/stokAkhir tetap matematis akurat secara anchor),
      // TAPI sekarang juga diekspos eksplisit sebagai kolom "koreksi" netral
      // di tabel ringkasan -- bukan disembunyikan diam-diam ke stokAwal saja.
      // Keputusan: Opsi B (transparan) -- koreksi tidak diklaim sebagai usage
      // atau tambahan stok, ditampilkan apa adanya sebagai delta bersih.
      const pergerakanSetelahBulan = (p.masukSetelahBulan - p.keluarSetelahBulan)
                                    + (p.koreksiNaikSetelahBulan - p.koreksiTurunSetelahBulan);
      const stokAkhir = current - pergerakanSetelahBulan;

      const koreksiBulanIni = p.koreksiNaikBulanIni - p.koreksiTurunBulanIni;

      const stokAwal = stokAkhir
                      - p.masukBulanIni + p.keluarBulanIni
                      - koreksiBulanIni;

      return {
        key: p.key, label: p.label, icon: p.icon,
        stokAwal, tambahanStok: p.masukBulanIni, usage: p.keluarBulanIni,
        koreksi: koreksiBulanIni,
        stokAkhir, dailyUsage: p.dailyUsage
      };
    });

  // Urutkan catatan koreksi: terbaru dulu, lalu kelompokkan per item di frontend.
  koreksiLog.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  return {
    ok: true, year, month, daysInMonth,
    generatedAt: formatDate_(now),
    user: { code: user.code, name: user.name, role: user.role, labelRole: user.labelRole },
    items,
    koreksiLog
  };
}
