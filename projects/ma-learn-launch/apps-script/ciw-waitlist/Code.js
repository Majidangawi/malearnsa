/**
 * ══════════════════════════════════════════════════════════════
 * MA Learn — Waitlist
 * Google Apps Script — Web App
 *
 * Generalised 2026-04-26: was previously the CIW workshop waitlist
 * collector. Now serves the generic /waitlist/ page (malearnsa.com/waitlist/).
 * Existing column layout preserved (F=Sent, G=Purchase, H=Reminder,
 * I=Final Reminder are externally managed by blast scripts). Country
 * added at column J to avoid collision.
 *
 * Bound spreadsheet: 1byx1WxktAKB1ajVFgEWbo6tMLlBo0gkcWZqXXO4FF58
 * Sheet name:        Waitlist
 * Live deployment:   v5 — AKfycby2tDtm76JhBU-cwT6wnFVTp5ysYxsf73ZKGxoY-ZadbswSXRK_CkjpgkDbds4cJCO0
 *
 * Column layout (1-indexed):
 *   A: التاريخ والوقت | B: الاسم | C: البريد | D: الجوال
 *   E: الدورة/الورشة (legacy) / "MA Learn Waitlist" for new signups
 *   F: Sent Status (managed by waitlist-blast)
 *   G: Purchase Status (managed externally — see memory)
 *   H: Reminder Status (managed by waitlist-blast)
 *   I: Final Reminder Status (managed by waitlist-blast)
 *   J: الدولة (NEW — written by this script only)
 * ══════════════════════════════════════════════════════════════
 */

// ── CONFIGURATION ─────────────────────────────────────────────
const SPREADSHEET_ID   = '1byx1WxktAKB1ajVFgEWbo6tMLlBo0gkcWZqXXO4FF58';
const SHEET_NAME       = 'Waitlist';
const DEFAULT_SOURCE   = 'MA Learn Waitlist';
const NOTIFY_EMAIL     = 'info@malearnsa.com';
const SUPPORT_EMAIL    = 'support@malearnsa.com';


// ── HELPERS ───────────────────────────────────────────────────
function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}


// ── SETUP (run once to add الدولة header at col J) ───────────
// NOTE: Existing cols A-I are already in production with status-tracking
// data. Setup ONLY touches J1 (header), it does not rewrite A-I.
function setup() {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Waitlist sheet not found');

  const countryHeaderCell = sheet.getRange(1, 10); // J1
  countryHeaderCell.setValue('الدولة');
  countryHeaderCell.setBackground('#C9A84C');
  countryHeaderCell.setFontColor('#000000');
  countryHeaderCell.setFontWeight('bold');
  sheet.setColumnWidth(10, 180);

  Logger.log('✅ Country header added at J1.');
  Logger.log('📊 Spreadsheet URL: ' + ss.getUrl());
}


// ── doPost ────────────────────────────────────────────────────
function doPost(e) {
  try {
    const ss    = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();

    let data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (_) {
        data = {
          name     : e.parameter.name     || '',
          email    : e.parameter.email    || '',
          phone    : e.parameter.phone    || '',
          country  : e.parameter.country  || '',
          workshop : e.parameter.workshop || DEFAULT_SOURCE,
        };
      }
    }

    const name     = (data.name     || '').trim();
    const email    = (data.email    || '').trim();
    const phone    = (data.phone    || '').trim();
    const country  = (data.country  || '').trim();
    const workshop = data.workshop  || DEFAULT_SOURCE;

    // 1. Write to sheet — preserve cols F-I (status tracking),
    //    write country at col J (10th position).
    sheet.appendRow([ new Date(), name, email, phone, workshop, '', '', '', '', country ]);

    const lastRow = sheet.getLastRow();
    if (lastRow % 2 === 0) {
      // Stripe only the data columns we own (A-E + J), skip F-I.
      sheet.getRange(lastRow, 1, 1, 5).setBackground('#f9f6ef');
      sheet.getRange(lastRow, 10, 1, 1).setBackground('#f9f6ef');
    }

    // 1b. Auto-add to newsletter Subscribers (via token-validator admin endpoint)
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

    // 2. Notify Majid
    sendNotification(name, email, phone, country, workshop);

    // 3. Confirm to user
    if (email) sendConfirmation(name, email, workshop);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, row: lastRow }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('Error in doPost: ' + err.message);
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// ── NOTIFICATION EMAIL (to Majid) ─────────────────────────────
function sendNotification(name, email, phone, country, workshop) {
  const timestamp = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'dd/MM/yyyy — hh:mm a');
  const isCIW = workshop === 'Crafting Inspiration Workshop';
  const subject = isCIW
    ? 'تسجيل جديد — ورشة صناعة الإلهام'
    : 'تسجيل جديد — قائمة انتظار MA Learn';
  const sourceLabel = isCIW ? 'ورشة صناعة الإلهام — قائمة الانتظار' : 'قائمة انتظار MA Learn';

  MailApp.sendEmail({
    to      : NOTIFY_EMAIL,
    subject : subject,
    htmlBody: `
      <div style="font-family:Arial,sans-serif;direction:rtl;padding:24px;max-width:480px;">
        <p style="font-size:13px;color:#888;margin-bottom:16px;">${timestamp}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px 0;color:#888;width:90px;">الاسم</td>
            <td style="padding:10px 0;font-weight:bold;color:#111;">${name}</td>
          </tr>
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px 0;color:#888;">البريد</td>
            <td style="padding:10px 0;color:#111;">${email}</td>
          </tr>
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px 0;color:#888;">الجوال</td>
            <td style="padding:10px 0;color:#111;">${phone}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#888;">الدولة</td>
            <td style="padding:10px 0;color:#111;">${country || '—'}</td>
          </tr>
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


// ── doGet (health check) ──────────────────────────────────────
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({
      status  : 'live',
      sheet   : SHEET_NAME,
      source  : DEFAULT_SOURCE,
      columns : 10,
      countryCol: 'J',
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
