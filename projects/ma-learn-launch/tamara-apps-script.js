/**
 * ══════════════════════════════════════════════════════════════
 * MA Learn — Tamara Payment Gateway
 * Google Apps Script — Web App
 *
 * SETUP STEPS:
 * 1. Go to script.google.com → New Project → name it "MA Learn Tamara"
 * 2. Paste this entire file as Code.gs
 * 3. Deploy → New Deployment → Web App
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Run authorizeSheets() once to grant Sheets + Mail access
 * 5. Copy the Web App URL
 * 6. Paste into TAMARA_SCRIPT_URL in each checkout HTML file
 *
 * SWITCHING SANDBOX → PRODUCTION:
 * Change TAMARA_ENV from 'sandbox' to 'production'
 * ══════════════════════════════════════════════════════════════
 */

// ── CONFIGURATION ─────────────────────────────────────────────
const TAMARA_ENV        = 'sandbox'; // 'sandbox' | 'production'
const TAMARA_API_KEY    = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhY2NvdW50SWQiOiJmZGYxMzYzMy04M2IzLTQ2MGQtYTBiNi1kZWIzODQwMWIzMDAiLCJ0eXBlIjoibWVyY2hhbnQiLCJzYWx0IjoiOTJiNDA3ZjktMDQyOC00M2JiLWJhYjktOWQ3ZWVkOGU3MTQ4Iiwicm9sZXMiOlsiUk9MRV9NRVJDSEFOVCJdLCJpc010bHMiOmZhbHNlLCJpYXQiOjE3NzYwMDExMzYsImlzcyI6IlRhbWFyYSBQUCJ9.ce74MKhhcyncCVjtI_lqE4Bg0cGSGWck9U5hXa5ItiLMro3IrQAvh3ajN7tvRNMsygSkbceg0GWI9KgnAShijoFZVjfC11tsz_AwpYeSJ9PVCKpoHDplEaPwnXxkKkvR30qAoTCbiVhglqxKCWW47I1qzQqKeXWaMMWDRGkF_XYrmcZRZ2LI-NFVolZcTsPH1Vs4sJZefoVELj1sGm5DN_9iKBWJL2JPpekvx8QwJHPcBgKxyAKilOJXtEdcVotZSW862cLWe5egA2adkAZYmJXgDvpRmn_NNP_CWZYFx2ucoVumTmOJtfeMQLpsgToAoMoJhItVtXj92WLvdWEQ';
const SPREADSHEET_ID    = '1nkrwK-KJ7nD2kv_8zdYiLqot6RFoH-v67VpmjCzvYi0';
const NOTIFY_EMAIL      = 'info@malearnsa.com';
const SUPPORT_EMAIL     = 'support@malearnsa.com';

const TAMARA_BASE_URL = TAMARA_ENV === 'production'
  ? 'https://api.tamara.co'
  : 'https://api-sandbox.tamara.co';

// Success/cancel URLs per product
const PRODUCT_URLS = {
  'beyond-lighting': {
    success: 'https://malearnsa.com/beyond-lighting/success.html',
    cancel:  'https://malearnsa.com/beyond-lighting/checkout.html',
    failure: 'https://malearnsa.com/beyond-lighting/checkout.html',
    name:    'أبعد من إمكانيات الإضاءة',
  },
  'ciw': {
    success: 'https://malearnsa.com/ciw-waitlist/',
    cancel:  'https://malearnsa.com/ciw-waitlist/',
    failure: 'https://malearnsa.com/ciw-waitlist/',
    name:    'ورشة صناعة الإلهام',
  },
  't3-workshop': {
    success: 'https://checkout.malearnsa.com/creative-ai-workshop/success.html',
    cancel:  'https://malearnsa.com/creative-ai-workshop/',
    failure: 'https://malearnsa.com/creative-ai-workshop/',
    name:    'ورشة الذكاء الاصطناعي الإبداعي',
  },
};


// ── HELPERS ───────────────────────────────────────────────────
function getSheet(name) {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
}

function corsResponse(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

// Run once to authorize Sheets + Mail access
function authorizeSheets() {
  SpreadsheetApp.openById(SPREADSHEET_ID).getName();
  MailApp.getRemainingDailyQuota();
  Logger.log('✅ Authorization complete.');
}


// ── doGet (health check + Tamara webhook confirm) ─────────────
function doGet(e) {
  return corsResponse({ status: 'live', env: TAMARA_ENV });
}


// ── doPost (router) ───────────────────────────────────────────
function doPost(e) {
  try {
    let data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }

    const action = data.action || '';

    if (action === 'validate_coupon') return handleValidateCoupon(data);
    if (action === 'create_order')    return handleCreateOrder(data);
    if (action === 'capture_payment') return handleCapturePayment(data);

    return corsResponse({ success: false, error: 'Unknown action: ' + action });

  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    return corsResponse({ success: false, error: err.message });
  }
}


// ── COUPON VALIDATION ─────────────────────────────────────────
function handleValidateCoupon(data) {
  const code    = (data.code    || '').toUpperCase().trim();
  const amount  = parseFloat(data.amount)  || 0;
  const product = (data.product || '').toLowerCase().trim();
  const method  = 'tamara'; // always tamara when called from Tamara checkout

  const sheet  = getSheet('Coupons');
  const rows   = sheet.getDataRange().getValues();
  const header = rows[0];

  const col = (name) => header.indexOf(name);
  const C = {
    code:       col('Code'),
    type:       col('Type'),
    value:      col('Value'),
    minAmount:  col('Min Amount (SAR)'),
    usesLeft:   col('Uses Left'),
    startDate:  col('Start Date'),
    endDate:    col('End Date'),
    active:     col('Active'),
    allowedCourses:  col('Allowed Courses'),
    excludedCourses: col('Excluded Courses'),
    allowedMethods:  col('Allowed Methods'),
  };

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[C.code]) continue;
    if (row[C.code].toString().toUpperCase().trim() !== code) continue;

    // Active?
    if (!row[C.active]) return corsResponse({ success: false, error: 'الكوبون غير مفعّل' });

    // Dates
    const today = new Date();
    const start = new Date(row[C.startDate]);
    const end   = new Date(row[C.endDate]);
    end.setHours(23, 59, 59);
    if (today < start || today > end) return corsResponse({ success: false, error: 'انتهت صلاحية الكوبون' });

    // Uses left
    if (parseInt(row[C.usesLeft]) <= 0) return corsResponse({ success: false, error: 'الكوبون استُنفد' });

    // Min amount
    if (amount < parseFloat(row[C.minAmount] || 0)) return corsResponse({ success: false, error: 'المبلغ أقل من الحد الأدنى للكوبون' });

    // Allowed courses check
    const allowedCourses = (row[C.allowedCourses] || '').toString().trim();
    if (allowedCourses) {
      const allowed = allowedCourses.split(',').map(s => s.trim().toLowerCase());
      if (!allowed.includes(product)) return corsResponse({ success: false, error: 'هذا الكوبون غير صالح لهذه الدورة' });
    }

    // Excluded courses check
    const excludedCourses = (row[C.excludedCourses] || '').toString().trim();
    if (excludedCourses) {
      const excluded = excludedCourses.split(',').map(s => s.trim().toLowerCase());
      if (excluded.includes(product)) return corsResponse({ success: false, error: 'هذا الكوبون لا يُطبق على هذه الدورة' });
    }

    // Allowed methods check
    const allowedMethods = (row[C.allowedMethods] || '').toString().trim().toLowerCase();
    if (allowedMethods) {
      const methods = allowedMethods.split(',').map(s => s.trim());
      if (!methods.includes(method)) return corsResponse({ success: false, error: 'هذا الكوبون غير متاح لطريقة الدفع هذه' });
    }

    // Calculate discount
    const type       = row[C.type].toString().toLowerCase();
    const value      = parseFloat(row[C.value]);
    let discountSAR  = 0;

    if (type === 'percentage') {
      discountSAR = Math.round(amount * value / 100);
    } else {
      discountSAR = Math.min(value, amount);
    }

    const finalSAR = Math.max(0, amount - discountSAR);

    return corsResponse({
      success: true,
      code,
      type,
      value,
      discountSAR,
      finalSAR,
      rowIndex: i + 1,
    });
  }

  return corsResponse({ success: false, error: 'الكوبون غير موجود' });
}


// ── CREATE TAMARA ORDER ───────────────────────────────────────
function handleCreateOrder(data) {
  const name       = (data.name    || '').trim();
  const email      = (data.email   || '').trim();
  const phone      = (data.phone   || '').trim();
  const product    = (data.product || 'beyond-lighting').trim();
  const amountSAR  = parseFloat(data.amount) || 0;
  const couponCode = (data.coupon  || '').trim();

  const urls = PRODUCT_URLS[product] || PRODUCT_URLS['beyond-lighting'];

  // Build Tamara order payload
  const orderRef = 'MA-' + Date.now();

  const payload = {
    order_reference_id: orderRef,
    order_number:       orderRef,
    total_amount: {
      amount:   amountSAR.toFixed(2),
      currency: 'SAR',
    },
    description: urls.name,
    country_code: 'SA',
    payment_type: 'PAY_BY_INSTALMENTS',
    instalments: 3,
    locale: 'ar_SA',
    items: [
      {
        reference_id:  product,
        type:          'Digital',
        name:          urls.name,
        sku:           product,
        quantity:      1,
        unit_price:    { amount: amountSAR.toFixed(2), currency: 'SAR' },
        discount_amount: { amount: '0.00', currency: 'SAR' },
        tax_amount:    { amount: '0.00', currency: 'SAR' },
        total_amount:  { amount: amountSAR.toFixed(2), currency: 'SAR' },
      }
    ],
    consumer: {
      first_name:   name.split(' ')[0] || name,
      last_name:    name.split(' ').slice(1).join(' ') || '-',
      phone_number: '+966' + phone.replace(/^0/, '').replace(/\s/g, ''),
      email:        email,
    },
    billing_address: {
      first_name:   name.split(' ')[0] || name,
      last_name:    name.split(' ').slice(1).join(' ') || '-',
      phone_number: '+966' + phone.replace(/^0/, '').replace(/\s/g, ''),
      address_line1: 'Jeddah',
      city:         'Jeddah',
      country_code: 'SA',
    },
    shipping_address: {
      first_name:   name.split(' ')[0] || name,
      last_name:    name.split(' ').slice(1).join(' ') || '-',
      phone_number: '+966' + phone.replace(/^0/, '').replace(/\s/g, ''),
      address_line1: 'Jeddah',
      city:         'Jeddah',
      country_code: 'SA',
    },
    merchant_urls: {
      success:      urls.success + '?ref=' + orderRef + '&method=tamara',
      failure:      urls.failure + '?tamara=failed',
      cancel:       urls.cancel  + '?tamara=cancelled',
      notification: 'https://script.google.com/macros/s/REPLACE_WITH_THIS_SCRIPT_URL/exec',
    },
    tax_amount:      { amount: '0.00', currency: 'SAR' },
    shipping_amount: { amount: '0.00', currency: 'SAR' },
    discount_amount: { amount: '0.00', currency: 'SAR' },
    platform: 'Custom',
  };

  // Call Tamara API
  const response = UrlFetchApp.fetch(TAMARA_BASE_URL + '/checkout', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + TAMARA_API_KEY,
      'Content-Type':  'application/json',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  const body   = JSON.parse(response.getContentText());

  Logger.log('Tamara create order: ' + status + ' — ' + JSON.stringify(body));

  if (status !== 200 && status !== 201) {
    return corsResponse({ success: false, error: body.message || 'Tamara error ' + status });
  }

  // Log pending order to Customers sheet
  const custSheet = getSheet('Customers');
  custSheet.appendRow([
    new Date(),
    email,
    name,
    phone,
    product,
    amountSAR,
    couponCode,
    body.order_id || orderRef,
    'tamara',
  ]);

  // Decrement coupon uses if coupon was applied
  if (couponCode) decrementCoupon(couponCode);

  return corsResponse({
    success:      true,
    checkout_url: body.checkout_url,
    order_id:     body.order_id,
    order_ref:    orderRef,
  });
}


// ── CAPTURE PAYMENT (called after Tamara success redirect) ────
function handleCapturePayment(data) {
  const orderId = data.order_id || '';

  if (!orderId) return corsResponse({ success: false, error: 'No order_id' });

  const response = UrlFetchApp.fetch(TAMARA_BASE_URL + '/payments/capture', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + TAMARA_API_KEY,
      'Content-Type':  'application/json',
    },
    payload: JSON.stringify({ order_id: orderId }),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  const body   = JSON.parse(response.getContentText());

  Logger.log('Tamara capture: ' + status + ' — ' + JSON.stringify(body));

  if (status !== 200 && status !== 201) {
    return corsResponse({ success: false, error: body.message || 'Capture error ' + status });
  }

  // Send confirmation email — fetch customer info from sheet
  try {
    const custSheet = getSheet('Customers');
    const rows = custSheet.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (rows[i][7] === orderId || rows[i][7].toString().includes(orderId)) {
        const email   = rows[i][1];
        const name    = rows[i][2];
        const product = rows[i][4];
        const amount  = rows[i][5];
        sendNotification(name, email, rows[i][3], product, amount, 'tamara');
        sendConfirmation(name, email, product, amount);
        break;
      }
    }
  } catch (err) {
    Logger.log('Email error after capture: ' + err.message);
  }

  return corsResponse({ success: true, capture: body });
}


// ── DECREMENT COUPON ──────────────────────────────────────────
function decrementCoupon(code) {
  const sheet  = getSheet('Coupons');
  const rows   = sheet.getDataRange().getValues();
  const header = rows[0];
  const codeCol  = header.indexOf('Code');
  const usesCol  = header.indexOf('Uses Left');

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][codeCol].toString().toUpperCase().trim() === code.toUpperCase().trim()) {
      const current = parseInt(rows[i][usesCol]) || 0;
      sheet.getRange(i + 1, usesCol + 1).setValue(Math.max(0, current - 1));
      break;
    }
  }
}


// ── NOTIFICATION EMAIL (to Majid) ─────────────────────────────
function sendNotification(name, email, phone, product, amount, method) {
  const timestamp = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'dd/MM/yyyy — hh:mm a');
  const productName = (PRODUCT_URLS[product] || {}).name || product;

  MailApp.sendEmail({
    to:       NOTIFY_EMAIL,
    subject:  '💜 دفع جديد عبر تمارا — ' + productName,
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
            <td style="padding:10px 0;color:#888;">الدورة</td>
            <td style="padding:10px 0;color:#111;">${productName}</td>
          </tr>
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:10px 0;color:#888;">المبلغ</td>
            <td style="padding:10px 0;font-weight:bold;color:#111;">${amount} ر.س</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#888;">طريقة الدفع</td>
            <td style="padding:10px 0;color:#9600f1;font-weight:bold;">تمارا (تقسيط)</td>
          </tr>
        </table>
      </div>
    `,
  });
}


// ── CONFIRMATION EMAIL (to customer) ─────────────────────────
function sendConfirmation(name, email, product, amount) {
  const productName = (PRODUCT_URLS[product] || {}).name || product;

  MailApp.sendEmail({
    to:      email,
    subject: 'تم تأكيد طلبك — ' + productName + ' ✓',
    name:    'MA Learn',
    replyTo: SUPPORT_EMAIL,
    htmlBody: `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<body style="margin:0;padding:0;background:#f4f1eb;font-family:Arial,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1eb;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0a0a0a;border-radius:2px;overflow:hidden;">
        <tr><td style="background:#9600f1;padding:4px 0;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:36px 40px 0;text-align:center;">
          <p style="margin:0;font-size:11px;letter-spacing:0.2em;color:#C9A84C;text-transform:uppercase;">MA LEARN</p>
        </td></tr>
        <tr><td style="padding:28px 40px 36px;">
          <p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#F5F0E8;">السلام عليكم ${name}،</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#F5F0E8;">
            تم تأكيد طلبك لـ <strong style="color:#C9A84C;">${productName}</strong> بنجاح.
          </p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#BBBBBB;">
            المبلغ الإجمالي: <strong style="color:#C9A84C;">${amount} ر.س</strong> — مقسّط على ٣ دفعات عبر تمارا.
          </p>
          <p style="margin:0 0 32px;font-size:15px;line-height:1.8;color:#BBBBBB;">
            سنتواصل معك خلال ٢٤ ساعة بتفاصيل الوصول للدورة.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td style="border-top:1px solid #1e1e1e;font-size:0;">&nbsp;</td></tr>
          </table>
          <p style="margin:0 0 6px;font-size:13px;color:#666666;">أي سؤال؟ راسلنا على:</p>
          <p style="margin:0 0 32px;font-size:13px;">
            <a href="mailto:${SUPPORT_EMAIL}" style="color:#C9A84C;text-decoration:none;">${SUPPORT_EMAIL}</a>
          </p>
          <p style="margin:0;font-size:15px;color:#F5F0E8;line-height:1.8;">— ماجد<br>
            <span style="color:#666;font-size:13px;">MA Learn</span>
          </p>
        </td></tr>
        <tr><td style="padding:20px 40px;border-top:1px solid #141414;text-align:center;">
          <p style="margin:0;font-size:11px;color:#444;">© 2026 MA Learn · جميع الحقوق محفوظة</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}
