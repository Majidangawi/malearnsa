/**
 * MA Learn — Apps Script Endpoint
 * Handles: token validation, coupon validation,
 * purchase recording (T2 + T3), token assignment,
 * course access email, T3 confirmation email,
 * seat management, and ZATCA-compliant invoice via Daftra API.
 *
 * Google Sheet tabs required:
 *   "Tokens"    — Token | Course | Status | Customer Email
 *   "Coupons"   — Code | Type | Value | Min Amount (SAR) | Uses Left | Start Date | End Date | Active
 *   "Customers" — Date | Email | Name | Phone | Product | Amount (SAR) | Coupon | Payment ID
 *   "Config"    — KEY | VALUE
 *                 Row 2: MODE | TEST   ← change to LIVE when ready to launch
 *
 * Config tab usage:
 *   MODE = TEST  → seat limit disabled, Daftra skipped, product logged as *-test
 *   MODE = LIVE  → full enforcement (30-seat cap, Daftra invoice, real email flow)
 *
 * How to deploy / redeploy:
 * 1. Open Google Sheets "MA Learn Token Pool"
 * 2. Extensions → Apps Script → select all → paste this code
 * 3. Deploy → Manage Deployments → edit → New Version → Deploy
 * 4. Who has access: Anyone
 * 5. URL stays the same — no changes needed elsewhere
 */

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const TOKENS_SHEET          = 'Tokens';
const COUPONS_SHEET         = 'Coupons';
const CUSTOMERS_SHEET       = 'Customers';
const CONFIG_SHEET          = 'Config';
const LESSONS_SHEET         = 'Lessons';
const LESSON_CONTENT_SHEET  = 'LessonContent';

// Admin token — used by dashboard to authorize write operations.
// Change this if you suspect it's been compromised.
const ADMIN_TOKEN     = 'MAL-ADMIN-2026';

const FROM_NAME    = 'MA Learn';
const FROM_EMAIL   = 'info@malearnsa.com';
const NOTIFY_EMAIL = 'info@malearnsa.com';

// T2 product
const T2_PRODUCT          = 'intro-to-creative-ai';
const T2_DAFTRA_PRODUCT_ID = 38;
const T2_ORIGINAL_PRICE    = 499;

// T3 product
const T3_PRODUCT          = 'creative-ai-workshop-t3';
const T3_SEATS_LIMIT      = 30;
const T3_DAFTRA_PRODUCT_ID = 39;
const T3_ORIGINAL_PRICE    = 999;

// Beyond Lighting product
const BL_PRODUCT           = 'beyond-lighting';
const BL_DAFTRA_PRODUCT_ID = 40; // UPDATE: create in Daftra → use that product ID
const BL_ORIGINAL_PRICE    = 299; // UPDATE: match actual checkout price

// Prompt Pack product
const PP_PRODUCT           = 'prompt-pack';
const PP_DAFTRA_PRODUCT_ID = 41; // UPDATE: create in Daftra → use that product ID
const PP_ORIGINAL_PRICE    = 99;

// Daftra
const DAFTRA_API_KEY  = '641fb01dbafdb03000f2658ab3196d5795308ffa';
const DAFTRA_BASE_URL = 'https://malearn.daftra.com/api2';
const DAFTRA_STORE_ID = 1;

// ─────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────

/**
 * POST handler — used for save_content (large HTML payloads exceed GET URL limits).
 * Browser sends application/x-www-form-urlencoded (simple CORS request, no preflight).
 */
function doPost(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  const params = e.parameter;
  const action = params.action || '';
  try {
    let result;
    if (action === 'save_content') result = saveLessonContent(params);
    else                           result = { error: 'unknown_action' };
    output.setContent(JSON.stringify(result));
  } catch(err) {
    output.setContent(JSON.stringify({ success: false, error: err.message }));
  }
  return output;
}

function doGet(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  const action = e.parameter.action || 'validate_token';

  try {
    let result;
    if      (action === 'validate_coupon')    result = validateCoupon(e.parameter.code, parseInt(e.parameter.amount) || 0);
    else if (action === 'complete_purchase')  result = completePurchase(e.parameter);
    else if (action === 'validate_token')     result = validateToken(e.parameter.token, e.parameter.course || T2_PRODUCT);
    else if (action === 'get_seats_left')     result = getSeatsLeft();
    else if (action === 'get_course_lessons') result = getCourseLessonsSecure(e.parameter);
    else if (action === 'save_lesson_media')  result = saveLessonMedia(e.parameter);
    else if (action === 'admin_get_lessons')  result = adminGetLessons(e.parameter);
    else if (action === 'add_lesson')         result = addLesson(e.parameter);
    else if (action === 'delete_lesson')      result = deleteLesson(e.parameter);
    else if (action === 'save_content')       result = saveLessonContent(e.parameter);
    else if (action === 'get_content')        result = getLessonContent(e.parameter);
    else                                      result = { error: 'unknown_action' };

    output.setContent(JSON.stringify(result));
  } catch (err) {
    output.setContent(JSON.stringify({ valid: true, reason: 'error_fail_open', error: err.message }));
  }

  return output;
}

// ─────────────────────────────────────────────
// CONFIG HELPERS
// ─────────────────────────────────────────────

/**
 * Returns true if Config tab → MODE = TEST.
 * Defaults to false (LIVE) if tab or key is missing.
 */
function isTestMode() {
  try {
    const ss     = SpreadsheetApp.getActiveSpreadsheet();
    const config = ss.getSheetByName(CONFIG_SHEET);
    if (!config) return false;
    const data = config.getDataRange().getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim().toUpperCase() === 'MODE') {
        return String(data[i][1]).trim().toUpperCase() === 'TEST';
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

// ─────────────────────────────────────────────
// SEAT MANAGEMENT (T3)
// ─────────────────────────────────────────────

/** Counts confirmed T3 registrations (exact product match — test rows excluded). */
function getT3SeatsTaken() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CUSTOMERS_SHEET);
  if (!sheet) return 0;
  const data = sheet.getDataRange().getValues();
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][4]).trim() === T3_PRODUCT) count++;
  }
  return count;
}

/** Returns seat availability for the checkout page. */
function getSeatsLeft() {
  const taken = getT3SeatsTaken();
  const left  = Math.max(0, T3_SEATS_LIMIT - taken);
  return {
    seats_taken: taken,
    seats_left:  left,
    seats_total: T3_SEATS_LIMIT,
    sold_out:    left === 0
  };
}

// ─────────────────────────────────────────────
// COMPLETE PURCHASE — ROUTER
// Routes to T2, T3, or BL handler based on product param.
// ─────────────────────────────────────────────
function completePurchase(params) {
  const product = params.product || T2_PRODUCT;
  if (product === T3_PRODUCT) return completeT3Purchase(params);
  if (product === BL_PRODUCT)  return completeBLPurchase(params);
  if (product === PP_PRODUCT)  return completePPPurchase(params);
  return completeT2Purchase(params);
}

// ─────────────────────────────────────────────
// DEDUPLICATION — returns true if payment_id already logged
// Prevents duplicate processing on page refresh or double-submit.
// ─────────────────────────────────────────────
function paymentAlreadyProcessed(paymentId) {
  if (!paymentId) return false;
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CUSTOMERS_SHEET);
  if (!sheet) return false;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][7]).trim() === paymentId) return true;
  }
  return false;
}

// ─────────────────────────────────────────────
// T2 PURCHASE
// Unchanged from original — token assignment + course email + Daftra invoice.
// ─────────────────────────────────────────────
function completeT2Purchase(params) {
  const name      = params.name       || '';
  const email     = params.email      || '';
  const phone     = params.phone      || '';
  const product   = params.product    || T2_PRODUCT;
  const amount    = params.amount     || '';
  const coupon    = params.coupon     || '';
  const paymentId = params.payment_id || '';

  if (!email) return { success: false, reason: 'no_email' };
  if (paymentAlreadyProcessed(paymentId)) return { success: true, reason: 'already_processed' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Log to Customers sheet
  const customersSheet = ss.getSheetByName(CUSTOMERS_SHEET);
  if (customersSheet) {
    const dateStr = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm:ss');
    customersSheet.appendRow([dateStr, email, name, phone, product, amount, coupon, paymentId]);
  }

  // 2. Find and assign token
  const tokensSheet = ss.getSheetByName(TOKENS_SHEET);
  if (!tokensSheet) return { success: false, reason: 'no_tokens_sheet' };

  const data = tokensSheet.getDataRange().getValues();
  let assignedToken = null;
  let tokenRow      = -1;

  for (let i = 1; i < data.length; i++) {
    const rowCourse = String(data[i][1]).trim();
    const rowStatus = String(data[i][2]).trim();
    if (rowCourse === T2_PRODUCT && rowStatus === 'available') {
      assignedToken = String(data[i][0]).trim();
      tokenRow      = i + 1;
      break;
    }
  }

  if (!assignedToken) return { success: false, reason: 'no_tokens_available' };

  // 3. Mark token as used
  tokensSheet.getRange(tokenRow, 3).setValue('used');
  tokensSheet.getRange(tokenRow, 4).setValue(email);

  // 4. Send course access email
  const courseUrl = `https://player.malearnsa.com/watch.html?token=${assignedToken}`;
  const subject   = 'وصلك رابط الدورة — مدخل إلى الذكاء الاصطناعي الإبداعي';
  const body      = buildT2Email(name, courseUrl);

  GmailApp.sendEmail(email, subject, '', { htmlBody: body, name: FROM_NAME, from: FROM_EMAIL });

  // 5. Create ZATCA-compliant invoice via Daftra
  const amountSAR = parseFloat(amount) || 0;
  createDaftraInvoice(name, email, phone, amountSAR, coupon, paymentId, T2_PRODUCT);

  // 6. Notify Majid
  sendPurchaseNotification(name, email, phone, product, amount, coupon, paymentId);

  return { success: true, token: assignedToken };
}

// ─────────────────────────────────────────────
// T3 PURCHASE
// Seat check → log customer → assign T2 gift token → send confirmation email → Daftra invoice
// In TEST mode: seat limit skipped, Daftra skipped, product logged as *-test
// ─────────────────────────────────────────────
function completeT3Purchase(params) {
  const testMode  = isTestMode();
  const name      = params.name       || '';
  const email     = params.email      || '';
  const phone     = params.phone      || '';
  const amount    = params.amount     || '';
  const coupon    = params.coupon     || '';
  const paymentId = params.payment_id || '';

  if (!email) return { success: false, reason: 'no_email' };
  if (paymentAlreadyProcessed(paymentId)) return { success: true, reason: 'already_processed' };

  // 1. Seat check (LIVE only)
  if (!testMode) {
    const taken = getT3SeatsTaken();
    if (taken >= T3_SEATS_LIMIT) {
      return { success: false, reason: 'sold_out' };
    }
  }

  const ss          = SpreadsheetApp.getActiveSpreadsheet();
  const loggedProduct = testMode ? T3_PRODUCT + '-test' : T3_PRODUCT;

  // 2. Log to Customers sheet
  const customersSheet = ss.getSheetByName(CUSTOMERS_SHEET);
  if (customersSheet) {
    const dateStr = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm:ss');
    customersSheet.appendRow([dateStr, email, name, phone, loggedProduct, amount, coupon, paymentId]);
  }

  // 3. Find and assign T2 gift token
  const tokensSheet = ss.getSheetByName(TOKENS_SHEET);
  let t2Token = null;

  if (tokensSheet) {
    const data = tokensSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const rowCourse = String(data[i][1]).trim();
      const rowStatus = String(data[i][2]).trim();
      if (rowCourse === T2_PRODUCT && rowStatus === 'available') {
        t2Token = String(data[i][0]).trim();
        tokensSheet.getRange(i + 1, 3).setValue('used');
        tokensSheet.getRange(i + 1, 4).setValue(email);
        break;
      }
    }
  }

  // 4. Send T3 confirmation email (includes T2 gift link if token assigned)
  const t2CourseUrl = t2Token ? `https://player.malearnsa.com/watch.html?token=${t2Token}&course=intro-to-creative-ai` : null;
  const subject     = 'تم تسجيلك — ورشة الذكاء الاصطناعي الإبداعي';
  const body        = buildT3Email(name, t2CourseUrl);

  GmailApp.sendEmail(email, subject, '', { htmlBody: body, name: FROM_NAME, from: FROM_EMAIL });

  // 5. Daftra invoice (LIVE only)
  if (!testMode) {
    const amountSAR = parseFloat(amount) || 0;
    createDaftraInvoice(name, email, phone, amountSAR, coupon, paymentId, T3_PRODUCT);
  }

  // 6. Notify Majid
  sendPurchaseNotification(name, email, phone, T3_PRODUCT, amount, coupon, paymentId);

  return { success: true };
}

// ─────────────────────────────────────────────
// BEYOND LIGHTING PURCHASE
// Token assignment + access email + Daftra invoice
// ─────────────────────────────────────────────
function completeBLPurchase(params) {
  const name      = params.name       || '';
  const email     = params.email      || '';
  const phone     = params.phone      || '';
  const amount    = params.amount     || '';
  const coupon    = params.coupon     || '';
  const paymentId = params.payment_id || '';

  if (!email) return { success: false, reason: 'no_email' };
  if (paymentAlreadyProcessed(paymentId)) return { success: true, reason: 'already_processed' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Log to Customers sheet
  const customersSheet = ss.getSheetByName(CUSTOMERS_SHEET);
  if (customersSheet) {
    const dateStr = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm:ss');
    customersSheet.appendRow([dateStr, email, name, phone, BL_PRODUCT, amount, coupon, paymentId]);
  }

  // 2. Find and assign a beyond-lighting token
  const tokensSheet = ss.getSheetByName(TOKENS_SHEET);
  if (!tokensSheet) return { success: false, reason: 'no_tokens_sheet' };

  const data = tokensSheet.getDataRange().getValues();
  let assignedToken = null;
  let tokenRow      = -1;

  for (let i = 1; i < data.length; i++) {
    const rowCourse = String(data[i][1]).trim();
    const rowStatus = String(data[i][2]).trim();
    if (rowCourse === BL_PRODUCT && rowStatus === 'available') {
      assignedToken = String(data[i][0]).trim();
      tokenRow      = i + 1;
      break;
    }
  }

  if (!assignedToken) return { success: false, reason: 'no_tokens_available' };

  // 3. Mark token as used
  tokensSheet.getRange(tokenRow, 3).setValue('used');
  tokensSheet.getRange(tokenRow, 4).setValue(email);

  // 4. Send access email
  const courseUrl = `https://player.malearnsa.com/watch.html?token=${assignedToken}&course=beyond-lighting`;
  const subject   = 'وصلك رابط الدورة — أبعد من إمكانيات الإضاءة';
  const body      = buildBLEmail(name, courseUrl);

  GmailApp.sendEmail(email, subject, '', { htmlBody: body, name: FROM_NAME, from: FROM_EMAIL });

  // 5. ZATCA invoice via Daftra
  const amountSAR = parseFloat(amount) || 0;
  createDaftraInvoice(name, email, phone, amountSAR, coupon, paymentId, BL_PRODUCT);

  // 6. Notify Majid
  sendPurchaseNotification(name, email, phone, BL_PRODUCT, amount, coupon, paymentId);

  return { success: true, token: assignedToken };
}

// ─────────────────────────────────────────────
// PROMPT PACK PURCHASE
// Token assignment + access email + Daftra invoice + notification
// ─────────────────────────────────────────────
function completePPPurchase(params) {
  const name      = params.name       || '';
  const email     = params.email      || '';
  const phone     = params.phone      || '';
  const amount    = params.amount     || '';
  const coupon    = params.coupon     || '';
  const paymentId = params.payment_id || '';

  if (!email) return { success: false, reason: 'no_email' };
  if (paymentAlreadyProcessed(paymentId)) return { success: true, reason: 'already_processed' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Log to Customers sheet
  const customersSheet = ss.getSheetByName(CUSTOMERS_SHEET);
  if (customersSheet) {
    const dateStr = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm:ss');
    customersSheet.appendRow([dateStr, email, name, phone, PP_PRODUCT, amount, coupon, paymentId]);
  }

  // 2. Find and assign a prompt-pack token
  const tokensSheet = ss.getSheetByName(TOKENS_SHEET);
  if (!tokensSheet) return { success: false, reason: 'no_tokens_sheet' };

  const data = tokensSheet.getDataRange().getValues();
  let assignedToken = null;
  let tokenRow      = -1;

  for (let i = 1; i < data.length; i++) {
    const rowCourse = String(data[i][1]).trim();
    const rowStatus = String(data[i][2]).trim();
    if (rowCourse === PP_PRODUCT && rowStatus === 'available') {
      assignedToken = String(data[i][0]).trim();
      tokenRow      = i + 1;
      break;
    }
  }

  if (!assignedToken) return { success: false, reason: 'no_tokens_available' };

  // 3. Mark token as used
  tokensSheet.getRange(tokenRow, 3).setValue('used');
  tokensSheet.getRange(tokenRow, 4).setValue(email);

  // 4. Send access email
  const libraryUrl = `https://malearnsa.com/prompt-pack/library/?token=${assignedToken}`;
  const subject    = 'وصلك كود الوصول — حزمة البرومبتات الإبداعية';
  const body       = buildPPEmail(name, libraryUrl, assignedToken);

  GmailApp.sendEmail(email, subject, '', { htmlBody: body, name: FROM_NAME, from: FROM_EMAIL });

  // 5. ZATCA invoice via Daftra
  const amountSAR = parseFloat(amount) || 0;
  createDaftraInvoice(name, email, phone, amountSAR, coupon, paymentId, PP_PRODUCT);

  // 6. Notify Majid
  sendPurchaseNotification(name, email, phone, PP_PRODUCT, amount, coupon, paymentId);

  return { success: true, token: assignedToken };
}

// ─────────────────────────────────────────────
// PURCHASE NOTIFICATION (to Majid)
// ─────────────────────────────────────────────
function sendPurchaseNotification(name, email, phone, product, amount, coupon, paymentId) {
  const timestamp = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'dd/MM/yyyy — hh:mm a');

  const productNames = {
    'intro-to-creative-ai':      'مدخل إلى الذكاء الاصطناعي الإبداعي',
    'creative-ai-workshop-t3':   'ورشة الذكاء الاصطناعي الإبداعي',
    'beyond-lighting':           'أبعد من إمكانيات الإضاءة',
    'prompt-pack':               'حزمة البرومبتات الإبداعية',
  };
  const productName = productNames[product] || product;

  MailApp.sendEmail({
    to:      NOTIFY_EMAIL,
    subject: '🟢 عملية شراء جديدة — ' + productName,
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
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px 0;color:#888;">المنتج</td>
            <td style="padding:10px 0;color:#111;">${productName}</td>
          </tr>
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px 0;color:#888;">المبلغ</td>
            <td style="padding:10px 0;font-weight:bold;color:#111;">${amount} ر.س</td>
          </tr>
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px 0;color:#888;">الكوبون</td>
            <td style="padding:10px 0;color:#111;">${coupon || '—'}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#888;">طريقة الدفع</td>
            <td style="padding:10px 0;color:#2e7d32;font-weight:bold;">Moyasar (بطاقة)</td>
          </tr>
        </table>
        <div style="margin-top:20px;padding:12px 16px;background:#f0faf0;border-right:3px solid #2e7d32;">
          <p style="margin:0;font-size:13px;color:#555;">Payment ID: <span style="direction:ltr;unicode-bidi:embed;">${paymentId || '—'}</span></p>
        </div>
      </div>
    `,
  });
}

// ─────────────────────────────────────────────
// EMAIL TEMPLATES
// ─────────────────────────────────────────────

function buildT2Email(name, courseUrl) {
  const firstName = name ? name.split(' ')[0] : '';
  return `
<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;color:#222;line-height:1.7;">
  <p>السلام عليكم${firstName ? ' ' + firstName : ''}،</p>
  <p>شكراً لك على تسجيلك في دورة <strong>مدخل إلى الذكاء الاصطناعي الإبداعي</strong>.</p>
  <p>هذا رابط وصولك الخاص للدورة:</p>
  <p style="text-align:center;margin:32px 0;">
    <a href="${courseUrl}"
       style="background:#C9A84C;color:#000;padding:14px 32px;text-decoration:none;font-weight:bold;font-size:1rem;">
      ابدأ الدورة الآن
    </a>
  </p>
  <p style="color:#888;font-size:0.85rem;">
    هذا الرابط خاص بك — لا تشاركه مع أحد.<br>
    يشتغل من أي جهاز في أي وقت.
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">
  <p style="font-size:0.85rem;color:#888;">
    أي استفسار؟ راسلنا على:
    <a href="mailto:support@malearnsa.com">support@malearnsa.com</a>
  </p>
  <p>— Majid Angawi | MA Learn</p>
</div>`;
}

function buildT3Email(name, t2CourseUrl) {
  const firstName = name ? name.split(' ')[0] : '';
  const giftSection = t2CourseUrl ? `
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">
  <p style="font-size:1rem;font-weight:bold;">هديتك الخاصة &mdash; دورة مدخل إلى الذكاء الاصطناعي الإبداعي</p>
  <p style="color:#555;font-size:0.9rem;margin:8px 0 20px;">
    كجزء من المجموعة الأولى، حصلت على هذه الدورة المسجلة مجاناً — وصول فوري الآن.
  </p>
  <p style="text-align:center;margin:24px 0;">
    <a href="${t2CourseUrl}"
       style="background:#C9A84C;color:#000;padding:14px 32px;text-decoration:none;font-weight:bold;font-size:1rem;">
      ابدأ الدورة المسجلة الآن
    </a>
  </p>
  <p style="color:#888;font-size:0.8rem;">الرابط خاص بك — لا تشاركه مع أحد.</p>` : '';

  return `
<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;color:#222;line-height:1.7;">
  <p>السلام عليكم${firstName ? ' ' + firstName : ''}،</p>
  <p>تم تسجيلك بنجاح في <strong>ورشة الذكاء الاصطناعي الإبداعي</strong></p>

  <div style="background:#f9f6f0;border-right:3px solid #C9A84C;padding:16px 20px;margin:24px 0;border-radius:4px;">
    <p style="font-weight:bold;margin-bottom:8px;">تفاصيل الورشة:</p>
    <p style="margin:4px 0;">الجلسة الأولى &mdash; ٣٠ أبريل، ٧&ndash;١٠ مساءً (توقيت جدة)</p>
    <p style="margin:4px 0;">الجلسة الثانية &mdash; ١ مايو، ٧&ndash;١٠ مساءً</p>
    <p style="margin:4px 0;">الجلسة الثالثة &mdash; ٢ مايو، ٧&ndash;١٠ مساءً</p>
  </div>

  <p>
    رابط الانضمام للجلسات سيصلك على هذا الإيميل قبل أسبوع من بدء الورشة.<br>
    <span style="color:#888;font-size:0.85rem;">احتفظ بهذا الإيميل كمرجع لتفاصيل الجلسات.</span>
  </p>

  ${giftSection}

  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">
  <p style="font-size:0.85rem;color:#888;">
    أي استفسار؟ راسلنا على:
    <a href="mailto:support@malearnsa.com">support@malearnsa.com</a>
  </p>
  <p>— Majid Angawi | MA Learn</p>
</div>`;
}

function buildBLEmail(name, courseUrl) {
  const firstName = name ? name.split(' ')[0] : '';
  return `
<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;color:#222;line-height:1.7;">
  <p>السلام عليكم${firstName ? ' ' + firstName : ''}،</p>
  <p>شكراً لك على تسجيلك في دورة <strong>أبعد من إمكانيات الإضاءة</strong>.</p>
  <p>هذا رابط وصولك الخاص للدورة:</p>
  <p style="text-align:center;margin:32px 0;">
    <a href="${courseUrl}"
       style="background:#C9A84C;color:#000;padding:14px 32px;text-decoration:none;font-weight:bold;font-size:1rem;">
      ابدأ الدورة الآن
    </a>
  </p>
  <p style="color:#888;font-size:0.85rem;">
    هذا الرابط خاص بك — لا تشاركه مع أحد.<br>
    يشتغل من أي جهاز في أي وقت.
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">
  <p style="font-size:0.85rem;color:#888;">
    أي استفسار؟ راسلنا على:
    <a href="mailto:support@malearnsa.com">support@malearnsa.com</a>
  </p>
  <p>— Majid Angawi | MA Learn</p>
</div>`;
}

function buildPPEmail(name, libraryUrl, token) {
  const firstName = name ? name.split(' ')[0] : '';
  return `
<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;color:#222;line-height:1.7;">
  <p>السلام عليكم${firstName ? ' ' + firstName : ''}،</p>
  <p>شكراً لك على شرائك <strong>حزمة البرومبتات الإبداعية</strong>.</p>
  <p>هذا كود الوصول الخاص بك:</p>
  <div style="text-align:center;margin:24px 0;padding:16px;background:#f9f6ef;border:2px dashed #C9A84C;font-size:1.3rem;font-weight:bold;letter-spacing:2px;direction:ltr;">
    ${token}
  </div>
  <p>ادخل الكود في الرابط التالي للوصول لمكتبة البرومبتات:</p>
  <p style="text-align:center;margin:32px 0;">
    <a href="${libraryUrl}"
       style="background:#C9A84C;color:#000;padding:14px 32px;text-decoration:none;font-weight:bold;font-size:1rem;">
      افتح مكتبة البرومبتات
    </a>
  </p>
  <p style="color:#888;font-size:0.85rem;">
    هذا الكود خاص بك — لا تشاركه مع أحد.
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">
  <p style="font-size:0.85rem;color:#888;">
    أي استفسار؟ راسلنا على:
    <a href="mailto:support@malearnsa.com">support@malearnsa.com</a>
  </p>
  <p>— Majid Angawi | MA Learn</p>
</div>`;
}

// ─────────────────────────────────────────────
// DAFTRA — Create ZATCA-compliant invoice
// product param determines Daftra product ID and base price.
// ─────────────────────────────────────────────
function createDaftraInvoice(name, email, phone, amountSAR, coupon, paymentId, product) {
  try {
    const isBL          = (product === BL_PRODUCT);
    const isT3          = (product === T3_PRODUCT);
    const isPP          = (product === PP_PRODUCT);
    const daftraId      = isPP ? PP_DAFTRA_PRODUCT_ID : (isBL ? BL_DAFTRA_PRODUCT_ID : (isT3 ? T3_DAFTRA_PRODUCT_ID : T2_DAFTRA_PRODUCT_ID));
    const originalPrice = isPP ? PP_ORIGINAL_PRICE     : (isBL ? BL_ORIGINAL_PRICE     : (isT3 ? T3_ORIGINAL_PRICE    : T2_ORIGINAL_PRICE));
    const discountSAR   = coupon ? Math.max(0, originalPrice - amountSAR) : 0;

    const clientId = daftraCreateClient(name, email, phone);
    if (!clientId) {
      Logger.log('Daftra: could not create client for ' + email);
      return false;
    }

    const invoiceItems = [
      {
        product_id:    daftraId,
        quantity:      1,
        unit_price:    originalPrice,
        discount_type: discountSAR > 0 ? 'value' : 'none',
        discount:      discountSAR > 0 ? discountSAR : 0
      }
    ];

    const finalAmountSAR = amountSAR > 0 ? amountSAR : originalPrice - discountSAR;

    const invoicePayload = {
      Invoice: {
        store_id:     DAFTRA_STORE_ID,
        client_id:    clientId,
        client_email: email,
        notes:        'Moyasar Payment ID: ' + paymentId + (coupon ? ' | Coupon: ' + coupon : '')
      },
      InvoiceItem: invoiceItems,
      Payment: [
        {
          amount:         finalAmountSAR,
          payment_method: 'online',
          date:           Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd'),
          notes:          'Moyasar: ' + paymentId
        }
      ]
    };

    const response = UrlFetchApp.fetch(DAFTRA_BASE_URL + '/invoices.json', {
      method:             'post',
      headers: {
        'apikey':         DAFTRA_API_KEY,
        'Content-Type':   'application/json',
        'Accept':         'application/json'
      },
      payload:            JSON.stringify(invoicePayload),
      muteHttpExceptions: true
    });

    const result = JSON.parse(response.getContentText());
    Logger.log('Daftra invoice result: ' + JSON.stringify(result));
    return result;

  } catch (err) {
    Logger.log('Daftra invoice error: ' + err.message);
    return false;
  }
}

// ─────────────────────────────────────────────
// DAFTRA — Create client, return client ID
// Uses PropertiesService as a local cache (email → client ID)
// ─────────────────────────────────────────────
function daftraCreateClient(name, email, phone) {
  try {
    const cacheKey = 'daftra_' + email.toLowerCase();
    const props    = PropertiesService.getScriptProperties();

    const cached = props.getProperty(cacheKey);
    if (cached) {
      Logger.log('Daftra: client from cache id=' + cached + ' for ' + email);
      return cached;
    }

    const nameParts = (name || email.split('@')[0]).trim().split(/\s+/);
    const firstName = nameParts.slice(0, -1).join(' ') || nameParts[0];
    const lastName  = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

    const payload = {
      Client: {
        type:          2,
        first_name:    firstName,
        last_name:     lastName,
        business_name: name || email.split('@')[0],
        email:         email,
        mobile:        phone || ''
      }
    };

    const response = UrlFetchApp.fetch(DAFTRA_BASE_URL + '/clients.json', {
      method:             'post',
      headers: {
        'apikey':         DAFTRA_API_KEY,
        'Content-Type':   'application/json',
        'Accept':         'application/json'
      },
      payload:            JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const result = JSON.parse(response.getContentText());
    Logger.log('Daftra client result: ' + JSON.stringify(result));

    if (result.id) {
      props.setProperty(cacheKey, String(result.id));
      return result.id;
    }

    if (result.result === 'failed') {
      // Client already exists in Daftra — search by email to get their ID
      const searchRes = UrlFetchApp.fetch(
        DAFTRA_BASE_URL + '/clients.json?search[email]=' + encodeURIComponent(email),
        {
          method:             'get',
          headers: { 'apikey': DAFTRA_API_KEY, 'Accept': 'application/json' },
          muteHttpExceptions: true
        }
      );
      const searchData = JSON.parse(searchRes.getContentText());
      const clients    = searchData.Client || searchData.clients || searchData.data || [];
      const match      = Array.isArray(clients) ? clients[0] : null;
      if (match && match.id) {
        props.setProperty(cacheKey, String(match.id));
        Logger.log('Daftra: found existing client id=' + match.id + ' for ' + email);
        return match.id;
      }
      Logger.log('Daftra: duplicate email, search found no match for ' + email);
      return null;
    }

    return null;
  } catch (err) {
    Logger.log('Daftra client error: ' + err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// DAFTRA — Manually cache a client ID
// Run once from the Apps Script editor to fix a client
// that was created outside this script:
//   daftraCacheClientId('email@example.com', '123')
// ─────────────────────────────────────────────
function daftraCacheClientId(email, clientId) {
  const cacheKey = 'daftra_' + email.toLowerCase();
  PropertiesService.getScriptProperties().setProperty(cacheKey, String(clientId));
  Logger.log('Cached: ' + email + ' → ' + clientId);
}

// ─────────────────────────────────────────────
// COURSE LESSON MANAGEMENT
// ─────────────────────────────────────────────

/**
 * Returns all active lessons for a course, sorted by module → lesson order.
 * Used by both the watch player and the admin dashboard.
 * Lessons tab columns:
 *   A: ID | B: Course | C: Module | D: Module Order | E: Lesson Order
 *   F: Title | G: Description | H: Video ID | I: PDF URL | J: Active
 */
function getCourseLessons(courseId) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(LESSONS_SHEET);
  if (!sheet) return { error: 'no_lessons_sheet', lessons: [] };

  const data    = sheet.getDataRange().getValues();
  const lessons = [];

  for (let i = 1; i < data.length; i++) {
    const row      = data[i];
    const rowCourse = String(row[1]).trim();
    if (rowCourse !== courseId) continue;

    lessons.push({
      id:           String(row[0]).trim(),
      course:       rowCourse,
      module:       String(row[2]).trim(),
      module_order: parseInt(row[3]) || 0,
      lesson_order: parseInt(row[4]) || 0,
      title:        String(row[5]).trim(),
      desc:         String(row[6]).trim(),
      video_id:     String(row[7]).trim(),
      pdf_url:      String(row[8]).trim(),
      active:       String(row[9]).trim().toUpperCase() !== 'FALSE'
    });
  }

  lessons.sort((a, b) => a.module_order - b.module_order || a.lesson_order - b.lesson_order);
  return { lessons };
}

/**
 * Updates video_id, pdf_url, and/or active status for a lesson.
 * Requires admin_token to match ADMIN_TOKEN constant.
 * Called from the admin dashboard.
 */
function saveLessonMedia(params) {
  if ((params.admin_token || '') !== ADMIN_TOKEN) {
    return { success: false, reason: 'unauthorized' };
  }

  const lessonId = String(params.lesson_id || '').trim();
  if (!lessonId) return { success: false, reason: 'no_lesson_id' };

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(LESSONS_SHEET);
  if (!sheet) return { success: false, reason: 'no_lessons_sheet' };

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() !== lessonId) continue;

    // Only update fields that were passed
    if (params.video_id !== undefined) sheet.getRange(i + 1, 8).setValue(params.video_id.trim());
    if (params.pdf_url  !== undefined) sheet.getRange(i + 1, 9).setValue(params.pdf_url.trim());
    if (params.active   !== undefined) {
      sheet.getRange(i + 1, 10).setValue(params.active === 'true' ? 'TRUE' : 'FALSE');
    }

    return { success: true };
  }

  return { success: false, reason: 'lesson_not_found' };
}

// ─────────────────────────────────────────────
// SECURE LESSON FETCH — requires valid student token
// Prevents unauthenticated API calls from reading lesson data
// ─────────────────────────────────────────────
function getCourseLessonsSecure(params) {
  const course = params.course || T2_PRODUCT;
  const token  = params.token  || '';
  const check  = validateToken(token, course);
  if (!check.valid) return { error: 'unauthorized', lessons: [] };
  return getCourseLessons(course);
}

// ─────────────────────────────────────────────
// ADMIN — Get all lessons (including inactive)
// Requires admin_token, not a student token
// ─────────────────────────────────────────────
function adminGetLessons(params) {
  if ((params.admin_token || '') !== ADMIN_TOKEN) return { error: 'unauthorized', lessons: [] };

  const courseId = params.course || T2_PRODUCT;
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const sheet    = ss.getSheetByName(LESSONS_SHEET);
  if (!sheet) return { error: 'no_lessons_sheet', lessons: [] };

  const data    = sheet.getDataRange().getValues();
  const lessons = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[1]).trim() !== courseId) continue;
    lessons.push({
      id:           String(row[0]).trim(),
      course:       String(row[1]).trim(),
      module:       String(row[2]).trim(),
      module_order: parseInt(row[3]) || 0,
      lesson_order: parseInt(row[4]) || 0,
      title:        String(row[5]).trim(),
      desc:         String(row[6]).trim(),
      video_id:     String(row[7]).trim(),
      pdf_url:      String(row[8]).trim(),
      active:       String(row[9]).trim().toUpperCase() !== 'FALSE'
    });
  }

  lessons.sort((a, b) => a.module_order - b.module_order || a.lesson_order - b.lesson_order);
  return { lessons };
}

// ─────────────────────────────────────────────
// ADMIN — Add new lesson row
// ─────────────────────────────────────────────
function addLesson(params) {
  if ((params.admin_token || '') !== ADMIN_TOKEN) return { success: false, reason: 'unauthorized' };

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(LESSONS_SHEET);
  if (!sheet) return { success: false, reason: 'no_lessons_sheet' };

  const id  = 'lesson-' + Utilities.getUuid().substring(0, 8);
  const row = [
    id,
    params.course        || '',
    params.module        || '',
    parseInt(params.module_order)  || 1,
    parseInt(params.lesson_order)  || 1,
    params.title         || '',
    params.desc          || '',
    params.video_id      || '',
    params.pdf_url       || '',
    'TRUE'
  ];

  sheet.appendRow(row);
  return { success: true, id };
}

// ─────────────────────────────────────────────
// ADMIN — Delete lesson row by ID
// ─────────────────────────────────────────────
function deleteLesson(params) {
  if ((params.admin_token || '') !== ADMIN_TOKEN) return { success: false, reason: 'unauthorized' };

  const lessonId = String(params.lesson_id || '').trim();
  if (!lessonId) return { success: false, reason: 'no_lesson_id' };

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(LESSONS_SHEET);
  if (!sheet) return { success: false, reason: 'no_lessons_sheet' };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() !== lessonId) continue;
    sheet.deleteRow(i + 1);
    return { success: true };
  }

  return { success: false, reason: 'lesson_not_found' };
}

// ─────────────────────────────────────────────
// LESSON CONTENT — Read/Write HTML content per lesson
// Stored in LessonContent sheet: Lesson ID | Content
// ─────────────────────────────────────────────

/**
 * Returns the HTML content for a single lesson.
 * Requires a valid student token (same course).
 */
function getLessonContent(params) {
  const lessonId   = String(params.lesson_id || '').trim();
  const adminTok   = params.admin_token || '';
  const studentTok = params.token || '';
  const course     = params.course || T2_PRODUCT;

  // Accept either a valid admin token or a valid student token
  const isAdmin   = adminTok === ADMIN_TOKEN;
  const isStudent = !isAdmin && validateToken(studentTok, course).valid;
  if (!isAdmin && !isStudent) return { error: 'unauthorized', content: '' };

  return { content: readLessonContent(lessonId) };
}

/**
 * Saves HTML content for a lesson.
 * Requires admin_token.
 */
function saveLessonContent(params) {
  if ((params.admin_token || '') !== ADMIN_TOKEN) return { success: false, reason: 'unauthorized' };

  const lessonId = String(params.lesson_id || '').trim();
  const content  = String(params.content  || '').trim();
  if (!lessonId) return { success: false, reason: 'no_lesson_id' };

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(LESSON_CONTENT_SHEET);
  if (!sheet) return { success: false, reason: 'no_content_sheet' };

  const data = sheet.getDataRange().getValues();

  // Update existing row
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === lessonId) {
      sheet.getRange(i + 1, 2).setValue(content);
      return { success: true };
    }
  }

  // New row
  sheet.appendRow([lessonId, content]);
  return { success: true };
}

/**
 * Internal helper — reads content string for a lesson ID.
 */
function readLessonContent(lessonId) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(LESSON_CONTENT_SHEET);
    if (!sheet) return '';
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === lessonId) return String(data[i][1]);
    }
    return '';
  } catch(e) { return ''; }
}

// ─────────────────────────────────────────────
// TOKEN VALIDATION
// ─────────────────────────────────────────────
function validateToken(token, course) {
  if (!token) return { valid: false, reason: 'no_token' };

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(TOKENS_SHEET);
  if (!sheet) return { valid: true, reason: 'sheet_not_found_fail_open' };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const rowToken  = String(data[i][0]).trim();
    const rowCourse = String(data[i][1]).trim();
    const rowStatus = String(data[i][2]).trim();

    if (rowToken === token) {
      if (rowCourse !== course)                               return { valid: false, reason: 'wrong_course' };
      if (rowStatus === 'available' || rowStatus === 'used')  return { valid: true,  reason: 'ok' };
      return { valid: false, reason: 'token_revoked' };
    }
  }
  return { valid: false, reason: 'token_not_found' };
}

// ─────────────────────────────────────────────
// COUPON VALIDATION
// ─────────────────────────────────────────────
function validateCoupon(code, amountHalalas) {
  if (!code) return { valid: false, reason: 'no_code', message: 'أدخل كود الخصم' };

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(COUPONS_SHEET);
  if (!sheet) return { valid: false, reason: 'no_coupons_sheet', message: 'كود غير صحيح' };

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const rowCode     = String(data[i][0]).trim().toUpperCase();
    const rowType     = String(data[i][1]).trim().toLowerCase();
    const rowValue    = parseFloat(data[i][2]) || 0;
    const rowMinSAR   = parseFloat(data[i][3]) || 0;
    const rowUsesLeft = data[i][4];
    const rowStart    = data[i][5] ? new Date(data[i][5]) : null;
    const rowEnd      = data[i][6] ? new Date(data[i][6]) : null;
    const rowActive   = String(data[i][7]).trim().toUpperCase();

    if (rowCode !== code.toUpperCase()) continue;

    if (rowActive !== 'TRUE')
      return { valid: false, reason: 'inactive', message: 'هذا الكود غير متاح حالياً' };

    const now = new Date();
    if (rowStart && now < rowStart)
      return { valid: false, reason: 'not_started', message: 'هذا الكود لم يبدأ بعد' };
    if (rowEnd && now > rowEnd)
      return { valid: false, reason: 'expired', message: 'انتهت صلاحية هذا الكود' };

    if (amountHalalas / 100 < rowMinSAR)
      return { valid: false, reason: 'below_minimum', message: `الحد الأدنى للطلب ${rowMinSAR} ر.س` };

    if (rowUsesLeft !== '' && rowUsesLeft !== null && parseInt(rowUsesLeft) <= 0)
      return { valid: false, reason: 'no_uses_left', message: 'هذا الكود وصل لحد الاستخدام' };

    let discountHalalas = rowType === 'percentage'
      ? Math.round(amountHalalas * (rowValue / 100))
      : Math.round(rowValue * 100);

    discountHalalas = Math.min(discountHalalas, amountHalalas); // allow 0 SAR (free access)
    const finalAmount = amountHalalas - discountHalalas;

    if (rowUsesLeft !== '' && rowUsesLeft !== null)
      sheet.getRange(i + 1, 5).setValue(parseInt(rowUsesLeft) - 1);

    return {
      valid: true,
      type: rowType,
      value: rowValue,
      discountHalalas,
      discountSAR: discountHalalas / 100,
      finalAmount,
      finalSAR: finalAmount / 100,
      isFree: finalAmount === 0,
      message: rowType === 'percentage' ? `خصم ${rowValue}%` : `خصم ${rowValue} ر.س`
    };
  }

  return { valid: false, reason: 'not_found', message: 'كود الخصم غير صحيح' };
}

// ─────────────────────────────────────────────
// AUTHORIZE GMAIL — run once to grant access
// Extensions → Apps Script → select authorizeGmail → Run
// ─────────────────────────────────────────────
function authorizeGmail() {
  GmailApp.sendEmail(
    'majed.engawi@gmail.com',
    'MA Learn — Gmail Authorization Test',
    'Gmail is authorized and working correctly.'
  );
  Logger.log('Gmail authorized.');
}

// ─────────────────────────────────────────────
// TEST DAFTRA T2 — run once from editor
// ─────────────────────────────────────────────
function testDaftraT2() {
  const result = createDaftraInvoice(
    'ماجد عنقاوي', 'majed.engawi@gmail.com', '0501234567',
    499, '', 'pay_test_t2_abc123', T2_PRODUCT
  );
  Logger.log('T2 Daftra result: ' + JSON.stringify(result));
}

// ─────────────────────────────────────────────
// TEST DAFTRA T3 — run once from editor
// ─────────────────────────────────────────────
function testDaftraT3() {
  const result = createDaftraInvoice(
    'ماجد عنقاوي', 'majed.engawi@gmail.com', '0501234567',
    799, '', 'pay_test_t3_abc123', T3_PRODUCT
  );
  Logger.log('T3 Daftra result: ' + JSON.stringify(result));
}
