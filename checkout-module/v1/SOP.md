# Payment Gateway SOP — Canonical Configuration

**Status:** Verified working 2026-05-05 (workshop C2 launch).
**Stack:** Moyasar v1.14.0 + shared `payments.js` module v1.

This is the production-tested Moyasar config for card + Apple Pay
checkouts on `checkout.malearnsa.com`. Adding a new product checkout?
Mirror this exactly.

## The 11 non-negotiable rules

1. **Subdomain only** — checkouts live on `checkout.malearnsa.com`, never apex.
2. **No `X-Frame-Options` meta tag** — Apple Pay iframe sandbox check fails.
3. **No `X-Content-Type-Options` meta tag** — same.
4. **No `referrer-policy` meta tag** — same.
5. **`supported_networks: ['mada', 'visa', 'mastercard']` at top level of `Moyasar.init`** — required.
6. **`supported_networks` ALSO inside `apple_pay` block** — required. Both places.
7. **`label: 'MA Learn'`** — Latin chars only. Arabic productNameAr in label dismisses Apple Pay sheet.
8. **`metadata: { email, phone, coupon }`** — required. Used for merchant-side reconciliation.
9. **Description format:** `${productNameAr} — MA Learn (${priceSAR} ر.س)` — matches C1 working pattern.
10. **No `on_initiating` callback** — Apple Pay flow chokes on it. Persist data BEFORE `Moyasar.init` instead.
11. **Apple Pay domain registered** in Moyasar dashboard → Apple Pay - Domains → `checkout.malearnsa.com` (bare hostname).

## Adding a new product checkout

1. `cp ~/code/intro-to-ai-checkout/beyond-lighting/checkout.html ~/code/intro-to-ai-checkout/<slug>/checkout.html`
2. Update `MaCheckoutConfig`: `productId`, `productNameAr`, `basePrice`, `cohort` (if applicable), `successUrl`.
3. Update logo wrapper + nav `الدورة` back-link → `https://malearnsa.com/<slug>/`.
4. Copy `success.html` likewise. Update `MaSuccess.init({...})`.
5. Apps Script: add product per `checkout-module/v1/README.md` step-by-step.
6. Test all 5 methods (card + Apple Pay + Tamara + PayPal + bank) before marking launch-ready.
7. **Never modify `payments.js` for product-specific behavior.** Add config fields. The module is canonical.

## Why
Multi-hour debug 2026-05-04 → 2026-05-05 traced through "Invalid handler result undefined", "sheet pops + dismisses", and other failure modes. Root causes were always one or more of the 11 rules above. Diffing against C1's `t3-checkout.html` (legacy, in `malearnsa/projects/ma-learn-launch/`) revealed each missing piece.

The shared `payments.js` module now embeds all these rules — copying the BL or workshop checkout shells gives a working flow with zero adjustments needed.
