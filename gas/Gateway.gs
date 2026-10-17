// ============================================================
//  Gateway.gs — API HTTP (doPost) untuk frontend kedua (GitHub Pages PWA).
//
//  Frontend GAS lama TIDAK memakai berkas ini: ia tetap memanggil fungsi
//  publik langsung lewat google.script.run (kode akses di tiap payload).
//
//  Kontrak:  POST /exec   Content-Type: text/plain;charset=utf-8   (request "simple" -> tanpa preflight CORS)
//    body  : {"fn":"<nama>","args":[<argumen persis seperti google.script.run>],"token":"<token>"}
//    balas : {"status":"ok","result":<hasil fungsi>,"v":1}            (+ "token","expiresInSec" khusus login)
//            {"status":"error","code":"AUTH|RATE_LIMIT|BAD_REQUEST|FORBIDDEN_FN|SERVER","message":"...","v":1}
//
//  Keamanan:
//   - Hanya fungsi di API_FUNCTIONS yang bisa dipanggil (bukan akses dinamis ke sembarang fungsi).
//   - Selain login, WAJIB token. Identitas pengguna SELALU diambil dari token di server;
//     accessCode kiriman klien ditimpa (mencegah mengaku sebagai ADMIN).
//   - Token acak 256-bit di CacheService, kedaluwarsa 30 menit tanpa aktivitas (geser) & maks 12 jam.
//   - Percobaan login gagal dibatasi global per jendela waktu.
// ============================================================

const API_VERSION = 1;

// kind: 'login' | 'logout' | 'codeString' (argumen = kode akses) | 'payload' (argumen = objek berisi accessCode)
const API_FUNCTIONS = {
  login:             { kind: 'login' },
  logout:            { kind: 'logout' },
  getDashboard:      { kind: 'codeString' },
  getRiwayat:        { kind: 'codeString' },
  submitTransaction: { kind: 'payload' },
  addStock:          { kind: 'payload' },
  correctStock:      { kind: 'payload' },
  deleteTransaction: { kind: 'payload' },
  editTransaction:   { kind: 'payload' },
  getMonthlyReport:  { kind: 'payload' }
};

function getApiHandlers_() {
  return { getDashboard, getRiwayat, submitTransaction, addStock, correctStock, deleteTransaction, editTransaction, getMonthlyReport };
}

// Dipisah agar mudah diganti saat pengujian.
function nowMs_() { return Date.now(); }

// ── Respons ─────────────────────────────────────────────────
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function apiError_(code, message) {
  return jsonOut_({ status: 'error', code, message, v: API_VERSION });
}
function apiOk_(result, extra) {
  return jsonOut_(Object.assign({ status: 'ok', result, v: API_VERSION }, extra || {}));
}

// ── Entry point ─────────────────────────────────────────────
function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? String(e.postData.contents) : '';
    if (!raw) return apiError_('BAD_REQUEST', 'Body kosong.');
    if (raw.length > APP_CONFIG.API_MAX_BODY_CHARS) return apiError_('BAD_REQUEST', 'Body terlalu besar.');

    let req;
    try { req = JSON.parse(raw); }
    catch (_) { return apiError_('BAD_REQUEST', 'Body bukan JSON yang valid.'); }
    if (!req || typeof req !== 'object' || Array.isArray(req)) return apiError_('BAD_REQUEST', 'Format permintaan tidak valid.');

    return handleApiRequest_(req);
  } catch (err) {
    // Sama seperti failure handler google.script.run: hanya pesan, tanpa stack.
    return apiError_('SERVER', String(err && err.message ? err.message : err));
  }
}

function handleApiRequest_(req) {
  const fn = String(req.fn || '');
  // hasOwnProperty: tolak 'constructor', '__proto__', 'toString', dst.
  if (!Object.prototype.hasOwnProperty.call(API_FUNCTIONS, fn)) {
    return apiError_('FORBIDDEN_FN', 'Fungsi tidak dikenal.');
  }
  const spec = API_FUNCTIONS[fn];
  const args = Array.isArray(req.args) ? req.args : [];

  if (spec.kind === 'login') return apiLogin_(args[0]);

  const session = verifyToken_(req.token);
  if (!session) return apiError_('AUTH', 'Sesi berakhir atau tidak valid. Silakan masuk lagi.');

  if (spec.kind === 'logout') {
    revokeToken_(req.token);
    return apiOk_({ ok: true });
  }

  let arg;
  if (spec.kind === 'codeString') {
    arg = session.code;                                   // abaikan kode kiriman klien
  } else {
    const p = args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) ? args[0] : {};
    arg = Object.assign({}, p, { accessCode: session.code }); // timpa accessCode kiriman klien
  }
  return apiOk_(getApiHandlers_()[fn](arg));
}

// ── Login + pembatasan percobaan gagal ──────────────────────
function apiLogin_(code) {
  const gate = checkLoginThrottle_();
  if (!gate.allowed) {
    return apiError_('RATE_LIMIT', `Terlalu banyak percobaan login gagal. Coba lagi dalam ${Math.ceil(gate.retryAfterSec / 60)} menit.`);
  }
  const res = login(String(code == null ? '' : code).slice(0, 50));
  if (!res || !res.ok) {
    recordLoginFailure_();
    return apiOk_(res);                                   // {ok:false,message} -- sama seperti google.script.run
  }
  const token = issueToken_(res.user.code);
  return apiOk_(res, { token, expiresInSec: APP_CONFIG.TOKEN_IDLE_SEC });
}

// Penghitung global per jendela tetap. Sengaja global (bukan per-kode): penebak mencoba kode BERBEDA,
// jadi penghitung per-kode tidak menghentikannya. Sesi yang sudah login tidak terpengaruh.
function loginWindowMs_() { return APP_CONFIG.LOGIN_FAIL_WINDOW_SEC * 1000; }
function loginThrottleKey_() { return 'LF:' + Math.floor(nowMs_() / loginWindowMs_()); }

function checkLoginThrottle_() {
  const n = Number(CacheService.getScriptCache().get(loginThrottleKey_()) || 0);
  if (n < APP_CONFIG.LOGIN_FAIL_MAX) return { allowed: true };
  const w = loginWindowMs_();
  return { allowed: false, retryAfterSec: Math.ceil((w - (nowMs_() % w)) / 1000) };
}

function recordLoginFailure_() {
  const cache = CacheService.getScriptCache();
  const key = loginThrottleKey_();
  cache.put(key, String(Number(cache.get(key) || 0) + 1), APP_CONFIG.LOGIN_FAIL_WINDOW_SEC * 2);
}

// ── Token sesi ──────────────────────────────────────────────
function issueToken_(code) {
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase(); // 64 hex
  CacheService.getScriptCache().put('TK:' + token, JSON.stringify({ c: code, t: nowMs_() }), APP_CONFIG.TOKEN_IDLE_SEC);
  return token;
}

function verifyToken_(token) {
  const tk = String(token || '');
  if (!/^[0-9a-f]{64}$/.test(tk)) return null;            // juga mencegah injeksi pada key cache
  const cache = CacheService.getScriptCache();
  const raw = cache.get('TK:' + tk);
  if (!raw) return null;

  let s;
  try { s = JSON.parse(raw); } catch (_) { return null; }
  if (nowMs_() - Number(s.t || 0) > APP_CONFIG.TOKEN_MAX_AGE_SEC * 1000) { cache.remove('TK:' + tk); return null; }

  const user = getUserByCode_(s.c);                       // pengguna dihapus dari USERS -> sesi gugur
  if (!user) { cache.remove('TK:' + tk); return null; }

  cache.put('TK:' + tk, raw, APP_CONFIG.TOKEN_IDLE_SEC);  // geser masa idle
  return { code: user.code };
}

function revokeToken_(token) {
  CacheService.getScriptCache().remove('TK:' + String(token || ''));
}
