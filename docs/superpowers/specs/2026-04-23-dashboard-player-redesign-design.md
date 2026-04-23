# MA Learn Dashboard + Player Redesign — Design Spec

**Date:** 2026-04-23
**Owner:** Majid Angawi
**Design direction:** Editorial Atelier (dark editorial, gold-as-ink, craft-detailed)
**Scope:** Full dashboard at admin-staging.malearnsa.com + BL student player page; ITCAI follows after BL signs off.

---

## 1 · Aesthetic direction

**Editorial Atelier.** The admin reads like a darkroom magazine, not a SaaS dashboard.

- Unbleached-paper dark — never pure black. Warm-tinted neutrals pulled slightly toward the gold hue so the palette reads cohesive.
- Gold used as *editorial ink*: hairlines, emphasis marks, section rules, active-state pills, chosen numerals. Never as decorative glow or gradient.
- Typographic hierarchy does the work. Cairo 200 weight on display numbers gives a magazine pull-quote quality; Cairo 700 on section heads; body at 400/14–16.
- Asymmetric layouts with varied rhythm — tight clusters of related info, generous separation between sections. No uniform 4-up KPI grids.
- Intentional craft moves: gold rule sweep on link hover; 0.5px gold hairline as divider between editorial blocks; numerals in tabular figures for data.

**Anti-patterns explicitly rejected** (per frontend-design skill):
- Gradient text, gradient borders, rainbow accents
- Glassmorphism, blur-for-blur's-sake
- Sparklines as decoration (only where a real trend is present)
- Modals where an inline panel works
- Uniform card grids
- Cards nested in cards
- Pure `#000` / `#fff`
- Hero-metric layout template (big-number / small-label / stat-row / gradient)
- Rounded-icon-above-heading templated look

---

## 2 · Tokens (single `tokens.css`, zero per-page redefinitions)

### 2.1 Color — OKLCH-based, tinted toward gold

```css
/* Brand */
--c-gold:          oklch(0.74 0.12 82);      /* #C9A84C editorial ink */
--c-gold-bright:   oklch(0.82 0.13 85);      /* hover */
--c-gold-dim:      oklch(0.58 0.09 82);      /* rest state variants */

/* Surfaces — tinted neutrals (hue pulled toward gold at very low chroma) */
--c-ink-0:         oklch(0.08 0.003 82);     /* page bg — paper in shadow */
--c-ink-1:         oklch(0.11 0.004 82);     /* sidebar / rail */
--c-ink-2:         oklch(0.14 0.005 82);     /* cards resting */
--c-ink-3:         oklch(0.18 0.006 82);     /* hover / raised */
--c-ink-4:         oklch(0.23 0.006 82);     /* borders default */
--c-ink-5:         oklch(0.30 0.007 82);     /* borders accented */

/* Text */
--c-fg:            oklch(0.96 0.006 82);     /* primary */
--c-fg-2:          oklch(0.80 0.008 82);     /* secondary */
--c-fg-3:          oklch(0.62 0.009 82);     /* tertiary / meta */
--c-fg-4:          oklch(0.48 0.008 82);     /* disabled */

/* Semantic (muted to harmonize with gold) */
--c-success:       oklch(0.74 0.11 150);     /* muted green */
--c-warning:       oklch(0.77 0.12 78);      /* near-gold amber */
--c-danger:        oklch(0.68 0.14 28);      /* muted terracotta */
--c-info:          oklch(0.72 0.08 230);     /* muted teal, rare use */
```

### 2.2 Spacing — 8pt baseline, fluid on large screens

```css
--s-1: 4px;  --s-2: 8px;  --s-3: 12px;  --s-4: 16px;
--s-5: 24px; --s-6: 32px; --s-7: 48px;  --s-8: 64px;
--s-page-x: clamp(16px, 3vw, 40px);  /* page gutter fluid */
```

### 2.3 Radius scale

```css
--r-xs: 4px;  --r-sm: 6px;  --r-md: 10px;  --r-lg: 14px;  --r-xl: 20px;
--r-pill: 9999px;
```

### 2.4 Elevation — three tiers, no random shadows

```css
--e-card:   0 1px 2px rgba(0,0,0,0.4), 0 0 0 1px oklch(0.25 0.006 82 / 0.5);
--e-raised: 0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px oklch(0.30 0.007 82 / 0.6);
--e-modal:  0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px oklch(0.35 0.008 82 / 0.7);
--e-focus:  0 0 0 2px oklch(0.74 0.12 82 / 0.35);
```

### 2.5 Motion — exponential easing, reduced-motion respected

```css
--dur-fast: 150ms; --dur-med: 220ms; --dur-slow: 320ms;
--ease-out: cubic-bezier(0.22, 1, 0.36, 1);       /* ease-out-quint */
--ease-in:  cubic-bezier(0.64, 0, 0.78, 0);       /* ease-in-quad */
```

`@media (prefers-reduced-motion: reduce)` collapses all durations to 0 except fade transitions (opacity only).

---

## 3 · Typography — Cairo, used editorially

Single family: **Cairo** weights 200 / 400 / 500 / 700 / 900.

| Role | Font-size | Weight | Line-height | Tracking | Usage |
|------|-----------|--------|-------------|----------|-------|
| Display-XL | `clamp(48px, 6vw, 72px)` | **200** | 1.0 | -0.02em | Hero KPI numbers |
| Display-L  | `clamp(32px, 4vw, 48px)` | **200** | 1.05 | -0.015em | Secondary display numbers |
| H1 | `clamp(24px, 3vw, 32px)` | **700** | 1.2 | -0.01em | Page titles |
| H2 | 20px | 700 | 1.3 | 0 | Section heads |
| H3 | 16px | 700 | 1.4 | 0 | Subsection |
| Body | 16px | 400 | 1.6 | 0 | Default paragraph |
| Body-sm | 14px | 400 | 1.5 | 0 | Dense UI (table cells, list items) |
| Label | 12px | 500 | 1.4 | 0.08em (caps) | Nav section heads, KPI labels |
| Mono | 13px | 400 | 1.4 | 0 | IDs, tokens, codes (ui-monospace fallback stack) |

Numerals use **tabular figures** on all data displays (`font-variant-numeric: tabular-nums`) so columns align.

---

## 4 · Iconography

**Lucide** icons only, 1.5px stroke, rounded line-caps.
- Nav & inline: 18px
- Cards / section heads: 20px
- Empty states: 24px (not 48+ rounded template)

Zero emoji anywhere. Brand logo (`logo-majid-white.png`) kept only in the sidebar footer.

---

## 5 · Shell chrome

### 5.1 Sidebar — 240px, pinned left

```
┌────────────────────┐
│  logo              │  ← 56px header, logo + brand mark, thin gold hairline below
├────────────────────┤
│  🔍 Search  ⌘K    │  ← 40px input, muted
├────────────────────┤
│  DASHBOARD         │  ← label 12/500 caps gold-dim, tracked
│  ▸ Home            │
│  ▸ Activity        │  ← NEW, shows recent writes feed (reads from the right rail data)
│                    │
│  CONTENT           │
│  ▸ Emails          │
│  ▸ Newsletter      │
│  ▸ Lessons         │
│  ▸ Link-in-bio     │
│                    │
│  PEOPLE            │
│  ▸ Contacts        │
│  ▸ Coupons         │
│                    │
│  SETTINGS          │
│  ▸ Preferences     │  ← placeholder slot for later
│                    │
├────────────────────┤
│  Majid · staging   │  ← user + env badge at bottom; no fixed-position clutter
└────────────────────┘
```

- Active row: gold-hairline left border 2px + gold-dim background `oklch(0.74 0.12 82 / 0.08)` + gold-bright text. No filled pill.
- Hover row: `--c-ink-3` background, 150ms fade.
- Section headers: 12/500 caps, `--c-fg-3`, 24px top margin, 8px bottom.

### 5.2 Topbar — 56px

```
Page Title · subtitle                              [↻] [🔔] [globe] [avatar ▾]
```

- Breadcrumb-style title on the left: page name in H1-scale bold + optional subtitle in `--c-fg-3` (e.g., "Lessons · 39 total")
- Right cluster: refresh button (manual re-fetch), notifications bell (badge if activity unseen), locale toggle EN/AR, avatar dropdown with logout
- Thin gold hairline separator at the bottom (1px, `--c-gold-dim` at 20% opacity)

### 5.3 Right rail — 320px, pinned

```
┌──────────────────────┐
│  Noor                │  ← 56px title bar, collapsible chevron
│  ─────────           │
│                      │
│  [chat messages]     │  ← 60vh
│                      │
│  [input bar]         │
├──────────────────────┤
│  ACTIVITY            │  ← label, gold hairline above
│  · Lesson saved      │  ← last 20 writes
│  · Newsletter sent   │
│  · Token gifted      │
│  ...                 │
└──────────────────────┘
```

- No fill behind the rail — just a left-edge gold-dim hairline separating it from the main content area. Keeps the editorial feel.
- Collapsible: clicking Noor title collapses Noor, giving Activity full height. Collapse state persists in localStorage.
- Activity feed: timestamps use relative format ("2 min ago"), events grouped by day with subtle date dividers.

### 5.4 App grid

```css
.app-shell {
  display: grid;
  grid-template-columns: 240px 1fr 320px;
  grid-template-rows: 56px 1fr;
  grid-template-areas:
    "sidebar topbar   rail"
    "sidebar content  rail";
}
@media (max-width: 1280px) { rail collapses to 48px icon-only; }
@media (max-width: 1024px) { sidebar collapses to icons; }
```

---

## 6 · Component primitives

All components scoped under `[data-ui]` attributes so the per-page CSS never styles primitives directly.

### 6.1 Button

| Variant | Background | Text | Border | Radius |
|---------|------------|------|--------|--------|
| **primary** | `--c-gold` | `--c-ink-0` | none | pill |
| **secondary** | transparent | `--c-fg` | 1px `--c-ink-5` | pill |
| **ghost** | transparent | `--c-fg-2` | none | sm |
| **danger** | transparent | `--c-danger` | 1px `--c-danger` | pill |

Sizes: sm (32h / 12px), md (40h / 16px), icon-only (40×40 minimum tap).
Loading state: inline spinner replaces icon; button stays same width via `min-width`.
Press feedback: `transform: scale(0.98)` on `:active`; 0.95 on primary.

### 6.2 Input

- 40px height, 10px radius, `--c-ink-2` background, 1px `--c-ink-4` border.
- Focus: border → `--c-gold`, plus `--e-focus` ring.
- Label above, always visible (12/500 caps tracked, `--c-fg-2`). Placeholder in `--c-fg-4`.
- Helper text below, meta color. Error text replaces helper and turns `--c-danger`.
- Semantic types drive mobile keyboards (email, tel, number).

### 6.3 Toggle — liquid, vanilla CSS port

Port of `21st.dev/r/deepaksslibra/liquid-toggle`. Track 44×24; thumb animates on a cubic-bezier curve with a secondary squash (scaleX 0.9) mid-transition. Gold track when on, `--c-ink-4` when off. No React; pure CSS + a single `checked` class.

### 6.4 Table

- No zebra — instead, subtle hairline separators between rows (`--c-ink-4` at 50% opacity), 12px row padding.
- Sticky header, 12/500 caps labels, sortable columns show a small chevron that fills gold on active sort (aria-sort).
- Row hover: background `--c-ink-2`, actions menu (⋯) fades in on the right edge.
- Avatar cell: 28px with initials fallback (gold text on `--c-ink-3` background).

### 6.5 Card

Single `[data-ui="card"]` primitive. Two variants:

- **KPI card**: asymmetric. Label top-left (12/500 caps), display number Cairo 200 below, delta as text-only `↑ 0.4% vs. last week` in `--c-success` or `--c-danger`. **Sparkline only when real trend exists** (Revenue, New customers); absent on binary or capped metrics (Active tokens, Seats `N/30`, Total units).
- **Content card**: flat — `--c-ink-1` bg, 14px radius, `--e-card` elevation. Never nested inside another card.

### 6.6 Modal — reserved only for destructive confirm + new-item create

Everywhere else an inline expand panel replaces a modal. 16px radius, `--e-modal` shadow, backdrop `rgba(0,0,0,0.5)` + 4px backdrop-blur. Enter: scale 0.96 → 1 + fade, 220ms ease-out-quint. Esc closes. Unsaved-changes guard on close.

### 6.7 Tabs — underline

12/500 caps labels, underline bar transitions between active tabs (`transform: translateX()`, no layout shift). Underline is a 2px gold rule, `--c-fg-2` labels → `--c-fg` on active.

### 6.8 Tag / Badge

Pill, 20px tall, 10/500 caps text, colored by semantic (`--c-success-bg / --c-danger-bg / --c-gold-bg` at 15% opacity). Never two badges stacked per row.

### 6.9 Avatar

28px circle. Image if present, else initials in gold on `--c-ink-3`. No bordered ring, no status dot unless data requires it.

### 6.10 Toast — top-right stack

240–320px cards, `--e-raised`, slide-in-from-right 220ms ease-out-quint. Stack max 3 visible. Auto-dismiss 4s (5s for error). `role="status"` + `aria-live="polite"`.

### 6.11 Empty state

Icon 24px `--c-fg-3`, short headline (body 16/500), one-line subtitle (body-sm `--c-fg-3`), optional primary CTA. **Teaches** the interface — tells the user what to do, not just "nothing here."

### 6.12 Loading skeleton

Animated shimmer on `--c-ink-2` → `--c-ink-3`. Matches real content geometry. Never replaces `>1s` operations with a blocking spinner.

### 6.13 Dropdown menu

For overflow (⋯ on table rows, avatar menu). 10px radius, `--e-raised`, 8px padding, items 32h with hover `--c-ink-3`. Icon + label + optional shortcut hint.

---

## 7 · Page treatments

### 7.1 Home — "Today's briefing"

Not a KPI grid. A morning briefing:

- **Greeting row** (24px top): `Good morning, Majid · {date}` — Cairo 400 14px body. Under it a 0.5px gold hairline that stretches 120px (decorative-but-intentional).
- **Harvest 22 block**: a horizontal chapter marker. Title (H2) "M1 — Deliver Cohort 1", subtitle with start/end dates, then a filled progress bar 4px tall with gold fill. No ring; a simple bar feels more editorial. Below: "9 days to M2 start · May 3."
- **KPI row (asymmetric)**:
  - Left: Revenue this week — hero, Display-XL (Cairo 200) in tabular figures, SAR suffix smaller, delta text beneath, sparkline (14 days). Takes 50% width.
  - Right: four compact stats in a 2×2 mini-grid — New customers / Active tokens / T3 C2 seats `N/30` / Total units sold. No sparklines on these. Display-L (Cairo 200) numbers, labels above, no cards — separated only by hairlines.
- **What ships today**: pulled from the Linear M1 milestone (later) + today's calendar events. List with time + title + tag. Empty state: "Nothing scheduled today. Take a breath."

### 7.2 Emails

- Template grid with editorial treatment: each template is a `[data-ui="content-card"]` showing **subject line** (body 16/500), **preheader** (body-sm meta), **last-edited timestamp**, and **language flag(s)**. No icons on templates. Hover reveals an Edit/Duplicate/Delete row.
- `+ New template` primary button lives in the topbar right-slot for this page.
- Edit opens the composer page (full-screen route), no modal.

### 7.3 Newsletter

- Tabs: Drafts · Scheduled · Sent (underline style).
- Each row in each tab is a list item (no cards): subject, preheader, segment, scheduled-for or sent-at, counts (sent / opens / clicks with tabular figures). Hairline separator between rows.
- Compose lives at `#/newsletter/new` — full-screen composer with subject, preheader, segment selector, schedule control, then the block composer. Send button in topbar right-slot.
- Stats page gets the Editorial Atelier treatment: opens/clicks/bounces in Display-L numbers with tiny sparklines, links table beneath.

### 7.4 Contacts

- Split view kept. Left list gets hairline-separated rows (no cards per row). Right detail shows avatar + name in H1, email in mono, source badge, key dates, five actions as ghost buttons. Timeline of emails / purchases / gifts below.

### 7.5 Coupons

- Inline expand — not modal — for edit (replaces current modal). Clicking a row expands a panel below it with the form; collapse on Cancel/Save.
- New coupon: the `+` button at top opens a fresh inline panel at the top of the table.
- Status shown as subtle colored dot (not a filled badge), with a label next to it.

### 7.6 Lessons

- Kept 3-col structure (editor left / list right).
- List gets the same hairline-separated treatment. Module headers become a small-caps gold label with a hairline rule below.
- Editor: title (H1), meta row (course · module · lesson `N/M`), then fields arranged with breathing room, rich editor with refreshed toolbar (ghost-style buttons, 1.5px Lucide strokes), actions row bottom-aligned.

### 7.7 Link-in-bio

- Keep list + preview split. Preview panel frames the live page in a phone-shaped container (subtle outline, 32px radius — no actual phone skeuomorph). `Open public page` pill CTA above the preview (already done).

### 7.8 Noor — route retired

Lives only in the right rail. `#/noor` redirects to Home with the rail expanded.

### 7.9 Activity — new route

Same data as the rail's lower half but full-width, filterable (by type / actor / date range). Rail is the live feed; this page is the archive.

---

## 8 · BL student player redesign

**Functionality: UNCHANGED.** Only visual re-skin + structural preparation for V2.

### 8.1 Current state

- `projects/ma-learn-launch/player-watch.html` (or equivalent) — full-screen watch page. Token auth, video via Bunny iframe, PDF link, module navigation list.

### 8.2 Redesign

Same system as admin (tokens + typography + icons), applied to a three-zone layout optimized for focused learning:

```
┌───────────────────────────────────────────────────────┐
│  ← Course · Module · Lesson                    [⋮]    │  ← 56px topbar, hairline below
├─────────────────────────────────────┬─────────────────┤
│                                     │                 │
│   [Bunny iframe 16:9]               │   MODULE 3      │  ← 280px module list on the right
│                                     │   ▸ Lesson 1    │     (matches admin rail vibe)
│                                     │   ● Lesson 2 ← active  ← small gold dot indicates active
│                                     │   ▸ Lesson 3    │
│   Lesson title (H1)                 │                 │
│   Description body                  │   MODULE 4      │
│                                     │   (collapsed)   │
│   ─── gold hairline ───             │                 │
│                                     │                 │
│   Lesson content (rich HTML)        │                 │
│   with inline images                │                 │
│                                     │                 │
│   [Download PDF pill CTA]           │                 │
│                                     │                 │
└─────────────────────────────────────┴─────────────────┘
```

- Video gets a 12px radius + subtle inner-shadow frame — reads as "screening", not "floating".
- Under the video, the lesson title in Cairo 700 + muted breadcrumb above.
- Rich HTML content rendered with the editorial paragraph rhythm (1.7 line-height, 65ch max width).
- PDF shown as a single pill CTA, not a file-drop icon with filename.
- Module list on the right: hairline-separated lessons, active lesson marked with a gold dot + slightly brighter text.

### 8.3 V2 readiness — structural hooks, no UI yet

Leave these affordances in the DOM + state model so V2 slots in without rebuild:
- `data-progress` attribute on each lesson row (empty in V1, populated by V2 progress tracking)
- `<aside class="player-notes">` placeholder next to the content column (`display: none` in V1) — V2 enables it for note-taking
- Bookmark icon slot in the topbar right (hidden in V1)
- `resume-from` query param respected in V1 (passive) so V2 can deep-link into saved positions

### 8.4 Rollout

1. BL lands first (`bl-player-watch.html` or current live equivalent)
2. Majid spends 1–2 days using it as a student
3. If signed off, apply identical template to ITCAI player
4. V2 feature work is a separate spec/plan later

---

## 9 · Accessibility guarantees

- Contrast ≥ 4.5:1 on body text, ≥ 3:1 on large display. Verified via OKLCH lightness calc.
- Focus rings visible on every interactive element (2px `--c-gold` outline + `--e-focus` bloom).
- Full keyboard navigation through sidebar → topbar → main → rail. `Tab` order matches visual order.
- `aria-live="polite"` on toasts + form errors. `aria-current="page"` on active nav item.
- `prefers-reduced-motion`: collapses all non-essential motion. Rail collapse/expand becomes instant.
- Bilingual content gets correct `lang` + `dir` attributes at the element level (not document-level) so Arabic paragraphs render RTL inside an LTR shell.

---

## 10 · Implementation phases (outline — detailed plan comes in writing-plans skill)

**Phase 1 — Foundation (invisible).** Single `tokens.css`, remove all per-page redefinitions, Lucide imports, base primitives (`button`, `input`, `toggle`, `card`, `table`, `modal`, `tabs`, `tag`, `avatar`, `toast`, `empty-state`, `skeleton`, `dropdown`). Nothing visually changes until Phase 2 is wired.

**Phase 2 — Shell.** Sidebar, topbar, right rail, app grid. Existing pages keep working but render inside the new shell.

**Phase 3 — Page-by-page pass.** Home (hardest, new "briefing" layout) → Emails → Newsletter → Contacts → Coupons → Lessons → Link-in-bio. Activity page added. Noor route retired. Each page ~60–90 minutes of polish.

**Phase 4 — BL player.** Apply tokens + typography + shell language to BL. Ship. Observe.

**Phase 5 — ITCAI player.** After BL sign-off, same template.

**Deferred:** Settings page build-out, V2 player features, production promotion.

---

## 11 · Out of scope (explicit)

- No functional changes to any feature
- No new data sources
- No Apps Script changes
- No auth / backend route changes
- No mobile-first rebuild (desktop stays primary; existing responsive breakpoints preserved, refined)
- No Linear / Calendar integration on Home "What ships today" — shown as empty state for now; wiring to Linear is a separate task
