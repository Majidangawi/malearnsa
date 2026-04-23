# Contacts / CRM — Design Spec

**Date:** 2026-04-23
**Author:** Majid Angawi + Noor
**Status:** Approved — ready for implementation plan
**Scope:** New Contacts page in the MA Learn Store Ops Dashboard. Unifies every person in Majid's world (buyers + waitlist + newsletter signups) into a single browsable, actionable surface with a split-view list + detail panel.

**Related:**
- Dashboard foundation plan: [docs/superpowers/plans/2026-04-18-ma-learn-dashboard-foundation.md](../plans/2026-04-18-ma-learn-dashboard-foundation.md)
- Dashboard features plan: [docs/superpowers/plans/2026-04-19-ma-learn-dashboard-features.md](../plans/2026-04-19-ma-learn-dashboard-features.md)
- Newsletter + Emails V2: [docs/superpowers/specs/2026-04-20-emails-v2-and-newsletter-design.md](2026-04-20-emails-v2-and-newsletter-design.md)

---

## Goal

Give Majid one surface for every person in his world (buyers, waitlist, newsletter signups) — browsable, searchable, actionable. Replace the current workflow of hunting through four different sheets (Customers, Waitlist, Tokens, Subscribers) to answer questions like:
- "What has this person bought?"
- "Do they have an active T2 token?"
- "Can I resend them their access link?"
- "Can I gift them T3 as a thank-you?"

The page is **browser-first** — Majid uses it primarily to look people up and understand context, with per-contact actions secondary (used when a specific moment demands it).

---

## Key Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Center of gravity**: contact browser + 1:1 outreach + access support — all three with browsing as primary | Majid confirmed this framing. Matches how he actually uses a CRM: browse to understand, then act when a moment demands |
| D2 | **Split view** (list left, detail right) instead of list → full-page profile | Fastest for rapid browsing; preserves filter state when jumping between contacts; matches Notion/Linear/Gmail pattern |
| D3 | **No new sheet tabs** — joins happen in backend | Subscribers already aggregates sources; Customers / Tokens are authoritative for purchases / access |
| D4 | **Subscribers sheet is the primary list** (one row per unique email), enriched with joins at read time | Already deduplicated; already has sources CSV; already maintained by upsert flows |
| D5 | **Reuse the block composer** for "Send email" — auto-set segment to single recipient | One composer to maintain; Majid already knows it |
| D6 | **New Apps Script endpoints** for gift + resend access + remove subscriber | Keeps writes consistent with the existing `admin_*` pattern |
| D7 | **Delete requires a preview-confirm modal** (per Majid's explicit ask + existing SOP memory on destructive actions) | Destructive actions always show full data preview before action |
| D8 | **Tokens are masked** in the detail view (reveal-on-click) | Reduces accidental screenshot leaks |
| D9 | **v1 out of scope**: tags, notes, unsubscribe toggle, engagement stats, bulk actions | Ship a focused v1; these are v2 candidates |
| D10 | **Cache list reads in memory (~30s TTL)** on the backend | Sheets API rate limits; list is re-read often as filters change |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Dashboard frontend (admin-staging.malearnsa.com)            │
│  └─ Contacts page (#contacts)                                │
│     ├─ Left: filterable/searchable list                      │
│     └─ Right: detail panel with action bar                   │
└────────────────┬─────────────────────────────────────────────┘
                 │
┌────────────────┴─────────────────────────────────────────────┐
│  Backend (Fastify on droplet, existing)                      │
│  New routes:                                                 │
│  ├─ GET  /api/data/contacts              list view rows      │
│  ├─ GET  /api/data/contacts/:email       full detail         │
│  ├─ POST /api/writes/contact/resend_link                     │
│  ├─ POST /api/writes/contact/gift                            │
│  └─ POST /api/writes/contact/delete                          │
│                                                              │
│  Reused routes:                                              │
│  ├─ POST /api/writes/newsletter/send_now                     │
│  │       (with extended segmentFilter.onlyEmails: [email])   │
│  └─ Existing composer + approval modal on the frontend       │
└────────────────┬─────────────────────────────────────────────┘
                 │
┌────────────────┴─────────────────────────────────────────────┐
│  Google Sheet reads (existing, via sheets-read.ts):          │
│  Subscribers · Customers · Tokens · NewsletterEvents         │
│                                                              │
│  Writes via Apps Script admin_* endpoints (pushed via clasp):│
│  ├─ admin_gift_token            NEW                          │
│  ├─ admin_remove_subscriber     NEW                          │
│  └─ admin_resend_access_link    NEW                          │
└──────────────────────────────────────────────────────────────┘
```

No new sheet tabs. Joins happen on read. Writes thread through the existing Apps Script pattern.

---

## Data Model

### List view row (lightweight — fits the ~380px left column)

| Field | Source |
|---|---|
| `email` (pk, lowercased) | Subscribers |
| `name` | Subscribers |
| `language` | Subscribers |
| `sources` (array) | Subscribers.Sources (csv → array) |
| `status` | Subscribers (active / unsubscribed / bounced) |
| `hasBought` | computed — any Customers row matches email |
| `productsBought` | set of distinct products from Customers |
| `addedAt` | Subscribers.AddedAt |
| `lastActivityAt` | max(Subscribers.LastSourceAt, latest Customers.PurchasedAt) |

### Detail view (lazy-loaded on row select)

Everything from the list row, plus:

| Section | Fields |
|---|---|
| **Identity** | email · name · phone (from Customers if present) · language · status |
| **Sources** | each source with "first seen" date |
| **Purchases** (ordered newest first) | product · amountSAR · coupon · paymentId · purchasedAt |
| **Tokens** (per course) | product · masked token · status (unused/used/revoked) · reveal button |
| **Metadata** | addedAt (with source) · lastActivityAt (with event type) |

Phone comes from Customers because Subscribers doesn't store phone. We take the most-recent Customers row that has a non-empty phone.

---

## List View

### Layout (left column, ~380px on 13" laptop)

```
┌─────────────────────────────────────────┐
│  Contacts                               │
│  1,247 contacts · 23 unsubscribed       │
│                                         │
│  [🔍 Search by name or email…]          │
│                                         │
│  Status:   [All ▼]                      │
│  Sources:  [All sources ▼]              │
│  Products: [All products ▼]             │
│  Language: [AR | EN | All]              │
│  Sort:     [Last activity ▼]            │
│  ────────────────────────────────       │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ 👤 Majid Angawi                   │  │
│  │ majed.engawi@gmail.com            │  │
│  │ [buyer] [waitlist] · T3 · T2      │  │
│  │ 3 days ago                        │  │
│  └───────────────────────────────────┘  │
│  ...                                    │
└─────────────────────────────────────────┘
```

### Row structure

- Avatar circle with initials (no photos)
- Name (falls back to "—" if blank)
- Email in smaller muted text
- Source chips (colored pills: buyer / waitlist / website / lib)
- Product badges (tiny: T2 · T3 · BL · PP)
- Last activity relative time ("3 days ago", "2 weeks ago")
- Unsubscribed rows: dimmed with a strikethrough indicator

### Filters

1. **Status**: All / Active / Unsubscribed / Bounced (single-select)
2. **Sources**: All / Buyer / Waitlist / Website / LIB (multi-select)
3. **Products**: All / T2 / T3 / BL / PP / Non-buyer (multi-select)
4. **Language**: All / AR / EN (single-select)

### Sort (single-select)

- Last activity (default, newest first)
- Added date
- Name (A → Z)

### Search

- Live-filter on name + email as you type (debounced 200ms)
- Case-insensitive substring match (not fuzzy — predictable)

### Scale strategy

- Render up to 500 rows directly — no pagination in v1
- Current list size: ~100 rows. Projected: ~1,000 in 12 months
- If performance degrades past 500, add virtualized scrolling in v2

---

## Detail Panel

### Layout (right column)

```
┌──────────────────────────────────────────────────────────┐
│  ← Majid Angawi                            [⋯] [× close] │
│  majed.engawi@gmail.com  📋                              │
│  Active · AR · KSA (+966 · 0501234567)                   │
│                                                          │
│  ┌─ Action bar ──────────────────────────────────────┐   │
│  │ [✉ Send email] [🔗 Resend link] [🎁 Gift] [🗑]   │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
│  ── Sources ──────────────────────────────────────────   │
│  • buyer       — first seen 14 Apr 2026                  │
│  • waitlist    — first seen 02 Apr 2026                  │
│                                                          │
│  ── Purchases (2) ────────────────────────────────────   │
│  ┌──────────────────────────────────────────────┐        │
│  │ T3 — Creative AI Workshop                    │        │
│  │ 799 SAR · coupon EARLYBIRD · 14 Apr 2026     │        │
│  │ Payment: pay_xyz123                          │        │
│  └──────────────────────────────────────────────┘        │
│  ┌──────────────────────────────────────────────┐        │
│  │ T2 — Intro to Creative AI (gift with T3)     │        │
│  │ 0 SAR · 14 Apr 2026                          │        │
│  └──────────────────────────────────────────────┘        │
│                                                          │
│  ── Tokens (2) ───────────────────────────────────────   │
│  T3  MAL-████████  used      [reveal]                    │
│  T2  MAL-████████  used      [reveal]                    │
│                                                          │
│  ── Metadata ─────────────────────────────────────────   │
│  Added: 02 Apr 2026 (waitlist)                           │
│  Last activity: 14 Apr 2026 (T3 purchase)                │
└──────────────────────────────────────────────────────────┘
```

### Behavior

- **Copy email**: clipboard icon next to email; click → "Copied ✓" flash
- **Tokens reveal**: masked by default (`MAL-████████`); first click reveals; second click copies
- **Close**: `×` top-right or `Escape` key — list stays
- **Keyboard nav**: `j` / `k` or arrow keys cycle contacts in list without mouse
- **Empty state**: "Select a contact on the left" placeholder when nothing selected
- **`⋯ more` dropdown**: reserved for v2 (tags, notes, unsubscribe toggle)

---

## Per-Contact Actions

### 1. Send email (`✉`)

- Opens the shared block composer (same one used for newsletter + email templates).
- Segment chip auto-set to **"Just this person"** — non-editable, shows their email + name.
- Subject + blocks behave identically to a newsletter send.
- On send: routes through Brevo with this single recipient. Appears in Newsletter "Sent" list, stats labeled as 1 recipient.
- Backend change: `segmentFilter` gets an optional `onlyEmails: string[]` field. When set, applyFilter returns ONLY rows matching those emails (ignores other filters).

### 2. Resend access link (`🔗`)

- Dropdown of courses this contact owns (derived from Tokens sheet).
- Click a course → pulls existing token → re-sends the original access email from `token-validator` Apps Script (using the same template delivered at purchase).
- Confirmation toast: "Resending T2 access to `majed.engawi@gmail.com`…" → "Sent ✓"
- **Disabled state**: no active tokens → tooltip "No active courses to resend."
- Backend: new Apps Script endpoint `admin_resend_access_link` that takes `{email, product, admin_token}` and calls the existing `build<X>Email` + `GmailApp.sendEmail` path.

### 3. Gift access (`🎁`)

- Modal with:
  - Dropdown: "Pick a course" (T2 / T3 / BL / Prompt Pack)
  - Optional note field (included in the email)
  - Cancel / Gift it buttons
- On confirm: calls new `admin_gift_token` Apps Script endpoint which:
  1. Finds an available token for the picked course (status=available)
  2. Marks it used, assigns to this contact's email
  3. Writes a new row to Customers with amount=0, coupon="gift", paymentId="gift-{uuid}"
  4. Sends the standard access email (same template as a real purchase)
- Detail panel refreshes to show the new Purchase + Token rows.
- Backend: new Apps Script endpoint `admin_gift_token`. Backend route `POST /api/writes/contact/gift` wraps it.

### 4. Copy email (`📋`)

- Clipboard icon next to the email in the detail header.
- Click → `navigator.clipboard.writeText(email)` → "Copied ✓" flash for 1 second.

### 5. Delete (`🗑`) — with safety confirmation

Per Majid's explicit ask + the SOP memory on destructive actions.

Confirmation modal:

```
┌──────────────────────────────────────────────────────┐
│  Delete this contact?                                │
│                                                      │
│  Majid Angawi                                        │
│  majed.engawi@gmail.com                              │
│  Sources: buyer, waitlist                            │
│  2 purchases · 2 active tokens                       │
│                                                      │
│  This removes their row from the Subscribers sheet.  │
│  Their purchase history, tokens, and access stay     │
│  intact — they can still log in with existing        │
│  access links. They simply stop receiving            │
│  newsletters and won't appear in Contacts.           │
│                                                      │
│  To fully revoke access, edit the Tokens sheet       │
│  directly.                                           │
│                                                      │
│  [Cancel]          [Delete this contact]             │
└──────────────────────────────────────────────────────┘
```

On confirm:
- Calls `admin_remove_subscriber` Apps Script endpoint — deletes the Subscribers row matching the email.
- Does NOT touch Customers, Tokens, or NewsletterEvents.
- Detail panel closes, list refreshes, contact disappears.

### Error handling (all actions)

- Network / Apps Script errors surface as inline toast at the top of the detail panel:
  `⚠ Couldn't resend — try again in a moment. (Error: apps_script_not_found)`
- All write actions return a `{ok: boolean, error?: string}` shape consistent with existing admin_* endpoints.
- No action is destructive on the frontend side — all state changes flow through backend → Apps Script.

---

## Backend

### New routes

| Route | Method | Purpose |
|---|---|---|
| `/api/data/contacts` | GET | List view. Query params: `status`, `sources`, `products`, `language`, `q` (search), `sort`. Returns array of list-view rows. Cached in memory for 30s |
| `/api/data/contacts/:email` | GET | Detail view. Returns joined detail object. No cache — always fresh |
| `/api/writes/contact/resend_link` | POST | Body: `{email, product}`. Calls `admin_resend_access_link` |
| `/api/writes/contact/gift` | POST | Body: `{email, product, note?}`. Calls `admin_gift_token` |
| `/api/writes/contact/delete` | POST | Body: `{email}`. Calls `admin_remove_subscriber` |

All under existing auth guard — the whole `/api/writes/contact/*` namespace is admin-only.

### In-memory list cache

Prevents re-hitting Sheets API when Majid toggles filters rapidly.

```typescript
// backend/src/data/contacts.ts
let cache: { at: number; rows: ContactListRow[] } | null = null;
const TTL = 30_000;

export async function readContacts(): Promise<ContactListRow[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.rows;
  const [subs, custs, tokens] = await Promise.all([
    readSheet({ tab: 'Subscribers' }),
    readSheet({ tab: 'Customers' }),
    readSheet({ tab: 'Tokens' }),
  ]);
  const rows = joinContactList(subs, custs, tokens);
  cache = { at: Date.now(), rows };
  return rows;
}

export function invalidateContactsCache(): void {
  cache = null;
}
```

Any write action (`gift`, `delete`, or new buyer upsert) calls `invalidateContactsCache()` so the next GET re-reads.

### Extend `segmentFilter` for 1:1 email

```typescript
// backend/src/data/segment-filter.ts
export interface SegmentFilter {
  sources?: string[];
  language?: 'AR' | 'EN';
  excludeUnsub?: boolean;
  excludeEmails?: string[];
  onlyEmails?: string[];   // NEW — when present, return only matching emails (ignores other filters)
}
```

### Apps Script additions (pushed via clasp — no UI pasting)

Three new endpoints appended to the live `token-validator` project:

- **`admin_gift_token`** — `{email, name, product, admin_token}` → finds available token, marks used, writes Customers row with amount=0, sends access email
- **`admin_remove_subscriber`** — `{email, admin_token}` → deletes matching Subscribers row
- **`admin_resend_access_link`** — `{email, product, admin_token}` → looks up existing token for that email+product, rebuilds access email HTML, sends via GmailApp

All three follow the existing `admin_*` naming + ADMIN_TOKEN gate pattern. Pushed via clasp just like the previous round.

---

## Frontend

### New files

- `frontend/public/js/pages/contacts.js` — the Contacts page (list + detail split view, all interaction logic)
- `frontend/public/css/contacts.css` — tokenized styling scoped to `.contacts-page`, uses the same design system tokens established for the composer (per SOP: all design work goes through `/ui-ux-pro-max`)

### Modified files

- `frontend/public/js/router.js` — register `#contacts` route
- `frontend/public/js/ui/sidebar.js` — add nav entry
- `frontend/public/app.html` — link `contacts.css`

### Design pass

Per the SOP memory on `/ui-ux-pro-max`: **before writing CSS, invoke the skill** with a query for "CRM admin tool dark dashboard craft sophisticated Saudi content-creator" — apply the resulting design system + priority 1–10 rules.

---

## Out of Scope for v1

- **Tags**: free-form labels per contact (e.g. `#vip`, `#T3-alumni`)
- **Notes**: free-text private notes per contact
- **Unsubscribe toggle**: currently handled via the email footer + public `/u/:token`
- **Engagement stats**: open rates, click history, last newsletter opened (needs more Brevo event data first)
- **Bulk actions**: multi-select + act on many (e.g. "gift T3 to these 5")
- **Pagination / virtualization**: only if list grows past 500 rows
- **Contact merge UI**: combining duplicate emails (the upsert flow already dedupes by email; merging is for data hygiene, not v1)
- **Export to CSV**: no external system needs this yet
- **Audit log UI**: per-contact timeline of actions taken (Apps Script writes to AuditLog already — just no UI reading it)

Each of these is a v2 candidate. None block v1.

---

## Risks + Mitigations

| Risk | Mitigation |
|---|---|
| Sheets API rate limit from list re-reads | 30s in-memory cache, invalidated on write |
| Slow initial load with growing contact count | Virtualize only if we see it at >500 rows. Current ~100, plenty of headroom |
| Tokens leaked via screenshots | Masked by default, reveal-on-click |
| Gift token with no available tokens in sheet | Apps Script returns `{ok: false, error: 'no_tokens_available'}`; frontend shows clear error toast |
| Resend link when there's no existing token | Button disabled with tooltip; server-side also guards |
| Accidental delete | Preview-confirm modal shows full contact data; button copy is explicit ("Delete this contact") |
| Stale list after write | Write endpoints invalidate cache synchronously; next read is fresh |
| 1:1 email misfiring as bulk | `onlyEmails` short-circuits the filter in applyFilter; tests cover this |

---

## Rollout Order (two slices)

### Slice 1 — List + detail (read-only)
- `readContacts` + `readContactDetail` backend functions
- GET routes + cache
- Contacts page frontend (list, filters, search, detail panel)
- Design pass via `/ui-ux-pro-max`

### Slice 2 — Actions
- Apps Script: `admin_gift_token`, `admin_remove_subscriber`, `admin_resend_access_link` (pushed via clasp)
- Backend POST routes wrapping each
- Segment filter `onlyEmails` extension + route update
- Frontend action bar, modals, confirmations

Each slice ends with a commit + staging deploy + Majid smoke test before the next starts.

---

## Open Items for Implementation Plan

- Exact copy for empty states (`No contacts yet`, `Select a contact`)
- Toast styling + positioning (reuse existing approval-modal toast if one exists, else a small bottom-right region)
- Keyboard shortcuts: `j`/`k` vs arrow keys only — confirm during plan writing
- Masked token character: `█` vs `•` — during plan writing
- Exact payload shape for gift email (new template or reuse existing `admin_send_email` with a course-specific subject line)

These are implementation details, not design decisions — handled in the writing-plans phase.
