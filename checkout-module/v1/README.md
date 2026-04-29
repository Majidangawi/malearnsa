# MA Learn Checkout Module — v1

Plug-and-play 4-method payment flow for any MA Learn product. Powers Moyasar (mada/Visa/Mastercard/Apple Pay), Bank Transfer (Bank Al-Inmaa), Tamara (BNPL), and PayPal (international, USD via 3.75 SAR peg).

Reference implementation: `https://malearnsa.com/beyond-lighting/checkout.html`

## Files

- `payments.css` — shared styles for all payment buttons + form fields + step transitions
- `payments.js` — `MaCheckout.init({...})` — wires up all 4 methods on a checkout page
- `success.js` — `MaSuccess.init({...})` — handles all post-payment states on a success page

## Adding a new product checkout

Each product checkout becomes a thin HTML shell. Required structure:

```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <!-- Your page-level meta + theme variables (--gold, --bg, --ivory, etc.) -->
  <link rel="stylesheet" href="https://malearnsa.com/checkout-module/v1/payments.css">
  <script src="https://cdn.moyasar.com/mpf/1.14.0/moyasar.css"></script>
  <script src="https://cdn.moyasar.com/mpf/1.14.0/moyasar.js"></script>
</head>
<body>

  <!-- Your branding header / hero -->

  <!-- STEP 1: Contact + Coupon -->
  <div class="card" id="step-contact">
    <div class="co-section-title"><span class="co-step-badge">١</span>بياناتك</div>

    <div class="co-field">
      <label class="co-label" for="name">الاسم الكامل</label>
      <input id="name" class="co-input" type="text" autocomplete="name">
    </div>
    <div class="co-field">
      <label class="co-label" for="email">البريد الإلكتروني</label>
      <input id="email" class="co-input" type="email" dir="ltr" autocomplete="email">
    </div>
    <div class="co-field">
      <label class="co-label" for="phone">رقم الجوال</label>
      <input id="phone" class="co-input" type="tel" dir="ltr" autocomplete="tel">
    </div>

    <div style="margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,0.05);">
      <label class="co-label">كود خصم (اختياري)</label>
      <div class="co-coupon-row">
        <input id="coupon-input" class="co-input" type="text" placeholder="MABL20" dir="ltr">
        <button id="coupon-btn" class="co-coupon-btn">تطبيق</button>
      </div>
      <p id="coupon-msg" style="display:none;font-size:0.8rem;margin-top:8px;"></p>
    </div>

    <!-- Module fills this with the configured methods -->
    <div id="ma-payment-methods" style="margin-top:20px;"></div>
  </div>

  <!-- STEP 2: Card payment (hidden by default; shown after Continue) -->
  <div class="card" id="step-payment" style="display:none;">
    <div class="co-section-title">
      <span style="display:flex;align-items:center;gap:10px;"><span class="co-step-badge">٢</span>الدفع بالبطاقة</span>
      <button id="edit-contact-btn" type="button">تعديل</button>
    </div>
    <div style="margin-bottom:18px;">
      <div><span>الاسم:</span> <span id="sum-name"></span></div>
      <div dir="ltr"><span>البريد:</span> <span id="sum-email"></span></div>
      <div dir="ltr"><span>الجوال:</span> <span id="sum-phone"></span></div>
      <div id="sum-coupon-row" style="display:none;"><span id="sum-coupon"></span></div>
    </div>
    <div id="moyasar-form" class="mysr-form"></div>
  </div>

  <script>
    MaCheckout.init({
      productId:     'beyond-lighting',
      productNameAr: 'دورة أبعد من إمكانيات الإضاءة',
      basePrice:     650,
      successUrl:    'https://malearnsa.com/beyond-lighting/success.html',
      methods:       ['moyasar', 'bank', 'tamara', 'paypal']
    });
  </script>
  <script src="https://malearnsa.com/checkout-module/v1/payments.js"></script>
</body>
</html>
```

## Adding a new product success page

```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <!-- Your page meta -->
  <link rel="stylesheet" href="https://malearnsa.com/checkout-module/v1/payments.css">
</head>
<body>
  <!-- Your branding header -->

  <div id="processing">جاري تأكيد طلبك...</div>

  <!-- Paid state (Moyasar / Tamara / PayPal) -->
  <div id="success-view" style="display:none;">
    <h1>مرحباً بك في الدورة</h1>
    <p>وصلك رابط الدورة على إيميلك.</p>
  </div>

  <!-- Bank-pending state -->
  <div id="bank-view" style="display:none;">
    <h1>طلبك مستلم - حول المبلغ على الحساب التالي</h1>
    <!-- IDs to populate (module fills these): -->
    <div>المبلغ: <span id="bank-amount"></span> SAR</div>
    <div>اسم الحساب: <span id="bank-account-name"></span></div>
    <div>البنك: <span id="bank-name-val"></span></div>
    <div dir="ltr">IBAN: <span id="bank-iban"></span> <button onclick="MaSuccess.copyVal('bank-iban')">نسخ</button></div>
    <div dir="ltr">SWIFT: <span id="bank-swift"></span></div>
    <div dir="ltr">رقم الحساب: <span id="bank-account-number"></span></div>
    <div>العنوان: <span id="bank-address"></span></div>
    <div>المرجع: <span id="bank-ref"></span></div>
  </div>

  <!-- Failed state -->
  <div id="failed-view" style="display:none;">
    <h1>لم يتم إتمام الدفع</h1>
    <a href="javascript:history.back()">حاول مرة ثانية</a>
  </div>

  <script>
    MaSuccess.init({
      productId:     'beyond-lighting',
      productNameAr: 'دورة أبعد من إمكانيات الإضاءة'
    });
  </script>
  <script src="https://malearnsa.com/checkout-module/v1/success.js"></script>
</body>
</html>
```

## Apps Script side

The canonical script at `AKfycbznjcsYu8gLDZqFJGededAQaATad_L8vlhRQV04pOqh57HB5nFVRy9zUHAcg6goyj8DKA` already handles all 4 methods. To add a new product:

1. In `Code.js`, add the product slug + Daftra ID:
   ```
   const NEWPRODUCT_PRODUCT          = 'new-product-slug';
   const NEWPRODUCT_DAFTRA_PRODUCT_ID = 42;   // create in Daftra first
   const NEWPRODUCT_ORIGINAL_PRICE    = 999;  // SAR
   ```
2. Add a `completeNewProductPurchase(params)` function (mirror `completeBLPurchase`).
3. Add a route in `completePurchase()`:
   ```
   if (product === NEWPRODUCT_PRODUCT) return completeNewProductPurchase(params);
   ```
4. Add the product display name in `_bankProductDisplay_()`, `tamaraCreateOrder()` productNames map, and `paypalCreateOrder()` productNames map.
5. `clasp push --force && clasp deploy --deploymentId AKfycbznjcsYu8g... --description "vNN - add {product}"`

## Versioning

URL paths are versioned (`/v1/`, `/v2/`, etc.) so breaking changes can ship without breaking deployed checkouts. Bump the version when changing the public API.

## Notes

- All emails, subjects, body content: PLAIN TEXT only. No emojis, no decorative unicode. iOS Mail renders them as `??????` in Arabic.
- Moyasar.js v1.14 has no working re-init API — coupon-after-proceed flow uses `sessionStorage` + `window.location.reload()`.
- Tamara webhook URL is per-order via `merchant_url.notification` — no global portal config required.
- PayPal does not support SAR. Module charges USD at 3.75:1 peg; SAR amount stored in custom_id and used for Customers/Daftra records.
