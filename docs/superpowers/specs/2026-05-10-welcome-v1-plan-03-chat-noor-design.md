# /welcome v1 — Plan 3: Chat Noor — Design Spec

**Status:** Approved 2026-05-10. Implementation plan to follow.
**Parent spec:** `docs/superpowers/specs/2026-04-30-welcome-experience-design.md` (sections 6.1, 6.4–6.8, 4.4, 4.7)
**Repo:** `Majidangawi/ma-learn-welcome` (Vercel project `ma-learn-welcome`)
**Predecessors:** Plan 1 (walking skeleton — shipped 2026-04-30), Plan 2 (tip cards + layout — shipped 2026-05-02)
**Stage:** Stage 0 — staging-only build on `staging-welcome.malearnsa.com`

---

## 1. Goal

Add a streaming chat widget ("Chat Noor") to the `/welcome` page. Visitors click a floating bubble, get a templated welcome line, and converse with Noor (Anthropic Haiku 4.5). Scope of conversation is the 5 buckets locked in the parent spec section 6.4. All messages persist to Supabase for analytics + abuse detection. Plan 3 ships the chat surface only — capture flow stays Plan 4.

End state: an organic visitor who came with a Midjourney signal can open chat and ask "كم سعر T2؟" → gets an accurate streamed Saudi-dialect answer in under 2 seconds, with the message persisted to `staging.welcome_chat_messages`.

---

## 2. UX behavior

### 2.1 Chat bubble (always visible)

- Floating pill bottom-right, fixed position.
- 56px circle on mobile, 64px on desktop.
- Editorial Atelier gold background (`var(--color-accent-gold)` from Plan 2 tokens), Noor mark icon in white.
- Subtle pulse animation on first visit only (after first dismiss/open, the bubble stays static for the rest of the session — tracked in `sessionStorage`).
- Persistent across scroll. `z-index` above tip cards but below modal overlays.

### 2.2 Open transition

- Click → `#chat` appended to URL hash (so browser back closes the panel — mobile-native expectation).
- Mobile: bottom sheet slides up to 70vh, spring physics via `framer-motion` (already in stack from Plan 2).
- Desktop: panel pops bottom-right, 400px × 600px, max 80vh.
- Backdrop fade-in on mobile (semi-transparent, dismissible by tap).
- Focus moves to input field on open (accessibility).

### 2.3 Panel header

- Title: "نور — مساعدة ماجد"
- Online indicator dot (green, decorative — does not reflect real status; chat is always available unless rate-limited).
- Close button: X icon top-left (RTL convention) on mobile, chevron-down top-right on desktop.
- Mobile: swipe-down gesture also closes.

### 2.4 Opening message (templated, no LLM call)

Cold visitor (no tool signal):

> أنا نور، مساعدة ماجد. اسأل أي شي عن AI الإبداعي أو كورسات ماجد.

Warm visitor (tool signal present, e.g. `tool_id = "midjourney"`):

> شفت إنك مهتم بـ Midjourney. اسأل أي شي عنه أو عن كورسات ماجد.

Tool name interpolation rule: brand names stay in Latin form per locked feedback (`feedback_brand_names_latin_in_arabic.md`). The tool catalog `name_en` field (e.g. "Midjourney", "Higgsfield") is used directly inside the Arabic sentence.

The opening message is rendered as the first message bubble (`role: 'assistant'`) in the conversation but is NOT persisted to `welcome_chat_messages`. It's a UI-only bootstrap.

### 2.5 Input

- Single-line `<textarea>` that grows to a max of 4 lines (~120px height), then scrolls internally.
- RTL by default; auto-detects English input and switches to LTR for that line only.
- Send button: paper-plane icon, disabled when input is empty or when a stream is in flight.
- Enter sends; Shift+Enter inserts a newline.
- Placeholder: "اكتب سؤالك..."
- Character soft cap: 500 chars. Beyond that, button disables and a small counter shows "500 حرف بس". Hard cap 800 chars enforced server-side.

### 2.6 Streaming behavior

- `useChat()` from `@ai-sdk/react` drives state.
- Each Noor message renders token-by-token as the SSE stream arrives.
- A subtle pulsing cursor (`▌`) appears at the end of the streaming message until the stream completes.
- A "Stop" button replaces "Send" while a stream is active. Clicking aborts the stream client-side and sends an `AbortSignal` to the edge function (which cancels the upstream Anthropic call).
- Aborted messages are persisted with `fallback_reason = 'user_aborted'`.

### 2.7 Error & fallback states

| State | UI | Behavior |
|---|---|---|
| Anthropic transient error | Inline retry banner under the failed message: "يبدو فيه مشكلة — جرّب مرة ثانية" + retry button | One-tap retry re-sends the same user message. |
| 3 consecutive failures | Soft fallback panel replaces input area | "في خلل بسيط الحين. راسلنا على support@malearnsa.com وراح يردّ عليك ماجد أو فريقه." + mailto link. |
| Rate limit reached (10 msg / IP / 24h) | Cap message + email CTA | "وصلت أقصى عدد رسائل اليوم. ارجع بكرة أو راسل support@malearnsa.com وراح يردّ عليك ماجد أو فريقه." + mailto link. Input disabled. |
| Network offline | Toast "ما فيه اتصال بالشبكة" | Send button disabled until reconnect. |
| Banned phrase detected post-stream | Reply replaced with safe fallback | "خلني أرجع لك بإجابة أنظف — جرّب اسأل بطريقة ثانية." `fallback_reason = 'banned_phrase'` logged. |

All "talk to a human" off-ramps point to **support@malearnsa.com** — never WhatsApp from the chat surface (locked decision 2026-05-10).

---

## 3. Technical architecture

### 3.1 Stack additions

| Dependency | Version | Purpose |
|---|---|---|
| `ai` | latest stable | Vercel AI SDK core: `streamText`, message types |
| `@ai-sdk/anthropic` | latest stable | Anthropic provider for the AI SDK |
| `@ai-sdk/react` | latest stable | `useChat()` hook for streaming UI |

No removals. Bundle impact ~2.1 MB pre-gzip, lazy-loaded so it doesn't hit visitors who never open the chat (next/dynamic import on `ChatPanel`).

### 3.2 Component tree

```
app/welcome/page.tsx (Server Component)
└── ChatBubble.tsx (Client, always rendered)
    └── on click → next/dynamic import → ChatPanel.tsx (Client)
        ├── ChatHeader.tsx
        ├── ChatMessages.tsx
        │   └── ChatMessage.tsx (× N)
        └── ChatInput.tsx
```

`ChatBubble` is the only chat component shipped in the initial JS payload. Everything else loads on first open.

### 3.3 Edge API route

**Path:** `app/api/chat/route.ts`
**Runtime:** edge
**Region:** `fra1` (Frankfurt — matches Plan 1 + Plan 2)

**Request body:**
```ts
{
  messages: Message[],     // full client-side history (trimmed server-side)
  chat_id: string,         // uuid, generated client-side on first open
  cookie_id: string,       // ml_w_cid value from cookie
  tool_signal: string | null  // tool_id if known, else null
}
```

**Response:** SSE stream compatible with `useChat()` consumer.

**Pipeline:**

1. Parse + validate body (Zod schema; reject if cookie_id missing).
2. Hash IP (`crypto.subtle` SHA-256, truncated to 16 chars).
3. **Atomically increment + check** the Vercel KV rate-limit counter at key `ratelimit:chat:{ip_hash}:{YYYY-MM-DD}` (TTL 24h). If post-increment count > 10, return 429 with structured error body. Increment-then-check (not check-then-increment) to prevent concurrent-request bypass.
4. Fetch active prompt template from `staging.welcome_chat_prompts` (60s edge cache via Vercel KV key `chat:prompt:active`). Cache miss → fall through to Supabase.
5. Render system prompt (substitute `{{tool_name_en}}` if `tool_signal` is present; otherwise omit the tool-aware sentence).
6. Trim `messages` to last 10 turns (5 user + 5 assistant pairs max) before sending to Anthropic.
7. Call `streamText` with model `claude-haiku-4-5-20251001`, `maxTokens: 600`, `temperature: 0.7`.
8. Pipe response stream back to client unchanged.
9. On stream completion (`onFinish` callback): write user message + assistant message to `staging.welcome_chat_messages`, increment `welcome_chats.message_count`, mirror today's count to `staging.welcome_chat_rate_limits` (audit row, not load-bearing). Fire-and-forget — does not block the SSE response.
10. Run banned-phrase regex over completed assistant message. If hit, mark message `fallback_reason = 'banned_phrase'` and log to Vercel logs for prompt iteration. (UI-side replacement is a v2 enhancement; v1 lets the message render but flags it for review.)

### 3.4 Prompt caching

Anthropic's prompt caching feature applied to the system prompt (the largest stable part of every request).

- System prompt block marked `cache_control: { type: "ephemeral" }`.
- Cache TTL: 5 minutes (Anthropic default).
- Realistic effect: ~90% discount on system-prompt input tokens after first request in a 5-min window.
- Cost impact: drops $1.00/50-sessions worst case to ~$0.72.

### 3.5 Caching layer summary

| Resource | Cache | Key | TTL |
|---|---|---|---|
| Active prompt template (Supabase row) | Vercel KV | `chat:prompt:active` | 60s |
| Rate-limit counters | Vercel KV | `ratelimit:chat:{ip_hash}:{YYYY-MM-DD}` | 24h |
| System prompt (Anthropic side) | Anthropic prompt cache | n/a (header-driven) | 5 min |
| Per-message responses | none | n/a | n/a |

### 3.6 Identity linkage

Per parent spec section 4.4. Chat row stores:
- `cookie_id` (always present; set by Plan 1 middleware)
- `visit_id` FK (links to `staging.welcome_visits` row from current session)
- `tool_signal` (snapshotted at chat-open time; doesn't change mid-conversation)

If a visitor later upgrades identity (provides email or matches a customer row), a future plan can JOIN `welcome_chats` to `customers` via `cookie_id` for premium analytics. No work required in Plan 3.

### 3.7 Open/close URL state

- Open chat → `history.pushState(null, '', '#chat')`
- Close → `history.back()` if hash is `#chat`, else `history.pushState(null, '', window.location.pathname)`
- `popstate` listener watches for hash change to drive open/close — keeps browser-back natural on mobile.

---

## 4. Data model

### 4.1 New tables in `staging` schema

```sql
-- Schema additions for Plan 3 (Chat Noor)

create table staging.welcome_chats (
  id              uuid primary key default gen_random_uuid(),
  cookie_id       text not null,
  visit_id        uuid references staging.welcome_visits(id),
  tool_signal     text,
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  message_count   int not null default 0,
  created_at      timestamptz not null default now()
);

create index welcome_chats_cookie_id_idx on staging.welcome_chats(cookie_id);
create index welcome_chats_opened_at_idx on staging.welcome_chats(opened_at desc);

create table staging.welcome_chat_messages (
  id                uuid primary key default gen_random_uuid(),
  chat_id           uuid not null references staging.welcome_chats(id) on delete cascade,
  role              text not null check (role in ('user', 'assistant', 'system')),
  content           text not null,
  created_at        timestamptz not null default now(),
  tokens_in         int,
  tokens_out        int,
  latency_ms        int,
  model             text,
  fallback_reason   text  -- null on healthy path; e.g. 'banned_phrase', 'user_aborted', 'anthropic_error'
);

create index welcome_chat_messages_chat_id_idx on staging.welcome_chat_messages(chat_id, created_at);

create table staging.welcome_chat_prompts (
  id              uuid primary key default gen_random_uuid(),
  version         int not null,
  is_active       boolean not null default false,
  system_prompt   text not null,
  notes           text,
  created_at      timestamptz not null default now(),
  created_by      text  -- 'majid' / 'noor' / 'layan'
);

-- Only one row may have is_active = true at any time; enforced by partial unique index.
create unique index welcome_chat_prompts_one_active_idx
  on staging.welcome_chat_prompts (is_active) where is_active = true;

create table staging.welcome_chat_rate_limits (
  ip_hash         text not null,
  day             date not null,
  message_count   int not null default 0,
  last_message_at timestamptz not null default now(),
  primary key (ip_hash, day)
);
-- Note: this table is a fallback / audit log. Hot-path rate limiting uses Vercel KV.
-- This row is updated alongside KV writes for observability + post-incident analysis.
```

### 4.2 RLS policies

```sql
-- Anon role: can INSERT new chats and messages, can READ active prompt only.
alter table staging.welcome_chats          enable row level security;
alter table staging.welcome_chat_messages  enable row level security;
alter table staging.welcome_chat_prompts   enable row level security;
alter table staging.welcome_chat_rate_limits enable row level security;

create policy welcome_chats_anon_insert on staging.welcome_chats
  for insert to anon with check (true);

create policy welcome_chat_messages_anon_insert on staging.welcome_chat_messages
  for insert to anon with check (true);

create policy welcome_chat_prompts_anon_read_active on staging.welcome_chat_prompts
  for select to anon using (is_active = true);

-- Service role only for everything else (rate limit table, reads, mutations).
```

### 4.3 Seed data

One row in `welcome_chat_prompts` seeded at migration time:
- `version = 1`
- `is_active = true`
- `system_prompt` = full text codifying spec sections 6.4–6.7 (5 buckets, 6 edge cases, voice rules, hard guardrails, banned phrase list) + embedded course catalog (T1/T2/T3/T4 with current prices + audience + outcome) + 2 testimonials. Saudi Khaleeji throughout.
- `notes = 'v1 launch prompt — derived from welcome-experience-design.md sections 6.4–6.7'`
- `created_by = 'noor'`

The full system prompt text is stored in `supabase/migrations/2026-05-10-welcome-chat.sql` as a heredoc and version-controlled. Future edits go through new rows (incrementing `version`), with the migration toggling `is_active` atomically.

---

## 5. System prompt v1 — structure (not full text)

The full text lives in the migration file; this section describes the structure so future iterations stay consistent.

```
[Persona]
أنت نور، مساعدة ماجد العنقاوي. ماجد مدرّب إبداعي ومرشد...
(2-3 sentences establishing role + Saudi dialect rule)

[Voice rules]
- Saudi Khaleeji dialect (use وش / إيش / جالس / علقت / خلني)
- Brand names in Latin (Midjourney not ميدجورني)
- Sentences ≤ 25 words on average
- No corporate phrases (banned list inline)
- No emojis
- No exaggeration about feelings

[5 buckets — what you can talk about]
1. AI creative tools (6 listed)
2. Majid's courses (T1/T2/T3/T4 — full catalog inline)
3. Site navigation
4. Majid's work & approach
5. Buying help (payment methods, refund policy, Daftra)

[Course catalog — embedded for v1]
T1 — ... | السعر 99-149 ريال | لمين: ...
T2 — مدخل إلى الذكاء الاصطناعي الإبداعي | 449 ريال | لمين: ...
T3 — ... | 1,199 ريال | كوهورت قادم: ...
T4 — Mentorship | 3,500 ريال (3,000 group) | لمين: ...

[Testimonials — 2 short ones embedded for v1]

[Hard guardrails]
- Never claim to be human
- Never offer discounts
- Never invent courses
- Refuse: politics / medical / religious / financial advice
- Don't reveal user-side knowledge ("I see you visited 3 times")

[Edge case rules — 6 patterns]
"Fix my prompt" → 1 quick suggestion + push to T2
"Is your course worth it?" → honest + testimonial
"Difference vs competitor?" → brief, no trash-talk, Majid's edge
"Free lesson?" → point to T2 graduation gift / BL preview
"Critique my portfolio?" → no, redirect to T4
"Discount?" → no, mention T1 starts at 99

[Off-topic redirect]
هذا ما هو تخصصي — بس لو سؤالك عن AI الإبداعي أو كورسات ماجد، أنا معك.

[Format]
Plain text only. No markdown. No code blocks unless user explicitly asks for a prompt example.
```

---

## 6. Anti-abuse + observability

### 6.1 Rate limiting

- **Hard cap:** 10 messages per IP hash per 24h (parent spec 4.7).
- **Hot path:** Vercel KV counter — incremented atomically, TTL 24h.
- **Audit:** mirrored to `staging.welcome_chat_rate_limits` for after-the-fact analysis.
- **Bypass risk:** IP-based limits are easy to evade with VPN/cellular switching. Acceptable at v1 staging volume; revisit if real abuse appears.

### 6.2 Banned-phrase regex (server-side post-stream)

Initial pattern set (lives in `lib/chat/bannedPhrases.ts`, expandable):

```ts
const banned = [
  /\bas an? AI\b/i,
  /\bI(?:'m| am) here to help\b/i,
  /\bfeel free to\b/i,
  /\bميدجورني\b/,        // brand name in Arabic instead of Latin
  /\bهيقسفيلد\b/,        // ditto
  // (more added over time as Majid + Layan flag drift)
];
```

Hit → message persists with `fallback_reason = 'banned_phrase'` for prompt iteration. UI behavior: v1 lets the message render (low risk during staging soak); v2 may swap to a safe fallback before render.

### 6.3 Spend alert

- Existing $10/day Anthropic alert from Plan 1 covers chat too.
- Trips at ~7,000 chat sessions/day with caching, well above expected v1 volume (~50/mo).

### 6.4 Observability

Every chat message that goes through `/api/chat` persists with:
- `tokens_in`, `tokens_out` (from Anthropic response usage)
- `latency_ms` (server-measured)
- `model` (always `claude-haiku-4-5-20251001` in v1, but tracked for future model rotation)
- `fallback_reason` (null on healthy path)

(The templated opening message from section 2.4 is UI-only and does not flow through the API or persist.)

Daily aggregate Supabase view `staging.v_welcome_chat_daily_summary`:
- Date, total chats opened, total messages, avg messages per chat, avg latency, fallback hit count, total tokens in/out, estimated cost.

This view feeds the dashboard panel in a future plan.

### 6.5 Vercel logs

Each request logs structured JSON:
```json
{
  "event": "chat_request",
  "chat_id": "...",
  "cookie_id": "...",
  "tool_signal": "midjourney",
  "tokens_in": 1042,
  "tokens_out": 187,
  "latency_ms": 1230,
  "fallback_reason": null
}
```

Searchable via Vercel log drain for debugging.

---

## 7. Scope

### 7.1 In scope (Plan 3)

1. `ChatBubble` + `ChatPanel` components (mobile bottom sheet, desktop panel).
2. `/api/chat` edge route with Vercel AI SDK streaming.
3. 4 new Supabase tables in `staging` schema (`welcome_chats`, `welcome_chat_messages`, `welcome_chat_prompts`, `welcome_chat_rate_limits`).
4. System prompt v1 row, seeded with 5 buckets + 6 edge cases + voice rules + hard guardrails + course catalog + testimonials (all per spec sections 6.4–6.7).
5. Rate limiting (10 msg/IP/24h, Vercel KV-backed for hot path).
6. Banned-phrase post-stream regex check + observability flag.
7. Hash-based open/close (`#chat`) with browser-back support.
8. Lazy-load chat panel via `next/dynamic` (no JS cost for non-openers).
9. Edge cache for prompt template (60s Vercel KV).
10. Anthropic prompt caching on system prompt block.
11. Observability rows + structured Vercel logs.
12. Unit tests (Vitest) + e2e tests (Playwright) per section 9.

### 7.2 Explicitly out of scope (deferred)

- Capture form integration → Plan 4 owns lead capture.
- Function/tool calling — Noor is pure-text-response in v1.
- File or image attachments.
- Voice input.
- Conversation history beyond current browser session (no "your past chats" UI).
- Conversation export.
- Real-time multi-tab sync.
- Dashboard editor for prompt template — v1 uses manual SQL UPDATE; CRUD UI graduates when admin.malearnsa.com adds a "/welcome prompts" page.
- Separate `courses` / `testimonials` / `faq` tables — Plan 5+. v1 embeds these as text inside the prompt template row.
- Streaming markdown rendering — plain text only in v1; markdown in a later plan if metrics earn it.
- Multi-language switching mid-conversation — chat language matches the visitor's `/welcome` page language at chat-open time and stays fixed for the session.

---

## 8. Cost model

Pricing assumptions (Haiku 4.5 list, $1/M input · $5/M output).

### 8.1 Per-session math

Each turn:
- Input: ~600 system prompt + ~400 dynamic (history + new message) ≈ 1,000 tokens
- Output: ~200 tokens

10-turn session (typical full conversation):
- Input: 10,000 tokens
- Output: 2,000 tokens

| Scenario | Cost / session | Notes |
|---|---|---|
| No prompt caching | $0.020 | $0.010 input + $0.010 output |
| With prompt caching (~90% off system prompt) | $0.014 | System prompt cached after first req in 5min window |

### 8.2 At volume

| Sessions / month | Cost / month (with caching) | SAR |
|---|---|---|
| 50 | $0.70 | ~2.6 SAR |
| 500 | $7 | ~26 SAR |
| 5,000 | $70 | ~260 SAR |
| 50,000 | $700 | ~2,625 SAR |

### 8.3 Spend alert trip point

$10/day alert (parent spec 4.7) trips at roughly **7,000 chat sessions/day** with caching — orders of magnitude above v1 expected volume. Runaway cost would be visible long before it hurt.

---

## 9. Testing approach

### 9.1 Unit tests (Vitest)

- `lib/chat/rateLimit.test.ts` — counter increment, 24h reset, IP hash function deterministic.
- `lib/chat/promptRenderer.test.ts` — `{{tool_name_en}}` interpolation, history trimming to last 10 turns, prompt-caching block annotation.
- `lib/chat/bannedPhrases.test.ts` — regex matches expected phrases, doesn't false-positive on safe content.
- `lib/db/welcomeChats.test.ts` — Supabase insert mock pattern (mirrors `lib/db/tipCards.test.ts` from Plan 2).
- `lib/db/welcomeChatPrompts.test.ts` — fetcher returns active row, returns null on no active row, handles error.
- `app/api/chat/route.test.ts` — handler with mocked Anthropic stream, asserts SSE format, persists messages on completion, applies rate limit, returns 429 at cap.

### 9.2 Playwright e2e

- Bubble visible on `/welcome`, click opens panel, focus moves to input.
- Type message, submit, see streaming response token-by-token.
- Stream completes → message persisted (verify via Supabase test client).
- Close panel → reopen in same session → history still there.
- Close panel → browser-back gesture → panel closes (hash sync verified).
- Hit rate limit (seed 10 prior messages for the test IP) → cap message + email link visible, input disabled.
- Force network failure (route mock) → see retry banner.
- Mobile viewport: panel renders as bottom sheet, swipe-down gesture closes.
- Tool-signal warm path: `?ref=ig_bio&t=<JWT for Midjourney>` → opening message includes "Midjourney".

### 9.3 Manual soak (during Stage 0 testing)

Per parent spec section 4.8.4, the family-and-friends tester pool of 8–15 people exercises the chat. Specific things to surface from manual testing that automation can't catch:
- Voice authenticity (does Noor sound like she could be Majid's actual employee?)
- Off-topic pressure (do testers try to break out of the 5 buckets?)
- Latency feel (1.5s vs 2.5s feels different even when both are "fast enough")
- Mobile keyboard interactions on real iOS / Android (Playwright can't fully simulate)
- Bilingual handling (do testers mix Arabic + English mid-message?)

---

## 10. File structure

### 10.1 New files

```
app/api/chat/route.ts
app/welcome/_components/ChatBubble.tsx
app/welcome/_components/ChatPanel.tsx
app/welcome/_components/ChatHeader.tsx
app/welcome/_components/ChatMessages.tsx
app/welcome/_components/ChatMessage.tsx
app/welcome/_components/ChatInput.tsx
lib/chat/rateLimit.ts
lib/chat/promptRenderer.ts
lib/chat/bannedPhrases.ts
lib/chat/ipHash.ts
lib/db/welcomeChats.ts
lib/db/welcomeChatPrompts.ts
supabase/migrations/2026-05-10-welcome-chat.sql
tests/lib/chat/rateLimit.test.ts
tests/lib/chat/promptRenderer.test.ts
tests/lib/chat/bannedPhrases.test.ts
tests/lib/db/welcomeChats.test.ts
tests/lib/db/welcomeChatPrompts.test.ts
tests/api/chat.test.ts
tests/e2e/chat.spec.ts
```

### 10.2 Modified files

```
app/welcome/page.tsx       (mount <ChatBubble /> in shell)
app/globals.css            (chat-specific tokens / animations if needed)
package.json               (add ai + @ai-sdk/anthropic + @ai-sdk/react)
README.md                  (Plan 3 status section)
```

---

## 11. Open risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Voice drift across long conversations | Medium | Banned-phrase regex catches common drift; manual soak surfaces nuance; prompt iteration via new versioned rows. |
| Latency spikes on Anthropic side | Low | Edge timeout 8s. Three-failure fallback to email gracefully degrades. |
| Rate limit bypass via VPN | Medium | Acceptable at staging volume. Revisit if abuse appears. Cloudflare bot management (already on) catches obvious automation. |
| Prompt cache invalidation surprises | Low | 5-min TTL is short. Worst case: a few cache misses cost an extra penny. |
| Bundle size hits LCP | Low | Lazy-loaded panel — no impact for non-openers. Bubble is ~5KB. Tested in Playwright LCP assertion. |
| Bilingual handling confusion | Medium | Chat language fixed at open time per session. Future v2 can offer language toggle inside panel if testers ask. |
| Tool-signal swap shows wrong tool name | Low | `tool_name_en` snapshotted from `tools` table at chat-open; doesn't hot-update mid-conversation. |

---

## 12. Success criteria for Plan 3 sign-off

Before tagging `plan3-chat-noor-shipped`:

1. ✅ All unit tests pass.
2. ✅ All Playwright e2e tests pass on `staging-welcome.malearnsa.com`.
3. ✅ Bubble visible + interactive on staging on real iPhone + Android device check.
4. ✅ Successful end-to-end conversation: 5-turn session with Midjourney signal, response latency p95 ≤ 2.0s per turn (measured server-side).
5. ✅ Rate limit confirmed: 11th message in 24h returns cap UI + email link.
6. ✅ Banned-phrase regex confirmed: deliberately crafted bait message logs `fallback_reason = 'banned_phrase'`.
7. ✅ Daily summary view returns rows for staging conversations.
8. ✅ Cost telemetry: $10/day alert wired and verified.
9. ✅ Majid signs off in writing on Linear ticket after manual soak.
10. ✅ At least 5 of the family-and-friends testers have completed a real conversation and given voice feedback.

Stage 0 → Stage 1 promotion is a separate gate (parent spec section 4.8.5) and does not block Plan 3 sign-off.

---

## 13. Out-of-spec notes for the implementer

- The system prompt text is the single highest-leverage artifact in this plan. Spend disproportionate time on it. Pull voice samples from `marketing/strategy/` (Layan's session outputs) and the locked feedback memories about brand voice.
- Don't optimize prematurely for cost — caching + 600 max_tokens is enough. Trying to shorten the prompt early loses voice fidelity.
- The 5-bucket scope is a hard wall, not a soft preference. Any deviation surfaced by testers should be filed for prompt iteration, not handled by widening the buckets.
- Email-only escape hatch (no WhatsApp link from chat surface) is a locked decision. WhatsApp lives elsewhere on the site if needed; chat off-ramps stay email.
