/* ═══════════════════════════════════════════════════════════════════
 * MA Learn Footer Module — v1
 * Renders the shared footer into <div id="ma-footer"></div>.
 *
 * Usage on any page:
 *   <link rel="stylesheet" href="https://malearnsa.com/footer-module/v1/footer.css">
 *   ...
 *   <div id="ma-footer"></div>
 *   <script src="https://malearnsa.com/footer-module/v1/footer.js"></script>
 *
 * Optional config (inline before script tag):
 *   <script>window.MaFooterConfig = { logoSrc: '/MA Learn white-08.png' };</script>
 *
 * Defaults assume logo lives at site root. Override `logoSrc` for nested
 * pages where relative paths matter (or always use absolute https URL).
 * ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const cfg = Object.assign({
    logoSrc:        'https://malearnsa.com/MA Learn white-08.png',
    tagline:        'صناعة الإلهام',
    supportEmail:   'support@malearnsa.com',
    supportPhone:   '+966 560 440 113',
    instagramUrl:   'https://instagram.com/majidangawi',
    homeUrl:        'https://malearnsa.com',
    coursesUrl:     'https://malearnsa.com/#courses',
    aboutUrl:       'https://malearnsa.com/#about-me',
    refundUrl:      'https://malearnsa.com/refund-policy.html',
    privacyUrl:     'https://malearnsa.com/privacy-policy.html'
  }, window.MaFooterConfig || {});

  // ── Payment logos (extracted from existing inline footer SVGs) ───
  const paymentLogos = {
    mada: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="24" viewBox="0 0 64 36"><rect width="64" height="36" rx="4" fill="white"/><rect x="6" y="6" width="17" height="10" rx="1" fill="#29ABE2"/><rect x="6" y="20" width="17" height="10" rx="1" fill="#78BE20"/><text x="42" y="23" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="11" font-weight="900" fill="#222">mada</text></svg>',
    visa: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="24" viewBox="0 0 54 36"><rect width="54" height="36" rx="4" fill="#1A1F71"/><text x="27" y="25" text-anchor="middle" font-family="Arial,sans-serif" font-size="17" font-weight="700" font-style="italic" fill="white">VISA</text></svg>',
    mastercard: '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="24" viewBox="0 0 58 36"><circle cx="20" cy="16" r="11" fill="#EB001B"/><circle cx="38" cy="16" r="11" fill="#F79E1B"/><path d="M29,9.68 A11,11 0 0,1 29,22.32 A11,11 0 0,0 29,9.68Z" fill="#FF5F00"/></svg>',
    applePay: '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="24" viewBox="0 0 74 36"><rect width="74" height="36" rx="4" fill="#111111"/><rect width="74" height="36" rx="4" fill="none" stroke="#383838" stroke-width="1"/><text x="37" y="22" text-anchor="middle" font-family="Helvetica Neue,Helvetica,Arial,sans-serif" font-size="12" font-weight="300" fill="white" letter-spacing="-0.2">Apple Pay</text></svg>',
    paypal: '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="24" viewBox="0 0 100 32"><rect width="100" height="32" rx="4" fill="#003087"/><text x="50" y="21" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="13" font-weight="700" fill="#FFC439" letter-spacing="-0.3">Pay<tspan fill="white">Pal</tspan></text></svg>',
    tamara: '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="24" viewBox="0 0 1353.7 686.7" preserveAspectRatio="xMidYMid meet"><rect x="0" y="0" width="1353.7" height="686.7" rx="60" fill="#4A3AFF"/><path fill="#fff" d="M185.1,252h37.3c1.2,0,2.2,1,2.2,2.2v200.6c0,1.2-1,2.2-2.2,2.2h-37.3c-1.2,0-2.2-1-2.2-2.2v-200.6c0-1.2,1-2.2,2.2-2.2Z"/><path fill="#fff" d="M344.3,319.8h-37.3c-1.2,0-2.2,1-2.2,2.2v120.7c0,13.9-12.1,25.6-25.9,25.6h-29.8c-1.6,0-2.6,1.6-2.1,3l14,37.2c.3.9,1.2,1.4,2.1,1.4h16.2c37.1,0,67.2-30,67.2-67.2v-120.8c0-1.2-1-2.2-2.2-2.2Z"/><path fill="#fff" d="M1120.5,284.5c18.4.3,33.5-14.7,33.1-33.1-.3-17.4-14.5-31.6-31.9-31.9-18.4-.3-33.5,14.7-33.1,33.1.3,17.4,14.5,31.6,31.9,31.9Z"/><path fill="#fff" d="M1059.2,283.2c.3.3.8.4,1.2.2,12.9-4.5,22-16.9,21.7-31.3-.4-17.4-14.8-31.5-32.2-31.6-15.9,0-29.1,11.3-31.9,26.3,0,.4,0,.8.4,1.1l40.9,35.3Z"/><path fill="#fff" d="M1168.5,317.3h-242.5c-37.2,1.9-66.9,32.8-66.9,70.5s1.8,18.1,5.1,26.2h-375.1c-45.4-3.6-60.1-20.7-60.1-61.6v-98.2c0-1.2-1-2.2-2.2-2.2h-39.8c-1.2,0-2.2,1-2.2,2.2v91.6c0,81.2,33.2,112.5,123.9,112.5h426.4l-.4-.3c36.6-2.5,65.6-33.1,65.6-70.3s-1.8-18-5-26h173.5c1.2,0,2.2-1,2.2-2.2v-40c0-1.2-1-2.2-2.2-2.2ZM929.2,416.5c-15.6,0-28.4-13.2-28.4-28.9s12.8-28.6,28.4-28.6,29.2,12.9,29.2,28.6-13.6,28.9-29.2,28.9Z"/></svg>'
  };

  const instagramSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>';
  const mailSvg      = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>';

  function render() {
    const root = document.getElementById('ma-footer');
    if (!root) return;
    const year = new Date().getFullYear();

    root.innerHTML = `
<footer class="ma-footer">
  <div class="ma-footer-blur"></div>

  <!-- Top row: 5 equal columns on desktop -->
  <div class="ma-footer-top">

    <!-- Brand column (compact) -->
    <div class="ma-footer-col ma-footer-brand ma-footer-anim">
      <img class="ma-footer-logo" src="${cfg.logoSrc}" alt="MA Learn" onerror="this.style.display='none'">
      <p class="tagline">${cfg.tagline}</p>
      <p class="pitch">منصة تعليم إبداعية تساعدك تعيش من إبداعك.</p>
    </div>

    <!-- Links -->
    <div class="ma-footer-col ma-footer-anim">
      <h3>روابط</h3>
      <ul>
        <li><a href="${cfg.homeUrl}">الرئيسية</a></li>
        <li><a href="${cfg.coursesUrl}">الدورات</a></li>
        <li><a href="${cfg.aboutUrl}">عن ماجد</a></li>
        <li><a href="mailto:${cfg.supportEmail}">${mailSvg}<span>تواصل معنا</span></a></li>
      </ul>
    </div>

    <!-- Legal -->
    <div class="ma-footer-col ma-footer-anim">
      <h3>قانوني</h3>
      <ul>
        <li><a href="${cfg.refundUrl}">سياسة الاسترجاع</a></li>
        <li><a href="${cfg.privacyUrl}">سياسة الخصوصية</a></li>
      </ul>
    </div>

    <!-- Payments -->
    <div class="ma-footer-col ma-footer-anim">
      <h3>الدفع</h3>
      <div class="ma-footer-payments">
        <div class="pay-item">${paymentLogos.mada}</div>
        <div class="pay-item">${paymentLogos.visa}</div>
        <div class="pay-item">${paymentLogos.mastercard}</div>
        <div class="pay-item">${paymentLogos.applePay}</div>
        <div class="pay-item">${paymentLogos.paypal}</div>
        <div class="pay-item pay-soon">${paymentLogos.tamara}</div>
      </div>
    </div>

    <!-- Social -->
    <div class="ma-footer-col ma-footer-anim">
      <h3>تابعنا</h3>
      <ul>
        <li><a href="${cfg.instagramUrl}" target="_blank" rel="noopener">${instagramSvg}<span>Instagram</span></a></li>
      </ul>
    </div>

  </div>

  <!-- Trust row: government licenses -->
  <div class="ma-footer-trust ma-footer-anim">
    <a class="ma-footer-license-card" href="https://malearnsa.com/brand_assets/Freelance-certificate-2026.pdf" target="_blank" rel="noopener">
      <img src="https://malearnsa.com/brand_assets/Freelance.jpg" alt="وثيقة العمل الحر">
      <div class="info">
        <p class="label">رقم الوثيقة</p>
        <p class="number">FL-163949047</p>
      </div>
    </a>
    <a class="ma-footer-license-card" href="https://malearnsa.com/brand_assets/SCBC-Certificate-2026.pdf" target="_blank" rel="noopener">
      <img src="https://malearnsa.com/brand_assets/SCBC.png" alt="SCBC">
      <div class="info">
        <p class="label">رقم الترخيص</p>
        <p class="number">0000276647</p>
      </div>
    </a>
  </div>

  <!-- Bottom strip: copyright + contact -->
  <div class="ma-footer-bottom">
    <span>© ${year} MA Learn — جميع الحقوق محفوظة</span>
    <span class="sep">·</span>
    <a href="mailto:${cfg.supportEmail}">${cfg.supportEmail}</a>
    <span class="sep">·</span>
    <a class="phone" href="tel:${cfg.supportPhone.replace(/\s+/g,'')}" dir="ltr">${cfg.supportPhone}</a>
    <span class="sep">·</span>
    <span>تم تطوير الموقع بكل عناية في المملكة العربية السعودية</span>
  </div>

</footer>
    `;

    // Scroll-in animation: blur-fade-up via IntersectionObserver
    if ('IntersectionObserver' in window) {
      const els = root.querySelectorAll('.ma-footer-anim');
      const obs = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('in-view');
            obs.unobserve(e.target);
          }
        });
      }, { threshold: 0.1 });
      els.forEach(el => obs.observe(el));
    } else {
      // Fallback — show immediately
      root.querySelectorAll('.ma-footer-anim').forEach(el => el.classList.add('in-view'));
    }
  }

  // Auto-init on DOMContentLoaded; also expose manual init for late-rendered pages
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
  window.MaFooter = { render: render };
})();
