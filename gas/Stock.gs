// ============================================================
//  Stock.gs — Helper stok (getStocks_, setStockMap_).
// ============================================================

// ── STOCK HELPERS ─────────────────────────────────────────────

function getStocks_() {
  const stockMap = getStockMap_();
  return Object.keys(ITEMS).map(key => {
    const item  = ITEMS[key];
    const stock = Number(stockMap[key] || 0);
    return { key, label: item.label, icon: item.icon, stock, level: getStockLevel_(stock), isSecondary: !!item.isSecondary, divisor: Number(item.consumptionDivisor) || 1 };
  });
}

// [OPT-07] Tulis hanya sel Stock+Level yang benar-benar berubah.
function setStockMap_(stockMap) {
  const sheet = getSheet_(APP_CONFIG.STOCK_SHEET_NAME);
  if (!sheet) throw new Error('Sheet Stok tidak ditemukan.');

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    // Sheet kosong — tulis penuh (edge case saat migrasi/reset).
    const rows = [
      ['Key', 'Label', 'Icon', 'Stock', 'Level'],
      ...Object.keys(ITEMS).map(key => {
        const stock = Number(stockMap[key] || 0);
        return [key, ITEMS[key].label, ITEMS[key].icon, stock, getStockLevel_(stock)];
      })
    ];
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    sheet.setFrozenRows(1);
    invalidateStockCache_();
    return;
  }

  // Baca existing (1 getValues call), diff, tulis hanya yang berubah.
  const existing = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const updates  = [];

  existing.forEach((row, i) => {
    const key      = resolveItemKey_(row[0]);
    if (!key) return;
    const newStock = Number(stockMap[key] || 0);
    const newLevel = getStockLevel_(newStock);
    if (newStock !== Number(row[3] || 0) || newLevel !== String(row[4] || '')) {
      updates.push({ rowIdx: i + 2, stock: newStock, level: newLevel });
    }
  });

  if (updates.length > 0) {
    if (updates.length === existing.length) {
      // Semua baris berubah — batch sekaligus lebih efisien.
      const data = existing.map((row, i) => {
        const key = resolveItemKey_(row[0]);
        const s   = Number(stockMap[key] || 0);
        return [s, getStockLevel_(s)];
      });
      sheet.getRange(2, 4, data.length, 2).setValues(data);
    } else {
      // Hanya baris tertentu — tulis per baris.
      updates.forEach(u => sheet.getRange(u.rowIdx, 4, 1, 2).setValues([[u.stock, u.level]]));
    }
  }

  invalidateStockCache_();
}

function getDefaultStockMap_() {
  const map = {};
  Object.keys(ITEMS).forEach(key => { map[key] = Number(ITEMS[key].initialStock || 0); });
  return map;
}
