// ============================================================
//  Log.gs — Helper log transaksi.
// ============================================================

// ── LOG HELPERS ───────────────────────────────────────────────

// Riwayat = SELURUH transaksi sejak tanggal 1 bulan (bulan ini - RECENT_MONTHS_BACK) 00:00 WIB.
// Contoh RECENT_MONTHS_BACK=1 dan hari ini 6 Okt -> mulai 1 Sep; Agustus tidak ikut.
// Semua baris Log sudah ada di memori (getLogRows_), jadi menyaring di sini murah.
// Disaring berdasarkan WAKTU TRANSAKSI (bukan urutan baris), sebab transaksi susulan & edit
// bisa membuat urutan baris tidak sama dengan urutan waktu.
function getRecentWindowStart_(now) {
  const ym = Utilities.formatDate(now, APP_CONFIG.TIMEZONE, 'yyyy-MM').split('-');
  const idx = Number(ym[0]) * 12 + (Number(ym[1]) - 1) - APP_CONFIG.RECENT_MONTHS_BACK;
  const y = Math.floor(idx / 12);
  const m = String(idx % 12 + 1).padStart(2, '0');
  return Utilities.parseDate(`${y}-${m}-01T00:00`, APP_CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm");
}

function getRecentTransactions_() {
  const values = getLogRows_();
  if (!values.length) return [];

  const startMs = getRecentWindowStart_(new Date()).getTime();
  const picked  = values.filter(row => row[0] instanceof Date && row[0].getTime() >= startMs);

  // Terbaru dulu menurut waktu transaksi; pagar RECENT_MAX_ROWS memotong yang paling lama.
  picked.sort((a, b) => b[0].getTime() - a[0].getTime());
  return picked.slice(0, APP_CONFIG.RECENT_MAX_ROWS).map(mapLogRow_);
}

function mapLogRow_(row) {
  // Kolom 12 (Dicatat Pada) kosong pada baris lama -> dianggap bukan susulan.
  const created = row[11] instanceof Date ? row[11] : null;
  const backdated = !!(created && row[0] instanceof Date &&
    (created.getTime() - row[0].getTime()) > APP_CONFIG.BACKDATE_FLAG_MIN * 60000);
  return {
    timestamp:  formatDate_(row[0]),
    txId:       String(row[1] || ''), // Sheets bisa menyimpan ID mirip angka sebagai bilangan
    userCode:   row[2]  || '',
    userName:   row[3]  || '',
    role:       row[4]  || '',
    itemsJson:  row[5]  || '[]',
    itemsText:  row[6]  || '',
    totalQty:   Number(row[7] || 0),
    note:       row[8]  || '',
    type:       row[9]  || '',
    invoiceUrl: row[10] || '',
    createdAt:  created ? formatDate_(created) : '',
    backdated,
    editInfo:   String(row[12] || ''),
    edited:     !!row[12]
  };
}

// [OPT-06] Scan dari bawah — transaksi yang dihapus biasanya yang terbaru.
function findLogRowByTxId_(txId) {
  const values = getLogRows_();
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][1] || '').trim().toUpperCase() === txId) {
      return { rowIndex: i + 2, tx: mapLogRow_(values[i]) };
    }
  }
  return null;
}

function appendTransactionLog_(tx) {
  const sheet = getSheet_(APP_CONFIG.LOG_SHEET_NAME);
  ensureExtraHeaders_(sheet);
  sheet.appendRow([
    tx.timestamp, tx.txId, tx.userCode, tx.userName, tx.role,
    tx.itemsJson, tx.itemsText, tx.totalQty, tx.note, tx.type, tx.invoiceUrl,
    tx.createdAt || tx.timestamp
  ]);
  invalidateLogCache_();
}

// Sheet lama hanya punya 11 kolom: tulis header kolom 12-13 sekali per eksekusi bila kosong.
let _extraHeadersChecked = false;
function ensureExtraHeaders_(sheet) {
  if (_extraHeadersChecked) return;
  _extraHeadersChecked = true;
  const range = sheet.getRange(1, 12, 1, 2);
  const hdr = range.getValues()[0];
  if (hdr[0] && hdr[1]) return;
  if (!hdr[0]) hdr[0] = 'Dicatat Pada';
  if (!hdr[1]) hdr[1] = 'Riwayat Edit';
  range.setValues([hdr]);
}
