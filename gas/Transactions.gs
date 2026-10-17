// ============================================================
//  Transactions.gs — correctStock, processTransaction_, deleteTransaction.
// ============================================================

/**
 * Koreksi Stok (Stock Opname) — KHUSUS ADMIN.
 * Berbeda dari submitTransaction/addStock yang bersifat +/- relatif,
 * fungsi ini langsung SET stok ke nilai aktual hasil hitung fisik,
 * dan mewajibkan alasan perubahan untuk keperluan audit.
 *
 * payload: { accessCode, key, actualStock, reason }
 *
 * Dicatat di log sebagai satu baris bertipe 'KOREKSI' dengan delta
 * (selisih lama→baru) sebagai qty item, supaya tetap kompatibel
 * dengan mekanisme reverse di deleteTransaction_ (qty>0=tambah ke
 * stok kalau dihapus, qty<0 ditandai via flag arah tersendiri).
 * Alasan koreksi disimpan di kolom Note.
 */
function correctStock(payload) {
  setupSystem_();

  const accessCode = String(payload && payload.accessCode ? payload.accessCode : '').trim().toUpperCase();

  let user;
  try   { user = assertCanAdmin_(accessCode); }
  catch (err) { return { ok: false, message: err.message }; }

  const key = resolveItemKey_(payload && payload.key);
  if (!key) {
    return { ok: false, message: 'Item tidak valid.' };
  }

  const actualStock = Math.max(0, parseInt(payload && payload.actualStock, 10) || 0);
  const reason = String((payload && payload.reason) || '').trim().slice(0, 150);
  if (!reason) {
    return { ok: false, message: 'Alasan koreksi wajib diisi.' };
  }

  const stockMap = getStockMap_();
  const before = Number(stockMap[key] || 0);
  const delta  = actualStock - before;

  if (delta === 0) {
    return { ok: false, message: 'Stok tercatat sudah sesuai, tidak ada perubahan.' };
  }

  stockMap[key] = actualStock;
  setStockMap_(stockMap);

  const txId = Utilities.getUuid().slice(0, 8).toUpperCase();
  const now  = new Date();
  const sign = delta > 0 ? '+' : '';
  const itemsText = `${getItemIcon_(key)}${getItemLabel_(key)} ${before}→${actualStock} (${sign}${delta})`;
  const noteText  = `Koreksi Stok: ${reason}`;

  appendTransactionLog_({
    timestamp: now, txId,
    userCode: user.code, userName: user.name, role: user.role,
    itemsJson: JSON.stringify([{ key, qty: Math.abs(delta) }]),
    itemsText,
    totalQty: Math.abs(delta),
    note: noteText,
    type: 'KOREKSI',
    invoiceUrl: ''
  });

  return {
    ok: true,
    message: `Stok ${getItemLabel_(key)} dikoreksi ke ${actualStock}.`,
    stocks: getStocks_()
  };
}

function processTransaction_(payload, isInbound) {
  const accessCode = String(payload && payload.accessCode ? payload.accessCode : '').trim().toUpperCase();

  let user;
  try   { user = assertCanWrite_(accessCode); }
  catch (err) { return { ok: false, message: err.message }; }

  const items = normalizeItems_(payload && payload.items);
  if (!items.length) return { ok: false, message: 'Item transaksi kosong.' };

  const note     = String((payload && payload.note) || '').trim().slice(0, 100);
  const stockMap = getStockMap_();

  // Stok BOLEH minus (tidak ada pengecekan kecukupan stok).
  if (items.some(it => it.qty > APP_CONFIG.MAX_QTY_PER_ITEM)) {
    return { ok: false, message: `Jumlah per item maksimal ${APP_CONFIG.MAX_QTY_PER_ITEM}.` };
  }

  // Waktu transaksi (susulan): validasi rentang + jangan melangkahi koreksi stok.
  const nowDate = new Date();
  const timeRes = resolveTxTime_(payload && payload.txTime, nowDate);
  if (!timeRes.ok) return { ok: false, message: timeRes.message };
  const txDate = timeRes.date;

  if (txDate.getTime() < nowDate.getTime() - 60000) {
    const conflict = findKoreksiConflict_(items, txDate);
    if (conflict) {
      return {
        ok: false,
        message: `Waktu transaksi ${getItemLabel_(conflict.key)} tidak boleh sebelum koreksi stok terakhir (${formatDate_(conflict.at)}). Minta Admin melakukan koreksi.`
      };
    }
  }

  for (const item of items) {
    const cur = Number(stockMap[item.key] || 0);
    stockMap[item.key] = isInbound ? cur + item.qty : cur - item.qty;
  }

  setStockMap_(stockMap);

  const txId      = Utilities.getUuid().slice(0, 8).toUpperCase();
  const now       = nowDate;
  const type      = isInbound ? 'MASUK' : 'KELUAR';
  const sign      = isInbound ? '+' : '-';
  const itemsText = items.map(it => `${getItemIcon_(it.key)}${getItemLabel_(it.key)} ${sign}${it.qty}`).join(', ');
  const totalQty  = items.reduce((a, b) => a + b.qty, 0);

  let invoiceUrl = '';
  if (isInbound && payload && payload.invoice && payload.invoice.data) {
    invoiceUrl = saveInvoice_(payload.invoice, txId);
  }

  appendTransactionLog_({
    timestamp: txDate, createdAt: now, txId,
    userCode: user.code, userName: user.name, role: user.role,
    itemsJson: JSON.stringify(items), itemsText, totalQty, note, type, invoiceUrl
  });

  return {
    ok: true,
    message: buildTxMessage_(isInbound, items, stockMap),
    stocks: getStocks_()
  };
}

function deleteTransaction(payload) {
  setupSystem_();

  const accessCode = String(payload && payload.accessCode ? payload.accessCode : '').trim().toUpperCase();
  let actor;
  try   { actor = assertCanWrite_(accessCode); }
  catch (err) { return { ok: false, message: err.message }; }

  const txId = String(payload && payload.txId ? payload.txId : '').trim().toUpperCase();
  if (!txId) return { ok: false, message: 'Tx ID tidak valid.' };

  const sheet = getSheet_(APP_CONFIG.LOG_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return { ok: false, message: 'Transaksi tidak ditemukan.' };

  const found = findLogRowByTxId_(txId);
  if (!found) return { ok: false, message: 'Transaksi tidak ditemukan.' };

  const { tx, rowIndex } = found;

  // Transaksi KOREKSI (Stock Opname) sengaja tidak boleh dihapus lewat jalur ini.
  // Reverse delta koreksi ambigu secara audit (apakah delta itu hasil opname yang
  // benar atau salah ketik admin), jadi kalau perlu dibetulkan, admin tinggal
  // melakukan koreksi baru dengan angka yang benar -- riwayatnya tetap utuh.
  if (tx.type === 'KOREKSI') {
    return { ok: false, message: 'Transaksi koreksi stok tidak dapat dihapus. Lakukan koreksi ulang jika perlu.' };
  }

  const isOwner = String(tx.userCode || '').trim().toUpperCase() === actor.code;
  const isAdmin = actor.role.toUpperCase() === 'ADMIN';
  if (!isOwner && !isAdmin) return { ok: false, message: 'Anda hanya bisa menghapus transaksi milik sendiri.' };

  let items = [];
  try { items = JSON.parse(tx.itemsJson || '[]'); } catch (_) { items = []; }

  // Guard koreksi stok (sama seperti Edit): transaksi yang berada SEBELUM koreksi/opname terakhir
  // item terkait tidak boleh dihapus -- hasil hitung fisik saat opname sudah memuatnya, sehingga
  // membalik stok sekarang akan menggeser angka opname. Berlaku untuk semua role, termasuk Admin.
  const rawRow = getLogRows_()[rowIndex - 2];
  const txDate = rawRow && rawRow[0] instanceof Date ? rawRow[0] : null;
  if (txDate) {
    const keys = items
      .map(it => ({ key: resolveItemKey_(it.key) }))
      .filter(k => k.key);
    const conflict = findKoreksiConflict_(keys, txDate);
    if (conflict) return { ok: false, message: koreksiConflictMessage_(conflict, 'dihapus') };
  }

  const isInbound = tx.type === 'MASUK';
  const stockMap  = getStockMap_();

  items.forEach(it => {
    const key = resolveItemKey_(it.key);
    const qty = Number(it.qty || 0);
    if (!key || qty <= 0) return;
    const cur = Number(stockMap[key] || 0);
    stockMap[key] = isInbound ? cur - qty : cur + qty; // tanpa clamp: stok boleh minus
  });

  setStockMap_(stockMap);

  sheet.deleteRow(rowIndex);
  invalidateLogCache_();

  if (tx.invoiceUrl) trashInvoiceByUrl_(tx.invoiceUrl);

  return {
    ok: true,
    message: 'Transaksi dihapus.',
    stocks: getStocks_(),
    recent: getRecentTransactions_()
  };
}

/**
 * Transaksi susulan tidak boleh berwaktu SEBELUM koreksi stok (opname) terakhir item yang sama,
 * karena hasil hitung fisik saat opname sudah memuat transaksi itu -> akan terhitung dua kali.
 */
function findKoreksiConflict_(items, txDate) {
  const wanted = {};
  items.forEach(it => { wanted[it.key] = true; });
  const latest = {};

  getLogRows_().forEach(row => {
    if (String(row[9] || '') !== 'KOREKSI') return;
    const ts = row[0];
    if (!(ts instanceof Date)) return;
    let list = [];
    try { list = JSON.parse(row[5] || '[]'); } catch (_) { list = []; }
    list.forEach(it => {
      const k = resolveItemKey_(it.key);
      if (k && wanted[k] && (!latest[k] || ts.getTime() > latest[k].getTime())) latest[k] = ts;
    });
  });

  for (const it of items) {
    const at = latest[it.key];
    if (at && txDate.getTime() < at.getTime()) return { key: it.key, at };
  }
  return null;
}

function buildTxMessage_(isInbound, items, stockMap) {
  const base  = isInbound ? 'Stok masuk tersimpan.' : 'Transaksi tersimpan.';
  const minus = items.filter(it => Number(stockMap[it.key] || 0) < 0).map(it => getItemLabel_(it.key));
  return minus.length ? `${base} ⚠️ Stok ${minus.join(', ')} minus.` : base;
}

// Pesan seragam untuk Edit & Hapus yang tertahan guard koreksi stok.
function koreksiConflictMessage_(conflict, aksi) {
  return `${getItemLabel_(conflict.key)}: transaksi ini berada sebelum koreksi stok terakhir (${formatDate_(conflict.at)}), sehingga tidak dapat ${aksi}. Lakukan koreksi stok baru jika perlu.`;
}
