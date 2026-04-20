# Emails V2 + Newsletter — Design Spec

**Date:** 2026-04-20
**Author:** Majid Angawi + Noor
**Status:** Approved — ready for implementation plan
**Scope:** Two additions to the MA Learn Store Ops Dashboard — (1) upgrade the existing Emails page to a block-based composer with product-aware Noor and variable pills; (2) add a standalone Newsletter section with subscriber aggregation, scheduled broadcasts, Brevo-based delivery, and open/click tracking.

**Related:**
- Plan 1 foundation: [docs/superpowers/plans/2026-04-18-ma-learn-dashboard-foundation.md](../plans/2026-04-18-ma-learn-dashboard-foundation.md)
- Plan 2 features: [docs/superpowers/plans/2026-04-19-ma-learn-dashboard-features.md](../plans/2026-04-19-ma-learn-dashboard-features.md)
- Dashboard spec: [docs/superpowers/specs/2026-04-18-ma-ea-dashboard-design.md](2026-04-18-ma-ea-dashboard-design.md)

---

## Goal

Give Majid a single place to:
1. Compose drip templates and newsletter broadcasts in a visual, block-based editor (no syntax to memorize).
2. Manage a growing subscriber list aggregated from every place he captures an email.
3. Schedule broadcasts, send them, and see real open/click performance.

All of this without leaving the dashboard and without adding paid tooling.

---

## Architectural Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard frontend                                         │
│  ├─ Newsletter page (new)  ── card grid of emails           │
│  ├─ Emails page (V2)       ── upgraded composer             │
│  └─ Block composer (NEW shared component)                   │
│       Text · Heading · Banner · CTA · List · Divider · Var  │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────┐
│  Backend (Fastify on droplet)                               │
│  ├─ /api/data/newsletters, /subscribers                     │
│  ├─ /api/writes/newsletter/*  (CRUD + send/schedule)        │
│  ├─ /api/public/subscribe     (called by website + LIB)     │
│  ├─ /api/public/unsubscribe   (tokenized link in footer)    │
│  ├─ /api/webhooks/brevo       (delivered/open/click events) │
│  ├─ src/mail/provider.ts      (Brevo adapter — swappable)   │
│  ├─ src/mail/blocks.ts        (block JSON → HTML renderer)  │
│  └─ src/workers/scheduler.ts  (node-cron polls every 60s)   │
└─────────────────────┬───────────────────────────────────────┘
                      │
       ┌──────────────┼──────────────┐
       │              │              │
   ┌───▼───┐    ┌─────▼─────┐   ┌────▼────┐
   │ Sheet │    │   Brevo   │   │ Apps    │
   │       │    │  (send +  │   │ Script  │
   │ (SoT) │    │  events)  │   │ (writes)│
   └───────┘    └───────────┘   └─────────┘
```

- Sheet remains source of truth for all state.
- Brevo is only a delivery channel + tracking webhook source.
- Scheduler is a node-cron tick inside the existing Fastify pm2 process.
- Drip emails on the Emails page stay on Gmail (Apps Script). Only Newsletters go via Brevo. This is a deliberate clean split: drips are course-related, threaded, reply-routed; newsletters need deliverability + tracking + unsubscribe.

---

## Key Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Provider = **Brevo** (free tier: 300/day, 9k/month) | Covers projected scale 12+ months; includes tracking + unsubscribe; free |
| D2 | Behind a thin `src/mail/provider.ts` adapter | Swappable to Resend/MailerSend/etc. later with ~20-line change |
| D3 | Send from subdomain `newsletter.malearnsa.com` | Keeps Gmail Workspace SPF/DKIM untouched for personal/transactional |
| D4 | Scheduling = **backend node-cron poller** (60s tick) | State in sheet; edit/cancel = row update; works across providers |
| D5 | Subscribers = **single physical sheet** (`Subscribers`), not virtual union | Fast reads; easy unsubscribe flag; multi-source tracked via CSV `Sources` col |
| D6 | Opt-in model = **implied consent** (everyone who gives us their email) | Simpler; matches indie-creator KSA norms; unsubscribe always available |
| D7 | Composer = **Notion-style block editor** (shared between Emails V2 + Newsletter) | Majid uses Canva/Notion; block UX matches his mental model; build once, use twice |
| D8 | Block types v1 = Text, Heading, Banner, CTA, Bullet List, Divider, Variable pill | Covers 95% of email/newsletter needs; more blocks later |
| D9 | Blocks stored as **JSON** in sheet; existing markdown-lite templates auto-migrate on open | Source of truth = JSON; old templates keep working via shim |
| D10 | Language = **single-language per newsletter** (AR or EN chosen at create) | Industry norm; matches subscriber `language` preference; halves writing work |
| D11 | Resend = **Clone (v1) + Send to non-openers (v1)** | Both useful; non-openers needs event data so it ships when tracking does |
| D12 | Stats caveat: Apple Mail Privacy Protection inflates opens by ~40% | UI shows a small disclaimer under the open % |
| D13 | Signup forms = **Name + Email** (two inputs), inline in LIB, hero + footer on website | Matches Majid's explicit ask |
| D14 | Welcome email on first subscribe (auto) | Proves subscription; helps deliverability reputation |

---

## Subscribers System

### Sheet: `Subscribers` (new tab)

| Col | Type | Notes |
|---|---|---|
| Email | pk, lowercased | One row per unique email |
| Name | text | Best-known name |
| Sources | csv | `buyer,waitlist,website,lib` — multi-source allowed |
| Language | `AR` \| `EN` | Defaults `AR`; set by source or user |
| AddedAt | ISO datetime | First time seen |
| LastSourceAt | ISO datetime | Last new signup event |
| Status | `active` \| `unsubscribed` \| `bounced` | |
| UnsubscribedAt | ISO datetime \| null | |
| UnsubscribeToken | 24-char random | Used in email footer link |
| BrevoContactId | string \| null | For unsubscribe sync back to Brevo |

### Signup flows

Four sources, one `upsertSubscriber(email, name, source, language)` function:

1. **Buyer** — token-validator Apps Script writes to `Customers` on purchase. Add 2-line call to upsertSubscriber.
2. **Waitlist** — waitlist Apps Script writes to `Waitlist`. Same.
3. **Website form** (to build) — Name + Email, on malearnsa.com hero + footer. Posts to `/api/public/subscribe`.
4. **Link-in-bio form** (to build) — inline between header and links on linkinbio.malearnsa.com. Same endpoint.

`upsertSubscriber` logic: if row exists by email, append source to `Sources` (if not already present) + update `LastSourceAt`. If not, insert new row.

### One-time backfill

`scripts/backfill-subscribers.ts` reads `Customers` + `Waitlist` + any CIW tabs, produces de-duplicated rows, writes to `Subscribers`. Idempotent (re-runnable).

### Unsubscribe

- Every newsletter footer contains `https://newsletter.malearnsa.com/u/{token}` (token from Subscribers row).
- Clicking → public page `/api/public/unsubscribe` confirms + flips `Status=unsubscribed` + sets `UnsubscribedAt` + syncs to Brevo.
- One click, no login. Majid sees the unsub on the newsletter stats view.

### Brevo sync

- On send: push current `active` list to a Brevo "list" named `nl-{NewsletterID}`.
- Brevo handles delivery. Events come back via webhook.
- Unsubs initiated in Brevo also sync back to `Subscribers` via `unsubscribed` webhook event.

---

## Block Composer (shared)

### Block types (v1)

| Block | Fields | Rendered HTML |
|---|---|---|
| **Text** | plain text (bold/italic inline) | `<p>` paragraph |
| **Heading** | text | Gold-accent heading (`h2` equivalent) |
| **Banner** | image (upload or URL) + alt + optional link | Full-width responsive `<img>`, optionally wrapped in `<a>` |
| **CTA Button** | label + URL + optional color | Centered pill button, gold default |
| **Bullet List** | array of items | `<ul><li>...</li></ul>` |
| **Divider** | — | Thin gold horizontal rule |
| **Variable pill** | one of `{name}` `{product}` `{token}` `{course}` `{module}` `{nextModule}` `{playerURL}` `{unsubscribeUrl}` | Inline pill in text; replaced with actual value at send time |

### Composer UI behavior

- **Plus button** between blocks → block-picker popover
- **Drag handle** on left → reorder
- **Delete (×)** on hover, right side
- **Enter** in Text block = new paragraph inside same block; **Shift+Enter** = soft break
- **`/` slash command** inside a Text block → variable pill picker
- **RTL toggle** at top (defaults by newsletter language: AR=RTL, EN=LTR)
- **Live preview panel** on right — full brand-wrapped render, updates as you type

### JSON storage shape

```json
[
  {"type":"heading","text":"M4 unlocked — pose psychology"},
  {"type":"text","content":"Hi {name}, module 4 is live."},
  {"type":"banner","url":"https://drive/...","alt":"module 4","link":null},
  {"type":"cta","label":"Watch now","url":"https://player.malearnsa.com/m4","color":"gold"},
  {"type":"divider"}
]
```

### Rendering (`src/mail/blocks.ts`)

`renderBlocks(blocks, language, variables) → brandWrappedHTML`
- Iterates blocks, emits HTML fragments
- Substitutes variables at the end (after HTML assembly)
- Pipes through existing `brandWrapEmailBody` wrapper for consistent MA Learn branding

### Migration from old EmailTemplates

- Add `Blocks` JSON column to `EmailTemplates`
- When opening a template with empty `Blocks` col, backend parses `BodyAR`/`BodyEN` markdown-lite into block array and returns it
- First save in the new composer populates `Blocks` — from then on, blocks are canonical
- Old plain-text columns remain for safety but become secondary

### Image upload

- Click-to-upload inside a Banner block → uploads to Google Drive folder `MA Learn / Email Assets / YYYY-MM` via Apps Script
- Returns a permanent shared-URL
- 5 MB max per image; auto-resize if >1200px wide (via Apps Script Utilities)

---

## Newsletter Page

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Newsletter                                                 │
│  2,147 subscribers · 89% active        [+ New newsletter]   │
│                                                             │
│  [ All ] [ Drafts ] [ Scheduled ] [ Sent ]                  │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐                │
│  │ 📝 Draft  │  │ ⏰ Sched  │  │ ✓ Sent    │                │
│  │ Subject   │  │ Subject   │  │ Subject   │                │
│  │ edited 2h │  │ 21 Apr 9a │  │ 14 Apr    │                │
│  │           │  │ to 2,110  │  │ 42%/11%   │                │
│  └───────────┘  └───────────┘  └───────────┘                │
└─────────────────────────────────────────────────────────────┘
```

### Card states + actions

| State | Actions |
|---|---|
| **Draft** | Open · Send now · Schedule · Duplicate · Delete |
| **Scheduled** | Open (→ unschedule to draft) · Send now · Cancel schedule · Duplicate · Delete |
| **Sent** | Open (read-only) · View stats · **Clone** · **Resend to non-openers** · Delete |

### Compose view (full page)

Top bar: Back · Save draft · Schedule ▼ · Send now
Row 2: Subject · Language (AR \| EN) · Preheader · Segment selector (recipient count updates live)
Body: block editor (left) · live preview (right)

### Segment selector options

- All active subscribers (default)
- Buyers only / Waitlist only / Form signups only
- By language (AR only / EN only)
- Freeform multi-select by source
- Recipient count preview updates live

### Schedule dialog

```
Send on:  [ 2026-04-22 ▼ ]  [ 09:00 AM ▼ ]  KSA (UTC+3)
Presets:  [Tomorrow 9am] [Next Monday 9am] [Custom]
```

Minute resolution; KSA timezone fixed (Majid always operates in KSA).

### Scheduler (backend)

- `src/workers/scheduler.ts` — node-cron, 60-second tick
- Inside Fastify pm2 process (single instance; no clustering needed at this scale)
- Query: rows in `Newsletters` where `Status=scheduled AND SendAt <= now()`
- Atomic flip: `scheduled → sending` (optimistic lock via status check)
- Send pipeline: build recipient list from segment filter, render blocks, push to Brevo, mark `sent`
- Idempotency: each row has `IdempotencyKey`; a second attempt with same key is a no-op
- On pm2 restart: catches up all overdue rows on boot (within ~60s of start)

### Sheet: `Newsletters` (new tab)

| Col | Type |
|---|---|
| NewsletterID | uuid (pk) |
| Subject | text |
| Preheader | text |
| Language | `AR` \| `EN` |
| Blocks | JSON array |
| SegmentFilter | JSON (e.g. `{"sources":["buyer"],"language":"AR"}`) |
| Status | `draft` \| `scheduled` \| `sending` \| `sent` \| `failed` |
| CreatedAt · UpdatedAt · ScheduledAt · SentAt | ISO datetime |
| RecipientCount | int (snapshot at send) |
| DeliveredCount · OpenCount · ClickCount · BounceCount · UnsubCount | int (webhook-updated) |
| BrevoCampaignId | string \| null |
| IdempotencyKey | 24-char random |
| CreatedBy | `majid` \| `noor` |
| CloneOf | NewsletterID \| null (tracks provenance) |

---

## Tracking + Stats

### Brevo webhook

`POST /api/webhooks/brevo`
- Events: `delivered` · `opened` · `clicked` · `unsubscribed` · `hard_bounce` · `soft_bounce`
- Handler writes one row to `NewsletterEvents` + increments counters on the `Newsletters` row
- Signature verified using Brevo's webhook secret

### Sheet: `NewsletterEvents` (new tab)

| Col | Type |
|---|---|
| EventID | uuid |
| Timestamp | ISO datetime |
| NewsletterID | fk → Newsletters |
| Email | recipient |
| Event | `delivered` \| `opened` \| `clicked` \| `bounced` \| `unsubscribed` |
| URL | only for clicks |
| UserAgent | trimmed |

### Stats view

Per sent newsletter:
- Four KPI tiles: Sent · Delivered · Opened · Clicked (with absolute + %)
- Top-clicked links list (URL + click count)
- Unsubscribes count + % · Bounces count + %
- Actions: Clone · Resend to non-openers · Delete
- Apple Mail disclaimer: *"Open rates include proxy loads (Apple Mail). Clicks are the truer signal."*

### Resend to non-openers

- Reads `NewsletterEvents` for the newsletter → set of emails with any `opened` event
- New recipient list = original recipients minus openers
- Creates a new `Newsletters` row with `CloneOf=<original>`, same blocks, subject prefixed `(Resend) `
- Opens composer for final edits before send
- UI warns if first send was <6 hours ago

---

## Capture Forms

### Public endpoint

`POST /api/public/subscribe`

```json
{ "name": "Majid", "email": "foo@bar.com", "source": "website" | "lib", "language": "AR" | "EN" }
```

- Email format validation
- Honeypot: hidden field `website_url` — if filled, silently drop
- Rate limit: 5 submissions per IP per 10 min
- Calls `upsertSubscriber` via Apps Script
- Returns `{ ok: true }` always (never leak existence)
- No double opt-in (implied consent model)

### Website form

- **Placement 1:** Homepage hero — block directly under hero copy. Heading + sub + fields + button. Larger presence.
- **Placement 2:** Global footer — compact version, every page.
- Two inputs: Name, Email
- Copy AR + EN, auto-detected from `<html lang>` or browser preference
- Success state inline: "✓ You're in. Check your inbox."
- Both placements use the same HTML snippet with a size modifier

### Link-in-bio form

- **Placement:** Between header area (photo + taglines) and the link list
- Compact two-input row + Subscribe button
- Language follows LIB page's active language toggle
- On success: card collapses to `✓ شكراً — أنت في القائمة` / `✓ You're in`
- `localStorage` remembers "subscribed" so returning visitors don't see the form

### Welcome email

- First time an email lands in `Subscribers`, auto-trigger a welcome email
- Template: `EmailTemplates` row with `TemplateID=newsletter_welcome`
- Variables: `{name}` · `{firstContent}` (link to latest public content)
- Majid edits this template in the Emails page like any other
- Sent via Brevo (same infra as newsletters)
- Also serves as proof-of-subscription → deliverability signal for Gmail/Outlook

---

## Emails V2 Changes

The existing Emails page (M4/M5/M6 drip sender) inherits three upgrades from the shared infra:

1. **Textarea → block composer** — "Add new template" opens the shared composer. Old templates auto-parse into blocks on first open.
2. **Variable pills with live preview** — `/` slash in Text block → picker. Preview resolves with a sample recipient.
3. **Product-aware Noor drafts** — "Email by Noor" modal gains a `Product` dropdown: T3 / T2 / T1 / Beyond Lighting / None. When set:
   - Noor's drafting prompt includes product context
   - Auto-inserts a CTA block pointing to the right landing URL
     - T3 → `https://malearnsa.com/creative-ai-workshop`
     - T2 → `https://malearnsa.com/intro-to-creative-ai`
     - T1 → `https://malearnsa.com/prompt-pack`
     - BL → `https://malearnsa.com/beyond-lighting`
   - Draft output is already in block JSON, drops straight into composer

What stays unchanged on Emails page:
- Segment picker (buyers / T3 / T2 / Prompt Pack / BL)
- 500+ recipient extra-approval gate
- `EmailTemplates` sheet (gains `Blocks` column only)
- **Drip sends continue through Gmail / Apps Script** — NOT Brevo. Only newsletters use Brevo.

---

## Rollout Order (Six Slices)

Each slice is independently deployable to staging and testable before the next starts.

### Slice 1 — Foundation
- Create sheet tabs: `Subscribers`, `Newsletters`, `NewsletterEvents`
- Add `Blocks` JSON column to `EmailTemplates`
- Provision Brevo account (free tier)
- Add DNS on `newsletter.malearnsa.com` (SPF + DKIM + DMARC)
- Build `src/mail/provider.ts` (Brevo adapter) + `src/mail/blocks.ts` (block → HTML renderer)
- Apps Script admin endpoints (sheet writes only — send happens from backend):
  - `admin_upsert_subscriber` — insert/update Subscribers row
  - `admin_create_newsletter` — insert Newsletters row (draft)
  - `admin_update_newsletter` — edit draft/scheduled row
  - `admin_mark_newsletter_status` — atomic status transition (draft → scheduled → sending → sent/failed)
  - `admin_append_newsletter_event` — webhook writes events to NewsletterEvents + counter increments
  - `admin_mark_unsubscribed` — flip Status + sync to Brevo
- Backend `/api/webhooks/brevo` stub (accepts + logs; wiring in Slice 5)
- Actual Brevo send happens from the Node backend via the `src/mail/provider.ts` adapter — never from Apps Script. Apps Script is the sheet write path only (consistent with Plan 2 architecture).

### Slice 2 — Block composer (shared component)
- Block types v1 (Text · Heading · Banner · CTA · List · Divider · Variable)
- Live preview pane with brand-wrap render
- Image upload → Google Drive via Apps Script
- Old-template migration shim (markdown-lite → blocks on open)
- **Drop into Emails page first** — replaces textarea for "Add new template"

### Slice 3 — Emails V2 finish
- Variable pills via `/` slash command inside Text blocks
- Product field on "Email by Noor" modal
- Product-aware CTA auto-insert + drafting prompt context
- Smoke-test: send an M5 drip from new composer end-to-end via Gmail

### Slice 4 — Newsletter page + subscribers + signup endpoints
- `/api/public/subscribe` with honeypot + rate limit
- `scripts/backfill-subscribers.ts` one-time backfill from Customers + Waitlist
- Wire buyer + waitlist Apps Scripts to upsertSubscriber on new rows
- Newsletter page: card grid (Drafts/Scheduled/Sent tabs), compose view reusing block composer
- Send-now path through Brevo (no scheduling yet)
- Unsubscribe public page (`/u/:token`)

### Slice 5 — Scheduling + stats + tracking
- node-cron scheduler inside Fastify pm2 process
- `/api/webhooks/brevo` full wiring (events → `NewsletterEvents` + counter updates)
- Stats view per Sent newsletter
- Resend-to-non-openers flow

### Slice 6 — Signup forms on live surfaces
- LIB form — inline Name + Email + Subscribe between header and links
- Website form — homepage hero + global footer
- Welcome email auto-send on first subscribe
- Bilingual copy (AR + EN)
- localStorage "subscribed" remembrance on LIB

---

## Out of Scope (v1)

- Dedicated `/subscribe` landing page on malearnsa.com (not needed — hero + footer cover it)
- Double opt-in flow
- A/B subject testing
- Segmentation beyond source + language (e.g., tag-based, engagement-based)
- In-app bookkeeping of Brevo cost / usage (free tier, not needed yet)
- RSS/blog-to-email automation
- Visual template gallery (users pick the composer from scratch; templates are saved for re-use)
- Editing sent newsletters (sent = immutable; Clone to re-send modified)

Each of these is a clean v2 candidate.

---

## Risks + Mitigations

| Risk | Mitigation |
|---|---|
| Brevo free tier exhausted mid-send | Adapter-level `getRemainingQuota()` check before send; UI warns if list > remaining. Escape hatch: upgrade or swap provider |
| DNS misconfiguration on `newsletter.malearnsa.com` | Slice 1 ends with a DKIM/SPF/DMARC check via `dig` in the runbook. Test send to Majid's own inbox before wiring frontend |
| Apple Mail opens inflate numbers | UI disclaimer. Clicks are primary metric |
| Duplicate subscriber across sources | `upsertSubscriber` handles dedup by email; multi-source tracked in CSV |
| pm2 down during scheduled send | Scheduler catches up on boot; sends that miss by >60s are logged for manual review |
| Brevo webhook signature missing/forged | Verify via Brevo webhook secret; reject unverified POSTs |
| Old template migration corrupts blocks | Migration is read-only on open; first edit-and-save is when Blocks col gets written. Raw text column preserved as fallback |
| Newsletter sent to unsubscribed email | Scheduler re-queries active list immediately before send (not at schedule time) |

---

## Open Items for Implementation Plan

- Exact Brevo API endpoints + webhook event JSON shapes (pull from Brevo docs during Slice 1)
- DNS record values (produce after creating Brevo account + subdomain in Slice 1)
- Welcome email copy (AR + EN — Majid to draft during Slice 6)
- Rate-limit store (in-memory Map for v1, sufficient at scale)
- Unsubscribe token entropy (24 chars ≈ 144 bits, crypto.randomBytes)

These are implementation details, not design decisions — handled in the writing-plans phase.
