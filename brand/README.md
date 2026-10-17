# Brand & ikon — Barang Dapur

Motif: toples/canister penyimpanan dengan garis level isi = "stok". Tema kopi/coklat: gradien #9a6540 -> #57331d, aksen aplikasi #6f4428, isi level krem #f6dfc4.

| File | Dipakai untuk |
|---|---|
| icon.svg | Sumber ikon (sudut membulat), logo di dokumen/README |
| icon-maskable.svg | Sumber ikon Android adaptif (full-bleed; glyph di dalam safe zone 80%) |
| favicon.svg | Favicon vektor (garis lebih tebal agar terbaca di 16 px) |
| logo-mark.svg | Glyph saja (biru, transparan) untuk latar terang |
| favicon.ico | Fallback browser lama (16/32/48) |
| icons/icon-192.png, icon-512.png | Manifest PWA, purpose "any" |
| icons/icon-maskable-192.png, icon-maskable-512.png | Manifest PWA, purpose "maskable" |
| icons/apple-touch-icon.png | iOS "Add to Home Screen" (180, persegi penuh; iOS yang membulatkan) |
| icons/favicon-16/32/48.png | Fallback PNG favicon |
| manifest.webmanifest | Manifest PWA (taruh di root GitHub Pages) |

## Potongan `<head>` untuk GitHub Pages
```html
<meta name="theme-color" content="#6f4428">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="icon" href="favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Barang Dapur">
```
Susunan folder di repo Pages: `favicon.svg`, `favicon.ico`, `manifest.webmanifest`, `icons/*.png`.

## Favicon di versi GAS
Halaman GAS tampil di dalam iframe, sehingga `<link rel="icon">` di HTML-nya tidak dipakai browser.
Setelah ikon di-host di GitHub Pages, pasang lewat `HtmlOutput.setFaviconUrl('https://<user>.github.io/<repo>/favicon.ico')` di `doGet()`.
