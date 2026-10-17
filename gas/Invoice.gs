// ============================================================
//  Invoice.gs — Helper Drive untuk foto invoice.
// ============================================================

// ── INVOICE HELPERS ───────────────────────────────────────────

function saveInvoice_(invoice, txId) {
  const folder = getOrCreateInvoiceFolder_();
  const bytes  = Utilities.base64Decode(invoice.data);
  const blob   = Utilities.newBlob(bytes, invoice.mimeType || 'image/jpeg', `${txId}.jpg`);
  return folder.createFile(blob).getUrl();
}

function getOrCreateInvoiceFolder_() {
  const props    = PropertiesService.getScriptProperties();
  const existing = props.getProperty('INVOICE_FOLDER_ID');
  if (existing) {
    try { return DriveApp.getFolderById(existing); } catch (_) {}
  }
  const folder = DriveApp.createFolder(APP_CONFIG.APP_NAME + ' Invoice');
  props.setProperty('INVOICE_FOLDER_ID', folder.getId());
  return folder;
}

function trashInvoiceByUrl_(url) {
  const fileId = extractDriveFileId_(url);
  if (!fileId) return false;
  try { DriveApp.getFileById(fileId).setTrashed(true); return true; }
  catch (_) { return false; }
}

function extractDriveFileId_(url) {
  if (!url) return '';
  const match = String(url).match(/[-\w]{25,}/);
  return match ? match[0] : '';
}
