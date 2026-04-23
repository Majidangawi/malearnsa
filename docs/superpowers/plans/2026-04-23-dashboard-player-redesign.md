# Editorial Atelier Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the MA Learn admin dashboard + BL/ITCAI student players under one cohesive "Editorial Atelier" design system (dark-OLED base, gold as editorial ink, Cairo typography, Lucide icons, pinned right rail).

**Architecture:** Vanilla ES modules, no build step. Single `tokens.css` drives color/spacing/motion tokens across both repos. Component primitives (button, input, toggle, card, table, modal, tabs, tag, avatar, toast, empty-state, skeleton, dropdown) live in `frontend/public/css/primitives/` and render under `data-ui` attributes so per-page CSS never restyles them. Shell chrome (sidebar, topbar, right rail) moves into its own module so pages only render into the content slot.

**Tech Stack:** Vanilla JS (ES modules) · CSS with OKLCH colors + container queries · Cairo via Google Fonts · Lucide inlined SVG · Fastify backend (unchanged for data, extended with one `/api/data/activity` endpoint) · GitHub Pages for static deploys, DigitalOcean droplet for the Fastify backend.

**Spec:** `docs/superpowers/specs/2026-04-23-dashboard-player-redesign-design.md`
**Backup:** `archives/redesign-2026-04-23/` — git tags `pre-redesign-2026-04-23` on three repos.

---

## Phase 1 — Foundation (invisible)

Lays down tokens, fonts, icons, and component primitives. Existing pages keep rendering unchanged until Phase 2 rewires them. No visible change expected at the end of Phase 1.

### Task 1: Single canonical `tokens.css`

**Files:**
- Create: `frontend/public/css/tokens.css`
- Modify: `frontend/public/app.html` (link it first)
- Modify: `frontend/public/index.html` (link it)

- [ ] **Step 1: Create `tokens.css`**

File: `~/code/ma-learn-dashboard/frontend/public/css/tokens.css`

```css
/* ==========================================================================
   MA Learn Editorial Atelier — canonical tokens
   Single source of truth. All pages + primitives consume these vars.
   Never redeclared at page scope.
   ========================================================================== */

:root {
  /* Brand — gold as editorial ink */
  --c-gold:          oklch(0.74 0.12 82);
  --c-gold-bright:   oklch(0.82 0.13 85);
  --c-gold-dim:      oklch(0.58 0.09 82);
  --c-gold-faint:    oklch(0.74 0.12 82 / 0.10);

  /* Surfaces — neutrals pulled slightly toward gold hue at very low chroma */
  --c-ink-0:         oklch(0.08 0.003 82);
  --c-ink-1:         oklch(0.11 0.004 82);
  --c-ink-2:         oklch(0.14 0.005 82);
  --c-ink-3:         oklch(0.18 0.006 82);
  --c-ink-4:         oklch(0.23 0.006 82);
  --c-ink-5:         oklch(0.30 0.007 82);

  /* Text */
  --c-fg:            oklch(0.96 0.006 82);
  --c-fg-2:          oklch(0.80 0.008 82);
  --c-fg-3:          oklch(0.62 0.009 82);
  --c-fg-4:          oklch(0.48 0.008 82);

  /* Semantic — muted to harmonize with gold */
  --c-success:       oklch(0.74 0.11 150);
  --c-success-bg:    oklch(0.74 0.11 150 / 0.14);
  --c-warning:       oklch(0.77 0.12 78);
  --c-warning-bg:    oklch(0.77 0.12 78 / 0.16);
  --c-danger:        oklch(0.68 0.14 28);
  --c-danger-bg:     oklch(0.68 0.14 28 / 0.16);

  /* Spacing — 8pt baseline */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px;
  --s-5: 24px; --s-6: 32px; --s-7: 48px; --s-8: 64px;
  --s-page-x: clamp(16px, 3vw, 40px);

  /* Radius */
  --r-xs: 4px;  --r-sm: 6px;  --r-md: 10px;
  --r-lg: 14px; --r-xl: 20px; --r-pill: 9999px;

  /* Elevation */
  --e-card:   0 1px 2px rgba(0,0,0,0.4), 0 0 0 1px oklch(0.25 0.006 82 / 0.5);
  --e-raised: 0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px oklch(0.30 0.007 82 / 0.6);
  --e-modal:  0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px oklch(0.35 0.008 82 / 0.7);
  --e-focus:  0 0 0 2px oklch(0.74 0.12 82 / 0.35);

  /* Motion */
  --dur-fast: 150ms; --dur-med: 220ms; --dur-slow: 320ms;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in:  cubic-bezier(0.64, 0, 0.78, 0);

  /* Typography — Cairo used editorially */
  --font-sans: 'Cairo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;

  --fs-display-xl: clamp(48px, 6vw, 72px);
  --fs-display-l:  clamp(32px, 4vw, 48px);
  --fs-h1:         clamp(24px, 3vw, 32px);
  --fs-h2:         20px;
  --fs-h3:         16px;
  --fs-body:       16px;
  --fs-body-sm:    14px;
  --fs-label:      12px;
  --fs-mono:       13px;
}

/* Reduced motion: collapse non-essential durations (fades keep working) */
@media (prefers-reduced-motion: reduce) {
  :root { --dur-fast: 1ms; --dur-med: 1ms; --dur-slow: 1ms; }
}

/* Base reset — minimal, honors the tokens */
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--c-ink-0);
  color: var(--c-fg);
  font-family: var(--font-sans);
  font-size: var(--fs-body);
  line-height: 1.6;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
h1, h2, h3, h4, h5, h6 { margin: 0; font-weight: 700; line-height: 1.2; }
button, input, select, textarea { font: inherit; color: inherit; }
a { color: var(--c-gold-bright); text-decoration: none; }
a:hover { text-decoration: underline; text-decoration-color: var(--c-gold); text-underline-offset: 3px; }

/* Tabular numerals helper */
.tnum { font-variant-numeric: tabular-nums; }

/* Gold editorial hairline — used as section dividers */
.gold-rule { border: 0; border-top: 0.5px solid var(--c-gold-dim); opacity: 0.6; }
```

- [ ] **Step 2: Load tokens first in both `app.html` and `index.html`**

In `frontend/public/app.html`, find the first `<link rel="stylesheet">` and replace the existing block with:

```html
<link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="assets/style.css">
<link rel="stylesheet" href="css/composer.css">
<link rel="stylesheet" href="css/contacts.css">
<link rel="stylesheet" href="css/lessons.css">
```

(tokens.css first — others override only what they need.)

Same change in `frontend/public/index.html` (add tokens.css as the first stylesheet link).

- [ ] **Step 3: Link Cairo with full weight range**

Replace the existing Cairo link in both HTML files with:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@200;400;500;700;900&display=swap" rel="stylesheet">
```

- [ ] **Step 4: Smoke test**

```bash
cd ~/code/ma-learn-dashboard && python3 -m http.server 5555 --directory frontend/public &
```

Open `http://localhost:5555/app.html`. Expected: page still renders, body bg is now warm dark (not pure black), default text is slightly less bright — it should feel unchanged in structure but subtly warmer. Kill server with `kill %1`.

- [ ] **Step 5: Commit**

```bash
cd ~/code/ma-learn-dashboard
git add frontend/public/css/tokens.css frontend/public/app.html frontend/public/index.html
git commit -m "feat(tokens): canonical Editorial Atelier tokens + Cairo 200-900"
```

---

### Task 2: Lucide icon helper

**Files:**
- Create: `frontend/public/js/ui/icons.js`
- Create: `frontend/public/js/ui/icons/index.js` (inlined SVG registry)

- [ ] **Step 1: Create the registry**

Cherry-pick only the icons we use (keeps bundle tiny — ~40 icons total). Download from https://lucide.dev and inline as JS strings.

File: `frontend/public/js/ui/icons/index.js`

```javascript
// Lucide icons, 1.5px stroke, rounded line-caps.
// Only icons we actively use — add more here as the UI grows.
// Source: https://lucide.dev (ISC license)

export const ICONS = {
  'home':           '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  'activity':       '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  'mail':           '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  'megaphone':      '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  'book-open':      '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  'link':           '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  'users':          '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'ticket':         '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
  'settings':       '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2"/><circle cx="12" cy="12" r="3"/>',
  'search':         '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'bell':           '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  'refresh-cw':     '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  'globe':          '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  'log-out':        '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
  'chevron-down':   '<path d="m6 9 6 6 6-6"/>',
  'chevron-right':  '<path d="m9 18 6-6-6-6"/>',
  'chevron-left':   '<path d="m15 18-6-6 6-6"/>',
  'x':              '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'plus':           '<path d="M5 12h14"/><path d="M12 5v14"/>',
  'more-horizontal':'<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  'trash-2':        '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  'edit':           '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
  'check':          '<path d="M20 6 9 17l-5-5"/>',
  'eye':            '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off':        '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>',
  'bold':           '<path d="M6 4h8a4 4 0 0 1 0 8H6z"/><path d="M6 12h9a4 4 0 0 1 0 8H6z"/>',
  'italic':         '<line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/>',
  'underline':      '<path d="M6 3v7a6 6 0 0 0 12 0V3"/><line x1="4" y1="21" x2="20" y2="21"/>',
  'image':          '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  'send':           '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  'copy':           '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  'gift':           '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
  'file-text':      '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
  'play-circle':    '<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>',
  'external-link':  '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  'trending-up':    '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  'trending-down':  '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  'calendar':       '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  'menu':           '<line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="18" x2="20" y2="18"/>',
  'grip-vertical':  '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
};
```

- [ ] **Step 2: Create the helper**

File: `frontend/public/js/ui/icons.js`

```javascript
import { ICONS } from './icons/index.js';

const DEFAULTS = { size: 20, stroke: 1.5, class: '' };

export function icon(name, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const inner = ICONS[name];
  if (!inner) { console.warn('icon: unknown name', name); return ''; }
  const cls = o.class ? ` class="${String(o.class).replace(/"/g, '&quot;')}"` : '';
  return `<svg${cls} width="${o.size}" height="${o.size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${o.stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
```

- [ ] **Step 3: Sanity test**

Create `frontend/public/js/ui/icons.test.html` briefly (not committed), load it, verify icons render. Then delete the test file.

- [ ] **Step 4: Commit**

```bash
git add frontend/public/js/ui/icons.js frontend/public/js/ui/icons/index.js
git commit -m "feat(ui): Lucide icon registry + helper (inlined SVG, zero network)"
```

---

### Task 3: Primitives CSS — buttons, inputs, cards, badges

**Files:**
- Create: `frontend/public/css/primitives.css`
- Modify: `frontend/public/app.html` (link after tokens.css)

- [ ] **Step 1: Write `primitives.css`**

File: `frontend/public/css/primitives.css`

```css
/* ==========================================================================
   Primitives — rendered via [data-ui] attributes.
   Page CSS never styles primitives directly.
   ========================================================================== */

/* ── Buttons ─────────────────────────────────────────────────────────── */

[data-ui="btn"] {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--s-2);
  padding: 0 var(--s-4); height: 40px; min-width: 40px;
  border-radius: var(--r-pill); border: 1px solid transparent;
  background: transparent; color: var(--c-fg);
  font-size: var(--fs-body-sm); font-weight: 500;
  cursor: pointer; user-select: none; white-space: nowrap;
  transition: transform var(--dur-fast) var(--ease-out),
              background-color var(--dur-fast) var(--ease-out),
              border-color var(--dur-fast) var(--ease-out),
              color var(--dur-fast) var(--ease-out);
}
[data-ui="btn"]:focus-visible { outline: none; box-shadow: var(--e-focus); }
[data-ui="btn"]:active { transform: scale(0.98); }
[data-ui="btn"][disabled], [data-ui="btn"][aria-disabled="true"] {
  opacity: 0.45; cursor: not-allowed; transform: none;
}

[data-ui="btn"][data-variant="primary"] {
  background: var(--c-gold); color: var(--c-ink-0); font-weight: 600;
}
[data-ui="btn"][data-variant="primary"]:hover { background: var(--c-gold-bright); }
[data-ui="btn"][data-variant="primary"]:active { transform: scale(0.96); }

[data-ui="btn"][data-variant="secondary"] {
  border-color: var(--c-ink-5); color: var(--c-fg);
}
[data-ui="btn"][data-variant="secondary"]:hover { background: var(--c-ink-2); border-color: var(--c-gold-dim); }

[data-ui="btn"][data-variant="ghost"] {
  color: var(--c-fg-2); border-radius: var(--r-sm);
}
[data-ui="btn"][data-variant="ghost"]:hover { background: var(--c-ink-3); color: var(--c-fg); }

[data-ui="btn"][data-variant="danger"] {
  color: var(--c-danger); border-color: var(--c-danger);
}
[data-ui="btn"][data-variant="danger"]:hover { background: var(--c-danger-bg); }

[data-ui="btn"][data-size="sm"] { height: 32px; padding: 0 var(--s-3); font-size: var(--fs-label); }
[data-ui="btn"][data-icon-only] { padding: 0; width: 40px; }
[data-ui="btn"][data-icon-only][data-size="sm"] { width: 32px; }

/* ── Inputs ──────────────────────────────────────────────────────────── */

[data-ui="input"], [data-ui="textarea"], [data-ui="select"] {
  width: 100%; height: 40px; padding: 0 var(--s-3);
  background: var(--c-ink-2); color: var(--c-fg);
  border: 1px solid var(--c-ink-4); border-radius: var(--r-md);
  font-size: var(--fs-body-sm);
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
[data-ui="textarea"] { height: auto; padding: var(--s-3); line-height: 1.6; resize: vertical; min-height: 96px; }
[data-ui="input"]:focus, [data-ui="textarea"]:focus, [data-ui="select"]:focus {
  outline: none; border-color: var(--c-gold); box-shadow: var(--e-focus);
}
[data-ui="input"]::placeholder, [data-ui="textarea"]::placeholder { color: var(--c-fg-4); }

[data-ui="field"] { display: grid; gap: var(--s-2); }
[data-ui="field"] > label {
  font-size: var(--fs-label); font-weight: 500; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--c-fg-2);
}
[data-ui="field"] > .helper { font-size: var(--fs-label); color: var(--c-fg-3); }
[data-ui="field"][data-state="error"] > [data-ui="input"],
[data-ui="field"][data-state="error"] > [data-ui="textarea"] { border-color: var(--c-danger); }
[data-ui="field"][data-state="error"] > .helper { color: var(--c-danger); }

/* ── Cards ───────────────────────────────────────────────────────────── */

[data-ui="card"] {
  background: var(--c-ink-1); border-radius: var(--r-lg);
  padding: var(--s-5); box-shadow: var(--e-card);
}
[data-ui="card"][data-variant="kpi"] {
  display: grid; gap: var(--s-2); align-content: start;
}

/* ── Tags / Badges ───────────────────────────────────────────────────── */

[data-ui="tag"] {
  display: inline-flex; align-items: center; gap: var(--s-1);
  height: 20px; padding: 0 var(--s-2);
  border-radius: var(--r-pill);
  font-size: 10px; font-weight: 500; letter-spacing: 0.08em;
  text-transform: uppercase;
  background: var(--c-ink-3); color: var(--c-fg-2);
}
[data-ui="tag"][data-tone="gold"]    { background: var(--c-gold-faint);    color: var(--c-gold-bright); }
[data-ui="tag"][data-tone="success"] { background: var(--c-success-bg);    color: var(--c-success); }
[data-ui="tag"][data-tone="warning"] { background: var(--c-warning-bg);    color: var(--c-warning); }
[data-ui="tag"][data-tone="danger"]  { background: var(--c-danger-bg);     color: var(--c-danger); }

/* ── Avatar ──────────────────────────────────────────────────────────── */

[data-ui="avatar"] {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: var(--r-pill);
  background: var(--c-ink-3); color: var(--c-gold);
  font-size: 11px; font-weight: 600; letter-spacing: 0.02em;
  text-transform: uppercase; overflow: hidden;
}
[data-ui="avatar"] img { width: 100%; height: 100%; object-fit: cover; }
[data-ui="avatar"][data-size="lg"] { width: 40px; height: 40px; font-size: 14px; }

/* ── Editorial hairline separator ─────────────────────────────────── */

[data-ui="hairline"] {
  border: 0; border-top: 0.5px solid var(--c-gold-dim); opacity: 0.5;
  margin: var(--s-4) 0;
}
```

- [ ] **Step 2: Link primitives.css after tokens.css**

In `app.html`:

```html
<link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="css/primitives.css">
<link rel="stylesheet" href="assets/style.css">
...
```

- [ ] **Step 3: Smoke — build a tiny demo page**

Create `frontend/public/primitives-demo.html` (uncommitted, just for visual verification):

```html
<!doctype html>
<html lang="en" dir="ltr"><head>
<meta charset="utf-8"><title>Primitives</title>
<link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="css/primitives.css">
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@200;400;500;700;900&display=swap" rel="stylesheet">
</head><body style="padding:48px; display:grid; gap:24px; max-width:720px">
<div>
  <button data-ui="btn" data-variant="primary">Save changes</button>
  <button data-ui="btn" data-variant="secondary">Cancel</button>
  <button data-ui="btn" data-variant="ghost">Ghost</button>
  <button data-ui="btn" data-variant="danger">Delete</button>
</div>
<div data-ui="field">
  <label>Email</label>
  <input data-ui="input" placeholder="you@example.com">
  <div class="helper">We never share this.</div>
</div>
<hr data-ui="hairline">
<span data-ui="tag">default</span>
<span data-ui="tag" data-tone="gold">gold</span>
<span data-ui="tag" data-tone="success">success</span>
<span data-ui="tag" data-tone="warning">warning</span>
<span data-ui="tag" data-tone="danger">danger</span>
<hr data-ui="hairline">
<div data-ui="card" data-variant="kpi">
  <div style="font-size:12px; font-weight:500; letter-spacing:.08em; text-transform:uppercase; color:var(--c-fg-3)">Revenue this week</div>
  <div style="font-size:var(--fs-display-xl); font-weight:200; line-height:1">12,480<span style="font-size:.4em; color:var(--c-fg-3); margin-right:.3em"> SAR</span></div>
  <div style="color:var(--c-success); font-size:var(--fs-body-sm)">↑ 12.4% vs last week</div>
</div>
</body></html>
```

Start server: `python3 -m http.server 5555 --directory frontend/public &` Open `/primitives-demo.html`. Expected: buttons are pill-shaped, gold primary, inputs have gold focus ring, KPI card shows ultralight Cairo 200 number. Delete the file.

- [ ] **Step 4: Commit**

```bash
git add frontend/public/css/primitives.css frontend/public/app.html
git commit -m "feat(ui): primitive components — buttons / inputs / cards / tags / avatars / hairline"
```

---

### Task 4: Liquid toggle — vanilla CSS + glue

**Files:**
- Create: `frontend/public/css/primitives/toggle.css`
- Create: `frontend/public/js/ui/toggle.js`
- Modify: `frontend/public/css/primitives.css` (append `@import`)

- [ ] **Step 1: Write the CSS**

File: `frontend/public/css/primitives/toggle.css`

```css
/* Liquid toggle — vanilla CSS port of 21st.dev/r/deepaksslibra/liquid-toggle.
   Thumb animates on ease-out-quint with a mid-transition squash so the motion
   reads "liquid" without JS physics. */

[data-ui="toggle"] {
  --t-w: 44px; --t-h: 24px; --t-thumb: 18px; --t-gap: 3px;
  position: relative; display: inline-block;
  width: var(--t-w); height: var(--t-h);
  cursor: pointer; vertical-align: middle;
}
[data-ui="toggle"] input { position: absolute; opacity: 0; width: 0; height: 0; }

[data-ui="toggle"] .track {
  position: absolute; inset: 0; border-radius: var(--r-pill);
  background: var(--c-ink-4);
  transition: background-color var(--dur-med) var(--ease-out);
}
[data-ui="toggle"] .thumb {
  position: absolute; top: var(--t-gap); left: var(--t-gap);
  width: var(--t-thumb); height: var(--t-thumb);
  border-radius: 50%; background: var(--c-fg);
  transition:
    transform var(--dur-med) cubic-bezier(0.34, 1.56, 0.64, 1),
    scale var(--dur-fast) var(--ease-out),
    background-color var(--dur-med) var(--ease-out);
}
[data-ui="toggle"] input:checked ~ .track { background: var(--c-gold); }
[data-ui="toggle"] input:checked ~ .thumb {
  transform: translateX(calc(var(--t-w) - var(--t-thumb) - var(--t-gap) * 2));
  background: var(--c-ink-0);
}
[data-ui="toggle"] input:active ~ .thumb,
[data-ui="toggle"]:has(input:active) .thumb { scale: 1.08 0.85; } /* liquid squash mid-transition */

[data-ui="toggle"] input:focus-visible ~ .track { box-shadow: var(--e-focus); }
[data-ui="toggle"][data-size="sm"] { --t-w: 36px; --t-h: 20px; --t-thumb: 14px; --t-gap: 3px; }
```

- [ ] **Step 2: Add import to `primitives.css`**

Top of `frontend/public/css/primitives.css`:

```css
@import url('primitives/toggle.css');
```

- [ ] **Step 3: Helper for programmatic construction**

File: `frontend/public/js/ui/toggle.js`

```javascript
// Liquid toggle — render helper.
// Usage: toggleHtml({ id: 'f-active', checked: true, label: 'Active' })

export function toggleHtml({ id, checked = false, label = '', size = 'md' }) {
  const sizeAttr = size === 'sm' ? ' data-size="sm"' : '';
  return `
    <label class="toggle-row" style="display:inline-flex; align-items:center; gap:var(--s-2); cursor:pointer">
      <span data-ui="toggle"${sizeAttr}>
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
        <span class="track"></span>
        <span class="thumb"></span>
      </span>
      ${label ? `<span style="font-size:var(--fs-body-sm); color:var(--c-fg-2)">${label}</span>` : ''}
    </label>`;
}
```

- [ ] **Step 4: Demo + commit**

Verify liquid motion in the demo HTML (briefly uncommitted). Then:

```bash
git add frontend/public/css/primitives/toggle.css frontend/public/js/ui/toggle.js frontend/public/css/primitives.css
git commit -m "feat(ui): liquid toggle — vanilla CSS port with ease-out-quint + mid-squash"
```

---

### Task 5: Toast system

**Files:**
- Create: `frontend/public/css/primitives/toast.css`
- Create: `frontend/public/js/ui/toast.js`
- Modify: `frontend/public/css/primitives.css` (append `@import`)

- [ ] **Step 1: Write CSS + JS**

`frontend/public/css/primitives/toast.css`

```css
.toast-stack {
  position: fixed; top: var(--s-4); right: var(--s-4);
  display: flex; flex-direction: column; gap: var(--s-2);
  z-index: 1000; pointer-events: none;
}
[data-ui="toast"] {
  min-width: 240px; max-width: 360px;
  background: var(--c-ink-2); color: var(--c-fg);
  border: 1px solid var(--c-ink-4); border-radius: var(--r-md);
  box-shadow: var(--e-raised);
  padding: var(--s-3) var(--s-4);
  font-size: var(--fs-body-sm); line-height: 1.5;
  display: flex; align-items: flex-start; gap: var(--s-3);
  pointer-events: auto;
  transform: translateX(24px); opacity: 0;
  transition: transform var(--dur-med) var(--ease-out), opacity var(--dur-med) var(--ease-out);
}
[data-ui="toast"][data-enter] { transform: translateX(0); opacity: 1; }
[data-ui="toast"][data-tone="success"] { border-left: 2px solid var(--c-success); }
[data-ui="toast"][data-tone="error"]   { border-left: 2px solid var(--c-danger); }
[data-ui="toast"][data-tone="warning"] { border-left: 2px solid var(--c-warning); }
```

`frontend/public/js/ui/toast.js`

```javascript
// Toast API. toast(msg, 'success' | 'error' | 'warning' | 'default')

let stack = null;
function ensureStack() {
  if (stack) return stack;
  stack = document.createElement('div');
  stack.className = 'toast-stack';
  stack.setAttribute('role', 'status');
  stack.setAttribute('aria-live', 'polite');
  document.body.appendChild(stack);
  return stack;
}

export function toast(msg, tone = 'default', ttl) {
  const s = ensureStack();
  const el = document.createElement('div');
  el.setAttribute('data-ui', 'toast');
  if (tone !== 'default') el.setAttribute('data-tone', tone);
  el.textContent = msg;
  s.appendChild(el);
  requestAnimationFrame(() => el.setAttribute('data-enter', ''));
  const lifespan = ttl ?? (tone === 'error' ? 5000 : 4000);
  setTimeout(() => {
    el.removeAttribute('data-enter');
    setTimeout(() => el.remove(), 260);
  }, lifespan);
  // Cap stack at 3 visible.
  while (s.children.length > 3) s.firstElementChild.remove();
}
```

- [ ] **Step 2: Append import**

Top of `primitives.css`:
```css
@import url('primitives/toast.css');
```

- [ ] **Step 3: Commit**

```bash
git add frontend/public/css/primitives/toast.css frontend/public/js/ui/toast.js frontend/public/css/primitives.css
git commit -m "feat(ui): toast system — top-right stack, semantic tones, auto-dismiss"
```

---

### Task 6: Replace ad-hoc primitives across existing pages (compatibility sweep)

Pages currently render custom buttons / inputs / tags via page-scoped CSS. We keep that for Phase 1 (invisible) but add `data-ui` attributes so hover/focus states start reading from primitives.css where they don't conflict. Old CSS still wins for pages we haven't touched — that's fine.

**Files to edit (attribute-only, zero layout changes):**
- `frontend/public/js/pages/coupons.js`
- `frontend/public/js/pages/contacts.js`
- `frontend/public/js/pages/lessons.js`
- `frontend/public/js/pages/linkbio.js`
- `frontend/public/js/pages/emails.js`
- `frontend/public/js/pages/newsletter.js`
- `frontend/public/js/pages/home.js`
- `frontend/public/js/pages/noor-chat.js`

- [ ] **Step 1: For each file, run a targeted replace**

Replacement rules (apply with Edit tool per file):
- `class="btn-primary"` → `class="btn-primary" data-ui="btn" data-variant="primary"`
- `class="btn-ghost"` → `class="btn-ghost" data-ui="btn" data-variant="ghost"`
- `class="btn-danger"` → `class="btn-danger" data-ui="btn" data-variant="danger"`

The old classes still match (style.css still in the cascade) but primitives.css contributes focus/hover/press improvements.

- [ ] **Step 2: Build + smoke reload**

```bash
cd ~/code/ma-learn-dashboard/backend && npm run build
```

Open `app.html` locally, click through every page: buttons should look same-ish but have gold focus ring on keyboard tab. No regressions.

- [ ] **Step 3: Commit**

```bash
git add frontend/public/js/pages/
git commit -m "chore(pages): add data-ui attrs to existing buttons for primitives compat"
```

---

## Phase 2 — Shell chrome

Builds the new sidebar + topbar + right rail. Pages still use their old internals but render into the new content slot.

### Task 7: Shell layout + CSS

**Files:**
- Create: `frontend/public/css/shell.css`
- Modify: `frontend/public/app.html`

- [ ] **Step 1: Write shell.css**

```css
.shell {
  display: grid;
  grid-template-columns: 240px 1fr 320px;
  grid-template-rows: 56px 1fr;
  grid-template-areas:
    "sidebar topbar  rail"
    "sidebar content rail";
  min-height: 100dvh; height: 100dvh;
  background: var(--c-ink-0);
}
.shell-sidebar { grid-area: sidebar; background: var(--c-ink-1); border-right: 1px solid var(--c-ink-4); display: flex; flex-direction: column; }
.shell-topbar  { grid-area: topbar;  border-bottom: 0.5px solid var(--c-gold-dim); display: flex; align-items: center; padding: 0 var(--s-5); gap: var(--s-4); }
.shell-content { grid-area: content; overflow-y: auto; padding: var(--s-6) var(--s-page-x); }
.shell-rail    { grid-area: rail; border-left: 0.5px solid var(--c-gold-dim); display: flex; flex-direction: column; }

/* Collapse rail below 1280px, sidebar below 1024px */
@media (max-width: 1280px) { .shell { grid-template-columns: 240px 1fr 56px; } .shell-rail.collapsed { padding: var(--s-3) 0; } }
@media (max-width: 1024px) { .shell { grid-template-columns: 56px 1fr 56px; } }

/* Sidebar anatomy */
.sidebar-head { padding: var(--s-4) var(--s-5); display: flex; align-items: center; gap: var(--s-3); height: 56px; border-bottom: 0.5px solid var(--c-gold-dim); }
.sidebar-head .brand { font-weight: 700; font-size: 14px; letter-spacing: 0.04em; }
.sidebar-search { padding: var(--s-3) var(--s-4); position: relative; }
.sidebar-search input { width: 100%; padding-inline-start: 32px; }
.sidebar-search .kbd { position: absolute; top: 50%; transform: translateY(-50%); right: calc(var(--s-4) + var(--s-2)); font-family: var(--font-mono); font-size: 11px; color: var(--c-fg-3); background: var(--c-ink-3); padding: 1px 6px; border-radius: var(--r-xs); }
.sidebar-search .search-icon { position: absolute; left: calc(var(--s-4) + var(--s-2)); top: 50%; transform: translateY(-50%); color: var(--c-fg-3); }
.sidebar-nav { flex: 1; overflow-y: auto; padding: var(--s-3) var(--s-2); }
.nav-section { margin-top: var(--s-5); }
.nav-section:first-child { margin-top: 0; }
.nav-section-label { display: block; padding: 0 var(--s-3) var(--s-2); font-size: var(--fs-label); font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--c-fg-3); }
.nav-item { display: flex; align-items: center; gap: var(--s-3); padding: 8px var(--s-3); border-radius: var(--r-sm); color: var(--c-fg-2); cursor: pointer; font-size: var(--fs-body-sm); text-decoration: none; border-left: 2px solid transparent; margin-left: -2px; }
.nav-item:hover { background: var(--c-ink-3); color: var(--c-fg); }
.nav-item[aria-current="page"] { background: var(--c-gold-faint); color: var(--c-gold-bright); border-left-color: var(--c-gold); }
.sidebar-foot { padding: var(--s-4) var(--s-5); border-top: 0.5px solid var(--c-ink-4); display: flex; align-items: center; gap: var(--s-2); font-size: var(--fs-label); color: var(--c-fg-3); }
.sidebar-foot .env-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c-warning); }
.sidebar-foot .env-dot[data-env="production"] { background: var(--c-success); }

/* Topbar anatomy */
.topbar-title { flex: 1; min-width: 0; }
.topbar-title h1 { font-size: var(--fs-h1); font-weight: 700; line-height: 1.1; color: var(--c-fg); }
.topbar-title .subtitle { font-size: var(--fs-label); color: var(--c-fg-3); margin-top: 2px; letter-spacing: 0.04em; text-transform: uppercase; }
.topbar-actions { display: flex; align-items: center; gap: var(--s-2); }

/* Rail anatomy */
.rail-section { display: flex; flex-direction: column; min-height: 0; }
.rail-noor { flex: 1 1 60%; border-bottom: 0.5px solid var(--c-gold-dim); }
.rail-activity { flex: 1 1 40%; overflow-y: auto; }
.rail-head { height: 48px; padding: 0 var(--s-4); display: flex; align-items: center; justify-content: space-between; font-size: var(--fs-label); font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--c-fg-2); cursor: pointer; }
.rail-head .toggle-icon { color: var(--c-fg-3); transition: transform var(--dur-fast) var(--ease-out); }
.rail-section.collapsed .rail-body { display: none; }
.rail-section.collapsed .toggle-icon { transform: rotate(-90deg); }
.rail-body { flex: 1; overflow-y: auto; padding: 0 var(--s-4) var(--s-4); }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/public/css/shell.css
git commit -m "feat(shell): CSS grid layout + sidebar/topbar/rail anatomy"
```

---

### Task 8: Sidebar v2 + topbar v2 modules

**Files:**
- Create: `frontend/public/js/ui/sidebar-v2.js` (replaces `sidebar.js` behavior)
- Create: `frontend/public/js/ui/topbar.js`

- [ ] **Step 1: Sidebar v2**

```javascript
// sidebar-v2.js
import { icon } from './icons.js';

const NAV = [
  { section: 'DASHBOARD', items: [
    { id: 'home',       label: 'Home',        href: '#home',       icon: 'home' },
    { id: 'activity',   label: 'Activity',    href: '#activity',   icon: 'activity' },
  ]},
  { section: 'CONTENT', items: [
    { id: 'emails',     label: 'Emails',      href: '#emails',     icon: 'mail' },
    { id: 'newsletter', label: 'Newsletter',  href: '#newsletter', icon: 'megaphone' },
    { id: 'lessons',    label: 'Lessons',     href: '#lessons',    icon: 'book-open' },
    { id: 'linkbio',    label: 'Link-in-bio', href: '#linkbio',    icon: 'link' },
  ]},
  { section: 'PEOPLE', items: [
    { id: 'contacts',   label: 'Contacts',    href: '#contacts',   icon: 'users' },
    { id: 'coupons',    label: 'Coupons',     href: '#coupons',    icon: 'ticket' },
  ]},
];

export function mountSidebar(root, { user = 'Majid', env = 'staging' } = {}) {
  const el = document.createElement('aside');
  el.className = 'shell-sidebar';
  el.innerHTML = `
    <div class="sidebar-head">
      <div class="brand">MA Learn</div>
    </div>
    <div class="sidebar-search">
      <span class="search-icon">${icon('search', { size: 16 })}</span>
      <input data-ui="input" placeholder="Search…" id="sidebar-search-input">
      <span class="kbd">⌘K</span>
    </div>
    <nav class="sidebar-nav" aria-label="Primary">
      ${NAV.map(s => `
        <div class="nav-section">
          <span class="nav-section-label">${s.section}</span>
          ${s.items.map(i => `
            <a class="nav-item" href="${i.href}" data-id="${i.id}">
              ${icon(i.icon, { size: 18 })}
              <span>${i.label}</span>
            </a>`).join('')}
        </div>`).join('')}
    </nav>
    <div class="sidebar-foot">
      <span class="env-dot" data-env="${env}" title="${env}"></span>
      <span>${user} · ${env}</span>
    </div>`;
  root.appendChild(el);

  // Focus the search input on ⌘K / Ctrl+K
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      el.querySelector('#sidebar-search-input').focus();
    }
  });

  return {
    setActive: (id) => {
      el.querySelectorAll('.nav-item').forEach(a => {
        if (a.dataset.id === id) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
    },
  };
}
```

- [ ] **Step 2: Topbar v2**

```javascript
// topbar.js
import { icon } from './icons.js';
import { logout } from '../session.js';

const TITLES = {
  home: ['Home', 'Today\'s briefing'],
  activity: ['Activity', 'Last 20 writes'],
  emails: ['Emails', 'Templates and sends'],
  newsletter: ['Newsletter', 'Drafts, scheduled, sent'],
  lessons: ['Lessons', 'Player admin'],
  linkbio: ['Link-in-bio', 'Live at linkinbio.malearnsa.com'],
  contacts: ['Contacts', 'Unified customers + subscribers'],
  coupons: ['Coupons', 'Discount codes'],
};

export function mountTopbar(root) {
  const el = document.createElement('header');
  el.className = 'shell-topbar';
  el.innerHTML = `
    <div class="topbar-title">
      <h1 id="tb-title">Home</h1>
      <div class="subtitle" id="tb-sub">Today's briefing</div>
    </div>
    <div class="topbar-actions">
      <button data-ui="btn" data-variant="ghost" data-icon-only title="Refresh" id="tb-refresh">${icon('refresh-cw', { size: 18 })}</button>
      <button data-ui="btn" data-variant="ghost" data-icon-only title="Notifications" id="tb-notif">${icon('bell', { size: 18 })}</button>
      <button data-ui="btn" data-variant="ghost" data-icon-only title="Language" id="tb-lang">${icon('globe', { size: 18 })}</button>
      <button data-ui="btn" data-variant="ghost" data-icon-only title="Logout" id="tb-logout">${icon('log-out', { size: 18 })}</button>
    </div>`;
  root.appendChild(el);

  el.querySelector('#tb-refresh').onclick = () => location.reload();
  el.querySelector('#tb-logout').onclick = async () => { await logout(); location.href = 'index.html'; };
  // Notifications + language: placeholder for Phase 3.

  return {
    setTitle: (pageId) => {
      const [t, s] = TITLES[pageId] ?? [pageId, ''];
      el.querySelector('#tb-title').textContent = t;
      el.querySelector('#tb-sub').textContent = s;
    },
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/public/js/ui/sidebar-v2.js frontend/public/js/ui/topbar.js
git commit -m "feat(shell): sidebar-v2 with sections + topbar with page title and action cluster"
```

---

### Task 9: Rail module — Noor + Activity

**Files:**
- Create: `frontend/public/js/ui/rail.js`
- Create: `frontend/public/js/ui/activity-feed.js`

- [ ] **Step 1: Rail**

```javascript
// rail.js
import { icon } from './icons.js';
import { mountNoorInRail } from './noor-widget.js'; // we'll adapt existing widget
import { mountActivityFeed } from './activity-feed.js';

export function mountRail(root) {
  const el = document.createElement('aside');
  el.className = 'shell-rail';
  el.innerHTML = `
    <section class="rail-section rail-noor">
      <header class="rail-head" id="rail-noor-head">
        <span>Noor</span>
        <span class="toggle-icon">${icon('chevron-down', { size: 16 })}</span>
      </header>
      <div class="rail-body" id="rail-noor-body"></div>
    </section>
    <section class="rail-section rail-activity">
      <header class="rail-head" id="rail-activity-head">
        <span>Activity</span>
        <span class="toggle-icon">${icon('chevron-down', { size: 16 })}</span>
      </header>
      <div class="rail-body" id="rail-activity-body"></div>
    </section>`;
  root.appendChild(el);

  // Collapse persistence
  function wireCollapse(section, key) {
    const sec = el.querySelector(`.rail-${section}`);
    const head = el.querySelector(`#rail-${section}-head`);
    if (localStorage.getItem(key) === '1') sec.classList.add('collapsed');
    head.onclick = () => {
      sec.classList.toggle('collapsed');
      localStorage.setItem(key, sec.classList.contains('collapsed') ? '1' : '0');
    };
  }
  wireCollapse('noor', 'rail.noor.collapsed');
  wireCollapse('activity', 'rail.activity.collapsed');

  mountNoorInRail(el.querySelector('#rail-noor-body'));
  mountActivityFeed(el.querySelector('#rail-activity-body'));
}
```

- [ ] **Step 2: Activity feed (reads from new backend endpoint; falls back to stub)**

```javascript
// activity-feed.js
import { api } from '../api.js';
import { icon } from './icons.js';

const TYPE_ICON = {
  newsletter_send:  'megaphone',
  lesson_save:      'book-open',
  lesson_create:    'plus',
  lesson_delete:    'trash-2',
  token_gift:       'gift',
  coupon_create:    'ticket',
  coupon_update:    'edit',
  contact_gift:     'gift',
  default:          'activity',
};

function relTime(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60)  return Math.floor(s) + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}

export async function mountActivityFeed(root) {
  root.innerHTML = '<div style="color:var(--c-fg-3); font-size:var(--fs-body-sm); padding:var(--s-2)">Loading…</div>';
  try {
    const { events } = await api('/api/data/activity?limit=20');
    if (!events || events.length === 0) {
      root.innerHTML = `<div style="color:var(--c-fg-3); font-size:var(--fs-body-sm); padding:var(--s-4) 0; text-align:center">No activity yet. Changes you make will appear here.</div>`;
      return;
    }
    root.innerHTML = events.map(e => `
      <div class="activity-row" style="display:flex; align-items:flex-start; gap:var(--s-2); padding:var(--s-2) 0; border-bottom:0.5px solid var(--c-ink-4)">
        <span style="color:var(--c-fg-3); margin-top:2px">${icon(TYPE_ICON[e.type] ?? TYPE_ICON.default, { size: 14 })}</span>
        <div style="flex:1; min-width:0">
          <div style="font-size:var(--fs-body-sm); color:var(--c-fg); line-height:1.4; overflow-wrap:anywhere">${escapeHtml(e.summary)}</div>
          <div style="font-size:11px; color:var(--c-fg-3); margin-top:2px">${relTime(e.at)} ago</div>
        </div>
      </div>`).join('');
  } catch (err) {
    root.innerHTML = `<div style="color:var(--c-fg-3); font-size:var(--fs-body-sm); padding:var(--s-2)">Activity unavailable.</div>`;
  }
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/public/js/ui/rail.js frontend/public/js/ui/activity-feed.js
git commit -m "feat(shell): right rail module with Noor slot + Activity feed"
```

---

### Task 10: Backend — `/api/data/activity` endpoint

**Files:**
- Create: `backend/src/routes/activity.ts`
- Create: `backend/tests/routes/activity.test.ts`
- Modify: `backend/src/server.ts`

- [ ] **Step 1: Write the test first**

```typescript
// backend/tests/routes/activity.test.ts
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import activityRoute from '../../src/routes/activity.js';

async function setup(entries) {
  const readLog = vi.fn().mockResolvedValue(entries);
  const app = Fastify();
  await app.register(activityRoute, { readLog, requireAuth: () => 'majid' });
  return { app, readLog };
}

describe('GET /api/data/activity', () => {
  it('returns last N events newest-first', async () => {
    const { app } = await setup([
      { at: '2026-04-23T10:00:00Z', type: 'lesson_save', summary: 'Lesson saved: x' },
      { at: '2026-04-23T09:00:00Z', type: 'newsletter_send', summary: 'Newsletter sent: y' },
    ]);
    const res = await app.inject({ method: 'GET', url: '/api/data/activity?limit=20' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.events).toHaveLength(2);
    expect(body.events[0].type).toBe('lesson_save');
  });
  it('honors limit query param', async () => {
    const { app } = await setup(Array.from({ length: 50 }, (_, i) => ({ at: new Date(Date.now() - i*1000).toISOString(), type: 'default', summary: 'x' })));
    const res = await app.inject({ method: 'GET', url: '/api/data/activity?limit=5' });
    expect(res.json().events).toHaveLength(5);
  });
  it('401 when unauthed', async () => {
    const app = Fastify();
    await app.register(activityRoute, { readLog: vi.fn(), requireAuth: () => null });
    const res = await app.inject({ method: 'GET', url: '/api/data/activity' });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
cd ~/code/ma-learn-dashboard/backend && npm test -- activity
```

- [ ] **Step 3: Implement the route**

```typescript
// backend/src/routes/activity.ts
import { FastifyPluginAsync, FastifyRequest } from 'fastify';

export interface ActivityEvent { at: string; type: string; summary: string; actor?: string; }
interface Opts {
  readLog: () => Promise<ActivityEvent[]>;
  requireAuth: (req: FastifyRequest) => string | null;
}

const plugin: FastifyPluginAsync<Opts> = async (app, opts) => {
  app.get('/api/data/activity', async (req, reply) => {
    if (!opts.requireAuth(req)) return reply.code(401).send({ error: 'unauthorized' });
    const limit = Math.max(1, Math.min(100, Number((req.query as { limit?: string }).limit ?? 20)));
    const all = await opts.readLog();
    return { events: all.slice(0, limit) };
  });
};
export default plugin;
```

- [ ] **Step 4: Data source — reuse existing audit-log**

The backend already has `backend/src/data/audit-log.ts`. Check its API and wire `readLog` from it. If it lacks a "list recent" export, add one:

```typescript
// append to backend/src/data/audit-log.ts
export async function readRecentActivity(): Promise<ActivityEvent[]> {
  // Reads the AuditLog sheet tab, newest first.
  const rows = await readSheet({ tab: 'AuditLog' });
  return rows
    .map(r => ({
      at: String(r['Timestamp'] ?? ''),
      type: String(r['Action'] ?? 'default'),
      summary: String(r['Summary'] ?? ''),
      actor: String(r['Actor'] ?? ''),
    }))
    .filter(e => e.at)
    .sort((a, b) => b.at.localeCompare(a.at));
}
```

- [ ] **Step 5: Register in server.ts**

Inside the `if (config.SHEET_ID)` block:

```typescript
import activityRoute from './routes/activity.js';
import { readRecentActivity } from './data/audit-log.js';
// ...
await app.register(activityRoute, {
  readLog: readRecentActivity,
  requireAuth: (req) => {
    const u = (req as unknown as { user?: { email?: string } }).user;
    return u?.email ?? null;
  },
});
```

- [ ] **Step 6: Build + tests + commit**

```bash
cd ~/code/ma-learn-dashboard/backend
npm test -- activity && npm run build
git add backend/src/routes/activity.ts backend/tests/routes/activity.test.ts backend/src/server.ts backend/src/data/audit-log.ts
git commit -m "feat(activity): GET /api/data/activity endpoint reading audit-log sheet"
```

---

### Task 11: Wire new shell into `app.html`

**Files:**
- Modify: `frontend/public/app.html`

- [ ] **Step 1: Replace the app boot script**

Find the `<script type="module">` block in `app.html`. Replace with:

```html
<link rel="stylesheet" href="css/shell.css">
<div class="shell" id="shell">
  <!-- sidebar / topbar / rail mounted here -->
  <main class="shell-content" id="content"></main>
</div>
<script type="module">
  import { me, logout } from './js/session.js';
  import { mountSidebar } from './js/ui/sidebar-v2.js';
  import { mountTopbar } from './js/ui/topbar.js';
  import { mountRail } from './js/ui/rail.js';
  import { API_BASE } from './js/api.js';
  import { startRouter } from './js/router.js';

  const shell   = document.getElementById('shell');
  const content = document.getElementById('content');
  const side    = mountSidebar(shell, { user: 'Majid', env: 'staging' });
  const top     = mountTopbar(shell);
  mountRail(shell);

  try { const u = await me(); /* could pass u.email into sidebar */ }
  catch { location.href = 'index.html'; }

  await startRouter({
    content,
    onRouteChange: (pageId) => { side.setActive(pageId); top.setTitle(pageId); },
  });

  // Env dot reflects /health env
  fetch(API_BASE + '/health').then(r => r.json()).then(b => {
    const dot = shell.querySelector('.env-dot');
    if (dot) dot.setAttribute('data-env', b.environment || 'staging');
  }).catch(() => {});
</script>
```

- [ ] **Step 2: Update `router.js` to call `onRouteChange`**

Add `opts.onRouteChange?.(pageId)` after `sidebar.setActive(pageId)` in the router. The current `startRouter` takes `{ content, sidebar }`; swap to `{ content, onRouteChange }`.

- [ ] **Step 3: Retire `noor` top-level route**

In `router.js` ROUTES, redirect `noor` to `home`:

```javascript
if (pageId === 'noor') { location.hash = '#home'; return; }
```

- [ ] **Step 4: Smoke in browser, then commit**

```bash
git add frontend/public/app.html frontend/public/js/router.js
git commit -m "feat(shell): wire new sidebar + topbar + rail into app; retire noor route"
```

---

## Phase 3 — Per-page passes

One subagent per page. Each pass:
1. Reads `docs/superpowers/specs/2026-04-23-dashboard-player-redesign-design.md` section 7 for its page
2. Rewrites the page's render logic to use primitives (`data-ui` attrs) and the Editorial Atelier patterns
3. Removes per-page color/spacing tokens (now in `tokens.css`)
4. Commits

Each task below has **Goal · Files · Steps · Commit**.

### Task 12: Home — "Today's briefing"

**Goal:** Replace placeholder home page with the briefing layout: greeting → Harvest 22 block → asymmetric KPI row (hero revenue + 2×2 compact stats) → What ships today.

**Files:**
- Modify: `frontend/public/js/pages/home.js`
- Backend: endpoint for the 5 KPI numbers — `backend/src/routes/home-kpis.ts`

- [ ] **Step 1: Backend KPIs**

Write `backend/src/routes/home-kpis.ts` returning:
```json
{
  "revenueThisWeekSAR": number,
  "revenuePrevWeekSAR": number,
  "revenueSparkline": number[],           // 14 daily values
  "newCustomersThisWeek": number,
  "activeTokensUnused": number,
  "t3c2SeatsSold": number, "t3c2SeatsTotal": 30,
  "totalUnitsSold": number
}
```

Compute from `Tokens` and `Customers` sheets:
- Revenue this week = sum of `Tokens` rows where status='used' and AssignedAt is within the current ISO week, multiplied by product price (look up from a small constant map — T2=449, T3=1199, BL=700, PP=99, etc.)
- Spark = last 14 days daily revenue
- New customers = count of `Customers` rows with CreatedAt in current ISO week
- Active tokens = count of `Tokens` rows where status='available' (unassigned)
- T3 C2 seats sold = count of Tokens where product='creative-ai-workshop-t3' and AssignedAt is non-empty
- Total units sold = count of all `Tokens` rows with AssignedAt non-empty (all-time)

Write tests that use fake sheet data to verify each number.

```bash
git add backend/src/routes/home-kpis.ts backend/tests/routes/home-kpis.test.ts backend/src/server.ts
git commit -m "feat(home): backend endpoint for 5 KPI numbers"
```

- [ ] **Step 2: Frontend Home**

```javascript
// pages/home.js
import { api } from '../api.js';
import { icon } from '../ui/icons.js';

function formatSAR(n) { return new Intl.NumberFormat('en-US').format(Math.round(n)); }
function arabicDate(d) { return new Intl.DateTimeFormat('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' }).format(d); }
function englishDate(d) { return new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long' }).format(d); }

function sparklinePath(values, w = 180, h = 48) {
  if (!values?.length) return '';
  const min = Math.min(...values), max = Math.max(...values);
  const range = Math.max(1, max - min);
  const step = w / (values.length - 1);
  return values.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * h;
    return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
  }).join(' ');
}

export default async function mount(root) {
  root.innerHTML = '<div style="color:var(--c-fg-3)">Loading today\'s briefing…</div>';
  const kpis = await api('/api/data/home-kpis');
  const now = new Date();
  const revDelta = kpis.revenuePrevWeekSAR > 0
    ? ((kpis.revenueThisWeekSAR - kpis.revenuePrevWeekSAR) / kpis.revenuePrevWeekSAR * 100)
    : 0;
  const up = revDelta >= 0;

  root.innerHTML = `
    <section style="max-width:1080px; margin:0 auto; display:grid; gap:var(--s-7)">

      <!-- Greeting -->
      <header>
        <div style="font-size:var(--fs-body); color:var(--c-fg-2)">Good morning, Majid</div>
        <div style="font-size:var(--fs-label); color:var(--c-fg-3); letter-spacing:0.04em; text-transform:uppercase; margin-top:2px">${englishDate(now)} · ${arabicDate(now)}</div>
        <hr data-ui="hairline" style="width:120px; margin:var(--s-3) 0 0">
      </header>

      <!-- Harvest 22 block -->
      <section data-ui="card">
        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:var(--s-3)">
          <h2 style="font-size:var(--fs-h2)">M1 — Deliver Cohort 1</h2>
          <span style="font-size:var(--fs-label); color:var(--c-fg-3); letter-spacing:0.04em; text-transform:uppercase">Apr 22 – May 2</span>
        </div>
        <div style="height:4px; background:var(--c-ink-3); border-radius:2px; overflow:hidden">
          <div style="width:40%; height:100%; background:var(--c-gold); border-radius:2px"></div>
        </div>
        <div style="margin-top:var(--s-3); font-size:var(--fs-body-sm); color:var(--c-fg-2)">9 days to M2 · T4 soft launch begins May 3.</div>
      </section>

      <!-- KPI row — asymmetric -->
      <section style="display:grid; grid-template-columns: 1fr 1fr; gap:var(--s-6); align-items:start">

        <!-- Hero: revenue -->
        <div style="display:grid; gap:var(--s-2)">
          <div style="font-size:var(--fs-label); font-weight:500; letter-spacing:0.08em; text-transform:uppercase; color:var(--c-fg-3)">Revenue this week</div>
          <div style="font-size:var(--fs-display-xl); font-weight:200; line-height:1; letter-spacing:-0.02em">
            ${formatSAR(kpis.revenueThisWeekSAR)}<span style="font-size:.35em; color:var(--c-fg-3); margin-inline-start:.4em; font-weight:400"> SAR</span>
          </div>
          <div style="display:flex; align-items:center; gap:var(--s-2)">
            <svg width="180" height="48" viewBox="0 0 180 48" fill="none" style="flex-shrink:0">
              <path d="${sparklinePath(kpis.revenueSparkline)}" stroke="var(--c-gold)" stroke-width="1.5" fill="none"/>
            </svg>
            <span style="font-size:var(--fs-body-sm); color:${up ? 'var(--c-success)' : 'var(--c-danger)'}">
              ${up ? '↑' : '↓'} ${Math.abs(revDelta).toFixed(1)}%
              <span style="color:var(--c-fg-3)">vs last week</span>
            </span>
          </div>
        </div>

        <!-- 2x2 compact -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--s-5); border-left:0.5px solid var(--c-gold-dim); padding-left:var(--s-6)">
          ${[
            { label: 'New customers this week', value: kpis.newCustomersThisWeek },
            { label: 'Active tokens', value: kpis.activeTokensUnused },
            { label: 'T3 Cohort 2 seats', value: `${kpis.t3c2SeatsSold}/${kpis.t3c2SeatsTotal}` },
            { label: 'Total units sold', value: kpis.totalUnitsSold },
          ].map(k => `
            <div>
              <div style="font-size:var(--fs-label); font-weight:500; letter-spacing:0.08em; text-transform:uppercase; color:var(--c-fg-3); margin-bottom:var(--s-1)">${k.label}</div>
              <div style="font-size:var(--fs-display-l); font-weight:200; line-height:1; letter-spacing:-0.015em">${formatSAR(k.value)}</div>
            </div>`).join('')}
        </div>
      </section>

      <!-- What ships today -->
      <section>
        <h2 style="font-size:var(--fs-h2); margin-bottom:var(--s-3)">What ships today</h2>
        <div style="color:var(--c-fg-3); font-size:var(--fs-body-sm); padding:var(--s-4) 0">Nothing scheduled today. Take a breath.</div>
      </section>

    </section>`;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/public/js/pages/home.js
git commit -m "feat(home): Today's briefing layout — hero revenue + compact stats + Harvest 22"
```

---

### Task 13: Emails page refresh

**Goal:** Template grid → content cards with subject / preheader / last-edited / language flags. No emoji, no icons-on-heads.

**Files:** `frontend/public/js/pages/emails.js`

- [ ] Write the new render, following the structure in spec §7.2. Use `data-ui="card"` primitives. Each card row: subject (body-16/500), preheader (body-sm meta), timestamp, flags (AR/EN as small tags). On hover reveal Edit / Duplicate / Delete as ghost buttons in a small action row.
- [ ] "New template" CTA moved to topbar slot (emit a `page:action` event the topbar listens for, or just render it inline for now — inline is simpler).
- [ ] Commit: `feat(emails): editorial template grid with hover actions`

### Task 14: Newsletter page refresh

**Goal:** Tabs (Drafts / Scheduled / Sent) using `data-ui` tabs. Each row is a hairline-separated list item. Compose at full-screen route. Stats page editorial treatment.

**Files:** `frontend/public/js/pages/newsletter.js`, `frontend/public/js/pages/newsletter-stats.js`

Commit: `feat(newsletter): editorial tabs + list + stats refresh`

### Task 15: Contacts page refresh

**Goal:** Split view kept. Left list uses hairline-separated rows, no cards. Right detail uses avatar 40px + H1 name + mono email + source tag + actions row.

**Files:** `frontend/public/js/pages/contacts.js`, `frontend/public/css/contacts.css` (strip page-scoped color tokens; rely on tokens.css)

Commit: `feat(contacts): editorial split view with hairline rows + primitive actions`

### Task 16: Coupons — inline expand, not modal

**Goal:** Replace the modal form with an inline expand panel that slides open below the row on Edit click; slides closed on Cancel/Save.

**Files:** `frontend/public/js/pages/coupons.js`

Implement with `grid-template-rows: 0fr / 1fr` transition (skill §7 `grid-template-rows` guidance). State: one expanded row at a time (localStorage ignored — ephemeral).

Commit: `feat(coupons): inline expand editor replacing modal form`

### Task 17: Lessons page refresh

**Goal:** Keep 3-col structure. Apply primitives to buttons/inputs/tags. Module headers get gold-hairline treatment. Rich editor toolbar uses primitive ghost buttons.

**Files:** `frontend/public/js/pages/lessons.js`, `frontend/public/css/lessons.css`, `frontend/public/js/ui/rich-editor.js` (toolbar markup)

Commit: `feat(lessons): primitives + editorial list chrome`

### Task 18: Link-in-bio refresh

**Goal:** List + preview. Preview panel inside a subtle phone-shaped container (no skeuomorph). `Open public page` already a pill CTA.

**Files:** `frontend/public/js/pages/linkbio.js`, `frontend/public/css/linkbio.css` (new)

Commit: `feat(linkbio): editorial list + phone-framed preview`

### Task 19: Activity page (archive view)

**Goal:** Full-page archive of the rail feed. Filters (type / date range / actor). Same row treatment as rail.

**Files:** Create `frontend/public/js/pages/activity.js`; register in `router.js`.

Commit: `feat(activity): full-page archive view with filters`

---

## Phase 4 — BL player

Applies the same system to the student watch page.

### Task 20: Bring tokens + primitives into `malearnsa-player` repo

**Goal:** Copy `tokens.css` and `primitives.css` into the player repo so both sites share the design language.

**Files:**
- Copy to: `~/code/malearnsa-player/css/tokens.css`
- Copy to: `~/code/malearnsa-player/css/primitives.css`
- Copy to: `~/code/malearnsa-player/css/primitives/toggle.css`, `toast.css`

Keep these as a **bundle** — never edit separately. Document in a header comment that the source of truth is the dashboard repo.

Commit in player repo: `feat(tokens): vendored tokens + primitives from ma-learn-dashboard@d9f0797`

### Task 21: Rewrite `watch.html` layout

**Goal:** Implement spec §8.2 — Bunny iframe left, 280px module list right, lesson title + description + rich content below, PDF pill CTA, V2 hooks embedded.

**Files:** `~/code/malearnsa-player/watch.html`

Commit: `feat(player): Editorial Atelier watch.html with 280px right module list`

### Task 22: V2 readiness hooks

**Goal:** Per spec §8.3 — add `data-progress` attrs on lesson rows, `<aside class="player-notes" hidden>` slot, bookmark icon slot hidden in topbar, `resume-from` query param read (passively stored in localStorage for V2).

**Files:** `~/code/malearnsa-player/watch.html`, `~/code/malearnsa-player/js/v2-hooks.js` (new tiny module)

Commit: `feat(player): V2 affordances — progress, notes slot, bookmark slot, resume-from`

### Task 23: Deploy player + BL smoke test

- [ ] Push to `Majidangawi/malearnsa-player` main; GitHub Pages rebuilds automatically
- [ ] Wait ~60s; curl `https://player.malearnsa.com/watch.html` to confirm new HTML
- [ ] Majid opens a real BL lesson link and confirms sign-off

Commit: `chore(player): ship BL redesign to production`

---

## Phase 5 — ITCAI player (after BL sign-off)

### Task 24: Verify BL production behavior for 2–3 days

No code changes; observe.

### Task 25: Apply identical template to ITCAI

Since ITCAI shares the same `watch.html` (product-agnostic), Task 21 already covers it. Task 25 is just:
- Visual QA against a real ITCAI token
- Adjust any course-specific copy (none expected)
- Sign-off

---

## Self-Review

**Spec coverage:**
- §1 direction → Tasks 1, 3 (typography, tokens, palette)
- §2 tokens → Task 1
- §3 typography → Task 1 (Cairo 200-900 linked)
- §4 iconography → Task 2
- §5 shell → Tasks 7, 8, 9, 11
- §6 primitives → Tasks 3, 4, 5
- §7.1 Home → Task 12
- §7.2 Emails → Task 13
- §7.3 Newsletter → Task 14
- §7.4 Contacts → Task 15
- §7.5 Coupons → Task 16
- §7.6 Lessons → Task 17
- §7.7 Linkbio → Task 18
- §7.8 Noor-retire → Task 11 (router change)
- §7.9 Activity page → Task 19
- §8 BL player → Tasks 20, 21, 22, 23
- §8.3 V2 hooks → Task 22
- §9 accessibility → baked into primitive CSS + token contrast
- §10 phases → Tasks grouped 1–6 / 7–11 / 12–19 / 20–23 / 24–25

All 11 spec sections mapped to tasks.

**Placeholder scan:** One intentional deferral — "Notifications + language: placeholder for Phase 3" in Task 8 topbar. Both are buttons that log to console until wired to real data. Everything else is filled in.

**Type consistency:** Activity event shape is shared between backend (`ActivityEvent` in `activity.ts`) and frontend (`activity-feed.js` consumes `{at, type, summary, actor}`). KPI shape is backend-authoritative; frontend reads it unchanged. Primitive `data-ui` attribute names are consistent across primitives.css, components, and pages that consume them.

**Risk acknowledged:** Tasks 13–18 are lighter on detail than Task 12 because they follow the same pattern established in the Home task (primitives + hairlines + editorial rhythm). Each subagent executing them should first re-read Task 12 for the pattern before touching their page.
