// ============================================================
//  Config.gs — APP_CONFIG, ITEMS (sumber tunggal katalog barang), USERS, REPORT_ITEM_ORDER.
// ============================================================

// ── KONFIGURASI ─────────────────────────────────────────────
const APP_CONFIG = {
  APP_NAME:       'Barang Dapur',
  TIMEZONE:       'Asia/Jakarta',
  WARNING_LEVEL:  5,
  DANGER_LEVEL:   4,
  HISTORY_DAYS:   3,
  BACKDATE_MAX_DAYS:    7,    // transaksi susulan: maksimal N hari kalender ke belakang
  FUTURE_TOLERANCE_MIN: 2,    // toleransi selisih jam device vs server (menit)
  BACKDATE_FLAG_MIN:    10,   // ditandai "susulan" bila waktu transaksi lebih lama dari waktu catat > N menit
  MAX_QTY_PER_ITEM:     999,  // pagar anti salah ketik (stok boleh minus)
  RECENT_MONTHS_BACK:   1,    // Riwayat: bulan ini + N bulan sebelumnya (1 -> mis. 6 Okt = seluruh September & Oktober)
  RECENT_MAX_ROWS:      500,  // pagar ukuran respons bila volume transaksi melonjak
  // --- API HTTP (Gateway.gs) untuk frontend GitHub Pages ---
  TOKEN_IDLE_SEC:        1800,   // sesi API habis setelah 30 menit tanpa aktivitas (sama dengan frontend)
  TOKEN_MAX_AGE_SEC:     43200,  // batas mutlak umur sesi API: 12 jam
  LOGIN_FAIL_MAX:        20,     // maks percobaan login GAGAL (global) per jendela
  LOGIN_FAIL_WINDOW_SEC: 600,    // panjang jendela pembatasan (10 menit)
  API_MAX_BODY_CHARS:    3000000, // batas ukuran body doPost (foto invoice base64 ~0,5 MB)
  // Favicon halaman GAS. Halaman GAS tampil di iframe, jadi <link rel="icon"> diabaikan; satu-satunya jalan
  // adalah HtmlOutput.setFaviconUrl(). Isi dengan URL https ikon di GitHub Pages, mis.
  // 'https://<user>.github.io/<repo>/favicon.ico'. Kosong = tidak dipasang.
  FAVICON_URL:           '',
  LOG_SHEET_NAME:   'Transaksi Log',
  STOCK_SHEET_NAME: 'Stok'
};

// ── MASTER DATA (hardcode, tidak perlu sheet) ────────────────
const ITEMS = {
  // consumptionDivisor = pemakaian harian rata-rata, dipakai frontend untuk estimasi hari (stok / divisor).
  // URUTAN properti di sini = urutan tampil di Input / Stok / Dashboard.
  kopi:   { key: 'kopi',   label: 'Kopi',              icon: '☕', initialStock: 20, isSecondary: false, consumptionDivisor: 4.5 },
  gula:   { key: 'gula',   label: 'Gula',              icon: '🧂', initialStock: 20, isSecondary: false, consumptionDivisor: 4   },
  teh:    { key: 'teh',    label: 'Teh',               icon: '🍵', initialStock: 20, isSecondary: false, consumptionDivisor: 4   },
  sabun:  { key: 'sabun',  label: 'Sabun',             icon: '🧼', initialStock: 20, isSecondary: false, consumptionDivisor: 1.4 },
  air330: { key: 'air330', label: 'Air Mineral 330',   icon: '💧', initialStock: 20, isSecondary: false, consumptionDivisor: 1   },
  airCup: { key: 'airCup', label: 'Air Mineral Gelas', icon: '🥤', initialStock: 20, isSecondary: false, consumptionDivisor: 1   },
  tisu:   { key: 'tisu',   label: 'Tisu',              icon: '🧻', initialStock: 20, isSecondary: false, consumptionDivisor: 1   },
  spons:  { key: 'spons',  label: 'Spons',             icon: '🧽', initialStock: 20, isSecondary: false, consumptionDivisor: 1   }
};

const USERS = {
  ADMIN: { code: 'ADMIN', name: 'Admin',     role: 'ADMIN', labelRole: 'ADMIN',     canSubmit: true  },
  WAY:   { code: 'WAY',   name: 'WAHYU',     role: 'USER',  labelRole: 'FS',        canSubmit: true  },
  EDO:   { code: 'EDO',   name: 'EDO',       role: 'USER',  labelRole: 'FS',        canSubmit: true  },
  ADT:   { code: 'ADT',   name: 'ADIT',      role: 'USER',  labelRole: 'FS',        canSubmit: true  },
  HER:   { code: 'HER',   name: 'HERI',      role: 'USER',  labelRole: 'FS',        canSubmit: true  },
  ROM:   { code: 'ROM',   name: 'ROMI',      role: 'USER',  labelRole: 'FS',        canSubmit: true  },
  UDN:   { code: 'UDN',   name: 'UDIN',      role: 'USER',  labelRole: 'FS',        canSubmit: true  },
  DEMO:  { code: 'DEMO',  name: 'Demo User', role: 'DEMO',  labelRole: 'READ ONLY', canSubmit: false }
};

// Urutan baris KHUSUS Laporan Bulanan (Gula & Kopi di atas). Tidak memengaruhi Input/Stok/Dashboard.
const REPORT_ITEM_ORDER = ['gula', 'kopi', 'teh', 'sabun', 'air330', 'airCup', 'tisu', 'spons'];
