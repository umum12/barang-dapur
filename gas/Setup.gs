// ============================================================
//  Setup.gs — Inisialisasi sheet Stok & Log.
// ============================================================

// ── SETUP SYSTEM ─────────────────────────────────────────────
// Hanya menjaga 2 sheet dinamis: Stok dan Log.

function setupSystem() { return setupSystem_(); }

function setupSystem_() {
  const ss = getSpreadsheet_();
  if (!ss) throw new Error('Project harus bound ke Spreadsheet.');

  if (isSystemReady_()) return true;

  // Stok: inisialisasi dari initialStock jika belum ada.
  const stockSheet = ensureSheet_(APP_CONFIG.STOCK_SHEET_NAME);
  if (stockSheet.getLastRow() < 2) {
    const rows = [
      ['Key', 'Label', 'Icon', 'Stock', 'Level'],
      ...Object.keys(ITEMS).map(key => {
        const item  = ITEMS[key];
        const stock = Number(item.initialStock || 0);
        return [key, item.label, item.icon, stock, getStockLevel_(stock)];
      })
    ];
    stockSheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    stockSheet.setFrozenRows(1);
    stockSheet.autoResizeColumns(1, rows[0].length);
    invalidateStockCache_();
  }

  // Log: pastikan header row ada.
  const logSheet = ensureSheet_(APP_CONFIG.LOG_SHEET_NAME);
  if (logSheet.getLastRow() === 0) {
    const headers = ['Timestamp','Tx ID','User Code','User Name','Role',
                     'Items JSON','Items Text','Total Qty','Note','Type','Invoice URL','Dicatat Pada','Riwayat Edit'];
    logSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    logSheet.setFrozenRows(1);
    logSheet.autoResizeColumns(1, headers.length);
  }

  return true;
}

function isSystemReady_() {
  const stockSheet = getSheet_(APP_CONFIG.STOCK_SHEET_NAME);
  const logSheet   = getSheet_(APP_CONFIG.LOG_SHEET_NAME);

  if (!stockSheet || !logSheet) return false;

  const N = Object.keys(ITEMS).length;
  if (stockSheet.getLastRow() !== N + 1 || stockSheet.getLastColumn() < 5) return false;
  if (logSheet.getLastRow() < 1) return false;

  return true;
}

function ensureSheet_(name) {
  let sheet = getSheet_(name);
  if (!sheet) {
    sheet = getSpreadsheet_().insertSheet(name);
    _sheetCache[name] = sheet;
  }
  return sheet;
}
