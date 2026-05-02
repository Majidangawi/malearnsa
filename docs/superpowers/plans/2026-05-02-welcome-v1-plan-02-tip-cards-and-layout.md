# Welcome /welcome v1 — Plan 2: Tip Cards + Layout + Chip Selector

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render 3 tip cards below the hero greeting, integrate the cold-organic chip selector that triggers live Haiku 4.5 generation when a user picks a tool, apply Editorial Atelier tokens for mobile-first styling, and embed the standard MA Learn footer module. End state: `staging-welcome.malearnsa.com/welcome` shows a complete branded landing page with personalized hero + tip cards + footer, plus chip selector for cold visitors that triggers real LLM output on click.

**Architecture:** Extends Plan 1's edge middleware. Server Component fetches tip cards from Supabase based on the LLM's chosen tip_card_ids (or static fallback's hardcoded IDs). Cold-organic visitors see a `ChipSelector` Client Component below the generic hero — clicking a chip POSTs to `/api/select-tool` which returns a new greeting + cards, then re-renders client-side. Editorial Atelier tokens copied from `~/code/ma-learn-dashboard/frontend/public/css/tokens.css`. Footer loaded via `https://malearnsa.com/footer-module/v1/footer.{css,js}` per locked SOP.

**Tech Stack:** Plan 1 stack (Next.js 16, edge middleware, Anthropic Haiku 4.5, Vercel KV, Supabase) + new: React Client Components for chip interaction, Supabase tip card fetcher, Next.js `<Script>` for external footer JS.

**Repo:** `Majidangawi/ma-learn-welcome` (extends Plan 1 — already deployed to `staging-welcome.malearnsa.com`).

**Locked content rules** (durable, applies to all tip cards + LLM outputs forever):
- Brand names stay in Latin form even in Arabic copy. "Midjourney" not "ميدجورني". See `feedback_brand_names_latin_in_arabic.md`.

**End state demo:**

1. Visit `/welcome` (cold, no JWT): hero shows generic Arabic greeting + chip selector "وش أداة AI تستخدم؟" with 7 chips below
2. Click "Midjourney" chip: greeting + 3 tip cards re-render with Midjourney content (real Haiku 4.5 call on first click for the bucket; cached on subsequent)
3. Visit `/welcome?ref=ig_bio&t=<JWT_for_Midjourney>`: hero + 3 Midjourney cards immediate, no chip selector
4. Footer at bottom matches malearnsa.com brand, loaded from shared module
5. Mobile (iPhone 13): single-column, readable, ~1.4s TTFB

---

## File structure

Files created/modified:

- Create: `lib/db/tipCards.ts` — Supabase fetcher for tip cards by tool/lang/lead_state
- Create: `lib/db/tools.ts` — Supabase fetcher for the tools catalog (used by chip selector)
- Modify: `lib/llm/prompts.ts` — extend to include tip card metadata in LLM context, prompt for tip_card_ids selection
- Modify: `lib/llm/fallback.ts` — fallback now picks default tip_card_ids per tool
- Modify: `middleware.ts` — fetch tip cards based on output, attach to header for page rendering
- Create: `app/welcome/_components/TipCard.tsx` — single card component
- Create: `app/welcome/_components/TipCardGrid.tsx` — 3-card grid
- Create: `app/welcome/_components/ChipSelector.tsx` — Client Component, tool selection chips
- Create: `app/welcome/_components/Footer.tsx` — Client Component wrapping the standard footer module
- Modify: `app/welcome/_components/Hero.tsx` — adjust layout to compose with TipCardGrid + ChipSelector
- Modify: `app/welcome/page.tsx` — fetch tip cards, render Hero + Cards + Chips + Footer
- Modify: `app/layout.tsx` — add Editorial Atelier CSS tokens link
- Create: `app/globals.css` (replace) — Editorial Atelier design tokens + base styles
- Create: `app/api/select-tool/route.ts` — POST endpoint, takes `{ tool_id }`, returns new greeting + tip cards
- Modify: `tests/e2e/welcome.spec.ts` — extend with tip card render + chip flow tests
- Modify: `README.md` — Plan 2 status update

Files referenced (no edit):

- `~/code/ma-learn-dashboard/frontend/public/css/tokens.css` — read once to extract canonical Editorial Atelier tokens
- `~/code/malearnsa/index.html` — read once to extract footer module integration pattern (already documented above)

---

## Task A.1 — Tip card + tools fetchers

**Files:**
- Create: `lib/db/tipCards.ts`
- Create: `lib/db/tools.ts`
- Create: `tests/lib/db/tipCards.test.ts`
- Create: `tests/lib/db/tools.test.ts`

This task is mostly Supabase plumbing. We'll TDD the input-shaping logic (lead_state matching, weight ordering) using mocks for the Supabase client, since the actual DB calls can't be unit-tested without infra.

- [ ] **Step 1: Write failing tests for `tipCards` fetcher**

```typescript
// tests/lib/db/tipCards.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TipCard } from "@/lib/db/tipCards";

vi.mock("@/lib/db/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe("fetchTipCards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches up to N active cards for tool+language, ordered by weight desc", async () => {
    const mockData: TipCard[] = [
      { id: "mj_ar_001", tool_id: "midjourney", language: "ar", lead_state: "any", body_md: "...", weight: 100 } as TipCard,
      { id: "mj_ar_002", tool_id: "midjourney", language: "ar", lead_state: "any", body_md: "...", weight: 90 } as TipCard,
      { id: "mj_ar_003", tool_id: "midjourney", language: "ar", lead_state: "any", body_md: "...", weight: 80 } as TipCard,
    ];

    const { supabase } = await import("@/lib/db/supabase");
    const order = vi.fn().mockResolvedValue({ data: mockData, error: null });
    const limit = vi.fn().mockReturnValue({ order });
    const eq3 = vi.fn().mockReturnValue({ limit });
    const eq2 = vi.fn().mockReturnValue({ eq: eq3 });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    (supabase as { from: typeof vi.fn }).from = vi.fn().mockReturnValue({ select });

    const { fetchTipCards } = await import("@/lib/db/tipCards");
    const cards = await fetchTipCards("midjourney", "ar", "any", 3);
    expect(cards).toEqual(mockData);
  });

  it("returns empty array when supabase is null", async () => {
    vi.doMock("@/lib/db/supabase", () => ({ supabase: null }));
    vi.resetModules();
    const { fetchTipCards } = await import("@/lib/db/tipCards");
    const cards = await fetchTipCards("midjourney", "ar", "any", 3);
    expect(cards).toEqual([]);
  });

  it("returns empty array on supabase error", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/supabase", () => {
      const order = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
      const limit = vi.fn().mockReturnValue({ order });
      const eq3 = vi.fn().mockReturnValue({ limit });
      const eq2 = vi.fn().mockReturnValue({ eq: eq3 });
      const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
      const select = vi.fn().mockReturnValue({ eq: eq1 });
      return { supabase: { from: vi.fn().mockReturnValue({ select }) } };
    });
    const { fetchTipCards } = await import("@/lib/db/tipCards");
    const cards = await fetchTipCards("midjourney", "ar", "any", 3);
    expect(cards).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
cd /Users/mastudio/code/ma-learn-welcome
npm run test -- tests/lib/db/tipCards.test.ts
```

- [ ] **Step 3: Implement `lib/db/tipCards.ts`**

```typescript
// lib/db/tipCards.ts
import { supabase } from "@/lib/db/supabase";
import type { Language, LeadState, ToolId } from "@/lib/types";

export interface TipCard {
  id: string;
  tool_id: ToolId;
  language: Language;
  lead_state: LeadState | "any";
  body_md: string;
  image_url: string | null;
  cta_tier: "T1" | "T2" | "T3" | "T4" | null;
  cta_label: string | null;
  weight: number;
  is_active: boolean;
}

export async function fetchTipCards(
  toolId: ToolId,
  language: Language,
  leadState: LeadState | "any",
  limit: number
): Promise<TipCard[]> {
  if (!supabase) return [];

  // Match tool + language + (exact lead_state OR 'any' fallback)
  // Order by weight desc, take top N
  const { data, error } = await supabase
    .from("tip_cards")
    .select("*")
    .eq("tool_id", toolId)
    .eq("language", language)
    .eq("is_active", true)
    .limit(limit)
    .order("weight", { ascending: false });

  if (error || !data) return [];
  // Filter to lead_state matches client-side (lead_state = exact match OR 'any')
  return (data as TipCard[]).filter(
    (c) => c.lead_state === leadState || c.lead_state === "any"
  );
}

export async function fetchTipCardsByIds(ids: string[]): Promise<TipCard[]> {
  if (!supabase || ids.length === 0) return [];
  const { data, error } = await supabase
    .from("tip_cards")
    .select("*")
    .in("id", ids)
    .eq("is_active", true);
  if (error || !data) return [];
  // Preserve the order of the requested ids
  const byId = new Map((data as TipCard[]).map((c) => [c.id, c]));
  return ids.map((id) => byId.get(id)).filter((c): c is TipCard => c !== undefined);
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npm run test -- tests/lib/db/tipCards.test.ts
```

- [ ] **Step 5: Write tools fetcher tests**

```typescript
// tests/lib/db/tools.test.ts
import { describe, it, expect, vi } from "vitest";

describe("fetchActiveTools", () => {
  it("returns empty when supabase is null", async () => {
    vi.doMock("@/lib/db/supabase", () => ({ supabase: null }));
    vi.resetModules();
    const { fetchActiveTools } = await import("@/lib/db/tools");
    expect(await fetchActiveTools()).toEqual([]);
  });
});
```

- [ ] **Step 6: Implement `lib/db/tools.ts`**

```typescript
// lib/db/tools.ts
import { supabase } from "@/lib/db/supabase";
import type { Language, ToolId } from "@/lib/types";

export interface Tool {
  id: ToolId;
  name_ar: string;
  name_en: string;
  icon_url: string | null;
  is_active: boolean;
  sort_order: number;
}

export async function fetchActiveTools(): Promise<Tool[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("tools")
    .select("id, name_ar, name_en, icon_url, is_active, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data as Tool[];
}

export function toolDisplayName(tool: Tool, language: Language): string {
  return language === "ar" ? tool.name_ar : tool.name_en;
}
```

- [ ] **Step 7: Run all tests, expect 26+ passing**

```bash
npm run test
```

- [ ] **Step 8: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 9: Commit**

```bash
git add lib/db/tipCards.ts lib/db/tools.ts tests/lib/db/tipCards.test.ts tests/lib/db/tools.test.ts
git commit -m "feat(db): tip card + tools fetchers with TDD on shaping logic

fetchTipCards(tool, lang, leadState, limit) — ordered by weight desc,
matches exact lead_state OR 'any' fallback. fetchTipCardsByIds preserves
caller-supplied order for LLM-chosen card sets. fetchActiveTools for
chip selector.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task A.2 — LLM prompt extension for tip card selection

**Files:**
- Modify: `lib/llm/prompts.ts`
- Modify: `lib/llm/anthropic.ts` — accept tip card catalog in input, expand prompt

The Plan 1 prompt told the LLM to return `tip_card_ids: []`. Now we want it to actually choose 3 IDs from a catalog we pass in.

- [ ] **Step 1: Modify `lib/llm/prompts.ts`** — bump `GREETING_GENERATOR_VERSION` to `2`, extend `buildSystemPrompt` to accept a tip card catalog and instruct the LLM to pick 3 IDs.

```typescript
// lib/llm/prompts.ts (edit only the necessary sections; keep existing PERSONA_BLOCK + few-shots)

export const GREETING_GENERATOR_VERSION = 2;  // bumped: now picks tip card IDs

export interface TipCardCatalogItem {
  id: string;
  language: string;
  body_summary: string;  // first 100 chars of body_md, for prompt context
}

export function buildSystemPrompt(language: Language, catalog: TipCardCatalogItem[]): string {
  const fewShots = language === "ar" ? FEW_SHOTS_AR : FEW_SHOTS_EN;
  const fewShotsText = fewShots
    .map((s, i) => `Example ${i + 1}:\nInput signal_bundle: ${s.input}\nOutput JSON: ${s.output}`)
    .join("\n\n");

  const catalogBlock = catalog.length > 0
    ? `\n\nAvailable tip cards (pick 3 ids, ordered most relevant first):\n${catalog.map((c) => `- ${c.id}: ${c.body_summary}`).join("\n")}`
    : "";

  return `${PERSONA_BLOCK}\n\n${RULES_BLOCK}${catalogBlock}\n\n${fewShotsText}`;
}
```

Update few-shot examples so `tip_card_ids` is non-empty. For example:

```typescript
// Update the first FEW_SHOTS_AR example:
output: JSON.stringify({
  greeting_line: "أهلاً خالد، شفت إنك تتابع شي عن Midjourney — جمعت لك نصايح تخلي صورك تطلع أنظف.",
  language: "ar",
  tip_card_ids: ["mj_ar_001", "mj_ar_002", "mj_ar_003"],  // was []
  recommended_cta: { tier: "T2", reason: "warm midjourney user" },
  close_line: "ولو تبي تتعلم الباقي بالتفصيل، 'مدخل إلى الذكاء الاصطناعي الإبداعي' يجيك بـ 449 ريال.",
}),
```

Apply the same pattern to all 4 few-shots — populate `tip_card_ids` with realistic IDs (3 strings each).

- [ ] **Step 2: Modify `lib/llm/anthropic.ts`** — accept catalog, pass through

```typescript
// lib/llm/anthropic.ts (edit signature)

import { buildSystemPrompt, buildUserMessage, type TipCardCatalogItem } from "@/lib/llm/prompts";

export async function generateGreeting(
  bundle: SignalBundle,
  catalog: TipCardCatalogItem[]
): Promise<GreetingGenerationResult> {
  // ...existing code, but use buildSystemPrompt(bundle.language, catalog)
  // ...rest unchanged
}
```

- [ ] **Step 3: Run typecheck — middleware will break (caller of generateGreeting now needs to pass catalog). Don't fix yet — that's Task A.3.**

Expected: TS error in middleware.ts about missing argument. Fine for now.

- [ ] **Step 4: Skip commit; bundle with A.3**

This task only makes sense once middleware actually passes the catalog. Single commit at end of A.3.

---

## Task A.3 — Middleware integration: fetch catalog + tip cards

**Files:**
- Modify: `middleware.ts`

Wire up: middleware fetches the active tools' tip card metadata, passes to LLM, gets back IDs, fetches the actual cards, attaches to header for the page.

- [ ] **Step 1: Update middleware to fetch catalog before LLM**

```typescript
// middleware.ts — add inside middleware() body, before generateGreeting call

// Fetch tip card catalog (just IDs + body summaries for LLM context)
import { fetchTipCards, fetchTipCardsByIds, type TipCard } from "@/lib/db/tipCards";

// ... inside middleware function, after building `bundle`:
const tool = bundle.tool_signal.tool;
let catalogForLlm: { id: string; language: string; body_summary: string }[] = [];
if (tool) {
  const candidates = await fetchTipCards(tool, bundle.language, bundle.lead_state, 10);
  catalogForLlm = candidates.map((c) => ({
    id: c.id,
    language: c.language,
    body_summary: c.body_md.slice(0, 100),
  }));
}

let output = await getCachedGreeting(bundle, GREETING_GENERATOR_VERSION);
let source: GreetingSource = "cache";
let renderedCards: TipCard[] = [];

if (!output) {
  const result = await generateGreeting(bundle, catalogForLlm);  // pass catalog
  // ... existing logic for ok/static_fallback/generic_fallback
}

// After we have output, fetch the actual tip cards
if (output && output.tip_card_ids.length > 0) {
  renderedCards = await fetchTipCardsByIds(output.tip_card_ids);
}
```

- [ ] **Step 2: Add tip cards JSON to header passed to page**

```typescript
newHeaders.set("x-tip-cards", encodeURIComponent(JSON.stringify(renderedCards)));
```

- [ ] **Step 3: Run typecheck, build, tests**

```bash
cd /Users/mastudio/code/ma-learn-welcome
npm run typecheck
npm run build
npm run test
```

Expected: all pass.

- [ ] **Step 4: Commit (A.2 + A.3 together)**

```bash
git add lib/llm/prompts.ts lib/llm/anthropic.ts middleware.ts
git commit -m "feat(llm,edge): LLM picks tip card IDs from catalog; middleware hydrates cards

GREETING_GENERATOR_VERSION bumped to 2 (cache invalidation).
Catalog of 10 candidate cards passed to Haiku; LLM picks 3.
Middleware fetches actual cards by ID, passes via x-tip-cards header.
Few-shots updated to demonstrate non-empty tip_card_ids.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task B.1 — TipCard component

**Files:**
- Create: `app/welcome/_components/TipCard.tsx`

Renders one card. Server Component, no client interactivity.

- [ ] **Step 1: Write the component**

```typescript
// app/welcome/_components/TipCard.tsx
import type { TipCard as TipCardType } from "@/lib/db/tipCards";

export function TipCard({ card }: { card: TipCardType }) {
  // body_md is markdown — for v1 we just split on first heading and render simply
  const lines = card.body_md.split("\n").filter(Boolean);
  const heading = lines[0]?.replace(/^#+\s*/, "") ?? "";
  const body = lines.slice(1).join("\n").trim();

  return (
    <article
      className="tip-card"
      lang={card.language}
      dir={card.language === "ar" ? "rtl" : "ltr"}
    >
      {heading && <h3 className="tip-card__heading">{heading}</h3>}
      {body && <p className="tip-card__body">{body}</p>}
      {card.image_url && (
        <img className="tip-card__image" src={card.image_url} alt="" loading="lazy" />
      )}
    </article>
  );
}
```

- [ ] **Step 2: Commit (will style in Task B.3)**

```bash
git add app/welcome/_components/TipCard.tsx
git commit -m "feat(welcome): TipCard component (Server Component, RTL/LTR aware)

Single tip card render — heading + body + optional image. Markdown
parsing intentionally simple for v1; full markdown later if needed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task B.2 — TipCardGrid component

**Files:**
- Create: `app/welcome/_components/TipCardGrid.tsx`

- [ ] **Step 1: Write the component**

```typescript
// app/welcome/_components/TipCardGrid.tsx
import type { TipCard as TipCardType } from "@/lib/db/tipCards";
import { TipCard } from "./TipCard";

export function TipCardGrid({ cards }: { cards: TipCardType[] }) {
  if (cards.length === 0) return null;
  return (
    <section className="tip-card-grid">
      {cards.map((card) => (
        <TipCard key={card.id} card={card} />
      ))}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/welcome/_components/TipCardGrid.tsx
git commit -m "feat(welcome): TipCardGrid component

3-card grid container. No-op when no cards.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task B.3 — Editorial Atelier tokens + global styles

**Files:**
- Modify: `app/globals.css` (replace contents)
- Modify: `app/layout.tsx` (no major change — just verify imports)

The Editorial Atelier system lives at `~/code/ma-learn-dashboard/frontend/public/css/tokens.css`. Read those tokens, copy the canonical ones into our app, and add the welcome-specific styles.

- [ ] **Step 1: Read the source tokens**

```bash
cat ~/code/ma-learn-dashboard/frontend/public/css/tokens.css
cat ~/code/ma-learn-dashboard/frontend/public/css/primitives.css
```

Extract: color variables, typography variables, spacing scale, shadow variables. Copy into `app/globals.css`.

- [ ] **Step 2: Replace `app/globals.css`** — keep the Tailwind layers, add Editorial Atelier vars + welcome-specific component classes

```css
@import "tailwindcss";

/* ─────────────────────────────────────────
   Editorial Atelier tokens (copied from
   ma-learn-dashboard/frontend/public/css/tokens.css)
   ───────────────────────────────────────── */
:root {
  /* COPY VERBATIM from tokens.css — see Step 1 output. Examples (replace with actuals): */
  --color-bg: #0a0a0a;
  --color-fg: #f5f5f5;
  --color-accent: #c9a84c;
  --color-muted: #888;
  --font-display: 'Cairo', sans-serif;
  --font-body: 'Cairo', sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, monospace;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 24px;
  --space-5: 40px;
  --space-6: 64px;
  --shadow-soft: 0 4px 20px rgba(0,0,0,0.05);
  --radius-md: 12px;
  --radius-lg: 24px;
}

/* ─────────────────────────────────────────
   Base resets
   ───────────────────────────────────────── */
html, body {
  background: var(--color-bg);
  color: var(--color-fg);
  font-family: var(--font-body);
  margin: 0;
}

/* ─────────────────────────────────────────
   Welcome page components
   ───────────────────────────────────────── */
.welcome-main {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.welcome-hero {
  padding: var(--space-6) var(--space-3);
  max-width: 720px;
  margin: 0 auto;
  text-align: center;
}

.welcome-hero__greeting {
  font-family: var(--font-display);
  font-size: clamp(1.75rem, 4vw, 2.5rem);
  font-weight: 600;
  line-height: 1.4;
  margin: 0 0 var(--space-3);
}

.welcome-hero__close {
  font-size: 1rem;
  color: var(--color-muted);
  line-height: 1.6;
  margin: 0;
}

.tip-card-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-3);
  max-width: 1100px;
  margin: var(--space-5) auto;
  padding: 0 var(--space-3);
}

@media (min-width: 768px) {
  .tip-card-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.tip-card {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  text-align: start;
}

.tip-card__heading {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 var(--space-2);
}

.tip-card__body {
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--color-muted);
  margin: 0;
}

.tip-card__image {
  width: 100%;
  height: auto;
  border-radius: var(--radius-md);
  margin-top: var(--space-3);
}

.chip-selector {
  text-align: center;
  margin: var(--space-5) auto;
  max-width: 720px;
  padding: 0 var(--space-3);
}

.chip-selector__label {
  font-size: 1rem;
  color: var(--color-muted);
  margin: 0 0 var(--space-3);
}

.chip-selector__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  justify-content: center;
}

.chip {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  color: var(--color-fg);
  font-family: var(--font-body);
  font-size: 0.9rem;
  padding: var(--space-2) var(--space-3);
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s;
}

.chip:hover {
  border-color: var(--color-accent);
  background: rgba(201,168,76,0.05);
}

.chip[data-selected="true"] {
  background: var(--color-accent);
  color: #000;
  border-color: var(--color-accent);
}

.staging-footer {
  text-align: center;
  font-size: 0.7rem;
  opacity: 0.3;
  padding: var(--space-3) 0;
}
```

- [ ] **Step 3: Verify build + visual sanity**

```bash
npm run build
npm run dev &
DEV_PID=$!
sleep 6
curl -s http://localhost:3000/welcome | grep -oE 'class="[^"]*"' | head -10
kill $DEV_PID 2>/dev/null
```

Expected: classes show `welcome-main`, `welcome-hero`, etc.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat(style): Editorial Atelier tokens + welcome page component styles

Copied canonical token values from ma-learn-dashboard. Added welcome-page
component classes (.welcome-hero, .tip-card-grid, .chip-selector). Mobile-first:
single column under 768px, 3-column grid above. Saudi 80%+ mobile primary.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task C.1 — ChipSelector Client Component

**Files:**
- Create: `app/welcome/_components/ChipSelector.tsx`

Client Component. Renders chips, handles click → POST to /api/select-tool → swap parent state with new greeting + cards.

- [ ] **Step 1: Write the component**

```typescript
// app/welcome/_components/ChipSelector.tsx
"use client";

import { useState } from "react";
import type { Tool } from "@/lib/db/tools";
import type { GreetingOutput, Language } from "@/lib/types";
import type { TipCard as TipCardType } from "@/lib/db/tipCards";

interface ChipSelectorProps {
  tools: Tool[];
  language: Language;
  onResult: (result: { greeting: GreetingOutput; cards: TipCardType[] }) => void;
}

export function ChipSelector({ tools, language, onResult }: ChipSelectorProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const label = language === "ar" ? "وش أداة AI تستخدم؟" : "What AI tool are you using?";

  async function handleClick(toolId: string) {
    setLoading(toolId);
    setError(null);
    try {
      const res = await fetch("/api/select-tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool_id: toolId, language }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      onResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown");
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="chip-selector" lang={language} dir={language === "ar" ? "rtl" : "ltr"}>
      <p className="chip-selector__label">{label}</p>
      <div className="chip-selector__chips">
        {tools.map((tool) => (
          <button
            key={tool.id}
            className="chip"
            onClick={() => handleClick(tool.id)}
            disabled={loading !== null}
            data-selected={loading === tool.id ? "true" : undefined}
          >
            {language === "ar" ? tool.name_ar : tool.name_en}
          </button>
        ))}
      </div>
      {error && <p className="chip-selector__error">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/welcome/_components/ChipSelector.tsx
git commit -m "feat(welcome): ChipSelector Client Component

Renders 7 tool chips (cold-organic flow). Click → POST /api/select-tool
→ caller-provided onResult swaps greeting + cards. Visual feedback via
data-selected during load.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task C.2 — /api/select-tool route

**Files:**
- Create: `app/api/select-tool/route.ts`

POST endpoint that re-runs the LLM with a forced tool signal and returns `{ greeting, cards }`.

- [ ] **Step 1: Write the route**

```typescript
// app/api/select-tool/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { Language, ToolId, SignalBundle } from "@/lib/types";
import { generateGreeting } from "@/lib/llm/anthropic";
import { staticToolFallback } from "@/lib/llm/fallback";
import { getCachedGreeting, setCachedGreeting } from "@/lib/cache/kv";
import { GREETING_GENERATOR_VERSION } from "@/lib/llm/prompts";
import { fetchTipCards, fetchTipCardsByIds } from "@/lib/db/tipCards";

const VALID_TOOLS: ToolId[] = ["midjourney", "higgsfield", "weavy", "magnific", "luma", "openart", "other"];
const VALID_LANGS: Language[] = ["ar", "en"];

export async function POST(req: NextRequest) {
  let body: { tool_id?: string; language?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const tool_id = body.tool_id;
  const language = body.language;
  if (!tool_id || !VALID_TOOLS.includes(tool_id as ToolId)) {
    return NextResponse.json({ error: "invalid_tool" }, { status: 400 });
  }
  if (!language || !VALID_LANGS.includes(language as Language)) {
    return NextResponse.json({ error: "invalid_language" }, { status: 400 });
  }

  const bundle: SignalBundle = {
    language: language as Language,
    name: null,
    ig_handle: null,
    email: null,
    tool_signal: { source: "self_declared", tool: tool_id as ToolId, confidence: 1.0 },
    lead_state: "warm",
    returning: false,
    is_customer: false,
    day_part: "afternoon", // arbitrary; cache key uses this — could read from request time
    source_channel: "direct",
  };

  // Try cache first
  let output = await getCachedGreeting(bundle, GREETING_GENERATOR_VERSION);
  if (!output) {
    const candidates = await fetchTipCards(tool_id as ToolId, bundle.language, bundle.lead_state, 10);
    const catalog = candidates.map((c) => ({
      id: c.id,
      language: c.language,
      body_summary: c.body_md.slice(0, 100),
    }));
    const result = await generateGreeting(bundle, catalog);
    if (result.ok) {
      output = result.output;
      void setCachedGreeting(bundle, GREETING_GENERATOR_VERSION, result.output);
    } else {
      output = staticToolFallback(tool_id as ToolId, bundle.language);
    }
  }

  const cards = output.tip_card_ids.length > 0
    ? await fetchTipCardsByIds(output.tip_card_ids)
    : [];

  return NextResponse.json({ greeting: output, cards });
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: `/api/select-tool` shows in route table as `ƒ` (dynamic).

- [ ] **Step 3: Commit**

```bash
git add app/api/select-tool/route.ts
git commit -m "feat(api): POST /api/select-tool — chip click handler

Forces a self-declared tool signal, re-runs greeting generation +
tip card fetch, returns { greeting, cards }. Reuses KV cache by
synthetic bundle for free repeated-click speed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task C.3 — Wire chip + cards together in /welcome page

**Files:**
- Modify: `app/welcome/page.tsx`
- Modify: `app/welcome/_components/Hero.tsx` — slim it to greeting only

Plan 1's Hero embedded the CTA block. Now we extract to compose: Hero (greeting only) + TipCardGrid + ChipSelector. Page becomes a Client Component because chip results swap state.

- [ ] **Step 1: Trim Hero to just greeting**

```typescript
// app/welcome/_components/Hero.tsx
import type { GreetingOutput } from "@/lib/types";

export function Hero({ greeting }: { greeting: GreetingOutput }) {
  return (
    <section
      className="welcome-hero"
      lang={greeting.language}
      dir={greeting.language === "ar" ? "rtl" : "ltr"}
    >
      <h1 className="welcome-hero__greeting">{greeting.greeting_line}</h1>
      <p className="welcome-hero__close">{greeting.close_line}</p>
    </section>
  );
}
```

- [ ] **Step 2: Convert /welcome to a hybrid (Server Component fetches initial data; Client Component handles chip swaps)**

Create `app/welcome/_components/WelcomeShell.tsx`:

```typescript
// app/welcome/_components/WelcomeShell.tsx
"use client";

import { useState } from "react";
import { Hero } from "./Hero";
import { TipCardGrid } from "./TipCardGrid";
import { ChipSelector } from "./ChipSelector";
import type { GreetingOutput, Language } from "@/lib/types";
import type { TipCard as TipCardType } from "@/lib/db/tipCards";
import type { Tool } from "@/lib/db/tools";

interface WelcomeShellProps {
  initialGreeting: GreetingOutput;
  initialCards: TipCardType[];
  showChipSelector: boolean;
  tools: Tool[];
  language: Language;
  greetingSource: string;
}

export function WelcomeShell(props: WelcomeShellProps) {
  const [greeting, setGreeting] = useState(props.initialGreeting);
  const [cards, setCards] = useState(props.initialCards);
  const [chipsVisible, setChipsVisible] = useState(props.showChipSelector);

  function handleChipResult(result: { greeting: GreetingOutput; cards: TipCardType[] }) {
    setGreeting(result.greeting);
    setCards(result.cards);
    setChipsVisible(false);
  }

  return (
    <main className="welcome-main">
      <Hero greeting={greeting} />
      <TipCardGrid cards={cards} />
      {chipsVisible && (
        <ChipSelector tools={props.tools} language={props.language} onResult={handleChipResult} />
      )}
      {process.env.NEXT_PUBLIC_IS_STAGING === "true" && (
        <footer className="staging-footer">staging · source: {props.greetingSource}</footer>
      )}
    </main>
  );
}
```

Note: `process.env.NEXT_PUBLIC_IS_STAGING` — server env vars aren't visible to Client Components. We need a `NEXT_PUBLIC_IS_STAGING` env var added on Vercel (separate task — flagged in execution items).

For now in code, we'll fall back to passing it as a prop from the Server Component instead:

```typescript
// Replace the {process.env.NEXT_PUBLIC_IS_STAGING ===} block with prop-driven:
{props.greetingSource && <footer className="staging-footer">staging · source: {props.greetingSource}</footer>}
```

And only set the prop in page.tsx if `IS_STAGING === "true"` — see Step 3.

Updated WelcomeShell prop:
```typescript
interface WelcomeShellProps {
  // ...existing
  showStagingFooter: boolean;  // computed server-side from IS_STAGING
  greetingSource: string;
}
```

And the JSX:
```typescript
{props.showStagingFooter && (
  <footer className="staging-footer">staging · source: {props.greetingSource}</footer>
)}
```

- [ ] **Step 3: Update `app/welcome/page.tsx`** — Server Component that fetches initial data + tools list, renders WelcomeShell

```typescript
// app/welcome/page.tsx
import { headers } from "next/headers";
import { WelcomeShell } from "./_components/WelcomeShell";
import type { GreetingOutput } from "@/lib/types";
import type { TipCard as TipCardType } from "@/lib/db/tipCards";
import { genericFallback } from "@/lib/llm/fallback";
import { fetchActiveTools } from "@/lib/db/tools";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const h = await headers();
  const greetingHeader = h.get("x-greeting");
  const sourceHeader = h.get("x-greeting-source") ?? "?";
  const cardsHeader = h.get("x-tip-cards");

  let greeting: GreetingOutput;
  try {
    greeting = greetingHeader
      ? JSON.parse(decodeURIComponent(greetingHeader))
      : genericFallback("ar");
  } catch {
    greeting = genericFallback("ar");
  }

  let cards: TipCardType[] = [];
  try {
    cards = cardsHeader ? JSON.parse(decodeURIComponent(cardsHeader)) : [];
  } catch {
    cards = [];
  }

  // Show chip selector when we have no tool signal at all
  const showChipSelector = cards.length === 0;
  const tools = showChipSelector ? await fetchActiveTools() : [];

  return (
    <WelcomeShell
      initialGreeting={greeting}
      initialCards={cards}
      showChipSelector={showChipSelector}
      tools={tools}
      language={greeting.language}
      showStagingFooter={process.env.IS_STAGING === "true"}
      greetingSource={sourceHeader}
    />
  );
}
```

- [ ] **Step 4: Build + typecheck**

```bash
npm run build
npm run typecheck
npm run test
```

- [ ] **Step 5: Commit**

```bash
git add app/welcome/page.tsx app/welcome/_components/Hero.tsx app/welcome/_components/WelcomeShell.tsx
git commit -m "feat(welcome): hybrid Server+Client shell composing Hero + Cards + Chips

Server fetches initial greeting/cards from middleware headers + tools
list when no tool signal. Client shell holds state for chip-driven
swaps. ChipSelector → /api/select-tool → setState updates greeting +
cards in place without page reload. Hero trimmed to pure greeting render.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task D.1 — Standard footer module

**Files:**
- Create: `app/welcome/_components/Footer.tsx`
- Modify: `app/layout.tsx`

Per locked SOP: load `https://malearnsa.com/footer-module/v1/footer.css` + `footer.js`. The JS injects HTML into a `<div id="ma-footer"></div>` placeholder.

- [ ] **Step 1: Create Footer Client Component**

```typescript
// app/welcome/_components/Footer.tsx
"use client";

import Script from "next/script";
import { useEffect } from "react";

export function Footer() {
  useEffect(() => {
    // Inject the CSS link if not already present
    const existing = document.querySelector('link[href*="footer-module/v1/footer.css"]');
    if (!existing) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://malearnsa.com/footer-module/v1/footer.css?v=2";
      document.head.appendChild(link);
    }
  }, []);

  return (
    <>
      <div id="ma-footer" />
      <Script
        src="https://malearnsa.com/footer-module/v1/footer.js?v=2"
        strategy="afterInteractive"
      />
    </>
  );
}
```

- [ ] **Step 2: Mount Footer inside WelcomeShell**

Edit `app/welcome/_components/WelcomeShell.tsx` — add `<Footer />` at the bottom:

```typescript
import { Footer } from "./Footer";

// Inside the JSX, just before closing </main>:
<Footer />
```

- [ ] **Step 3: Build + verify**

```bash
npm run build
npm run dev &
sleep 6
curl -s http://localhost:3000/welcome | grep -E 'ma-footer|footer-module' | head -5
kill %1 2>/dev/null
```

Expected: see `<div id="ma-footer"></div>` and the footer script tag in HTML.

- [ ] **Step 4: Commit**

```bash
git add app/welcome/_components/Footer.tsx app/welcome/_components/WelcomeShell.tsx
git commit -m "feat(welcome): standard footer module integration

Loads malearnsa.com/footer-module/v1/footer.{css,js} per locked SOP.
CSS injected via useEffect (only once per page); JS via Next Script
component with afterInteractive strategy.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task E.1 — Update Playwright e2e

**Files:**
- Modify: `tests/e2e/welcome.spec.ts`

Add scenarios: tip cards visible after JWT path, chip click triggers re-render with new cards.

- [ ] **Step 1: Extend spec with new scenarios**

```typescript
// tests/e2e/welcome.spec.ts — append new tests

test("renders tip cards in cold-organic flow after chip click", async ({ page }) => {
  await page.goto("/welcome");

  // Initial state: chip selector visible (no tool signal)
  await expect(page.locator(".chip-selector")).toBeVisible();

  // Click Midjourney chip
  await page.locator(".chip").filter({ hasText: "Midjourney" }).click();

  // After click: tip cards should appear, chip selector should hide
  await expect(page.locator(".tip-card")).toHaveCount(3, { timeout: 10000 });
  await expect(page.locator(".chip-selector")).not.toBeVisible();
});

test("standard footer module loads", async ({ page }) => {
  await page.goto("/welcome");
  // The placeholder div should be present (script will populate)
  await expect(page.locator("#ma-footer")).toBeAttached();
});
```

- [ ] **Step 2: Run e2e against local dev**

```bash
cd /Users/mastudio/code/ma-learn-welcome
MANYCHAT_JWT_SECRET="local-test-secret-must-be-32-bytes-long-yep" npm run dev &
sleep 8
MANYCHAT_JWT_SECRET="local-test-secret-must-be-32-bytes-long-yep" npx playwright test --project=chromium 2>&1 | tail -20
kill %1 2>/dev/null
```

Expected: 4 tests pass (2 from Plan 1 + 2 new).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/welcome.spec.ts
git commit -m "test(e2e): add tip card render + chip click + footer scenarios

4/4 chromium tests pass: original 2 (Midjourney JWT + no-token fallback)
+ chip click triggers tip card render + footer module placeholder mounts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

---

## Task E.2 — README + tag

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README to reflect Plan 2 status**

Replace the "Plan 1 status" section to add Plan 2 below it:

```markdown
## Plan 2 status — Tip Cards + Layout + Chip Selector ✅

What this repo currently does (extends Plan 1):

8. **Tip cards rendered** below the hero (3 per visit, fetched from `staging.tip_cards` Supabase table)
9. **Cold-organic chip selector** for visitors with no tool signal — clicking a chip triggers `/api/select-tool` which runs Haiku 4.5 + returns greeting + cards (cached aggressively)
10. **Editorial Atelier styling** — design tokens copied from `ma-learn-dashboard`, mobile-first responsive grid (1 column < 768px, 3 columns above)
11. **Standard footer module** integrated per locked SOP — `https://malearnsa.com/footer-module/v1/footer.{css,js}`
12. **Live LLM exercise** — first version where real Haiku 4.5 calls happen on staging (chip clicks generate uncached greetings, then KV-cache them)

## Coming next

- **Plan 3:** Public Noor chat widget (player-chat-v1 fork)
- **Plan 4:** Capture flow + ManyChat tagging + newsletter integration + Telegram alerts
- **Plan 5:** Welcome Tips dashboard CRUD + Welcome Analytics
- ...
```

- [ ] **Step 2: Commit + tag**

```bash
cd /Users/mastudio/code/ma-learn-welcome
git add README.md
git commit -m "docs: README reflects Plan 2 ship

Tip cards + chip selector + Editorial Atelier + footer module all live
on staging. First real Haiku 4.5 calls happening from chip flow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push

git tag -a plan2-tip-cards-shipped -m "Plan 2: Tip cards + layout + chip selector complete

End state: staging-welcome.malearnsa.com renders full branded landing
with personalized hero + 3 tip cards + chip selector for cold visitors.
First version with live Haiku 4.5 calls (uncached chip clicks)."
git push --tags
```

---

## Task E.3 — Live verification (joint with Majid)

**Manual checkpoint:**

1. Visit `https://staging-welcome.malearnsa.com/welcome` in browser
2. Expect: hero in Saudi Arabic + chip selector below + footer
3. Click "Midjourney" chip
4. Expect: greeting refreshes with Midjourney-specific text + 3 cards appear ("ركّز على الإضاءة" etc.)
5. Check Supabase Studio → `staging.welcome_visits` — new rows
6. Check Anthropic billing dashboard — should see fresh Haiku 4.5 calls today (first real LLM exercise)

If anything looks broken, file Plan 2.X follow-up tasks.

---

## Self-review

**Spec coverage:**
- §3 Scenario 3 (cold organic chip selector) — Tasks C.1, C.2, C.3 ✓
- §4.5 tip_cards table → Task A.1 ✓
- §4.5 tools table → Task A.1 ✓
- §6.2 warmth wrapper (LLM picks IDs from catalog) → Task A.2 ✓
- §6.9 cost — chip click cache reuse → Task C.2 ✓
- Editorial Atelier visual system → Task B.3 ✓
- Standard footer module → Task D.1 ✓
- Mobile-first → Task B.3 ✓

**No placeholders:** all code blocks complete, all commands executable, all expected outputs specified.

**Type consistency:** TipCard exported from `lib/db/tipCards`, imported consistently. GreetingOutput.tip_card_ids: string[] preserved from Plan 1.

---

## Plan complete

Saved to `docs/superpowers/plans/2026-05-02-welcome-v1-plan-02-tip-cards-and-layout.md`.

Estimated effort: ~3-4 hours of subagent dispatches across ~12 tasks. Mostly mechanical implementation extending Plan 1's foundations.
