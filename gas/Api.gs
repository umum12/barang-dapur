// ============================================================
//  Api.gs — Endpoint publik: getDashboard, login, submitTransaction, addStock.
// ============================================================

// ── PUBLIC ENDPOINTS ─────────────────────────────────────────

function getDashboard(accessCode) {
  setupSystem_();
  const user   = resolveUserOrAdmin_(accessCode);
  const stocks = getStocks_();
  return {
    ok: true,
    user: { code: user.code, name: user.name, role: user.role, labelRole: user.labelRole, canSubmit: user.canSubmit },
    canSubmit: !!user.canSubmit,
    stocks,
    config: getClientConfig_()
  };
}

function login(code) {
  setupSystem_();
  const user = getUserByCode_(code);
  if (!user) return { ok: false, message: 'Kode tidak ditemukan.' };
  return {
    ok: true,
    user: { code: user.code, name: user.name, role: user.role, labelRole: user.labelRole, canSubmit: user.canSubmit },
    canSubmit: !!user.canSubmit,
    stocks: getStocks_(),
    config: getClientConfig_()
  };
}

function submitTransaction(payload) {
  setupSystem_();
  return processTransaction_(payload, false);
}

function addStock(payload) {
  setupSystem_();
  return processTransaction_(payload, true);
}

// Parameter yang dibutuhkan frontend (sumber tunggal: APP_CONFIG).
function getClientConfig_() {
  return {
    backdateMaxDays: APP_CONFIG.BACKDATE_MAX_DAYS,
    maxQtyPerItem:   APP_CONFIG.MAX_QTY_PER_ITEM
  };
}

/**
 * Riwayat transaksi (bulan ini + bulan lalu) -- dimuat frontend HANYA saat menu Riwayat dibuka.
 * Endpoint lain (getDashboard, login, simpan, koreksi) tidak lagi membaca sheet Log untuk riwayat;
 * hanya deleteTransaction & editTransaction (dipanggil dari Riwayat) yang mengembalikan `recent`.
 * Demo boleh melihat; kode tidak dikenal ditolak.
 */
function getRiwayat(accessCode) {
  setupSystem_();
  if (!getUserByCode_(accessCode)) return { ok: false, message: 'Kode akses tidak valid.' };
  return { ok: true, recent: getRecentTransactions_() };
}
