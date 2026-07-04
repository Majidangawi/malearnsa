/**
 * ══════════════════════════════════════════════════════════════
 * MA Learn — Waitlist + Hero Analytics
 * Google Apps Script — Web App
 *
 * Generalised 2026-04-26: was previously the CIW workshop waitlist
 * collector. Now serves the generic /waitlist/ page AND the home page
 * hero quiz (no-match capture + telemetry events).
 *
 * Existing column layout preserved (F=Sent, G=Purchase, H=Reminder,
 * I=Final Reminder are externally managed by blast scripts).
 *
 * Bound spreadsheet: 1byx1WxktAKB1ajVFgEWbo6tMLlBo0gkcWZqXXO4FF58
 * Waitlist sheet:    'Waitlist'
 * Hero events sheet: 'HeroEvents' (auto-created)
 *
 * v7 additions (2026-04-27):
 *   • Routes via `action` field: 'waitlist' (default) | 'hero_event'
 *   • Waitlist gets two new cols: K=source, L=interest
 *   • HeroEvents tab for hero quiz telemetry
 *
 * v8 additions (2026-04-27):
 *   • Admin routes: admin_list_pending | admin_confirm | admin_reject
 *   • Onboarding email senders (Workshop / ITCAI / BL)
 *   • Rejection email with reason
 *
 * v9 additions (2026-05-11):
 *   • ManyChat lead capture path. Same `action: 'waitlist'` route, but
 *     when `source` starts with `manychat:`, we:
 *       — write IG handle to col Q (17), ManyChat subscriber_id to col R (18)
 *       — skip the user confirmation email (the IG DM is the ack)
 *       — still notify Majid + still auto-add to newsletter
 *     Token-gated via `manychat_token` to keep the endpoint clean.
 *
 * Waitlist column layout (1-indexed):
 *   A: التاريخ والوقت | B: الاسم | C: البريد | D: الجوال
 *   E: الدورة/الورشة | F: Sent | G: Purchase | H: Reminder
 *   I: Final Reminder | J: الدولة | K: المصدر (v7) | L: المهتم بـ (v7)
 *   M: C2 Announcement Sent (external) | N: C2 Reminder Sent (external)
 *   O: WA C2 Announce Sent (external)  | P: WhatsApp Opted In (external)
 *   Q: IG Handle (v9) | R: ManyChat Sub ID (v9)
 * ══════════════════════════════════════════════════════════════
 */

// ── CONFIGURATION ─────────────────────────────────────────────
const SPREADSHEET_ID   = '1byx1WxktAKB1ajVFgEWbo6tMLlBo0gkcWZqXXO4FF58';
const SHEET_NAME       = 'Waitlist';
const HERO_EVENTS_SHEET = 'HeroEvents';
const DEFAULT_SOURCE   = 'MA Learn Waitlist';
const NOTIFY_EMAIL     = 'info@malearnsa.com,majed.engawi@gmail.com';
const SUPPORT_EMAIL    = 'support@malearnsa.com';
const MANYCHAT_TOKEN   = PropertiesService.getScriptProperties().getProperty('MANYCHAT_TOKEN');


// ── HELPERS ───────────────────────────────────────────────────
function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * Ensures K/L headers exist on the Waitlist sheet.
 * Idempotent — only writes when missing. Runs cheaply on every submission.
 */
function ensureWaitlistHeaders(sheet) {
  if (!sheet.getRange(1, 11).getValue()) {
    sheet.getRange(1, 11).setValue('المصدر')
      .setBackground('#C9A84C').setFontColor('#000000').setFontWeight('bold');
    sheet.setColumnWidth(11, 200);
  }
  if (!sheet.getRange(1, 12).getValue()) {
    sheet.getRange(1, 12).setValue('المهتم بـ')
      .setBackground('#C9A84C').setFontColor('#000000').setFontWeight('bold');
    sheet.setColumnWidth(12, 280);
  }
  // v9: ManyChat columns — Q (17) + R (18). M-P are owned by C2 blast scripts.
  if (!sheet.getRange(1, 17).getValue()) {
    sheet.getRange(1, 17).setValue('IG Handle')
      .setBackground('#C9A84C').setFontColor('#000000').setFontWeight('bold');
    sheet.setColumnWidth(17, 160);
  }
  if (!sheet.getRange(1, 18).getValue()) {
    sheet.getRange(1, 18).setValue('ManyChat Sub ID')
      .setBackground('#C9A84C').setFontColor('#000000').setFontWeight('bold');
    sheet.setColumnWidth(18, 180);
  }
}


// ── SETUP (run once to add headers J/K/L + create HeroEvents tab) ───
// NOTE: Existing cols A-I are already in production with status-tracking
// data. Setup ONLY touches J1, K1, L1 headers and creates HeroEvents tab.
function setup() {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Waitlist sheet not found');

  // J: الدولة (already in v6)
  const countryHeaderCell = sheet.getRange(1, 10);
  countryHeaderCell.setValue('الدولة');
  countryHeaderCell.setBackground('#C9A84C');
  countryHeaderCell.setFontColor('#000000');
  countryHeaderCell.setFontWeight('bold');
  sheet.setColumnWidth(10, 180);

  // K: المصدر (NEW v7)
  const sourceHeaderCell = sheet.getRange(1, 11);
  sourceHeaderCell.setValue('المصدر');
  sourceHeaderCell.setBackground('#C9A84C');
  sourceHeaderCell.setFontColor('#000000');
  sourceHeaderCell.setFontWeight('bold');
  sheet.setColumnWidth(11, 200);

  // L: المهتم بـ (NEW v7)
  const interestHeaderCell = sheet.getRange(1, 12);
  interestHeaderCell.setValue('المهتم بـ');
  interestHeaderCell.setBackground('#C9A84C');
  interestHeaderCell.setFontColor('#000000');
  interestHeaderCell.setFontWeight('bold');
  sheet.setColumnWidth(12, 280);

  // Create HeroEvents tab if missing
  let eventsSheet = ss.getSheetByName(HERO_EVENTS_SHEET);
  if (!eventsSheet) {
    eventsSheet = ss.insertSheet(HERO_EVENTS_SHEET);
    const headers = ['Timestamp', 'Session ID', 'Event', 'Payload (JSON)', 'User Agent', 'Referrer'];
    const headerRange = eventsSheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setBackground('#C9A84C');
    headerRange.setFontColor('#000000');
    headerRange.setFontWeight('bold');
    eventsSheet.setColumnWidth(1, 170); // Timestamp
    eventsSheet.setColumnWidth(2, 200); // Session ID
    eventsSheet.setColumnWidth(3, 220); // Event name
    eventsSheet.setColumnWidth(4, 400); // Payload JSON
    eventsSheet.setColumnWidth(5, 240); // User Agent
    eventsSheet.setColumnWidth(6, 200); // Referrer
    eventsSheet.setFrozenRows(1);
    Logger.log('✅ HeroEvents tab created.');
  }

  Logger.log('✅ Headers J/K/L set on Waitlist.');
  Logger.log('📊 Spreadsheet URL: ' + ss.getUrl());
}


// ── doPost ────────────────────────────────────────────────────
function doPost(e) {
  try {
    let data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (_) {
        data = {
          name           : e.parameter.name           || '',
          email          : e.parameter.email          || '',
          phone          : e.parameter.phone          || '',
          country        : e.parameter.country        || '',
          workshop       : e.parameter.workshop       || DEFAULT_SOURCE,
          source         : e.parameter.source         || '',
          interest       : e.parameter.interest       || '',
          action         : e.parameter.action         || '',
          event          : e.parameter.event          || '',
          payload        : e.parameter.payload        || '',
          session_id     : e.parameter.session_id     || '',
          user_agent     : e.parameter.user_agent     || '',
          referrer       : e.parameter.referrer       || '',
          ig_handle      : e.parameter.ig_handle      || '',
          subscriber_id  : e.parameter.subscriber_id  || '',
          manychat_token : e.parameter.manychat_token || '',
        };
      }
    }

    const action = (data.action || 'waitlist').toLowerCase();

    if (action === 'hero_event') {
      return logHeroEvent(data);
    }

    if (action === 'admin_list_pending') {
      return adminListPending(data);
    }

    if (action === 'admin_confirm') {
      return adminConfirmTransfer(data);
    }

    if (action === 'admin_reject') {
      return adminRejectTransfer(data);
    }

    if (action === 'admin_sanitize_history') {
      return adminSanitizeHistory(data);
    }

    return appendWaitlist(data);

  } catch (err) {
    Logger.log('Error in doPost: ' + err.message);
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// ManyChat sends the literal '{{cuf_XXX}}' placeholder when a subscriber's
// custom field is empty — strip it so junk never lands in the sheet.
function cleanField_(v) {
  v = String(v == null ? '' : v).trim();
  return /^\{\{.*\}\}$/.test(v) ? '' : v;
}

// appendRow uses USER_ENTERED semantics: phones starting with '+' become
// formulas → #ERROR!. Apostrophe prefix forces plain text.
function phoneAsText_(p) {
  return /^[+=]/.test(p) ? "'" + p : p;
}

// One-shot cleanup of historical junk in B:D — blanks '{{cuf_XXX}}'
// placeholders and rescues #ERROR! phone cells from their formula text.
function adminSanitizeHistory(data) {
  if (data.admin_token !== ADMIN_TOKEN) {
    return jsonResponse({ success: false, error: 'unauthorized' });
  }
  const sheet = getSpreadsheet().getSheetByName(SHEET_NAME);
  const last  = sheet.getLastRow();
  const range = sheet.getRange(2, 2, last - 1, 3); // B:D
  const values   = range.getValues();
  const formulas = range.getFormulas();
  let blanked = 0, rescued = 0;
  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < 3; c++) {
      const v = String(values[r][c] == null ? '' : values[r][c]).trim();
      if (/^\{\{.*\}\}$/.test(v)) {
        values[r][c] = '';
        blanked++;
      } else if (v.charAt(0) === '#' && formulas[r][c]) {
        const digits = formulas[r][c].replace(/[^0-9]/g, '');
        values[r][c] = digits ? "'+" + digits : '';
        rescued++;
      }
    }
  }
  range.setValues(values);
  return jsonResponse({ success: true, blanked: blanked, rescued: rescued });
}

// ── WAITLIST APPEND ───────────────────────────────────────────
function appendWaitlist(data) {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();

  // Auto-bootstrap v7 + v9 headers (idempotent, runs once)
  ensureWaitlistHeaders(sheet);

  const name     = cleanField_(data.name);
  const email    = cleanField_(data.email);
  const phone    = cleanField_(data.phone);
  const country  = cleanField_(data.country);
  const workshop = data.workshop  || DEFAULT_SOURCE;
  const source   = (data.source   || DEFAULT_SOURCE).trim();
  const interest = cleanField_(data.interest);
  const igHandle      = cleanField_(data.ig_handle);
  const subscriberId  = cleanField_(data.subscriber_id);

  // v9: ManyChat lead path — token-gated, skips user confirmation email
  const isManyChat = source.indexOf('manychat:') === 0;
  if (isManyChat) {
    if (data.manychat_token !== MANYCHAT_TOKEN) {
      return jsonResponse({ success: false, error: 'unauthorized' });
    }
  }

  // 1. Write to sheet — A-E data, F-I left for blast scripts,
  //    J=country, K=source, L=interest, M-P=external (C2 + WA), Q=ig_handle (v9), R=subscriber_id (v9).
  sheet.appendRow([
    new Date(), name, email, phoneAsText_(phone), workshop,
    '', '', '', '',
    country, source, interest,
    '', '', '', '',
    igHandle, subscriberId
  ]);

  const lastRow = sheet.getLastRow();
  if (lastRow % 2 === 0) {
    // Stripe data columns we own (A-E + J-L + Q-R), skip F-I and M-P.
    sheet.getRange(lastRow, 1, 1, 5).setBackground('#f9f6ef');
    sheet.getRange(lastRow, 10, 1, 3).setBackground('#f9f6ef');
    sheet.getRange(lastRow, 17, 1, 2).setBackground('#f9f6ef');
  }

  // 2. Auto-add to newsletter Subscribers (via token-validator admin endpoint)
  try {
    const tvUrl = 'https://script.google.com/macros/s/AKfycbznjcsYu8gLDZqFJGededAQaATad_L8vlhRQV04pOqh57HB5nFVRy9zUHAcg6goyj8DKA/exec';
    const adminToken = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
    const subscribersSheetId = '17OXBVq8XBXDWUY7Zh88MTycqMYJA8zYRtGSk9WE08QI';
    if (email) {
      const qs = 'action=admin_upsert_subscriber'
        + '&admin_token=' + encodeURIComponent(adminToken)
        + '&email=' + encodeURIComponent(email)
        + '&name=' + encodeURIComponent(name || '')
        + '&source=waitlist'
        + '&language=AR'
        + '&sheetId=' + encodeURIComponent(subscribersSheetId);
      UrlFetchApp.fetch(tvUrl + '?' + qs, { method: 'get', muteHttpExceptions: true, followRedirects: true });
    }
  } catch (_) { /* never block the waitlist submit */ }

  // 3. Notify Majid (include interest if hero/manychat submission)
  sendNotification(name, email, phone, country, workshop, source, interest);

  // 4. Confirm to user — skip for ManyChat (the IG DM is the user-facing ack)
  if (email && !isManyChat) sendConfirmation(name, email, workshop);

  return ContentService
    .createTextOutput(JSON.stringify({ success: true, row: lastRow, source: source }))
    .setMimeType(ContentService.MimeType.JSON);
}


// ── HERO EVENT LOG ────────────────────────────────────────────
function logHeroEvent(data) {
  const ss    = getSpreadsheet();
  let sheet   = ss.getSheetByName(HERO_EVENTS_SHEET);
  if (!sheet) {
    // Auto-bootstrap if setup() hasn't been run
    sheet = ss.insertSheet(HERO_EVENTS_SHEET);
    sheet.getRange(1, 1, 1, 6).setValues([
      ['Timestamp', 'Session ID', 'Event', 'Payload (JSON)', 'User Agent', 'Referrer']
    ]);
    sheet.setFrozenRows(1);
  }

  // Strip telemetry-fields out of the payload to keep them as separate cols.
  const eventName = (data.event || '').trim();
  const sessionId = (data.session_id || '').trim();
  const userAgent = (data.user_agent || '').trim();
  const referrer  = (data.referrer || '').trim();

  const payloadObj = {};
  Object.keys(data).forEach(k => {
    if (['action', 'event', 'session_id', 'user_agent', 'referrer', 'timestamp'].indexOf(k) === -1) {
      payloadObj[k] = data[k];
    }
  });

  sheet.appendRow([
    new Date(),
    sessionId,
    eventName,
    JSON.stringify(payloadObj),
    userAgent,
    referrer
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ success: true, logged: eventName }))
    .setMimeType(ContentService.MimeType.JSON);
}


// ── ADMIN ENDPOINTS (v8) ──────────────────────────────────────
// Token-protected. Dashboard at admin.malearnsa.com hardcodes the same token.
const ADMIN_TOKEN = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');

function requireAdmin(data) {
  if (data.admin_token !== ADMIN_TOKEN) {
    throw new Error('unauthorized');
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * List all pending bank transfer rows from the Waitlist sheet.
 * source field starts with 'bank-transfer-pending'.
 * Returns rows with their 1-based row index for confirm/reject targeting.
 */
function adminListPending(data) {
  requireAdmin(data);

  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return jsonResponse({ success: true, rows: [] });

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonResponse({ success: true, rows: [] });

  // Read A:L for all data rows (skip header at row 1)
  const range = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
  const rows = [];
  range.forEach((r, i) => {
    const source = String(r[10] || '').trim();
    if (source.indexOf('bank-transfer-pending') === 0) {
      rows.push({
        rowIndex: i + 2, // 1-based with header offset
        timestamp: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
        name: r[1],
        email: r[2],
        phone: r[3],
        workshop: r[4],
        country: r[9],
        source: source,
        interest: r[11],
      });
    }
  });

  // Newest first
  rows.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  return jsonResponse({ success: true, count: rows.length, rows: rows });
}

/**
 * Confirm a pending bank transfer.
 * 1. Flips source to 'bank-transfer-confirmed'
 * 2. Sends product-appropriate onboarding email
 * 3. (TODO v9): trigger token-validator + Daftra invoice
 */
function adminConfirmTransfer(data) {
  requireAdmin(data);

  const rowIndex = parseInt(data.row_index, 10);
  if (!rowIndex || rowIndex < 2) {
    return jsonResponse({ success: false, error: 'invalid_row_index' });
  }

  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const row = sheet.getRange(rowIndex, 1, 1, 12).getValues()[0];

  // Defensive: confirm we're actually on a pending row
  const source = String(row[10] || '').trim();
  if (source.indexOf('bank-transfer-pending') !== 0) {
    return jsonResponse({ success: false, error: 'row_not_pending', currentSource: source });
  }

  const name = row[1];
  const email = row[2];
  const workshop = String(row[4] || '');
  const interest = row[11];

  // Flip source → confirmed
  sheet.getRange(rowIndex, 11).setValue('bank-transfer-confirmed @ ' + Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm'));

  // Send onboarding email
  try {
    sendOnboardingEmail(workshop, name, email);
  } catch (err) {
    Logger.log('sendOnboardingEmail error: ' + err.message);
  }

  return jsonResponse({ success: true, action: 'confirmed', rowIndex: rowIndex, email: email });
}

/**
 * Reject a pending bank transfer with a reason.
 * 1. Flips source to 'bank-transfer-rejected: {reason}'
 * 2. Sends rejection email to buyer
 */
function adminRejectTransfer(data) {
  requireAdmin(data);

  const rowIndex = parseInt(data.row_index, 10);
  const reason = String(data.reason || '').trim();
  if (!rowIndex || rowIndex < 2) {
    return jsonResponse({ success: false, error: 'invalid_row_index' });
  }
  if (!reason) {
    return jsonResponse({ success: false, error: 'reason_required' });
  }

  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const row = sheet.getRange(rowIndex, 1, 1, 12).getValues()[0];

  const source = String(row[10] || '').trim();
  if (source.indexOf('bank-transfer-pending') !== 0) {
    return jsonResponse({ success: false, error: 'row_not_pending', currentSource: source });
  }

  const name = row[1];
  const email = row[2];

  // Flip source → rejected, store reason
  sheet.getRange(rowIndex, 11).setValue('bank-transfer-rejected: ' + reason);

  // Send rejection email
  try {
    sendRejectionEmail(name, email, reason);
  } catch (err) {
    Logger.log('sendRejectionEmail error: ' + err.message);
  }

  return jsonResponse({ success: true, action: 'rejected', rowIndex: rowIndex, email: email });
}


// ── ONBOARDING EMAIL SENDERS ──────────────────────────────────
function sendOnboardingEmail(workshop, name, email) {
  if (!email) return;
  const w = String(workshop || '').toLowerCase();

  if (w.indexOf('creative-ai-workshop') === 0 || w === 'crafting inspiration workshop') {
    sendWorkshopOnboarding(name, email);
  } else if (w.indexOf('intro-to-creative-ai') === 0 || w === 't2-itcai') {
    sendItcaiOnboarding(name, email);
  } else if (w.indexOf('beyond-lighting') === 0 || w === 't2-bl') {
    sendBlOnboarding(name, email);
  } else {
    // Fallback: workshop-style (most common purchase)
    sendWorkshopOnboarding(name, email);
  }
}

function emailShell(eyebrow, bodyHtml) {
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:Arial,sans-serif;direction:rtl;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1eb;padding:40px 16px;"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0a0a0a;border-radius:2px;overflow:hidden;">
<tr><td style="background:#C9A84C;padding:4px 0;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:36px 40px 0;text-align:center;">
<p style="margin:0;font-size:11px;letter-spacing:0.2em;color:#C9A84C;text-transform:uppercase;">${eyebrow}</p>
</td></tr>
<tr><td style="padding:28px 40px 36px;">${bodyHtml}</td></tr>
<tr><td style="padding:20px 40px;border-top:1px solid #141414;text-align:center;">
<p style="margin:0;font-size:11px;color:#444444;">© 2026 MA Learn · جميع الحقوق محفوظة</p>
</td></tr></table></td></tr></table></body></html>`;
}

function emailSignoff() {
  return `<p style="margin:0 0 6px;font-size:13px;color:#666666;">أي سؤال، اكتبلي على:</p>
<p style="margin:0 0 32px;font-size:13px;">
<a href="mailto:support@malearnsa.com" style="color:#C9A84C;text-decoration:none;">support@malearnsa.com</a>
&nbsp;·&nbsp;
<a href="https://wa.me/966560440113" style="color:#C9A84C;text-decoration:none;">+966 560 440 113</a>
</p>
<p style="margin:0;font-size:15px;color:#F5F0E8;line-height:1.8;">— ماجد<br>
<span style="color:#666;font-size:13px;">MA Learn</span></p>`;
}

function sendWorkshopOnboarding(name, email) {
  const safeName = name || '';
  const body = `
<p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#F5F0E8;">السلام عليكم ${safeName}،</p>
<p style="margin:0 0 20px;font-size:16px;line-height:1.8;color:#F5F0E8;">
تم تأكيد مقعدك في <strong style="color:#C9A84C;">ورشة صناعة الإلهام — الدفعة الثانية</strong>.
</p>
<p style="margin:0 0 26px;font-size:15px;line-height:1.8;color:#BBBBBB;">
٣ ليالي مباشرة معي، ٥ أيام تطبيق على بريف عمل حقيقي،
وجلسة فيدباك جماعية على شغلك بعد الورشة.
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border-right:3px solid #C9A84C;margin-bottom:28px;"><tr><td style="padding:18px 22px;">
<p style="margin:0 0 10px;font-size:11px;letter-spacing:0.18em;color:#C9A84C;text-transform:uppercase;">تواريخ الورشة</p>
<p style="margin:0 0 6px;font-size:14px;color:#F5F0E8;line-height:1.7;"><strong>الليلة الأولى</strong> — الأحد ٣١ مايو · ٧–١٠ مساءً (توقيت جدة)</p>
<p style="margin:0 0 6px;font-size:14px;color:#F5F0E8;line-height:1.7;"><strong>الليلة الثانية</strong> — الاثنين ١ يونيو · ٧–١٠ مساءً</p>
<p style="margin:0 0 6px;font-size:14px;color:#F5F0E8;line-height:1.7;"><strong>الليلة الثالثة</strong> — الثلاثاء ٢ يونيو · ٧–١٠ مساءً</p>
<p style="margin:14px 0 0;font-size:14px;color:#C9A84C;line-height:1.7;"><strong>جلسة الفيدباك</strong> — الأحد ٧ يونيو · ٧–١٠ مساءً</p>
</td></tr></table>
<p style="margin:0 0 14px;font-size:15px;line-height:1.8;color:#F5F0E8;">
<strong style="color:#C9A84C;">ابدأ من الآن — دورة المدخل مفتوحة لك.</strong>
</p>
<p style="margin:0 0 26px;font-size:14px;line-height:1.8;color:#BBBBBB;">
دورة "المدخل إلى الذكاء الاصطناعي الإبداعي" (١٣ درس مسجّل) جزء من الورشة.
ادخلها وابني الأساس قبل ليلة الأحد، عشان تستفيد من كل دقيقة في الجلسات الحية.
رابط الوصول راح يوصلك بإيميل منفصل خلال دقائق.
</p>
<p style="margin:0 0 28px;font-size:14px;color:#BBBBBB;line-height:1.8;">
<strong style="color:#F5F0E8;">قروب الواتساب:</strong> راح نضيفك خلال ساعة. نرسل رابط الـ Meet كل ليلة + تذكيرات قبل الجلسة.
</p>
${emailSignoff()}`;
  MailApp.sendEmail({
    to: email,
    subject: 'تم تأكيد مقعدك في الورشة ✓',
    name: 'MA Learn',
    replyTo: SUPPORT_EMAIL,
    htmlBody: emailShell('MA LEARN · ورشة صناعة الإلهام', body),
  });
}

function sendItcaiOnboarding(name, email) {
  const safeName = name || '';
  const body = `
<p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#F5F0E8;">السلام عليكم ${safeName}،</p>
<p style="margin:0 0 20px;font-size:16px;line-height:1.8;color:#F5F0E8;">
أهلاً بك في <strong style="color:#C9A84C;">المدخل إلى الذكاء الاصطناعي الإبداعي</strong>.
</p>
<p style="margin:0 0 28px;font-size:15px;line-height:1.8;color:#BBBBBB;">
١٣ درس مسجّل، تبدأ معك من الصفر وتوصلك لمستوى تقدر تشتغل فيه بثقة.
الدورة لك مدى الحياة — تتفرّج عليها وقت ما تبي، وترجعلها كل ما تحتاج.
</p>
<p style="margin:0 0 26px;font-size:14px;line-height:1.8;color:#BBBBBB;">
رابط الدخول الخاص بك راح يوصلك بإيميل منفصل خلال دقائق (من نظام التوكن).
لو ما وصلك خلال ساعة، اكتبلي على الإيميل اللي تحت.
</p>
${emailSignoff()}`;
  MailApp.sendEmail({
    to: email,
    subject: 'أهلاً بك في دورة المدخل ✓',
    name: 'MA Learn',
    replyTo: SUPPORT_EMAIL,
    htmlBody: emailShell('MA LEARN · المدخل إلى الذكاء الاصطناعي الإبداعي', body),
  });
}

function sendBlOnboarding(name, email) {
  const safeName = name || '';
  const body = `
<p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#F5F0E8;">السلام عليكم ${safeName}،</p>
<p style="margin:0 0 20px;font-size:16px;line-height:1.8;color:#F5F0E8;">
أهلاً بك في <strong style="color:#C9A84C;">أبعد من إمكانيات الإضاءة</strong>.
</p>
<p style="margin:0 0 28px;font-size:15px;line-height:1.8;color:#BBBBBB;">
١٦ سنة من الخبرة في إضاءة الاستوديو، مكثّفة في دورة عملية تشرح الأدوات،
التركيب، والتفكير اللي ورا كل لقطة احترافية.
الدورة لك مدى الحياة — تتفرّج وقت ما تبي.
</p>
<p style="margin:0 0 26px;font-size:14px;line-height:1.8;color:#BBBBBB;">
رابط الدخول الخاص بك راح يوصلك بإيميل منفصل خلال دقائق (من نظام التوكن).
</p>
<p style="margin:0 0 28px;font-size:14px;color:#BBBBBB;line-height:1.8;">
<strong style="color:#F5F0E8;">نصيحة:</strong> طبّق درس بدرس بكاميرا في يدك. الإضاءة ما تتعلم بالمشاهدة لوحدها.
</p>
${emailSignoff()}`;
  MailApp.sendEmail({
    to: email,
    subject: 'أهلاً بك في دورة أبعد من إمكانيات الإضاءة ✓',
    name: 'MA Learn',
    replyTo: SUPPORT_EMAIL,
    htmlBody: emailShell('MA LEARN · أبعد من إمكانيات الإضاءة', body),
  });
}

function sendRejectionEmail(name, email, reason) {
  if (!email) return;
  const safeName = name || '';
  const safeReason = String(reason || '').replace(/[<>]/g, '');
  const body = `
<p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#F5F0E8;">عزيزي ${safeName}،</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#F5F0E8;">
نأسف لإبلاغك أن طلب التحويل البنكي ما اكتمل بسبب:
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#141414;border-right:3px solid #C9A84C;margin-bottom:24px;"><tr><td style="padding:18px 22px;">
<p style="margin:0;font-size:14px;color:#F5F0E8;line-height:1.8;">${safeReason}</p>
</td></tr></table>
<p style="margin:0 0 24px;font-size:14px;color:#BBBBBB;line-height:1.8;">
لو حابب تتواصل معنا أو تعيد المحاولة، تقدر ترد على هذا الإيميل
أو تراسلنا على الواتساب:
</p>
<p style="margin:0 0 32px;font-size:14px;text-align:center;">
<a href="https://wa.me/966560440113" style="display:inline-block;background:#C9A84C;color:#0a0a0a;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:2px;">راسلنا على الواتساب</a>
</p>
<p style="margin:0;font-size:15px;color:#F5F0E8;line-height:1.8;">— ماجد<br>
<span style="color:#666;font-size:13px;">MA Learn</span></p>`;
  MailApp.sendEmail({
    to: email,
    subject: 'تحديث بشأن طلبك',
    name: 'MA Learn',
    replyTo: SUPPORT_EMAIL,
    htmlBody: emailShell('MA LEARN', body),
  });
}


// ── NOTIFICATION EMAIL (to Majid) ─────────────────────────────
function sendNotification(name, email, phone, country, workshop, source, interest) {
  const timestamp = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'dd/MM/yyyy — hh:mm a');
  const isCIW = workshop === 'Crafting Inspiration Workshop';
  const isHero = (source || '').indexOf('hero') === 0;
  const isBankTransfer = (source || '').indexOf('bank-transfer') === 0;

  const subject = isBankTransfer
    ? '🔴 تحويل بنكي يحتاج تأكيد — ' + (workshop || 'منتج')
    : isHero
      ? 'تسجيل من الموقع — ' + (interest ? interest.slice(0, 60) : 'منتج جديد')
      : isCIW
        ? 'تسجيل جديد — ورشة صناعة الإلهام'
        : 'تسجيل جديد — قائمة انتظار MA Learn';

  const sourceLabel = isBankTransfer
    ? '⚠️ تحويل بنكي معلّق — افتح Pending Transfers في الداشبورد للتأكيد'
    : isHero
      ? 'الكويز في الصفحة الرئيسية (' + source + ')'
      : isCIW
        ? 'ورشة صناعة الإلهام — قائمة الانتظار'
        : 'قائمة انتظار MA Learn';

  const interestRow = interest
    ? `<tr style="border-bottom:1px solid #eee;">
         <td style="padding:10px 0;color:#888;">المهتم بـ</td>
         <td style="padding:10px 0;color:#111;font-weight:bold;">${interest}</td>
       </tr>`
    : '';

  MailApp.sendEmail({
    to      : NOTIFY_EMAIL,
    subject : subject,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;direction:rtl;padding:24px;max-width:480px;">
        <p style="font-size:13px;color:#888;margin-bottom:16px;">${timestamp}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${name ? `<tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px 0;color:#888;width:90px;">الاسم</td>
            <td style="padding:10px 0;font-weight:bold;color:#111;">${name}</td>
          </tr>` : ''}
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px 0;color:#888;">البريد</td>
            <td style="padding:10px 0;color:#111;">${email}</td>
          </tr>
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px 0;color:#888;">الجوال</td>
            <td style="padding:10px 0;color:#111;">${phone}</td>
          </tr>
          ${country ? `<tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px 0;color:#888;">الدولة</td>
            <td style="padding:10px 0;color:#111;">${country}</td>
          </tr>` : ''}
          ${interestRow}
        </table>
        <div style="margin-top:20px;padding:12px 16px;background:#fffbf0;border-right:3px solid #C9A84C;">
          <p style="margin:0;font-size:13px;color:#555;">${sourceLabel}</p>
        </div>
      </div>
    `,
  });
}


// ── CONFIRMATION EMAIL (to registrant) ───────────────────────
function sendConfirmation(name, email, workshop) {
  const isCIW = workshop === 'Crafting Inspiration Workshop';

  const subject = isCIW
    ? 'تم تسجيلك في قائمة انتظار ورشة صناعة الإلهام ✓'
    : 'تم تسجيلك في قائمة انتظار MA Learn ✓';

  const heroLine = isCIW
    ? `وصل تسجيلك — أنت الآن على قائمة الانتظار لورشة <strong style="color:#C9A84C;">صناعة الإلهام</strong>.`
    : `وصل تسجيلك — أنت الآن على <strong style="color:#C9A84C;">قائمة انتظار MA Learn</strong>.`;

  const bodyLine = isCIW
    ? `بمجرد ما نفتح التسجيل، راح تكون أول من يعرف — وبسعر الإطلاق الحصري قبل الجميع.`
    : `هنا نرسل عروضنا، خصوماتنا، إصداراتنا الجديدة، ومميزات حصرية لأعضاء القائمة فقط. الانضمام مجاني — اللي عليك بس تنتبه لبريدك.`;

  MailApp.sendEmail({
    to      : email,
    subject : subject,
    name    : 'MA Learn',
    replyTo : SUPPORT_EMAIL,
    htmlBody: `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:Arial,sans-serif;direction:rtl;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1eb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0a0a0a;border-radius:2px;overflow:hidden;">

          <tr>
            <td style="background:#C9A84C;padding:4px 0;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <tr>
            <td style="padding:36px 40px 0;text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:0.2em;color:#C9A84C;text-transform:uppercase;">MA LEARN</p>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 40px 36px;">

              <p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#F5F0E8;">
                السلام عليكم ${name}،
              </p>

              <p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#F5F0E8;">
                ${heroLine}
              </p>

              <p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#BBBBBB;">
                ${bodyLine}
              </p>

              <p style="margin:0 0 32px;font-size:15px;line-height:1.8;color:#BBBBBB;">
                ابقَ على تواصل، نسعى دائماً لصناعة الإلهام.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="border-top:1px solid #1e1e1e;font-size:0;">&nbsp;</td>
                </tr>
              </table>

              <p style="margin:0 0 6px;font-size:13px;color:#666666;">
                وإذا عندك أي سؤال، راسلنا على:
              </p>
              <p style="margin:0 0 32px;font-size:13px;">
                <a href="mailto:${SUPPORT_EMAIL}" style="color:#C9A84C;text-decoration:none;">${SUPPORT_EMAIL}</a>
              </p>

              <p style="margin:0;font-size:15px;color:#F5F0E8;line-height:1.8;">
                — ماجد<br>
                <span style="color:#666;font-size:13px;">MA Learn</span>
              </p>

            </td>
          </tr>

          <tr>
            <td style="padding:20px 40px;border-top:1px solid #141414;text-align:center;">
              <p style="margin:0;font-size:11px;color:#444444;">
                © 2026 MA Learn · جميع الحقوق محفوظة
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
    `,
  });
}


// ── doGet (health check + read endpoints) ────────────────────
function doGet(e) {
  // Route GET-based admin reads (POST has redirect quirks; GET works clean)
  const action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'admin_list_pending') {
    try {
      return adminListPending(e.parameter);
    } catch (err) {
      return jsonResponse({ success: false, error: err.message });
    }
  }
  if (action === 'admin_confirm') {
    try {
      return adminConfirmTransfer(e.parameter);
    } catch (err) {
      return jsonResponse({ success: false, error: err.message });
    }
  }
  if (action === 'admin_reject') {
    try {
      return adminRejectTransfer(e.parameter);
    } catch (err) {
      return jsonResponse({ success: false, error: err.message });
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify({
      status         : 'live',
      version        : 'v9',
      sheet          : SHEET_NAME,
      heroEventsSheet: HERO_EVENTS_SHEET,
      source         : DEFAULT_SOURCE,
      columns        : 18,
      schema         : {
        waitlist: 'A:Date | B:Name | C:Email | D:Phone | E:Workshop | F-I:status | J:Country | K:Source | L:Interest | M-P:C2+WA external | Q:IG Handle(v9) | R:ManyChat Sub ID(v9)',
        heroEvents: 'A:Timestamp | B:SessionID | C:Event | D:PayloadJSON | E:UserAgent | F:Referrer'
      },
      actions: ['waitlist (default)', 'hero_event', 'admin_list_pending', 'admin_confirm', 'admin_reject'],
      manychat: 'POST action=waitlist with source=manychat:* and manychat_token=<secret>',
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
