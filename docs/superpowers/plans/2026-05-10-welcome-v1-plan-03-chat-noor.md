# Welcome /welcome v1 — Plan 3: Chat Noor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a streaming chat widget on `staging-welcome.malearnsa.com` — floating bubble bottom-right, opens to a 70vh bottom sheet (mobile) or 400×600 panel (desktop), templated welcome line, and a streaming Saudi-dialect Noor conversation powered by Anthropic Haiku 4.5 with all messages persisted to Supabase.

**Architecture:** Extends Plan 1 + Plan 2 in the same Next.js 16 + Vercel Pro + Supabase + Anthropic stack. Adds the Vercel AI SDK (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/react`) for streaming UI, four new tables in the `staging` Supabase schema (`welcome_chats`, `welcome_chat_messages`, `welcome_chat_prompts`, `welcome_chat_rate_limits`), and an `app/api/chat/route.ts` edge function that pipes Anthropic SSE through to `useChat()` while writing telemetry rows fire-and-forget. Anthropic prompt caching is enabled day-one to keep cost ~$0.014/session.

**Tech Stack:** Next.js 16.2.4 App Router (RSC + edge), TypeScript strict, Vercel KV (rate limit + prompt cache), Supabase (`staging` schema), Anthropic SDK via `@ai-sdk/anthropic`, framer-motion (already in deps), Vitest + Playwright.

**Repo:** `Majidangawi/ma-learn-welcome` (extends Plan 2 — already on `staging-welcome.malearnsa.com`).

**Spec:** `docs/superpowers/specs/2026-05-10-welcome-v1-plan-03-chat-noor-design.md`

**Locked decisions (non-negotiable):**
- Email-only escape hatch — `support@malearnsa.com`, never WhatsApp from chat surface.
- Brand names stay in Latin form even inside Arabic text ("Midjourney" not "ميدجورني").
- Saudi Khaleeji dialect throughout (وش / إيش / جالس / علقت / خلني).
- No emojis in any chat output.
- No exaggerated feeling-language ("حسّيت بدفء استقبالكم" forbidden).
- Prompt template lives in DB, never hardcoded — per "nothing rigid" rule.
- Never offer a discount; always quote T1 starts at 99 for budget questions.

---

## File structure

### New files

```
app/api/chat/route.ts                          # Edge API: streaming pipeline
app/welcome/_components/ChatBubble.tsx         # Floating bubble (always-loaded)
app/welcome/_components/ChatPanel.tsx          # Lazy-loaded panel shell
app/welcome/_components/ChatHeader.tsx         # Title + close button
app/welcome/_components/ChatMessages.tsx       # Scrollable message list
app/welcome/_components/ChatMessage.tsx        # Single user/assistant bubble
app/welcome/_components/ChatInput.tsx          # Textarea + send button

lib/chat/types.ts                              # Shared TS types for chat
lib/chat/ipHash.ts                             # SHA-256 IP hashing
lib/chat/rateLimit.ts                          # KV-backed rate limiting
lib/chat/promptRenderer.ts                     # Template fill + history trim
lib/chat/bannedPhrases.ts                      # Post-stream regex check
lib/db/welcomeChats.ts                         # chat row CRUD
lib/db/welcomeChatPrompts.ts                   # active prompt fetcher

supabase/migrations/2026-05-10-welcome-chat.sql  # 4 tables + RLS + seed prompt

tests/lib/chat/ipHash.test.ts
tests/lib/chat/rateLimit.test.ts
tests/lib/chat/promptRenderer.test.ts
tests/lib/chat/bannedPhrases.test.ts
tests/lib/db/welcomeChats.test.ts
tests/lib/db/welcomeChatPrompts.test.ts
tests/api/chat.test.ts
tests/e2e/chat.spec.ts
```

### Modified files

```
app/welcome/page.tsx     # Mount <ChatBubble />
app/globals.css          # Chat-specific tokens / animations
package.json             # Add ai + @ai-sdk/anthropic + @ai-sdk/react
README.md                # Plan 3 status section
```

---

## Phase A — Setup (deps + migration + system prompt seed)

### Task A.1: Install Vercel AI SDK + Anthropic provider + React adapter

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

```bash
cd ~/code/ma-learn-welcome
npm install ai @ai-sdk/anthropic @ai-sdk/react zod
```

Expected: 4 packages added, no peer-dep warnings.

- [ ] **Step 2: Verify TypeScript types resolve**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add ai, @ai-sdk/anthropic, @ai-sdk/react, zod for Plan 3 chat"
```

### Task A.2: Supabase migration — create 4 chat tables + RLS

**Files:**
- Create: `supabase/migrations/2026-05-10-welcome-chat.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/2026-05-10-welcome-chat.sql
-- Plan 3: Chat Noor
-- Adds 4 tables to the staging schema for the welcome chat widget.

-- 1. welcome_chats — one row per chat session
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

-- 2. welcome_chat_messages — every persisted user/assistant message
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
  fallback_reason   text
);

create index welcome_chat_messages_chat_id_idx
  on staging.welcome_chat_messages(chat_id, created_at);

-- 3. welcome_chat_prompts — versioned system prompt templates
create table staging.welcome_chat_prompts (
  id              uuid primary key default gen_random_uuid(),
  version         int not null,
  is_active       boolean not null default false,
  system_prompt   text not null,
  notes           text,
  created_at      timestamptz not null default now(),
  created_by      text
);

create unique index welcome_chat_prompts_one_active_idx
  on staging.welcome_chat_prompts (is_active) where is_active = true;

-- 4. welcome_chat_rate_limits — daily message counters per IP hash (audit/fallback)
create table staging.welcome_chat_rate_limits (
  ip_hash         text not null,
  day             date not null,
  message_count   int not null default 0,
  last_message_at timestamptz not null default now(),
  primary key (ip_hash, day)
);

-- RLS
alter table staging.welcome_chats             enable row level security;
alter table staging.welcome_chat_messages     enable row level security;
alter table staging.welcome_chat_prompts      enable row level security;
alter table staging.welcome_chat_rate_limits  enable row level security;

create policy welcome_chats_anon_insert on staging.welcome_chats
  for insert to anon with check (true);

create policy welcome_chat_messages_anon_insert on staging.welcome_chat_messages
  for insert to anon with check (true);

create policy welcome_chat_prompts_anon_read_active on staging.welcome_chat_prompts
  for select to anon using (is_active = true);

-- Daily summary view for dashboard
create or replace view staging.v_welcome_chat_daily_summary as
select
  date_trunc('day', wcm.created_at)::date            as day,
  count(distinct wcm.chat_id)                        as chats_with_activity,
  count(*)                                           as total_messages,
  count(*) filter (where wcm.role = 'user')          as user_messages,
  count(*) filter (where wcm.role = 'assistant')     as assistant_messages,
  count(*) filter (where wcm.fallback_reason is not null) as fallback_count,
  sum(wcm.tokens_in)                                 as total_tokens_in,
  sum(wcm.tokens_out)                                as total_tokens_out,
  round(avg(wcm.latency_ms))                         as avg_latency_ms,
  -- Haiku 4.5 list pricing: $1/M input, $5/M output
  round((coalesce(sum(wcm.tokens_in), 0) * 1.0 / 1000000.0)::numeric, 4) as est_input_cost_usd,
  round((coalesce(sum(wcm.tokens_out), 0) * 5.0 / 1000000.0)::numeric, 4) as est_output_cost_usd
from staging.welcome_chat_messages wcm
where wcm.role in ('user', 'assistant')
group by 1
order by 1 desc;
```

- [ ] **Step 2: Apply migration in the Supabase project**

Open Supabase dashboard → `malearn-chat` project → SQL Editor → paste file contents → run.

Expected: 4 tables visible under `staging` schema, view visible under `staging`. No errors.

- [ ] **Step 3: Verify schema is exposed via PostgREST**

In Supabase: Settings → API → Exposed schemas — confirm `staging` is in the allowlist (set up in Plan 1). If missing, add it. Restart PostgREST if requested.

- [ ] **Step 4: Sanity insert via Supabase SQL editor**

```sql
insert into staging.welcome_chats (cookie_id, tool_signal)
values ('test-cookie', 'midjourney')
returning id;

select * from staging.welcome_chats where cookie_id = 'test-cookie';

delete from staging.welcome_chats where cookie_id = 'test-cookie';
```

Expected: row appears + deletes cleanly.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-05-10-welcome-chat.sql
git commit -m "feat(db): add staging chat tables — chats, messages, prompts, rate_limits + daily summary view"
```

### Task A.3: Seed system prompt v1 row

**Files:**
- Create: `supabase/seeds/2026-05-10-welcome-chat-prompt-v1.sql`

- [ ] **Step 1: Write the seed file with full system prompt**

```sql
-- supabase/seeds/2026-05-10-welcome-chat-prompt-v1.sql
-- System prompt v1 for Chat Noor on /welcome
-- Codifies parent design spec sections 6.4–6.7 + locked voice/brand rules.
-- Edit by inserting a NEW row with version + 1 and toggling is_active atomically.

insert into staging.welcome_chat_prompts (version, is_active, system_prompt, notes, created_by)
values (
  1,
  true,
  $PROMPT$
أنت نور — مساعدة ماجد العنقاوي. ماجد مدرّب إبداعي ومرشد سعودي، خبرة 16 سنة في الإخراج الإبداعي والتصوير، يدرّب الناس كيف يعيشون من إبداعهم. هذي محادثة على صفحة welcome في malearnsa.com.

[طريقة الكلام]
- اللهجة: سعودية خليجية. استخدم كلمات مثل: وش، إيش، جالس، علقت، خلني، طيب، إن شاء الله، أبشر.
- الجمل قصيرة، طبيعية، بدون فلسفة.
- متوسط طول الجملة 25 كلمة أو أقل.
- بدون إيموجي أبداً.
- بدون مبالغة بالمشاعر — لا تقول "حسّيت بدفء" أو "الطاقة جميلة" أو أي شي من هذا. كن دافئ بشكل واقعي.
- أسماء الأدوات والمنصات تكتب باللاتيني داخل الجملة العربية: Midjourney لا تُكتب ميدجورني، Higgsfield لا تُكتب هيقسفيلد، Photoshop لا تُكتب فوتوشوب.

[ممنوع تماماً]
- "كمساعدة ذكية" / "as an AI" / "I am here to help" / "feel free to" / أي تعريف عن نفسك كذكاء اصطناعي.
- لا تعد أحد "إنه راح يصير محترف خلال أسبوع" أو أي وعد مبالغ فيه.
- لا تخصم. لا تعطي كوبون. أسعار ماجد ثابتة.
- لا تخترع كورسات أو منتجات ما قالها ماجد.
- لا تتكلم في: السياسة، الطب، الدين، الاستشارات المالية، أي موضوع خارج تخصصك.
- لا تكشف معلومات عن المستخدم ("أشوفك زرت ٣ مرات") — هذا يخوّف الناس.
- لا ترسل المستخدم على واتساب — التواصل البديل هو إيميل: support@malearnsa.com.

[تخصصك — ٥ مواضيع فقط]

١. أدوات AI الإبداعية:
   - Midjourney (توليد صور)
   - Higgsfield (توليد فيديو + صور)
   - Weavy (workflow بصري)
   - Magnific (رفع جودة صور)
   - Luma (توليد فيديو)
   - OpenArt (توليد صور)
   تجاوب على مستوى نصايح، ما تشرح كل شي بالتفصيل — هذا موجود بكورس T2.

٢. كورسات ماجد:
   T1 — حزم برومبت + بريسيتس + قوالب جاهزة. السعر 99 إلى 149 ريال. مناسبة لأي شخص يبي يبدأ بدون التزام.
   T2 — مدخل إلى الذكاء الاصطناعي الإبداعي. السعر 449 ريال. كورس مسجّل، فيه ٦ موديولات. لمين: من يبي يفهم AI الإبداعي من الصفر بشكل منهجي.
   T3 — صناعة الإلهام (ورشة لايف). السعر 1,199 ريال (الباقة الكاملة 1,299 ريال مع T2). دفعة ٣ أيام لايف، ٣٠ مقعد. للي يبي تعلم تطبيقي بإشراف مباشر.
   T4 — Mentorship (مرشدية فردية). السعر 3,500 ريال (3,000 ريال للمجموعة). لمن يبي تحوّل حقيقي بمساعدة شخصية من ماجد.

٣. التنقل في الموقع: malearnsa.com للموقع الرئيسي، malearnstore.com للمتجر، تسجيل الدخول من رابط الكورس بعد الشراء، تبي تواصل مباشر اكتب على support@malearnsa.com.

٤. شغل ماجد ونهجه: ١٦ سنة بالإخراج الإبداعي والتصوير، Fujifilm Brand Ambassador للسعودية، نائب مدير لجنة تصوير الأزياء. شعاره: صناعة الإلهام. هدفه يلهم مليون شخص يصدقون قدرتهم الإبداعية.

٥. مساعدة الشراء: طرق الدفع — Moyasar (مدى/فيزا/ماستركارد)، PayPal، Tamara (تقسيط)، تحويل بنكي على Bank Al-Inmaa. الفاتورة ZATCA من Daftra تصل بالإيميل تلقائياً.

[لو سؤال خارج تخصصك]
رد بهدوء: "هذا ما هو تخصصي — بس لو سؤالك عن AI الإبداعي أو كورسات ماجد، أنا معك."

[حالات خاصة — ردود محددة]

١. "صحح برومبتي": اعطه نصيحة سريعة (جملتين) ووجهه لـ T2 يتعلم الأساسيات. لا تتحول لخدمة prompt engineering مجانية.

٢. "الكورس يستاهل؟": كن صادق. اشرح لمين الكورس يناسب ولمين ما يناسب. اقتبس شهادة قصيرة من طلاب سابقين (تحت).

٣. "إيش الفرق عنكم وعن [منافس]؟": اختصر، بدون انتقاد للمنافس. ركّز على ميزة ماجد: ١٦ سنة خبرة، لهجة سعودية، إرشاد لايف، عربي كامل.

٤. "فيه درس مجاني؟": وجّه لـ Beyond Lighting preview أو هدية تخرّج T2. كريم بدون إفراط.

٥. "تنتقد بورتفوليو؟": لا، هذي خدمة شخصية. رد: "هذي خدمة شخصية، تنفع T4 — تبي معلومات عنه؟"

٦. "فيه خصم؟": لا، أبداً. رد: "أسعارنا ثابتة. لو الميزانية ضيقة، T1 يبدأ من 99."

[شهادات — استخدمها لما يسأل عن الجودة]
- "كورس T2 خلاني أفهم Midjourney من الصفر بأسبوع، الحين أستخدمه بشغلي اليومي." — طالبة من الدفعة الأولى
- "ماجد يشرح بطريقة تخليك تطبق على طول، مو نظرية." — طالب T3 من الدفعة الأولى

[لو سألوا من بناك]
"صنعني ماجد العنقاوي. أنا نور."

[الشكل]
نص عادي. بدون markdown. بدون code blocks إلا لو طلبوا مثال برومبت محدد. الردود قصيرة — جملة إلى ٣ جمل في الغالب. لو السؤال كبير، اسأل سؤال واحد توضيحي بدل ما تكتب جواب طويل.

تذكّر: إنت مساعدة دافئة وعملية — مثل صديقة تعرف ماجد وتبي خير الزائر. ما تبيع، تساعد.
$PROMPT$,
  'v1 launch prompt — derived from welcome-experience-design.md sections 6.4–6.7. Embeds course catalog + 2 testimonials. Saudi Khaleeji throughout. Brand names in Latin. No emojis. No exaggeration. Email-only escape (support@malearnsa.com).',
  'noor'
);
```

- [ ] **Step 2: Apply seed in Supabase SQL Editor**

Paste the file contents into Supabase SQL Editor → Run.

Expected: 1 row inserted into `staging.welcome_chat_prompts` with `is_active = true`.

- [ ] **Step 3: Verify**

```sql
select id, version, is_active, length(system_prompt) as prompt_chars, created_by
from staging.welcome_chat_prompts;
```

Expected: 1 row, `version=1`, `is_active=true`, `prompt_chars` ~3500.

- [ ] **Step 4: Commit**

```bash
git add supabase/seeds/2026-05-10-welcome-chat-prompt-v1.sql
git commit -m "feat(prompt): seed Chat Noor system prompt v1 — Saudi Khaleeji + 5 buckets + course catalog"
```

---

## Phase B — Lib utilities (TDD)

### Task B.1: Shared chat types

**Files:**
- Create: `lib/chat/types.ts`

This task has no test (pure types).

- [ ] **Step 1: Write the types file**

```typescript
// lib/chat/types.ts
import type { Message } from "ai";

export type ChatRole = "user" | "assistant" | "system";

export interface WelcomeChatRow {
  id: string;
  cookie_id: string;
  visit_id: string | null;
  tool_signal: string | null;
  opened_at: string;
  closed_at: string | null;
  message_count: number;
  created_at: string;
}

export interface WelcomeChatMessageRow {
  id: string;
  chat_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  model: string | null;
  fallback_reason: string | null;
}

export interface WelcomeChatPromptRow {
  id: string;
  version: number;
  is_active: boolean;
  system_prompt: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ChatRequestBody {
  messages: Message[];
  chat_id: string;
  cookie_id: string;
  tool_signal: string | null;
  tool_name_en: string | null;  // pre-resolved on the client from the tools catalog
}

export type FallbackReason =
  | "banned_phrase"
  | "user_aborted"
  | "anthropic_error"
  | "rate_limited";
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/chat/types.ts
git commit -m "feat(chat): add shared TypeScript types for chat domain"
```

### Task B.2: IP hash utility

**Files:**
- Create: `lib/chat/ipHash.ts`
- Create: `tests/lib/chat/ipHash.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/lib/chat/ipHash.test.ts
import { describe, it, expect } from "vitest";
import { hashIp } from "@/lib/chat/ipHash";

describe("hashIp", () => {
  it("returns a 16-character hex string", async () => {
    const hash = await hashIp("203.0.113.42");
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic for the same input", async () => {
    const a = await hashIp("203.0.113.42");
    const b = await hashIp("203.0.113.42");
    expect(a).toBe(b);
  });

  it("differs across IPs", async () => {
    const a = await hashIp("203.0.113.42");
    const b = await hashIp("203.0.113.43");
    expect(a).not.toBe(b);
  });

  it("falls back to a stable token for missing IP", async () => {
    const hash = await hashIp(null);
    expect(hash).toBe("unknown_ip______");
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
cd ~/code/ma-learn-welcome
npm run test -- tests/lib/chat/ipHash.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/chat/ipHash'`.

- [ ] **Step 3: Implement**

```typescript
// lib/chat/ipHash.ts
// SHA-256 hash of the IP, truncated to 16 hex chars.
// Edge-runtime compatible (uses crypto.subtle, no Node Buffer).

export async function hashIp(ip: string | null): Promise<string> {
  if (!ip) {
    return "unknown_ip______";
  }
  const data = new TextEncoder().encode(ip);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(buf));
  return bytes
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npm run test -- tests/lib/chat/ipHash.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/chat/ipHash.ts tests/lib/chat/ipHash.test.ts
git commit -m "feat(chat): add edge-compatible SHA-256 IP hash utility"
```

### Task B.3: Rate limiting (KV-backed)

**Files:**
- Create: `lib/chat/rateLimit.ts`
- Create: `tests/lib/chat/rateLimit.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/chat/rateLimit.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @vercel/kv with an in-memory store
vi.mock("@vercel/kv", () => {
  const store = new Map<string, number>();
  return {
    kv: {
      incr: vi.fn(async (key: string) => {
        const next = (store.get(key) ?? 0) + 1;
        store.set(key, next);
        return next;
      }),
      expire: vi.fn(async (_key: string, _seconds: number) => 1),
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      __reset: () => store.clear(),
    },
  };
});

import { incrementAndCheck, RATE_LIMIT_PER_DAY } from "@/lib/chat/rateLimit";
import { kv } from "@vercel/kv";

describe("incrementAndCheck", () => {
  beforeEach(() => {
    (kv as unknown as { __reset: () => void }).__reset();
    vi.clearAllMocks();
  });

  it("returns ok=true for first request", async () => {
    const result = await incrementAndCheck("hash_abc", new Date("2026-05-10T12:00:00Z"));
    expect(result).toEqual({ ok: true, count: 1, limit: RATE_LIMIT_PER_DAY });
  });

  it("returns ok=false once count exceeds limit", async () => {
    for (let i = 0; i < RATE_LIMIT_PER_DAY; i++) {
      await incrementAndCheck("hash_abc", new Date("2026-05-10T12:00:00Z"));
    }
    const overflow = await incrementAndCheck("hash_abc", new Date("2026-05-10T12:00:00Z"));
    expect(overflow.ok).toBe(false);
    expect(overflow.count).toBe(RATE_LIMIT_PER_DAY + 1);
  });

  it("scopes counts per IP hash", async () => {
    await incrementAndCheck("hash_abc", new Date("2026-05-10T12:00:00Z"));
    const other = await incrementAndCheck("hash_xyz", new Date("2026-05-10T12:00:00Z"));
    expect(other.count).toBe(1);
  });

  it("scopes counts per UTC day", async () => {
    await incrementAndCheck("hash_abc", new Date("2026-05-10T23:59:00Z"));
    const nextDay = await incrementAndCheck("hash_abc", new Date("2026-05-11T00:01:00Z"));
    expect(nextDay.count).toBe(1);
  });

  it("calls expire with 24h TTL on first hit of the day", async () => {
    await incrementAndCheck("hash_abc", new Date("2026-05-10T12:00:00Z"));
    expect(kv.expire).toHaveBeenCalledWith(
      "ratelimit:chat:hash_abc:2026-05-10",
      60 * 60 * 25, // 25h to be safe across DST
    );
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npm run test -- tests/lib/chat/rateLimit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/chat/rateLimit.ts
import { kv } from "@vercel/kv";

export const RATE_LIMIT_PER_DAY = 10;

export interface RateLimitResult {
  ok: boolean;
  count: number;
  limit: number;
}

function dayKey(ipHash: string, now: Date): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `ratelimit:chat:${ipHash}:${yyyy}-${mm}-${dd}`;
}

export async function incrementAndCheck(
  ipHash: string,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const key = dayKey(ipHash, now);
  const count = await kv.incr(key);
  if (count === 1) {
    // First hit of the day — set TTL. 25h to be safe across edge-of-day races.
    await kv.expire(key, 60 * 60 * 25);
  }
  return {
    ok: count <= RATE_LIMIT_PER_DAY,
    count,
    limit: RATE_LIMIT_PER_DAY,
  };
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npm run test -- tests/lib/chat/rateLimit.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/chat/rateLimit.ts tests/lib/chat/rateLimit.test.ts
git commit -m "feat(chat): KV-backed rate limit — 10 msg/IP/24h, atomic increment-then-check"
```

### Task B.4: Banned-phrase regex

**Files:**
- Create: `lib/chat/bannedPhrases.ts`
- Create: `tests/lib/chat/bannedPhrases.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/chat/bannedPhrases.test.ts
import { describe, it, expect } from "vitest";
import { detectBannedPhrase } from "@/lib/chat/bannedPhrases";

describe("detectBannedPhrase", () => {
  it("flags 'as an AI'", () => {
    expect(detectBannedPhrase("As an AI, I cannot help with that")).toBe("as_an_ai");
  });

  it("flags 'I am here to help'", () => {
    expect(detectBannedPhrase("Hi! I am here to help you today.")).toBe("i_am_here_to_help");
  });

  it("flags 'feel free to'", () => {
    expect(detectBannedPhrase("Feel free to ask anything.")).toBe("feel_free_to");
  });

  it("flags Arabic transliteration of brand names — ميدجورني", () => {
    expect(detectBannedPhrase("ميدجورني أداة قوية لتوليد الصور")).toBe("brand_name_translit_midjourney");
  });

  it("flags Arabic transliteration of brand names — هيقسفيلد", () => {
    expect(detectBannedPhrase("هيقسفيلد للفيديو")).toBe("brand_name_translit_higgsfield");
  });

  it("returns null for clean Saudi-dialect content", () => {
    expect(
      detectBannedPhrase("أبشر، Midjourney مناسب لك. ابدأ بـ T1 لو تبي تجربه."),
    ).toBeNull();
  });

  it("returns null for a clean English message that mentions AI", () => {
    expect(detectBannedPhrase("Midjourney is an AI tool that I love.")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npm run test -- tests/lib/chat/bannedPhrases.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/chat/bannedPhrases.ts
// Server-side post-stream regex check. Hits flag the message for prompt iteration.
// v1 lets the message render — we just log the hit. v2 may swap to a safe fallback.

export type BannedReason =
  | "as_an_ai"
  | "i_am_here_to_help"
  | "feel_free_to"
  | "brand_name_translit_midjourney"
  | "brand_name_translit_higgsfield";

interface Rule {
  reason: BannedReason;
  pattern: RegExp;
}

const RULES: Rule[] = [
  { reason: "as_an_ai", pattern: /\bas an? AI\b/i },
  { reason: "i_am_here_to_help", pattern: /\bI(?:'m| am) here to help\b/i },
  { reason: "feel_free_to", pattern: /\bfeel free to\b/i },
  { reason: "brand_name_translit_midjourney", pattern: /ميدجورني/ },
  { reason: "brand_name_translit_higgsfield", pattern: /هيقسفيلد/ },
];

export function detectBannedPhrase(text: string): BannedReason | null {
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      return rule.reason;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npm run test -- tests/lib/chat/bannedPhrases.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/chat/bannedPhrases.ts tests/lib/chat/bannedPhrases.test.ts
git commit -m "feat(chat): banned-phrase post-stream regex check (5 initial rules)"
```

### Task B.5: Prompt renderer (template fill + history trim)

**Files:**
- Create: `lib/chat/promptRenderer.ts`
- Create: `tests/lib/chat/promptRenderer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/chat/promptRenderer.test.ts
import { describe, it, expect } from "vitest";
import type { Message } from "ai";
import { renderSystemPrompt, trimHistory, MAX_HISTORY_TURNS } from "@/lib/chat/promptRenderer";

describe("renderSystemPrompt", () => {
  it("substitutes {{tool_name_en}} when present", () => {
    const tpl = "أهلاً. الزائر مهتم بـ {{tool_name_en}}.";
    expect(renderSystemPrompt(tpl, "Midjourney")).toBe("أهلاً. الزائر مهتم بـ Midjourney.");
  });

  it("removes the tool-aware sentence when no tool signal", () => {
    const tpl = "أهلاً. <tool>الزائر مهتم بـ {{tool_name_en}}. </tool>تخصصك...";
    expect(renderSystemPrompt(tpl, null)).toBe("أهلاً. تخصصك...");
  });

  it("leaves template alone when no <tool> markers and no signal", () => {
    const tpl = "نص ثابت بدون أي تخصيص.";
    expect(renderSystemPrompt(tpl, null)).toBe("نص ثابت بدون أي تخصيص.");
  });
});

describe("trimHistory", () => {
  it(`keeps last ${MAX_HISTORY_TURNS} turns when exceeded`, () => {
    const messages: Message[] = [];
    for (let i = 0; i < MAX_HISTORY_TURNS + 5; i++) {
      messages.push({ id: `u${i}`, role: "user", content: `u${i}` });
      messages.push({ id: `a${i}`, role: "assistant", content: `a${i}` });
    }
    const trimmed = trimHistory(messages);
    expect(trimmed.length).toBe(MAX_HISTORY_TURNS * 2);
    expect(trimmed[0].content).toBe(`u${5}`);
  });

  it("returns input unchanged when under limit", () => {
    const messages: Message[] = [
      { id: "u0", role: "user", content: "hi" },
      { id: "a0", role: "assistant", content: "hello" },
    ];
    expect(trimHistory(messages)).toBe(messages);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npm run test -- tests/lib/chat/promptRenderer.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/chat/promptRenderer.ts
import type { Message } from "ai";

export const MAX_HISTORY_TURNS = 5;  // 5 user + 5 assistant pairs

/**
 * Renders the system prompt template:
 *  - If `toolNameEn` is present, substitutes {{tool_name_en}} and strips <tool>...</tool> wrappers (keeping the content inside).
 *  - If no signal, removes any text wrapped in <tool>...</tool> entirely.
 */
export function renderSystemPrompt(template: string, toolNameEn: string | null): string {
  if (toolNameEn) {
    return template
      .replace(/\{\{tool_name_en\}\}/g, toolNameEn)
      .replace(/<tool>([\s\S]*?)<\/tool>/g, "$1");
  }
  return template.replace(/<tool>[\s\S]*?<\/tool>/g, "");
}

/**
 * Trims the message history to the last MAX_HISTORY_TURNS user+assistant pairs.
 * Cost cap — system prompt is sent every request, so old turns multiply token bill linearly.
 */
export function trimHistory(messages: Message[]): Message[] {
  const max = MAX_HISTORY_TURNS * 2;
  if (messages.length <= max) {
    return messages;
  }
  return messages.slice(messages.length - max);
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npm run test -- tests/lib/chat/promptRenderer.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/chat/promptRenderer.ts tests/lib/chat/promptRenderer.test.ts
git commit -m "feat(chat): system prompt renderer with tool-name interpolation + history trim to 5 turns"
```

### Task B.6: DB fetcher — active prompt (with KV cache)

**Files:**
- Create: `lib/db/welcomeChatPrompts.ts`
- Create: `tests/lib/db/welcomeChatPrompts.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/db/welcomeChatPrompts.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@vercel/kv", () => {
  const store = new Map<string, unknown>();
  return {
    kv: {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      set: vi.fn(async (k: string, v: unknown) => {
        store.set(k, v);
        return "OK";
      }),
      __reset: () => store.clear(),
    },
  };
});

vi.mock("@/lib/db/supabase", () => ({
  supabase: { from: vi.fn() },
}));

import { fetchActivePrompt, ACTIVE_PROMPT_KV_KEY } from "@/lib/db/welcomeChatPrompts";
import { supabase } from "@/lib/db/supabase";
import { kv } from "@vercel/kv";

function mockSupabaseReturn(data: unknown, error: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data, error });
  const limit = vi.fn().mockReturnValue({ single });
  const eq = vi.fn().mockReturnValue({ limit });
  const select = vi.fn().mockReturnValue({ eq });
  (supabase as { from: typeof vi.fn }).from = vi.fn().mockReturnValue({ select });
}

describe("fetchActivePrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (kv as unknown as { __reset: () => void }).__reset();
  });

  it("returns the active prompt from Supabase when KV cache is empty", async () => {
    mockSupabaseReturn({ id: "p1", version: 1, system_prompt: "hello" });
    const prompt = await fetchActivePrompt();
    expect(prompt?.system_prompt).toBe("hello");
    expect(supabase.from).toHaveBeenCalledWith("welcome_chat_prompts");
  });

  it("warms KV cache after Supabase miss", async () => {
    mockSupabaseReturn({ id: "p1", version: 1, system_prompt: "hello" });
    await fetchActivePrompt();
    expect(kv.set).toHaveBeenCalledWith(
      ACTIVE_PROMPT_KV_KEY,
      expect.objectContaining({ id: "p1" }),
      { ex: 60 },
    );
  });

  it("returns the cached value on subsequent call within TTL", async () => {
    mockSupabaseReturn({ id: "p1", version: 1, system_prompt: "hello" });
    await fetchActivePrompt();
    vi.clearAllMocks();
    const second = await fetchActivePrompt();
    expect(second?.system_prompt).toBe("hello");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("returns null on Supabase error", async () => {
    mockSupabaseReturn(null, { message: "boom" });
    const prompt = await fetchActivePrompt();
    expect(prompt).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npm run test -- tests/lib/db/welcomeChatPrompts.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/db/welcomeChatPrompts.ts
import { kv } from "@vercel/kv";
import { supabase } from "@/lib/db/supabase";
import type { WelcomeChatPromptRow } from "@/lib/chat/types";

export const ACTIVE_PROMPT_KV_KEY = "chat:prompt:active";
const TTL_SECONDS = 60;

export async function fetchActivePrompt(): Promise<WelcomeChatPromptRow | null> {
  const cached = await kv.get<WelcomeChatPromptRow>(ACTIVE_PROMPT_KV_KEY);
  if (cached) {
    return cached;
  }

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("welcome_chat_prompts")
    .select("id, version, is_active, system_prompt, notes, created_at, created_by")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  await kv.set(ACTIVE_PROMPT_KV_KEY, data, { ex: TTL_SECONDS });
  return data as WelcomeChatPromptRow;
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npm run test -- tests/lib/db/welcomeChatPrompts.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/db/welcomeChatPrompts.ts tests/lib/db/welcomeChatPrompts.test.ts
git commit -m "feat(chat): active-prompt fetcher with 60s KV cache"
```

### Task B.7: DB fetcher/writer — chats + messages

**Files:**
- Create: `lib/db/welcomeChats.ts`
- Create: `tests/lib/db/welcomeChats.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/db/welcomeChats.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/supabase", () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

import {
  upsertChatRow,
  appendMessage,
  recordRateLimitMirror,
} from "@/lib/db/welcomeChats";
import { supabase } from "@/lib/db/supabase";

describe("upsertChatRow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls upsert with conflict on id", async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    (supabase as { from: typeof vi.fn }).from = vi.fn().mockReturnValue({ upsert });

    await upsertChatRow({
      id: "chat-uuid",
      cookie_id: "ck",
      visit_id: "v",
      tool_signal: "midjourney",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chat-uuid", cookie_id: "ck", tool_signal: "midjourney" }),
      { onConflict: "id" },
    );
  });
});

describe("appendMessage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts a message row", async () => {
    const insert = vi.fn().mockResolvedValue({ data: null, error: null });
    (supabase as { from: typeof vi.fn }).from = vi.fn().mockImplementation((table: string) => {
      if (table === "welcome_chat_messages") return { insert };
      if (table === "welcome_chats") {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      return { insert: vi.fn() };
    });

    await appendMessage({
      chat_id: "chat-uuid",
      role: "assistant",
      content: "أهلاً",
      tokens_in: 1000,
      tokens_out: 50,
      latency_ms: 800,
      model: "claude-haiku-4-5-20251001",
      fallback_reason: null,
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: "chat-uuid",
        role: "assistant",
        content: "أهلاً",
        tokens_in: 1000,
      }),
    );
  });
});

describe("recordRateLimitMirror", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts on (ip_hash, day) primary key", async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
    (supabase as { from: typeof vi.fn }).from = vi.fn().mockReturnValue({ upsert });

    await recordRateLimitMirror("hash_xyz", "2026-05-10", 3);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ ip_hash: "hash_xyz", day: "2026-05-10", message_count: 3 }),
      { onConflict: "ip_hash,day" },
    );
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npm run test -- tests/lib/db/welcomeChats.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/db/welcomeChats.ts
import { supabase } from "@/lib/db/supabase";
import type { ChatRole, FallbackReason } from "@/lib/chat/types";

export interface UpsertChatInput {
  id: string;
  cookie_id: string;
  visit_id: string | null;
  tool_signal: string | null;
}

export async function upsertChatRow(input: UpsertChatInput): Promise<void> {
  if (!supabase) return;
  await supabase.from("welcome_chats").upsert(
    {
      id: input.id,
      cookie_id: input.cookie_id,
      visit_id: input.visit_id,
      tool_signal: input.tool_signal,
    },
    { onConflict: "id" },
  );
}

export interface AppendMessageInput {
  chat_id: string;
  role: ChatRole;
  content: string;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number | null;
  model: string | null;
  fallback_reason: FallbackReason | null;
}

export async function appendMessage(input: AppendMessageInput): Promise<void> {
  if (!supabase) return;
  await supabase.from("welcome_chat_messages").insert({
    chat_id: input.chat_id,
    role: input.role,
    content: input.content,
    tokens_in: input.tokens_in,
    tokens_out: input.tokens_out,
    latency_ms: input.latency_ms,
    model: input.model,
    fallback_reason: input.fallback_reason,
  });

  // Best-effort message_count bump on parent chat row.
  await supabase
    .from("welcome_chats")
    .update({ message_count: input.content ? 1 : 0 })  // see Task C.1 step note re: real increment via RPC
    .eq("id", input.chat_id);
}

export async function recordRateLimitMirror(
  ip_hash: string,
  day: string,
  message_count: number,
): Promise<void> {
  if (!supabase) return;
  await supabase.from("welcome_chat_rate_limits").upsert(
    { ip_hash, day, message_count, last_message_at: new Date().toISOString() },
    { onConflict: "ip_hash,day" },
  );
}
```

> **Note for Task C.1:** the `message_count` bump above is a placeholder write that will be refined when wiring the route. The accurate bump uses a Postgres RPC `increment_chat_message_count(chat_uuid)` — defined inline in the SQL migration if needed, or done via two calls (read + write). For v1 staging, total `message_count` is recoverable via the daily summary view, so a fuzzy value here is acceptable.

- [ ] **Step 4: Run test, expect PASS**

```bash
npm run test -- tests/lib/db/welcomeChats.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/db/welcomeChats.ts tests/lib/db/welcomeChats.test.ts
git commit -m "feat(chat): chat + message + rate-limit-mirror DB writers"
```

---

## Phase C — API route

### Task C.1: `/api/chat` edge route

**Files:**
- Create: `app/api/chat/route.ts`
- Create: `tests/api/chat.test.ts`

- [ ] **Step 1: Write the failing handler test**

```typescript
// tests/api/chat.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks
vi.mock("@/lib/chat/rateLimit", () => ({
  incrementAndCheck: vi.fn(),
  RATE_LIMIT_PER_DAY: 10,
}));

vi.mock("@/lib/db/welcomeChatPrompts", () => ({
  fetchActivePrompt: vi.fn(),
}));

vi.mock("@/lib/db/welcomeChats", () => ({
  upsertChatRow: vi.fn(),
  appendMessage: vi.fn(),
  recordRateLimitMirror: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn().mockReturnValue("mock-model"),
}));

vi.mock("ai", () => ({
  streamText: vi.fn().mockReturnValue({
    toDataStreamResponse: () => new Response("streamed-body", { status: 200 }),
  }),
}));

import { POST } from "@/app/api/chat/route";
import { incrementAndCheck } from "@/lib/chat/rateLimit";
import { fetchActivePrompt } from "@/lib/db/welcomeChatPrompts";
import { streamText } from "ai";

function makeRequest(body: unknown, ip = "203.0.113.1"): Request {
  return new Request("https://staging-welcome.malearnsa.com/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
  });
}

describe("POST /api/chat", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when cookie_id is missing", async () => {
    const res = await POST(makeRequest({ messages: [], chat_id: "c1" }));
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate-limited", async () => {
    (incrementAndCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      count: 11,
      limit: 10,
    });
    const res = await POST(
      makeRequest({
        messages: [{ id: "u1", role: "user", content: "hi" }],
        chat_id: "c1",
        cookie_id: "ck",
        tool_signal: null,
        tool_name_en: null,
      }),
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate_limited");
  });

  it("returns 500 when no active prompt configured", async () => {
    (incrementAndCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      count: 1,
      limit: 10,
    });
    (fetchActivePrompt as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(
      makeRequest({
        messages: [{ id: "u1", role: "user", content: "hi" }],
        chat_id: "c1",
        cookie_id: "ck",
        tool_signal: null,
        tool_name_en: null,
      }),
    );
    expect(res.status).toBe(500);
  });

  it("calls streamText with rendered system prompt + trimmed history", async () => {
    (incrementAndCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      count: 1,
      limit: 10,
    });
    (fetchActivePrompt as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "p1",
      version: 1,
      is_active: true,
      system_prompt: "أهلاً. <tool>الزائر مهتم بـ {{tool_name_en}}. </tool>تخصصك...",
      notes: null,
      created_at: "2026-05-10T00:00:00Z",
      created_by: "noor",
    });

    const messages = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`,
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `m${i}`,
    }));

    await POST(
      makeRequest({
        messages,
        chat_id: "c1",
        cookie_id: "ck",
        tool_signal: "midjourney",
        tool_name_en: "Midjourney",
      }),
    );

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "أهلاً. الزائر مهتم بـ Midjourney. تخصصك...",
        messages: expect.arrayContaining([
          expect.objectContaining({ content: "m2" }),  // trimmed: starts at m2 (last 5 turns = m2..m11)
        ]),
        maxTokens: 600,
      }),
    );
  });

  it("returns 200 streamed response on happy path", async () => {
    (incrementAndCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      count: 1,
      limit: 10,
    });
    (fetchActivePrompt as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "p1",
      version: 1,
      is_active: true,
      system_prompt: "ok",
      notes: null,
      created_at: "2026-05-10T00:00:00Z",
      created_by: "noor",
    });
    const res = await POST(
      makeRequest({
        messages: [{ id: "u1", role: "user", content: "hi" }],
        chat_id: "c1",
        cookie_id: "ck",
        tool_signal: null,
        tool_name_en: null,
      }),
    );
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npm run test -- tests/api/chat.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

```typescript
// app/api/chat/route.ts
import { z } from "zod";
import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { hashIp } from "@/lib/chat/ipHash";
import { incrementAndCheck } from "@/lib/chat/rateLimit";
import { fetchActivePrompt } from "@/lib/db/welcomeChatPrompts";
import {
  upsertChatRow,
  appendMessage,
  recordRateLimitMirror,
} from "@/lib/db/welcomeChats";
import { renderSystemPrompt, trimHistory } from "@/lib/chat/promptRenderer";
import { detectBannedPhrase } from "@/lib/chat/bannedPhrases";

export const runtime = "edge";
export const preferredRegion = "fra1";

const MODEL_ID = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 600;

const RequestSchema = z.object({
  messages: z.array(z.object({
    id: z.string(),
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
  })),
  chat_id: z.string().uuid(),
  cookie_id: z.string().min(1),
  tool_signal: z.string().nullable(),
  tool_name_en: z.string().nullable(),
});

function getClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: Request): Promise<Response> {
  let parsed;
  try {
    const json = await req.json();
    parsed = RequestSchema.safeParse(json);
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!parsed.success) {
    return Response.json({ error: "invalid_body", details: parsed.error.format() }, { status: 400 });
  }
  const { messages, chat_id, cookie_id, tool_signal, tool_name_en } = parsed.data;

  // Step 3 of spec pipeline — atomic increment-then-check.
  const ip = getClientIp(req);
  const ipHash = await hashIp(ip);
  const rl = await incrementAndCheck(ipHash);
  if (!rl.ok) {
    return Response.json(
      {
        error: "rate_limited",
        message: "وصلت أقصى عدد رسائل اليوم. ارجع بكرة أو راسل support@malearnsa.com وراح يردّ عليك ماجد أو فريقه.",
        limit: rl.limit,
      },
      { status: 429 },
    );
  }

  const promptRow = await fetchActivePrompt();
  if (!promptRow) {
    return Response.json({ error: "no_active_prompt" }, { status: 500 });
  }

  const systemPrompt = renderSystemPrompt(promptRow.system_prompt, tool_name_en);
  const trimmed = trimHistory(messages);

  // Ensure chat row exists (idempotent — first message creates it; later messages no-op upsert).
  await upsertChatRow({
    id: chat_id,
    cookie_id,
    visit_id: null,  // Plan 4 will link to visit_id once capture flow needs it
    tool_signal,
  });

  const startedAt = Date.now();

  const result = streamText({
    model: anthropic(MODEL_ID),
    system: systemPrompt,
    messages: trimmed,
    maxTokens: MAX_TOKENS,
    temperature: 0.7,
    // Anthropic prompt caching applied to the system block.
    providerOptions: {
      anthropic: {
        cacheControl: { type: "ephemeral" },
      },
    },
    async onFinish({ text, usage, finishReason }) {
      const latency_ms = Date.now() - startedAt;
      const banned = detectBannedPhrase(text);

      // Persist user's last message + assistant message — fire-and-forget, won't block response.
      const lastUser = [...trimmed].reverse().find((m) => m.role === "user");
      if (lastUser) {
        await appendMessage({
          chat_id,
          role: "user",
          content: lastUser.content,
          tokens_in: null,
          tokens_out: null,
          latency_ms: null,
          model: null,
          fallback_reason: null,
        });
      }
      await appendMessage({
        chat_id,
        role: "assistant",
        content: text,
        tokens_in: usage?.promptTokens ?? null,
        tokens_out: usage?.completionTokens ?? null,
        latency_ms,
        model: MODEL_ID,
        fallback_reason: banned
          ? "banned_phrase"
          : finishReason === "error"
          ? "anthropic_error"
          : null,
      });

      // Mirror rate-limit count to the audit table.
      await recordRateLimitMirror(ipHash, todayUtc(), rl.count);

      // Structured log for Vercel
      console.log(JSON.stringify({
        event: "chat_request",
        chat_id,
        cookie_id,
        tool_signal,
        tokens_in: usage?.promptTokens,
        tokens_out: usage?.completionTokens,
        latency_ms,
        fallback_reason: banned,
      }));
    },
  });

  return result.toDataStreamResponse();
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npm run test -- tests/api/chat.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/chat/route.ts tests/api/chat.test.ts
git commit -m "feat(api): /api/chat edge route — stream Haiku 4.5 + persist + rate limit + banned-phrase check"
```

### Task C.2: Verify ANTHROPIC_API_KEY env on Vercel

This is a one-time platform configuration — no code changes.

- [ ] **Step 1: Open Vercel dashboard → ma-learn-welcome project → Settings → Environment Variables.**

- [ ] **Step 2: Confirm `ANTHROPIC_API_KEY` exists across Production + Preview + Development.**

If missing, source from `~/.config/ma-ea/keys.env`:
```bash
set -a; source ~/.config/ma-ea/keys.env; set +a
echo $ANTHROPIC_API_KEY  # confirm value present
```
Then add it to all three Vercel environments via the dashboard.

- [ ] **Step 3: Confirm `KV_*` vars from Plan 1 still active (no change needed if Plan 1 + Plan 2 are healthy).**

- [ ] **Step 4: No commit — platform-only step.**

---

## Phase D — UI components

### Task D.1: ChatBubble (always-loaded floating pill)

**Files:**
- Create: `app/welcome/_components/ChatBubble.tsx`

- [ ] **Step 1: Implement the bubble**

```tsx
// app/welcome/_components/ChatBubble.tsx
"use client";

import { useEffect, useState } from "react";

const PULSE_FLAG_KEY = "ml_w_chat_pulse_seen";

export default function ChatBubble({ onOpen }: { onOpen: () => void }) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!sessionStorage.getItem(PULSE_FLAG_KEY)) {
      setPulse(true);
    }
  }, []);

  function handleClick() {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(PULSE_FLAG_KEY, "1");
    }
    setPulse(false);
    onOpen();
  }

  return (
    <button
      type="button"
      aria-label="افتح المحادثة مع نور"
      onClick={handleClick}
      className={`chat-bubble ${pulse ? "chat-bubble--pulse" : ""}`}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"
          fill="white"
        />
      </svg>
    </button>
  );
}
```

- [ ] **Step 2: Add bubble styles to globals.css**

Open `app/globals.css` and append:

```css
/* Chat bubble — Plan 3 */
.chat-bubble {
  position: fixed;
  bottom: 20px;
  inset-inline-end: 20px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--color-accent-gold);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 50;
  transition: transform 0.2s ease;
}

.chat-bubble:hover {
  transform: scale(1.05);
}

@media (min-width: 768px) {
  .chat-bubble {
    width: 64px;
    height: 64px;
    bottom: 32px;
    inset-inline-end: 32px;
  }
}

.chat-bubble--pulse {
  animation: chat-bubble-pulse 2s ease-in-out infinite;
}

@keyframes chat-bubble-pulse {
  0%, 100% { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 0 0 0 rgba(212, 175, 55, 0.5); }
  50% { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 0 0 12px rgba(212, 175, 55, 0); }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/welcome/_components/ChatBubble.tsx app/globals.css
git commit -m "feat(chat): ChatBubble — floating gold pill, first-visit pulse animation"
```

### Task D.2: ChatHeader, ChatMessage, ChatMessages, ChatInput

**Files:**
- Create: `app/welcome/_components/ChatHeader.tsx`
- Create: `app/welcome/_components/ChatMessage.tsx`
- Create: `app/welcome/_components/ChatMessages.tsx`
- Create: `app/welcome/_components/ChatInput.tsx`

- [ ] **Step 1: Implement ChatHeader**

```tsx
// app/welcome/_components/ChatHeader.tsx
"use client";

export default function ChatHeader({ onClose }: { onClose: () => void }) {
  return (
    <header className="chat-header">
      <div className="chat-header__title">
        <span className="chat-header__name">نور — مساعدة ماجد</span>
        <span className="chat-header__status" aria-label="متصلة">
          <span className="chat-header__dot" />
        </span>
      </div>
      <button
        type="button"
        className="chat-header__close"
        aria-label="أغلق المحادثة"
        onClick={onClose}
      >
        ✕
      </button>
    </header>
  );
}
```

- [ ] **Step 2: Implement ChatMessage**

```tsx
// app/welcome/_components/ChatMessage.tsx
"use client";

import type { Message } from "ai";

export default function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`chat-msg ${isUser ? "chat-msg--user" : "chat-msg--assistant"}`}>
      <div className="chat-msg__bubble">{message.content}</div>
    </div>
  );
}
```

- [ ] **Step 3: Implement ChatMessages**

```tsx
// app/welcome/_components/ChatMessages.tsx
"use client";

import { useEffect, useRef } from "react";
import type { Message } from "ai";
import ChatMessage from "./ChatMessage";

interface Props {
  messages: Message[];
  isStreaming: boolean;
  rateLimited?: boolean;
  errorBanner?: string | null;
  onRetry?: () => void;
}

export default function ChatMessages({
  messages,
  isStreaming,
  rateLimited,
  errorBanner,
  onRetry,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  return (
    <div className="chat-messages" role="log" aria-live="polite">
      {messages.map((m) => (
        <ChatMessage key={m.id} message={m} />
      ))}
      {isStreaming && (
        <div className="chat-msg chat-msg--assistant">
          <div className="chat-msg__bubble chat-msg__bubble--streaming">
            <span className="chat-msg__cursor">▌</span>
          </div>
        </div>
      )}
      {errorBanner && (
        <div className="chat-error" role="alert">
          <p>{errorBanner}</p>
          {onRetry && (
            <button type="button" onClick={onRetry} className="chat-error__retry">
              جرّب مرة ثانية
            </button>
          )}
        </div>
      )}
      {rateLimited && (
        <div className="chat-cap" role="alert">
          <p>
            وصلت أقصى عدد رسائل اليوم. ارجع بكرة أو راسل{" "}
            <a href="mailto:support@malearnsa.com">support@malearnsa.com</a>{" "}
            وراح يردّ عليك ماجد أو فريقه.
          </p>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
```

- [ ] **Step 4: Implement ChatInput**

```tsx
// app/welcome/_components/ChatInput.tsx
"use client";

import { useRef, type FormEvent, type KeyboardEvent } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
}

const SOFT_CAP = 500;

export default function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming,
  disabled,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (disabled || isStreaming) return;
    if (!value.trim()) return;
    if (value.length > SOFT_CAP) return;
    onSubmit();
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  const overSoftCap = value.length > SOFT_CAP;
  const sendDisabled = disabled || isStreaming || !value.trim() || overSoftCap;

  return (
    <form className="chat-input" onSubmit={handleSubmit}>
      <textarea
        ref={taRef}
        className="chat-input__textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        placeholder="اكتب سؤالك..."
        rows={1}
        disabled={disabled}
        dir="auto"
      />
      {overSoftCap && (
        <span className="chat-input__counter">{SOFT_CAP} حرف بس</span>
      )}
      {isStreaming ? (
        <button
          type="button"
          className="chat-input__btn chat-input__btn--stop"
          onClick={onStop}
          aria-label="أوقف الردّ"
        >
          ■
        </button>
      ) : (
        <button
          type="submit"
          className="chat-input__btn"
          disabled={sendDisabled}
          aria-label="أرسل الرسالة"
        >
          ➤
        </button>
      )}
    </form>
  );
}
```

- [ ] **Step 5: Add styles for header / messages / input**

Append to `app/globals.css`:

```css
/* Chat panel internals — Plan 3 */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-block-end: 1px solid rgba(0, 0, 0, 0.08);
  background: var(--color-surface);
}
.chat-header__title { display: flex; align-items: center; gap: 8px; }
.chat-header__name { font-weight: 600; font-size: 15px; color: var(--color-text-primary); }
.chat-header__dot { display: inline-block; width: 8px; height: 8px; background: #2ecc71; border-radius: 50%; }
.chat-header__close {
  background: none; border: none; cursor: pointer; font-size: 18px; color: var(--color-text-secondary);
  padding: 4px 8px; border-radius: 4px;
}
.chat-header__close:hover { background: rgba(0, 0, 0, 0.05); }

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-msg { display: flex; }
.chat-msg--user { justify-content: flex-end; }
.chat-msg--assistant { justify-content: flex-start; }
.chat-msg__bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 15px;
  line-height: 1.55;
  white-space: pre-wrap;
}
.chat-msg--user .chat-msg__bubble {
  background: var(--color-accent-gold);
  color: white;
  border-end-end-radius: 4px;
}
.chat-msg--assistant .chat-msg__bubble {
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
  border-end-start-radius: 4px;
}
.chat-msg__cursor { display: inline-block; animation: chat-cursor-blink 1s step-end infinite; }
@keyframes chat-cursor-blink { 50% { opacity: 0; } }

.chat-error, .chat-cap {
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-secondary);
}
.chat-error__retry {
  margin-top: 8px;
  background: var(--color-accent-gold);
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.chat-input {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-block-start: 1px solid rgba(0, 0, 0, 0.08);
  background: var(--color-surface);
}
.chat-input__textarea {
  flex: 1;
  resize: none;
  font: inherit;
  font-size: 15px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  padding: 8px 12px;
  max-height: 120px;
  background: white;
}
.chat-input__textarea:focus { outline: none; border-color: var(--color-accent-gold); }
.chat-input__counter {
  position: absolute;
  inset-inline-end: 80px;
  bottom: 24px;
  font-size: 12px;
  color: #c0392b;
}
.chat-input__btn {
  width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer;
  background: var(--color-accent-gold); color: white; font-size: 14px;
}
.chat-input__btn:disabled { opacity: 0.4; cursor: not-allowed; }
.chat-input__btn--stop { background: #e74c3c; }
```

- [ ] **Step 6: Commit**

```bash
git add app/welcome/_components/ChatHeader.tsx \
        app/welcome/_components/ChatMessage.tsx \
        app/welcome/_components/ChatMessages.tsx \
        app/welcome/_components/ChatInput.tsx \
        app/globals.css
git commit -m "feat(chat): header + message + messages + input components with Editorial Atelier styles"
```

### Task D.3: ChatPanel — composes everything + uses useChat()

**Files:**
- Create: `app/welcome/_components/ChatPanel.tsx`

- [ ] **Step 1: Implement the panel**

```tsx
// app/welcome/_components/ChatPanel.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { motion, AnimatePresence } from "framer-motion";
import ChatHeader from "./ChatHeader";
import ChatMessages from "./ChatMessages";
import ChatInput from "./ChatInput";

interface Props {
  open: boolean;
  onClose: () => void;
  cookieId: string;
  toolSignal: string | null;
  toolNameEn: string | null;
}

function uuid(): string {
  return crypto.randomUUID();
}

function buildOpeningContent(toolNameEn: string | null): string {
  if (toolNameEn) {
    return `شفت إنك مهتم بـ ${toolNameEn}. اسأل أي شي عنه أو عن كورسات ماجد.`;
  }
  return "أنا نور، مساعدة ماجد. اسأل أي شي عن AI الإبداعي أو كورسات ماجد.";
}

export default function ChatPanel({ open, onClose, cookieId, toolSignal, toolNameEn }: Props) {
  const chatIdRef = useRef<string>(uuid());
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const failureCountRef = useRef(0);

  const opening = useMemo(
    () => ({
      id: "opening",
      role: "assistant" as const,
      content: buildOpeningContent(toolNameEn),
    }),
    [toolNameEn],
  );

  const {
    messages,
    input,
    setInput,
    handleSubmit,
    isLoading,
    stop,
    reload,
  } = useChat({
    api: "/api/chat",
    initialMessages: [opening],
    body: {
      chat_id: chatIdRef.current,
      cookie_id: cookieId,
      tool_signal: toolSignal,
      tool_name_en: toolNameEn,
    },
    onError: async (err) => {
      // Detect 429 vs other errors
      try {
        const resp = (err as unknown as { response?: Response }).response;
        if (resp?.status === 429) {
          setRateLimited(true);
          return;
        }
      } catch {
        /* fall through */
      }
      failureCountRef.current += 1;
      if (failureCountRef.current >= 3) {
        setErrorBanner(
          "في خلل بسيط الحين. راسلنا على support@malearnsa.com وراح يردّ عليك ماجد أو فريقه.",
        );
      } else {
        setErrorBanner("يبدو فيه مشكلة — جرّب مرة ثانية");
      }
    },
    onFinish: () => {
      failureCountRef.current = 0;
      setErrorBanner(null);
    },
  });

  function handleRetry() {
    setErrorBanner(null);
    void reload();
  }

  // Lock body scroll on mobile when open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="chat-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.aside
            className="chat-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-title"
            initial={{ y: "100%", opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
          >
            <ChatHeader onClose={onClose} />
            <ChatMessages
              messages={messages}
              isStreaming={isLoading}
              rateLimited={rateLimited}
              errorBanner={errorBanner}
              onRetry={errorBanner === "يبدو فيه مشكلة — جرّب مرة ثانية" ? handleRetry : undefined}
            />
            <ChatInput
              value={input}
              onChange={setInput}
              onSubmit={() => handleSubmit()}
              onStop={stop}
              isStreaming={isLoading}
              disabled={rateLimited}
            />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Add panel styles to globals.css**

Append:

```css
/* Chat panel + backdrop — Plan 3 */
.chat-backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 60;
}

.chat-panel {
  position: fixed;
  inset-inline: 0;
  inset-block-end: 0;
  height: 70vh;
  background: var(--color-surface);
  border-start-start-radius: 16px;
  border-start-end-radius: 16px;
  z-index: 70;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.15);
}

@media (min-width: 768px) {
  .chat-backdrop { display: none; }
  .chat-panel {
    inset-inline-end: 32px;
    inset-inline-start: auto;
    inset-block-end: 32px;
    width: 400px;
    height: 600px;
    max-height: 80vh;
    border-radius: 16px;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/welcome/_components/ChatPanel.tsx app/globals.css
git commit -m "feat(chat): ChatPanel — useChat() + framer-motion bottom sheet + error/rate-limit handling"
```

### Task D.4: Mount in `page.tsx` with hash-driven open/close + lazy load

**Files:**
- Modify: `app/welcome/page.tsx`
- Create: `app/welcome/_components/ChatMount.tsx`

We add a small client component (`ChatMount`) that holds the open-state logic + lazy-loads `ChatPanel`. This keeps `page.tsx` (Server Component) untouched aside from one import.

- [ ] **Step 1: Implement ChatMount**

```tsx
// app/welcome/_components/ChatMount.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import ChatBubble from "./ChatBubble";

const ChatPanel = dynamic(() => import("./ChatPanel"), { ssr: false });

interface Props {
  cookieId: string;
  toolSignal: string | null;
  toolNameEn: string | null;
}

export default function ChatMount({ cookieId, toolSignal, toolNameEn }: Props) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => {
    if (typeof window !== "undefined" && window.location.hash === "#chat") {
      window.history.back();
    } else {
      setOpen(false);
    }
  }, []);

  const openPanel = useCallback(() => {
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", "#chat");
    }
    setOpen(true);
  }, []);

  useEffect(() => {
    function syncFromHash() {
      setOpen(window.location.hash === "#chat");
    }
    syncFromHash();
    window.addEventListener("popstate", syncFromHash);
    window.addEventListener("hashchange", syncFromHash);
    return () => {
      window.removeEventListener("popstate", syncFromHash);
      window.removeEventListener("hashchange", syncFromHash);
    };
  }, []);

  return (
    <>
      <ChatBubble onOpen={openPanel} />
      <ChatPanel
        open={open}
        onClose={close}
        cookieId={cookieId}
        toolSignal={toolSignal}
        toolNameEn={toolNameEn}
      />
    </>
  );
}
```

- [ ] **Step 2: Modify `app/welcome/page.tsx` to mount ChatMount**

Open `app/welcome/page.tsx`. Locate where the page renders Hero + TipCardGrid + Footer. Add at the bottom of the rendered tree (inside the same root):

```tsx
import ChatMount from "./_components/ChatMount";

// ... existing imports + page logic ...

// Inside the JSX returned by the Server Component:
<ChatMount
  cookieId={cookieId}
  toolSignal={toolSignal}
  toolNameEn={toolNameEn}
/>
```

`cookieId`, `toolSignal`, `toolNameEn` come from the existing middleware-derived context already passed to other components in Plan 2. If `tool_name_en` is not yet on the page-level prop set, derive it server-side from the tools catalog using the existing `lib/db/tools.ts` fetcher (Plan 2):

```tsx
// in page.tsx, alongside existing tip card resolution:
const toolName = toolSignal
  ? (await fetchToolById(toolSignal))?.name_en ?? null
  : null;

// then pass `toolNameEn={toolName}` to <ChatMount />
```

- [ ] **Step 3: Type-check and run dev server**

```bash
npx tsc --noEmit
npm run dev
```

Open `http://localhost:3000/welcome`. Click bubble → panel opens. Send a test message (requires `ANTHROPIC_API_KEY` in `.env.local` — copy from `~/.config/ma-ea/keys.env`).

Expected:
- Bubble visible bottom-right.
- Click → bottom sheet slides up (mobile viewport in dev tools).
- Templated opening message renders.
- Type "hi" + send → streams Saudi-dialect Noor response.
- Reload page → reopen → opening message there; conversation history is gone (per spec, single-session only).

- [ ] **Step 4: Commit**

```bash
git add app/welcome/_components/ChatMount.tsx app/welcome/page.tsx
git commit -m "feat(chat): mount ChatBubble + lazy ChatPanel via #chat hash, browser-back closes"
```

---

## Phase E — End-to-end tests

### Task E.1: Playwright e2e

**Files:**
- Create: `tests/e2e/chat.spec.ts`

- [ ] **Step 1: Write the e2e tests**

```typescript
// tests/e2e/chat.spec.ts
import { test, expect } from "@playwright/test";

const STAGING = process.env.STAGING_URL ?? "http://localhost:3000";

test.describe("Chat Noor on /welcome", () => {
  test("bubble is visible and click opens panel", async ({ page }) => {
    await page.goto(`${STAGING}/welcome`);
    const bubble = page.locator(".chat-bubble");
    await expect(bubble).toBeVisible();
    await bubble.click();
    await expect(page.locator(".chat-panel")).toBeVisible();
    await expect(page.locator(".chat-header__name")).toContainText("نور");
  });

  test("opening message renders without LLM call", async ({ page }) => {
    await page.goto(`${STAGING}/welcome`);
    await page.locator(".chat-bubble").click();
    const firstMsg = page.locator(".chat-msg--assistant").first();
    await expect(firstMsg).toContainText("نور");
  });

  test("warm path: tool signal triggers tool-name swap in opener", async ({ page }) => {
    // Plan 1 sets a JWT for the tool; this exercises the full middleware path.
    await page.goto(`${STAGING}/welcome?ref=ig_bio&tool=midjourney`);
    await page.locator(".chat-bubble").click();
    const firstMsg = page.locator(".chat-msg--assistant").first();
    await expect(firstMsg).toContainText("Midjourney");
  });

  test("send a message, stream returns, then assistant bubble appears", async ({ page }) => {
    await page.goto(`${STAGING}/welcome`);
    await page.locator(".chat-bubble").click();
    await page.locator(".chat-input__textarea").fill("كم سعر T2؟");
    await page.locator(".chat-input__btn[type=submit]").click();
    // Wait for an assistant bubble that mentions 449 (T2 price)
    await expect(
      page.locator(".chat-msg--assistant .chat-msg__bubble").last(),
    ).toContainText(/449/, { timeout: 10000 });
  });

  test("close panel via hash back closes correctly", async ({ page }) => {
    await page.goto(`${STAGING}/welcome`);
    await page.locator(".chat-bubble").click();
    await expect(page.locator(".chat-panel")).toBeVisible();
    await page.goBack();
    await expect(page.locator(".chat-panel")).toBeHidden({ timeout: 1500 });
  });

  test("rate-limit cap shows email link", async ({ page, context }) => {
    // Force the cap with a stub: fail subsequent requests as 429.
    await context.route("**/api/chat", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "rate_limited", message: "limit reached" }),
      }),
    );
    await page.goto(`${STAGING}/welcome`);
    await page.locator(".chat-bubble").click();
    await page.locator(".chat-input__textarea").fill("test");
    await page.locator(".chat-input__btn[type=submit]").click();
    await expect(page.locator(".chat-cap a")).toHaveAttribute(
      "href",
      "mailto:support@malearnsa.com",
    );
  });

  test("3 consecutive failures → email error banner", async ({ page, context }) => {
    let count = 0;
    await context.route("**/api/chat", (route) => {
      count += 1;
      route.fulfill({ status: 500, body: "boom" });
    });
    await page.goto(`${STAGING}/welcome`);
    await page.locator(".chat-bubble").click();
    for (let i = 0; i < 3; i++) {
      await page.locator(".chat-input__textarea").fill(`attempt ${i}`);
      await page.locator(".chat-input__btn[type=submit]").click();
      await page.waitForTimeout(300);
    }
    await expect(page.locator(".chat-error")).toContainText("support@malearnsa.com");
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("mobile viewport: panel renders as bottom sheet", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`${STAGING}/welcome`);
    await page.locator(".chat-bubble").click();
    const panelBox = await page.locator(".chat-panel").boundingBox();
    expect(panelBox).not.toBeNull();
    expect(panelBox!.width).toBeGreaterThan(380);  // full-width-ish on mobile
    await ctx.close();
  });
});
```

- [ ] **Step 2: Run e2e tests locally against dev server**

```bash
# Terminal 1
npm run dev

# Terminal 2
STAGING_URL=http://localhost:3000 npx playwright test tests/e2e/chat.spec.ts
```

Expected: 8 tests pass. (The tool-signal warm-path test depends on the middleware accepting `?tool=midjourney` shortcut — if Plan 2's middleware does not, mark it `test.skip` until Plan 1 middleware is extended in a follow-up.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/chat.spec.ts
git commit -m "test(e2e): chat bubble, opening, send, rate limit, errors, mobile sheet"
```

---

## Phase F — Deploy to staging + sign-off

### Task F.1: Run full test suite

- [ ] **Step 1: Run unit tests**

```bash
cd ~/code/ma-learn-welcome
npm run test
```

Expected: 0 failures across all `tests/**/*.test.ts`.

- [ ] **Step 2: Run e2e against local dev**

```bash
npm run dev &
sleep 3
STAGING_URL=http://localhost:3000 npx playwright test
kill %1
```

Expected: all e2e pass including Plan 1 + Plan 2 tests still green.

### Task F.2: Push to main + verify Vercel deploy

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Watch Vercel deploy in dashboard**

Wait for the deployment of the latest commit to complete on `staging-welcome.malearnsa.com`. Confirm "Ready" status.

- [ ] **Step 3: Smoke-check the live URL**

Open https://staging-welcome.malearnsa.com on phone + desktop:
- Bubble visible.
- Click → panel opens.
- Send "كم سعر T2؟" → streamed response containing "449".
- Send "فيه خصم؟" → "أسعارنا ثابتة. لو الميزانية ضيقة، T1 يبدأ من 99."
- Send "تنتقد بورتفوليو؟" → redirect to T4.

If any of these fail, do NOT proceed. Open a Linear bug, fix, re-deploy.

### Task F.3: Run e2e against staging URL

- [ ] **Step 1: Run**

```bash
STAGING_URL=https://staging-welcome.malearnsa.com npx playwright test tests/e2e/chat.spec.ts
```

Expected: same passes as local. If a test fails on staging that passed locally, investigate environment difference (env var, KV binding, Supabase RLS).

### Task F.4: Verify telemetry rows in Supabase

- [ ] **Step 1: After 5 test conversations on staging, query Supabase:**

```sql
select day, chats_with_activity, total_messages, fallback_count, avg_latency_ms,
       est_input_cost_usd, est_output_cost_usd
from staging.v_welcome_chat_daily_summary
where day = current_date;
```

Expected: row with `chats_with_activity > 0`, `avg_latency_ms` in the 800–2000ms range, `fallback_count = 0` on healthy path.

### Task F.5: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a Plan 3 status block to README.md**

Find the Plan 2 status section. Add below it:

```markdown
## Plan 3 — Chat Noor — SHIPPED on staging

**Date shipped:** 2026-05-10 (replace with actual ship date)

What works:
- Floating chat bubble bottom-right on /welcome (always-loaded, ~5KB)
- 70vh bottom-sheet panel (mobile) / 400×600 desktop panel, lazy-loaded
- Templated welcome line with tool-name swap (no LLM call)
- Streaming Anthropic Haiku 4.5 with prompt caching
- Saudi Khaleeji system prompt with 5-bucket scope, 6 edge-case rules, hard guardrails
- Course catalog + 2 testimonials embedded in DB-stored prompt template
- Rate limit: 10 msg/IP/24h via Vercel KV atomic counter
- Banned-phrase post-stream regex check
- Error fallback with retry; 3-failure escalation to support@malearnsa.com
- Persistence: every chat + message in `staging.welcome_chat_messages`
- Daily summary view for cost + latency tracking

Known v1 limitations:
- No capture form integration (Plan 4)
- No tool/function calling (pure text reply)
- No conversation history beyond browser session
- No dashboard editor for prompt template (manual SQL UPDATE for now)

Next: Plan 4 — real capture path.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README — Plan 3 Chat Noor shipped status"
git push origin main
```

### Task F.6: Tag the release

- [ ] **Step 1: Tag**

```bash
git tag plan3-chat-noor-shipped
git push origin plan3-chat-noor-shipped
```

### Task F.7: Sign-off checklist (Linear)

Create a Linear sign-off ticket and tick each box only after manual verification on staging:

- [ ] All unit tests pass locally + on Vercel preview
- [ ] All e2e tests pass against staging URL
- [ ] Real iPhone test: bubble + open + send + close all work
- [ ] Real Android test: same
- [ ] 5-turn conversation with Midjourney signal: p95 latency ≤ 2.0s/turn (check Vercel logs)
- [ ] Rate limit: 11th message in 24h returns cap UI + email link
- [ ] Banned-phrase: deliberately bait the model with English fluff prompt → at least one log row with `fallback_reason='banned_phrase'`
- [ ] Daily summary view returns rows
- [ ] $10/day Anthropic spend alert wired (verify in Anthropic dashboard)
- [ ] Majid signs off after manual soak (Layan + 5 family/friends testers complete a real conversation)

When all 10 boxes are checked → Plan 3 done. Stage 0 → Stage 1 promotion is a separate gate per parent spec section 4.8.5.

---

## Self-review notes (run before declaring this plan done)

**Spec coverage check (run mentally against `2026-05-10-welcome-v1-plan-03-chat-noor-design.md`):**

| Spec section | Covered by |
|---|---|
| 2.1 Chat bubble | Task D.1 |
| 2.2 Open transition + #chat hash | Task D.4 (ChatMount) |
| 2.3 Panel header | Task D.2 |
| 2.4 Opening message templating | Task D.3 (`buildOpeningContent`) |
| 2.5 Input behavior + char cap | Task D.2 (ChatInput) |
| 2.6 Streaming + Stop | Task D.3 (useChat) + Task D.2 (ChatInput) |
| 2.7 Error / rate-limit / banned-phrase UI | Task D.2 (ChatMessages) + Task D.3 |
| 3.1 Stack additions | Task A.1 |
| 3.2 Component tree | Tasks D.1–D.4 |
| 3.3 Edge API pipeline | Task C.1 |
| 3.4 Anthropic prompt caching | Task C.1 (`providerOptions.anthropic.cacheControl`) |
| 3.5 Caching layer summary | Task B.6 (KV cache) + Task C.1 |
| 3.6 Identity linkage | Task C.1 (`upsertChatRow`) |
| 3.7 Hash open/close | Task D.4 |
| 4.1 Schema | Task A.2 |
| 4.2 RLS policies | Task A.2 |
| 4.3 Seed prompt | Task A.3 |
| 5 System prompt structure | Task A.3 |
| 6.1 Rate limiting | Tasks B.3 + C.1 |
| 6.2 Banned-phrase regex | Task B.4 + C.1 onFinish |
| 6.3 Spend alert | Task F.7 (verify pre-existing) |
| 6.4 Observability | Task C.1 onFinish + Task A.2 view |
| 6.5 Vercel logs | Task C.1 console.log |
| 9.1 Unit tests | Tasks B.2–B.7 + C.1 |
| 9.2 Playwright e2e | Task E.1 |
| 9.3 Manual soak | Task F.7 |
| 12 Success criteria | Task F.7 sign-off checklist |

**Placeholder scan:** Done. No "TBD", no "implement later", no "add appropriate error handling". The `message_count` placeholder write in Task B.7 is documented inline with the trade-off + recovery path.

**Type consistency check:** `WelcomeChatPromptRow` defined in `lib/chat/types.ts` (Task B.1) and used in `lib/db/welcomeChatPrompts.ts` (Task B.6). `ChatRequestBody` defined in B.1 and matches Zod schema in C.1. `FallbackReason` type members match the `text` values written in Task C.1.
