// ============================================================
//  Utils.gs — Fungsi utilitas murni.
// ============================================================

// ── PURE UTILITIES ────────────────────────────────────────────

// Cocokkan key item TANPA peduli huruf besar/kecil dan kembalikan key kanonik dari ITEMS ('' bila tidak ada).
// Penting: key seperti 'airCup' (camelCase) TIDAK boleh di-lowercase mentah-mentah, karena
// ITEMS['aircup'] tidak ada -> item diam-diam terbuang dari transaksi, stok, koreksi & laporan.
let _itemKeyByLower = null;
function resolveItemKey_(raw) {
  if (!_itemKeyByLower) {
    _itemKeyByLower = {};
    Object.keys(ITEMS).forEach(k => { _itemKeyByLower[k.toLowerCase()] = k; });
  }
  return _itemKeyByLower[String(raw || '').trim().toLowerCase()] || '';
}

function normalizeItems_(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map(it => ({
      key: resolveItemKey_(it && it.key),
      qty: Math.max(0, parseInt(it && it.qty ? it.qty : 0, 10) || 0)
    }))
    .filter(it => it.key && it.qty > 0);
}

function getStockLevel_(stock) {
  const n = Number(stock || 0);
  if (n <= APP_CONFIG.DANGER_LEVEL)  return 'danger';
  if (n <= APP_CONFIG.WARNING_LEVEL) return 'warning';
  return 'safe';
}

function getItemLabel_(key) { return ITEMS[key] ? ITEMS[key].label : key; }
function getItemIcon_(key)  { return ITEMS[key] ? ITEMS[key].icon  : '•'; }

function toBoolean_(value) {
  const s = String(value || '').trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'YES' || s === 'YA';
}

function formatDate_(date) {
  if (!(date instanceof Date)) return String(date || '');
  return Utilities.formatDate(date, APP_CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
}

/**
 * Waktu transaksi dari frontend: string 'yyyy-MM-ddTHH:mm' (jam dinding WIB).
 * Kosong -> sekarang. Aturan: tidak boleh masa depan, maksimal BACKDATE_MAX_DAYS hari kalender ke belakang.
 */
function resolveTxTime_(raw, now) {
  const s = String(raw || '').trim();
  if (!s) return { ok: true, date: now };
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
    return { ok: false, message: 'Format waktu transaksi tidak valid.' };
  }
  const FMT = "yyyy-MM-dd'T'HH:mm";
  let d;
  try { d = Utilities.parseDate(s, APP_CONFIG.TIMEZONE, FMT); }
  catch (_) { return { ok: false, message: 'Format waktu transaksi tidak valid.' }; }

  if (d.getTime() > now.getTime() + APP_CONFIG.FUTURE_TOLERANCE_MIN * 60000) {
    return { ok: false, message: 'Waktu transaksi tidak boleh di masa depan.' };
  }
  const minDay  = Utilities.formatDate(new Date(now.getTime() - APP_CONFIG.BACKDATE_MAX_DAYS * 86400000), APP_CONFIG.TIMEZONE, 'yyyy-MM-dd');
  const minDate = Utilities.parseDate(minDay + 'T00:00', APP_CONFIG.TIMEZONE, FMT);
  if (d.getTime() < minDate.getTime()) {
    return { ok: false, message: `Tanggal transaksi maksimal ${APP_CONFIG.BACKDATE_MAX_DAYS} hari ke belakang.` };
  }
  return { ok: true, date: d.getTime() > now.getTime() ? now : d };
}
