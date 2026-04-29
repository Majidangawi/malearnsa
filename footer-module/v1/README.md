# MA Learn Footer Module — v1

Plug-and-play shared footer for any MA Learn page. Adapted from the React+Motion+Tailwind reference design to plain HTML/CSS so it drops into any static page without a build step.

## Includes

- MA Learn logo + brand tagline + copyright
- Four sections: روابط (links), قانوني (legal), الدفع (payment logos), تابعنا (social)
- Six payment logos: mada, Visa, Mastercard, Apple Pay, PayPal, Tamara
- Tamara shows "قريباً" badge while disabled (matches checkout behavior)
- Two government license cards: Freelance work doc + SCBC license
- Support email + phone in the brand column
- Blur-fade-up animation on scroll-in (via IntersectionObserver, no Motion library)
- Respects `prefers-reduced-motion`
- RTL Arabic-first, gold/ivory dark theme, rounded top corners, radial top glow

## Usage

In any page `<head>`:

```html
<link rel="stylesheet" href="https://malearnsa.com/footer-module/v1/footer.css">
```

Where the footer should appear:

```html
<div id="ma-footer"></div>
<script src="https://malearnsa.com/footer-module/v1/footer.js"></script>
```

That's it. Auto-renders on `DOMContentLoaded`.

## Optional config

Override defaults inline before the script tag:

```html
<script>
  window.MaFooterConfig = {
    logoSrc:      'https://malearnsa.com/MA Learn white-08.png',
    tagline:      'صناعة الإلهام',
    supportEmail: 'support@malearnsa.com',
    supportPhone: '+966 560 440 113',
    instagramUrl: 'https://instagram.com/majidangawi',
    homeUrl:      'https://malearnsa.com',
    coursesUrl:   'https://malearnsa.com/#courses',
    aboutUrl:     'https://malearnsa.com/#about-me',
    refundUrl:    'https://malearnsa.com/refund-policy.html',
    privacyUrl:   'https://malearnsa.com/privacy-policy.html'
  };
</script>
```

Defaults are sensible for every MA Learn page so most won't need a config block at all.

## Versioning

URL is `/v1/`. Breaking changes ship at `/v2/` so deployed pages don't break.

## When Tamara prod creds land

The "قريباً" badge on the Tamara payment logo is a CSS class `.pay-soon` on the wrapping div. To remove it: edit `footer.js`, change the last `<div class="pay-item pay-soon">` to `<div class="pay-item">`. One-line revert.
