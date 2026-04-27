/**
 * ──────────────────────────────────────────────────────────────
 * T3 COHORT 1 — 3-DAY REMINDER BLAST · 2026-04-27
 * ──────────────────────────────────────────────────────────────
 * Sends the locked T3 3-day reminder to all paying T3 C1 buyers.
 * Filters: only rows where Product = 'creative-ai-workshop-t3'.
 * Suppresses: Majid's test row + any pending-transfer buyers.
 *
 * SOP: references/sops/t3-cohort-3day-reminder.md
 * Locked copy approved by Majid 2026-04-27.
 *
 * RUN ORDER:
 *   1. testSingleEmail()   → sends to majed.engawi@gmail.com only
 *   2. (after Majid green-lights) sendBulkBlast() → 29 recipients
 *   3. After completion, optionally delete the script project.
 *
 * Re-runs are safe: rows with column J starting "SENT " are skipped.
 * ──────────────────────────────────────────────────────────────
 */

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

const SHEET_ID    = '1nkrwK-KJ7nD2kv_8zdYiLqot6RFoH-v67VpmjCzvYi0';
const SHEET_NAME  = 'Customers';

const FROM_NAME   = 'Majid Angawi';
const FROM_EMAIL  = 'majid@malearnsa.com';
const TEST_EMAIL  = 'majed.engawi@gmail.com';

// Subject = "جهز نفسك — ورشة صناعة الإلهام بعد ٣ أيام !"
const SUBJECT = decodeURIComponent('%D8%AC%D9%87%D8%B2%20%D9%86%D9%81%D8%B3%D9%83%20%E2%80%94%20%D9%88%D8%B1%D8%B4%D8%A9%20%D8%B5%D9%86%D8%A7%D8%B9%D8%A9%20%D8%A7%D9%84%D8%A5%D9%84%D9%87%D8%A7%D9%85%20%D8%A8%D8%B9%D8%AF%20%D9%A3%20%D8%A3%D9%8A%D8%A7%D9%85%20%21');

// Customers sheet column layout (1-indexed)
const DATE_COL    = 1; // A
const EMAIL_COL   = 2; // B
const NAME_COL    = 3; // C
const PHONE_COL   = 4; // D
const PRODUCT_COL = 5; // E
const AMOUNT_COL  = 6; // F (do NOT use as STATUS_COL — already populated)
const STATUS_COL  = 10; // J — first free column past Payment Method

// Filter — only T3 Cohort 1 paying buyers
const PRODUCT_FILTER = 'creative-ai-workshop-t3';

// Suppress list — emails that must NEVER be touched by this blast
// (lowercase comparison; one entry per line for readability)
const SUPPRESS_EMAILS = [
  'majed.engawi@gmail.com',  // Majid's test row (TESTT3 coupon)
  'moeabbas84@gmail.com'     // Mohammed Abbas — wire pending, suppress per memory
];

const RATE_DELAY_MS = 1200; // Gmail rate-limit safety

// ═══════════════════════════════════════════════════════════════
// MAIN — sendBulkBlast() runs the actual blast
// ═══════════════════════════════════════════════════════════════

function sendBulkBlast() {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet "' + SHEET_NAME + '" not found');

  // Auto-add status header on first run
  const headerCell = sheet.getRange(1, STATUS_COL);
  if (!headerCell.getValue()) headerCell.setValue('T3 C1 3-day Reminder');

  const data = sheet.getDataRange().getValues();
  const eligible = filterEligibleRows(data);

  // Pre-flight quota check
  const remaining = MailApp.getRemainingDailyQuota();
  Logger.log('Pre-flight: ' + eligible.length + ' rows pending · ' + remaining + ' Gmail quota remaining');
  if (eligible.length > remaining) {
    throw new Error('ABORTED — ' + eligible.length + ' rows pending but only ' + remaining + ' quota. Wait for reset (~10am Jeddah) or split.');
  }
  if (eligible.length === 0) {
    Logger.log('Nothing to send — all eligible rows already SENT or no matches.');
    return 'Nothing to send.';
  }

  let sent = 0, failed = 0;

  for (let j = 0; j < eligible.length; j++) {
    const item = eligible[j];

    try {
      const html = buildEmailHtml(item.firstName);
      GmailApp.sendEmail(item.email, SUBJECT, '', {
        htmlBody: html,
        name:     FROM_NAME,
        from:     FROM_EMAIL
      });
      sheet.getRange(item.rowIndex, STATUS_COL)
           .setValue('SENT ' + Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm'));
      sent++;
      Logger.log('✓ [' + sent + '/' + eligible.length + '] ' + item.firstName + ' <' + item.email + '>');
      Utilities.sleep(RATE_DELAY_MS);
    } catch (err) {
      sheet.getRange(item.rowIndex, STATUS_COL).setValue('FAILED: ' + err.message);
      failed++;
      Logger.log('✗ ' + item.email + ' — ' + err.message);
    }
  }

  const summary = 'Blast complete — Sent: ' + sent + ' · Failed: ' + failed + ' · Eligible: ' + eligible.length;
  Logger.log(summary);
  try { ss.toast(summary, 'T3 C1 Reminder', 15); } catch (e) {}
  return summary;
}

// ═══════════════════════════════════════════════════════════════
// TEST — runs ONE email to Majid only, never touches the list
// ═══════════════════════════════════════════════════════════════

function testSingleEmail() {
  const html = buildEmailHtml('ماجد');
  GmailApp.sendEmail(TEST_EMAIL, '[TEST] ' + SUBJECT, '', {
    htmlBody: html,
    name:     FROM_NAME,
    from:     FROM_EMAIL
  });
  Logger.log('Test email sent to ' + TEST_EMAIL);
}

// ═══════════════════════════════════════════════════════════════
// PREVIEW — logs the eligible recipient list without sending
// Run this BEFORE sendBulkBlast() to sanity-check the filter
// ═══════════════════════════════════════════════════════════════

function previewRecipients() {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const data  = sheet.getDataRange().getValues();
  const eligible = filterEligibleRows(data);

  Logger.log('=== ' + eligible.length + ' eligible recipients ===');
  for (let i = 0; i < eligible.length; i++) {
    Logger.log((i + 1) + '. ' + eligible[i].firstName + ' <' + eligible[i].email + '> (row ' + eligible[i].rowIndex + ')');
  }
  return eligible.length;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function filterEligibleRows(data) {
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const row     = data[i];
    const email   = String(row[EMAIL_COL - 1]   || '').trim();
    const name    = String(row[NAME_COL - 1]    || '').trim();
    const product = String(row[PRODUCT_COL - 1] || '').trim();
    const status  = String(row[STATUS_COL - 1]  || '').trim();

    if (!email) continue;
    if (product !== PRODUCT_FILTER) continue;                       // T3 C1 only
    if (SUPPRESS_EMAILS.indexOf(email.toLowerCase()) !== -1) continue; // suppress list
    if (status.indexOf('SENT') === 0) continue;                     // already sent

    out.push({
      rowIndex:  i + 1,
      email:     email,
      firstName: extractFirstName(name)
    });
  }
  return out;
}

function extractFirstName(fullName) {
  if (!fullName) return '';
  let first = fullName.split(/[\s,]+/)[0].trim();
  if (/^[a-zA-Z]/.test(first)) {
    first = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }
  return first;
}

// ═══════════════════════════════════════════════════════════════
// EMAIL BODY — locked T3 3-day reminder copy (approved 2026-04-27)
// SOP: references/sops/t3-cohort-3day-reminder.md
// ═══════════════════════════════════════════════════════════════

function buildEmailHtml(firstName) {
  const namePart = firstName ? ' ' + firstName : '';

  return '' +
'<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;color:#222;line-height:1.8;">' +

'  <p style="margin:0 0 6px;">السلام عليكم ورحمة الله وبركاته</p>' +
'  <p style="margin:0 0 22px;">كيف حالك يا' + namePart + '،</p>' +

'  <p style="margin:0 0 18px;">باقي ثلاثة أيام وتبدأ معنا "<span style="color:#C9A84C;font-weight:bold;">ورشة صناعة الإلهام</span>" — الدفعة الأولى.</p>' +

'  <p style="margin:0 0 22px;">والصراحة متحمس أشوفك!</p>' +

'  <p style="font-weight:bold;color:#222;margin:0 0 10px;">تفاصيل الجلسات الحية:</p>' +

'  <div style="background:#f9f6f0;border-right:3px solid #C9A84C;padding:20px 24px;margin:0 0 28px;border-radius:4px;">' +
'    <p style="margin:0 0 4px;color:#222;">&#x1F4C5; <strong>الخميس ٣٠ أبريل</strong> · الجلسة الأولى</p>' +
'    <p style="margin:0 0 16px;"><a href="https://meet.google.com/rbp-mtas-gcb?authuser=2&amp;hs=122" style="color:#8a6f1e;text-decoration:underline;font-weight:bold;font-size:0.95rem;">انضم للجلسة الأولى عبر Google Meet</a></p>' +

'    <p style="margin:0 0 4px;color:#222;">&#x1F4C5; <strong>الجمعة ١ مايو</strong> · الجلسة الثانية</p>' +
'    <p style="margin:0 0 16px;"><a href="https://meet.google.com/wfu-rxby-jnt?authuser=2&amp;hs=122" style="color:#8a6f1e;text-decoration:underline;font-weight:bold;font-size:0.95rem;">انضم للجلسة الثانية عبر Google Meet</a></p>' +

'    <p style="margin:0 0 4px;color:#222;">&#x1F4C5; <strong>السبت ٢ مايو</strong> · الجلسة الثالثة</p>' +
'    <p style="margin:0;"><a href="https://meet.google.com/vha-zwwx-xtp?authuser=2&amp;hs=122" style="color:#8a6f1e;text-decoration:underline;font-weight:bold;font-size:0.95rem;">انضم للجلسة الثالثة عبر Google Meet</a></p>' +

'    <p style="margin:18px 0 0;padding-top:14px;border-top:1px solid #e8dfc8;color:#444;">&#x1F556; <strong>الوقت:</strong> ٧:٠٠ – ١٠:٠٠ مساءً · بتوقيت جدة</p>' +
'  </div>' +

'  <p style="font-weight:bold;color:#222;margin:0 0 6px;">جهز هذي التطبيقات إذا تحب:</p>' +
'  <ul style="margin:0 22px 24px 0;padding:0;color:#444;">' +
'    <li style="margin:4px 0;">Higgsfield</li>' +
'    <li style="margin:4px 0;">Gemini</li>' +
'    <li style="margin:4px 0;">Midjourney</li>' +
'    <li style="margin:4px 0;">Weavy ai</li>' +
'    <li style="margin:4px 0;">Adobe Fireflies or Figma FigJam</li>' +
'  </ul>' +

'  <p style="font-weight:bold;color:#222;margin:0 0 6px;">قبل الورشة — حضّر نفسك:</p>' +
'  <ol style="margin:0 22px 24px 0;padding:0;color:#444;">' +
'    <li style="margin:4px 0;">مكان هادئ تقدر تركز فيه ٣ ساعات بدون مقاطعة</li>' +
'    <li style="margin:4px 0;">دفتر ملاحظات (ورقي أو رقمي — اللي يريحك)</li>' +
'    <li style="margin:4px 0;">تأكد من الإنترنت والصوت قبل الجلسة بنص ساعة</li>' +
'    <li style="margin:4px 0;">الكاميرا اختيارية بس تخلي التجربة أحلى — وأنا بشوفك بحب أكثر</li>' +
'  </ol>' +

'  <div style="background:#fafaf6;border-right:2px solid #e6d59f;padding:14px 20px;margin:0 0 24px;border-radius:4px;color:#555;">' +
'    <strong style="color:#222;">نصيحة من القلب:</strong> ما تبدأ الجلسة وأنت متعب أو مشغول الذهن. خمس دقائق هدوء قبل ما تدخل تسوي فرق كبير في اللي راح تستفيده.' +
'  </div>' +

'  <p style="color:#444;margin:0 0 22px;">أي سؤال أو طارئ — رد على هذي الرسالة مباشرة.</p>' +

'  <p style="margin:0 0 4px;">نلتقي يوم الورشة بإذن الله.</p>' +

'  <p style="margin:18px 0 0;font-weight:bold;color:#222;">ماجد</p>' +
'</div>';
}
