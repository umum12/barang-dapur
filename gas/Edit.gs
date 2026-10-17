// ============================================================
//  Edit.gs — Edit transaksi AMBIL/DATANG (di tempat, Tx ID tetap).
//  Aturan: pemilik transaksi atau Admin (sama seperti hapus), non-demo.
//  Tidak bisa: tipe KOREKSI, mengubah tipe AMBIL<->DATANG, mengganti foto invoice.
//  Jejak audit: kolom 13 "Riwayat Edit" menyimpan kondisi SEBELUM tiap edit.
// ============================================================

function editTransaction(payload) {
  setupSystem_();
  // Lock: edit = baca-ubah-tulis pada baris tertentu; cegah bentrok dengan input/hapus bersamaan.
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); }
  catch (_) { return { ok: false, message: 'Sistem sedang sibuk, coba lagi sebentar.' }; }
  try { return editTransaction_(payload); }
  finally { lock.releaseLock(); }
}

function editTransaction_(payload) {
  const accessCode = String(payload && payload.accessCode ? payload.accessCode : '').trim().toUpperCase();
  let actor;
  try   { actor = assertCanWrite_(accessCode); }
  catch (err) { return { ok: false, message: err.message }; }

  const txId = String(payload && payload.txId ? payload.txId : '').trim().toUpperCase();
  if (!txId) return { ok: false, message: 'Tx ID tidak valid.' };

  const found = findLogRowByTxId_(txId);
  if (!found) return { ok: false, message: 'Transaksi tidak ditemukan.' };
  const { tx, rowIndex } = found;
  const rawRow = getLogRows_()[rowIndex - 2];

  if (tx.type === 'KOREKSI') {
    return { ok: false, message: 'Transaksi koreksi stok tidak dapat diubah. Lakukan koreksi ulang jika perlu.' };
  }
  const isOwner = String(tx.userCode || '').trim().toUpperCase() === actor.code;
  const isAdmin = String(actor.role || '').toUpperCase() === 'ADMIN';
  if (!isOwner && !isAdmin) return { ok: false, message: 'Anda hanya bisa mengubah transaksi milik sendiri.' };

  // --- Item baru (gabung duplikat) ---
  const newMap = {};
  normalizeItems_(payload && payload.items).forEach(it => { newMap[it.key] = (newMap[it.key] || 0) + it.qty; });
  if (!Object.keys(newMap).length) return { ok: false, message: 'Item transaksi kosong.' };
  if (Object.keys(newMap).some(k => newMap[k] > APP_CONFIG.MAX_QTY_PER_ITEM)) {
    return { ok: false, message: `Jumlah per item maksimal ${APP_CONFIG.MAX_QTY_PER_ITEM}.` };
  }

  // --- Item lama ---
  const oldMap = {};
  try {
    JSON.parse(tx.itemsJson || '[]').forEach(it => {
      const k = resolveItemKey_(it.key);
      const q = Number(it.qty || 0);
      if (k && q > 0) oldMap[k] = (oldMap[k] || 0) + q;
    });
  } catch (_) {}

  // --- Catatan & waktu ---
  const note        = String((payload && payload.note) || '').trim().slice(0, 100);
  const noteChanged = note !== String(tx.note || '');

  const now     = new Date();
  const oldDate = rawRow[0] instanceof Date ? rawRow[0] : now;
  let newDate   = oldDate;
  const rawTime = String((payload && payload.txTime) || '').trim(); // kosong = waktu tidak diubah
  if (rawTime) {
    const tr = resolveTxTime_(rawTime, now);
    if (!tr.ok) return { ok: false, message: tr.message };
    if (minuteKey_(tr.date) !== minuteKey_(oldDate)) newDate = tr.date;
  }
  const timeChanged = newDate !== oldDate;

  // --- Selisih ---
  const isInbound   = tx.type === 'MASUK';
  const sign        = isInbound ? 1 : -1;
  const allKeys     = Object.keys(Object.assign({}, oldMap, newMap));
  const changedKeys = allKeys.filter(k => (newMap[k] || 0) !== (oldMap[k] || 0));

  if (!changedKeys.length && !noteChanged && !timeChanged) {
    return { ok: false, message: 'Tidak ada perubahan.' };
  }

  // --- Guard koreksi stok: jangan melangkahi opname ---
  const affected = (timeChanged ? allKeys : changedKeys).map(key => ({ key }));
  if (affected.length) {
    const conflict = findKoreksiConflict_(affected, newDate) || (timeChanged ? findKoreksiConflict_(affected, oldDate) : null);
    if (conflict) {
      return {
        ok: false,
        message: koreksiConflictMessage_(conflict, 'diubah')
      };
    }
  }

  // --- Terapkan stok (selisih saja) ---
  const stockMap = getStockMap_();
  const before   = {};
  changedKeys.forEach(k => {
    before[k] = Number(stockMap[k] || 0);
    stockMap[k] = before[k] + sign * ((newMap[k] || 0) - (oldMap[k] || 0)); // boleh minus
  });
  if (changedKeys.length) setStockMap_(stockMap);

  // --- Tulis ulang baris log ---
  const items     = Object.keys(ITEMS).filter(k => newMap[k]).map(k => ({ key: k, qty: newMap[k] }));
  const itemsText = items.map(it => `${getItemIcon_(it.key)}${getItemLabel_(it.key)} ${isInbound ? '+' : '-'}${it.qty}`).join(', ');
  const totalQty  = items.reduce((a, b) => a + b.qty, 0);
  const created   = rawRow[11] instanceof Date ? rawRow[11] : oldDate;

  const entry = `✎ ${actor.name} ${formatDate_(now)} — sebelum: ${tx.itemsText}`
              + (timeChanged ? ` @${formatDate_(oldDate)}` : '')
              + (noteChanged ? ` ket: ${tx.note || '-'}` : '');
  let info = (tx.editInfo ? tx.editInfo + ' | ' : '') + entry;
  while (info.length > 500 && info.indexOf(' | ') > -1) info = info.slice(info.indexOf(' | ') + 3);
  info = info.slice(0, 500);

  const sheet = getSheet_(APP_CONFIG.LOG_SHEET_NAME);
  ensureExtraHeaders_(sheet);
  try {
    sheet.getRange(rowIndex, 1, 1, 13).setValues([[
      newDate, tx.txId, tx.userCode, tx.userName, tx.role,
      JSON.stringify(items), itemsText, totalQty, note, tx.type, tx.invoiceUrl,
      created, info
    ]]);
  } catch (err) {
    if (changedKeys.length) { changedKeys.forEach(k => { stockMap[k] = before[k]; }); setStockMap_(stockMap); }
    throw err;
  }
  invalidateLogCache_();

  const minus = changedKeys.filter(k => Number(stockMap[k] || 0) < 0).map(getItemLabel_);
  return {
    ok: true,
    message: 'Transaksi diperbarui.' + (minus.length ? ` ⚠️ Stok ${minus.join(', ')} minus.` : ''),
    stocks: getStocks_(),
    recent: getRecentTransactions_()
  };
}

function minuteKey_(d) {
  return Utilities.formatDate(d, APP_CONFIG.TIMEZONE, 'yyyyMMddHHmm');
}
