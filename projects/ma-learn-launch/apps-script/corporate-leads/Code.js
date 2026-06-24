/**
 * ══════════════════════════════════════════════════════════════
 * MA Learn — CIW C3 Corporate Bundle Lead Capture
 * Google Apps Script — Web App (standalone)
 *
 * Captures corporate-bundle registration leads from the form at
 * checkout.malearnsa.com/corporate/ into the dedicated
 * "CIW C3 Corporate Leads" spreadsheet. Deliberately ISOLATED from
 * the live waitlist project (ciw-waitlist) — that project owns
 * fragile externally-managed status columns and must not be touched
 * for this. New product → new endpoint → new sheet.
 *
 * Target spreadsheet: 1UgHUOY8AlzQVtcguVoUMdivMDkATDVn2tuT-puLOl5Y
 * Sheet tab:          'Sheet1'
 *
 * Column layout (1-indexed):
 *   A: Timestamp | B: Contact Name | C: Position | D: Email
 *   E: Company Name | F: Employees | G: Per-Person Rate (SAR)
 *   H: Total (SAR) | I: Savings vs 1299 (SAR) | J: Source
 *   K: User Agent | L: Status
 *
 * Pricing (server-side authoritative — never trust the client):
 *   1 person      → 1,299 SAR/person
 *   2 or more     → 1,040 SAR/person (20% off)
 *
 * Money-pipeline rule honored: every failure path returns a JSON
 * error AND emails NOTIFY_EMAIL. The form never silent-fails.
 * ══════════════════════════════════════════════════════════════
 */

// ── CONFIGURATION ─────────────────────────────────────────────
const SPREADSHEET_ID = '1UgHUOY8AlzQVtcguVoUMdivMDkATDVn2tuT-puLOl5Y';
const SHEET_NAME     = 'Sheet1';
const NOTIFY_EMAIL   = 'info@malearnsa.com,majed.engawi@gmail.com';
const SUPPORT_EMAIL  = 'support@malearnsa.com';

const STANDARD_RATE = 1299; // 1 person
const TEAM_RATE     = 1040; // 2+ people (20% off)

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Server-authoritative price math. Mirrors the form calculator exactly. */
function computePricing(employees) {
  var n = Math.max(1, parseInt(employees, 10) || 1);
  var rate = (n >= 2) ? TEAM_RATE : STANDARD_RATE;
  var total = rate * n;
  var savings = (n >= 2) ? (STANDARD_RATE - TEAM_RATE) * n : 0;
  return { count: n, rate: rate, total: total, savings: savings };
}

// ── doPost ────────────────────────────────────────────────────
function doPost(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (_) {
        data = e.parameter || {};
      }
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    return appendCorporateLead(data);

  } catch (err) {
    // Money-pipeline rule: never silent-fail. Alert + return error.
    try {
      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        subject: 'CORPORATE LEAD CAPTURE FAILED - check logs',
        body: 'A corporate-bundle form submission failed before it was written.\n\n'
            + 'Error: ' + err.message + '\n\n'
            + 'Raw payload: ' + (e && e.postData ? e.postData.contents : '(none)')
      });
    } catch (_) {}
    Logger.log('doPost error: ' + err.message);
    return jsonResponse({ success: false, error: err.message });
  }
}

// ── APPEND LEAD ───────────────────────────────────────────────
function appendCorporateLead(data) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();

  var name     = String(data.name     || '').trim();
  var position = String(data.position || '').trim();
  var email    = String(data.email    || '').trim();
  var company  = String(data.company  || '').trim();
  var employees = data.employees;
  var source   = String(data.source || 'corporate-bundle-form').trim();
  var ua       = String(data.user_agent || '').trim();

  // Minimal validation — required B2B fields.
  if (!name || !email || !company) {
    return jsonResponse({ success: false, error: 'missing_required_fields' });
  }

  var pricing = computePricing(employees);

  // ── Verify-before-write: append, then read the row back. ──
  sheet.appendRow([
    new Date(), name, position, email, company,
    pricing.count, pricing.rate, pricing.total, pricing.savings,
    source, ua, 'NEW'
  ]);

  var lastRow = sheet.getLastRow();
  var written = sheet.getRange(lastRow, 1, 1, 12).getValues()[0];

  // Read-back check — the email written must match what we sent.
  if (String(written[3]).trim() !== email) {
    // Write did not land as expected — alert and report failure.
    try {
      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        subject: 'CORPORATE LEAD WRITE MISMATCH - manual check',
        body: 'A corporate lead row was appended but read-back did not match.\n\n'
            + 'Expected email: ' + email + '\n'
            + 'Read-back row: ' + JSON.stringify(written)
      });
    } catch (_) {}
    return jsonResponse({ success: false, error: 'write_verify_failed' });
  }

  // Stripe alt rows for readability.
  if (lastRow % 2 === 0) {
    sheet.getRange(lastRow, 1, 1, 12).setBackground('#f9f6ef');
  }

  // Notify Majid.
  try { sendNotification(name, position, email, company, pricing); } catch (_) {}

  return jsonResponse({
    success: true,
    row: lastRow,
    rate: pricing.rate,
    total: pricing.total,
    savings: pricing.savings
  });
}

// ── NOTIFICATION (to Majid) ──────────────────────────────────
function sendNotification(name, position, email, company, pricing) {
  var ts = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'dd/MM/yyyy - hh:mm a');
  var teamLine = pricing.count >= 2
    ? pricing.count + ' seats x ' + pricing.rate + ' = ' + pricing.total + ' SAR (saved ' + pricing.savings + ' SAR)'
    : '1 seat x ' + pricing.rate + ' = ' + pricing.total + ' SAR (standard rate)';

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: 'New corporate team registration - ' + company,
    htmlBody:
      '<div style="font-family:Arial,sans-serif;padding:24px;max-width:480px;">' +
        '<p style="font-size:13px;color:#888;margin-bottom:16px;">' + ts + '</p>' +
        '<table style="width:100%;border-collapse:collapse;font-size:14px;">' +
          '<tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#888;width:120px;">Company</td><td style="padding:10px 0;font-weight:bold;color:#111;">' + company + '</td></tr>' +
          '<tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#888;">Contact</td><td style="padding:10px 0;color:#111;">' + name + (position ? ' (' + position + ')' : '') + '</td></tr>' +
          '<tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#888;">Email</td><td style="padding:10px 0;color:#111;">' + email + '</td></tr>' +
          '<tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#888;">Team size</td><td style="padding:10px 0;color:#111;">' + pricing.count + '</td></tr>' +
        '</table>' +
        '<div style="margin-top:20px;padding:12px 16px;background:#fffbf0;border-left:3px solid #C9A84C;">' +
          '<p style="margin:0;font-size:14px;color:#111;font-weight:bold;">' + teamLine + '</p>' +
        '</div>' +
        '<p style="margin-top:16px;font-size:13px;color:#555;">Bank transfer (SAR) - confirm receipt in Bank Al-Inmaa, then onboard the team.</p>' +
      '</div>',
  });
}

// ── doGet (health check) ──────────────────────────────────────
function doGet(e) {
  return jsonResponse({
    status: 'live',
    service: 'CIW C3 Corporate Bundle Lead Capture',
    sheet: SHEET_NAME,
    columns: 12,
    pricing: { one: STANDARD_RATE, teamOf2plus: TEAM_RATE },
    schema: 'A:Timestamp|B:Name|C:Position|D:Email|E:Company|F:Employees|G:Rate|H:Total|I:Savings|J:Source|K:UA|L:Status'
  });
}
