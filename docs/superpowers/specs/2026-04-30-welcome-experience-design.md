# /welcome — Personalized AI Onboarding Experience

**Date:** 2026-04-30
**Status:** Design approved. Pending implementation plan.
**Target ship windows:**
- Build (Stage 0 staging): May 3 → May 22, 2026
- Internal + tester soak: May 22 → ~May 31, 2026
- Public `/welcome` launch (Stage 1): ~June 1, 2026
- Decision gate: ~June 15, 2026 (after 14 days of public traffic)
**Owner:** Noor (build), Majid (content + decision gates), Layan (downstream IG nurture sequence)
**Linear:** child issues inside Harvest 22 M2/M3/M5/M6, prefix `WELCOME-`, tagged `welcome-experience`

---

## 1. Summary

A personalized landing experience at `malearnsa.com/welcome` that greets every visitor with a tailored hero + tip cards based on what we already know about them — primarily which AI creative tool they were using before they clicked through. Reuses existing infrastructure (Supabase, Anthropic key, ManyChat Pro, Composer v1, dashboard) and ships in 3 weeks at <$25/mo all-in.

The system has four principles baked into every layer:

1. **Staging-first, never live-first.** The entire system is built and tested on a hidden staging clone of the homepage that only Majid + Noor can access. Nothing reaches public traffic until staging soak passes. See §4.8.
2. **Value first, ask second.** Personalization happens before any form. We never ask people what we already know, and never ask cold visitors anything until we've delivered a clear hit of value.
3. **Native measurement.** Every metric needed to judge success ships with the build, surfaced in `admin.malearnsa.com/welcome-analytics` — not just GA.
4. **Nothing rigid.** Tools, tip cards, prompts, CTAs, lead-state rules, capture destinations — all data-driven, all editable from the dashboard. No code changes for content or rule iteration.

The experience promotes through three stages, each with its own gate:

1. **Stage 0 — Hidden staging** (`staging-welcome.malearnsa.com`): build + internal soak. Only Majid + Noor + invited testers can access. Search engines blocked. No real captures. Must pass internal QA before promotion.
2. **Stage 1 — Public `/welcome`** (`malearnsa.com/welcome`): parallel URL. IG bio + email links migrate here. A/B against current homepage. Must hit decision-gate metrics before promotion.
3. **Stage 2 — Live homepage swap** (`malearnsa.com/`): only if Stage 1 metrics earn it. Old homepage retired to `/legacy` for rollback.

---

## 2. Audience priority

1. **Priority A (v1):** Funnel traffic — anyone arriving from IG bio, ManyChat, email, or paid ads. We control these URLs and pass rich context via signed JWTs.
2. **Priority B (v3 deferred):** Cold organic — direct visits, search, AI-citation traffic. v1 supports them with a chip-selector fallback inside the primary flow, but does not optimize for them.
3. **Priority C (v2):** Returning customers — known buyers visiting `/welcome`. Different system prompt + tip library, no sales push, focused on retention/upsell.

---

## 3. User journey

### Scenario 1 — IG bio click (most common, Priority A)

1. Visitor clicks IG bio link: `malearnsa.com/welcome?ref=ig_bio&t=<JWT_from_manychat>`
2. Vercel Edge Middleware verifies JWT, extracts `{ ig_handle, source_post, lead_state }`, builds signal bundle, looks up greeting cache
3. Page renders in ~1.0–1.4s with personalized hero: **"أهلاً <name>. شفت إنك تتابع شي عن Midjourney — جمعت لك 3 نصايح تخلي صورك تطلع أنظف."**
4. 3 tip cards render below (Majid-voiced, fetched from `tip_cards` table)
5. Soft CTA below tip: tier-appropriate course recommendation
6. Bottom-right: Noor chat bubble pulses gently after 1.5s
7. Visit logged async to `welcome_visits`. IG handle silently linked to existing/new lead. No form shown.

### Scenario 2 — Email click

1. URL: `malearnsa.com/welcome?ref=email&t=<email_jwt>`
2. JWT contains email + name + last_email_topic
3. Same flow as Scenario 1, but greeting acknowledges email source: **"شكراً إنك فتحت الإيميل، <name>."**
4. Tip card selection biases toward whatever the email was about (T2 launch, T3 reminder, etc.)

### Scenario 3 — Cold organic / no token

1. URL: `malearnsa.com/welcome` with no `t=` param
2. Edge function falls back to referrer + UTM detection
3. If still no tool signal: render chip selector inline — **"وش أداة AI تستخدم؟"** with 7 chips (Midjourney / Higgsfield / Weavy / Magnific / Luma / OpenArt / غير ذلك)
4. User taps a chip → page personalizes inline (no reload), tip cards swap in, greeting updates
5. Below tip: optional inline ask — **"أبي أرسلك نصايح <tool> أسبوعياً؟ إيميلك:"** Skippable.
6. If user starts to leave without engaging: exit-intent overlay — **"قبل ما تروح، أرسلك ملخص مخصص؟"**

### Scenario 4 — Returning visitor

1. Cookie matched in `welcome_visits` to prior session(s)
2. Greeting acknowledges return: **"رجعت، <name>. آخر مرة كنت مهتم بـ <tool>. عندي شي جديد لك."**
3. Tip card selection excludes cards seen in prior visit
4. CTA upgrades by one tier (warmer lead = warmer ask)

### Scenario 5 — Returning customer (v2 — deferred to M5)

1. Cookie or token matched to row in `customers` table
2. `lead_state="customer"` triggers different system prompt + tip library
3. Greeting reframes: **"أهلاً <name>، شو ناقصك من <course they own>؟"**
4. No sales push for tier they already own. Focus on engagement / upsell to next tier.
5. Optional: redirect customer to `player.malearnsa.com/welcome-back` for cleaner separation. Decided in v2 design pass.

### Scenario 6 — Chat opt-in (any of the above)

1. User clicks Noor bubble
2. Chat opens (mobile fullscreen / desktop side-panel) — reuses ~70% of player-chat-v1 React components
3. Noor opens with a personalized hello + offer to dive deeper
4. Each user message → 1 Haiku 4.5 call, streamed
5. System prompt enforces 5-bucket scope (see §6.4) + 6 edge-case rules (see §6.5)
6. Capture happens in-conversation when natural ("أرسلهم على وين؟"), never as a form
7. Conversation logged to `welcome_chats`

---

## 4. System architecture

### 4.1 Reuse (zero new vendor cost)

1. **Supabase** (existing `malearn-chat` project) — adds 5 new tables to existing instance
2. **Anthropic API** (existing Noor key) — Haiku 4.5 for all v1 LLM calls
3. **ManyChat Pro** (existing) — issues JWTs at end of welcome DM flow
4. **Composer v1 / newsletter** (existing) — destination for email captures
5. **admin.malearnsa.com dashboard** — extended with two new tabs: `Welcome Tips` (content) and `Welcome Analytics` (metrics)
6. **player-chat-v1 React components** — forked for public Noor widget (different system prompt, same UI shell)
7. **Email token-validator Apps Script** — extended to issue `t=` JWTs on email CTA URLs
8. **Telegram Noor bot** — extended to receive hot-lead alerts + send daily digest

### 4.2 Net new (built fresh)

1. Next.js 15 app (App Router) on Vercel — single repo, `welcome` route
2. Vercel Edge Middleware — signal decode + cache lookup + LLM call orchestration
3. Vercel KV (free tier) — greeting cache, 24h TTL, signal-bucket keyed
4. JWT shared-secret rotation — one secret for ManyChat→/welcome, one for email→/welcome, both stored in Vercel env vars + Supabase Vault for rotation tracking
5. 5 Supabase tables (see §4.5)
6. Cloudflare Bot Management on `/welcome` (free tier) — fronts Vercel
7. Daily Anthropic spend alert at $10/day (via existing monitoring)

### 4.3 Data flow on a single visit

```
1. User clicks → /welcome?ref=ig_bio&t=<JWT>

2. Cloudflare Bot Management
   ├─ Bot detected → captcha or block
   └─ Human → forward to Vercel

3. Vercel Edge Middleware (target <100ms cache-hit, <800ms cache-miss):
   ├─ Verify JWT signature (HS256, shared secret)
   ├─ Read cookie → match to existing welcome_visits / customers
   ├─ Read referrer + UTM params
   ├─ Build signal_bundle (JSONB):
   │    { language, name, tool_signal, lead_state, returning,
   │      is_customer, day_part, source_channel }
   ├─ Cache key = hash(tool, lead_state, lang, day_part, prompt_version)
   └─ Cache lookup
        ├─ HIT (~90% target) → return cached { greeting_line, tip_card_ids, recommended_cta, close_line }
        └─ MISS (~10%) → call Haiku 4.5 → cache result 24h

4. Server Component renders:
   ├─ Hero with personalized greeting
   ├─ 3 tip cards fetched from tip_cards table by ID
   ├─ Recommended CTA tier
   └─ Standard MA Learn footer module

5. Client hydrates → Noor chat bubble pulses at 1.5s

6. Async fire-and-forget:
   ├─ INSERT into welcome_visits with full signal_bundle + render outcome
   └─ Update lead_state if changed

7. If chat opened:
   ├─ Each message = 1 Haiku call, streamed
   ├─ Conversation logged to welcome_chats
   └─ On natural capture moment → write to welcome_captures + fire all destinations

8. On CTA click:
   ├─ Log cta_click event
   └─ Redirect to checkout / waitlist / course page
```

### 4.4 Identity model

1. **Anonymous** — `cookie_id` only. Logged but no personal data.
2. **ManyChat-known** — `ig_handle` + `cookie_id` linked.
3. **Email-known** — `email` + `cookie_id` linked.
4. **Customer** — matched to row in `customers` table by email or ig_handle. Full identity, premium experience.
5. **Linked-across-time** — same human across visits links via cookie_id even if anonymous originally then later provides email.

### 4.5 Supabase schema (new tables)

#### `tools`
| column | type | notes |
|---|---|---|
| id | text PK | e.g. `midjourney` |
| name_ar | text | "ميدجورني" |
| name_en | text | "Midjourney" |
| icon_url | text | small SVG/PNG |
| signal_keywords | text[] | ["midjourney", "mj", "midj"] |
| referrer_domains | text[] | ["midjourney.com"] |
| is_active | bool | toggle from dashboard |
| sort_order | int | controls chip selector order |

Seed rows: midjourney, higgsfield, weavy, magnific, luma, openart. Plus operational `other` row used by chip selector + chip-selector-only Other mappings.

#### `tip_cards`
| column | type | notes |
|---|---|---|
| id | text PK | e.g. `mj_002` |
| tool_id | text FK → tools | |
| language | text | `ar` / `en` |
| lead_state | text | `cold` / `warm` / `hot` / `customer` / `any` |
| body_md | text | the card content (markdown) |
| image_url | text | optional, S3/CDN |
| cta_tier | text | `T1`/`T2`/`T3`/`T4`/`none` |
| cta_label | text | optional override |
| weight | int | LLM picks higher-weight cards more often |
| is_active | bool | toggle from dashboard |
| created_at | timestamptz | |
| updated_at | timestamptz | for freshness tracking |
| version | int | content version |

v1 seed: 5 cards × 6 tools × 2 languages = **60 cards**, plus 3 cards × 2 languages for the operational `other` bucket (general creative AI fundamentals: prompt fundamentals, AI ethics in creative work, "AI is leverage not replacement" philosophy) = **66 cards total**. Higgsfield / Weavy / Magnific cards (~30) require Majid voice memo + draft pass. Other tools draft from public sources + Majid approves.

#### `prompt_versions`
| column | type | notes |
|---|---|---|
| version | int PK | semver-like |
| prompt_type | text | `greeting_generator` / `chat_noor` |
| system_prompt | text | full text |
| few_shots | jsonb | array of { signal_bundle, output } examples |
| model_id | text | `claude-haiku-4-5-20251001` initially |
| is_active | bool | one active per type |
| created_at | timestamptz | |

Roll forward/back without deploy. Test new prompts in shadow mode (log output, don't render) before flipping active.

#### `welcome_visits`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| cookie_id | text | client-set cookie |
| ig_handle | text | nullable |
| email | text | nullable |
| customer_id | uuid | nullable, FK |
| signal_bundle | jsonb | full bundle for cohort analysis |
| greeting_source | text | `cache` / `llm` / `static_fallback` / `generic_fallback` |
| greeting_line | text | what was shown (for QA review) |
| tip_card_ids | text[] | what was rendered |
| recommended_cta | text | `T1`-`T4` |
| visited_at | timestamptz | |
| engaged | bool | scrolled past hero or opened chat |
| captured | bool | gave email/IG inline |
| cta_clicked | text | which CTA, if any |

Retention: 90 days full, anonymized after.

#### `welcome_chats`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| visit_id | uuid FK | |
| messages | jsonb | array of { role, content, timestamp } |
| message_count | int | derived |
| capture_in_session | bool | did we get email/IG mid-chat |
| ended_at | timestamptz | |

#### `welcome_captures`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| visit_id | uuid FK | |
| email | text | nullable |
| ig_handle | text | nullable |
| capture_method | text | `inline_form` / `chat` / `exit_intent` |
| signal_bundle | jsonb | snapshot at capture time |
| destinations_fired | jsonb | log of which destinations succeeded |
| captured_at | timestamptz | |

#### `cta_rules`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| name | text | human label |
| signal_pattern | jsonb | conditions to match |
| recommended_tier | text | `T1`-`T4` |
| copy_variant | text | optional CTA copy override |
| priority | int | first match wins |
| is_active | bool | |

#### `lead_state_rules`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| state | text | `cold`/`warm`/`hot`/`customer` |
| conditions | jsonb | predicate over signal_bundle |
| priority | int | |

#### `capture_destinations`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| name | text | e.g. "ManyChat tag", "Newsletter list", "Telegram hot-alert" |
| signal_match | jsonb | which capture types fire to this destination |
| webhook_url | text | nullable for built-ins |
| auth_secret_ref | text | env var name |
| is_active | bool | |

v1 seed rows: ManyChat tag, Newsletter list (Composer v1), Telegram hot-alert, Telegram daily digest.

### 4.6 Latency budget

- Total page-load target: **<1.5s on 4G mobile** (Saudi median)
- Edge middleware cache hit: **<100ms**
- Edge middleware cache miss (LLM): **<800ms** (Haiku 4.5 streaming)
- Tip card fetch (Supabase): **<50ms** (parallelized with greeting)
- Hero visible: **~1.0–1.4s**
- Chat bubble pulse: **~1.5s**
- Edge timeout: **800ms** — exceeded → static fallback

### 4.7 Anti-abuse

1. JWT TTL: 1 hour; single-use redemption (consumed flag in DB)
2. Public chat rate limit: 10 messages per IP per 24h
3. Cloudflare bot management on /welcome
4. Anti-jailbreak in system prompt + topic guardrails (see §6)
5. Honeypot field in inline capture form
6. Daily Anthropic spend alert at $10/day
7. Cache hit-rate monitoring — alert if drops below 70%

### 4.8 Staging environment (CRITICAL — non-negotiable)

**Nothing reaches public traffic until it has soaked in staging and Majid signs off.** This is a locked architectural requirement, not an optional safety. The risk of a bad first impression on a personalized greeting is too high — voice drift, broken latency, or an off-tone tip card can poison a lead's first encounter with MA Learn permanently.

#### 4.8.1 Staging URL & access

1. **URL:** `staging-welcome.malearnsa.com` (subdomain on the new Next.js Vercel deployment)
2. **Access control:** Vercel deployment-level password protection (Pro tier). Single shared password rotated monthly. Stored in 1Password (Majid) + Supabase Vault (Noor). If we end up on Hobby tier, fallback is middleware-enforced signed-cookie auth issued via magic link to Majid's email.
3. **Search engine block (defense in depth):**
   - `X-Robots-Tag: noindex, nofollow, noarchive` HTTP header on every staging response
   - `<meta name="robots" content="noindex, nofollow, noarchive">` in `<head>`
   - Staging-specific `robots.txt` denying all
   - Subdomain not listed in any sitemap.xml
4. **Invited testers (optional during soak):** Layan for content review, plus 3–5 trusted humans Majid picks. They get the same shared password. No external/anonymous access ever.

#### 4.8.2 Staging data isolation

1. **Separate Supabase schema:** all staging writes go to schema `staging`, prefixed tables (`staging.welcome_visits`, `staging.welcome_chats`, etc.). Production schema `public` is untouched.
2. **Tip cards table is shared** (read-only from staging) — staging reads the same content Majid is editing for production. Avoids divergence.
3. **No real captures fired:** staging captures write to `staging.welcome_captures` only. ManyChat tagging, newsletter add, Telegram alerts, daily digest — all disabled in staging mode (env flag `IS_STAGING=true`). Captures in staging are dummy data for QA.
4. **No real Anthropic spend cap leakage:** staging LLM calls count against the same Anthropic key but are tagged with metadata `env=staging` so the daily spend alert separates them.
5. **No real cookie carryover:** staging cookies live on the staging subdomain only. A user who tests in staging then visits production starts fresh — production behavior is not affected by staging activity.

#### 4.8.3 Mock-token admin UI (staging only)

Majid can't easily test "I came from ManyChat as Khalid using Midjourney with warm lead state." Instead of going through ManyChat each test:

1. A small admin UI at `staging-welcome.malearnsa.com/_test` lets Majid (or Noor) issue a mock JWT in seconds.
2. Form fields: name, ig_handle, tool, lead_state, language, day_part, source_channel.
3. Output: a one-click link that opens `/welcome?ref=<channel>&t=<jwt>` in a new tab as that simulated user.
4. Includes preset scenarios (warm Midjourney user / cold organic / returning customer / hot T4 intent / etc.) for fast scenario sweeping.
5. Disabled in production via `IS_STAGING` env flag.

#### 4.8.4 Stage 0 → Stage 1 promotion gate

Before staging promotes to public `/welcome`:

1. **Internal soak ≥ 5 days.** Majid uses it daily across all 6 tools, both languages, and all lead states via the mock-token UI.
2. **Voice review.** Majid reviews the last 50 generated greetings in the dashboard's "Recent Outputs" tab. Flags any off-brand outputs. Voice tuning iterations until ≤2/50 are flagged.
3. **Latency check.** P95 page load on real Saudi 4G mobile devices ≤ 2.0s (cache hit) and ≤ 3.0s (cache miss). Tested on actual phones, not Chrome devtools throttle.
4. **Fallback chain test.** Manually trigger every fallback path (LLM down, JWT invalid, banned phrase, no tool signal, etc.) and verify the UX is graceful in each.
5. **Mobile review.** Real-device test on iPhone (Safari) + Android (Chrome) + at least one older Android (Galaxy A-series).
6. **External tester soak ≥ 2 days.** Layan + 3–5 invited friends use staging without coaching. Majid reviews their session recordings (or self-reports) before promoting.
7. **Majid signs off in writing** (Linear comment on the Stage 1 promotion ticket).

Only after all 7 pass does anything go to `/welcome` on public production.

#### 4.8.5 Stage 1 → Stage 2 promotion gate

Before public `/welcome` swaps into root `/`:

1. All v1 decision-gate metrics in §8.2 met for ≥ 14 consecutive days.
2. Conversion-positive vs. current homepage in head-to-head A/B (no statistical-significance theatre — Majid + Noor agree the data is clear and aligned with intuition).
3. Old homepage tagged + archived to `/legacy` route. DNS + redirects ready for rollback within 5 minutes if swap goes wrong.
4. Swap deployed during low-traffic window (Tuesday or Wednesday morning KSA), never Friday, never during Aug 9–15.
5. 7-day post-swap monitoring window with rollback authority pre-armed.

#### 4.8.6 Build-on-staging implication

The "build phase" of v1 happens entirely on staging. There is no separate "build environment" — staging IS the dev environment for everyone except code commits (those go to a feature branch, deploy to staging, soak there). The 3-week build window does not get longer because of staging — it's just where the build lives.

What gets longer: a 1-week soak window between "build complete" and "public launch." That moves the public launch from May 25 → ~June 1, and the v1 → v2 decision gate from May 28 → ~June 15. Worth it for the safety guarantee.

---

## 5. Personalization depth

**Locked: Medium-to-Heavy, scaled by version.**

### v1 (Medium)

1. Hero greeting — fully personalized (LLM-generated, voice-wrapped)
2. Tip card section — 3 cards selected per visitor from library
3. Primary CTA — tier and copy adapt to signal
4. Everything else — identical to current homepage clone

### v2 (Heavy — M5)

1. Section reorder per visitor
2. Different testimonials surface per tool/state (testimonials become a `testimonials` table)
3. Different hero image per tool
4. Different free-resource offer (lead magnet routing)
5. Returning-buyer experience added (Scenario 5)

### v3 (Pure-LLM optional — M6 if metrics earn it)

1. Sonnet 4.6 generates more of the experience per visit
2. Hybrid AI router — Noor decides per-visit whether to push buy-now / capture / conversation / hook
3. Cold-organic SEO landing pages (`/welcome/midjourney`, etc.)
4. **Homepage swap** — if v1+v2 outperform current homepage, repoint root `/` to `/welcome` content. Old homepage saved as `/legacy`.

---

## 6. AI prompt strategy

### 6.1 Two LLM call types

1. **Greeting generator** — fires on cache miss when someone hits `/welcome`. Generates personalized hero line + selects tip cards + chooses CTA tier. Cached 24h. ~10% of visits.
2. **Chat Noor** — fires per-message inside chat widget. Streaming, conversational. Only for users who open chat (~5–15% of visits).

### 6.2 The "warmth wrapper" pattern

The LLM does **not** write tip content. The LLM only generates:

1. The 1-sentence personalized opening
2. The 1-sentence close that bridges to the cards
3. The choice of WHICH 3 tip cards (from library of ~5 per tool) to surface
4. The choice of CTA tier (T1/T2/T3/T4)

Tip cards are 100% Majid-voice (he wrote them). LLM exposed surface area per visit ≈ 40–60 words.

### 6.3 Greeting generator output (validated JSON)

```json
{
  "greeting_line": "أهلاً خالد، شفت إنك تتابع شي عن Midjourney — جمعت لك 3 نصايح تخلي صورك تطلع أنظف.",
  "language": "ar",
  "tip_card_ids": ["mj_002", "mj_004", "mj_007"],
  "recommended_cta": { "tier": "T2", "reason": "warm midjourney user" },
  "close_line": "ولو تبي تتعلم الباقي بالتفصيل، 'مدخل إلى الذكاء الاصطناعي الإبداعي' يجيك بـ 449 ريال."
}
```

Server-side validation:
- `greeting_line` ≤ 25 words
- `tip_card_ids` all exist + belong to matching `tool_id`
- `recommended_cta.tier` ∈ {T1, T2, T3, T4}
- Banned-phrase regex check on greeting_line and close_line

Validation failure → static fallback path.

### 6.4 Chat Noor scope (5 buckets — locked tight)

1. **AI creative tools** — the 6 tools + general AI-creative questions, tip-level depth only
2. **Majid's courses** — T1/T2/T3/T4 details, who they're for, prices, content, schedule
3. **Site navigation** — finding pages, signing up, logging in
4. **Majid's work & approach** — bio, philosophy, "16 years credibility" positioning
5. **Buying help** — payment methods (Moyasar, BNPL Tamara, bank transfer Al-Inmaa), Daftra invoicing, refund policy

Anything else → warm redirect: **"هذا ما هو تخصصي — بس لو سؤالك عن AI الإبداعي أو كورسات ماجد، أنا معك."**

### 6.5 Chat edge-case rules (pre-decided in system prompt)

1. **"Fix my prompt"** → 1 quick suggestion (~2 sentences) + push to T2. Never becomes free prompt-engineering service.
2. **"Is your course worth it?"** → honest positioning + relevant testimonial from `testimonials` table. Never overpromise.
3. **"What's the difference vs. [competitor]?"** → brief, no trash-talk, focus on Majid's edge: 16 years, Saudi dialect, real-time mentorship, full Arabic.
4. **"Free lesson?"** → point to T2 graduation gift / BL preview / future lead magnet. Generous but bounded.
5. **"Critique my portfolio?"** → hard no, redirect to T4: **"هذي خدمة شخصية، تنفع T4 — ولا أرسلك معلومات عنه؟"**
6. **"Can I get a discount?"** → hard no, always: **"أسعارنا ثابتة. لو الميزانية ضيقة، T1 يبدأ من 99."**

### 6.6 Voice enforcement (5 layers)

1. **System prompt persona block** — explicit Saudi dialect rules, "friend and mentor not instructor," brand guardrails, hard banlist (e.g. "as an AI", "I am here to help", "feel free to")
2. **6–8 few-shot examples** — actual Majid-voice greetings across tool/state/language combinations, embedded in system prompt
3. **Length cap** — `greeting_line` ≤ 25 words
4. **Saudi dialect markers required** for Arabic outputs — "use words like وش / إيش / جالس / علقت / خلني"
5. **Post-processing regex check** — server scans output for banned phrases, falls back if detected

### 6.7 Hard guardrails

1. Never claim to be human; if asked who built you: **"صنعني ماجد العنقاوي. أنا نور."**
2. Never overpromise (no "you'll be a pro in a week")
3. Never discount; never invent courses that don't exist
4. Refuse: politics, medical, religious advice, financial advice, anything off-topic from creative AI / Majid's courses
5. Never reveal more about the user than they gave us (e.g. don't say "I see you visited 3 times" — creepy)
6. Never claim cross-site tracking ("I see you were just on Reddit") even if technically possible — privacy boundary

### 6.8 Fallback chain

1. **LLM succeeds + valid JSON** → render it
2. **LLM fails / invalid JSON / banned phrase** → static fallback per known tool ("أهلاً، إذا تستخدم Midjourney جمعت لك 3 نصايح:" + 3 default cards by `weight`)
3. **No tool signal at all + LLM unhealthy** → standardized generic greeting + brief platform intro. **No chip selector, no questions, no personalization.** Just: **"أهلاً، أنا نور، مساعد ماجد. خلني أعرّفك على MA Learn."** Same warm tone, just not personalized. Applies only when system is degraded.
4. **Total catastrophic failure** → render current homepage hero unchanged, log incident

The page never breaks. Worst case is "less personalized," not "broken."

Note: in the **primary cold-organic flow** (Scenario 3, healthy LLM, no signal), the chip selector still applies — that's a happy-path personalization tool, not a fallback.

### 6.9 Cost math at v1 funnel volume (~1,000 visits/mo)

1. Greeting LLM calls (after 90% cache): ~100/mo × ~2K input + 200 output × Haiku 4.5 ≈ **$0.30/mo**
2. Chat sessions: ~50/mo × ~10 messages × ~1K input + 200 output × Haiku 4.5 ≈ **$1.50/mo**
3. **Total LLM: ~$2/mo at v1 volume.** At 10× volume: ~$20/mo.

---

## 7. Capture & destinations

### 7.1 Capture mechanic

**Locked: skip ask for known users (ManyChat/email tokens). For anonymous: layered B + C + D.**

1. **ManyChat token visit** → ig_handle silently captured. No ask.
2. **Email token visit** → email silently captured. No ask.
3. **Customer match (by ig_handle or email)** → full identity, no ask.
4. **Anonymous** → three layered capture moments:
   - **B.** Soft inline ask under tip cards: "أبي أرسلك نصايح <tool> أسبوعياً؟" (skippable)
   - **C.** Contextual mid-chat ask: "بناءً على وش قلت لي، عندي 3 موارد — على وين أرسلهم؟"
   - **D.** Exit-intent overlay: "قبل ما تروح، أرسلك ملخص مخصص؟"

No up-front gates, ever. Value first, ask second.

### 7.2 Destinations (locked: Approach B)

Per locked channel-split rule (IG = sells, email = informs):

#### Email captured →
1. INSERT into `welcome_captures` Supabase table with full signal bundle
2. Auto-add to newsletter list (Composer v1, existing platform)
3. **No** sales DM, **no** ManyChat tagging — email is informational only

#### IG handle captured →
1. INSERT into `welcome_captures`
2. Tag in ManyChat with `welcome-captured` + sub-tag for tool (e.g. `tool-midjourney`)
3. Trigger Layan-drafted nurture sequence (separate ticket — Layan owns DM copy)
4. Add to MA Learn customer-pool taxonomy

#### Telegram hot-lead alert to Majid →
Fires only on:
1. Existing customer engages on `/welcome` (possible upsell or churn signal)
2. T4-relevant intent in chat ("mentorship", "1-on-1", "تدريب شخصي", "أبي مرشد")
3. Captured + clicked CTA + spent >2 min in same session

Below this bar = no alert, digest only.

#### Daily Telegram digest at 9pm KSA →
Reuses Noor bot. Format: "Yesterday: <visits> visits, <captures> captures (<rate>%), top tool = <X>, <hot_count> hot leads (see dashboard), top question logged."

Lands next to existing EOD check-in. Builds capture-rate intuition before ~June 15 decision gate.

### 7.3 Destination registry

All destinations registered in `capture_destinations` table. Adding Daftra contact-creation, Apps Script triggers, or future webhooks = INSERT row, no deploy.

---

## 8. Measurement & analytics

**Lives at `admin.malearnsa.com/welcome-analytics`. No new vendor. GA stays in parallel as cross-check.**

### 8.1 v1 dashboard (ships with build)

1. **Funnel chart (live + 7d/30d):** Visits → Engaged (scrolled past hero) → Captured → CTA clicked → Bought. Each step shows count + conversion %, with "current homepage" baseline once available.
2. **Per-channel breakdown:** IG bio, ManyChat, email, ad, direct, organic — same 5-stage funnel each.
3. **Per-tool breakdown:** the 6 tools + Other — same funnel each.
4. **Per-language breakdown:** AR vs. EN.
5. **Capture-rate scoreboard:** today / 7d / 30d / all-time, with trend line. Hero position.
6. **Cost-per-captured-lead:** LLM spend ÷ captures. Track <$0.10 in v1.
7. **Cache hit rate:** % of visits served from cache. Target >90%. Early warning if costs spike.
8. **Top tip cards:** which 5 cards get most engagement. Feeds content roadmap.
9. **Top chat questions:** if Noor sees the same question 5+ times in a week, surfaces here. Feeds tip card backlog + Majid's IG content ideas.
10. **Daily Telegram digest** (see §7.2).

### 8.2 Decision-gate metrics (~June 15, pre-committed; evaluated after 14 days of public traffic)

To proceed v1 → v2:

1. **Capture rate ≥ 12%**
2. **Chat engagement rate ≥ 8%**
3. **Time-on-page median ≥ 60 sec**
4. **Cost per captured lead ≤ $0.20**

If 2+ metrics miss: 1-week tuning window, then re-evaluate. If still missing: stop, roll back IG bio link to current homepage, retro before any v2 spend.

---

## 9. Phasing & rollout

### v1 Stage 0 — Build on hidden staging (May 3 → May 22, 2026)

3-week build window. Everything is built and deployed to `staging-welcome.malearnsa.com` (password-protected, `noindex`, isolated `staging` Supabase schema). No public traffic.

Ship list (build phase — all lands on staging):
1. Next.js app at `staging-welcome.malearnsa.com` (later promoted to `malearnsa.com/welcome`)
2. Vercel deployment-level password protection + `noindex` headers + isolated `robots.txt`
3. Edge middleware + signal decode + JWT verification + cache layer
4. Greeting generator with full prompt + 6–8 few-shots
5. Chat Noor widget (player-chat-v1 fork)
6. ManyChat JWT issuance on welcome flow
7. Email JWT extension to token-validator Apps Script
8. Dashboard "Welcome Tips" tab (CRUD for tip_cards) — writes to shared `tip_cards` table read by both staging + prod
9. Dashboard "Welcome Analytics" tab (§8) — defaults to prod data, toggle to view staging
10. Mock-token admin UI at `/_test` (staging only, gated behind `IS_STAGING` env flag)
11. Supabase: `staging` schema with prefixed tables + production schema + capture-destination disable in staging
12. Standardized fallback + per-tool static fallbacks
13. Tip card library: **66 cards** drafted + entered into shared table during this window
14. Cloudflare bot management config (production only — staging is password-gated, doesn't need it)
15. Privacy policy + cookie banner draft (legal review in parallel)
16. ManyChat tag automation + Layan nurture sequence ready but not yet pointed at production

### v1 Stage 0 → Stage 1 promotion gate (May 22 → ~May 31, 2026)

5-day internal soak + 2-day external tester soak + Majid sign-off. See §4.8.4 for the 7 gates that must pass. No public exposure during this window.

### v1 Stage 1 — Public `/welcome` launch (target ~June 1, 2026)

Promotion actions:
1. Promote staging code to production `/welcome` route on `malearnsa.com`
2. Flip `IS_STAGING=false` env — re-enables real capture destinations (ManyChat, newsletter, Telegram)
3. Migrate IG bio link from current homepage to `/welcome`
4. Migrate email CTAs gradually
5. Activate Cloudflare bot management
6. Telegram digest starts firing nightly

### v1 — Decision gate (~June 15, 2026)

14 days of public traffic data, then evaluate against §8.2 metrics. Outcome decides v2 spend.

### v2 — "Buy-push" (June 22 → July 13, M5 Compound)

Conditional on v1 metrics.

Ship list:
1. Heavy personalization (section reorder, testimonials, hero image, free-resource routing)
2. Returning-customer experience (Scenario 5)
3. Tier-aware CTA logic
4. IG bio scrape on ManyChat handoff (deeper signal)
5. A/B test infrastructure (Vercel built-in or Statsig free tier)
6. Tip card video versions for top 5–10 highest-engaging cards (only after v1 data justifies)

### v3 — "Hybrid AI router + homepage swap" (Aug 1 → Sep 5, M6, conditional)

**Skip entirely if v1+v2 metrics flat.**

Ship list:
1. Hybrid AI router (Goal #5 from brainstorm)
2. Pure real-time LLM mode (Sonnet 4.6 generates more of experience)
3. Homepage swap — if `/welcome` v2 outperforms, repoint root `/`. Old homepage → `/legacy`.
4. Cold-organic SEO landing pages (`/welcome/midjourney`, etc.)

### Locked time-off windows (no work)

1. **Every Friday through Sept 30, 2026** — sprint planning respects, no Friday deploys
2. **Aug 9 – Aug 15, 2026** — buffer week, fully off, passive sales only

---

## 10. Risks & tradeoffs

### Real risks (mitigations baked into v1)

1. **Uncanny-valley creepiness.** Mitigation: greeting copy always sources signal naturally ("شفت إنك جاي من X" not "نعرف إنك تستخدم X"); never expose more than user gave us.
2. **Voice drift.** Mitigation: post-processing banlist + ≤25 word cap + daily review tab in dashboard (Majid flags bad outputs → become anti-examples) + static fallback.
3. **Latency budget blown.** Mitigation: streaming hero render, aggressive 24h cache (90%+ target), edge timeout at 800ms.
4. **Token forgery / replay.** Mitigation: 1-hour TTL, single-use redemption, IP rate limiting.
5. **LLM cost runaway from bots.** Mitigation: Cloudflare bot management, daily Anthropic spend alert at $10/day, cache hit-rate monitoring.
6. **Conversion theatre.** Mitigation: decision gate includes downstream buyer-conversion at 30 days, not just capture %.
7. **Content treadmill.** Mitigation: dashboard shows card age, anything >90 days flagged, quarterly 1-day refresh sprint, "آخر تحديث: <month>" tag in card footer.
8. **Mobile-first pain (80%+ of Saudi traffic).** Mitigation: mobile-first build, real-device testing weekly.
9. **PDPL / KSA privacy.** Mitigation: privacy policy update, minimal cookie banner, 90-day visit log retention (anonymized after), "delete my data" footer link.
10. **Returning-buyer awkwardness** ("you should buy T2!" to a T3 student). Mitigation: `lead_state="customer"` branch in v2; until then, fall back to non-tier-pushing CTA for any ig_handle/email matching `customers` table.

### Tradeoffs consciously accepted

1. **Hybrid AI < Pure LLM in "magic" but >> in cost control + voice consistency.**
2. **Capture-first > Buy-first** — slower revenue, compounds nurture pool. Right for 22-week harvest math.
3. **Vercel free tier limits at ~50× current volume.** Cheap upgrade when needed.
4. **Public chat = LLM cost surface even with zero conversions.** "Top chat questions" data alone is worth $5/mo.

### Risks NOT mitigated in v1 (deferred)

1. Multi-region failover (Vercel handles transparently)
2. GDPR for EU visitors (KSA market, address only if EU traffic >5%)
3. WCAG AA accessibility (important, not v1 blocker, note for v2)

---

## 11. Cost summary

### v1 monthly

1. Vercel Pro: $20 (required for deployment-level password protection on staging — non-negotiable per §4.8)
2. Supabase: $0 (existing free tier; staging schema fits within it)
3. Vercel KV: $0 (free tier covers cache)
4. Anthropic: ~$2 at v1 volume (staging usage tagged separately, negligible during soak)
5. Cloudflare: $0 (free tier)
6. ManyChat: $0 incremental (existing Pro account)
7. **Total: ~$22/mo**

### v2 / v3 monthly

1. v2: ~$10–30/mo (more LLM calls, A/B tooling)
2. v3 with Sonnet: ~$50–150/mo at projected scale

All under the cost of a single T2 sale (449 SAR ≈ $120) per month.

---

## 12. Locked decisions log

1. **Staging-first, never live-first.** Three-stage promotion path: hidden staging → public `/welcome` → live `/` swap. Each stage has its own gate. See §4.8 + §9. **Non-negotiable.**
2. **Audience priority:** A (funnel) → C (customers) → B (cold organic)
3. **Conversion goal phasing:** v1 capture-first → v2 buy-push → v3 hybrid AI router
4. **Format:** smart hero + Noor chat widget (hybrid)
5. **URL strategy:** staging at `staging-welcome.malearnsa.com` → public parallel at `/welcome` → swap into `/` only after both gates pass
6. **Personalization depth:** Medium-Heavy, scaled by version
7. **AI architecture:** Hybrid (curated tip content + LLM-generated warmth wrapper) for v1; pure real-time LLM possible in v3
8. **Capture mechanic:** skip ask for known (ManyChat/email tokens); layered B+C+D for anonymous
9. **Budget:** optimize tight at start. Haiku 4.5, 1 call/visit max, aggressive cache
10. **Tools at launch:** Midjourney, Higgsfield, Weavy, Magnific, Luma, OpenArt + operational `Other` chip
11. **Tip card format v1:** text + 1 image only; video deferred to v2 based on data
12. **Chat scope:** tight 5-bucket scope + 6 edge-case pre-decided rules
13. **Capture destinations:** Approach B (channel split: email→newsletter, IG→ManyChat, hot-lead→Telegram, daily digest→Telegram). All disabled in staging via `IS_STAGING` flag.
14. **Measurement:** native dashboard at `admin.malearnsa.com/welcome-analytics` + GA cross-check
15. **Expandability:** all tools/cards/prompts/CTAs/rules/destinations data-driven and dashboard-editable
16. **Staging access:** Vercel deployment-level password protection (Pro tier preferred, magic-link fallback if Hobby). Search engines blocked at three layers (header + meta + robots.txt).
17. **Staging data isolation:** separate `staging` Supabase schema, no production capture-destinations fire from staging.
18. **Decision gate:** ~June 15, 30-min call, pre-committed metrics in §8.2 after 14 days of public traffic data
19. **Time-off:** Fridays + Aug 9-15 buffer fully respected
20. **Linear:** child issues inside Harvest 22 M2/M3/M5/M6, prefix `WELCOME-`, tag `welcome-experience`
21. **Visual system:** reuse existing Editorial Atelier tokens (no new design system)
22. **Standard footer:** `malearnsa.com/footer-module/v1/` per locked SOP
23. **Failure-mode notifications:** Telegram only, no email noise

---

## 13. Open execution items (not design decisions — implementation details)

These get resolved during the writing-plans / implementation phase:

1. Vercel Pro tier — confirmed needed for deployment-level password protection on staging. Cost ($20/mo) absorbed into v1 monthly cost estimate.
2. Tip card image style — confirm visual treatment in first design pass (likely reuse Editorial Atelier card style from dashboard)
3. JWT secret rotation cadence — propose 90 days for ManyChat + email tokens; staging password rotates monthly. Lock during impl.
4. Layan IG nurture sequence — separate ticket she owns; needs to ship before public `/welcome` launches IG handle captures
5. Privacy policy update copy — Ziyad-adjacent legal review, draft during impl
6. Cookie banner copy — minimal, KSA-compliant, draft during impl
7. Voice memo capture for Higgsfield/Weavy/Magnific tip cards — schedule 3× 30-min sessions with Majid in M2 sprint planning
8. Testimonials table population — pull from existing customer comms; v2 work but v1 schema accommodates
9. Customer-match heuristics — exact match on email/ig_handle in v1; fuzzy match deferred to v2
10. `/legacy` route plan if homepage swap happens — define rollback path during v3 design pass
11. External tester recruitment for Stage 0 → Stage 1 gate — Majid picks 3–5 trusted people during build window
12. Mock-token admin UI scope — confirm preset scenarios list during impl (proposal: 8–10 covering all tool/state/lang combinations)
