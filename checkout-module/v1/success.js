/* ═══════════════════════════════════════════════════════════════════
 * MA Learn Checkout Module — Success Page Handler v1
 *
 * Handles the post-payment success page state for all 4 methods:
 * Moyasar, Tamara, PayPal (all show success on paid),
 * Bank Transfer (shows pending IBAN/reference card).
 *
 * Usage:
 *   <script src="https://malearnsa.com/checkout-module/v1/success.js"></script>
 *   <script>
 *     MaSuccess.init({
 *       productId:     'beyond-lighting',
 *       productNameAr: 'دورة أبعد من إمكانيات الإضاءة'
 *     });
 *   </script>
 *
 * Required HTML elements (most are optional — module skips silently if missing):
 *   #processing       (shown while loading; hidden when state determined)
 *   #success-view     (paid state — Moyasar/Tamara/PayPal)
 *   #failed-view      (failed/canceled state)
 *   #bank-view        (bank-pending state with IBAN slots:
 *                      #bank-amount, #bank-name-val, #bank-account-name,
 *                      #bank-iban, #bank-swift, #bank-account-number,
 *                      #bank-address, #bank-ref)
 * ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const DEFAULT_CONFIG = {
    appsScriptUrl: 'https://script.google.com/macros/s/AKfycbznjcsYu8gLDZqFJGededAQaATad_L8vlhRQV04pOqh57HB5nFVRy9zUHAcg6goyj8DKA/exec',
    fbq: true
  };

  let cfg = {};
  let storageKey = '';

  function init(userConfig) {
    cfg = Object.assign({}, DEFAULT_CONFIG, userConfig);
    if (!cfg.productId) throw new Error('MaSuccess.init: productId required');
    storageKey = cfg.productId + '_purchase';
    handle_();
  }

  function show_(id) {
    const e = document.getElementById(id);
    if (e) e.style.display = 'block';
  }
  function hide_(id) {
    const e = document.getElementById(id);
    if (e) e.style.display = 'none';
  }
  function setText_(id, txt) {
    const e = document.getElementById(id);
    if (e) e.textContent = txt;
  }
  function fbqPurchase_(amount, contentName) {
    if (!cfg.fbq || !window.fbq) return;
    fbq('track', 'Purchase', {
      value: parseFloat(amount) || 0,
      currency: 'SAR',
      content_name: contentName || cfg.productNameAr || cfg.productId
    });
  }

  function copyVal_(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    navigator.clipboard.writeText(el.textContent.trim()).catch(() => {});
  }

  async function handle_() {
    let purchaseData = {};
    try { purchaseData = JSON.parse(localStorage.getItem(storageKey) || '{}'); }
    catch (_) {}

    const params  = new URLSearchParams(window.location.search);
    const status  = params.get('status');
    const paymentMethod = params.get('payment_method') || purchaseData.payment_method || 'moyasar';

    // ── PAYPAL return ─────────────────────────────────────────
    // Capture already ran server-side. Show success.
    if (paymentMethod === 'paypal') {
      if (status === 'failed' || status === 'canceled') {
        hide_('processing'); show_('failed-view');
        return;
      }
      localStorage.removeItem(storageKey);
      fbqPurchase_(purchaseData.amount, cfg.productNameAr);
      hide_('processing'); show_('success-view');
      return;
    }

    // ── BANK TRANSFER pending ────────────────────────────────
    if (paymentMethod === 'bank') {
      setText_('bank-amount',          purchaseData.amount || '—');
      setText_('bank-name-val',        purchaseData.bank_name_ar    || 'مصرف الإنماء');
      setText_('bank-account-name',    purchaseData.account_name_ar || 'ماجد زكي عنقاوي التصوير الفوتوغرافي');
      setText_('bank-iban',            purchaseData.iban            || 'SA3805000068207281538000');
      setText_('bank-swift',           purchaseData.swift           || 'INMASARI');
      setText_('bank-account-number',  purchaseData.account_number  || '68207281538000');
      setText_('bank-address',         purchaseData.address_ar      || 'عبد الرحمن بخش 3581، حي طيبة 7923، 23833 جدة، المملكة العربية السعودية');
      setText_('bank-ref',             purchaseData.reference       || params.get('reference') || '—');

      if (cfg.fbq && window.fbq) {
        fbq('track', 'InitiateCheckout', {
          value: parseFloat(purchaseData.amount) || 0,
          currency: 'SAR',
          content_name: (cfg.productNameAr || cfg.productId) + ' - تحويل بنكي'
        });
      }
      hide_('processing'); show_('bank-view');
      return;
    }

    // ── TAMARA return ────────────────────────────────────────
    if (paymentMethod === 'tamara') {
      if (status === 'failed' || status === 'canceled') {
        hide_('processing'); show_('failed-view');
        return;
      }
      localStorage.removeItem(storageKey);
      fbqPurchase_(purchaseData.amount, cfg.productNameAr);
      hide_('processing'); show_('success-view');
      return;
    }

    // ── MOYASAR return ───────────────────────────────────────
    const paymentId = params.get('id') || params.get('payment_id') || '';
    if (status === 'failed' || status === 'canceled') {
      hide_('processing'); show_('failed-view');
      return;
    }

    try {
      const url = `${cfg.appsScriptUrl}?action=complete_purchase`
        + `&product=${encodeURIComponent(cfg.productId)}`
        + `&name=${encodeURIComponent(purchaseData.name || '')}`
        + `&email=${encodeURIComponent(purchaseData.email || '')}`
        + `&phone=${encodeURIComponent(purchaseData.phone || '')}`
        + `&amount=${encodeURIComponent(purchaseData.amount || '')}`
        + `&coupon=${encodeURIComponent(purchaseData.coupon || '')}`
        + `&payment_id=${encodeURIComponent(paymentId)}`;
      await fetch(url);
    } catch (_) { /* non-blocking — webhook is the backup */ }

    localStorage.removeItem(storageKey);
    fbqPurchase_(purchaseData.amount, cfg.productNameAr);
    hide_('processing'); show_('success-view');
  }

  window.MaSuccess = {
    init: init,
    copyVal: copyVal_   // expose for inline onclick="MaSuccess.copyVal('bank-iban')"
  };
})();
