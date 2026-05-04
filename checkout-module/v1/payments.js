/* ═══════════════════════════════════════════════════════════════════
 * MA Learn Checkout Module — v1
 *
 * Plug-and-play 4-method payment flow: Moyasar (cards), Bank Transfer,
 * Tamara (BNPL), PayPal (international, USD via 3.75 SAR peg).
 *
 * Usage in a product checkout HTML:
 *   <link rel="stylesheet" href="https://malearnsa.com/checkout-module/v1/payments.css">
 *   <script src="https://malearnsa.com/checkout-module/v1/payments.js"></script>
 *   <script>
 *     MaCheckout.init({
 *       productId:     'beyond-lighting',
 *       productNameAr: 'دورة أبعد من إمكانيات الإضاءة',
 *       basePrice:     650,                      // SAR
 *       successUrl:    'https://malearnsa.com/beyond-lighting/success.html',
 *       methods:       ['moyasar', 'bank', 'tamara', 'paypal']
 *     });
 *   </script>
 *
 * Required HTML elements (the module wires up by id):
 *   #name, #email, #phone, #coupon-input, #coupon-btn, #coupon-msg
 *   #step-contact (visible by default), #step-payment (display:none)
 *   #ma-payment-methods (empty container — module fills it with the buttons)
 *   #moyasar-form (the Moyasar mount point inside #step-payment)
 *   #sum-name, #sum-email, #sum-phone, #sum-coupon-row, #sum-coupon (summary slots)
 *   #total-price, #toggle-total, #original-price, #discount-row, #discount-amount,
 *     #summary-coupon (coupon side-panel updates — optional, only if present)
 * ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ──────────────────────────────────────────────────────────────────
  // FEATURE FLAGS
  // ──────────────────────────────────────────────────────────────────
  // Tamara: production live since 2026-05-02. Flip to false to disable
  // the button across all 4 product checkouts in one move.
  const TAMARA_ENABLED = true;

  const DEFAULT_CONFIG = {
    appsScriptUrl: 'https://script.google.com/macros/s/AKfycbznjcsYu8gLDZqFJGededAQaATad_L8vlhRQV04pOqh57HB5nFVRy9zUHAcg6goyj8DKA/exec',
    moyasarKey:    'pk_live_ciyD54kvT4b6bWev3RNzEjzLXpJPC8DmnbgcW47H',
    paypalClientId: 'AV8VULQBjiVHzR2slAgRKnGVw3H_gf8AxUTq6tN6rqvlRglS4vP8m0EyXkdRMe3LH_FCQBrbEMqKbSyS',
    sarToUsd:      3.75,
    methods:       ['moyasar', 'bank', 'tamara', 'paypal'],
    fbq:           true   // fire FB Pixel events if window.fbq exists
  };

  let cfg = {};
  let appliedCoupon = null;
  let baseAmountHalalas = 0; // SAR * 100, computed from cfg.basePrice
  let storageKey = '';       // ${productId}_purchase

  // ────────────────────────────────────────────────────────
  // INIT
  // ────────────────────────────────────────────────────────
  function init(userConfig) {
    cfg = Object.assign({}, DEFAULT_CONFIG, userConfig);
    if (!cfg.productId)     throw new Error('MaCheckout.init: productId required');
    if (!cfg.basePrice)     throw new Error('MaCheckout.init: basePrice required (SAR)');
    if (!cfg.successUrl)    throw new Error('MaCheckout.init: successUrl required');
    baseAmountHalalas = Math.round(cfg.basePrice * 100);
    storageKey = cfg.productId + '_purchase';

    renderPaymentMethods_();
    wireCouponInput_();
    restoreFormState_();
    bindCouponButton_();
    bindEditButton_();
    bindProceedButton_();

    // Clear stale localStorage on initial page load (not on edit-reload restoration)
    if (!sessionStorage.getItem(storageKey + '_form_state')) {
      try { localStorage.removeItem(storageKey); } catch (_) {}
    }

    if (cfg.methods.indexOf('paypal') !== -1) {
      ensurePaypalSdk_(function () {
        updatePaypalUsdLabel_();
        renderPaypalButtons_();
      });
    }
  }

  // ────────────────────────────────────────────────────────
  // METHOD RENDERING
  // ────────────────────────────────────────────────────────
  function renderPaymentMethods_() {
    const root = document.getElementById('ma-payment-methods');
    if (!root) return;
    let html = '';
    if (cfg.methods.indexOf('moyasar') !== -1) html += moyasarHtml_();
    if (cfg.methods.indexOf('bank')    !== -1) html += '<div class="co-or-divider">أو</div>' + bankHtml_();
    if (cfg.methods.indexOf('tamara')  !== -1) html += '<div class="co-or-divider">أو</div>' + tamaraHtml_();
    if (cfg.methods.indexOf('paypal')  !== -1) html += '<div class="co-or-divider">للدفع الدولي</div>' + paypalHtml_();
    root.innerHTML = html;
  }

  function moyasarHtml_() {
    return [
      '<p class="co-secure-note">',
      '  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      '  دفع آمن عبر Moyasar - mada · Visa · Mastercard · Apple Pay',
      '</p>',
      '<button id="proceed-btn" class="co-proceed-btn" onclick="MaCheckout.proceedToPayment()">',
      '  الدفع بالبطاقة',
      '  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
      '</button>'
    ].join('\n');
  }

  function bankHtml_() {
    return [
      '<button id="bank-btn" class="co-bank-btn" onclick="MaCheckout.proceedWithBankTransfer()">',
      '  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/></svg>',
      '  تحويل بنكي',
      '  <span class="co-bank-btn-divider"></span>',
      '  <span class="co-bank-badge">مصرف الإنماء · يومين عمل</span>',
      '</button>',
      '<p id="bank-msg" style="display:none;"></p>'
    ].join('\n');
  }

  function tamaraHtml_() {
    const tamaraLogo = [
      '<svg style="height:22px;width:auto" viewBox="0 0 1353.7 686.7" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
      '  <path fill="#fff" d="M185.1,252h37.3c1.2,0,2.2,1,2.2,2.2v200.6c0,1.2-1,2.2-2.2,2.2h-37.3c-1.2,0-2.2-1-2.2-2.2v-200.6c0-1.2,1-2.2,2.2-2.2Z"/>',
      '  <path fill="#fff" d="M344.3,319.8h-37.3c-1.2,0-2.2,1-2.2,2.2v120.7c0,13.9-12.1,25.6-25.9,25.6h-29.8c-1.6,0-2.6,1.6-2.1,3l14,37.2c.3.9,1.2,1.4,2.1,1.4h16.2c37.1,0,67.2-30,67.2-67.2v-120.8c0-1.2-1-2.2-2.2-2.2Z"/>',
      '  <path fill="#fff" d="M1120.5,284.5c18.4.3,33.5-14.7,33.1-33.1-.3-17.4-14.5-31.6-31.9-31.9-18.4-.3-33.5,14.7-33.1,33.1.3,17.4,14.5,31.6,31.9,31.9Z"/>',
      '  <path fill="#fff" d="M1059.2,283.2c.3.3.8.4,1.2.2,12.9-4.5,22-16.9,21.7-31.3-.4-17.4-14.8-31.5-32.2-31.6-15.9,0-29.1,11.3-31.9,26.3,0,.4,0,.8.4,1.1l40.9,35.3Z"/>',
      '  <path fill="#fff" d="M1168.5,317.3h-242.5c-37.2,1.9-66.9,32.8-66.9,70.5s1.8,18.1,5.1,26.2h-375.1c-45.4-3.6-60.1-20.7-60.1-61.6v-98.2c0-1.2-1-2.2-2.2-2.2h-39.8c-1.2,0-2.2,1-2.2,2.2v91.6c0,81.2,33.2,112.5,123.9,112.5h426.4l-.4-.3c36.6-2.5,65.6-33.1,65.6-70.3s-1.8-18-5-26h173.5c1.2,0,2.2-1,2.2-2.2v-40c0-1.2-1-2.2-2.2-2.2ZM929.2,416.5c-15.6,0-28.4-13.2-28.4-28.9s12.8-28.6,28.4-28.6,29.2,12.9,29.2,28.6-13.6,28.9-29.2,28.9Z"/>',
      '</svg>'
    ].join('\n');

    if (!TAMARA_ENABLED) {
      // Disabled state — visible so customers know it's coming, no click handler
      return [
        '<button id="tamara-btn" class="co-tamara-btn" disabled aria-disabled="true" style="opacity:0.55;cursor:not-allowed;filter:grayscale(0.3);">',
        tamaraLogo,
        '  <span class="co-tamara-divider-line"></span>',
        '  <span class="co-tamara-badge">قريباً</span>',
        '</button>'
      ].join('\n');
    }

    return [
      '<button id="tamara-btn" class="co-tamara-btn" onclick="MaCheckout.proceedWithTamara()">',
      tamaraLogo,
      '  <span class="co-tamara-divider-line"></span>',
      '  <span class="co-tamara-badge">٣ أقساط · بدون فوائد</span>',
      '</button>',
      '<p id="tamara-msg" style="display:none;"></p>'
    ].join('\n');
  }

  function paypalHtml_() {
    return [
      '<div class="co-paypal-wrap">',
      '  <div class="co-paypal-label">PayPal · <span class="usd" id="paypal-usd-label">—</span> USD</div>',
      '  <div id="paypal-button-container"></div>',
      '  <p id="paypal-msg" style="display:none;"></p>',
      '</div>'
    ].join('\n');
  }

  // ────────────────────────────────────────────────────────
  // INPUT VALIDATION + COMMON HELPERS
  // ────────────────────────────────────────────────────────
  function getBuyer_(requirePhone) {
    const name  = (document.getElementById('name').value || '').trim();
    const email = (document.getElementById('email').value || '').trim();
    const phone = (document.getElementById('phone').value || '').trim();
    if (!name || !email || (requirePhone && !phone)) {
      const el = !name ? document.getElementById('name')
               : !email ? document.getElementById('email')
               : document.getElementById('phone');
      el.style.borderColor = 'rgba(231,76,60,0.8)';
      el.focus();
      setTimeout(() => el.style.borderColor = 'rgba(201,168,76,0.2)', 2500);
      return null;
    }
    return { name, email, phone };
  }

  function finalAmountHalalas_() {
    return appliedCoupon ? appliedCoupon.finalAmount : baseAmountHalalas;
  }

  function couponCode_() { return appliedCoupon ? appliedCoupon.code : ''; }

  function flashError_(msgEl, text) {
    msgEl.style.display = 'block';
    msgEl.textContent = text;
  }

  // ────────────────────────────────────────────────────────
  // COUPON
  // ────────────────────────────────────────────────────────
  function bindCouponButton_() {
    const btn = document.getElementById('coupon-btn');
    if (btn) btn.onclick = applyCoupon;
  }
  function wireCouponInput_() {
    const ci = document.getElementById('coupon-input');
    if (ci) ci.addEventListener('input', () => { ci.value = ci.value.toUpperCase(); });
  }

  async function applyCoupon() {
    const codeEl = document.getElementById('coupon-input');
    const code = codeEl ? codeEl.value.trim() : '';
    if (!code) return;
    const btn = document.getElementById('coupon-btn');
    const msg = document.getElementById('coupon-msg');
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    try {
      const url = `${cfg.appsScriptUrl}?action=validate_coupon&code=${encodeURIComponent(code)}&amount=${baseAmountHalalas}`;
      const res = await fetch(url);
      const data = await res.json();
      if (msg) msg.style.display = 'block';

      if (data.valid) {
        appliedCoupon = {
          code,
          discountHalalas: data.discountHalalas,
          finalAmount:     data.finalAmount,
          isFree:          data.isFree,
          message:         data.message
        };
        if (msg) {
          msg.style.color = '#4caf82';
          msg.textContent = data.isFree ? 'وصول مجاني' : data.message;
        }
        // Optional summary panel updates
        const dRow = document.getElementById('discount-row');
        if (dRow) dRow.style.display = 'flex';
        const dAmt = document.getElementById('discount-amount');
        if (dAmt) dAmt.textContent = `-${data.discountSAR} ر.س`;
        const totalLabel = data.isFree ? 'مجاني' : `${data.finalSAR} ر.س`;
        const tp = document.getElementById('total-price');
        if (tp) tp.textContent = totalLabel;
        const tt = document.getElementById('toggle-total');
        if (tt) tt.textContent = totalLabel;
        const sc = document.getElementById('summary-coupon');
        if (sc) { sc.style.display = 'block'; sc.textContent = `كود الخصم "${code}" مفعّل`; }
        if (btn) btn.textContent = 'مفعّل';
        if (codeEl) codeEl.disabled = true;
        updatePaypalUsdLabel_();
      } else {
        appliedCoupon = null;
        if (msg) {
          msg.style.color = '#e74c3c';
          msg.textContent = data.message || 'كود الخصم غير صحيح';
        }
        if (btn) { btn.disabled = false; btn.textContent = 'تطبيق'; }
      }
    } catch (err) {
      if (msg) {
        msg.style.display = 'block';
        msg.style.color = '#e74c3c';
        msg.textContent = 'خطأ في التحقق من الكود - حاول مرة ثانية';
      }
      if (btn) { btn.disabled = false; btn.textContent = 'تطبيق'; }
    }
  }

  // ────────────────────────────────────────────────────────
  // STEP TOGGLE — contact ↔ payment (full-card swap, CIW pattern)
  // ────────────────────────────────────────────────────────
  function fillSummary_(buyer, coupon) {
    const set = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
    set('sum-name',  buyer.name);
    set('sum-email', buyer.email);
    set('sum-phone', buyer.phone || '—');
    const row = document.getElementById('sum-coupon-row');
    if (coupon) {
      if (row) row.style.display = 'block';
      set('sum-coupon', 'كود الخصم: ' + coupon);
    } else if (row) {
      row.style.display = 'none';
    }
  }

  function bindEditButton_() {
    const btn = document.getElementById('edit-contact-btn');
    if (btn) btn.onclick = editContact;
  }
  function bindProceedButton_() {
    // already bound via inline onclick in moyasarHtml_
  }

  function editContact() {
    // Page-reload approach: Moyasar.js v1.14 has no working re-init API,
    // calling init() twice ignores the new amount even after innerHTML=''.
    // sessionStorage preserves form state across reload.
    const buyer = {
      name:  document.getElementById('name').value.trim(),
      email: document.getElementById('email').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      coupon: couponCode_()
    };
    sessionStorage.setItem(storageKey + '_form_state', JSON.stringify(buyer));
    window.location.reload();
  }

  function restoreFormState_() {
    const raw = sessionStorage.getItem(storageKey + '_form_state');
    if (!raw) return;
    sessionStorage.removeItem(storageKey + '_form_state');
    let s; try { s = JSON.parse(raw); } catch (_) { return; }
    if (s.name)  document.getElementById('name').value  = s.name;
    if (s.email) document.getElementById('email').value = s.email;
    if (s.phone) document.getElementById('phone').value = s.phone;
    if (s.coupon) {
      const ci = document.getElementById('coupon-input');
      if (ci) {
        ci.value = s.coupon;
        setTimeout(() => applyCoupon(), 0);
      }
    }
  }

  // ────────────────────────────────────────────────────────
  // MOYASAR (cards, mada, Apple Pay)
  // ────────────────────────────────────────────────────────
  async function proceedToPayment() {
    const buyer = getBuyer_(false);
    if (!buyer) return;
    const finalAmount = finalAmountHalalas_();
    const coupon = couponCode_();

    localStorage.setItem(storageKey, JSON.stringify({
      name:    buyer.name,
      email:   buyer.email,
      phone:   buyer.phone,
      product: cfg.productId,
      coupon,
      amount: (finalAmount / 100).toFixed(2)
    }));

    // FREE flow — skip Moyasar (it rejects 0)
    if (finalAmount === 0) {
      const btn = document.getElementById('proceed-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'جارٍ تفعيل الوصول...'; }
      try {
        const freeId = 'FREE-' + Date.now();
        const params = new URLSearchParams({
          action:     'complete_purchase',
          name:       buyer.name,
          email:      buyer.email,
          phone:      buyer.phone,
          product:    cfg.productId,
          amount:     '0',
          coupon:     coupon,
          payment_id: freeId
        });
        await fetch(`${cfg.appsScriptUrl}?${params.toString()}`);
        window.location.href = cfg.successUrl + '?status=paid&id=' + freeId + '&message=free';
      } catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = 'الدفع بالبطاقة'; }
        alert('حدث خطأ - حاول مرة ثانية');
      }
      return;
    }

    // Toggle to payment step
    fillSummary_(buyer, coupon);
    document.getElementById('step-contact').style.display = 'none';
    document.getElementById('step-payment').style.display = 'block';

    const formEl = document.getElementById('moyasar-form');
    const description = (cfg.productNameAr || cfg.productId) + ' - MA Learn';
    Moyasar.init({
      element:              formEl,
      amount:               finalAmount,
      currency:             'SAR',
      description:          description,
      publishable_api_key:  cfg.moyasarKey,
      callback_url:         cfg.successUrl,
      methods:              ['creditcard', 'applepay'],
      apple_pay: {
        country:                'SA',
        label:                  cfg.productNameAr || 'MA Learn',
        validate_merchant_url:  'https://api.moyasar.com/v1/applepay/initiate'
      },
      on_initiating: () => {
        // Refresh localStorage in case user changed fields after clicking proceed
        localStorage.setItem(storageKey, JSON.stringify({
          name:    document.getElementById('name').value.trim(),
          email:   document.getElementById('email').value.trim(),
          phone:   document.getElementById('phone').value.trim(),
          product: cfg.productId,
          coupon,
          amount:  (finalAmount / 100).toFixed(2)
        }));
        // Moyasar v1.14.0 throws "Invalid handler result undefined" if the
        // handler returns nothing. Return true to signal "proceed with defaults".
        return true;
      }
    });

    document.getElementById('step-payment').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ────────────────────────────────────────────────────────
  // BANK TRANSFER
  // ────────────────────────────────────────────────────────
  async function proceedWithBankTransfer() {
    const buyer = getBuyer_(true);
    if (!buyer) return;
    const btn = document.getElementById('bank-btn');
    const msg = document.getElementById('bank-msg');
    const finalAmount = finalAmountHalalas_();
    const coupon = couponCode_();
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'جارٍ تسجيل طلبك...';
    if (msg) msg.style.display = 'none';

    try {
      const res = await fetch(cfg.appsScriptUrl + '?action=bank_transfer_initiate', {
        method: 'POST',
        body: JSON.stringify({
          action:  'bank_transfer_initiate',
          name:    buyer.name,
          email:   buyer.email,
          phone:   buyer.phone,
          product: cfg.productId,
          amount:  finalAmount / 100,
          coupon
        })
      });
      const data = await res.json();
      if (data.success && data.reference) {
        localStorage.setItem(storageKey, JSON.stringify({
          name:    buyer.name,
          email:   buyer.email,
          phone:   buyer.phone,
          product: cfg.productId,
          coupon,
          amount: (finalAmount / 100).toFixed(2),
          payment_method:  'bank',
          reference:       data.reference,
          iban:            data.iban,
          account_number:  data.account_number,
          swift:           data.swift,
          bank_name_ar:    data.bank_name_ar,
          bank_name_en:    data.bank_name_en,
          account_name_ar: data.account_name_ar,
          account_name_en: data.account_name_en,
          address_ar:      data.address_ar,
          address_en:      data.address_en,
          sla_days:        data.sla_days
        }));
        window.location.href = cfg.successUrl + '?status=bank-pending&payment_method=bank&reference=' + encodeURIComponent(data.reference);
      } else {
        flashError_(msg, data.error || 'تعذر تسجيل الطلب. حاول مرة ثانية.');
        btn.disabled = false;
        btn.innerHTML = originalHTML;
      }
    } catch (e) {
      flashError_(msg, 'تعذّر الاتصال - تحقق من الإنترنت وحاول مرة ثانية.');
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  }

  // ────────────────────────────────────────────────────────
  // TAMARA
  // ────────────────────────────────────────────────────────
  async function proceedWithTamara() {
    const buyer = getBuyer_(true);
    if (!buyer) return;
    const btn = document.getElementById('tamara-btn');
    const msg = document.getElementById('tamara-msg');
    const finalAmount = finalAmountHalalas_();
    const coupon = couponCode_();
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'جارٍ الاتصال بتمارا...';
    if (msg) msg.style.display = 'none';

    try {
      const res = await fetch(cfg.appsScriptUrl + '?action=tamara_create_order', {
        method: 'POST',
        body: JSON.stringify({
          action:  'tamara_create_order',
          name:    buyer.name,
          email:   buyer.email,
          phone:   buyer.phone,
          product: cfg.productId,
          amount:  finalAmount / 100,
          coupon
        })
      });
      const rawText = await res.text();
      console.log('[Tamara] HTTP', res.status, 'response:', rawText.slice(0, 500));
      let data; try { data = JSON.parse(rawText); }
      catch (e) {
        flashError_(msg, 'استجابة غير متوقعة من الخادم.');
        btn.disabled = false; btn.innerHTML = originalHTML;
        return;
      }

      if (data.success && data.checkout_url) {
        localStorage.setItem(storageKey, JSON.stringify({
          name:    buyer.name,
          email:   buyer.email,
          phone:   buyer.phone,
          product: cfg.productId,
          coupon,
          amount: (finalAmount / 100).toFixed(2),
          payment_method: 'tamara',
          tamara_order_id: data.order_id || ''
        }));
        window.location.href = data.checkout_url;
      } else {
        flashError_(msg, data.error || 'تعذر إنشاء طلب الدفع. حاول مرة ثانية.');
        btn.disabled = false; btn.innerHTML = originalHTML;
      }
    } catch (e) {
      flashError_(msg, 'تعذّر الاتصال - تحقق من الإنترنت وحاول مرة ثانية.');
      btn.disabled = false; btn.innerHTML = originalHTML;
    }
  }

  // ────────────────────────────────────────────────────────
  // PAYPAL (Smart Buttons SDK + USD conversion)
  // ────────────────────────────────────────────────────────
  function ensurePaypalSdk_(cb) {
    if (window.paypal_sdk || window.paypal) { cb(); return; }
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.paypalClientId)}&currency=USD&intent=capture&components=buttons`;
    s.setAttribute('data-namespace', 'paypal_sdk');
    s.onload = cb;
    s.onerror = () => console.error('[PayPal] SDK load failed');
    document.head.appendChild(s);
  }

  function updatePaypalUsdLabel_() {
    const el = document.getElementById('paypal-usd-label');
    if (!el) return;
    const usd = (finalAmountHalalas_() / 100 / cfg.sarToUsd).toFixed(2);
    el.textContent = '$' + usd;
  }

  function renderPaypalButtons_() {
    const ns = window.paypal_sdk || window.paypal;
    if (!ns || !ns.Buttons) return;
    ns.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal', height: 44 },
      createOrder: function () {
        const buyer = getBuyer_(false);
        if (!buyer) throw new Error('missing buyer info');
        const finalAmount = finalAmountHalalas_();
        const coupon = couponCode_();
        localStorage.setItem(storageKey, JSON.stringify({
          name:    buyer.name,
          email:   buyer.email,
          phone:   buyer.phone,
          product: cfg.productId,
          coupon,
          amount: (finalAmount / 100).toFixed(2),
          payment_method: 'paypal'
        }));
        return fetch(cfg.appsScriptUrl + '?action=paypal_create_order', {
          method: 'POST',
          body: JSON.stringify({
            action:  'paypal_create_order',
            name:    buyer.name,
            email:   buyer.email,
            phone:   buyer.phone,
            product: cfg.productId,
            amount:  finalAmount / 100,
            coupon
          })
        })
          .then(r => r.text())
          .then(t => { console.log('[PayPal] create:', t.slice(0, 300)); return JSON.parse(t); })
          .then(data => {
            if (data.success && data.order_id) return data.order_id;
            throw new Error(data.error || 'paypal_create_failed');
          });
      },
      onApprove: function (data) {
        const msg = document.getElementById('paypal-msg');
        return fetch(cfg.appsScriptUrl + '?action=paypal_capture_order', {
          method: 'POST',
          body: JSON.stringify({ action: 'paypal_capture_order', order_id: data.orderID })
        })
          .then(r => r.text())
          .then(t => { console.log('[PayPal] capture:', t.slice(0, 300)); return JSON.parse(t); })
          .then(captured => {
            if (captured.success) {
              window.location.href = cfg.successUrl + '?status=paid&payment_method=paypal&order_id=' + encodeURIComponent(data.orderID);
            } else {
              flashError_(msg, captured.error || 'تعذر إتمام الدفع - حاول مرة ثانية');
            }
          })
          .catch(err => flashError_(msg, 'خطأ في إتمام الدفع: ' + (err.message || 'unknown')));
      },
      onError: function (err) {
        const msg = document.getElementById('paypal-msg');
        flashError_(msg, 'حدث خطأ مع PayPal - جرب مرة ثانية أو اختر طريقة دفع أخرى');
        console.error('[PayPal] onError:', err);
      },
      onCancel: function () {
        const msg = document.getElementById('paypal-msg');
        flashError_(msg, 'تم إلغاء الدفع - يمكنك المحاولة مرة ثانية');
      }
    }).render('#paypal-button-container');
  }

  // ────────────────────────────────────────────────────────
  // PUBLIC API
  // ────────────────────────────────────────────────────────
  window.MaCheckout = {
    init: init,
    applyCoupon: applyCoupon,
    proceedToPayment: proceedToPayment,
    editContact: editContact,
    proceedWithBankTransfer: proceedWithBankTransfer,
    proceedWithTamara: proceedWithTamara,
    // Internal — exposed for debugging
    _state: () => ({ cfg, appliedCoupon, baseAmountHalalas, storageKey })
  };
})();
