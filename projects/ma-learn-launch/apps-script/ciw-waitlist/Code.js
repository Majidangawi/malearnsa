/**
 * ══════════════════════════════════════════════════════════════
 * MA Learn — Crafting Inspiration Workshop Waitlist
 * Google Apps Script — Web App
 *
 * SETUP STEPS:
 * 1. Go to script.google.com → New Project
 * 2. Paste this entire file as Code.gs
 * 3. Run setup() once to create the sheet headers
 * 4. Deploy → New Deployment → Web App
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the Web App URL
 * 6. Paste it into ciw-waitlist.html → const SCRIPT_URL = '...'
 * 7. Redeploy the HTML page
 * ══════════════════════════════════════════════════════════════
 */

// ── CONFIGURATION ─────────────────────────────────────────────
const SPREADSHEET_ID   = '1byx1WxktAKB1ajVFgEWbo6tMLlBo0gkcWZqXXO4FF58';
const SHEET_NAME       = 'Waitlist';
const WORKSHOP_NAME    = 'Crafting Inspiration Workshop';
const NOTIFY_EMAIL     = 'info@malearnsa.com';   // New registration alerts
const SUPPORT_EMAIL    = 'support@malearnsa.com'; // Shown in confirmation email


// ── HELPERS ───────────────────────────────────────────────────
function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}


// ── SETUP (run once) ──────────────────────────────────────────
function setup() {
  const ss = getSpreadsheet();

  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    try {
      const defaultSheet = ss.getSheetByName('Sheet1');
      if (defaultSheet) ss.deleteSheet(defaultSheet);
    } catch (_) {}
  }

  sheet.getRange(1, 1, 1, 5).setValues([[
    'التاريخ والوقت',
    'الاسم',
    'البريد الإلكتروني',
    'رقم الجوال',
    'الدورة / الورشة'
  ]]);

  const headerRange = sheet.getRange(1, 1, 1, 5);
  headerRange.setBackground('#C9A84C');
  headerRange.setFontColor('#000000');
  headerRange.setFontWeight('bold');

  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 170);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 240);
  sheet.setColumnWidth(4, 140);
  sheet.setColumnWidth(5, 220);

  Logger.log('✅ Setup complete.');
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
          workshop : e.parameter.workshop || WORKSHOP_NAME,
        };
      }
    }

    const name     = (data.name     || '').trim();
    const email    = (data.email    || '').trim();
    const phone    = (data.phone    || '').trim();
    const workshop = data.workshop  || WORKSHOP_NAME;

    // 1. Write to sheet
    sheet.appendRow([ new Date(), name, email, phone, workshop ]);

    const lastRow = sheet.getLastRow();
    if (lastRow % 2 === 0) {
      sheet.getRange(lastRow, 1, 1, 5).setBackground('#f9f6ef');
    }

    // 2. Notify Majid
    sendNotification(name, email, phone);

    // 3. Confirm to user
    if (email) sendConfirmation(name, email);

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
function sendNotification(name, email, phone) {
  const timestamp = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'dd/MM/yyyy — hh:mm a');

  MailApp.sendEmail({
    to      : NOTIFY_EMAIL,
    subject : 'تسجيل جديد — ورشة صناعة الإلهام',
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
          <tr>
            <td style="padding:10px 0;color:#888;">الجوال</td>
            <td style="padding:10px 0;color:#111;">${phone}</td>
          </tr>
        </table>
        <div style="margin-top:20px;padding:12px 16px;background:#fffbf0;border-right:3px solid #C9A84C;">
          <p style="margin:0;font-size:13px;color:#555;">ورشة صناعة الإلهام — قائمة الانتظار</p>
        </div>
      </div>
    `,
  });
}


// ── CONFIRMATION EMAIL (to registrant) ───────────────────────
function sendConfirmation(name, email) {
  MailApp.sendEmail({
    to      : email,
    subject : 'تم تسجيلك في قائمة انتظار ورشة صناعة الإلهام ✓',
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

          <!-- Header bar -->
          <tr>
            <td style="background:#C9A84C;padding:4px 0;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Logo area -->
          <tr>
            <td style="padding:36px 40px 0;text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:0.2em;color:#C9A84C;text-transform:uppercase;">MA LEARN</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 40px 36px;">

              <p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#F5F0E8;">
                السلام عليكم ${name}،
              </p>

              <p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#F5F0E8;">
                وصل تسجيلك — أنت الآن على قائمة الانتظار لورشة <strong style="color:#C9A84C;">صناعة الإلهام</strong>.
              </p>

              <p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#BBBBBB;">
                بمجرد ما نفتح التسجيل، راح تكون أول من يعرف — وبسعر الإطلاق الحصري قبل الجميع.
              </p>

              <p style="margin:0 0 32px;font-size:15px;line-height:1.8;color:#BBBBBB;">
                ابقَ على تواصل، نسعى دائماً لصناعة الإلهام.
              </p>

              <!-- Divider -->
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

          <!-- Footer -->
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
      workshop: WORKSHOP_NAME,
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
