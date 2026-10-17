// ============================================================
//  Auth.gs — Lookup user & guard hak akses.
// ============================================================

// ── USER LOOKUP ──────────────────────────────────────────────
// [OPT-04 → simplifed] Tidak ada sheet Users → lookup langsung
// ke konstanta USERS. Zero Spreadsheet read, O(1) guaranteed.
function getUserByCode_(code) {
  const normalized = String(code || '').trim().toUpperCase();
  return normalized ? (USERS[normalized] || null) : null;
}

function resolveUserOrAdmin_(accessCode) {
  return getUserByCode_(accessCode) || USERS.ADMIN;
}

function assertCanWrite_(accessCode) {
  const user = getUserByCode_(accessCode);
  if (!user)           throw new Error('Kode akses tidak valid.');
  if (!user.canSubmit) throw new Error('Mode Demo hanya dapat melihat data. Perubahan data tidak diizinkan.');
  return user;
}

/**
 * Validasi khusus untuk endpoint Koreksi Stok (Stock Opname).
 * Hanya role ADMIN yang boleh — bukan sekadar canSubmit:true seperti FS biasa,
 * karena koreksi stok langsung override angka tanpa mekanisme +/- transaksi normal.
 */
function assertCanAdmin_(accessCode) {
  const user = getUserByCode_(accessCode);
  if (!user) throw new Error('Kode akses tidak valid.');
  if (String(user.role || '').toUpperCase() !== 'ADMIN') {
    throw new Error('Hanya Admin yang dapat melakukan koreksi stok.');
  }
  return user;
}
