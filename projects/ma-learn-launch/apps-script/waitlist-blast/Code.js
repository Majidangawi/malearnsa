/**
 * ──────────────────────────────────────────────────────────────
 * WAITLIST BLAST — ورشة صناعة الإلهام
 * ──────────────────────────────────────────────────────────────
 * Standalone Apps Script — does NOT touch the sheet-bound script
 * that handles form submissions. Reads the Waitlist sheet by ID.
 *
 * Sends one personalized email to every person on the Waitlist tab.
 * Tracks status in column F ("Sent Status") so re-runs skip already-sent rows.
 *
 * HOW TO RUN:
 *   1. Go to https://script.google.com → "New project"
 *   2. Delete the default Code.gs content
 *   3. Paste this entire file
 *   4. Save (⌘S) → name the project "Waitlist Blast"
 *   5. First time: click Run on `testSingleEmail` → authorize Gmail + Sheets popup
 *      → check majed.engawi@gmail.com for the test email
 *   6. When happy, click Run on `sendWaitlistBlast`
 *   7. Watch progress in the Executions tab (left sidebar)
 *   8. After the blast, you can delete this whole Apps Script project safely
 *
 * SAFETY:
 *   - testSingleEmail() sends ONLY to majed.engawi@gmail.com — never to the list
 *   - sendWaitlistBlast() skips rows marked "SENT …" in column F (safe to re-run)
 *   - Column F is auto-added on first run
 *   - 1.2s delay between sends to stay safely under Gmail rate limits
 *   - This script lives in its own project, fully independent from the
 *     form-submission Apps Script bound to the sheet
 * ──────────────────────────────────────────────────────────────
 */

const SHEET_ID      = '1byx1WxktAKB1ajVFgEWbo6tMLlBo0gkcWZqXXO4FF58';
const SHEET_NAME    = 'Waitlist';
const FROM_NAME     = 'Majid Angawi | MA Learn';
const FROM_EMAIL    = 'info@malearnsa.com';
// Subject built via decodeURIComponent (pure ASCII source → UTF-8 at runtime).
// 4-byte emojis (like 🚀) cannot be used in subjects — GmailApp's MIME encoder corrupts them.
// For a visual accent we use ✨ (U+2728), a 3-byte BMP character that encodes cleanly.
const SUBJECT       = decodeURIComponent('%D9%88%D8%B9%D8%AF%D8%AA%D9%83%D9%85%20%D9%88%D8%A3%D9%88%D9%81%D9%8A%D8%AA..%20%D8%A7%D9%84%D8%AA%D8%B3%D8%AC%D9%8A%D9%84%20%D9%81%D9%8A%20%D9%88%D8%B1%D8%B4%D8%A9%20%D8%B5%D9%86%D8%A7%D8%B9%D8%A9%20%D8%A7%D9%84%D8%A5%D9%84%D9%87%D8%A7%D9%85%20%D8%A8%D8%AF%D8%A3%20(%D8%AE%D8%A7%D8%B5%20%D9%84%D9%83)%20%E2%9C%A8');
const STATUS_COL    = 6; // column F (1-indexed)
const RATE_DELAY_MS = 1200;
const TEST_EMAIL    = 'majed.engawi@gmail.com';

// ──────────────────────────────────────────────────────────────
// MAIN — run this to send the blast
// ──────────────────────────────────────────────────────────────
function sendWaitlistBlast() {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet "' + SHEET_NAME + '" not found');

  // Ensure Sent Status column header
  const headerCell = sheet.getRange(1, STATUS_COL);
  if (!headerCell.getValue()) headerCell.setValue('Sent Status');

  const data = sheet.getDataRange().getValues();

  // Pre-flight: count pending rows vs remaining Gmail daily quota
  let pending = 0;
  for (let i = 1; i < data.length; i++) {
    const email  = String(data[i][2] || '').trim();
    const status = String(data[i][STATUS_COL - 1] || '').trim();
    if (email && status.indexOf('SENT') !== 0) pending++;
  }
  const remaining = MailApp.getRemainingDailyQuota();
  Logger.log('Pre-flight: ' + pending + ' rows to send · ' + remaining + ' quota remaining');
  if (pending > remaining) {
    const msg = 'ABORTED — ' + pending + ' rows to send but only ' + remaining + ' quota remaining today. Wait for reset (~10am Jeddah tomorrow) or split the blast.';
    Logger.log(msg);
    throw new Error(msg);
  }

  let sent = 0, skipped = 0, failed = 0;

  for (let i = 1; i < data.length; i++) {
    const row    = data[i];
    const name   = String(row[1] || '').trim();
    const email  = String(row[2] || '').trim();
    const status = String(row[STATUS_COL - 1] || '').trim();

    if (!email) { skipped++; continue; }
    if (status.indexOf('SENT') === 0) { skipped++; continue; }

    try {
      const firstName = extractFirstName(name);
      const html      = buildEmailHtml(firstName);
      GmailApp.sendEmail(email, SUBJECT, '', {
        htmlBody: html,
        name:     FROM_NAME,
        from:     FROM_EMAIL
      });
      sheet.getRange(i + 1, STATUS_COL)
           .setValue('SENT ' + Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm'));
      sent++;
      Logger.log('✓ [' + sent + '] ' + firstName + ' <' + email + '>');
      Utilities.sleep(RATE_DELAY_MS);
    } catch (err) {
      sheet.getRange(i + 1, STATUS_COL).setValue('FAILED: ' + err.message);
      failed++;
      Logger.log('✗ ' + email + ' — ' + err.message);
    }
  }

  const summary = 'Blast complete — Sent: ' + sent + ' · Skipped: ' + skipped + ' · Failed: ' + failed;
  Logger.log(summary);
  try { ss.toast(summary, 'Waitlist Blast', 15); } catch (e) { /* no UI context when run from script editor */ }
  return summary;
}

// ──────────────────────────────────────────────────────────────
// TEST — sends one email to Majid only, NEVER touches the list
// ──────────────────────────────────────────────────────────────
function testSingleEmail() {
  const html = buildEmailHtml('Majid');
  GmailApp.sendEmail(TEST_EMAIL, '[TEST] ' + SUBJECT, '', {
    htmlBody: html,
    name:     FROM_NAME,
    from:     FROM_EMAIL
  });
  Logger.log('Test email sent to ' + TEST_EMAIL);
}

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────
function extractFirstName(fullName) {
  if (!fullName) return '';
  let first = fullName.split(/[\s,]+/)[0].trim();
  if (/^[a-zA-Z]/.test(first)) {
    first = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }
  return first;
}

function buildEmailHtml(firstName) {
  const greeting = firstName
    ? 'السلام عليكم ورحمة الله وبركاته ' + firstName + '،'
    : 'السلام عليكم ورحمة الله وبركاته،';

  return '' +
'<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;color:#222;line-height:1.8;">' +
'  <p>' + greeting + '</p>' +
'  <p>زي ما وعدتك إنك رح تكون أول من يعرف.. لأنك في قائمة الانتظار، لك الأولوية <strong>"الآن"</strong> قبل الكل.</p>' +
'  <p style="font-size:1.15rem;font-weight:bold;color:#222;line-height:1.5;margin:22px 0 18px;">' +
'    ورشة <span style="color:#C9A84C;">صناعة الإلهام</span> — التسجيل فتح اليوم.' +
'  </p>' +
'  <p style="color:#444;">' +
'    الهدف من هذه الورشة ليس مجرد "شرح أدوات"، بل أن ننتج معاً عملاً إبداعياً متكاملاً باستخدام الذكاء الاصطناعي — من البريف (Brief) وحتى التسليم النهائي.' +
'  </p>' +
'  <p style="font-weight:bold;color:#222;margin-top:22px;margin-bottom:6px;">لماذا هذه الورشة مختلفة؟</p>' +
'  <p style="color:#444;margin-top:0;">' +
'    في ٣ أيام، وبناءً على بريف حقيقي، ستتخرج وفي يدك مشروع كامل صنعتَه أنت بيدك، وبإشرافي المباشر.' +
'  </p>' +
'  <div style="background:#f9f6f0;border-right:3px solid #C9A84C;padding:20px 24px;margin:28px 0;border-radius:4px;">' +
'    <p style="margin:0 0 12px;font-weight:bold;color:#222;">تفاصيل الورشة (المجموعة الأولى):</p>' +
'    <p style="margin:6px 0;color:#444;">&#x1F4C5; <strong>التاريخ:</strong> ٣٠ أبريل — ٢ مايو ٢٠٢٦</p>' +
'    <p style="margin:6px 0;color:#444;">&#x1F556; <strong>الوقت:</strong> ٧–١٠ مساءً (توقيت جدة) · أونلاين</p>' +
'    <p style="margin:6px 0;color:#444;">&#x1F465; <strong>المقاعد:</strong> ٣٠ مقعداً فقط (لضمان الجودة والتركيز مع كل مشترك).</p>' +
'    <p style="margin:6px 0 0;color:#8a6f1e;font-weight:bold;">&#x1F4B0; <strong>استثمارك:</strong> ٧٩٩ ر.س — سعر مبكر خاص لك حتى ١٩ أبريل، بعدها يرتفع لـ ٩٩٩ ر.س.</p>' +
'  </div>' +
'  <p style="color:#444;">' +
'    <strong style="color:#222;">وهدية استثنائية لأهل المجموعة الأولى فقط:</strong><br>' +
'    بمجرد تسجيلك، ستحصل على دورة <strong>"مدخل إلى الذكاء الاصطناعي الإبداعي"</strong> (١٧ درساً مسجلاً، قيمتها ٤٩٩ ر.س) — مجاناً كدليل مرجعي لك للأبد.' +
'  </p>' +
'  <p style="color:#888;font-size:0.88rem;">' +
'    بمجرد اكتمال الـ ٣٠ مقعداً، تنتهي هذه الهدية ولن تعود.' +
'  </p>' +
'  <p style="text-align:center;margin:36px 0 28px;">' +
'    <a href="https://malearnsa.com/creative-ai-workshop/"' +
'       style="background:#C9A84C;color:#000;padding:16px 38px;text-decoration:none;font-weight:bold;font-size:1rem;display:inline-block;line-height:1.3;">' +
'      احجز مقعدك الآن<br>' +
'      <span style="font-weight:400;font-size:0.82rem;">واستفد من الخصم والمكافأة</span>' +
'    </a>' +
'  </p>' +
'  <p style="color:#666;font-size:0.9rem;text-align:center;">' +
'    الإعلان العام على إنستقرام <strong>سيكون قريباً جداً</strong>، وحتى ذلك الحين، المقاعد محجوزة لك ولأهل القائمة فقط.' +
'  </p>' +
'  <hr style="border:none;border-top:1px solid #eee;margin:36px 0 24px;">' +
'  <p style="margin:0;">' +
'    أشوفك في الورشة،<br>' +
'    <strong>ماجد عنقاوي</strong><br>' +
'    <span style="color:#888;font-size:0.85rem;">صناعة الإلهام · MA Learn</span>' +
'  </p>' +
'</div>';
}
// ═══════════════════════════════════════════════════════════════
// REMINDER BLAST — ورشة صناعة الإلهام
// ═══════════════════════════════════════════════════════════════

const REMINDER_SUBJECT = decodeURIComponent('%D9%87%D9%84%20%D8%B3%D8%AA%D9%81%D9%88%D8%AA%20%D8%B3%D8%B9%D8%B1%20%D8%A7%D9%84%D8%A5%D8%B7%D9%84%D8%A7%D9%82%D8%9F%20(%D8%A8%D9%82%D9%8A%20%D9%8A%D9%88%D9%85%D8%A7%D9%86)');
const PURCHASE_COL = 7; // column G
const REMINDER_COL = 8; // column H

function testReminderEmail() {
  const html = buildReminderEmailHtml('Majid');
  GmailApp.sendEmail(TEST_EMAIL, '[TEST] ' + REMINDER_SUBJECT, '', {
    htmlBody: html, name: FROM_NAME, from: FROM_EMAIL
  });
  Logger.log('Test reminder sent to ' + TEST_EMAIL);
}

function sendReminderBlast() {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet "' + SHEET_NAME + '" not found');
  const header = sheet.getRange(1, REMINDER_COL);
  if (!header.getValue()) header.setValue('Reminder Status');

  const data = sheet.getDataRange().getValues();

  let sent = 0, skipped = 0, failed = 0; const seen = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = String(row[1]||'').trim();
    const email = String(row[2]||'').trim();
    const eLower = email.toLowerCase();
    const purchase = String(row[PURCHASE_COL-1]||'').trim();
    const reminder = String(row[REMINDER_COL-1]||'').trim();
    if (!email) { skipped++; continue; }
    if (seen[eLower]) { skipped++; continue; }
    seen[eLower] = true;
    if (purchase === 'PURCHASED') { skipped++; continue; }
    if (reminder.indexOf('REMINDED') === 0) { skipped++; continue; }
    try {
      const firstName = extractFirstName(name);
      const html = buildReminderEmailHtml(firstName);
      sendViaGmailApi(email, REMINDER_SUBJECT, html);
      sheet.getRange(i+1, REMINDER_COL).setValue('REMINDED ' + Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm'));
      sent++;
      Logger.log('✓ [' + sent + '] ' + firstName + ' <' + email + '>');
      Utilities.sleep(RATE_DELAY_MS);
    } catch (err) {
      sheet.getRange(i+1, REMINDER_COL).setValue('FAILED: ' + err.message);
      failed++;
      Logger.log('✗ ' + email + ' — ' + err.message);
    }
  }
  const summary = 'Reminder blast complete — Sent: ' + sent + ' · Skipped: ' + skipped + ' · Failed: ' + failed;
  Logger.log(summary);
  return summary;
}

// Uses Gmail Advanced Service — separate quota bucket (2,000/day Workspace)
// instead of GmailApp's 100-1,500/day Apps Script quota.
// Requires: Services (+) → Gmail API → Add, in the Apps Script editor.
function sendViaGmailApi(to, subject, htmlBody) {
  const subjectB64 = '=?UTF-8?B?' + Utilities.base64Encode(subject, Utilities.Charset.UTF_8) + '?=';
  const raw = [
    'From: "' + FROM_NAME + '" <' + FROM_EMAIL + '>',
    'To: ' + to,
    'Subject: ' + subjectB64,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Utilities.base64Encode(htmlBody, Utilities.Charset.UTF_8)
  ].join('\r\n');
  const encoded = Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '');
  Gmail.Users.Messages.send({ raw: encoded }, 'me');
}

function buildReminderEmailHtml(firstName) {
  const greeting = firstName
    ? 'السلام عليكم ورحمة الله وبركاته ' + firstName + '،'
    : 'السلام عليكم ورحمة الله وبركاته،';
  return '' +
'<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;color:#222;line-height:1.85;">' +
'  <p>' + greeting + '</p>' +
'  <p>قبل أيام انضممت لقائمة الانتظار لـ <strong>ورشة صناعة الإلهام</strong> — وكنت أول من وصله التسجيل.<br>' +
'     من وقتها، <strong>١٦ شخص حجزوا مقاعدهم</strong>.</p>' +
'  <p style="font-size:1.1rem;font-weight:bold;color:#222;line-height:1.5;margin:22px 0 12px;">' +
'    المتبقي الآن: <span style="color:#FF3B30;">١٤ مقعد فقط</span>.' +
'  </p>' +
'  <p style="color:#444;">' +
'    السعر المبكر (<strong style="color:#8a6f1e;">٧٩٩ ر.س</strong>) ينتهي <strong>الأحد ١٩ أبريل</strong> — بعدها يرتفع لـ ٩٩٩ ر.س.' +
'  </p>' +
'  <p style="color:#444;margin-top:20px;">' +
'    ولأن المجموعة الأولى اللي حجزت بدأت تتعلم فعلاً، أنفتحت لهم <strong>ثلاث محاور كاملة</strong> من دورة <strong>"مدخل إلى الذكاء الاصطناعي الإبداعي"</strong> — الهدية المجانية اللي تأتي مع مقعدك.' +
'  </p>' +
'  <div style="background:#f9f6f0;border-right:3px solid #C9A84C;padding:20px 24px;margin:28px 0;border-radius:4px;">' +
'    <p style="margin:0 0 12px;font-weight:bold;color:#222;font-size:1rem;">ايش اللي رح تخسره لو ما حجزت قبل الأحد؟</p>' +
'    <p style="margin:8px 0;color:#444;">&#x1F381; دورة <strong>"مدخل إلى الذكاء الاصطناعي الإبداعي"</strong> — ١٧ درساً، قيمتها ٤٩٩ ر.س — مجاناً</p>' +
'    <p style="margin:8px 0;color:#444;">&#x1F4C5; ٣ جلسات مباشرة معي — ٣٠ أبريل إلى ٢ مايو</p>' +
'    <p style="margin:8px 0;color:#444;">&#x1F4AC; جلسة نقد شخصية بعد الورشة</p>' +
'    <p style="margin:8px 0 0;color:#8a6f1e;font-weight:bold;">&#x1F4B0; ٢٠٠ ر.س فرق بين السعر المبكر والسعر العادي</p>' +
'  </div>' +
'  <p style="color:#444;">' +
'    ما أبي أضغط عليك. لو الورشة مو مناسبة لك، لا بأس.<br>' +
'    لكن حبيت أتأكد إنك ما فوّت الفرصة — لأن المقاعد بتخلص.' +
'  </p>' +
'  <p style="text-align:center;margin:36px 0 28px;">' +
'    <a href="https://malearnsa.com/creative-ai-workshop/"' +
'       style="background:#C9A84C;color:#000;padding:16px 38px;text-decoration:none;font-weight:bold;font-size:1rem;display:inline-block;line-height:1.3;">' +
'      احجز مقعدك قبل فوات الأوان' +
'    </a>' +
'  </p>' +
'  <hr style="border:none;border-top:1px solid #eee;margin:36px 0 24px;">' +
'  <p style="margin:0;">' +
'    أشوفك في الورشة،<br>' +
'    <strong>ماجد عنقاوي</strong><br>' +
'    <span style="color:#888;font-size:0.85rem;">صناعة الإلهام · MA Learn</span>' +
'  </p>' +
'</div>';
}
function scheduleReminderAt8pm() {
  // Remove any existing triggers for sendReminderBlast (safe to re-run)
  const existing = ScriptApp.getProjectTriggers();
  for (const t of existing) {
    if (t.getHandlerFunction() === 'sendReminderBlast') {
      ScriptApp.deleteTrigger(t);
    }
  }

  // Target: today at 20:00 Jeddah = 17:00 UTC (Jeddah is UTC+3, no DST)
  const now = new Date();
  const target = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    17, 0, 0
  ));

  if (target <= now) {
    throw new Error('Already past 20:00 Jeddah today. Run sendReminderBlast manually OR edit the function to schedule for tomorrow.');
  }

  ScriptApp.newTrigger('sendReminderBlast').timeBased().at(target).create();
  const msg = 'Reminder scheduled for ' + target.toISOString() + ' UTC (= 20:00 Jeddah tonight)';
  Logger.log(msg);
  return msg;
}
function checkQuota() {
  Logger.log('Remaining: ' + MailApp.getRemainingDailyQuota());
}

// ═══════════════════════════════════════════════════════════════
// FINAL REMINDER BLAST — 6 hours left, 5 seats remaining (Apr 19)
// Uses the waitlist sheet's existing PURCHASE_COL (G) to skip buyers,
// same pattern as sendReminderBlast above.
// ═══════════════════════════════════════════════════════════════

// Subject: باقي ٥ مقاعد و باقي ٦ ساعات فقط على نهاية التسجيل المبكر
const FINAL_SUBJECT = decodeURIComponent('%D8%A8%D8%A7%D9%82%D9%8A%20%D9%A5%20%D9%85%D9%82%D8%A7%D8%B9%D8%AF%20%D9%88%20%D8%A8%D8%A7%D9%82%D9%8A%20%D9%A6%20%D8%B3%D8%A7%D8%B9%D8%A7%D8%AA%20%D9%81%D9%82%D8%B7%20%D8%B9%D9%84%D9%89%20%D9%86%D9%87%D8%A7%D9%8A%D8%A9%20%D8%A7%D9%84%D8%AA%D8%B3%D8%AC%D9%8A%D9%84%20%D8%A7%D9%84%D9%85%D8%A8%D9%83%D8%B1');
const FINAL_COL     = 9; // column I — "Final Reminder Status"

function testFinalReminderEmail() {
  const html = buildFinalReminderEmailHtml('Majid');
  GmailApp.sendEmail(TEST_EMAIL, '[TEST] ' + FINAL_SUBJECT, '', {
    htmlBody: html, name: FROM_NAME, from: FROM_EMAIL
  });
  Logger.log('Test final reminder sent to ' + TEST_EMAIL);
}

// Dry run — logs counts and a 5-row sample WITHOUT sending anything.
function previewFinalReminder() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  let pending = 0, buyersSkipped = 0, dupes = 0, empty = 0, alreadySent = 0;
  const sample = [];
  const seen = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = String(row[1] || '').trim();
    const email = String(row[2] || '').trim();
    const eLower = email.toLowerCase();
    const purchase = String(row[PURCHASE_COL - 1] || '').trim();
    const final = String(row[FINAL_COL - 1] || '').trim();
    if (!email) { empty++; continue; }
    if (seen[eLower]) { dupes++; continue; }
    seen[eLower] = true;
    if (purchase === 'PURCHASED') { buyersSkipped++; continue; }
    if (final.indexOf('SENT') === 0) { alreadySent++; continue; }
    pending++;
    if (sample.length < 5) sample.push(name + ' <' + email + '>');
  }
  Logger.log('Pending to send: ' + pending);
  Logger.log('Skipped — already bought (col G = PURCHASED): ' + buyersSkipped);
  Logger.log('Skipped — duplicates: ' + dupes);
  Logger.log('Skipped — no email: ' + empty);
  Logger.log('Skipped — already reminded: ' + alreadySent);
  Logger.log('Sample of first 5 recipients:');
  sample.forEach(function(s) { Logger.log('  - ' + s); });
  Logger.log('GmailApp quota remaining (separate bucket from Gmail API): ' + MailApp.getRemainingDailyQuota());
  return { pending: pending, buyersSkipped: buyersSkipped, sample: sample };
}

function sendFinalReminderBlast() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet "' + SHEET_NAME + '" not found');
  const header = sheet.getRange(1, FINAL_COL);
  if (!header.getValue()) header.setValue('Final Reminder Status');

  const data = sheet.getDataRange().getValues();
  let sent = 0, skipped = 0, failed = 0, skippedBuyers = 0, skippedDupes = 0;
  const seen = {};

  for (let i = 1; i < data.length; i++) {
    const row   = data[i];
    const name  = String(row[1] || '').trim();
    const email = String(row[2] || '').trim();
    const eLower = email.toLowerCase();
    const purchase = String(row[PURCHASE_COL - 1] || '').trim();
    const final = String(row[FINAL_COL - 1] || '').trim();

    if (!email) { skipped++; continue; }
    if (seen[eLower]) { skippedDupes++; skipped++; continue; }
    seen[eLower] = true;
    if (purchase === 'PURCHASED') { skippedBuyers++; skipped++; continue; }
    if (final.indexOf('SENT') === 0) { skipped++; continue; }

    try {
      const firstName = extractFirstName(name);
      const html = buildFinalReminderEmailHtml(firstName);
      sendViaGmailApi(email, FINAL_SUBJECT, html);
      sheet.getRange(i + 1, FINAL_COL).setValue('SENT ' + Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm'));
      sent++;
      Logger.log('✓ [' + sent + '] ' + firstName + ' <' + email + '>');
      Utilities.sleep(RATE_DELAY_MS);
    } catch (err) {
      sheet.getRange(i + 1, FINAL_COL).setValue('FAILED: ' + err.message);
      failed++;
      Logger.log('✗ ' + email + ' — ' + err.message);
    }
  }

  const summary = 'Final reminder complete — Sent: ' + sent +
                  ' · Skipped: ' + skipped + ' (buyers: ' + skippedBuyers +
                  ', dupes: ' + skippedDupes + ')' +
                  ' · Failed: ' + failed;
  Logger.log(summary);
  return summary;
}

function buildFinalReminderEmailHtml(firstName) {
  const greeting = firstName
    ? 'السلام عليكم ورحمة الله وبركاته ' + firstName + '،'
    : 'السلام عليكم ورحمة الله وبركاته،';

  return '' +
'<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;color:#222;line-height:1.8;">' +
'  <p>' + greeting + '</p>' +
'' +
'  <p style="color:#222;font-size:1.05rem;margin:18px 0 14px;">' +
'    ورشة <span style="color:#C9A84C;">صناعة الإلهام</span> سعرها <strong>٩٩٩ ريال</strong>.' +
'  </p>' +
'' +
'  <p style="color:#444;">' +
'    الذكاء الاصطناعي يتحرك بسرعة، والناس حولك تتعلم وتسبق كل يوم. في نقطة، القرار يصير واضح: إما تستثمر في نفسك وتتحرك، أو تنتظر وتتفرج على غيرك يسبقك.' +
'  </p>' +
'' +
'  <p style="color:#444;">' +
'    لأنك من أهل القائمة، سعرك <strong style="color:#8a6f1e;">٧٩٩ ريال</strong> — حصرياً للمسجلين في قائمة الانتظار — مع هدية دورة "مدخل إلى الذكاء الاصطناعي الإبداعي" كاملة (قيمتها ٤٩٩ ريال) مجاناً.' +
'  </p>' +
'' +
'  <p style="font-size:1.1rem;font-weight:bold;color:#222;line-height:1.5;margin:26px 0 10px;">' +
'    باقي <span style="color:#C9302C;">٥ مقاعد فقط</span> من أصل ٣٠. و<span style="color:#C9302C;">٦ ساعات</span> على السعر يرجع ٩٩٩ وتنتهي الهدية.' +
'  </p>' +
'' +
'  <p style="color:#666;font-style:italic;margin:0 0 22px;">' +
'    لو المقعد راح، راح. ولو السعر راح، راح.' +
'  </p>' +
'' +
'  <div style="background:#f9f6f0;border-right:3px solid #C9A84C;padding:20px 24px;margin:28px 0;border-radius:4px;">' +
'    <p style="margin:0 0 12px;font-weight:bold;color:#222;">تفاصيل الورشة:</p>' +
'    <p style="margin:6px 0;color:#444;">&#x1F4C5; <strong>التاريخ:</strong> ٣٠ أبريل، ١ مايو، ٢ مايو</p>' +
'    <p style="margin:6px 0;color:#444;">&#x1F556; <strong>الوقت:</strong> ٧–١٠ مساءً بتوقيت جدة</p>' +
'    <p style="margin:6px 0;color:#444;">&#x1F465; <strong>المقاعد:</strong> ٥ مقاعد باقية</p>' +
'    <p style="margin:6px 0 0;color:#8a6f1e;font-weight:bold;">&#x1F4B0; <strong>الاستثمار:</strong> <s>٩٩٩</s> <strong>٧٩٩ ريال</strong> (حصري لأهل القائمة — حتى منتصف الليل)</p>' +
'  </div>' +
'' +
'  <p style="text-align:center;margin:36px 0 28px;">' +
'    <a href="https://malearnsa.com/creative-ai-workshop/"' +
'       style="background:#C9A84C;color:#000;padding:16px 38px;text-decoration:none;font-weight:bold;font-size:1rem;display:inline-block;line-height:1.3;">' +
'      احجز مقعدك الآن' +
'    </a>' +
'  </p>' +
'' +
'  <p style="color:#666;font-size:0.9rem;text-align:center;">' +
'    لو عندك سؤال قبل ما تقرر، رد على الإيميل.' +
'  </p>' +
'' +
'  <hr style="border:none;border-top:1px solid #eee;margin:36px 0 24px;">' +
'  <p style="margin:0;">' +
'    أشوفك في الورشة،<br>' +
'    <strong>ماجد عنقاوي</strong><br>' +
'    <span style="color:#888;font-size:0.85rem;">صناعة الإلهام · MA Learn</span>' +
'  </p>' +
'</div>';
}