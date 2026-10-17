// ============================================================
//  Main.gs — Entry point (doGet) + include().
// ============================================================

// Entry point web app + helper include() untuk memecah HTML.
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function doGet(e) {
  // Health-check API: buka  <URL /exec>?api=ping  untuk memastikan deployment & akses "Anyone" benar.
  if (e && e.parameter && e.parameter.api === 'ping') {
    return jsonOut_({ status: 'ok', result: { app: APP_CONFIG.APP_NAME, apiVersion: API_VERSION, time: formatDate_(new Date()) }, v: API_VERSION });
  }
  setupSystem_();
  const out = HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle(APP_CONFIG.APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  if (APP_CONFIG.FAVICON_URL) out.setFaviconUrl(APP_CONFIG.FAVICON_URL);
  return out;
}
