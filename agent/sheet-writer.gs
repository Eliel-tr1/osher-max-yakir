/**
 * כותב לטבלה את תוצאות סוכן ניתוח השיחות (#20). מפורסם כ-Web app בפרויקט Apps Script נפרד,
 * כך שלא נוגעים בסקריפטים קיימים. כותב רק לשלוש עמודות: "אופן שיחה", "נימוק", "נקרא ב:",
 * בכל השורות של אותו "קוד מזהה". לא מוסיף ולא מוחק שורות.
 * TOKEN: הערך האמיתי נמצא רק בעותק שבגוגל ובשרת, לא בריפו.
 */
const SHEET_ID = '1nTqoRITyNlLJO4Pld0H4SRMIbT21oudBw6mDBoxXaUU';
const TAB = 'לידים';
const TOKEN = '__TOKEN__';
const TYPES = ['מכירתי', 'שירותי', ''];

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad json' }); }
  if (!body || body.token !== TOKEN) return out_({ ok: false, error: 'token' });
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB);
    const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (v) { return String(v).trim(); });
    const col = function (name) { const i = head.indexOf(name); if (i < 0) throw new Error('no column ' + name); return i + 1; };
    const cNs = col('קוד מזהה'), cType = col('אופן שיחה'), cReason = col('נימוק'), cRead = col('נקרא ב:');
    const last = sh.getLastRow();
    const ids = last > 1 ? sh.getRange(2, cNs, last - 1, 1).getValues() : [];
    const rowsOf = {};
    ids.forEach(function (r, i) { const k = String(r[0]).trim(); if (k) (rowsOf[k] = rowsOf[k] || []).push(i + 2); });
    let updated = 0; const missing = [];
    (body.updates || []).forEach(function (u) {
      const rows = rowsOf[String(u.ns || '').trim()];
      if (!rows) { missing.push(u.ns); return; }
      const type = String(u.type || '');
      if (TYPES.indexOf(type) < 0) return;
      const reason = String(u.reason || '').slice(0, 300);
      const readAt = new Date(u.readAt);
      if (isNaN(readAt.getTime())) return;
      rows.forEach(function (r) {
        sh.getRange(r, cType).setValue(type);
        sh.getRange(r, cReason).setValue(reason);
        sh.getRange(r, cRead).setValue(readAt).setNumberFormat('dd/MM/yyyy HH:mm:ss');
        updated++;
      });
    });
    return out_({ ok: true, updated: updated, missing: missing });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() { return out_({ ok: true, ping: true }); }

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
