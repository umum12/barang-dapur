/* Service worker Barang Dapur — DIBUAT oleh tools/build.js (jangan edit hasilnya; edit web/sw.template.js). */
const APP = 'barang-dapur';
const VERSION = '7d27c3439d';
// ISOLASI: Cache Storage dipakai BERSAMA oleh semua halaman di origin yang sama (mis. user.github.io/*).
// Maka nama cache diberi awalan unik dari SCOPE service worker ini (path repo), dan pembersihan HANYA menyentuh
// cache berawalan itu — tidak pernah cache proyek lain, dan tidak pernah cache Barang Dapur di repo lain.
const SCOPE_PATH = new URL(self.registration.scope).pathname;       // mis. /barang-dapur/
const PREFIX = APP + ':' + SCOPE_PATH + ':';                         // mis. barang-dapur:/barang-dapur/:
const SHELL_CACHE = PREFIX + 'shell:' + VERSION;
const RUNTIME_CACHE = PREFIX + 'runtime';
const LEGACY = /^bd-shell-[0-9a-f]{10}$|^bd-runtime$/;               // nama cache versi lama aplikasi INI (tanpa awalan)
const PRECACHE = [
  "index.html",
  "app.css?v=7d27c3439d",
  "app.js?v=7d27c3439d",
  "api-shim.js?v=7d27c3439d",
  "pwa.js?v=7d27c3439d",
  "manifest.webmanifest",
  "favicon.svg",
  "favicon.ico",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png"
];            // URL relatif terhadap scope; yang berversi memuat ?v=HASH
const NETWORK_FIRST = ['config.js'];      // bisa diedit admin tanpa build ulang -> selalu coba jaringan dulu

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))
    )
  );
  // Tidak ada skipWaiting otomatis: versi baru menunggu sampai pengguna memilih "Muat ulang" (pesan SKIP_WAITING).
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => (k.startsWith(PREFIX) && k !== SHELL_CACHE && k !== RUNTIME_CACHE) || LEGACY.test(k))
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function relativePath(url) {
  const scope = new URL(self.registration.scope);
  return url.pathname.startsWith(scope.pathname) ? url.pathname.slice(scope.pathname.length) : null;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                         // POST ke API tidak pernah disentuh
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // Web App GAS & domain lain: langsung ke jaringan, tanpa cache

  const rel = relativePath(url);
  if (rel === null) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match(new URL('index.html', self.registration.scope).href).then((hit) => hit || fetch(req))
    );
    return;
  }

  if (NETWORK_FIRST.indexOf(rel) !== -1) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Aset shell (berversi lewat nama cache): cache dulu, jaringan bila belum ada.
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
