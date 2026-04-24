# MA Learn — Platform Documentation

*Living reference covering everything on malearnsa.com and its subdomains. Keep this current whenever platform state changes — append decisions to `decisions/log.md` first, then mirror structural changes here.*

**Last updated:** 2026-04-24 (Chat V1 shipped, platform map snapshotted)

---

## Quick navigation

1. [Overview](#1-overview) — what MA Learn is, north star, tier structure
2. [Domains + subdomains](#2-domains--subdomains) — canonical URL → repo → hosting map
3. [Repositories](#3-repositories) — git remotes, local clones, deploy triggers
4. [Products](#4-products) — landing pages, checkout flows, pricing
5. [Payment architecture](#5-payment-architecture) — Moyasar, Salla, Tamara, Apple Pay, Daftra
6. [Token system](#6-token-system) — access control model
7. [Player](#7-player) — `player.malearnsa.com`
8. [Chat V1](#8-chat-v1) — per-lesson Supabase-backed discussion
9. [Dashboard](#9-dashboard) — `admin.malearnsa.com` + `api.malearnsa.com`
10. [Data layer — Google Sheets](#10-data-layer--google-sheets)
11. [Apps Script ecosystem](#11-apps-script-ecosystem)
12. [Noor bot](#12-noor-bot) — `@MajidNoorBot` on Telegram
13. [Bunny.net](#13-bunnynet) — video hosting
14. [Daftra](#14-daftra) — ZATCA invoicing
15. [Email infrastructure](#15-email-infrastructure)
16. [Waitlist](#16-waitlist)
17. [Newsletter](#17-newsletter)
18. [Link-in-bio](#18-link-in-bio)
19. [Analytics + tracking](#19-analytics--tracking)
20. [LLM/SEO discovery](#20-llmseo-discovery)
21. [Hosting + deployment](#21-hosting--deployment)
22. [Security model](#22-security-model)
23. [Backup + rollback](#23-backup--rollback)
24. [Observability](#24-observability)
25. [Operating SOPs](#25-operating-sops)
26. [Deferred / post-wedding](#26-deferred--post-wedding)
27. [Operational gotchas](#27-operational-gotchas)
28. [Reference index](#28-reference-index)

---

## 1. Overview

### 1.1 What MA Learn is

MA Learn is a creative education platform at `malearnsa.com`, owned and operated by **Majid Angawi** from Jeddah, KSA. It sells photography + creative-AI education to Arabic-speaking creators.

**North star:** إلهام مليون شخص — inspire one million people to believe in their creative potential (per [context/me.md](../context/me.md)).

**Brand slogan:** صناعة الإلهام (Making Inspiration).

### 1.2 Two businesses

Majid runs two distinct brands; the tech stack is shared but audiences are separate.

1. **Majid Angawi (personal brand)** — high-end creative services for brands: fashion/jewelry photography, creative direction, AI imagery, video. Target: 10,000+ SAR/month. Personal site is at `majidangawi.com` (separate repo, out of scope for this doc).
2. **MA Learn (education platform)** — the subject of this document. Target: 30,000–50,000 SAR/month via digital products, courses, cohorts, mentorship. All surfaces live under `malearnsa.com` + subdomains.

### 1.3 Tier structure (product line)

Locked pricing from [memory/project_harvest22_pricing.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/project_harvest22_pricing.md) — 2026-04-22:

| Tier | Description | Pricing (SAR) | Example products |
|---|---|---|---|
| T1 | Digital downloadable products (prompt packs, presets, templates) | 99–149 | Prompt Pack |
| T2 | Self-paced recorded courses | 449 public / gift to cohorts | Intro to Creative AI (ITCAI), Beyond Lighting (BL, legacy at 650) |
| T3 | Live online/offline cohorts with feedback | 1,199 flat · 1,299 bundle · 30 seats max | Creative AI Workshop (CIW) |
| T4 | Flagship mentorship / transformational programs | 3,500 individual · 3,000 group · 12–20 students | Not yet launched — Q3 2026 target |

**Harvest 22 cash plan** runs April 22 → September 30, 2026, targeting 120K SAR minimum by the wedding (Sep 30). Six milestones M1–M6 detailed in [memory/project_harvest22_plan.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/project_harvest22_plan.md).

### 1.4 Brand voice + communication

Per [.claude/rules/communication-style.md](../.claude/rules/communication-style.md):

- **Internal** (working with Majid): straight to the point, numbered bullets by default, no preamble, inclusive ("we're working together, not reporting to him").
- **External English**: inspirational + wise, friend/mentor tone, can be funny, can be provocative (tough love), never condescending or corporate.
- **External Arabic**: Saudi dialect (not MSA), warmer + more direct than English, mentorship-driven.

Design aesthetic is **Editorial Atelier**: black-OLED base, gold (`#C9A84C`) as editorial ink (not decoration), 0.5px gold hairlines, Cairo typography with 200-weight display numerals, OKLCH color space. Full spec: [docs/superpowers/specs/2026-04-23-dashboard-player-redesign-design.md](./superpowers/specs/2026-04-23-dashboard-player-redesign-design.md).

---

## 2. Domains + subdomains

All live URL mappings. Source of truth: [memory/reference_malearn_site_mapping.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/reference_malearn_site_mapping.md).

| Live URL | Repo | Local clone | Hosting | Purpose |
|---|---|---|---|---|
| `malearnsa.com` | `Majidangawi/malearnsa` | MA EA workspace root | GitHub Pages | Root marketing site + landing pages + success pages |
| `checkout.malearnsa.com` | `Majidangawi/intro-to-ai-checkout` | (not in MA EA) | GitHub Pages | Checkout + success pages (Tamara-integrated paths) |
| `player.malearnsa.com` | `Majidangawi/malearnsa-player` | `~/code/malearnsa-player/` | GitHub Pages | **Course player** for BL + ITCAI (Editorial Atelier redesigned 2026-04-23) |
| `admin.malearnsa.com` | `Majidangawi/ma-learn-dashboard` | `~/code/ma-learn-dashboard/` | GitHub Pages | Majid's operator dashboard frontend |
| `api.malearnsa.com` | same repo, `backend/` dir | `~/code/ma-learn-dashboard/backend/` | DigitalOcean droplet 46.101.151.237 (pm2 `ma-learn-dashboard-prod` port 3402, Caddy reverse proxy) | Fastify backend for dashboard |
| `link.malearnsa.com` | `Majidangawi/ma-learn-dashboard` | same | GitHub Pages | Link-in-bio public page (`frontend/public/link.html`) |
| `noor.majidangawi.com` | `Majidangawi/noor-bot` (private) | on droplet `/home/noor/app` | DigitalOcean droplet (same IP) via systemd + Caddy | Noor Telegram webhook endpoint |
| `admin-staging.malearnsa.com` | (retired) | — | (retired 2026-04-23) | DNS + GH Pages config retained for rollback; no longer serves |
| `api-staging.malearnsa.com` | same retired | same retired | pm2 `ma-learn-dashboard-staging` port 3401 **stopped** | Rollback only |

Each GitHub Pages repo has its own `CNAME` file controlling its custom domain. DNS records are on Cloudflare (config lives with Majid). Apple Pay domain verification file exists in the MA EA workspace as `apple pay file/`.

### SSL

All subdomains serve HTTPS. GitHub Pages handles SSL automatically for CNAMEs. The droplet uses **Caddy** as the reverse proxy which auto-issues Let's Encrypt certs for `api.malearnsa.com` and `noor.majidangawi.com`.

---

## 3. Repositories

Deploy triggers, tagging, and remote locations for every repo in the platform.

| Repo | Local path | Remote | Deploy trigger | Key tags |
|---|---|---|---|---|
| `Majidangawi/malearnsa` | MA EA workspace root | `git@github.com:Majidangawi/malearnsa.git` | Push to `main` → GH Pages | `pre-redesign-2026-04-23` |
| `Majidangawi/intro-to-ai-checkout` | Not in MA EA workspace | same | Push to `main` → GH Pages | `pre-redesign-2026-04-23` |
| `Majidangawi/malearnsa-player` | `~/code/malearnsa-player/` | same | Push to `main` → GH Pages | `chat-v1` (2026-04-24), `pre-redesign-2026-04-23` |
| `Majidangawi/ma-learn-dashboard` | `~/code/ma-learn-dashboard/` | same | Frontend: push to `main` → GH Pages. Backend: `git pull` + `pm2 reload ma-learn-dashboard-prod` on droplet (manual SSH for now — see runbook `PROD.md`) | — |
| `Majidangawi/noor-bot` (private) | on droplet `/home/noor/app` | same | Manual SSH `git pull` + `systemctl restart noor` (GitHub Actions broken — see [project_noor_phase2_scope.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/project_noor_phase2_scope.md)) | — |
| `(local-only) malearn-chat` | `~/code/malearn-chat/` | **no remote** | `supabase db push` + `supabase functions deploy` via Supabase CLI | `chat-v1` (local only) |

### Clasp-managed Apps Script workspaces

Apps Script projects don't live in a normal git repo; clasp provides file-level push/pull against the Apps Script backend.

| Apps Script project | Clasp workspace | Script ID |
|---|---|---|
| token-validator (primary platform API) | `~/code/.clasp-token-validator/` | `1OPM0ii4S234ZXjV1QmzbudQcS8hDImSqDStGQZpXyG_aoAlzWgdPECud` |
| ciw-waitlist | `~/code/.clasp-ciw-waitlist/` | (see `.clasp.json` in that workspace) |

**Mirror policy:** The canonical source for each Apps Script lives in the clasp workspace. Mirror copies in the MA EA workspace under `projects/ma-learn-launch/apps-script/<name>/` are read-only working references. Always push from the clasp workspace. Verify `scriptId` in `.clasp.json` before pushing per [memory/feedback_verify_clasp_before_push.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/feedback_verify_clasp_before_push.md) — the `.clasp.json` has pointed at phantom scripts before.

### GitHub auth

See [memory/reference_github.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/reference_github.md) for PAT rotations.
- **Username:** `majidangawi`
- Three PATs tracked in memory (classic repo+workflow, fine-grained, legacy repo-only). Rotate ~every 90 days.
- **Known scope quirk:** `intro-to-ai-checkout` requires classic PAT — fine-grained gets 403. See [memory/feedback_github_token_scope.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/feedback_github_token_scope.md).

---

## 4. Products

Each product has: landing → checkout → success → (optional) course player or library.

### 4.1 Beyond Lighting (BL)

- **Tier:** T2 (recorded course), legacy pricing
- **Product slug (`BL_PRODUCT`):** `beyond-lighting`
- **Price:** 650 SAR
- **Daftra invoice ID:** 40
- **Landing page:** `malearnsa.com/beyond-lighting/` (served from `Majidangawi/malearnsa` repo)
- **Checkout:** `malearnsa.com/beyond-lighting/checkout.html` → Moyasar
- **Success:** `malearnsa.com/beyond-lighting/success.html`
- **Player:** `player.malearnsa.com/watch.html?token=XXX&course=beyond-lighting`
- **Bunny library:** 634652 (21 videos uploaded, all transcoded)
- **Deprecating from Salla:** BL was previously sold via Salla; transition to Moyasar complete, Salla instance deprecating ~May 2026 per [memory/project_malearn_checkout.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/project_malearn_checkout.md).
- **Chat V1:** LIVE (no flag) since 2026-04-24. See [§8 Chat V1](#8-chat-v1).

### 4.2 Intro to Creative AI (T2 / ITCAI)

- **Tier:** T2 (recorded course)
- **Product slug (`T2_PRODUCT`):** `intro-to-creative-ai`
- **Price:** 449 SAR public launch (M3, scheduled May 6, 2026 per Harvest 22) · currently bundled as gift to T3 Cohort 1
- **Daftra invoice ID:** 38
- **Landing page:** `malearnsa.com/intro-to-creative-ai/` (built 2026-04-23, live-ready — see [memory/project_t2_and_t3c2_pages.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/project_t2_and_t3c2_pages.md))
- **Checkout:** via `checkout.malearnsa.com` subdomain (Tamara-integrated)
- **Player:** `player.malearnsa.com/watch.html?token=XXX&course=intro-to-creative-ai`
- **Bunny library:** 637491 (7 videos uploaded: M1 + M2 complete; M3–M6 pending per Drip Unlock schedule)
- **Chat V1:** LIVE (no flag) since 2026-04-24.
- **Drip unlock schedule** (Cohort 1 only — see current-priorities.md):
  | Module | Date | Status |
  |---|---|---|
  | M1 + M2 | Apr 15 | Auto on purchase |
  | M3 | Apr 17 (retroactive 19) | Shipped |
  | M4 | Apr 19 | Shipped |
  | M5 | Apr 21 | Shipped |
  | M6 | May 5 (graduation) | Pending — **blocks T2 public launch** |

### 4.3 Creative AI Workshop (T3)

- **Tier:** T3 (live cohort)
- **Product slug (`T3_PRODUCT`):** `creative-ai-workshop-t3`
- **Pricing:**
  - Cohort 1 (Apr 22–May 2): 700/900 SAR (legacy two-tier)
  - Cohort 2 (May delivery Jun 3–5): **1,199 flat · 1,299 bundle with T2** (locked, never discount below)
  - Cohort 3 (Jul/Aug): 1,399
- **Seat limit:** 30 per cohort (`T3_SEATS_LIMIT` constant in token-validator `Code.js`)
- **Daftra invoice ID:** 39
- **Landing page:** `malearnsa.com/creative-ai-workshop/` (sold out badge auto-swaps via logic per [memory](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/MEMORY.md))
- **Checkout:** `checkout.malearnsa.com/creative-ai-workshop/` (Tamara + Moyasar)
- **Success:** `checkout.malearnsa.com/success.html`
- **Delivery model:** WhatsApp group + live Zoom sessions (7–10 PM Jeddah, 3 hours × 3 days). Cohort 1 WhatsApp pinned welcome, pre-session checklists [MAL-169/170/171] in Linear + GCal.

### 4.4 Prompt Pack (T1)

- **Tier:** T1 (digital product)
- **Product slug (`PP_PRODUCT`):** `prompt-pack`
- **Price:** 99 SAR
- **Daftra invoice ID:** 41
- **Landing page:** `malearnsa.com/prompt-pack/`
- **Checkout:** `malearnsa.com/prompt-pack/checkout.html` → Moyasar
- **Success:** `malearnsa.com/prompt-pack/success.html`
- **Library** (product delivery): `malearnsa.com/prompt-pack/library/?token=XXX` — session persists until browser closes; token stays `used` in sheet forever so same code always works for returning buyers.

### 4.5 Creative AI Workshop (CIW Fujifilm) — standalone variant

- **Landing:** `malearnsa.com/creative-ai-workshop/`
- **Price:** 999 SAR (was early-bird tiered, retired 2026-04-14 per commit `dfa20de`)
- **Waitlist capture:** `malearnsa.com/ciw-waitlist.html` (dedicated Apps Script ingestion; see [§16 Waitlist](#16-waitlist))
- **Fujifilm partnership status:** Workshop 1 Apr 4 Jeddah done. Workshop 2 May 7 Riyadh confirmed (X-T5 camera, concept TBD).

### 4.6 Summary table

| Product | Slug | Price | Daftra | Tier |
|---|---|---|---|---|
| Beyond Lighting | `beyond-lighting` | 650 SAR | 40 | T2 legacy |
| Intro to Creative AI | `intro-to-creative-ai` | 449 SAR (public) | 38 | T2 |
| Creative AI Workshop T3 | `creative-ai-workshop-t3` | 1,199 / 1,299 | 39 | T3 |
| Prompt Pack | `prompt-pack` | 99 SAR | 41 | T1 |

---

## 5. Payment architecture

Multiple gateways coexist. Primary is Moyasar; Tamara handles BNPL; Salla is legacy; Daftra handles post-purchase invoicing regardless of gateway.

### 5.1 Moyasar (primary gateway)

- **Role:** All new product purchases route through Moyasar
- **Integration:** JS SDK embedded in checkout HTML pages; POST to Apps Script `complete_purchase` on success
- **Flow:** Buyer pays → Moyasar redirects to success page → success page calls `complete_purchase` with payment_id → Apps Script logs, assigns token, sends email, creates Daftra invoice → redirects to post-purchase product experience

### 5.2 Salla (legacy, deprecating)

- **Role:** Historical Beyond Lighting sales
- **Status:** Deprecating ~May 2026. New BL sales route through Moyasar.
- **Store URL:** `malearnstore.com` (separate domain, Salla-hosted)

### 5.3 Tamara (BNPL)

- **Role:** Buy Now, Pay Later option for T3 and higher-ticket products
- **Key location:** [memory/reference_tamara.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/reference_tamara.md)
- **Environment:** Production (`Tamara PP issuer`)
- **Script:** `projects/ma-learn-launch/tamara-apps-script.js` — handles Tamara checkout creation + callback
- **Products:** All MA Learn products eligible; most relevant for BL (650 SAR) and T3 (1,199+).

### 5.4 Apple Pay

- **Domain verification file:** MA EA workspace `apple pay file/` — must be served from root `.well-known/apple-developer-merchantid-domain-association` to verify the domain for Apple Pay button in checkouts.
- **Status:** Live for Moyasar-integrated checkouts (Moyasar surfaces Apple Pay as a payment method).

### 5.5 Daftra (invoicing)

- **Role:** ZATCA-compliant VAT invoice generation on every purchase
- **Workspace:** `malearn.daftra.com`
- **API key:** [memory/reference_daftra.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/reference_daftra.md)
- **Base URL:** `https://malearn.daftra.com/api2`
- **Auth:** `apikey: <API_KEY>` header
- **Key endpoints:** `POST /clients.json`, `POST /invoices.json`, `PUT /invoices/{id}.json`
- **Invocation:** From Apps Script `complete_purchase` → `createDaftraInvoice(email, product)` after token assignment
- **Client cache:** `PropertiesService.getScriptProperties()` keyed `daftra_<email-lowercase>`. Needed because Daftra's client-search API is broken. Use `daftraCacheClientId(email, id)` to fix duplicates.
- **Current VAT:** 15% (Saudi standard rate, set via env `DAFTRA_DEFAULT_VAT=15` on Noor droplet for manual ops)

### 5.6 End-to-end purchase flow

Reference: [memory/project_malearn_checkout.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/project_malearn_checkout.md)

```
Buyer visits landing
  → clicks "اطلبها الآن"
  → lands on /<product>/checkout.html
  → Moyasar iframe collects card/Apple Pay/mada
  → Moyasar redirects to /<product>/success.html?id=<payment_id>
  → success page POSTs to Apps Script action=complete_purchase
  → Apps Script:
      1. Dedupe check (payment_id not already processed)
      2. Log row in Customers sheet
      3. Find available row in Tokens sheet matching product → set email + status=used → return token
      4. Send access-link email via GmailApp.sendEmail (HTML, gold-branded)
      5. Daftra: find/create client by email, create invoice, email invoice to buyer
      6. sendPurchaseNotification → Telegram-like alert to info@malearnsa.com
      7. _admin_upsert_subscriber → add buyer to Subscribers sheet
  → Apps Script returns { ok: true, token, access_link }
  → Success page shows access button → opens auto-login link with token
```

---

## 6. Token system

Access control model for all gated content (videos, library pages, chat).

### 6.1 Concept

Every paid user gets a unique token. The token is the sole access credential; no username/password. Tokens are URL-embedded (`?token=XXX&course=YYY`). This is Phase 1; Phase 2 (full LMS with proper auth) is deferred post-wedding — see [§26](#26-deferred--post-wedding).

### 6.2 Tokens sheet schema

Location: **Main Sheet** `1nkrwK-KJ7nD2kv_8zdYiLqot6RFoH-v67VpmjCzvYi0` → tab `Tokens`.

| Col | Header | Purpose |
|---|---|---|
| A | token | Random-ish string, unique (e.g., `MABL-UK44`, `MAL-T2-PREVIEW`) |
| B | course | Product slug (`beyond-lighting`, `intro-to-creative-ai`, etc.) |
| C | status | `available` (unused), `used` (assigned to a buyer), `revoked` |
| D | email | Buyer's email (populated on purchase) |
| (E+) | (product-specific metadata) | Varies by product |

### 6.3 Token generation

- **Bulk CSV import:** Tokens pre-generated and pasted into the sheet (see `bl-tokens-import.csv`, `tokens-intro-to-creative-ai.csv` under `projects/ma-learn-launch/`). Each token has `status=available` until assigned.
- **Admin gift:** `admin_gift_token` endpoint marks an existing `available` token with a given email and `status=used`, optionally sending the access email. Used from dashboard Contacts/CRM page for manual gifting. Gated on `ADMIN_TOKEN`.

### 6.4 Token redemption (on the player)

Player `watch.html` reads `?token` and `?course` from URL, POSTs to Apps Script `action=validate_token`. Response: `{ valid: true, reason: 'ok' }` or `{ valid: false, reason: 'wrong_course' | 'token_not_found' | 'token_revoked' }`. Invalid tokens bounce to a static "invalid access" page.

On success, player loads curriculum via `action=get_course_lessons`, which respects the token for authorization (only returns lessons the token's course allows).

### 6.5 Preview tokens

Persistent admin-access tokens tied to Majid's email, enable `isMajid=true` via the whitelist in `handleMintSupabaseToken_`:

- **BL preview:** `MAL-BL-PREVIEW` (course: `beyond-lighting`)
- **ITCAI preview:** `MAL-T2-PREVIEW` (course: `intro-to-creative-ai`)
- Same chat uid on both (derived from email) → display name carries across courses.

Usage:
```
https://player.malearnsa.com/watch.html?token=MAL-BL-PREVIEW&course=beyond-lighting
https://player.malearnsa.com/watch.html?token=MAL-T2-PREVIEW&course=intro-to-creative-ai
```

Dashboard "preview player" buttons already pass these. Treat as admin access: if doc is shared broadly, rotate.

### 6.6 Limitation

Current token model is stateless and has no expiry. A shared token gives access to anyone who has the URL. Chat V1 anti-piracy telemetry (ip_hash + session_events) provides a forensic trail but no enforcement. Proper auth replaces this in Phase 2 LMS migration (post-wedding).

---

## 7. Player

**Live URL:** `https://player.malearnsa.com/watch.html?token=XXX&course=YYY`
**Repo:** `Majidangawi/malearnsa-player` at `~/code/malearnsa-player/`

### 7.1 Editorial Atelier redesign

Shipped 2026-04-23 across all courses (spec: [docs/superpowers/specs/2026-04-23-dashboard-player-redesign-design.md](./superpowers/specs/2026-04-23-dashboard-player-redesign-design.md)). Tokens live in `~/code/malearnsa-player/css/tokens.css`; primitives in `~/code/malearnsa-player/css/primitives.css` + `primitives/`.

### 7.2 Video hosting

Bunny.net iframe embed per lesson. Library ID per course mapped in `watch.html`:

```js
const BUNNY_LIBRARIES = {
  'beyond-lighting': 634652,
  'intro-to-creative-ai': 637491
};
```

Embed URL: `https://iframe.mediadelivery.net/embed/{libraryId}/{videoGuid}?autoplay=true&loop=false&muted=false&preload=false&responsive=true`

Referrer whitelist set per library: `player.malearnsa.com` (+ any staging/alt domains). See [memory/reference_bunny.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/reference_bunny.md).

### 7.3 Token gating + splash

On load:
1. Read `?token` and `?course` from URL
2. Splash loader shown (Gumela gold brand animation)
3. Call Apps Script `validate_token` + `mint_supabase_token` in parallel
4. On validate success, fetch curriculum via `get_course_lessons`
5. Render sidebar + load first lesson

Invalid token → replace DOM with static "invalid access" message.

### 7.4 Curriculum source

Live lessons come from the **Lessons** tab of the Main Sheet, fetched via Apps Script `action=get_course_lessons`. Fallback hardcoded BL curriculum lives inside `watch.html` (`BL_CURRICULUM` constant) for resilience.

LessonContent tab (with `Blocks` JSON column, 2026-04-23) holds rich lesson body content. Player fetches per-lesson via `action=get_content&lesson_id=X&token=Y&course=Z`.

### 7.5 Features

- Sidebar: module tree with progress dots; mobile drawer
- Video: Bunny iframe with 12px radius editorial-atelier inner-shadow frame
- Lesson body tabs (since Chat V1): **الوصف / النقاش / مثبت** (Description / Discussion / Pinned)
- PDF downloads: per-lesson, gold-pill CTA
- Prev/Next navigation, progress saved locally
- Bookmark slot + note-taking placeholder (V2 hooks, hidden by default per redesign spec §8.3)
- `resume-from` query param respected passively

### 7.6 Tabbed lesson body (since Chat V1)

Chat V1 wraps the existing lesson content into a new `[data-ui="tabs"]` container via `js/chat-bootstrap.js`. The "الوصف" tab contains the existing lesson content unchanged; two new panels ("النقاش" and "مثبت") are added as siblings. See [§8 Chat V1](#8-chat-v1).

Flag-gate: `CHAT_LIVE_COURSES` array in `js/chat-bootstrap.js` controls which courses see chat without `?chat=beta`. Currently: `['beyond-lighting', 'intro-to-creative-ai']`.

---

## 8. Chat V1

Per-lesson realtime chat shipped 2026-04-24, tagged `chat-v1` in git. Full state: [memory/project_player_chat_v1.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/project_player_chat_v1.md).

### 8.1 Status

LIVE on both BL + ITCAI courses with no flag. `CHAT_LIVE_COURSES = ['beyond-lighting', 'intro-to-creative-ai']` in `~/code/malearnsa-player/js/chat-bootstrap.js`. Any other course needs `?chat=beta` override.

### 8.2 Architecture

- **Backend:** Supabase project `malearn-chat` (Frankfurt, Free tier) — `https://rmefydapbrirzgmmbyxx.supabase.co`
- **Auth:** Apps Script `token-validator` endpoint `mint_supabase_token` mints HS256 JWTs using `SUPABASE_JWT_SECRET` Script Property
- **Client:** Modules in `~/code/malearnsa-player/js/chat/` loaded lazily by `js/chat-bootstrap.js` when course is in `CHAT_LIVE_COURSES` or `?chat=beta` flag is set
- **Realtime:** Supabase Realtime via `supabase.channel().on('postgres_changes', ...)`; WebSocket publication on `messages` and `pins` tables
- **Archive:** Weekly wipe (`pg_cron` Friday 02:00 KSA) → Postgres `weekly_wipe()` function → `net.http_post` to Supabase Edge Function `archive-to-sheet` → POSTs to Apps Script `admin_archive_chat_messages` → writes rows to the master archive sheet `16BVowXL8WVNSEkb0kQ9O7yevgrXkNoUke9ulwWWrvlU` using native `SpreadsheetApp` (Google Cloud service account avoided — CNTXT reseller wall in KSA blocked that path)
- **Alerts:** `weekly_wipe()` calls `noor_alert_post()` → Supabase Edge Function `noor-alert` → direct `api.telegram.org/sendMessage` using `@MajidNoorBot` credentials → DM to Majid
- **Pin expiry:** Daily `pg_cron` 02:00 KSA → `pin_expiry_sweep()`

### 8.3 Data model (Postgres)

Schema in `~/code/malearn-chat/supabase/migrations/0001_chat_schema.sql`:

| Table | Purpose | RLS |
|---|---|---|
| `users` | One row per paid student (uid from email hash) | Self read/write; cannot claim `is_majid` |
| `rooms` | One row per lesson (evergreen); `message_count` + `last_message_at` maintained by trigger | Authed read + insert + counter update |
| `messages` | Ephemeral, wiped weekly | Authed read; self-insert (rate/ban/majid-flag); self soft-delete <5min; self edit <2min; majid full mod |
| `pins` | Survives weekly wipe (optional `expires_at`) | Authed read; majid-only write |
| `banned_uids` | Silent bans | Self read + majid write |
| `reports` | Student-submitted reports | Self insert + majid read/update |
| `moderation_log` | Append-only audit trail | Majid read + majid insert (actor must match self) |
| `session_events` | Anti-piracy telemetry (sign_in, token_refresh) | Self insert + majid read |
| `archives` | One row per ISO-week wipe | Majid read |
| `wipe_errors` | Only written on failure | Majid read |
| `rate_state` | Rate-limit buckets (deferred — enforcement not wired in V1) | Self + majid |
| `chat_settings` | Runtime config (archive_fn_url, anon_key, etc.) | No RLS policies — deny all for external; `SECURITY DEFINER` functions access via `public.chat_setting(key)` |

RLS uses `(auth.jwt()->>'sub')` throughout (not `auth.uid()`) because uid is text, not UUID. Spec §16.6 documents this. See [§27 Operational gotchas](#27-operational-gotchas).

### 8.4 Client modules

Under `~/code/malearnsa-player/js/chat/`:

- `auth.js` — Supabase client with custom `global.fetch` interceptor (injects JWT on every REST call); `realtime.setAuth()` for WebSocket; auto-triggers `signInStudent()` on module load; re-fetch users row to preserve stored `display_name`. **Bypasses GoTrue entirely** (see [§27](#27-operational-gotchas) on why).
- `messages.js` — realtime list + composer; `refreshSendButton()` decoupled from load state
- `displayName.js` — first-visit modal; proactive on `chat:ready` if `display_name` is null
- `moderation.js` — Majid-only menu (pin with expires_at / soft-delete / hard-delete / ban / clear-room RPC)
- `pins.js` — pinned panel with realtime
- `mentions.js` — `@` autocomplete (Majid first), GIN-indexed lookup, gold chip rendering
- `unread.js` — `rooms:all` subscription, `data-unread` on sidebar items, hamburger aggregate dot, 2s dwell → `last_seen` JSONB merge

Modules are self-starting via `window.__chatProfile` and `window.__currentLessonId` catch-up patterns to avoid race conditions (learned 2026-04-24 during Majid's BL review).

### 8.5 Edge Functions (Supabase Deno)

Under `~/code/malearn-chat/supabase/functions/`:

- `archive-to-sheet` — forwards `{ weekTag, rows }` to Apps Script `admin_archive_chat_messages` with shared secret (`CHAT_ARCHIVE_SECRET`); no GCP service account needed
- `noor-alert` — calls `api.telegram.org/bot<token>/sendMessage` directly; secrets `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`

### 8.6 Scheduled jobs (pg_cron in UTC)

```sql
-- Weekly wipe: Thu 23:00 UTC = Fri 02:00 KSA
cron.schedule('weekly-wipe', '0 23 * * 4', 'select public.weekly_wipe();');
-- Daily pin sweep: 23:00 UTC = 02:00 KSA next day
cron.schedule('daily-pin-expiry', '0 23 * * *', 'select public.pin_expiry_sweep();');
```

### 8.7 Known V1 fixes

All caught + fixed during Majid's BL review 2026-04-24 (now locked):

1. Send-button race condition — decoupled from load state, deferred checks to send-time with Arabic toasts
2. GoTrue UUID rejection — bypassed via `global.fetch` + `realtime.setAuth()`
3. Empty state not hiding — CSS specificity fix (`[hidden] { display: none !important }`)
4. Display name wiped on reload — `ignoreDuplicates:true` + re-SELECT the row post-upsert
5. Proactive display-name modal — opens on `chat:ready` when `display_name` is null
6. Module-mount catch-ups — `window.__currentLessonId` / `window.__chatProfile` checks at mount time

### 8.8 Deferred from V1 (per spec §10.2)

- Rate-limit enforcement (5/min, 30/hr, 200/day — table schema exists, trigger not wired)
- Email digest notifications
- Image/voice/video messages
- Threading / reactions
- AI assistant (v3/v4 with Majid's knowledge)
- Anti-piracy detection + alerts (telemetry capture live; analysis deferred)
- Dedicated admin dashboard for chat (Firebase/Studio Console suffices for V1)
- Message search, presence, DMs

### 8.9 Cost

$0/month at current scale (well under Free tier limits: 50K Postgres reads/day = ~350 msgs/week load). Ceiling at 10× scale: under $10/month.

---

## 9. Dashboard

**Frontend:** `https://admin.malearnsa.com`
**Backend API:** `https://api.malearnsa.com`
**Repo:** `Majidangawi/ma-learn-dashboard` at `~/code/ma-learn-dashboard/`
**Runbook:** `~/code/ma-learn-dashboard/PROD.md`

### 9.1 Architecture

- **Frontend:** Vanilla ES modules, no build step. Single `tokens.css`, primitives via `[data-ui]` attributes (Editorial Atelier design system). Hash router (`frontend/public/js/router.js`) drives SPA navigation.
- **Backend:** Fastify + TypeScript on Node 20 on DigitalOcean droplet. pm2 process `ma-learn-dashboard-prod` on port 3402 behind Caddy reverse proxy. Staging process `ma-learn-dashboard-staging` on 3401 is **stopped** (retained for rollback).

### 9.2 Shared design system

Same Editorial Atelier tokens + primitives as the player. OKLCH color space, Cairo + Gumela Arabic typography, 8pt spacing scale, 3-tier elevation.

### 9.3 Pages

| Route | Purpose |
|---|---|
| `/#home` | Insights landing (revenue hero, KPI row, recent activity) |
| `/#emails` | Emails v2 (templates + drip schedule + Noor-drafted custom emails) |
| `/#newsletter` | Newsletter composer + sent history + segment targeting |
| `/#contacts` | Contacts CRM (unified over Customers + Waitlist + Subscribers) |
| `/#coupons` | Coupon management (create/update/delete, inline) |
| `/#lessons` | Player Admin — lesson edit (3-col layout, composer content editor, drag-drop reorder, inline Bunny preview) — shipped 2026-04-23 |
| `/#linkbio` | Link-in-bio item management (add/update/delete/reorder) — writes to `link.malearnsa.com` |
| `/#activity` | Activity archive — read AuditLog tab, searchable/filterable |
| `/#noor` | Full Noor chat page (context-aware) |

### 9.4 Backend structure

```
backend/src/
  apps-script/client.ts      # POSTs to APPS_SCRIPT_URL with ADMIN_TOKEN
  data/
    read-extra.ts            # readLessons/Tokens/Coupons/Linkbio/Templates
    insights.ts              # computeInsights() aggregator
  noor/
    dispatcher.ts            # tool name → handler map for Noor
  routes/
    data.ts                  # GET /api/data/*
    writes.ts                # POST /api/writes/* (approval-gated)
    noor.ts                  # POST /api/noor/resolve
  server.ts                  # Fastify app + route groups
```

Writes go through a two-step approval gate (preview → approve → execute) and append to `AuditLog` sheet.

### 9.5 Deployment

- **Frontend:** Push to `main` → GitHub Pages auto-deploys.
- **Backend:** SSH to droplet → `cd /opt/ma-learn-dashboard && git pull && pm2 reload ma-learn-dashboard-prod`. See `PROD.md` for detail.

### 9.6 Recent milestones

- 2026-04-18 → Plan 1 foundation (token-validator ADMIN_TOKEN gate + staging environment + app shell)
- 2026-04-19 → Plan 2 (5 Week-1 features: Lesson toggles / Drip email / Coupons / Link-in-bio / Insights home)
- 2026-04-20 → Composer v1 locked (block-based, shared between Newsletter + Emails) — [memory/project_composer_v1_locked.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/project_composer_v1_locked.md)
- 2026-04-23 → Editorial Atelier redesign + production promotion (`admin.malearnsa.com` live)

---

## 10. Data layer — Google Sheets

All persistent business data lives in Google Sheets (Phase 1 architecture; Phase 2 migrates to Postgres via Supabase LMS, deferred).

### 10.1 Main Sheet — `1nkrwK-KJ7nD2kv_8zdYiLqot6RFoH-v67VpmjCzvYi0`

Called "MA Learn Token Pool" in Drive. Sheet-bound to the `token-validator` Apps Script.

| Tab | Schema (key cols) | Written by | Read by |
|---|---|---|---|
| `Tokens` | A token, B course, C status, D email | `complete_purchase`, `admin_gift_token`, manual CSV import | `validate_token`, `mint_supabase_token`, `admin_send_chat_launch_email` |
| `Customers` | A timestamp, B email, C name, D phone, E product, F price, G payment_id | `complete_purchase` (logs each buy) | CRM reporting, Newsletter auto-upsert |
| `Waitlist` | varies; key: email, phone, G purchase_status marker | ciw-waitlist form | `admin_send_chat_launch_email` (no), contacts-export, broadcast |
| `Coupons` | A code, B type (fixed/percentage), C value, D min_sar, E uses_left, F start, G end, H active | `admin_create_coupon`, `admin_update_coupon` | `validate_coupon` |
| `Lessons` | curriculum data per course | Player Admin | `get_course_lessons` |
| `LessonContent` | A lesson_id, B course, C content_html, D blocks (JSON, 2026-04-23) | `save_content` | `get_content` |
| `Subscribers` | email, name, source, language, status, tokens | `_admin_upsert_subscriber` + auto-upsert from buyer/waitlist flows | Newsletter segment targeting |
| `Newsletters` | subject, preheader, blocks JSON, segment, status, sent_at | Dashboard Newsletter page | Email send job |
| `NewsletterEvents` | newsletter_id, email, event (opened/clicked/bounced) | Tracking pixel / link redirects | Stats display |

### 10.2 Dashboard Admin Sheet — `17OXB...`

Dashboard-owned tabs (kept separate so the Player Admin and Dashboard writes don't collide with the Token Pool's transactional schema):

- `EmailTemplates` — Composer-saved templates with blocks JSON
- `LinkInBio` — Items rendered on `link.malearnsa.com`
- `LinkInBioHeader` — Header block config
- `AuditLog` — Every dashboard write appends here for traceability

### 10.3 Staging Sheet — "MA Learn Token Pool (STAGING)"

Separate sheet for staging environment. Same schema as Main. Used when developing changes that write data; staging Apps Script points here to avoid polluting prod.

### 10.4 Chat Archive Sheet — `16BVowXL8WVNSEkb0kQ9O7yevgrXkNoUke9ulwWWrvlU`

Created 2026-04-24. Weekly wipe destination. One tab per ISO week (e.g., `2026-W17`). Columns:

```
timestamp_utc | timestamp_ksa | course_id | lesson_id | lesson_title |
author_display_name | author_uid | is_majid | deleted_flag | body | mentions
```

Shared with `majid@malearnsa.com` (Apps Script owner) for native SpreadsheetApp writes.

### 10.5 Schema notes

- **Waitlist col G** = `Purchase Status` — external processes maintain this marker. Scripts that target waitlist for non-buyer outreach should filter on col G (per [memory/feedback_waitlist_purchase_col.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/feedback_waitlist_purchase_col.md)).
- **Customers col E** = product slug. Count `T3_PRODUCT` here for `getT3SeatsTaken()`.

---

## 11. Apps Script ecosystem

Four live Apps Script projects. All owned by `Majid@malearnsa.com` (Workspace account, not personal Gmail) per [memory/project_apps_script_account.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/project_apps_script_account.md).

### 11.1 token-validator (primary platform API)

The backbone of the platform. One Apps Script handles validate_token, complete_purchase for all 4 products, all admin dashboard write operations, email sends, Newsletter/Subscriber lifecycle, Player Admin, chat archive writes, and chat JWT minting.

**Canonical IDs** (see [memory/reference_apps_script_ids.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/reference_apps_script_ids.md)):

- **Script ID:** `1OPM0ii4S234ZXjV1QmzbudQcS8hDImSqDStGQZpXyG_aoAlzWgdPECud`
- **Clasp workspace:** `~/code/.clasp-token-validator/`
- **Mirror (read-only):** `projects/ma-learn-launch/apps-script/token-validator/`
- **Exec URL:** `https://script.google.com/macros/s/AKfycbznjcsYu8gLDZqFJGededAQaATad_L8vlhRQV04pOqh57HB5nFVRy9zUHAcg6goyj8DKA/exec`
- **Current deployment:** `@13` (2026-04-24 — adds `admin_send_chat_launch_email` + `admin_archive_chat_messages` + `admin_set_chat_archive_config`)
- **Bound sheet:** Main Sheet `1nkrwK-...`

**Constants (top of `Code.js`):**

```js
const ADMIN_TOKEN     = 'MAL-ADMIN-2026';       // shared secret for admin_* GET/POST endpoints
const MAIN_SHEET_ID   = '1nkrwK-KJ7nD2kv_8zdYiLqot6RFoH-v67VpmjCzvYi0';
const TOKENS_SHEET    = 'Tokens';
const CUSTOMERS_SHEET = 'Customers';
const WAITLIST_SHEET  = 'Waitlist';
const COUPONS_SHEET   = 'Coupons';
// ... + LESSONS_SHEET, LESSON_CONTENT_SHEET, SUBSCRIBERS_SHEET, etc.
const T2_PRODUCT      = 'intro-to-creative-ai';
const T3_PRODUCT      = 'creative-ai-workshop-t3';
const BL_PRODUCT      = 'beyond-lighting';
const PP_PRODUCT      = 'prompt-pack';
const T3_SEATS_LIMIT  = 30;
const FROM_NAME       = 'Majid | MA Learn';
const FROM_EMAIL      = 'majid@malearnsa.com';
```

**Script Properties:**
- `SUPABASE_JWT_SECRET` — HS256 signing key for chat JWT (set manually via Apps Script Script Properties UI)
- `CHAT_ARCHIVE_SECRET` — shared secret for Edge Function → Apps Script archive route
- `CHAT_ARCHIVE_SHEET_ID` — `16BVowXL...`
- `FIREBASE_SERVICE_ACCOUNT` — legacy (chat pivoted from Firebase to Supabase 2026-04-24; property may still be present but unused)

**doGet endpoints** (listed in dispatcher order, `Code.js` ~line 108):

Public:
- `validate_coupon` — check coupon code validity + calc discount
- `complete_purchase` — routes to T2/T3/BL/PP-specific handler; logs buyer, assigns token, emails access link, creates Daftra invoice, notifies Majid
- `validate_token` — `{valid, reason}` check for player gate
- `get_seats_left` — T3 seat availability for checkout page
- `get_course_lessons` — token-authorized curriculum fetch
- `mint_supabase_token` — HS256 JWT minting for chat (public because gated on valid MA Learn token)

Admin (all require `admin_token=MAL-ADMIN-2026`):
- Lesson management: `admin_get_lessons`, `add_lesson`, `delete_lesson`, `save_content`, `get_content`, `admin_toggle_lesson`, `save_lesson_media`, `admin_reorder_lessons`
- Coupons: `admin_create_coupon`, `admin_update_coupon`, `admin_delete_coupon`
- Link-in-bio: `admin_add_linkbio`, `admin_update_linkbio`, `admin_delete_linkbio`, `admin_update_linkbio_header`, `admin_increment_linkbio_click`
- Email/Newsletter: `admin_send_email`, `admin_add_email_template`, `admin_upsert_subscriber`, `admin_mark_unsubscribed`, `admin_create_newsletter`, `admin_update_newsletter`, `admin_mark_newsletter_status`, `admin_append_newsletter_event`, `admin_upload_email_image`, `admin_resend_access_link`, `admin_gift_token`, `admin_remove_subscriber`
- Chat infra: `admin_set_chat_archive_config` (one-shot), `admin_send_chat_launch_email`

**doPost endpoints:**
- `save_content` (large payload; used by Player Admin when saving rich content blocks)
- `admin_archive_chat_messages` (form-encoded POST with JSON body; called by Supabase Edge Function during weekly wipe)

**Deployment protocol** (per [memory/feedback_verify_clasp_before_push.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/feedback_verify_clasp_before_push.md)):
```bash
cd ~/code/.clasp-token-validator
cat .clasp.json   # verify scriptId matches 1OPM0ii4...
clasp push
clasp deploy -i AKfycbznjcsYu8gLDZqFJGededAQaATad_L8vlhRQV04pOqh57HB5nFVRy9zUHAcg6goyj8DKA -d "vN <description>"
```

### 11.2 ciw-waitlist

Captures Creative AI Workshop Fujifilm waitlist submissions.

- **Clasp workspace:** `~/code/.clasp-ciw-waitlist/`
- **Writes to:** Main Sheet → `Waitlist` tab
- **Hardcoded URL:** token-validator staging sheetId for auto-upsert (see commit `a20c040`)

### 11.3 contacts-export

Exports Waitlist → `.vcf` file → emails to Majid for iPhone Contacts import → WhatsApp broadcast list. Per [memory/project_contacts_export.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/project_contacts_export.md).

- **Script ID:** `1cOW6rx81SoM2QGZqkeBbtxUrhqPFUSLBlfDjPiR7Aqa_KqSDErNzvbV-`
- **Editor:** https://script.google.com/d/1cOW6rx81SoM2QGZqkeBbtxUrhqPFUSLBlfDjPiR7Aqa_KqSDErNzvbV-/edit
- **Location:** `projects/ma-learn-launch/apps-script/contacts-export/`
- Reads: Waitlist (`1byx1WxktAKB1ajVFgEWbo6tMLlBo0gkcWZqXXO4FF58`) + Customers (Main sheet)
- Normalizes Saudi mobiles to +966 E.164; dedupes; excludes buyers; tags as `{Name} — MA Waitlist`
- **Last run:** 85 contacts exported 2026-04-18; 18 bad phones pending review

### 11.4 waitlist-blast (deferred — SOP-driven standalone)

Bulk email SOP (per [memory/feedback_bulk_email_sop.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/feedback_bulk_email_sop.md) + [references/sops/bulk-email.md](../references/sops/bulk-email.md)) uses a **template** (`references/sops/bulk-email-template-script.js`) to build a standalone Apps Script per campaign. Not a persistent project.

Pattern per campaign:
1. Recipient list in a dedicated sheet (cols A–F, F = Sent Status reserved for the script)
2. Copy template, swap `SHEET_ID`, `SUBJECT`, `buildEmailHtml()` contents
3. Deploy as new standalone Apps Script project
4. Run `testSingleEmail` first (test inbox check), then `sendBulkBlast`
5. Status tracked in col F of the sheet

---

## 12. Noor bot

`@MajidNoorBot` on Telegram — Majid's AI assistant ([memory/project_noor_telegram.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/project_noor_telegram.md)).

### 12.1 Infrastructure

- **Droplet:** DigitalOcean 46.101.151.237 (Frankfurt, $6/mo, Ubuntu 24.04)
- **Domain:** `noor.majidangawi.com` (HTTPS via Caddy)
- **Code:** `github.com/Majidangawi/noor-bot` (private)
- **Service:** `systemd` unit `noor.service`
- **Deploy:** Manual SSH `git pull` + `systemctl restart noor` (GitHub Actions workflow broken — bad SSH key secret; fixing it is deferred to [project_noor_phase2_scope.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/project_noor_phase2_scope.md))
- **Ownership:** `/home/noor/app` owned by `noor:noor` user (fixed 2026-04-18 — was root; blocked git pull)

### 12.2 Stack

- **Runtime:** FastAPI + python-telegram-bot v21
- **Model:** Claude Sonnet 4.6 (upgraded from Haiku 4.5 on 2026-04-18 — Haiku was hallucinating tool calls, narrating actions it didn't take; Sonnet fixed this)
- **Agent pattern:** Single-agent flat tool list, `tool_use` loop in `app/agent.py`
- **Tools:** 23 tools across 6 modules (`app/tools/*.py`): calendar, linear, gmail, notion, activity_log, daftra
- **Memory:** SQLite for conversation history
- **Voice transcription:** OpenAI Whisper

### 12.3 Credentials on droplet `/home/noor/.env`

`ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `WEBHOOK_SECRET`, `MAJID_TELEGRAM_ID`, `OPENAI_API_KEY`, `LINEAR_API_KEY`, `NOTION_API_TOKEN`, `DAFTRA_API_KEY`, `DAFTRA_API_URL`, `DAFTRA_STORE_ID=1`, `DAFTRA_DEFAULT_VAT=15`, `ACTIVITY_LOG_SPREADSHEET_ID`, `ACTIVITY_LOG_SHEET_NAME`, plus 4 Google OAuth token paths (Majed.Engawi, Angawi.Majid, Malearn, Majidangawi).

sudoers NOPASSWD: `/bin/systemctl restart noor`, `/bin/systemctl status noor`.

### 12.4 Multi-Gmail support

Four Google accounts wired with 9 scopes each: `calendar.readonly`, `calendar.events`, `gmail.readonly`, `gmail.send`, `gmail.compose`, `gmail.modify`, `spreadsheets`, `drive`, `documents`.

| Account key | Email |
|---|---|
| `Majed.Engawi` | `majed.engawi@gmail.com` |
| `Angawi.Majid` | `angawi.majid@gmail.com` |
| `Malearn` | `majid@malearnsa.com` |
| `Majidangawi` | (per memory) |

### 12.5 Chat V1 integration

Chat V1 alerts route via **direct Telegram Bot API** (not Noor's own server): weekly wipe completion/failure → Supabase `noor-alert` Edge Function → `api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage` → DM from `@MajidNoorBot` to `TELEGRAM_CHAT_ID` (Majid's user ID). Zero dependency on Noor's server.

---

## 13. Bunny.net

Video streaming CDN for course videos. Account API key in [memory/reference_bunny.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/reference_bunny.md).

- **Region:** Frankfurt (best latency for KSA + EU)
- **Libraries:**
  - Beyond Lighting: library ID 634652 (21 videos transcoded)
  - Intro to Creative AI (T2): library ID 637491 (7 videos; M1 + M2 complete; M3–M6 pending)
- **Embed format:** `https://iframe.mediadelivery.net/embed/{libraryId}/{videoGuid}?...`
- **Referrer whitelist:** Set per library in Bunny console — currently `player.malearnsa.com`. Operator task completed 2026-04-23 during PROD promotion.
- **Upload workflow:** Manual via Bunny UI (no automated pipeline). Video IDs pasted into Lessons sheet against each lesson row.

---

## 14. Daftra

ZATCA-compliant invoice generation ([memory/reference_daftra.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/reference_daftra.md)).

- **Workspace:** `malearn.daftra.com`
- **API base:** `https://malearn.daftra.com/api2`
- **Auth:** `apikey: <KEY>` header (key named `NOOR`)
- **Key endpoints:** `POST /clients.json`, `POST /invoices.json`, `PUT /invoices/{id}.json`
- **Product IDs:** Beyond Lighting 40 · ITCAI 38 · T3 39 · Prompt Pack 41
- **Current VAT rate:** 15%
- **Auto-invoice trigger:** `complete_purchase` Apps Script → find/create client → create invoice → email buyer
- **Client cache quirk:** PropertiesService keyed `daftra_<email-lowercase>` because Daftra's client-search API is broken. Workaround: `daftraCacheClientId(email, id)` for manual fixes when duplicates occur.

---

## 15. Email infrastructure

Gmail via Apps Script `GmailApp.sendEmail()` is the primary send path. Gmail for Workspace gives 1,500 emails/day quota (consumer Gmail: 100/day).

### 15.1 FROM config

- `FROM_NAME = 'Majid | MA Learn'`
- `FROM_EMAIL = 'majid@malearnsa.com'`

Defined as constants in token-validator `Code.js`. Any email sent via the platform comes from this identity.

### 15.2 Template types

| Template | Trigger | Audience |
|---|---|---|
| Access link (per product) | `complete_purchase` success | Single buyer |
| T2 Drip Unlock (M1/M2/M3/M4/M5/M6) | Scheduled releases on Cohort 1 calendar | Cohort 1 cohort |
| T3 Cohort 1 Confirmation | T3 purchase | Single T3 buyer |
| Gift token | `admin_gift_token` | Single gifted user |
| Custom admin send | `admin_send_email` | Single recipient, Majid-specified |
| Newsletter | Scheduled from dashboard | Subscriber segment |
| Chat launch email | `admin_send_chat_launch_email` (2026-04-24, pre-approved but pending trigger) | BL buyers segment |

### 15.3 Bulk email SOP

Every bulk send uses the template + standalone Apps Script pattern per [references/sops/bulk-email.md](../references/sops/bulk-email.md):
1. Recipient sheet with required cols (A timestamp, B name, C email, D phone, E product, F sent status)
2. Copy `references/sops/bulk-email-template-script.js`
3. Customize 3 placeholders: `SHEET_ID`, `SUBJECT`, `buildEmailHtml()` contents
4. Paste as new standalone Apps Script project
5. Run `testSingleEmail` (one row) → verify render
6. Run `sendBulkBlast` → watch Executions tab
7. Status tracked in col F as `SENT YYYY-MM-DD HH:MM` or `FAILED: ...`

Rate limiting and status tracking are load-bearing — don't modify the template structure.

### 15.4 Composer v1

Block-based rich-text composer ([memory/project_composer_v1_locked.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/project_composer_v1_locked.md)):

- **Location:** Dashboard Newsletter page + Emails page ("Add new template")
- **Block types:** Text, Heading (H1/H2/H3 + subheading), Banner (upload or URL, preview toggle), CTA button (gold/black, URL), Quote/highlight, Bullet list, Divider
- **Persistent toolbar:** B/I/U/Link/Unlink/Variable (floating toolbar removed)
- **Image upload:** Google Drive `Email Assets` folder; Dropbox `dl=1 → raw=1` rewrite
- **Variable picker:** `{name, product, token, course, module, nextModule, playerURL, unsubscribeUrl}`
- **Live preview:** Sticky pane with subject+preheader chip
- **Backend sanitizer:** Allowlist for b/strong/i/em/u/br/a/span
- **Files:** `frontend/public/js/composer/` + `frontend/public/css/composer.css` + `backend/src/mail/blocks.ts` + `backend/src/mail/migrate-markdown.ts`

Don't modify structure without explicit ask.

### 15.5 Emails v2 backlog

Tracked in [memory/project_emails_v2_backlog.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/project_emails_v2_backlog.md): banner/CTA blocks + variable picker + product-aware Noor drafting. Start here on next Emails iteration.

---

## 16. Waitlist

### 16.1 CIW Waitlist capture

- **Landing:** `malearnsa.com/ciw-waitlist.html` (served from `Majidangawi/malearnsa` repo)
- **Form fields:** Name, email, phone (+966), opt-in
- **Apps Script:** `ciw-waitlist` (separate project from token-validator)
- **Destination:** Main Sheet → `Waitlist` tab
- **Hardcoded token-validator URL:** for auto-upsert into subscribers (commit `a20c040`, 2026-04-23)

### 16.2 Waitlist schema

| Col | Purpose |
|---|---|
| A | Timestamp |
| B | Name |
| C | Email |
| D | Phone (+966 E.164) |
| E | Opt-in marker |
| F | (metadata) |
| G | **Purchase Status** — external processes maintain this; use for filtering in blasts |

### 16.3 Pending-transfer buyers

Special status: buyers who submitted international-wire proof but funds not cleared. Handled as:
- Marked as `PURCHASED` in Waitlist col G (internal tracking)
- Token NOT issued until bank clears
- Emails suppressed

Currently 2 pending: `imad.a.hasan` + `moeabbas84` (per [memory/project_pending_transfer_buyers.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/project_pending_transfer_buyers.md)).

---

## 17. Newsletter

### 17.1 Data model

- `Subscribers` sheet (Main Sheet): email, name, source (buyer/waitlist/manual), language (AR/EN), status (active/unsubscribed), token bindings
- `Newsletters` sheet: subject, preheader, blocks JSON (composer output), segment (which subscribers), status (draft/sending/sent), sent_at
- `NewsletterEvents` sheet: per-recipient open/click/bounce tracking

### 17.2 Auto-upsert

Every `complete_purchase` call runs `_admin_upsert_subscriber({ admin_token: ADMIN_TOKEN, email, name, source: 'buyer', language: 'AR' })` → adds buyer to subscribers automatically. Same happens for waitlist signup flow.

### 17.3 Dashboard Newsletter page

Majid composes in the rich-text block composer (see [§15.4](#154-composer-v1)), picks a segment (all / buyers only / waitlist only / custom filter), schedules or sends immediately. Send pulls recipients from `Subscribers` + uses `GmailApp.sendEmail` per-row with status tracking in `NewsletterEvents`.

### 17.4 Unsubscribe

`{unsubscribeUrl}` variable inserted into every newsletter template. Recipient click → Apps Script `admin_mark_unsubscribed?token=<one-time-token>` → flips `Subscribers.status` to `unsubscribed`.

---

## 18. Link-in-bio

**Live URL:** `link.malearnsa.com`
**Source:** `Majidangawi/ma-learn-dashboard` → `frontend/public/link.html` (deployed to GitHub Pages as a sibling of the admin dashboard; separate CNAME)

### 18.1 Data model

- `LinkInBio` sheet (Dashboard Admin Sheet `17OXB...`): title, url, icon, order, active, click_count
- `LinkInBioHeader` sheet: header_title, header_subtitle, avatar_url, theme_color

### 18.2 Render

`link.html` fetches both tabs via Apps Script `admin_get_lessons`-style public readers, renders in Editorial Atelier style. Each link row: big gold pill, hover lift, click → `admin_increment_linkbio_click?id=X` then redirect to target URL.

### 18.3 Admin

Dashboard `/#linkbio` page: add/update/delete/reorder items with drag-drop (Sortable.js), edit header config.

---

## 19. Analytics + tracking

### 19.1 Meta Pixel

- **Pixel ID:** `961157069802409`
- **Installed on:** Root landing pages, checkout pages, success pages, player
- **Events tracked:** PageView (default), Purchase (on success page), InitiateCheckout (on checkout page), Lead (on waitlist submit)
- **Code location:** Inline `<script>` in `<head>` of each page

### 19.2 Google Analytics

Not currently installed platform-wide (verify per page). Future: GA4 with enhanced e-commerce events mapped to Meta Pixel events.

### 19.3 Internal event logging

- `NewsletterEvents` (per-recipient open/click/bounce)
- `LinkInBio.click_count` (incremented on each click through `admin_increment_linkbio_click`)
- `AuditLog` (every dashboard write)
- `moderation_log` (chat moderation actions)
- `session_events` (chat sign-ins, for anti-piracy)
- `ACTIVITY_LOG_SPREADSHEET_ID` (Noor activity log, per-message tool usage)

---

## 20. LLM/SEO discovery

Monthly refresh to keep ChatGPT / Claude / Perplexity / Google AI citing current MA Learn offerings + prices accurately.

### 20.1 Files

- `llms.txt` — short index of top-level pages for AI crawlers
- `llms-full.txt` — full content dump for deeper retrieval
- `index.html` JSON-LD — Schema.org Organization + Course + Offer markup

### 20.2 SOP

Location (to verify): `references/sops/monthly-llms-refresh.md`
Process: scrape current product prices/URLs → regenerate llms.txt + llms-full.txt + JSON-LD → diff → commit → push to GitHub Pages → verify crawlability.

### 20.3 Automation reminder

`.github/workflows/monthly-llms-refresh.yml` opens a tracking issue on the 1st of every month. Ask Claude "run the monthly LLM refresh" → ~15 min process.

### 20.4 Template resale kit

`templates/llm-seo-starter-kit/` — resale product for other creators (T1-style digital deliverable).

### 20.5 Latest refresh

**2026-04-24** (bootstrap) — commits `314c076`, `1f41f13`, `1317332`.

---

## 21. Hosting + deployment

### 21.1 Hosting per surface

| Surface | Hosting | Type |
|---|---|---|
| `malearnsa.com` (root + all product paths) | GitHub Pages | Static |
| `checkout.malearnsa.com` | GitHub Pages | Static + Apps Script calls |
| `player.malearnsa.com` | GitHub Pages | Static + Apps Script + Supabase calls |
| `admin.malearnsa.com` | GitHub Pages | Static + Fastify API calls |
| `api.malearnsa.com` | DO droplet (Caddy → pm2 Fastify :3402) | Node.js server |
| `link.malearnsa.com` | GitHub Pages (dashboard repo) | Static + Apps Script calls |
| `noor.majidangawi.com` | DO droplet (Caddy → systemd uvicorn) | Python server |
| Supabase `malearn-chat` | Supabase cloud (Frankfurt) | Postgres + Realtime + Edge Functions |
| Bunny video library | Bunny CDN | Video streaming |

### 21.2 DigitalOcean droplet

- **IP:** 46.101.151.237
- **Region:** Frankfurt
- **Cost:** $6/mo
- **OS:** Ubuntu 24.04
- **Users:** `root`, `noor`, `ma-learn-dashboard` (service user)
- **Processes:**
  | Process | Port | Manager | Purpose |
  |---|---|---|---|
  | `noor` | (internal) | systemd | Noor Telegram webhook |
  | `ma-learn-dashboard-prod` | 3402 | pm2 | Dashboard Fastify backend |
  | `ma-learn-dashboard-staging` | 3401 | pm2 (stopped) | Staging backend — kept for rollback |
  | `caddy` | 80/443 | systemd | Reverse proxy + auto SSL |
- **Deploy paths:** `/home/noor/app` (Noor), `/opt/ma-learn-dashboard` (dashboard)

### 21.3 Supabase

- **Project:** `malearn-chat` (ref `rmefydapbrirzgmmbyxx`)
- **Region:** Frankfurt (`eu-central-1`)
- **Plan:** Free
- **Owner:** `Majidangawi` GitHub account via org `MA Learn`
- **Credentials:** [memory/reference_supabase.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/reference_supabase.md)
- **CLI:** `npx supabase` (Brew not installed on Majid's Mac)
- **PAT:** `sbp_REDACTED_ROTATED_2026-04-27` (stored in memory; rotate if leaked)

### 21.4 CI/CD

- **GitHub Pages:** Auto on push to `main` for all frontend repos. Propagation: ~45–90 seconds.
- **Fastify backend:** Manual SSH `git pull && pm2 reload` (CI not yet wired).
- **Noor bot:** Manual SSH `git pull && systemctl restart noor` (GitHub Actions workflow broken — deferred).
- **Supabase:** `supabase db push` (migrations) + `supabase functions deploy` (Edge Functions) — from `~/code/malearn-chat/` with `SUPABASE_ACCESS_TOKEN` env var set.
- **Apps Script:** `clasp push` + `clasp deploy -i <deploymentId> -d "description"` from the clasp workspace.

---

## 22. Security model

### 22.1 Admin auth

- `ADMIN_TOKEN` constant (`MAL-ADMIN-2026`) in Apps Script — gates all `admin_*` endpoints. Passed as query/body param. Not a secret in the strict sense but treat as one: if leaked, rotate (change constant + redeploy + update all callers including dashboard backend env var).

### 22.2 Student auth (player + chat)

- **Token in URL** gates player access (`validate_token`)
- **HS256 JWT** minted from MA Learn token gates Supabase chat; JWT Secret (`SUPABASE_JWT_SECRET`) stored only in Apps Script Script Properties; never in code or repos
- uid derived deterministically as `sha256(email)[:32]` shaped as UUID-style string — stable across sessions, same student always gets same uid

### 22.3 Shared secrets

| Secret | Location | Purpose |
|---|---|---|
| `ADMIN_TOKEN` (`MAL-ADMIN-2026`) | Code.js const + dashboard backend env | Admin endpoint gate |
| `SUPABASE_JWT_SECRET` | Apps Script Script Properties | HS256 signing for chat JWTs |
| `CHAT_ARCHIVE_SECRET` | Apps Script Script Properties + Supabase env | Edge Function → Apps Script archive call |
| `CHAT_ARCHIVE_SHEET_ID` | Apps Script Script Properties | Archive destination |
| `TELEGRAM_BOT_TOKEN` | Supabase Edge Function env | Noor alert sending |
| `TELEGRAM_CHAT_ID` | Supabase Edge Function env | Majid's Telegram user ID |
| `DAFTRA_API_KEY` | Apps Script (probably — verify) + droplet `.env` | Invoice creation |
| `TAMARA_API_KEY` | Apps Script Script Properties | Tamara checkout creation |
| `BUNNY_API_KEY` | Not used in platform; manual Bunny admin only | — |
| `MOYASAR_PUBLISHABLE_KEY` | Inlined in checkout HTML | Client-side Moyasar SDK |
| `SUPABASE_ACCESS_TOKEN` (PAT) | Local env only | `supabase` CLI auth |
| `ANTHROPIC_API_KEY` | Noor droplet `/home/noor/.env` | Claude Sonnet 4.6 for Noor |
| `GitHub PAT` | Local env / stored in memory | `git push` |

### 22.4 RLS enforcement (Supabase chat)

Per chat spec §16.6 — summary:

- Everything default-deny; RLS enabled on all tables
- `messages` — authed read; self-insert (with ban + body cap checks); self soft-delete within 5 min; self edit within 2 min; Majid full mod + hard-delete
- `pins` — authed read; Majid-only write
- `banned_uids` — self read + Majid write
- `reports` — self create; Majid read/update
- `moderation_log` — Majid read + append-only insert; no update/delete ever
- `session_events` — self insert; Majid read
- `users` — self read/write; cannot claim `is_majid=true`; cannot change email

All uid comparisons use `(auth.jwt()->>'sub')` (text) not `auth.uid()` (UUID — would break text comparison).

### 22.5 GoTrue bypass

Supabase Auth (GoTrue) is **not used**. Custom JWTs minted by Apps Script are attached manually via `supabase.createClient({ global: { fetch: customFetch } })` that injects `Authorization: Bearer <jwt>` on every request. GoTrue rejects our non-UUID sub claim; we don't need GoTrue because we don't manage Supabase-native user accounts. See [§27 Operational gotchas](#27-operational-gotchas).

### 22.6 Rate limits

- **Chat messages:** 5/min, 30/hr, 200/day per user. `rate_state` table schema exists; trigger enforcement deferred from V1 (known gap from spec §8.3, tracked in plan Appendix B.1).
- **Apps Script:** Google's default quotas (URL fetches 100K/day Workspace, Gmail sends 1,500/day Workspace, 6 hours/day total runtime). Chat archive flow uses ~1 UrlFetch/week — nowhere near limits.
- **Supabase Free tier:** 50K DB reads/day, 20K writes/day, 1 GB storage, 10 GB egress/month, 200 concurrent realtime connections — all well above current MA Learn scale.

### 22.7 Anti-piracy telemetry

Chat V1 captures:
- `messages.ip_hash` = salted SHA-256 of client IP (16 hex chars) on every insert
- `session_events` row on every sign-in with `ip_hash` + `user_agent`

No detection logic yet — data capture only. Future workstream queries for patterns (same uid from multiple IPs/countries within minutes, token-sharing signals, unusual access bursts). Scoped separately per spec §9.

---

## 23. Backup + rollback

### 23.1 Git tags (rollback anchors)

| Tag | Repos | Marks |
|---|---|---|
| `pre-redesign-2026-04-23` | malearnsa, ma-learn-dashboard, malearnsa-player, intro-to-ai-checkout | Pre-Editorial Atelier (all Cairo-era surfaces) |
| `chat-v1` | malearnsa-player + local `~/code/malearn-chat/` | Chat V1 shipped 2026-04-24 |

Rollback example:
```bash
cd ~/code/malearnsa-player
git reset --hard chat-v1   # or pre-redesign-2026-04-23
git push --force-with-lease origin main
```
GitHub Pages redeploys within ~60s.

### 23.2 Archived material

- `archives/` directory in MA EA workspace — outdated material that's preserved but not deleted (policy: never delete)
- `archives/redesign-2026-04-23/` — pre-redesign snapshots

### 23.3 Recovery paths

- **Customer data (Tokens, Customers, Subscribers):** Google Sheets native version history (30 days) + Google Takeout export on demand
- **Chat data:** Weekly Google Sheet archive (`16BVowXL...`) retains all messages across all time, per-week tabs. Messages table wipes weekly but archive is permanent.
- **Daftra invoices:** Daftra retains its own history at `malearn.daftra.com`
- **Supabase PITR:** Not available on Free tier (Pro+ only). Current mitigation: weekly archive + Postgres backups via Supabase managed backups (daily snapshots retained 7 days on Free)

---

## 24. Observability

### 24.1 Telegram alerts (Noor)

- Chat wipe success/failure → `@MajidNoorBot` DM
- Future: critical Apps Script errors, weekly revenue summary, seat sellouts

### 24.2 Logs

| System | Log location |
|---|---|
| Apps Script | Cloud Logging — per script, "Executions" tab in script.google.com |
| Supabase Edge Functions | Supabase Studio → Functions → per-function logs |
| Fastify backend | `pm2 logs ma-learn-dashboard-prod` on droplet |
| Noor bot | `journalctl -u noor.service` on droplet |
| Postgres | Supabase Studio → Database → Logs |

### 24.3 Dashboard Activity page

`admin.malearnsa.com/#activity` reads `AuditLog` tab of Dashboard Admin Sheet — every write lands here with timestamp + actor + action + diff. Searchable, filterable.

---

## 25. Operating SOPs

Consolidated from memory feedback files — these are non-negotiable rules.

### 25.1 Pricing

**Always ask before setting prices** ([memory/feedback_ask_before_pricing.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/feedback_ask_before_pricing.md)). Current locked prices from [memory/project_harvest22_pricing.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/project_harvest22_pricing.md):
- T2: 449 SAR (public, M3 launch May 6)
- T3 Cohort 2: 1,199 flat · 1,299 bundle
- T4: 3,500 individual · 3,000 group
- Never discount below these.

### 25.2 Destructive actions

**Always show exact data before deletes/overwrites/cancels**, and wait for explicit per-action approval even if previously authorized generally ([memory/feedback_show_before_delete.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/feedback_show_before_delete.md)).

### 25.3 Clasp pushes

**Verify `.clasp.json` scriptId matches the live script before `clasp push`** ([memory/feedback_verify_clasp_before_push.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/feedback_verify_clasp_before_push.md)). Historical bugs: `.clasp.json` has pointed at phantom scripts before.

### 25.4 Install security

**Before installing any skill/MCP/plugin/agent/hook**, run [references/sops/install-security-check.md](../references/sops/install-security-check.md) and get Majid's approval ([memory/feedback_install_security_check.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/feedback_install_security_check.md)).

### 25.5 Bulk email

**Any bulk email request follows [references/sops/bulk-email.md](../references/sops/bulk-email.md)**, reusing `bulk-email-template-script.js`. No alternatives ([memory/feedback_bulk_email_sop.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/feedback_bulk_email_sop.md)).

### 25.6 Friday zero-work through Oct 1, 2026

Non-negotiable. Exceptions: pre-committed cohort delivery sessions only ([memory/feedback_friday_zero_work.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/feedback_friday_zero_work.md)).

### 25.7 T3 module unlock workflow

Every M3/M4/M5/M6 unlock also triggers an update to the T3 confirmation email in token-validator. Remind Majid. Stop at 30/30 sellout ([memory/feedback_t3_module_unlock_workflow.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/feedback_t3_module_unlock_workflow.md)).

### 25.8 Checklists

Any dictated pre-event checklist = one Linear task + one GCal reminder per occurrence. Keep both in sync on every edit ([memory/feedback_checklist_dual_surface.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/feedback_checklist_dual_surface.md)).

### 25.9 Morning briefing

Format: HTML dashboard in Chrome + Linear task table in conversation, English, both parts mandatory ([memory/feedback_morning_brief.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/feedback_morning_brief.md)). Harvest 22 progress block added 2026-04-22.

### 25.10 Deployment ownership

Noor owns GitHub + deployment. Push code, deploy sites — never ask Majid to do it ([memory/feedback_deployment_ownership.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/feedback_deployment_ownership.md)).

### 25.11 Design

**Always use `/ui-ux-pro-max` skill for design work** before any visual design output ([memory/feedback_design_skill.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/feedback_design_skill.md)).

### 25.12 Quota diagnosis

Identify which API quota is capped AND check sibling APIs (e.g., GmailApp vs Gmail Advanced Service) before proposing workarounds ([memory/feedback_quota_diagnosis.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/feedback_quota_diagnosis.md)).

### 25.13 GitHub PAT scope

`intro-to-ai-checkout` requires classic PAT (fine-grained gets 403). Use `ghp_PVpH...` for checkout pushes ([memory/feedback_github_token_scope.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/feedback_github_token_scope.md)).

---

## 26. Deferred / post-wedding

### 26.1 Briefer V1

All active work PAUSED 2026-04-22. Resume earliest Oct 2026 after Harvest 22 + wedding, to be decided at MAL-215 Q4 debrief. Domain stays registered; no content work until reopened. See [memory/project_briefer_v1.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/project_briefer_v1.md).

### 26.2 Full LMS Phase 2 migration

Next.js + Supabase + Vercel rebuild of the entire course platform. Replaces the current Apps Script + Sheets + token system. Targeted post-wedding. Until then, Apps Script + Sheets is the production architecture.

### 26.3 Chat V1 known gaps

Tracked in plan Appendix B.1:
- Rate-limit enforcement (5/min, 30/hr, 200/day — `rate_state` schema exists; trigger deferred)
- Student report-message UI (RLS allows; client UI deferred)
- Edit-own-message UI (RLS allows 2-min window; client UI deferred)

### 26.4 Chat V2+ ideas

From spec §10.2:
- Weekly digest email (chat highlights)
- Image/voice/video messages
- Threading / reactions
- AI assistant (v3/v4 — Majid's knowledge baked in, answers questions real-time)
- Anti-piracy detection + alerts (telemetry already captured)
- Dedicated admin dashboard for chat
- Message search, presence, DMs between students

### 26.5 Noor Phase 2

Deferred from Phase 1 ([memory/project_noor_phase2_scope.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/project_noor_phase2_scope.md)):
- Pub/Sub auto-labeling
- Proactive Lead/Client analysis
- Daily digest
- Few-shot style learning
- Fix broken GitHub Actions deploy

### 26.6 MA Studio

Parallel business (photography + creative studio) ramping up alongside MA Learn from 2026-04-19. Farsi Jewelry = first active project. Full intake pending. See [memory/project_ma_studio_kickoff.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/project_ma_studio_kickoff.md).

### 26.7 Dashboard future iterations

- Dashboard Contacts (CRM) — Week 2 scope, unified view over Customers + Waitlist + Subscribers, per-contact card for dedicated emails / resend links / gifts. Spec at [memory/project_dashboard_contacts.md](../../.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/project_dashboard_contacts.md).

---

## 27. Operational gotchas

Caught-during-build patterns worth remembering.

### 27.1 `auth.uid()` vs text uid (RLS)

Supabase's `auth.uid()` helper casts JWT `sub` to UUID. Our uids are text (sha256-derived), not UUIDs — so `auth.uid()` throws `operator does not exist: text = uuid`. Every RLS policy uses `(auth.jwt()->>'sub')` to extract `sub` as text. Documented in chat spec §16.6.

### 27.2 GoTrue rejects non-UUID `sub`

Supabase GoTrue (`/auth/v1/user`) validates JWT `sub` as UUID. `supabase.auth.setSession()` internally calls getUser → throws for our uids → session never stored → all REST calls become 401. **Fix:** bypass GoTrue entirely. Use `createClient({ global: { fetch: customFetchWithJWT } })` + `supabase.realtime.setAuth(jwt)`. We never talk to GoTrue because we don't use Supabase-native user accounts.

### 27.3 `pg_net` cross-transaction visibility

`net.http_post()` returns immediately; the pg_net background worker stores the response in a separate transaction. Plain `SELECT` polling from within the caller's transaction doesn't see the written row until commit. **Fix:** use `net.http_collect_response(id, async := false)` which handles cross-txn visibility correctly.

### 27.4 Supabase Management API timeout

`api.supabase.com/v1/projects/*/database/query` has a ~100s Cloudflare gateway + Postgres statement_timeout. Long-running functions (like `weekly_wipe()` waiting for Edge Function response) hit this. **Workaround:** run via Studio SQL Editor (no gateway limit) or let `pg_cron` run it (server-side, no gateway).

### 27.5 Apps Script POST redirects

`script.google.com/macros/s/.../exec` returns 302 on POST, redirecting to `script.googleusercontent.com`. curl can't follow with body preservation by default (`-L` downgrades POST to GET at the redirect). Deno's `fetch` handles it correctly. **Fix in Edge Functions:** plain `fetch(url, { method: 'POST', body: form })` works.

### 27.6 Clasp RAPT expiration

Google's Reauthentication at Persistent Times (RAPT) expires every few days. `clasp push` fails with `invalid_grant: invalid_rapt` → need `clasp login --reauth` in an interactive shell. Not automatable (browser OAuth required).

### 27.7 KSA CNTXT reseller wall

Google Cloud in KSA routes all purchases through **CNTXT** reseller. Upgrading a Firebase project to Blaze triggers the redirect. Contract + minimum commits + 1–3 weeks to onboard. **Pivoted away** from Firebase → Supabase 2026-04-24 to avoid this entirely. Applies to any future GCP service for the platform — check CNTXT requirements before depending on GCP.

### 27.8 `.clasp.json` historical drift

Has pointed at phantom scripts that don't match the live deployment. **Always** verify the scriptId in `.clasp.json` against memory (`reference_apps_script_ids.md`) before pushing. Canonical token-validator scriptId: `1OPM0ii4...`. Old references to `1L9-cZE...` are stale forks — don't push to those.

### 27.9 Moyasar test vs prod keys

Two separate Moyasar API keys exist (test and prod). Staging/dev use test; production uses prod. Mixing them is silent failure (charges succeed but don't reach the real account). Verify the key prefix before deploying checkout changes.

### 27.10 Daftra client search broken

Can't reliably look up existing clients by email. Must cache the `client_id` by email in PropertiesService (`daftra_<email-lowercase>`). If a duplicate client gets created, run `daftraCacheClientId(email, id)` in the Apps Script editor to fix.

### 27.11 Chat module race conditions

`watch.html` dispatches `lesson:changed` from `loadLesson()` before `chat-bootstrap.js` modules have mounted listeners. **Fix (V1):** every chat module reads `window.__currentLessonId` and `window.__chatProfile` at mount time and triggers handlers directly if globals are already populated.

### 27.12 CSS `display: flex` overriding `[hidden]`

HTML `hidden` attribute defaults to UA `display: none` but author CSS with higher specificity overrides. Always pair `display:` rules with explicit `[hidden] { display: none !important }` when using `hidden` for toggle.

### 27.13 Apps Script deployed version ≠ HEAD

`clasp push` updates HEAD but the web app URL is pinned to a numbered deployment. After push, always `clasp deploy -i <deploymentId> -d "vN <description>"` to bump the version. Otherwise `clasp push` changes are invisible to callers.

---

## 28. Reference index

### 28.1 Memory files (authoritative for anything that's not in the code)

All under `/Users/mastudio/.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/`:

- `MEMORY.md` — index
- **Projects:** `project_malearn_checkout.md`, `project_player_chat_v1.md`, `project_composer_v1_locked.md`, `project_contacts_export.md`, `project_dashboard_contacts.md`, `project_emails_v2_backlog.md`, `project_harvest22_plan.md`, `project_harvest22_pricing.md`, `project_t2_and_t3c2_pages.md`, `project_t3_cohort1_checklists.md`, `project_noor_telegram.md`, `project_noor_phase2_scope.md`, `project_apps_script_account.md`, `project_pending_transfer_buyers.md`, `project_briefer_v1.md`, `project_ma_studio_kickoff.md`, `project_april16_off.md`, `project_aug_buffer_week.md`
- **References:** `reference_malearn_site_mapping.md`, `reference_apps_script_ids.md`, `reference_supabase.md`, `reference_bunny.md`, `reference_daftra.md`, `reference_tamara.md`, `reference_anthropic.md`, `reference_github.md`
- **Feedback (SOPs):** `feedback_ask_before_pricing.md`, `feedback_bulk_email_sop.md`, `feedback_checklist_dual_surface.md`, `feedback_deployment_ownership.md`, `feedback_design_skill.md`, `feedback_friday_zero_work.md`, `feedback_github_token_scope.md`, `feedback_install_security_check.md`, `feedback_morning_brief.md`, `feedback_quota_diagnosis.md`, `feedback_show_before_delete.md`, `feedback_t3_module_unlock_workflow.md`, `feedback_verify_clasp_before_push.md`, `feedback_waitlist_purchase_col.md`
- **User:** `user_assistant_name.md` (AI is "Noor")

### 28.2 SOPs + references

Under `references/sops/`:
- `bulk-email.md` + `bulk-email-template-script.js`
- `apps-script-clasp.md`
- `install-security-check.md`
- `launch-checklist.md`
- `linear-workspace.md`
- `notion-workspace.md`
- `collaboration-workflow.md`

### 28.3 Specs + plans

Under `docs/superpowers/`:
- **Specs:** `2026-04-23-player-chat-design.md`, `2026-04-23-dashboard-player-redesign-design.md`, `2026-04-23-player-admin-design.md`, `2026-04-23-contacts-crm-design.md`, `2026-04-20-emails-v2-and-newsletter-design.md`, `2026-04-18-ma-ea-dashboard-design.md`, `2026-04-15-noor-multi-gmail-phase1.md`, `2026-04-15-noor-agents-expansion-design.md`, `2026-04-14-noor-agent-sdk-upgrade-design.md`
- **Plans:** `2026-04-24-player-chat-supabase.md`, `2026-04-23-player-chat.md` (Firebase, deprecated), `2026-04-23-dashboard-player-redesign.md`, `2026-04-23-player-admin.md`, `2026-04-23-contacts-crm.md`, `2026-04-20-emails-v2-and-newsletter.md`, `2026-04-19-ma-learn-dashboard-features.md`, `2026-04-18-ma-learn-dashboard-foundation.md`, `2026-04-18-operator-checklist.md`, `2026-04-15-noor-agents-expansion.md`, `2026-04-14-noor-agent-sdk-upgrade.md`

### 28.4 Runbooks

- `~/code/ma-learn-dashboard/PROD.md` — Dashboard operator runbook
- Noor: no current runbook (deploy is manual SSH + `systemctl restart noor`)

### 28.5 Decision log

`decisions/log.md` — append-only chronological record of meaningful platform decisions. Format: `[YYYY-MM-DD] DECISION: ... | REASONING: ... | CONTEXT: ...`.

### 28.6 Context files

Under `context/`:
- `me.md` — Majid's profile
- `work.md` — business overview
- `team.md` — team state (solo currently)
- `current-priorities.md` — Q2 active work
- `goals.md` — Q2/Q3/Q4 2026 targets

---

## Appendix: How to update this doc

When platform state changes materially:

1. Append a dated entry to `decisions/log.md` describing the change
2. Update the relevant section(s) of this PLATFORM.md
3. Update the `Last updated:` date at the top
4. If the change warrants a memory update, edit/create the relevant memory file too
5. Commit with a `docs(platform):` prefix

What counts as "material":
- New repo, subdomain, service
- Pricing change
- Product launch or retirement
- Schema change to any Sheet or DB table
- New integration (payment gateway, third-party API, etc.)
- Security model change (new secret, rotated keys, changed auth flow)
- Deprecation or EOL of any surface

What doesn't:
- Bug fixes within existing surfaces
- Copy/design tweaks
- One-off operator tasks
