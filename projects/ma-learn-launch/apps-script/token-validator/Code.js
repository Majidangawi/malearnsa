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
// MA Learn Token Pool spreadsheet — read by ID so this script can run as a
// standalone project (not sheet-bound). Required for the Workspace migration
// so we inherit the 1500/day Gmail quota instead of consumer 100/day.
const MAIN_SHEET_ID = '1nkrwK-KJ7nD2kv_8zdYiLqot6RFoH-v67VpmjCzvYi0';

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
const NOTIFY_EMAIL = 'angawi.majid@gmail.com'; // Majid's separate Google account for sale notifications — fully decoupled from the malearnsa.com domain

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
    else if (action === 'admin_toggle_lesson')         result = adminToggleLesson(e.parameter);
    else if (action === 'admin_create_coupon')         result = adminCreateCoupon(e.parameter);
    else if (action === 'admin_update_coupon')         result = adminUpdateCoupon(e.parameter);
    else if (action === 'admin_delete_coupon')         result = adminDeleteCoupon(e.parameter);
    else if (action === 'admin_add_linkbio')           result = adminAddLinkbio(e.parameter);
    else if (action === 'admin_update_linkbio')        result = adminUpdateLinkbio(e.parameter);
    else if (action === 'admin_delete_linkbio')        result = adminDeleteLinkbio(e.parameter);
    else if (action === 'admin_update_linkbio_header') result = adminUpdateLinkbioHeader(e.parameter);
    else if (action === 'admin_increment_linkbio_click') result = adminIncrementLinkbioClick(e.parameter);
    else if (action === 'admin_send_email')            result = adminSendEmail(e.parameter);
    else if (action === 'admin_add_email_template')    result = adminAddEmailTemplate(e.parameter);
    else if (action === 'admin_upsert_subscriber')       result = _admin_upsert_subscriber(e.parameter);
    else if (action === 'admin_mark_unsubscribed')       result = _admin_mark_unsubscribed(e.parameter);
    else if (action === 'admin_create_newsletter')       result = _admin_create_newsletter(e.parameter);
    else if (action === 'admin_update_newsletter')       result = _admin_update_newsletter(e.parameter);
    else if (action === 'admin_mark_newsletter_status')  result = _admin_mark_newsletter_status(e.parameter);
    else if (action === 'admin_append_newsletter_event') result = _admin_append_newsletter_event(e.parameter);
    else if (action === 'admin_upload_email_image')      result = _admin_upload_email_image(e.parameter);
    else if (action === 'admin_resend_access_link')     result = _admin_resend_access_link(e.parameter);
    else if (action === 'admin_gift_token')              result = _admin_gift_token(e.parameter);
    else if (action === 'admin_remove_subscriber')       result = _admin_remove_subscriber(e.parameter);
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
    const ss     = SpreadsheetApp.openById(MAIN_SHEET_ID);
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
  const ss    = SpreadsheetApp.openById(MAIN_SHEET_ID);
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
  const ss    = SpreadsheetApp.openById(MAIN_SHEET_ID);
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

  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);

  // 1. Log to Customers sheet
  const customersSheet = ss.getSheetByName(CUSTOMERS_SHEET);
  if (customersSheet) {
    const dateStr = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm:ss');
    customersSheet.appendRow([dateStr, email, name, phone, product, amount, coupon, paymentId]);
  }

  // 1b. Auto-add to Subscribers list (fire-and-forget — never blocks purchase).
  try { _admin_upsert_subscriber({ admin_token: ADMIN_TOKEN, email: email, name: name, source: 'buyer', language: 'AR' }); } catch (e) {}

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

  // 5. Create ZATCA-compliant invoice via Daftra (skip for free purchases — 0 SAR)
  const amountSAR = parseFloat(amount) || 0;
  if (amountSAR > 0) {
    createDaftraInvoice(name, email, phone, amountSAR, coupon, paymentId, T2_PRODUCT);
  }

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

  const ss          = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const loggedProduct = testMode ? T3_PRODUCT + '-test' : T3_PRODUCT;

  // 2. Log to Customers sheet
  const customersSheet = ss.getSheetByName(CUSTOMERS_SHEET);
  if (customersSheet) {
    const dateStr = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm:ss');
    customersSheet.appendRow([dateStr, email, name, phone, loggedProduct, amount, coupon, paymentId]);
  }

  // 2b. Auto-add to Subscribers list.
  try { _admin_upsert_subscriber({ admin_token: ADMIN_TOKEN, email: email, name: name, source: 'buyer', language: 'AR' }); } catch (e) {}

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
  const subject     = 'تم تسجيلك — ورشة صناعة الإلهام';
  const body        = buildT3Email(name, t2CourseUrl);

  GmailApp.sendEmail(email, subject, '', { htmlBody: body, name: FROM_NAME, from: FROM_EMAIL });

  // 5. Daftra invoice (LIVE only, skip for free purchases — 0 SAR)
  const amountSAR = parseFloat(amount) || 0;
  if (!testMode && amountSAR > 0) {
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

  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);

  // 1. Log to Customers sheet
  const customersSheet = ss.getSheetByName(CUSTOMERS_SHEET);
  if (customersSheet) {
    const dateStr = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm:ss');
    customersSheet.appendRow([dateStr, email, name, phone, BL_PRODUCT, amount, coupon, paymentId]);
  }

  // 1b. Auto-add to Subscribers list.
  try { _admin_upsert_subscriber({ admin_token: ADMIN_TOKEN, email: email, name: name, source: 'buyer', language: 'AR' }); } catch (e) {}

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

  // 5. ZATCA invoice via Daftra (skip for free purchases — 0 SAR)
  const amountSAR = parseFloat(amount) || 0;
  if (amountSAR > 0) {
    createDaftraInvoice(name, email, phone, amountSAR, coupon, paymentId, BL_PRODUCT);
  }

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

  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);

  // 1. Log to Customers sheet
  const customersSheet = ss.getSheetByName(CUSTOMERS_SHEET);
  if (customersSheet) {
    const dateStr = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm:ss');
    customersSheet.appendRow([dateStr, email, name, phone, PP_PRODUCT, amount, coupon, paymentId]);
  }

  // 1b. Auto-add to Subscribers list.
  try { _admin_upsert_subscriber({ admin_token: ADMIN_TOKEN, email: email, name: name, source: 'buyer', language: 'AR' }); } catch (e) {}

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

  // 5. ZATCA invoice via Daftra (skip for free purchases — 0 SAR)
  const amountSAR = parseFloat(amount) || 0;
  if (amountSAR > 0) {
    createDaftraInvoice(name, email, phone, amountSAR, coupon, paymentId, PP_PRODUCT);
  }

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
    'creative-ai-workshop-t3':   'ورشة صناعة الإلهام',
    'beyond-lighting':           'أبعد من إمكانيات الإضاءة',
    'prompt-pack':               'حزمة البرومبتات الإبداعية',
  };
  const productName = productNames[product] || product;

  const subject = decodeURIComponent('%E2%9C%A8%20%D8%B9%D9%85%D9%84%D9%8A%D8%A9%20%D8%B4%D8%B1%D8%A7%D8%A1%20%D8%AC%D8%AF%D9%8A%D8%AF%D8%A9%20%E2%80%94%20') + productName;
  try {
    GmailApp.sendEmail(NOTIFY_EMAIL, subject, '', {
      name:     FROM_NAME,
      from:     FROM_EMAIL,
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
    Logger.log('Purchase notification sent to ' + NOTIFY_EMAIL + ' for ' + email);
  } catch (err) {
    Logger.log('Purchase notification FAILED for ' + email + ': ' + err.message);
  }
}

// ─────────────────────────────────────────────
// TEST — fires a fake purchase notification to verify Majid's inbox receives it
// Run from the Apps Script editor: select testNotification → Run
// ─────────────────────────────────────────────
function testNotification() {
  sendPurchaseNotification(
    'ماجد عنقاوي (اختبار)',
    'test@example.com',
    '0501234567',
    T3_PRODUCT,
    '799',
    '',
    'pay_test_notification_' + new Date().getTime()
  );
  Logger.log('Test notification sent — check ' + NOTIFY_EMAIL);
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
  <p style="color:#555;font-size:0.9rem;margin:8px 0 16px;">
    كجزء من المجموعة الأولى، حصلت على هذه الدورة المسجلة مجاناً — مقسّمة على ٦ محاور، تفتحلك تباعاً قبل الورشة المباشرة عشان تجي جاهز.
  </p>
  <div style="background:#faf8f3;border:1px solid #eee3c4;padding:14px 18px;margin:16px 0 20px;border-radius:4px;font-size:0.88rem;line-height:1.9;">
    <p style="margin:0 0 6px;color:#333;"><strong style="color:#8a6f1e;">✓ المحور 1 + 2 + 3 + 4</strong> &mdash; مفتوحة لك الآن</p>
    <p style="margin:0 0 6px;color:#666;">المحور 5 &mdash; يُفتح الإثنين ٢١ أبريل (كل محاور التعليم جاهزة قبل بداية ورشتك)</p>
    <p style="margin:0;color:#888;font-size:0.82rem;">المحور 6 (التطبيق العملي) &mdash; يُفتح بعد انتهاء الورشة المباشرة، كهدية التخرّج</p>
  </div>
  <p style="text-align:center;margin:24px 0;">
    <a href="${t2CourseUrl}"
       style="background:#C9A84C;color:#000;padding:14px 32px;text-decoration:none;font-weight:bold;font-size:1rem;">
      ابدأ بالمحور الأول الآن
    </a>
  </p>
  <p style="color:#888;font-size:0.8rem;">الرابط خاص بك — لا تشاركه مع أحد. كل محور جديد رح يوصلك إشعار على نفس الإيميل لما يُفتح.</p>` : '';

  return `
<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;color:#222;line-height:1.7;">
  <p>السلام عليكم${firstName ? ' ' + firstName : ''}،</p>
  <p>تم تسجيلك بنجاح في <strong>ورشة صناعة الإلهام</strong></p>
  <p style="color:#666;font-size:0.95rem;margin-top:-8px;">أنتج عملك الإبداعي باستخدام أدوات الذكاء الاصطناعي — من البريف إلى التسليم</p>

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
    // Discount is computed from the difference between original price and actual amount paid,
    // regardless of whether a coupon was used. This covers early-bird pricing (799 vs 999)
    // where there's no coupon code but the price is still lower than the listed original.
    // Without this, Daftra would show outstanding balance = originalPrice - amountPaid.
    const discountSAR   = Math.max(0, originalPrice - amountSAR);

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
// DAFTRA — Bulk-cache all existing Daftra clients
// Run ONCE on a fresh Apps Script project to prevent the
// "duplicate email + broken search API" failure when an
// existing customer buys again. Source: Daftra clients.json dump
// at 2026-04-15. Re-run to refresh, or add new entries manually
// via daftraCacheClientId(email, id) as new clients appear.
// ─────────────────────────────────────────────
function bulkCacheAllClients() {
  const clients = {
    'hessahdahdoh@gmail.com':    '4',
    'noura.alfehaid@gmail.com':  '6',
    'e@e.com':                   '13',
    'wkk@wkk.com':               '14',
    'asmaalfawzan@gmail.com':    '51',
    'reham.a.z@hotmail.com':     '56',
    'majed.engawi@gmail.com':    '57',
    'lameesjenaid97@gmail.com':  '58',
    'salemphoto4@gmail.com':     '59',
    'yara.kadasa@gmail.com':     '60',
    'aayman.rhmani@gmail.com':   '61'
  };

  const props = PropertiesService.getScriptProperties();
  let count = 0;
  for (const email in clients) {
    props.setProperty('daftra_' + email.toLowerCase(), clients[email]);
    Logger.log('Cached: ' + email + ' → ' + clients[email]);
    count++;
  }
  Logger.log('Bulk cache complete — ' + count + ' clients stored in PropertiesService');
  return count;
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
  const ss    = SpreadsheetApp.openById(MAIN_SHEET_ID);
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

  const ss    = SpreadsheetApp.openById(MAIN_SHEET_ID);
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
  const ss       = SpreadsheetApp.openById(MAIN_SHEET_ID);
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

  const ss    = SpreadsheetApp.openById(MAIN_SHEET_ID);
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

  const ss    = SpreadsheetApp.openById(MAIN_SHEET_ID);
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

  const ss    = SpreadsheetApp.openById(MAIN_SHEET_ID);
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
    const ss    = SpreadsheetApp.openById(MAIN_SHEET_ID);
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

  const ss    = SpreadsheetApp.openById(MAIN_SHEET_ID);
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

  const ss    = SpreadsheetApp.openById(MAIN_SHEET_ID);
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

// ═══════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────
// DRIP UNLOCK SYSTEM — M3/M4/M5/M6 for T2 course (gift for T3 buyers)
// ─────────────────────────────────────────────
//
// HOW IT WORKS:
//   1. Record + edit M3/M4/M5/M6 videos, upload to Bunny library 637491
//   2. Paste each video's GUID into column K ("Video ID (Staging)") of the
//      Lessons sheet on the matching lesson row
//   3. On the scheduled date + time (13:00 Jeddah), the trigger fires
//      unlockModule(n) which:
//        a. Copies column K → column H (video_id) for all lessons in module n
//        b. Marks column K as DONE so re-runs are no-ops
//        c. Sends a personalized "المحور مفتوح" email to every T3 customer
//           with their own T2 gift-course player URL
//   4. If column K is empty on trigger day, unlockModule does nothing (safe)
//
// AUDIENCE: only customers with product=T3_PRODUCT in the Customers sheet.
//           T2 is not sold directly yet — T3 buyers get T2 as a free gift.
//
// ONE-TIME SETUP (run from the Apps Script editor once):
//   1. setupDripSystem()      — adds the "Video ID (Staging)" header to col K
//   2. installDripTriggers()  — schedules all 4 auto-unlock triggers
//
// MANUAL OVERRIDE:
//   You can always run unlockModule(3) / (4) / (5) / (6) directly from the
//   editor instead of waiting for the scheduled time.
// ─────────────────────────────────────────────

const STAGING_COL = 11; // column K — Video ID (Staging)

/**
 * One-time setup — adds the Video ID (Staging) header to column K of Lessons.
 * Expands the sheet if column K doesn't exist yet.
 */
function setupDripSystem() {
  const ss    = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const sheet = ss.getSheetByName(LESSONS_SHEET);
  if (!sheet) throw new Error('Lessons sheet not found');

  const maxCols = sheet.getMaxColumns();
  if (maxCols < STAGING_COL) {
    sheet.insertColumnsAfter(maxCols, STAGING_COL - maxCols);
    Logger.log('Expanded Lessons sheet from ' + maxCols + ' to ' + STAGING_COL + ' columns');
  }

  const headerCell = sheet.getRange(1, STAGING_COL);
  if (!headerCell.getValue()) {
    headerCell.setValue('Video ID (Staging)');
    headerCell.setFontWeight('bold');
    Logger.log('Added "Video ID (Staging)" header at column K');
  } else {
    Logger.log('Column K header already set: ' + headerCell.getValue());
  }

  return { success: true };
}

/**
 * Unlock one module for the T2 course.
 * - Copies staging video IDs (col K) to live video_id (col H) for that module
 * - Sends drip email to all T3 customers with their player URL
 * - Idempotent: re-running after unlock does nothing (staging marked DONE)
 */
function unlockModule(moduleOrder) {
  const ss    = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const sheet = ss.getSheetByName(LESSONS_SHEET);
  if (!sheet) throw new Error('Lessons sheet not found');

  const data = sheet.getDataRange().getValues();
  const unlocked = []; // {title, order}
  let rowsUpdated = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const course    = String(row[1] || '').trim();
    const mo        = parseInt(row[3]) || 0;
    const lessonOrd = parseInt(row[4]) || 0;
    const title     = String(row[5] || '').trim();
    const liveVid   = String(row[7] || '').trim();
    const stagingVid = row.length > STAGING_COL - 1 ? String(row[STAGING_COL - 1] || '').trim() : '';

    if (course !== T2_PRODUCT) continue;
    if (mo !== moduleOrder)    continue;
    if (!stagingVid || stagingVid === 'DONE') continue;
    if (liveVid)               continue; // already live, don't overwrite

    sheet.getRange(i + 1, 8).setValue(stagingVid);
    sheet.getRange(i + 1, STAGING_COL).setValue('DONE');
    rowsUpdated++;
    unlocked.push({ title: title, order: lessonOrd });
  }

  if (rowsUpdated === 0) {
    Logger.log('unlockModule(' + moduleOrder + '): no staging IDs found — nothing to unlock');
    try {
      GmailApp.sendEmail(NOTIFY_EMAIL,
        'Drip Unlock M' + moduleOrder + ' — SKIPPED',
        'unlockModule(' + moduleOrder + ') ran but found no video IDs in the staging column (K) of the Lessons sheet. Nothing was sent.\n\nTo fix: paste the Bunny GUIDs into column K for the module ' + moduleOrder + ' rows, then run unlockModule(' + moduleOrder + ') manually.',
        { name: FROM_NAME, from: FROM_EMAIL });
    } catch(e) {}
    return { success: false, reason: 'no_staging_ids', moduleOrder: moduleOrder };
  }

  Logger.log('unlockModule(' + moduleOrder + '): flipped ' + rowsUpdated + ' lessons live');
  unlocked.sort(function(a, b) { return a.order - b.order; });

  // Send drip blast to T3 customers
  const emailResult = sendT2DripEmail(moduleOrder, unlocked);

  return { success: true, moduleOrder: moduleOrder, rowsUpdated: rowsUpdated, email: emailResult };
}

/**
 * Send the drip unlock email to every T3 customer, personalized with
 * their own T2 gift token so the CTA link opens their player directly.
 */
function sendT2DripEmail(moduleOrder, unlockedLessons) {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);

  // 1. Find all T3 customers (dedupe by email)
  const customersSheet = ss.getSheetByName(CUSTOMERS_SHEET);
  if (!customersSheet) return { error: 'no_customers_sheet' };
  const cData = customersSheet.getDataRange().getValues();

  const t3Customers = [];
  const seenEmails  = {};
  for (let i = 1; i < cData.length; i++) {
    const product = String(cData[i][4] || '').trim();
    if (product !== T3_PRODUCT) continue;
    const email = String(cData[i][1] || '').trim().toLowerCase();
    if (!email || seenEmails[email]) continue;
    seenEmails[email] = true;
    t3Customers.push({ email: email, name: String(cData[i][2] || '').trim() });
  }

  if (t3Customers.length === 0) {
    Logger.log('sendT2DripEmail M' + moduleOrder + ': no T3 customers found');
    return { sent: 0, skipped: 0, failed: 0 };
  }

  // 2. Build email → T2 token lookup
  const tokensSheet = ss.getSheetByName(TOKENS_SHEET);
  const tData       = tokensSheet.getDataRange().getValues();
  const emailToToken = {};
  for (let i = 1; i < tData.length; i++) {
    const course    = String(tData[i][1] || '').trim();
    const status    = String(tData[i][2] || '').trim();
    const custEmail = String(tData[i][3] || '').trim().toLowerCase();
    if (course !== T2_PRODUCT || status !== 'used' || !custEmail) continue;
    if (!emailToToken[custEmail]) emailToToken[custEmail] = String(tData[i][0] || '').trim();
  }

  // 3. Send personalized email per customer
  const subject = 'المحور ' + arabicNumber(moduleOrder) + ' مفتوح الآن — مدخل إلى الذكاء الاصطناعي الإبداعي';
  let sent = 0, skipped = 0, failed = 0;

  for (let c = 0; c < t3Customers.length; c++) {
    const cust = t3Customers[c];
    const token = emailToToken[cust.email];
    if (!token) {
      Logger.log('No T2 token for ' + cust.email + ' — skipping drip');
      skipped++;
      continue;
    }

    try {
      const firstName = cust.name ? cust.name.split(/\s+/)[0] : '';
      const playerUrl = 'https://player.malearnsa.com/watch.html?token=' + token + '&course=' + T2_PRODUCT;
      const html      = buildDripEmailHtml(firstName, moduleOrder, unlockedLessons, playerUrl);
      GmailApp.sendEmail(cust.email, subject, '', {
        name:     FROM_NAME,
        from:     FROM_EMAIL,
        htmlBody: html
      });
      sent++;
      Logger.log('✓ drip M' + moduleOrder + ' → ' + cust.email);
      Utilities.sleep(1200);
    } catch (err) {
      Logger.log('✗ drip M' + moduleOrder + ' FAILED for ' + cust.email + ': ' + err.message);
      failed++;
    }
  }

  Logger.log('Drip M' + moduleOrder + ' complete — Sent: ' + sent + ' · Skipped: ' + skipped + ' · Failed: ' + failed);

  // Notify Majid
  try {
    GmailApp.sendEmail(NOTIFY_EMAIL,
      'Drip M' + moduleOrder + ' — ' + sent + ' sent',
      'Module ' + moduleOrder + ' drip complete.\nSent: ' + sent + '\nSkipped: ' + skipped + '\nFailed: ' + failed,
      { name: FROM_NAME, from: FROM_EMAIL });
  } catch(e) {}

  return { sent: sent, skipped: skipped, failed: failed };
}

/**
 * Send the drip unlock email to one specific buyer — for resends after an
 * email typo fix or any other case where the original blast skipped them.
 *
 * Requires: buyer has a T3_PRODUCT row in Customers AND a used T2_PRODUCT
 * token in Tokens, both keyed on the same lowercased email.
 */
function sendDripToSingleBuyer(moduleOrder, targetEmail, unlockedLessons) {
  targetEmail = String(targetEmail || '').trim().toLowerCase();
  if (!targetEmail) return { error: 'no_email' };

  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);

  const customersSheet = ss.getSheetByName(CUSTOMERS_SHEET);
  if (!customersSheet) return { error: 'no_customers_sheet' };
  const cData = customersSheet.getDataRange().getValues();
  let customer = null;
  for (let i = 1; i < cData.length; i++) {
    const product = String(cData[i][4] || '').trim();
    const email   = String(cData[i][1] || '').trim().toLowerCase();
    if (product !== T3_PRODUCT || email !== targetEmail) continue;
    customer = { email: email, name: String(cData[i][2] || '').trim() };
    break;
  }
  if (!customer) {
    Logger.log('sendDripToSingleBuyer: no T3 customer row for ' + targetEmail);
    return { error: 'customer_not_found', email: targetEmail };
  }

  const tokensSheet = ss.getSheetByName(TOKENS_SHEET);
  const tData       = tokensSheet.getDataRange().getValues();
  let token = null;
  for (let i = 1; i < tData.length; i++) {
    const course    = String(tData[i][1] || '').trim();
    const status    = String(tData[i][2] || '').trim();
    const custEmail = String(tData[i][3] || '').trim().toLowerCase();
    if (course !== T2_PRODUCT || status !== 'used' || custEmail !== targetEmail) continue;
    token = String(tData[i][0] || '').trim();
    break;
  }
  if (!token) {
    Logger.log('sendDripToSingleBuyer: no T2 token for ' + targetEmail);
    return { error: 'token_not_found', email: targetEmail };
  }

  const subject   = 'المحور ' + arabicNumber(moduleOrder) + ' مفتوح الآن — مدخل إلى الذكاء الاصطناعي الإبداعي';
  const firstName = customer.name ? customer.name.split(/\s+/)[0] : '';
  const playerUrl = 'https://player.malearnsa.com/watch.html?token=' + token + '&course=' + T2_PRODUCT;
  const html      = buildDripEmailHtml(firstName, moduleOrder, unlockedLessons, playerUrl);

  try {
    GmailApp.sendEmail(customer.email, subject, '', {
      name:     FROM_NAME,
      from:     FROM_EMAIL,
      htmlBody: html
    });
    Logger.log('✓ single-buyer drip M' + moduleOrder + ' → ' + customer.email);
    return { sent: 1, email: customer.email, token: token };
  } catch (err) {
    Logger.log('✗ single-buyer drip FAILED: ' + err.message);
    return { error: 'send_failed', message: err.message, email: customer.email };
  }
}

/**
 * One-off resend — M5 drip to the buyer skipped on 2026-04-21 due to a
 * typo in the Tokens sheet customer_email column. Typo fixed 2026-04-22.
 */
function sendDripM5ToMissedBuyer() {
  return sendDripToSingleBuyer(5, '27madret@gmail.com', [
    { title: 'Figmaweave (Weavy AI)', order: 1 }
  ]);
}

/**
 * Render Latin digits as Arabic-Indic digits (for subject + module labels).
 */
function arabicNumber(n) {
  const map = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  return String(n).split('').map(function(d) { return map[parseInt(d)] || d; }).join('');
}

function buildDripEmailHtml(firstName, moduleOrder, unlockedLessons, playerUrl) {
  const moduleNames = {
    3: 'الفئة الأولى: شريك التفكير',
    4: 'الفئة الثانية: الإستديو — توليد الصور والفيديو',
    5: 'الفئة الثالثة: بناء أنظمة سير العمل',
    6: 'التطبيق العملي'
  };
  const moduleName = moduleNames[moduleOrder] || ('المحور ' + arabicNumber(moduleOrder));

  let lessonsList = '';
  for (let i = 0; i < unlockedLessons.length; i++) {
    lessonsList += '<li style="padding:6px 0;color:#444;">' + unlockedLessons[i].title + '</li>';
  }

  const greeting = firstName
    ? 'السلام عليكم ' + firstName + '،'
    : 'السلام عليكم،';

  return '' +
'<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;color:#222;line-height:1.8;">' +
'  <p>' + greeting + '</p>' +
'  <p>المحور <strong>' + arabicNumber(moduleOrder) + '</strong> من دورة <strong>"مدخل إلى الذكاء الاصطناعي الإبداعي"</strong> مفتوح لك الآن — هديتك كأحد طلاب ورشة صناعة الإلهام.</p>' +
'  <p style="font-size:1.1rem;font-weight:bold;color:#222;margin:22px 0 12px;">' +
'    المحور ' + arabicNumber(moduleOrder) + ' — <span style="color:#C9A84C;">' + moduleName + '</span>' +
'  </p>' +
'  <div style="background:#f9f6f0;border-right:3px solid #C9A84C;padding:18px 22px;margin:22px 0;border-radius:4px;">' +
'    <p style="margin:0 0 10px;font-weight:bold;color:#222;">الدروس المفتوحة:</p>' +
'    <ul style="margin:0;padding-right:22px;list-style:disc;">' +
       lessonsList +
'    </ul>' +
'  </div>' +
'  <p style="color:#444;">' +
'    شاهدها قبل جلسة الورشة المباشرة — كل محور يعطيك أساس تدخل الورشة فيه جاهز.' +
'  </p>' +
'  <p style="text-align:center;margin:34px 0 28px;">' +
'    <a href="' + playerUrl + '"' +
'       style="background:#C9A84C;color:#000;padding:16px 38px;text-decoration:none;font-weight:bold;font-size:1rem;display:inline-block;">' +
'      ابدأ المحور الآن' +
'    </a>' +
'  </p>' +
'  <p style="color:#888;font-size:0.85rem;text-align:center;">' +
'    هذا الرابط خاص بك — لا تشاركه مع أحد.' +
'  </p>' +
'  <hr style="border:none;border-top:1px solid #eee;margin:32px 0 20px;">' +
'  <p style="margin:0;">' +
'    أشوفك في الورشة،<br>' +
'    <strong>ماجد عنقاوي</strong><br>' +
'    <span style="color:#888;font-size:0.85rem;">صناعة الإلهام · MA Learn</span>' +
'  </p>' +
'</div>';
}

// ─────────────────────────────────────────────
// AUTO-TRIGGERS — wrapper functions for the time-based triggers
// ─────────────────────────────────────────────
function autoUnlockM3() { unlockModule(3); }
function autoUnlockM4() { unlockModule(4); }
function autoUnlockM5() { unlockModule(5); }
function autoUnlockM6() { unlockModule(6); }

// ─────────────────────────────────────────────
// MANUAL DRIP TRIGGERS — for when videos were placed directly in column H
// (bypassing the staging system). These only send the email, don't modify
// the Lessons sheet. Run from the editor after videos are already live.
// ─────────────────────────────────────────────
function sendDripM3Now() {
  return sendT2DripEmail(3, [
    { title: 'Claude',         order: 1 },
    { title: 'Gemini',         order: 2 },
    { title: 'Firefly Boards', order: 3 }
  ]);
}
function sendDripM4Now() {
  return sendT2DripEmail(4, [
    { title: 'Midjourney',                      order: 1 },
    { title: 'Higgsfield',                      order: 2 },
    { title: 'Upscalers — مكبرات الصور',        order: 3 },
    { title: 'Image Retouching — معالجة الصور', order: 4 },
    { title: 'أسعار البرامج والاشتراكات',       order: 5 }
  ]);
}
function sendDripM5Now() {
  return sendT2DripEmail(5, [
    { title: 'Figmaweave (Weavy AI)', order: 1 }
  ]);
}
function sendDripM6Now() {
  return sendT2DripEmail(6, [
    { title: 'Fashion Lookbook + Lifestyle Shoot', order: 1 }
  ]);
}

/**
 * Install all 4 drip triggers — run ONCE from the Apps Script editor.
 * Fires at 13:00 Jeddah time (10:00 UTC, Riyadh has no DST).
 * Safe to re-run: removes existing drip triggers before creating new ones.
 */
function installDripTriggers() {
  // Remove any existing drip triggers
  const existing = ScriptApp.getProjectTriggers();
  const names = ['autoUnlockM3', 'autoUnlockM4', 'autoUnlockM5', 'autoUnlockM6'];
  for (let i = 0; i < existing.length; i++) {
    if (names.indexOf(existing[i].getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }

  // 13:00 Jeddah = 10:00 UTC (Riyadh = UTC+3, no DST)
  const schedule = [
    { fn: 'autoUnlockM3', date: new Date('2026-04-17T10:00:00Z') }, // Thu Apr 17
    { fn: 'autoUnlockM4', date: new Date('2026-04-19T10:00:00Z') }, // Sat Apr 19
    { fn: 'autoUnlockM5', date: new Date('2026-04-21T10:00:00Z') }, // Mon Apr 21
    { fn: 'autoUnlockM6', date: new Date('2026-05-05T10:00:00Z') }  // Mon May 5
  ];

  const now = new Date();
  const created = [];
  for (let i = 0; i < schedule.length; i++) {
    const s = schedule[i];
    if (s.date > now) {
      ScriptApp.newTrigger(s.fn).timeBased().at(s.date).create();
      created.push(s.fn + ' at ' + s.date.toISOString());
    } else {
      Logger.log('Skipped ' + s.fn + ' — date already passed');
    }
  }

  Logger.log('Installed ' + created.length + ' drip triggers:\n' + created.join('\n'));
  return created;
}

/**
 * Test the drip email for one module using fake "unlocked lessons" — does NOT
 * modify the Lessons sheet. Sends only to NOTIFY_EMAIL for visual verification.
 */
function testDripEmail(moduleOrder) {
  moduleOrder = moduleOrder || 3;
  const lessonsByModule = {
    3: [
      { title: 'Claude',         order: 1 },
      { title: 'Gemini',         order: 2 },
      { title: 'Firefly Boards', order: 3 }
    ],
    4: [
      { title: 'Midjourney',                      order: 1 },
      { title: 'Higgsfield',                      order: 2 },
      { title: 'Upscalers — مكبرات الصور',        order: 3 },
      { title: 'Image Retouching — معالجة الصور', order: 4 },
      { title: 'أسعار البرامج والاشتراكات',       order: 5 }
    ],
    5: [
      { title: 'Figmaweave (Weavy AI)', order: 1 }
    ],
    6: [
      { title: 'Fashion Lookbook + Lifestyle Shoot', order: 1 }
    ]
  };
  const fake = lessonsByModule[moduleOrder] || lessonsByModule[3];
  const playerUrl = 'https://player.malearnsa.com/watch.html?token=MAL-TEST1234&course=' + T2_PRODUCT;
  const html = buildDripEmailHtml('Majid', moduleOrder, fake, playerUrl);
  const subject = '[TEST] المحور ' + arabicNumber(moduleOrder) + ' مفتوح الآن — مدخل إلى الذكاء الاصطناعي الإبداعي';
  GmailApp.sendEmail(NOTIFY_EMAIL, subject, '', {
    name:     FROM_NAME,
    from:     FROM_EMAIL,
    htmlBody: html
  });
  Logger.log('Test drip email sent to ' + NOTIFY_EMAIL);
}

function testDripM3() { return testDripEmail(3); }
function testDripM4() { return testDripEmail(4); }
function testDripM5() { return testDripEmail(5); }
function testDripM6() { return testDripEmail(6); }

function testT3ConfirmationEmail() {
  const fakeT2Url = 'https://player.malearnsa.com/watch.html?token=MAL-TEST1234&course=' + T2_PRODUCT;
  const html = buildT3Email('ماجد عنقاوي', fakeT2Url);
  GmailApp.sendEmail(NOTIFY_EMAIL, '[TEST] تسجيلك في ورشة صناعة الإلهام', '', {
    name:     FROM_NAME,
    from:     FROM_EMAIL,
    htmlBody: html
  });
  Logger.log('Test T3 confirmation email sent to ' + NOTIFY_EMAIL);
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
/**
 * MA Learn Dashboard — Admin endpoints (appended to token-validator/Code.js).
 *
 * Every action here requires `admin_token` in the request body to match the
 * ADMIN_TOKEN constant already defined in Code.js. Rotate ADMIN_TOKEN if
 * suspected compromised — it's the sole gate on all write operations.
 */

function adminToggleLesson(params) {
  if (params.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  const lessonId = String(params.lesson_id || '');
  const active = String(params.active || '').toUpperCase() === 'TRUE';
  if (!lessonId) return { ok: false, error: 'lesson_id required' };

  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const sh = ss.getSheetByName(LESSONS_SHEET);
  const data = sh.getDataRange().getValues();
  const header = data[0];
  let iId = header.indexOf('LessonID');
  if (iId === -1) iId = header.indexOf('ID');
  const iActive = header.indexOf('Active');
  if (iId === -1 || iActive === -1) return { ok: false, error: 'schema mismatch' };

  for (let r = 1; r < data.length; r++) {
    if (String(data[r][iId]) === lessonId) {
      sh.getRange(r + 1, iActive + 1).setValue(active ? 'TRUE' : 'FALSE');
      return { ok: true, lessonId: lessonId, active: active, row: r + 1 };
    }
  }
  return { ok: false, error: 'lesson_not_found' };
}

// Map API param name → Coupons sheet header name. Header-driven, so extra columns
// like "Allowed Courses", "Excluded Courses", "Allowed Methods" are untouched.
const COUPON_PARAM_TO_HEADER = {
  code: 'Code',
  type: 'Type',
  value: 'Value',
  min_sar: 'Min Amount (SAR)',
  uses_left: 'Uses Left',
  start_date: 'Start Date',
  end_date: 'End Date',
  active: 'Active',
  products: 'Products',
  created_at: 'CreatedAt',
  created_by: 'CreatedBy',
};

function _couponHeaderIndex(sh) {
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const idx = {};
  for (let i = 0; i < header.length; i++) idx[String(header[i])] = i;
  return { header: header, idx: idx };
}

function _couponValue(param, raw) {
  if (param === 'active') return String(raw).toUpperCase();
  if (param === 'value' || param === 'min_sar') return Number(raw);
  if (param === 'uses_left') return raw === '' ? '' : Number(raw);
  return raw;
}

function adminCreateCoupon(params) {
  if (params.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  const code = String(params.code || '').toUpperCase().trim();
  if (!code) return { ok: false, error: 'code required' };

  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const sh = ss.getSheetByName(COUPONS_SHEET);
  const data = sh.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]).toUpperCase().trim() === code) {
      return { ok: false, error: 'code_exists' };
    }
  }

  const info = _couponHeaderIndex(sh);
  const row = new Array(info.header.length).fill('');
  const values = {
    code: code,
    type: String(params.type || 'percentage'),
    value: Number(params.value || 0),
    min_sar: Number(params.min_sar || 0),
    uses_left: params.uses_left === '' || params.uses_left === undefined ? '' : Number(params.uses_left),
    start_date: params.start_date || '',
    end_date: params.end_date || '',
    active: 'TRUE',
    products: String(params.products || 'all'),
    created_at: new Date().toISOString(),
    created_by: String(params.created_by || 'majid'),
  };
  Object.keys(values).forEach(function (p) {
    const h = COUPON_PARAM_TO_HEADER[p];
    if (h !== undefined && info.idx[h] !== undefined) row[info.idx[h]] = values[p];
  });
  sh.appendRow(row);
  return { ok: true, code: code, row: row };
}

function adminUpdateCoupon(params) {
  if (params.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  const code = String(params.code || '').toUpperCase().trim();
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const sh = ss.getSheetByName(COUPONS_SHEET);
  const data = sh.getDataRange().getValues();
  const info = _couponHeaderIndex(sh);
  const mutable = ['value', 'min_sar', 'uses_left', 'start_date', 'end_date', 'active', 'products'];
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]).toUpperCase().trim() === code) {
      mutable.forEach(function (p) {
        if (params[p] !== undefined) {
          const h = COUPON_PARAM_TO_HEADER[p];
          if (h === undefined || info.idx[h] === undefined) return;
          sh.getRange(r + 1, info.idx[h] + 1).setValue(_couponValue(p, params[p]));
        }
      });
      return { ok: true, code: code };
    }
  }
  return { ok: false, error: 'code_not_found' };
}

function adminDeleteCoupon(params) {
  if (params.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  const code = String(params.code || '').toUpperCase().trim();
  if (!code) return { ok: false, error: 'code required' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const sh = ss.getSheetByName(COUPONS_SHEET);
  const data = sh.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]).toUpperCase().trim() === code) {
      sh.deleteRow(r + 1);
      return { ok: true, code: code };
    }
  }
  return { ok: false, error: 'code_not_found' };
}

function adminAddLinkbio(params) {
  if (params.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const sh = ss.getSheetByName('LinkInBio');
  if (!sh) return { ok: false, error: 'no LinkInBio tab' };
  const linkId = 'LNK-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  const lastRow = sh.getLastRow();
  const nextOrder = lastRow > 1 ? lastRow : 1;
  sh.appendRow([
    linkId,
    String(params.title_ar || ''),
    String(params.title_en || ''),
    String(params.url || ''),
    String(params.icon || ''),
    String(params.description || ''),
    'TRUE',
    nextOrder,
    0,
  ]);
  return { ok: true, linkId: linkId };
}

function adminUpdateLinkbio(params) {
  if (params.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  const id = String(params.link_id || '');
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const sh = ss.getSheetByName('LinkInBio');
  const data = sh.getDataRange().getValues();
  const fields = { title_ar: 2, title_en: 3, url: 4, icon: 5, description: 6, active: 7, order: 8 };
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]) === id) {
      Object.keys(fields).forEach(function (k) {
        if (params[k] !== undefined) {
          var v;
          if (k === 'active') v = String(params[k]).toUpperCase();
          else if (k === 'order') v = Number(params[k]);
          else v = params[k];
          sh.getRange(r + 1, fields[k]).setValue(v);
        }
      });
      return { ok: true, linkId: id };
    }
  }
  return { ok: false, error: 'link_not_found' };
}

function adminDeleteLinkbio(params) {
  if (params.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  const id = String(params.link_id || '');
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const sh = ss.getSheetByName('LinkInBio');
  const data = sh.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]) === id) {
      sh.deleteRow(r + 1);
      return { ok: true, linkId: id };
    }
  }
  return { ok: false, error: 'link_not_found' };
}

function adminUpdateLinkbioHeader(params) {
  if (params.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const sh = ss.getSheetByName('LinkInBioHeader');
  const data = sh.getDataRange().getValues();
  const updates = {};
  if (params.photo_url !== undefined) updates.PhotoURL = params.photo_url;
  if (params.tagline_ar !== undefined) updates.TaglineAR = params.tagline_ar;
  if (params.tagline_en !== undefined) updates.TaglineEN = params.tagline_en;
  for (let r = 1; r < data.length; r++) {
    const key = String(data[r][0]);
    if (updates[key] !== undefined) sh.getRange(r + 1, 2).setValue(updates[key]);
  }
  return { ok: true };
}

function adminIncrementLinkbioClick(params) {
  // No admin_token check — called from the public link.malearnsa.com page.
  const id = String(params.link_id || '');
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const sh = ss.getSheetByName('LinkInBio');
  const data = sh.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]) === id) {
      const cur = Number(data[r][8]) || 0;
      sh.getRange(r + 1, 9).setValue(cur + 1);
      return { ok: true, linkId: id, clicks: cur + 1 };
    }
  }
  return { ok: false, error: 'link_not_found' };
}

function adminAddEmailTemplate(params) {
  if (params.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const sh = ss.getSheetByName('EmailTemplates');
  if (!sh) return { ok: false, error: 'no EmailTemplates tab' };
  const templateId = String(params.template_id || ('tpl-' + Utilities.getUuid().slice(0, 8).toLowerCase()));
  const data = sh.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][0]) === templateId) return { ok: false, error: 'template_id_exists' };
  }

  // Build header map so we can write columns by name (and only touch Blocks if present).
  const headers = data.length > 0 ? data[0] : [];
  const headerMap = {};
  for (let c = 0; c < headers.length; c++) headerMap[String(headers[c])] = c;
  const width = headers.length > 0 ? headers.length : 7;
  const row = new Array(width).fill('');

  function setCol(name, value, fallbackIdx) {
    if (headerMap[name] !== undefined) row[headerMap[name]] = value;
    else if (typeof fallbackIdx === 'number' && fallbackIdx < row.length) row[fallbackIdx] = value;
  }

  // Canonical column layout (v1): TemplateID, Name, SubjectAR, SubjectEN, BodyAR, BodyEN, Variables, (Blocks).
  setCol('TemplateID', templateId, 0);
  setCol('Name', String(params.name || 'Untitled'), 1);
  setCol('SubjectAR', String(params.subject_ar || ''), 2);
  setCol('SubjectEN', String(params.subject_en || ''), 3);
  setCol('BodyAR', String(params.body_ar || ''), 4);
  setCol('BodyEN', String(params.body_en || ''), 5);
  setCol('Variables', String(params.variables || 'name'), 6);
  // Blocks column is optional — only written if the header exists.
  if (headerMap['Blocks'] !== undefined) {
    row[headerMap['Blocks']] = String(params.blocks || '');
  }

  sh.appendRow(row);
  return { ok: true, templateId: templateId };
}

function adminSendEmail(params) {
  if (params.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  const to = String(params.to || '');
  const subject = String(params.subject || '');
  const body = String(params.body || '');
  if (!to || !subject || !body) return { ok: false, error: 'missing fields' };
  try {
    GmailApp.sendEmail(to, subject, body, {
      name: FROM_NAME,
      from: FROM_EMAIL,
      htmlBody: body,
    });
    return { ok: true, to: to };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ═════════════════════════════════════════════════════════════════════
// NEWSLETTER + SUBSCRIBERS — admin endpoints (2026-04-20 rollout)
// ═════════════════════════════════════════════════════════════════════
// Writes to: Subscribers, Newsletters, NewsletterEvents tabs.
// Every action checks admin_token against ADMIN_TOKEN constant.
// Schema reference: docs/sheet-schema.md in ma-learn-dashboard repo.

// ---------- helpers (prefixed with _nl to avoid collisions) ----------
function _nl_lc(s) { return String(s || '').trim().toLowerCase(); }
function _nl_now() { return Utilities.formatDate(new Date(), 'Asia/Riyadh', "yyyy-MM-dd'T'HH:mm:ss"); }
function _nl_sheet(name, sheetId) {
  // Newsletter ops accept an optional sheetId override from the caller so the
  // staging dashboard (pointing at the STAGING sheet) can write newsletters
  // separate from the prod sheet where purchases land.
  var id = sheetId ? String(sheetId).trim() : MAIN_SHEET_ID;
  return SpreadsheetApp.openById(id).getSheetByName(name);
}
function _nl_rndToken(n) {
  var a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var s = '';
  for (var i = 0; i < (n || 24); i++) s += a.charAt(Math.floor(Math.random() * a.length));
  return s;
}
function _nl_headerMap(sheet) {
  var row = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  row.forEach(function (h, i) { map[String(h).trim()] = i; });
  return map;
}

// ---------- admin_upsert_subscriber ----------
function _admin_upsert_subscriber(p) {
  if (p.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  var email = _nl_lc(p.email);
  if (!email) return { ok: false, error: 'missing_email' };
  var src = String(p.source || '').trim();
  if (!src) return { ok: false, error: 'missing_source' };

  var sh = _nl_sheet('Subscribers', p.sheetId);
  if (!sh) return { ok: false, error: 'Subscribers_tab_missing' };
  var headers = _nl_headerMap(sh);
  var last = sh.getLastRow();
  var data = last > 1 ? sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues() : [];

  var rowIndex = -1;
  for (var i = 0; i < data.length; i++) {
    if (_nl_lc(data[i][headers['Email']]) === email) { rowIndex = i + 2; break; }
  }

  if (rowIndex > 0) {
    var sources = String(sh.getRange(rowIndex, headers['Sources'] + 1).getValue() || '')
      .split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (sources.indexOf(src) === -1) sources.push(src);
    sh.getRange(rowIndex, headers['Sources'] + 1).setValue(sources.join(','));
    sh.getRange(rowIndex, headers['LastSourceAt'] + 1).setValue(_nl_now());
    if (p.name) sh.getRange(rowIndex, headers['Name'] + 1).setValue(p.name);
    return { ok: true, action: 'updated', email: email };
  }

  var newRow = new Array(sh.getLastColumn()).fill('');
  newRow[headers['Email']]            = email;
  newRow[headers['Name']]             = p.name || '';
  newRow[headers['Sources']]          = src;
  newRow[headers['Language']]         = (p.language === 'EN' ? 'EN' : 'AR');
  newRow[headers['AddedAt']]          = _nl_now();
  newRow[headers['LastSourceAt']]     = _nl_now();
  newRow[headers['Status']]           = 'active';
  newRow[headers['UnsubscribeToken']] = _nl_rndToken(24);
  sh.appendRow(newRow);

  // Fire-and-forget welcome email (backend handles; won't fail subscribe on error).
  try {
    var backendUrl = PropertiesService.getScriptProperties().getProperty('BACKEND_URL');
    if (backendUrl) {
      UrlFetchApp.fetch(backendUrl + '/api/writes/newsletter/send_welcome', {
        method: 'post',
        contentType: 'application/json',
        muteHttpExceptions: true,
        headers: { 'x-admin-token': ADMIN_TOKEN },
        payload: JSON.stringify({ email: email, name: p.name || '', language: newRow[headers['Language']] }),
      });
    }
  } catch (e) { /* swallow */ }

  return { ok: true, action: 'inserted', email: email };
}

// ---------- admin_mark_unsubscribed ----------
function _admin_mark_unsubscribed(p) {
  if (p.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  var email = _nl_lc(p.email);
  var token = String(p.token || '').trim();
  if (!email && !token) return { ok: false, error: 'missing_email_or_token' };

  var sh = _nl_sheet('Subscribers', p.sheetId);
  if (!sh) return { ok: false, error: 'Subscribers_tab_missing' };
  var headers = _nl_headerMap(sh);
  var last = sh.getLastRow();
  if (last < 2) return { ok: false, error: 'no_rows' };
  var data = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if ((email && _nl_lc(row[headers['Email']]) === email) ||
        (token && row[headers['UnsubscribeToken']] === token)) {
      var r = i + 2;
      sh.getRange(r, headers['Status'] + 1).setValue('unsubscribed');
      sh.getRange(r, headers['UnsubscribedAt'] + 1).setValue(_nl_now());
      return { ok: true, email: _nl_lc(row[headers['Email']]) };
    }
  }
  return { ok: false, error: 'not_found' };
}

// ---------- admin_create_newsletter ----------
function _admin_create_newsletter(p) {
  if (p.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  var sh = _nl_sheet('Newsletters', p.sheetId);
  if (!sh) return { ok: false, error: 'Newsletters_tab_missing' };
  var headers = _nl_headerMap(sh);
  var id = 'nl_' + _nl_rndToken(12);
  var row = new Array(sh.getLastColumn()).fill('');
  row[headers['NewsletterID']]     = id;
  row[headers['Subject']]          = p.subject || '';
  row[headers['Preheader']]        = p.preheader || '';
  row[headers['Language']]         = (p.language === 'EN' ? 'EN' : 'AR');
  row[headers['Blocks']]           = p.blocks || '[]';
  row[headers['SegmentFilter']]    = p.segmentFilter || '{}';
  row[headers['Status']]           = 'draft';
  row[headers['CreatedAt']]        = _nl_now();
  row[headers['UpdatedAt']]        = _nl_now();
  row[headers['IdempotencyKey']]   = _nl_rndToken(24);
  row[headers['CreatedBy']]        = p.createdBy || 'majid';
  row[headers['CloneOf']]          = p.cloneOf || '';
  sh.appendRow(row);
  return { ok: true, newsletterId: id };
}

// ---------- admin_update_newsletter ----------
function _admin_update_newsletter(p) {
  if (p.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  var id = String(p.newsletterId || '').trim();
  if (!id) return { ok: false, error: 'missing_newsletterId' };

  var sh = _nl_sheet('Newsletters', p.sheetId);
  if (!sh) return { ok: false, error: 'Newsletters_tab_missing' };
  var headers = _nl_headerMap(sh);
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][headers['NewsletterID']]) === id) {
      var r = i + 2;
      var fields = ['Subject', 'Preheader', 'Language', 'Blocks', 'SegmentFilter', 'ScheduledAt'];
      fields.forEach(function (f) {
        var key = f.charAt(0).toLowerCase() + f.slice(1);
        if (p[key] !== undefined) sh.getRange(r, headers[f] + 1).setValue(p[key]);
      });
      sh.getRange(r, headers['UpdatedAt'] + 1).setValue(_nl_now());
      return { ok: true };
    }
  }
  return { ok: false, error: 'not_found' };
}

// ---------- admin_mark_newsletter_status ----------
function _admin_mark_newsletter_status(p) {
  if (p.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  var id = String(p.newsletterId || '').trim();
  var toStatus = String(p.toStatus || '').trim();
  var fromStatus = String(p.fromStatus || '').trim();
  if (!id || !toStatus) return { ok: false, error: 'missing' };

  var sh = _nl_sheet('Newsletters', p.sheetId);
  if (!sh) return { ok: false, error: 'Newsletters_tab_missing' };
  var headers = _nl_headerMap(sh);
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][headers['NewsletterID']]) === id) {
      var r = i + 2;
      var current = String(sh.getRange(r, headers['Status'] + 1).getValue());
      if (fromStatus && current !== fromStatus) {
        return { ok: false, error: 'status_mismatch', current: current };
      }
      sh.getRange(r, headers['Status'] + 1).setValue(toStatus);
      sh.getRange(r, headers['UpdatedAt'] + 1).setValue(_nl_now());
      if (toStatus === 'sent') sh.getRange(r, headers['SentAt'] + 1).setValue(_nl_now());
      if (p.recipientCount !== undefined) sh.getRange(r, headers['RecipientCount'] + 1).setValue(p.recipientCount);
      if (p.brevoCampaignId) sh.getRange(r, headers['BrevoCampaignId'] + 1).setValue(p.brevoCampaignId);
      return { ok: true };
    }
  }
  return { ok: false, error: 'not_found' };
}

// ---------- admin_append_newsletter_event ----------
function _admin_append_newsletter_event(p) {
  if (p.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  var sh = _nl_sheet('NewsletterEvents', p.sheetId);
  if (!sh) return { ok: false, error: 'NewsletterEvents_tab_missing' };
  var headers = _nl_headerMap(sh);
  var row = new Array(sh.getLastColumn()).fill('');
  row[headers['EventID']]       = _nl_rndToken(16);
  row[headers['Timestamp']]     = _nl_now();
  row[headers['NewsletterID']]  = p.newsletterId || '';
  row[headers['Email']]         = _nl_lc(p.email);
  row[headers['Event']]         = p.event || '';
  row[headers['URL']]           = p.url || '';
  row[headers['UserAgent']]     = String(p.userAgent || '').slice(0, 200);
  sh.appendRow(row);

  if (p.newsletterId) _nl_incrementCounter(p.newsletterId, p.event, p.sheetId);
  return { ok: true };
}

function _nl_incrementCounter(newsletterId, event, sheetId) {
  var map = {
    delivered: 'DeliveredCount', opened: 'OpenCount', clicked: 'ClickCount',
    unsubscribed: 'UnsubCount',  hard_bounce: 'BounceCount', soft_bounce: 'BounceCount',
  };
  var col = map[event];
  if (!col) return;
  var sh = _nl_sheet('Newsletters', sheetId);
  if (!sh) return;
  var headers = _nl_headerMap(sh);
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][headers['NewsletterID']]) === newsletterId) {
      var r = i + 2;
      var current = Number(sh.getRange(r, headers[col] + 1).getValue()) || 0;
      sh.getRange(r, headers[col] + 1).setValue(current + 1);
      return;
    }
  }
}

// ---------- admin_upload_email_image ----------
// Fallback uploader for small images (<7000 chars base64). Normal flow is
// frontend → backend Drive API. This endpoint keeps the contract usable from
// Apps Script directly if needed.
function _admin_upload_email_image(p) {
  if (p.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  var filename = String(p.filename || '').trim();
  var contentType = String(p.contentType || '').trim();
  var b64 = String(p.dataBase64 || '');
  if (!filename || !contentType || !b64) return { ok: false, error: 'missing_params' };
  if (b64.length > 7000) return { ok: false, error: 'payload_too_large_use_backend' };

  var folderId = PropertiesService.getScriptProperties().getProperty('EMAIL_ASSETS_FOLDER_ID');
  var bytes;
  try { bytes = Utilities.base64Decode(b64); }
  catch (e) { return { ok: false, error: 'invalid_base64' }; }

  var blob = Utilities.newBlob(bytes, contentType, Date.now() + '-' + filename);
  var file = folderId
    ? DriveApp.getFolderById(folderId).createFile(blob)
    : DriveApp.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, url: 'https://drive.google.com/uc?id=' + file.getId() };
}

// ═════════════════════════════════════════════════════════════════════
// CONTACTS / CRM — admin endpoints (2026-04-23 rollout)
// ═════════════════════════════════════════════════════════════════════
// Called by the dashboard's Contacts page via /api/writes/contact/* routes.

// ─── admin_resend_access_link ──────────────────────────────────────────────
function _admin_resend_access_link(p) {
  if (p.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  var email = _nl_lc(p.email);
  var product = String(p.product || '').trim();
  if (!email || !product) return { ok: false, error: 'missing_params' };

  var ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  var tokensSheet = ss.getSheetByName(TOKENS_SHEET);
  if (!tokensSheet) return { ok: false, error: 'no_tokens_sheet' };

  var data = tokensSheet.getDataRange().getValues();
  var foundToken = null;
  for (var i = 1; i < data.length; i++) {
    if (_nl_lc(data[i][3]) === email && String(data[i][1]).trim() === product) {
      foundToken = String(data[i][0]).trim();
      break;
    }
  }
  if (!foundToken) return { ok: false, error: 'no_token_for_product' };

  var custSheet = ss.getSheetByName(CUSTOMERS_SHEET);
  var name = '';
  if (custSheet) {
    var cdata = custSheet.getDataRange().getValues();
    for (var j = 1; j < cdata.length; j++) {
      if (_nl_lc(cdata[j][1]) === email) { name = String(cdata[j][2] || ''); break; }
    }
  }

  var courseUrl, subject, body;
  if (product === T2_PRODUCT) {
    courseUrl = 'https://player.malearnsa.com/watch.html?token=' + foundToken;
    subject = 'وصلك رابط الدورة — مدخل إلى الذكاء الاصطناعي الإبداعي';
    body = buildT2Email(name, courseUrl);
  } else if (product === T3_PRODUCT) {
    var t2Url = 'https://player.malearnsa.com/watch.html?token=' + foundToken + '&course=' + T2_PRODUCT;
    subject = 'تم تسجيلك — ورشة صناعة الإلهام';
    body = buildT3Email(name, t2Url);
  } else if (product === BL_PRODUCT) {
    courseUrl = 'https://player.malearnsa.com/watch.html?token=' + foundToken + '&course=beyond-lighting';
    subject = 'وصلك رابط الدورة — أبعد من إمكانيات الإضاءة';
    body = buildBLEmail(name, courseUrl);
  } else if (product === PP_PRODUCT) {
    var libUrl = 'https://malearnsa.com/prompt-pack/library/?token=' + foundToken;
    subject = 'وصلك كود الوصول — حزمة البرومبتات الإبداعية';
    body = buildPPEmail(name, libUrl, foundToken);
  } else {
    return { ok: false, error: 'unknown_product' };
  }

  try {
    GmailApp.sendEmail(email, subject, '', { htmlBody: body, name: FROM_NAME, from: FROM_EMAIL });
    return { ok: true, product: product, email: email };
  } catch (e) {
    return { ok: false, error: 'send_failed: ' + String(e) };
  }
}

// ─── admin_gift_token ──────────────────────────────────────────────────────
function _admin_gift_token(p) {
  if (p.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  var email = _nl_lc(p.email);
  var product = String(p.product || '').trim();
  if (!email || !product) return { ok: false, error: 'missing_params' };

  var ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  var tokensSheet = ss.getSheetByName(TOKENS_SHEET);
  if (!tokensSheet) return { ok: false, error: 'no_tokens_sheet' };

  var data = tokensSheet.getDataRange().getValues();
  var tokenRow = -1, assignedToken = null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() === product && String(data[i][2]).trim() === 'available') {
      assignedToken = String(data[i][0]).trim();
      tokenRow = i + 1;
      break;
    }
  }
  if (!assignedToken) return { ok: false, error: 'no_tokens_available' };

  tokensSheet.getRange(tokenRow, 3).setValue('used');
  tokensSheet.getRange(tokenRow, 4).setValue(email);

  var custSheet = ss.getSheetByName(CUSTOMERS_SHEET);
  var name = String(p.name || '');
  var dateStr = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm:ss');
  var paymentId = 'gift-' + _nl_rndToken(10);
  if (custSheet) custSheet.appendRow([dateStr, email, name, '', product, 0, 'gift', paymentId]);

  var subject, body;
  if (product === T2_PRODUCT) {
    subject = 'هديتك — مدخل إلى الذكاء الاصطناعي الإبداعي';
    body = buildT2Email(name, 'https://player.malearnsa.com/watch.html?token=' + assignedToken);
  } else if (product === T3_PRODUCT) {
    subject = 'هديتك — ورشة صناعة الإلهام';
    body = buildT3Email(name, 'https://player.malearnsa.com/watch.html?token=' + assignedToken + '&course=' + T2_PRODUCT);
  } else if (product === BL_PRODUCT) {
    subject = 'هديتك — أبعد من إمكانيات الإضاءة';
    body = buildBLEmail(name, 'https://player.malearnsa.com/watch.html?token=' + assignedToken + '&course=beyond-lighting');
  } else if (product === PP_PRODUCT) {
    subject = 'هديتك — حزمة البرومبتات الإبداعية';
    body = buildPPEmail(name, 'https://malearnsa.com/prompt-pack/library/?token=' + assignedToken, assignedToken);
  } else {
    return { ok: false, error: 'unknown_product' };
  }

  try {
    GmailApp.sendEmail(email, subject, '', { htmlBody: body, name: FROM_NAME, from: FROM_EMAIL });
    return { ok: true, token: assignedToken, paymentId: paymentId, product: product };
  } catch (e) {
    return { ok: false, error: 'send_failed: ' + String(e) };
  }
}

// ─── admin_remove_subscriber ───────────────────────────────────────────────
function _admin_remove_subscriber(p) {
  if (p.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  var email = _nl_lc(p.email);
  if (!email) return { ok: false, error: 'missing_email' };

  var sh = _nl_sheet('Subscribers', p.sheetId);
  if (!sh) return { ok: false, error: 'Subscribers_tab_missing' };
  var headers = _nl_headerMap(sh);
  var last = sh.getLastRow();
  if (last < 2) return { ok: true, removed: false };
  var data = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    if (_nl_lc(data[i][headers['Email']]) === email) {
      sh.deleteRow(i + 2);
      return { ok: true, removed: true, email: email };
    }
  }
  return { ok: true, removed: false };
}
