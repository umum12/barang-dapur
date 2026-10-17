// ============================================================
//  Cache.gs — Cache per-eksekusi: Spreadsheet, Sheet, Stok, Log.
// ============================================================

// ── CACHE PER-EKSEKUSI ───────────────────────────────────────
// [OPT-01] Spreadsheet instance — satu round-trip per eksekusi.
let _ss = null;
function getSpreadsheet_() {
  if (!_ss) _ss = SpreadsheetApp.getActiveSpreadsheet();
  return _ss;
}

// [OPT-02] Sheet instance — hindari getSheetByName() berulang.
let _sheetCache = {};
function getSheet_(name) {
  if (_sheetCache[name] !== undefined) return _sheetCache[name];
  _sheetCache[name] = getSpreadsheet_().getSheetByName(name);
  return _sheetCache[name];
}
function invalidateSheet_(name) { delete _sheetCache[name]; }

// [OPT-03] Stock map — baca sheet Stok maksimal 1× per request.
let _stockMapCache = null;
function getStockMap_() {
  if (_stockMapCache) return _stockMapCache;

  const sheet    = getSheet_(APP_CONFIG.STOCK_SHEET_NAME);
  const fallback = getDefaultStockMap_();

  if (!sheet || sheet.getLastRow() < 2) {
    _stockMapCache = fallback;
    return _stockMapCache;
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  const map    = { ...fallback };
  values.forEach(row => {
    const key = resolveItemKey_(row[0]);
    if (key) map[key] = Number(row[3] || 0);
  });

  _stockMapCache = map;
  return _stockMapCache;
}
function invalidateStockCache_() { _stockMapCache = null; }

// [OPT-05] Log rows — baca sheet Log maksimal 1× per request.
let _logRowsCache = null;
function getLogRows_() {
  if (_logRowsCache) return _logRowsCache;

  const sheet = getSheet_(APP_CONFIG.LOG_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) {
    _logRowsCache = [];
    return _logRowsCache;
  }

  _logRowsCache = sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues();
  return _logRowsCache;
}
function invalidateLogCache_() { _logRowsCache = null; }

/** Alias semantik untuk Report Engine. */
function getAllLogRows_() { return getLogRows_(); }
