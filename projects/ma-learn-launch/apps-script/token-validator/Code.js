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
// Dashboard-owned tabs (LinkInBio, LinkInBioHeader, EmailTemplates, AuditLog) live on a
// separate sheet from shared business data. Backend reads via SHEET_ID_ADMIN; Apps Script writes here.
const ADMIN_SHEET_ID = '17OXBVq8XBXDWUY7Zh88MTycqMYJA8zYRtGSk9WE08QI';

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
const BL_DAFTRA_PRODUCT_ID = 40;
const BL_ORIGINAL_PRICE    = 650;

// Prompt Pack product
const PP_PRODUCT           = 'prompt-pack';
const PP_DAFTRA_PRODUCT_ID = 41; // UPDATE: create in Daftra → use that product ID
const PP_ORIGINAL_PRICE    = 99;

// Daftra
const DAFTRA_API_KEY  = '641fb01dbafdb03000f2658ab3196d5795308ffa';
const DAFTRA_BASE_URL = 'https://malearn.daftra.com/api2';
const DAFTRA_STORE_ID = 1;

// Tamara — BNPL provider. SANDBOX creds; swap for prod after UAT.
// Webhook URL to register in Tamara partner portal:
//   https://script.google.com/macros/s/AKfycbznjcsYu8gLDZqFJGededAQaATad_L8vlhRQV04pOqh57HB5nFVRy9zUHAcg6goyj8DKA/exec?action=tamara_webhook
const TAMARA_API_BASE              = 'https://api-sandbox.tamara.co';
const TAMARA_API_TOKEN             = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhY2NvdW50SWQiOiJhZTc4N2IzYS0yYWQwLTQ5NDAtOGNjYS1hYzI2ZmZkZmUzZDEiLCJ0eXBlIjoibWVyY2hhbnQiLCJzYWx0IjoiMWIzOWE5YWQ3NDk0MTdmMGZiZTliMTY5YmM2OWZkNjMiLCJyb2xlcyI6WyJST0xFX01FUkNIQU5UIl0sImlhdCI6MTc3NzM4MTI3MywiaXNzIjoiVGFtYXJhIn0.Ra2wK-F7JDZJUVQIIsefo_Gaag7y64smOKFzXuaSw8H3Z_w_VH8-_ldCnjLwU-puLpl5_btnz2y5d8OCBY870FFueYnDYS0pUm_T-IOfukCRTVj66FYVxtnfyJ7GrKleQEbhs5KxQ33uJ9bRohLGc7XtsZHRWuaQu5mByoqN4yHu5HSZZ7wV7Tm-Y6rRqANbCuyzj5n9b_L1u09BJLdI_YN229JTzDnlPtFSSwyN2__j_L0GECII4ms1PFTAxmVjEdaKfRQUXwjDHetNJx9hMseQ8Fa2plj1AEyo6JPLr0W8i1z6maJfwxrlhj2IYkW0sxLNo4V62t-bw9ab_O3-yQ';
const TAMARA_NOTIFICATION_TOKEN    = 'c5369f05-d4ff-406e-9712-0a54cc78e41e';
const TAMARA_PUBLIC_KEY            = '4715671d-9dc2-4e39-b848-f5470a65789b';

// Bank Al-Inmaa — receiving account for bank transfer payment method
const ALINMA_IBAN          = 'SA3805000068207281538000';
const ALINMA_SWIFT         = 'INMASARI';
const ALINMA_ACCOUNT_NAME  = 'MA Learn — ماجد عنقاوي';
const ALINMA_BANK_NAME_AR  = 'مصرف الإنماء';
const ALINMA_BANK_NAME_EN  = 'Alinma Bank';
const BANK_TRANSFERS_SHEET = 'BankTransfers';
// Two-working-day SLA for buyer confirmation (per reference_alinma_bank.md)

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
  // Parse body as JSON regardless of Content-Type — browser fetch() with string body
  // defaults to text/plain even when sending JSON, and Apps Script never sees the
  // application/json hint. Try/catch swallows non-JSON bodies (legacy form posts).
  let bodyParams = {};
  if (e.postData && e.postData.contents) {
    try { bodyParams = JSON.parse(e.postData.contents) || {}; }
    catch (_) { bodyParams = {}; }
  }
  const action = params.action || bodyParams.action || '';
  const merged = Object.assign({}, bodyParams, params);
  try {
    let result;
    if      (action === 'save_content')                 result = saveLessonContent(params);
    else if (action === 'admin_archive_chat_messages')  result = _handle_admin_archive_chat_messages(merged);
    else if (action === 'tamara_create_order')          result = tamaraCreateOrder(merged);
    else if (action === 'tamara_webhook')               result = tamaraHandleWebhook(merged, e);
    else if (action === 'bank_transfer_initiate')       result = bankTransferInitiate(merged);
    else result = {
      error: 'unknown_action',
      _diag: {
        action_seen:        action,
        param_keys:         Object.keys(params || {}),
        body_keys:          Object.keys(bodyParams || {}),
        postData_present:   !!(e && e.postData),
        postData_type:      (e && e.postData && e.postData.type)        || null,
        postData_length:    (e && e.postData && e.postData.contents) ? e.postData.contents.length : 0,
        postData_preview:   (e && e.postData && e.postData.contents) ? e.postData.contents.slice(0, 200) : ''
      }
    };
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
    else if (action === 'mint_supabase_token') result = handleMintSupabaseToken_(e.parameter);
    else if (action === 'admin_set_chat_archive_config') result = _admin_set_chat_archive_config(e.parameter);
    else if (action === 'admin_send_chat_launch_email')   result = _admin_send_chat_launch_email(e.parameter);
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
    else if (action === 'admin_reorder_lessons')        result = _admin_reorder_lessons(e.parameter);
    else if (action === 'bank_transfer_initiate')        result = bankTransferInitiate(e.parameter);
    else if (action === 'admin_list_pending_transfers')  result = adminListPendingTransfers(e.parameter);
    else if (action === 'admin_confirm_bank_transfer')   result = adminConfirmBankTransfer(e.parameter);
    else if (action === 'admin_reject_bank_transfer')    result = adminRejectBankTransfer(e.parameter);
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

// ═════════════════════════════════════════════════════════════════════
// TAMARA — BNPL payment provider
// Flow: checkout → tamaraCreateOrder → Tamara checkout page → customer pays
//   → Tamara fires webhook (status=approved) → tamaraHandleWebhook
//   → authorise + capture (auto) → completePurchase (token + Daftra + email)
//
// Idempotency: tamara order_id is used as payment_id throughout, so
// paymentAlreadyProcessed() dedupes if Tamara redelivers the webhook.
// ═════════════════════════════════════════════════════════════════════

function tamaraCreateOrder(params) {
  const name    = String(params.name    || '').trim();
  const email   = String(params.email   || '').trim();
  const phone   = String(params.phone   || '').trim();
  const product = String(params.product || '').trim();
  const amount  = Number(params.amount  || 0);
  const coupon  = String(params.coupon  || '').trim();

  if (!email || !name || !phone) return { success: false, error: 'missing_buyer_info' };
  if (!product || amount <= 0)   return { success: false, error: 'invalid_order' };

  const productNames = {
    'beyond-lighting':         'أبعد من إمكانيات الإضاءة',
    'intro-to-creative-ai':    'مدخل إلى الذكاء الاصطناعي الإبداعي',
    'creative-ai-workshop-t3': 'ورشة صناعة الإلهام',
    'prompt-pack':             'حزمة البرومبتات الإبداعية'
  };
  const productName = productNames[product] || product;

  // Phone → E.164 (+9665XXXXXXXX). Strip non-digits, normalise leading 0/966.
  let phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.indexOf('966') === 0) phoneDigits = phoneDigits.slice(3);
  if (phoneDigits.indexOf('0') === 0)   phoneDigits = phoneDigits.slice(1);
  const phoneE164 = '+966' + phoneDigits;

  const nameParts = name.split(/\s+/);
  const firstName = nameParts[0] || name;
  const lastName  = nameParts.slice(1).join(' ') || firstName;

  const orderRefId = product + '-' + Utilities.getUuid().slice(0, 12);

  const baseOrigin   = 'https://malearnsa.com';
  const productPath  = '/' + product + '/';

  const amountStr = amount.toFixed(2);
  const zeroAmt   = { amount: '0.00', currency: 'SAR' };

  const orderPayload = {
    order_reference_id: orderRefId,
    total_amount:       { amount: amountStr, currency: 'SAR' },
    shipping_amount:    zeroAmt,
    tax_amount:         zeroAmt,
    description:        productName,
    country_code:       'SA',
    payment_type:       'PAY_BY_INSTALMENTS',
    instalments:        3,
    locale:             'ar_SA',
    items: [{
      reference_id:    product,
      type:            'Digital',
      name:            productName,
      sku:             product,
      quantity:        1,
      total_amount:    { amount: amountStr, currency: 'SAR' },
      unit_price:      { amount: amountStr, currency: 'SAR' },
      tax_amount:      zeroAmt,
      discount_amount: zeroAmt
    }],
    consumer: {
      first_name:   firstName,
      last_name:    lastName,
      phone_number: phoneE164,
      email:        email
    },
    shipping_address: {
      first_name:   firstName,
      last_name:    lastName,
      line1:        'Digital delivery',
      city:         'Jeddah',
      country_code: 'SA',
      phone_number: phoneE164
    },
    merchant_url: {
      success:      baseOrigin + productPath + 'success.html?status=paid&payment_method=tamara&order_id=' + orderRefId,
      failure:      baseOrigin + productPath + 'success.html?status=failed&payment_method=tamara',
      cancel:       baseOrigin + productPath + 'success.html?status=canceled&payment_method=tamara',
      notification: getTamaraNotificationUrl_()
    },
    platform: 'malearnsa-pages'
  };

  // Stash buyer context keyed by orderRefId so the webhook can run
  // completePurchase even though localStorage is gone by then.
  PropertiesService.getScriptProperties().setProperty(
    'tamara_ctx_' + orderRefId,
    JSON.stringify({ name, email, phone, product, amount, coupon, ts: Date.now() })
  );

  const headers = {
    'Authorization': 'Bearer ' + TAMARA_API_TOKEN,
    'Content-Type':  'application/json'
  };

  try {
    const res = UrlFetchApp.fetch(TAMARA_API_BASE + '/checkout', {
      method:             'post',
      headers:            headers,
      payload:            JSON.stringify(orderPayload),
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    const body = res.getContentText();
    let data; try { data = JSON.parse(body); } catch (_) { data = { raw: body }; }

    if (code >= 200 && code < 300 && data.checkout_url) {
      return {
        success:      true,
        order_id:     data.order_id || orderRefId,
        checkout_id:  data.checkout_id || '',
        checkout_url: data.checkout_url
      };
    }
    return { success: false, error: 'tamara_create_failed', http: code, details: data };
  } catch (err) {
    return { success: false, error: 'tamara_unreachable', message: String(err) };
  }
}

function tamaraAuthoriseOrder_(orderId) {
  const headers = { 'Authorization': 'Bearer ' + TAMARA_API_TOKEN, 'Content-Type': 'application/json' };
  const res = UrlFetchApp.fetch(TAMARA_API_BASE + '/orders/' + encodeURIComponent(orderId) + '/authorise', {
    method: 'post', headers: headers, payload: '{}', muteHttpExceptions: true
  });
  return { code: res.getResponseCode(), body: res.getContentText() };
}

function tamaraCaptureOrder_(orderId, amount) {
  const headers = { 'Authorization': 'Bearer ' + TAMARA_API_TOKEN, 'Content-Type': 'application/json' };
  const payload = {
    order_id:        orderId,
    total_amount:    { amount: amount, currency: 'SAR' },
    shipping_info:   { shipped_at: new Date().toISOString(), shipping_company: 'Digital', tracking_number: 'N/A', tracking_url: 'https://malearnsa.com' }
  };
  const res = UrlFetchApp.fetch(TAMARA_API_BASE + '/payments/capture', {
    method: 'post', headers: headers, payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  return { code: res.getResponseCode(), body: res.getContentText() };
}

function tamaraGetOrder_(orderId) {
  const res = UrlFetchApp.fetch(TAMARA_API_BASE + '/orders/' + encodeURIComponent(orderId), {
    method: 'get', headers: { 'Authorization': 'Bearer ' + TAMARA_API_TOKEN }, muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) return null;
  try { return JSON.parse(res.getContentText()); } catch (_) { return null; }
}

function tamaraVerifyToken_(jwt) {
  const parts = String(jwt || '').split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  const expectedBytes = Utilities.computeHmacSha256Signature(headerB64 + '.' + payloadB64, TAMARA_NOTIFICATION_TOKEN);
  const expectedSig   = Utilities.base64EncodeWebSafe(expectedBytes).replace(/=+$/, '');
  if (expectedSig !== sigB64) return null;

  try {
    const decoded = Utilities.newBlob(Utilities.base64DecodeWebSafe(payloadB64)).getDataAsString();
    return JSON.parse(decoded);
  } catch (_) { return null; }
}

function getTamaraNotificationUrl_() {
  const exec = ScriptApp.getService().getUrl();
  return exec + '?action=tamara_webhook';
}

function tamaraHandleWebhook(merged, e) {
  const tamaraToken = (e && e.parameter && e.parameter.tamaraToken) || merged.tamaraToken || '';
  const verified    = tamaraVerifyToken_(tamaraToken);
  if (!verified) return { success: false, error: 'invalid_tamara_token' };

  const orderId     = String(merged.order_id     || '');
  const orderRefId  = String(merged.order_reference_id || '');
  const status      = String(merged.order_status || merged.status || '').toLowerCase();
  const eventType   = String(merged.event_type   || '').toLowerCase();

  if (!orderId) return { success: false, error: 'missing_order_id' };

  // Idempotency — Tamara may redeliver. Use orderRefId as payment_id so we share dedup with completePurchase.
  if (paymentAlreadyProcessed(orderRefId)) return { success: true, reason: 'already_processed' };

  // Only act on "approved" — capture+fulfill. Everything else (declined, expired, canceled) we no-op.
  const isApproved = (status === 'approved' || eventType === 'order_approved');
  if (!isApproved) return { success: true, reason: 'event_ignored', event: eventType, status: status };

  // 1. Authorise — required within 72h or the order auto-cancels
  const authRes = tamaraAuthoriseOrder_(orderId);
  if (authRes.code < 200 || authRes.code >= 300) {
    return { success: false, error: 'authorise_failed', http: authRes.code, details: authRes.body };
  }

  // 2. Recover buyer context from PropertiesService (set during create_order)
  const ctxKey = 'tamara_ctx_' + orderRefId;
  let ctx = {};
  const ctxRaw = PropertiesService.getScriptProperties().getProperty(ctxKey);
  if (ctxRaw) {
    try { ctx = JSON.parse(ctxRaw); } catch (_) {}
  }

  // Fallback to fetching from Tamara if context missing (e.g. cross-deploy)
  if (!ctx.email) {
    const order = tamaraGetOrder_(orderId);
    if (order && order.consumer) {
      ctx.email   = order.consumer.email   || '';
      ctx.name    = ((order.consumer.first_name || '') + ' ' + (order.consumer.last_name || '')).trim();
      ctx.phone   = order.consumer.phone_number || '';
      ctx.amount  = (order.total_amount && order.total_amount.amount) || 0;
      ctx.product = (order.items && order.items[0] && order.items[0].sku) || '';
    }
  }

  if (!ctx.email || !ctx.product) {
    return { success: false, error: 'context_missing', orderRefId: orderRefId };
  }

  // 3. Capture — for digital goods we capture immediately (instant fulfilment)
  const capRes = tamaraCaptureOrder_(orderId, ctx.amount);
  if (capRes.code < 200 || capRes.code >= 300) {
    return { success: false, error: 'capture_failed', http: capRes.code, details: capRes.body };
  }

  // 4. Fulfil: token + Daftra + email + Majid notification — same pipeline as Moyasar
  const result = completePurchase({
    name:       ctx.name,
    email:      ctx.email,
    phone:      ctx.phone,
    product:    ctx.product,
    amount:     ctx.amount,
    coupon:     ctx.coupon || '',
    payment_id: orderRefId
  });

  // Cleanup the stashed context (best-effort)
  try { PropertiesService.getScriptProperties().deleteProperty(ctxKey); } catch (_) {}

  return { success: true, fulfilled: result, payment_method: 'tamara' };
}

// ═════════════════════════════════════════════════════════════════════
// BANK TRANSFER — Bank Al-Inmaa, manual confirmation flow
// Mirrors the ciw-waitlist pattern but in the canonical script and
// integrates with completePurchase for fulfilment on confirm.
//
// Flow:
//   1. User on checkout clicks تحويل بنكي
//   2. bankTransferInitiate logs row to BankTransfers sheet (status=pending)
//      → emails buyer with IBAN + SWIFT + reference + 2-day SLA
//      → emails Majid with confirm/reject quick-action links
//   3. Majid (via dashboard or quick-action link) calls
//      admin_confirm_bank_transfer → row flips to confirmed
//      → completePurchase runs (token + Daftra + access email + Majid notification)
//   4. Or admin_reject_bank_transfer → row flips to rejected, buyer gets reason email
// ═════════════════════════════════════════════════════════════════════

function ensureBankTransfersSheet_() {
  const ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  let sheet = ss.getSheetByName(BANK_TRANSFERS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(BANK_TRANSFERS_SHEET);
    sheet.getRange(1, 1, 1, 11).setValues([[
      'Timestamp', 'Reference', 'Name', 'Email', 'Phone',
      'Product', 'Amount (SAR)', 'Coupon', 'Status', 'Resolved At', 'Notes'
    ]]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold');
  }
  return sheet;
}

function bankTransferInitiate(params) {
  const name    = String(params.name    || '').trim();
  const email   = String(params.email   || '').trim();
  const phone   = String(params.phone   || '').trim();
  const product = String(params.product || '').trim();
  const amount  = Number(params.amount  || 0);
  const coupon  = String(params.coupon  || '').trim();

  if (!email || !name || !phone) return { success: false, error: 'missing_buyer_info' };
  if (!product || amount <= 0)   return { success: false, error: 'invalid_order' };

  const reference = generateBankReference_(product);
  const sheet = ensureBankTransfersSheet_();
  const dateStr = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm:ss');

  sheet.appendRow([
    dateStr, reference, name, email, phone,
    product, amount, coupon, 'pending', '', ''
  ]);

  // Email buyer with bank details
  try { sendBankInstructionsEmail_(name, email, product, amount, reference); }
  catch (err) { Logger.log('sendBankInstructionsEmail_ error: ' + err.message); }

  // Notify Majid with confirm/reject quick-action links
  try { sendBankPendingNotification_(name, email, phone, product, amount, coupon, reference, sheet.getLastRow()); }
  catch (err) { Logger.log('sendBankPendingNotification_ error: ' + err.message); }

  // Auto-add to subscriber list
  try { _admin_upsert_subscriber({ admin_token: ADMIN_TOKEN, email: email, name: name, source: 'bank-transfer-pending', language: 'AR' }); } catch (e) {}

  return {
    success:    true,
    reference:  reference,
    iban:       ALINMA_IBAN,
    swift:      ALINMA_SWIFT,
    bank_name:  ALINMA_BANK_NAME_AR,
    account_name: ALINMA_ACCOUNT_NAME,
    sla_days:   2,
    amount:     amount
  };
}

function generateBankReference_(product) {
  const prefixes = {
    'beyond-lighting':         'MABL',
    'intro-to-creative-ai':    'MAITCAI',
    'creative-ai-workshop-t3': 'MACIW',
    'prompt-pack':             'MAPP'
  };
  const prefix = prefixes[product] || 'MA';
  const rand   = Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  return prefix + '-BNK-' + rand;
}

function adminListPendingTransfers(params) {
  if (params.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  const sheet = ensureBankTransfersSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, count: 0, rows: [] };
  const data = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  const rows = [];
  data.forEach((r, i) => {
    if (String(r[8] || '').trim() === 'pending') {
      rows.push({
        rowIndex: i + 2,
        timestamp: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
        reference: r[1], name: r[2], email: r[3], phone: r[4],
        product: r[5], amount: r[6], coupon: r[7], status: r[8]
      });
    }
  });
  rows.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  return { ok: true, count: rows.length, rows: rows };
}

function adminConfirmBankTransfer(params) {
  if (params.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  const rowIndex = parseInt(params.row_index, 10);
  if (!rowIndex || rowIndex < 2) return { ok: false, error: 'invalid_row_index' };

  const sheet = ensureBankTransfersSheet_();
  const row = sheet.getRange(rowIndex, 1, 1, 11).getValues()[0];
  if (String(row[8] || '').trim() !== 'pending') {
    return { ok: false, error: 'row_not_pending', currentStatus: row[8] };
  }

  const reference = String(row[1] || '');
  const name      = String(row[2] || '');
  const email     = String(row[3] || '');
  const phone     = String(row[4] || '');
  const product   = String(row[5] || '');
  const amount    = Number(row[6] || 0);
  const coupon    = String(row[7] || '');

  // Mark confirmed BEFORE fulfilment so concurrent confirms can't double-fire
  const ts = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm:ss');
  sheet.getRange(rowIndex, 9).setValue('confirmed');
  sheet.getRange(rowIndex, 10).setValue(ts);

  // Run the same fulfilment chain as Moyasar/Tamara — token + Daftra + access email + Majid notification
  const result = completePurchase({
    name:       name,
    email:      email,
    phone:      phone,
    product:    product,
    amount:     amount,
    coupon:     coupon,
    payment_id: reference
  });

  return { ok: true, action: 'confirmed', reference: reference, fulfilled: result };
}

function adminRejectBankTransfer(params) {
  if (params.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  const rowIndex = parseInt(params.row_index, 10);
  const reason   = String(params.reason || '').trim();
  if (!rowIndex || rowIndex < 2) return { ok: false, error: 'invalid_row_index' };
  if (!reason)                   return { ok: false, error: 'reason_required' };

  const sheet = ensureBankTransfersSheet_();
  const row = sheet.getRange(rowIndex, 1, 1, 11).getValues()[0];
  if (String(row[8] || '').trim() !== 'pending') {
    return { ok: false, error: 'row_not_pending', currentStatus: row[8] };
  }
  const name      = String(row[2] || '');
  const email     = String(row[3] || '');
  const product   = String(row[5] || '');

  const ts = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm:ss');
  sheet.getRange(rowIndex, 9).setValue('rejected');
  sheet.getRange(rowIndex, 10).setValue(ts);
  sheet.getRange(rowIndex, 11).setValue(reason);

  try { sendBankRejectionEmail_(name, email, product, reason); }
  catch (err) { Logger.log('sendBankRejectionEmail_ error: ' + err.message); }

  return { ok: true, action: 'rejected', reason: reason };
}

function _bankProductDisplay_(product) {
  const map = {
    'beyond-lighting':         'دورة أبعد من إمكانيات الإضاءة',
    'intro-to-creative-ai':    'دورة مدخل إلى الذكاء الاصطناعي الإبداعي',
    'creative-ai-workshop-t3': 'ورشة صناعة الإلهام',
    'prompt-pack':             'حزمة البرومبتات الإبداعية'
  };
  return map[product] || product;
}

function sendBankInstructionsEmail_(name, email, product, amount, reference) {
  const productName = _bankProductDisplay_(product);
  const subject = '📥 طلبك مستلم — تعليمات التحويل البنكي · ' + productName;
  const body = `
<!DOCTYPE html><html dir="rtl" lang="ar"><body style="margin:0;padding:0;background:#f9f6ef;font-family:Cairo,sans-serif;color:#1a1a1a;">
<div style="max-width:600px;margin:0 auto;padding:32px 24px;">
  <h1 style="font-size:1.4rem;font-weight:700;margin:0 0 6px;">يا هلا ${name}،</h1>
  <p style="font-size:0.95rem;line-height:1.7;color:#444;margin:0 0 24px;">
    استلمنا طلبك لـ <strong>${productName}</strong>. عشان نأكدك ونرسلك رابط الوصول، حول المبلغ على الحساب التالي:
  </p>
  <div style="background:#fff;border:1px solid rgba(201,168,76,0.4);border-radius:12px;padding:24px;margin-bottom:24px;">
    <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;border-bottom:1px solid #eee;margin-bottom:14px;">
      <span style="color:#888;font-size:0.85rem;">المبلغ</span>
      <span style="color:#C9A84C;font-size:1.3rem;font-weight:700;">${amount} ر.س</span>
    </div>
    <div style="margin-bottom:10px;font-size:0.85rem;"><span style="color:#888;">البنك:</span> ${ALINMA_BANK_NAME_AR}</div>
    <div style="margin-bottom:10px;font-size:0.85rem;"><span style="color:#888;">اسم الحساب:</span> ${ALINMA_ACCOUNT_NAME}</div>
    <div style="margin-bottom:10px;font-size:0.85rem;direction:ltr;text-align:right;"><span style="color:#888;">IBAN:</span> <span style="font-family:monospace;font-weight:700;">${ALINMA_IBAN}</span></div>
    <div style="margin-bottom:10px;font-size:0.85rem;direction:ltr;text-align:right;"><span style="color:#888;">SWIFT:</span> <span style="font-family:monospace;font-weight:700;">${ALINMA_SWIFT}</span></div>
    <div style="background:#f9f6ef;border:1px dashed #C9A84C;border-radius:8px;padding:12px;margin-top:14px;text-align:center;">
      <div style="font-size:0.78rem;color:#888;margin-bottom:4px;">رقم المرجع — اكتبه في وصف التحويل</div>
      <div style="font-family:monospace;font-size:1.1rem;font-weight:700;color:#1a1a1a;letter-spacing:0.5px;">${reference}</div>
    </div>
  </div>
  <div style="background:#fff;border:1px solid #eee;border-radius:12px;padding:18px;margin-bottom:18px;">
    <p style="margin:0 0 6px;font-size:0.88rem;font-weight:700;">⏱ يومين عمل لتأكيد التحويل</p>
    <p style="margin:0;color:#666;font-size:0.83rem;line-height:1.6;">
      بمجرد ما نستلم التحويل ونتأكد منه، راح يوصلك إيميل ثاني فيه رابط الدورة. أي سؤال؟ راسلنا على
      <a href="mailto:support@malearnsa.com" style="color:#C9A84C;">support@malearnsa.com</a>
    </p>
  </div>
  <p style="text-align:center;color:#aaa;font-size:0.78rem;margin:24px 0 0;">© MA Learn 2026</p>
</div>
</body></html>`;
  GmailApp.sendEmail(email, subject, '', { from: FROM_EMAIL, name: FROM_NAME, htmlBody: body });
}

function sendBankPendingNotification_(name, email, phone, product, amount, coupon, reference, rowIndex) {
  const productName = _bankProductDisplay_(product);
  const execUrl = ScriptApp.getService().getUrl();
  const confirmUrl = execUrl + '?action=admin_confirm_bank_transfer&admin_token=' + encodeURIComponent(ADMIN_TOKEN) + '&row_index=' + rowIndex;

  const subject = '🔴 تحويل بنكي — ' + name + ' · ' + productName;
  const body = `
<!DOCTYPE html><html dir="rtl" lang="ar"><body style="font-family:Arial,sans-serif;background:#f5f5f7;padding:20px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;">
  <h2 style="margin:0 0 16px;font-size:1.15rem;">تحويل بنكي ينتظر التأكيد</h2>
  <table style="width:100%;font-size:0.88rem;line-height:1.7;">
    <tr><td style="color:#888;width:90px;">المرجع:</td><td style="font-family:monospace;font-weight:700;">${reference}</td></tr>
    <tr><td style="color:#888;">الاسم:</td><td>${name}</td></tr>
    <tr><td style="color:#888;">الإيميل:</td><td><a href="mailto:${email}">${email}</a></td></tr>
    <tr><td style="color:#888;">الجوال:</td><td>${phone}</td></tr>
    <tr><td style="color:#888;">المنتج:</td><td>${productName}</td></tr>
    <tr><td style="color:#888;">المبلغ:</td><td><strong>${amount} ر.س</strong></td></tr>
    ${coupon ? '<tr><td style="color:#888;">كود خصم:</td><td>' + coupon + '</td></tr>' : ''}
  </table>
  <div style="margin-top:18px;padding-top:14px;border-top:1px solid #eee;">
    <p style="margin:0 0 10px;color:#444;font-size:0.85rem;">بعد ما تتأكد من البنك، اضغط:</p>
    <a href="${confirmUrl}" style="display:inline-block;background:#34C759;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.9rem;">✓ أكد التحويل وفعّل الوصول</a>
    <p style="margin:14px 0 0;color:#999;font-size:0.78rem;">الرفض من dashboard.</p>
  </div>
</div>
</body></html>`;
  GmailApp.sendEmail(NOTIFY_EMAIL, subject, '', { from: FROM_EMAIL, name: FROM_NAME, htmlBody: body });
}

function sendBankRejectionEmail_(name, email, product, reason) {
  if (!email) return;
  const productName = _bankProductDisplay_(product);
  const subject = 'تحديث بخصوص طلبك — ' + productName;
  const body = `
<!DOCTYPE html><html dir="rtl" lang="ar"><body style="margin:0;padding:0;background:#f9f6ef;font-family:Cairo,sans-serif;color:#1a1a1a;">
<div style="max-width:600px;margin:0 auto;padding:32px 24px;">
  <h1 style="font-size:1.3rem;font-weight:700;margin:0 0 12px;">يا هلا ${name}،</h1>
  <p style="font-size:0.95rem;line-height:1.7;color:#444;margin:0 0 16px;">نأسف لإبلاغك إن طلب التحويل البنكي ما اكتمل بسبب:</p>
  <div style="background:#fff;border:1px solid #eee;border-radius:10px;padding:16px;margin-bottom:18px;font-size:0.9rem;">${reason}</div>
  <p style="font-size:0.9rem;color:#444;line-height:1.7;">
    تقدر تجرب طريقة دفع ثانية أو تراسلنا على
    <a href="mailto:support@malearnsa.com" style="color:#C9A84C;">support@malearnsa.com</a>
    وإحنا نحل لك المشكلة.
  </p>
  <p style="text-align:center;color:#aaa;font-size:0.78rem;margin:24px 0 0;">© MA Learn 2026</p>
</div>
</body></html>`;
  GmailApp.sendEmail(email, subject, '', { from: FROM_EMAIL, name: FROM_NAME, htmlBody: body });
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
  const content  = String(params.content  || '');
  const blocks   = String(params.blocks   || '');
  if (!lessonId) return { success: false, reason: 'no_lesson_id' };

  const ss    = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const sheet = ss.getSheetByName(LESSON_CONTENT_SHEET);
  if (!sheet) return { success: false, reason: 'no_content_sheet' };

  // Header-map lookup so Blocks col position is tolerant.
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const headerIdx = {};
  header.forEach(function (h, i) { headerIdx[String(h).trim()] = i + 1; });
  const contentCol = headerIdx['Content'] || 2;
  const blocksCol  = headerIdx['Blocks']  || 0;

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === lessonId) {
      sheet.getRange(i + 1, contentCol).setValue(content);
      if (blocksCol > 0 && blocks) sheet.getRange(i + 1, blocksCol).setValue(blocks);
      return { success: true };
    }
  }

  const row = new Array(header.length).fill('');
  row[0] = lessonId;
  row[contentCol - 1] = content;
  if (blocksCol > 0) row[blocksCol - 1] = blocks;
  sheet.appendRow(row);
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
  const ss = SpreadsheetApp.openById(ADMIN_SHEET_ID);
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
  const ss = SpreadsheetApp.openById(ADMIN_SHEET_ID);
  const sh = ss.getSheetByName('LinkInBio');
  if (!sh) return { ok: false, error: 'no LinkInBio tab' };
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
  const ss = SpreadsheetApp.openById(ADMIN_SHEET_ID);
  const sh = ss.getSheetByName('LinkInBio');
  if (!sh) return { ok: false, error: 'no LinkInBio tab' };
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
  const ss = SpreadsheetApp.openById(ADMIN_SHEET_ID);
  const sh = ss.getSheetByName('LinkInBioHeader');
  if (!sh) return { ok: false, error: 'no LinkInBioHeader tab' };
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
  const ss = SpreadsheetApp.openById(ADMIN_SHEET_ID);
  const sh = ss.getSheetByName('LinkInBio');
  if (!sh) return { ok: false, error: 'no LinkInBio tab' };
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
  const ss = SpreadsheetApp.openById(ADMIN_SHEET_ID);
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

// ═════════════════════════════════════════════════════════════════════
// LESSONS — reorder endpoint (2026-04-23 rollout)
// ═════════════════════════════════════════════════════════════════════

function _admin_reorder_lessons(p) {
  if (p.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  var lessonId = String(p.lessonId || '').trim();
  var moduleOrder = Number(p.moduleOrder);
  var lessonOrder = Number(p.lessonOrder);
  if (!lessonId || !Number.isFinite(moduleOrder) || !Number.isFinite(lessonOrder)) {
    return { ok: false, error: 'missing_params' };
  }
  var ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  var sh = ss.getSheetByName(LESSONS_SHEET);
  if (!sh) return { ok: false, error: 'no_lessons_sheet' };
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === lessonId) {
      sh.getRange(i + 1, 4).setValue(moduleOrder); // D = Module Order
      sh.getRange(i + 1, 5).setValue(lessonOrder); // E = Lesson Order
      return { ok: true, lessonId: lessonId, moduleOrder: moduleOrder, lessonOrder: lessonOrder };
    }
  }
  return { ok: false, error: 'lesson_not_found' };
}

// ─────────────────────────────────────────────
// CHAT LAUNCH EMAIL — broadcast to BL customers (2026-04-24)
// Announces the new Discussion tab on player.malearnsa.com.
// Email copy pre-approved by Majid 2026-04-24 (Q4 green light).
// Gated on ADMIN_TOKEN + optional &dry_run=true to preview targets.
// ─────────────────────────────────────────────
function _admin_send_chat_launch_email(p) {
  if (String(p.admin_token || '') !== ADMIN_TOKEN) {
    return { ok: false, error: 'unauthorized' };
  }
  var course = String(p.course || BL_PRODUCT).trim();
  var dryRun = String(p.dry_run || '') === 'true';

  // Read Tokens sheet; collect unique purchased emails for the given course
  var ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  var tokensSheet = ss.getSheetByName(TOKENS_SHEET);
  if (!tokensSheet) return { ok: false, error: 'tokens_sheet_missing' };
  var tdata = tokensSheet.getDataRange().getValues();
  var emails = {};  // email -> name
  for (var i = 1; i < tdata.length; i++) {
    var rowCourse = String(tdata[i][1] || '').trim();
    var rowStatus = String(tdata[i][2] || '').trim();
    var rowEmail  = String(tdata[i][3] || '').trim().toLowerCase();
    if (rowCourse !== course) continue;
    if (rowStatus !== 'used' && rowStatus !== 'available') continue;
    if (!rowEmail || rowEmail === 'test@test.com') continue;
    emails[rowEmail] = true;
  }

  // Join display names from Customers sheet
  var custSheet = ss.getSheetByName(CUSTOMERS_SHEET);
  if (custSheet) {
    var cdata = custSheet.getDataRange().getValues();
    for (var j = 1; j < cdata.length; j++) {
      var e = String(cdata[j][1] || '').trim().toLowerCase();
      if (emails[e] === true) emails[e] = String(cdata[j][2] || '').trim() || '';
    }
  }

  var targets = Object.keys(emails).map(function (e) {
    return { email: e, name: emails[e] || '' };
  });

  if (dryRun) {
    return { ok: true, dry_run: true, target_count: targets.length, targets: targets.slice(0, 50) };
  }

  var subject = 'جديد داخل المنصة — تبويب النقاش';
  var sentTo = [];
  var failed = [];

  for (var k = 0; k < targets.length; k++) {
    var t = targets[k];
    var firstName = (t.name || '').split(/\s+/)[0] || '';
    var html = _chatLaunchEmailHtml(firstName);
    try {
      GmailApp.sendEmail(t.email, subject, '', {
        name: FROM_NAME,
        from: FROM_EMAIL,
        htmlBody: html
      });
      sentTo.push(t.email);
      Utilities.sleep(150);  // rate-limit politely
    } catch (err) {
      failed.push({ email: t.email, error: String(err).slice(0, 200) });
    }
  }

  return {
    ok: true,
    course: course,
    target_count: targets.length,
    sent: sentTo.length,
    failed_count: failed.length,
    failed: failed.slice(0, 50)
  };
}

function _chatLaunchEmailHtml(firstName) {
  var greeting = firstName ? ('أهلاً ' + firstName + '،') : 'أهلاً،';
  return (
    '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">' +
    '<style>' +
    'body{font-family:Tahoma,Arial,sans-serif;background:#f7f5f0;margin:0;padding:24px;color:#1a1a1a;line-height:1.8}' +
    '.c{max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px 28px;box-shadow:0 1px 3px rgba(0,0,0,0.06)}' +
    'h2{color:#c9a84c;font-size:20px;margin:0 0 16px;font-weight:700}' +
    'p{margin:0 0 14px;font-size:15px}' +
    'ul{margin:0 0 16px 0;padding:0 20px 0 0;font-size:15px}' +
    'li{margin-bottom:6px}' +
    '.sig{margin-top:24px;color:#666;font-size:14px}' +
    '.btn{display:inline-block;background:#c9a84c;color:#000;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:700;margin-top:8px}' +
    '</style></head><body><div class="c">' +
    '<h2>جديد داخل المنصة — تبويب النقاش</h2>' +
    '<p>' + greeting + '</p>' +
    '<p>أضفت شي جديد داخل منصة MA Learn: في كل درس الحين في تبويب اسمه "النقاش".</p>' +
    '<p>من جواه تقدر:</p>' +
    '<ul>' +
    '<li>تكتب سؤال عن الدرس</li>' +
    '<li>تشارك تجربتك، نتيجة شغلك، أو فكرة خطرت ببالك</li>' +
    '<li>تقرأ أسئلة باقي الطلاب وتستفيد من ردودهم</li>' +
    '</ul>' +
    '<p>أنا راح أكون موجود وأرد على أسئلتكم، والأجوبة المفيدة بثبتها حتى تبقى مرجع دائم لكل الطلاب.</p>' +
    '<p>النقاش يتجدد كل أسبوع حتى يبقى عامر، والأسئلة المثبتة تبقى.</p>' +
    '<p>ادخل أي درس وافتح تبويب "النقاش" — أبي أسمع رأيك.</p>' +
    '<p class="sig">تحياتي،<br>ماجد</p>' +
    '</div></body></html>'
  );
}

// ─────────────────────────────────────────────
// ADMIN SET CHAT ARCHIVE CONFIG — one-shot setup for Script Properties
// Sets CHAT_ARCHIVE_SECRET + CHAT_ARCHIVE_SHEET_ID. Gated on ADMIN_TOKEN.
// Called once from a trusted shell during Phase D setup.
// ─────────────────────────────────────────────
function _admin_set_chat_archive_config(p) {
  if (String(p.admin_token || '') !== ADMIN_TOKEN) {
    return { ok: false, error: 'unauthorized' };
  }
  if (!p.secret || !p.sheet_id) {
    return { ok: false, error: 'missing_params' };
  }
  var props = PropertiesService.getScriptProperties();
  props.setProperty('CHAT_ARCHIVE_SECRET', String(p.secret));
  props.setProperty('CHAT_ARCHIVE_SHEET_ID', String(p.sheet_id));
  return { ok: true };
}

// ─────────────────────────────────────────────
// ARCHIVE CHAT MESSAGES — Apps Script proxy for the weekly-wipe flow
// Called by Supabase Edge Function (archive-to-sheet) which is triggered
// by the Postgres weekly_wipe() function at Friday 02:00 KSA.
// Writes rows to the "MA Learn — Chat Archive" sheet (id in Script Properties)
// using native SpreadsheetApp — no GCP service account needed.
// Protected by shared secret CHAT_ARCHIVE_SECRET.
// ─────────────────────────────────────────────
function _handle_admin_archive_chat_messages(p) {
  var secret = PropertiesService.getScriptProperties().getProperty('CHAT_ARCHIVE_SECRET');
  if (!secret) return { ok: false, error: 'secret_not_configured' };
  if (String(p.secret || '') !== secret) return { ok: false, error: 'unauthorized' };

  var sheetId = PropertiesService.getScriptProperties().getProperty('CHAT_ARCHIVE_SHEET_ID');
  if (!sheetId) return { ok: false, error: 'archive_sheet_id_not_configured' };

  var weekTag = String(p.weekTag || '').trim();
  if (!/^\d{4}-W\d{2}$/.test(weekTag)) return { ok: false, error: 'invalid_weekTag' };

  var rowsJson = p.rows;
  var rows;
  try { rows = JSON.parse(rowsJson); }
  catch (e) { return { ok: false, error: 'rows_invalid_json: ' + e.message }; }
  if (!Array.isArray(rows)) return { ok: false, error: 'rows_not_array' };

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(weekTag);
  var isNewTab = !sheet;
  if (isNewTab) {
    sheet = ss.insertSheet(weekTag);
    sheet.appendRow([
      'timestamp_utc','timestamp_ksa','course_id','lesson_id','lesson_title',
      'author_display_name','author_uid','is_majid','deleted_flag','body','mentions'
    ]);
  }
  if (rows.length === 0) return { ok: true, appended: 0, tab: weekTag, newTab: isNewTab };

  // Batch write for performance
  var startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, 11).setValues(rows);
  SpreadsheetApp.flush();

  return { ok: true, appended: rows.length, tab: weekTag, newTab: isNewTab };
}

// ─────────────────────────────────────────────
// MINT SUPABASE TOKEN — for MA Learn player chat (Supabase backend)
// Validates MA Learn token, looks up student email (Tokens sheet col D)
// and name (Customers sheet col C, joined on email), mints a
// Supabase-compatible HS256 JWT with { sub, role, email, app_metadata,
// user_metadata } claims. Client passes returned token to
// supabase.auth.setSession() on the malearnsa-player.
// ─────────────────────────────────────────────
function handleMintSupabaseToken_(params) {
  var token = String(params.token || '').trim();
  var course = String(params.course || '').trim();
  if (!token || !course) {
    return { ok: false, error: 'missing_params' };
  }

  var check = validateToken(token, course);
  if (!check.valid) {
    return { ok: false, error: 'invalid_token', reason: check.reason };
  }

  // Look up email from Tokens sheet (col D = index 3)
  var ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  var tokensSheet = ss.getSheetByName(TOKENS_SHEET);
  if (!tokensSheet) return { ok: false, error: 'tokens_sheet_missing' };
  var tokensData = tokensSheet.getDataRange().getValues();
  var email = '';
  for (var i = 1; i < tokensData.length; i++) {
    if (String(tokensData[i][0]).trim() === token) {
      email = String(tokensData[i][3] || '').trim().toLowerCase();
      break;
    }
  }
  if (!email) return { ok: false, error: 'email_not_found_on_token' };

  // Optional: look up displayName from Customers sheet (col B = email, col C = name)
  var displayName = null;
  var custSheet = ss.getSheetByName(CUSTOMERS_SHEET);
  if (custSheet) {
    var custData = custSheet.getDataRange().getValues();
    for (var j = 1; j < custData.length; j++) {
      if (String(custData[j][1] || '').trim().toLowerCase() === email) {
        var nameVal = String(custData[j][2] || '').trim();
        if (nameVal) displayName = nameVal;
        break;
      }
    }
  }

  var isMajid = (email === 'majid@malearnsa.com' || email === 'majed.engawi@gmail.com');

  // uid = UUID-shaped hex-split from sha256(email) — stable across sessions.
  // Supabase GoTrue rejects non-UUID JWT `sub` claims with status 400
  // "invalid claim: sub claim must be a UUID", breaking supabase.auth.setSession()
  // which internally calls /auth/v1/user. Producing a 36-char UUID-shaped string
  // satisfies the GoTrue regex and keeps uid deterministic from email.
  var shaBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email);
  var hex = shaBytes.map(function (b) {
    var v = b < 0 ? b + 256 : b;
    return (v < 16 ? '0' : '') + v.toString(16);
  }).join('').slice(0, 32);
  var uid = hex.slice(0,8) + '-' + hex.slice(8,12) + '-' + hex.slice(12,16) +
            '-' + hex.slice(16,20) + '-' + hex.slice(20,32);

  var supabaseToken = mintSupabaseToken_(uid, email, displayName, isMajid);

  return {
    ok: true,
    supabaseToken: supabaseToken,
    uid: uid,
    email: email,
    displayName: displayName,
    isMajid: isMajid
  };
}
