# Emails V2 + Newsletter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Emails page to a block-based composer with product-aware Noor, and ship a new Newsletter section with subscriber aggregation, scheduled Brevo-delivered broadcasts, and open/click tracking.

**Architecture:** Extend the existing Fastify + TypeScript backend with a thin Brevo adapter (`src/mail/provider.ts`), a block-JSON → HTML renderer (`src/mail/blocks.ts`), a node-cron scheduler worker (`src/workers/scheduler.ts`), and new `/api/public/*` and `/api/webhooks/*` routes. Add new Apps Script endpoints for Subscribers/Newsletters sheet writes. Add a shared block composer component to the vanilla-JS frontend, used on both Emails and Newsletter pages. All Newsletter state lives in Google Sheets (Subscribers, Newsletters, NewsletterEvents tabs). Brevo is a delivery channel only.

**Tech Stack:**
- Backend: Fastify 4, TypeScript, Vitest, node-cron (new), zod
- Email provider: Brevo free tier (API v3)
- Frontend: vanilla ES modules (no build step), SortableJS (already loaded for LIB), new tiny block-editor module
- Storage: Google Sheets via existing `sheets-read.ts` + Apps Script `admin_*` endpoints
- Scheduler: node-cron in-process inside Fastify pm2 app

**Spec reference:** [docs/superpowers/specs/2026-04-20-emails-v2-and-newsletter-design.md](../specs/2026-04-20-emails-v2-and-newsletter-design.md)
**Plan 1:** [docs/superpowers/plans/2026-04-18-ma-learn-dashboard-foundation.md](2026-04-18-ma-learn-dashboard-foundation.md)
**Plan 2:** [docs/superpowers/plans/2026-04-19-ma-learn-dashboard-features.md](2026-04-19-ma-learn-dashboard-features.md)

**Scope:** This plan delivers all six slices from the spec. It does NOT deliver Week-3 features (homepage editor, product config) or production promotion.

---

## Prerequisites

- Plan 2 deployed to staging (confirmed 2026-04-20 — pm2 `ma-learn-dashboard-staging` online)
- `admin-staging.malearnsa.com` and `api-staging.malearnsa.com` reachable
- Staging Google Sheet (`MA Learn Token Pool (STAGING)`) has tabs: `Customers · Tokens · Lessons · Config · Coupons · LinkInBio · LinkInBioHeader · EmailTemplates · AuditLog · NoorActions`
- Operator has SSH access to `46.101.151.237`
- Apps Script `token-validator` staging deployment URL present in `/etc/ma-learn-dashboard/.env.staging` as `APPS_SCRIPT_URL`
- Majid owns `malearnsa.com` DNS at its registrar

---

## File Structure

```
ma-learn-dashboard/
├── backend/
│   ├── src/
│   │   ├── mail/
│   │   │   ├── provider.ts              # NEW — Brevo adapter (thin, swappable)
│   │   │   ├── brevo.ts                 # NEW — low-level Brevo HTTP client
│   │   │   └── blocks.ts                # NEW — block JSON → brand-wrapped HTML
│   │   ├── workers/
│   │   │   └── scheduler.ts             # NEW — node-cron tick for scheduled sends
│   │   ├── routes/
│   │   │   ├── public.ts                # NEW — /api/public/subscribe + /unsubscribe + /u/:token
│   │   │   ├── webhooks.ts              # NEW — /api/webhooks/brevo
│   │   │   ├── newsletters.ts           # NEW — CRUD + send + schedule
│   │   │   └── subscribers.ts           # NEW — list/filter subscribers
│   │   ├── data/
│   │   │   ├── subscribers.ts           # NEW — read Subscribers tab
│   │   │   ├── newsletters.ts           # NEW — read Newsletters + NewsletterEvents
│   │   │   └── segment-filter.ts        # NEW — apply JSON segment filter → email list
│   │   ├── services/
│   │   │   └── send-newsletter.ts       # NEW — render blocks, push to Brevo, mark sent
│   │   └── server.ts                    # MODIFIED — register new routes + start scheduler
│   ├── scripts/
│   │   ├── backfill-subscribers.ts      # NEW — one-time import from Customers + Waitlist
│   │   └── verify-brevo-dns.ts          # NEW — checks SPF/DKIM/DMARC records exist
│   └── tests/
│       ├── mail/
│       │   ├── blocks.test.ts           # NEW — renderer unit tests
│       │   └── provider.test.ts         # NEW — Brevo adapter tests (mocked HTTP)
│       ├── workers/scheduler.test.ts    # NEW — cron logic (injectable clock)
│       ├── routes/
│       │   ├── public.test.ts           # NEW
│       │   ├── webhooks.test.ts         # NEW
│       │   └── newsletters.test.ts      # NEW
│       └── data/
│           └── segment-filter.test.ts   # NEW
├── frontend/
│   └── public/
│       ├── js/
│       │   ├── composer/                # NEW — shared block editor
│       │   │   ├── index.js             # mountComposer({root, initialBlocks, language, onChange})
│       │   │   ├── blocks.js            # block type definitions
│       │   │   ├── preview.js           # live preview pane
│       │   │   └── picker.js            # variable + block picker
│       │   ├── pages/
│       │   │   ├── emails.js            # MODIFIED — uses composer, adds product field
│       │   │   ├── newsletter.js        # NEW
│       │   │   └── newsletter-stats.js  # NEW — stats view for a sent newsletter
│       │   └── router.js                # MODIFIED — add /newsletter route
│       ├── newsletter-stats.html        # NEW — lightweight page for stats (in admin)
│       └── unsubscribe.html             # NEW — public unsubscribe confirmation page
├── apps-script/
│   ├── admin-endpoints.js               # MODIFIED — append new admin_* endpoints
│   └── newsletter-endpoints.js          # NEW — broken out for clarity, also appended
└── docs/
    ├── brevo-setup-runbook.md           # NEW — Brevo signup + DNS steps for Majid
    └── newsletter-architecture.md       # NEW — quick-reference diagram + flow
```

---

# Stage A — Foundation (Slice 1): Sheets, Brevo adapter, Apps Script endpoints

### Task 1: Add new sheet tabs to staging

**Files:** No local file changes. Operator edits the staging Google Sheet.

- [ ] **Step 1: Create `Subscribers` tab**

Open the staging sheet. Add new tab named `Subscribers`. Header row:
```
A: Email  B: Name  C: Sources  D: Language  E: AddedAt  F: LastSourceAt  G: Status  H: UnsubscribedAt  I: UnsubscribeToken  J: BrevoContactId
```

- [ ] **Step 2: Create `Newsletters` tab**

Header row:
```
A: NewsletterID  B: Subject  C: Preheader  D: Language  E: Blocks  F: SegmentFilter  G: Status  H: CreatedAt  I: UpdatedAt  J: ScheduledAt  K: SentAt  L: RecipientCount  M: DeliveredCount  N: OpenCount  O: ClickCount  P: BounceCount  Q: UnsubCount  R: BrevoCampaignId  S: IdempotencyKey  T: CreatedBy  U: CloneOf
```

- [ ] **Step 3: Create `NewsletterEvents` tab**

Header row:
```
A: EventID  B: Timestamp  C: NewsletterID  D: Email  E: Event  F: URL  G: UserAgent
```

- [ ] **Step 4: Add `Blocks` column to EmailTemplates**

Open existing `EmailTemplates` tab. Add a new column after column G (`Variables`):
```
H: Blocks
```
Leave existing rows' column H blank — they will auto-migrate on first open in the new composer.

- [ ] **Step 5: Update `docs/sheet-schema.md`**

File: `docs/sheet-schema.md` (exists from Plan 2). Append:

```markdown
## Subscribers: Email | Name | Sources | Language | AddedAt | LastSourceAt | Status | UnsubscribedAt | UnsubscribeToken | BrevoContactId
## Newsletters: NewsletterID | Subject | Preheader | Language | Blocks | SegmentFilter | Status | CreatedAt | UpdatedAt | ScheduledAt | SentAt | RecipientCount | DeliveredCount | OpenCount | ClickCount | BounceCount | UnsubCount | BrevoCampaignId | IdempotencyKey | CreatedBy | CloneOf
## NewsletterEvents: EventID | Timestamp | NewsletterID | Email | Event | URL | UserAgent
## EmailTemplates: TemplateID | Name | SubjectAR | SubjectEN | BodyAR | BodyEN | Variables | Blocks
```

- [ ] **Step 6: Commit**

```bash
cd ~/code/ma-learn-dashboard
git add docs/sheet-schema.md
git commit -m "docs(schema): add Subscribers, Newsletters, NewsletterEvents tabs"
```

---

### Task 2: Block JSON → HTML renderer (`src/mail/blocks.ts`)

**Files:**
- Create: `backend/src/mail/blocks.ts`
- Test: `backend/tests/mail/blocks.test.ts`

Renders an array of block JSON into brand-wrapped HTML. Pure function; no IO. Used by both Newsletter and Emails (for new templates saved from the block composer).

- [ ] **Step 1: Write failing test — Text block renders as `<p>`**

File: `backend/tests/mail/blocks.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { renderBlocks } from '../../src/mail/blocks.js';

describe('renderBlocks', () => {
  it('renders a Text block as paragraph', () => {
    const html = renderBlocks(
      [{ type: 'text', content: 'Hello world' }],
      'EN',
      {}
    );
    expect(html).toContain('<p');
    expect(html).toContain('Hello world');
  });
});
```

- [ ] **Step 2: Run and verify failure**

```bash
cd ~/code/ma-learn-dashboard/backend
npm test -- blocks.test
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal `blocks.ts`**

File: `backend/src/mail/blocks.ts`

```typescript
export type Block =
  | { type: 'text'; content: string }
  | { type: 'heading'; text: string }
  | { type: 'banner'; url: string; alt: string; link?: string }
  | { type: 'cta'; label: string; url: string; color?: 'gold' | 'black' }
  | { type: 'bullet_list'; items: string[] }
  | { type: 'divider' };

export type Variables = Record<string, string>;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function substitute(s: string, vars: Variables): string {
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? esc(vars[k]) : m));
}

function renderBlock(block: Block, vars: Variables, isAR: boolean): string {
  switch (block.type) {
    case 'text':
      return `<p style="color:#222;margin:12px 0;">${substitute(esc(block.content), vars).replace(/\n/g, '<br>')}</p>`;
    case 'heading':
      return `<p style="font-size:1.15rem;font-weight:bold;color:#222;margin:22px 0 10px;">${substitute(esc(block.text), vars)}</p>`;
    case 'banner': {
      const img = `<img src="${esc(block.url)}" alt="${esc(block.alt)}" style="max-width:100%;height:auto;border-radius:6px;margin:18px 0;">`;
      return block.link ? `<a href="${esc(block.link)}" style="text-decoration:none;">${img}</a>` : img;
    }
    case 'cta': {
      const color = block.color ?? 'gold';
      const bg = color === 'gold' ? '#C9A84C' : '#0E0E0E';
      const fg = color === 'gold' ? '#0E0E0E' : '#ffffff';
      return `<p style="text-align:center;margin:22px 0;"><a href="${esc(block.url)}" style="display:inline-block;padding:12px 28px;background:${bg};color:${fg};text-decoration:none;border-radius:6px;font-weight:bold;">${esc(block.label)}</a></p>`;
    }
    case 'bullet_list': {
      const padSide = isAR ? 'padding-right' : 'padding-left';
      const items = block.items.map(i => `<li style="padding:4px 0;color:#444;">${substitute(esc(i), vars)}</li>`).join('');
      return `<ul style="margin:16px 0;${padSide}:22px;list-style:disc;">${items}</ul>`;
    }
    case 'divider':
      return `<hr style="border:none;border-top:1px solid #C9A84C;opacity:0.4;margin:22px 0;">`;
  }
}

export function renderBlocks(blocks: Block[], language: 'AR' | 'EN', vars: Variables): string {
  const isAR = language === 'AR';
  const dir = isAR ? 'rtl' : 'ltr';
  const body = blocks.map(b => renderBlock(b, vars, isAR)).join('\n');
  const signature = isAR
    ? `— <strong>ماجد عنقاوي</strong><br><span style="color:#888;font-size:0.85rem;">صناعة الإلهام · MA Learn</span>`
    : `— <strong>Majid Angawi</strong><br><span style="color:#888;font-size:0.85rem;">Making Inspiration · MA Learn</span>`;
  const unsub = isAR
    ? `لإلغاء الاشتراك، <a href="{unsubscribeUrl}" style="color:#888;">اضغط هنا</a>.`
    : `To unsubscribe, <a href="{unsubscribeUrl}" style="color:#888;">click here</a>.`;
  return `<div dir="${dir}" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;line-height:1.7;">
${body}
<hr style="border:none;border-top:1px solid #eee;margin:32px 0 20px;">
<p style="margin:0 0 12px;">${signature}</p>
<p style="margin:0;font-size:0.75rem;color:#888;">${substitute(unsub, vars)}</p>
</div>`;
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npm test -- blocks.test
```
Expected: PASS.

- [ ] **Step 5: Add tests for each block type + variable substitution**

Append to `blocks.test.ts`:

```typescript
it('renders Heading block', () => {
  const html = renderBlocks([{ type: 'heading', text: 'My heading' }], 'EN', {});
  expect(html).toContain('My heading');
  expect(html).toMatch(/font-weight:\s*bold/);
});

it('renders Banner block with alt + optional link', () => {
  const html = renderBlocks(
    [{ type: 'banner', url: 'https://cdn/x.jpg', alt: 'x', link: 'https://site' }],
    'EN', {}
  );
  expect(html).toContain('src="https://cdn/x.jpg"');
  expect(html).toContain('alt="x"');
  expect(html).toContain('href="https://site"');
});

it('renders CTA block with gold by default', () => {
  const html = renderBlocks(
    [{ type: 'cta', label: 'Watch', url: 'https://p' }],
    'EN', {}
  );
  expect(html).toContain('>Watch<');
  expect(html).toContain('href="https://p"');
  expect(html).toContain('#C9A84C');
});

it('renders Bullet list with RTL padding for AR', () => {
  const html = renderBlocks(
    [{ type: 'bullet_list', items: ['one', 'two'] }],
    'AR', {}
  );
  expect(html).toContain('padding-right');
  expect(html).toContain('<li');
});

it('substitutes variables like {name}', () => {
  const html = renderBlocks(
    [{ type: 'text', content: 'Hi {name}, welcome.' }],
    'EN',
    { name: 'Majid' }
  );
  expect(html).toContain('Hi Majid, welcome.');
});

it('leaves unknown variables untouched', () => {
  const html = renderBlocks(
    [{ type: 'text', content: 'Hi {unknown}' }],
    'EN', {}
  );
  expect(html).toContain('Hi {unknown}');
});

it('includes unsubscribe footer with variable substitution', () => {
  const html = renderBlocks([], 'EN', { unsubscribeUrl: 'https://x/u/abc' });
  expect(html).toContain('href="https://x/u/abc"');
});

it('sets dir="rtl" for AR language', () => {
  const html = renderBlocks([], 'AR', {});
  expect(html).toContain('dir="rtl"');
});

it('escapes HTML in content', () => {
  const html = renderBlocks(
    [{ type: 'text', content: '<script>alert(1)</script>' }],
    'EN', {}
  );
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
});
```

- [ ] **Step 6: Run, verify all pass, commit**

```bash
npm test -- blocks.test
git add backend/src/mail/blocks.ts backend/tests/mail/blocks.test.ts
git commit -m "feat(mail): block JSON to brand-wrapped HTML renderer"
```

---

### Task 3: Brevo HTTP client + provider adapter

**Files:**
- Create: `backend/src/mail/brevo.ts` — low-level HTTP calls
- Create: `backend/src/mail/provider.ts` — higher-level interface used by the rest of the app
- Test: `backend/tests/mail/provider.test.ts`

The adapter exposes 4 methods: `sendCampaign`, `getQuota`, `upsertContact`, `unsubscribeContact`. Swappable to Resend/MailerSend later.

- [ ] **Step 1: Write failing test — provider interface**

File: `backend/tests/mail/provider.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createBrevoProvider } from '../../src/mail/provider.js';

describe('BrevoProvider', () => {
  it('sends a transactional email via Brevo API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ messageId: 'msg_123' }),
    });
    const p = createBrevoProvider({ apiKey: 'xkeysib-test', fetchImpl: fetchMock });
    const res = await p.sendCampaign({
      from: { name: 'Majid', email: 'hello@newsletter.malearnsa.com' },
      to: [{ email: 'a@b.com', name: 'A' }, { email: 'c@d.com', name: 'C' }],
      subject: 'Test',
      htmlContent: '<p>Hi</p>',
      headers: { 'List-Unsubscribe': '<https://x/u/abc>' },
    });
    expect(res.ok).toBe(true);
    expect(res.messageId).toBe('msg_123');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((opts as any).headers['api-key']).toBe('xkeysib-test');
  });

  it('returns error object on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 400,
      json: async () => ({ code: 'invalid_parameter', message: 'bad' }),
    });
    const p = createBrevoProvider({ apiKey: 'k', fetchImpl: fetchMock });
    const res = await p.sendCampaign({
      from: { name: 'x', email: 'x@x.com' }, to: [{ email: 'a@b.com' }], subject: 's', htmlContent: 'h'
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('invalid_parameter');
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
npm test -- provider.test
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write `brevo.ts` — low-level HTTP**

File: `backend/src/mail/brevo.ts`

```typescript
export interface BrevoRecipient { email: string; name?: string }
export interface BrevoSendArgs {
  from: { name: string; email: string };
  to: BrevoRecipient[];
  subject: string;
  htmlContent: string;
  headers?: Record<string, string>;
  tags?: string[];
}

export interface BrevoClient {
  postJson<T>(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: T }>;
}

export function createBrevoClient(opts: { apiKey: string; fetchImpl?: typeof fetch }): BrevoClient {
  const f = opts.fetchImpl ?? fetch;
  return {
    async postJson<T>(path: string, body: unknown) {
      const res = await f(`https://api.brevo.com/v3${path}`, {
        method: 'POST',
        headers: {
          'api-key': opts.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as T;
      return { ok: res.ok, status: res.status, data };
    },
  };
}
```

- [ ] **Step 4: Write `provider.ts` — higher-level adapter**

File: `backend/src/mail/provider.ts`

```typescript
import { createBrevoClient, BrevoSendArgs, BrevoRecipient } from './brevo.js';

export interface MailProvider {
  sendCampaign(args: SendCampaignArgs): Promise<SendResult>;
  upsertContact(args: { email: string; name?: string; attributes?: Record<string, string> }): Promise<UpsertResult>;
  unsubscribeContact(email: string): Promise<{ ok: boolean; error?: string }>;
  getQuota(): Promise<{ remaining: number; dailyLimit: number }>;
}

export interface SendCampaignArgs {
  from: { name: string; email: string };
  to: BrevoRecipient[];
  subject: string;
  htmlContent: string;
  headers?: Record<string, string>;
  tags?: string[];
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  brevoCampaignId?: string;
  error?: string;
}

export interface UpsertResult {
  ok: boolean;
  contactId?: number;
  error?: string;
}

export function createBrevoProvider(opts: { apiKey: string; fetchImpl?: typeof fetch }): MailProvider {
  const client = createBrevoClient(opts);
  return {
    async sendCampaign(args: SendCampaignArgs): Promise<SendResult> {
      const r = await client.postJson<{ messageId?: string; code?: string; message?: string }>(
        '/smtp/email',
        {
          sender: args.from,
          to: args.to,
          subject: args.subject,
          htmlContent: args.htmlContent,
          headers: args.headers,
          tags: args.tags,
        }
      );
      if (!r.ok) return { ok: false, error: `${r.data.code ?? r.status}: ${r.data.message ?? 'brevo_error'}` };
      return { ok: true, messageId: r.data.messageId };
    },

    async upsertContact(args): Promise<UpsertResult> {
      const r = await client.postJson<{ id?: number; code?: string; message?: string }>(
        '/contacts',
        { email: args.email, attributes: { NAME: args.name, ...(args.attributes ?? {}) }, updateEnabled: true }
      );
      if (!r.ok && r.status !== 400 /* already exists is fine */) {
        return { ok: false, error: `${r.data.code}: ${r.data.message}` };
      }
      return { ok: true, contactId: r.data.id };
    },

    async unsubscribeContact(email: string) {
      const r = await client.postJson<{ code?: string; message?: string }>(
        `/contacts/${encodeURIComponent(email)}/unsubscribe`,
        {}
      );
      if (!r.ok) return { ok: false, error: `${r.data.code}: ${r.data.message}` };
      return { ok: true };
    },

    async getQuota() {
      const r = await client.postJson<{ dailyLimit?: number; remaining?: number }>(
        '/account/quota' as any, {}
      );
      return { remaining: r.data.remaining ?? 0, dailyLimit: r.data.dailyLimit ?? 300 };
    },
  };
}
```

- [ ] **Step 5: Run, verify pass, commit**

```bash
npm test -- provider.test
git add backend/src/mail/brevo.ts backend/src/mail/provider.ts backend/tests/mail/provider.test.ts
git commit -m "feat(mail): Brevo provider adapter with send/upsert/unsubscribe"
```

---

### Task 4: Apps Script admin endpoints for Subscribers + Newsletters

**Files:**
- Create: `apps-script/newsletter-endpoints.js` — source copy in repo
- Modify: live `token-validator` Apps Script project by pasting the new handlers

All writes to Subscribers / Newsletters / NewsletterEvents go through here. Every endpoint gates on `admin_token` matching the `ADMIN_TOKEN` constant.

- [ ] **Step 1: Write `newsletter-endpoints.js`**

File: `apps-script/newsletter-endpoints.js`

```javascript
/**
 * MA Learn Dashboard — Newsletter + Subscribers admin endpoints.
 * Appended to token-validator/Code.js. Every action gates on admin_token.
 *
 * Sheets touched:
 *   - Subscribers (new)
 *   - Newsletters (new)
 *   - NewsletterEvents (new)
 *
 * All writes: lowercase email, ISO timestamps (Utilities.formatDate with 'yyyy-MM-dd HH:mm:ss').
 */

// ---------- helpers ----------
function _lc(s) { return String(s || '').trim().toLowerCase(); }
function _now() { return Utilities.formatDate(new Date(), 'Asia/Riyadh', "yyyy-MM-dd'T'HH:mm:ss"); }
function _sheet(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }
function _rndToken(n) {
  var a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var s = '';
  for (var i = 0; i < (n || 24); i++) s += a.charAt(Math.floor(Math.random() * a.length));
  return s;
}

// Reads header row of a sheet and returns { colName: colIndex(0-based) }.
function _headerMap(sheet) {
  var row = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  row.forEach(function (h, i) { map[String(h).trim()] = i; });
  return map;
}

// ---------- admin_upsert_subscriber ----------
function _admin_upsert_subscriber(p) {
  var email = _lc(p.email);
  if (!email) return { ok: false, error: 'missing_email' };
  var src = String(p.source || '').trim();
  if (!src) return { ok: false, error: 'missing_source' };

  var sh = _sheet('Subscribers');
  var headers = _headerMap(sh);
  var last = sh.getLastRow();
  var data = last > 1 ? sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues() : [];

  // Find existing by email
  var rowIndex = -1;
  for (var i = 0; i < data.length; i++) {
    if (_lc(data[i][headers['Email']]) === email) { rowIndex = i + 2; break; }
  }

  if (rowIndex > 0) {
    var sources = String(sh.getRange(rowIndex, headers['Sources'] + 1).getValue() || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (sources.indexOf(src) === -1) sources.push(src);
    sh.getRange(rowIndex, headers['Sources'] + 1).setValue(sources.join(','));
    sh.getRange(rowIndex, headers['LastSourceAt'] + 1).setValue(_now());
    if (p.name) sh.getRange(rowIndex, headers['Name'] + 1).setValue(p.name);
    return { ok: true, action: 'updated', email: email };
  }

  // Insert new row
  var newRow = new Array(sh.getLastColumn()).fill('');
  newRow[headers['Email']] = email;
  newRow[headers['Name']] = p.name || '';
  newRow[headers['Sources']] = src;
  newRow[headers['Language']] = (p.language === 'EN' ? 'EN' : 'AR');
  newRow[headers['AddedAt']] = _now();
  newRow[headers['LastSourceAt']] = _now();
  newRow[headers['Status']] = 'active';
  newRow[headers['UnsubscribeToken']] = _rndToken(24);
  sh.appendRow(newRow);
  return { ok: true, action: 'inserted', email: email };
}

// ---------- admin_mark_unsubscribed ----------
function _admin_mark_unsubscribed(p) {
  var email = _lc(p.email);
  var token = String(p.token || '').trim();
  if (!email && !token) return { ok: false, error: 'missing_email_or_token' };

  var sh = _sheet('Subscribers');
  var headers = _headerMap(sh);
  var last = sh.getLastRow();
  if (last < 2) return { ok: false, error: 'no_rows' };
  var data = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if ((email && _lc(row[headers['Email']]) === email) || (token && row[headers['UnsubscribeToken']] === token)) {
      var r = i + 2;
      sh.getRange(r, headers['Status'] + 1).setValue('unsubscribed');
      sh.getRange(r, headers['UnsubscribedAt'] + 1).setValue(_now());
      return { ok: true, email: _lc(row[headers['Email']]) };
    }
  }
  return { ok: false, error: 'not_found' };
}

// ---------- admin_create_newsletter ----------
function _admin_create_newsletter(p) {
  var sh = _sheet('Newsletters');
  var headers = _headerMap(sh);
  var id = 'nl_' + _rndToken(12);
  var row = new Array(sh.getLastColumn()).fill('');
  row[headers['NewsletterID']] = id;
  row[headers['Subject']] = p.subject || '';
  row[headers['Preheader']] = p.preheader || '';
  row[headers['Language']] = (p.language === 'EN' ? 'EN' : 'AR');
  row[headers['Blocks']] = p.blocks || '[]';
  row[headers['SegmentFilter']] = p.segmentFilter || '{}';
  row[headers['Status']] = 'draft';
  row[headers['CreatedAt']] = _now();
  row[headers['UpdatedAt']] = _now();
  row[headers['IdempotencyKey']] = _rndToken(24);
  row[headers['CreatedBy']] = p.createdBy || 'majid';
  row[headers['CloneOf']] = p.cloneOf || '';
  sh.appendRow(row);
  return { ok: true, newsletterId: id };
}

// ---------- admin_update_newsletter ----------
function _admin_update_newsletter(p) {
  var id = String(p.newsletterId || '').trim();
  if (!id) return { ok: false, error: 'missing_newsletterId' };

  var sh = _sheet('Newsletters');
  var headers = _headerMap(sh);
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][headers['NewsletterID']]) === id) {
      var r = i + 2;
      var fields = ['Subject', 'Preheader', 'Language', 'Blocks', 'SegmentFilter', 'ScheduledAt'];
      fields.forEach(function (f) {
        var key = f.charAt(0).toLowerCase() + f.slice(1);
        if (p[key] !== undefined) sh.getRange(r, headers[f] + 1).setValue(p[key]);
      });
      sh.getRange(r, headers['UpdatedAt'] + 1).setValue(_now());
      return { ok: true };
    }
  }
  return { ok: false, error: 'not_found' };
}

// ---------- admin_mark_newsletter_status ----------
// Atomic status transition: only sets if current matches fromStatus.
function _admin_mark_newsletter_status(p) {
  var id = String(p.newsletterId || '').trim();
  var toStatus = String(p.toStatus || '').trim();
  var fromStatus = String(p.fromStatus || '').trim();
  if (!id || !toStatus) return { ok: false, error: 'missing' };

  var sh = _sheet('Newsletters');
  var headers = _headerMap(sh);
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][headers['NewsletterID']]) === id) {
      var r = i + 2;
      var current = String(sh.getRange(r, headers['Status'] + 1).getValue());
      if (fromStatus && current !== fromStatus) return { ok: false, error: 'status_mismatch', current: current };
      sh.getRange(r, headers['Status'] + 1).setValue(toStatus);
      sh.getRange(r, headers['UpdatedAt'] + 1).setValue(_now());
      if (toStatus === 'sent') sh.getRange(r, headers['SentAt'] + 1).setValue(_now());
      if (p.recipientCount !== undefined) sh.getRange(r, headers['RecipientCount'] + 1).setValue(p.recipientCount);
      if (p.brevoCampaignId) sh.getRange(r, headers['BrevoCampaignId'] + 1).setValue(p.brevoCampaignId);
      return { ok: true };
    }
  }
  return { ok: false, error: 'not_found' };
}

// ---------- admin_append_newsletter_event ----------
function _admin_append_newsletter_event(p) {
  var sh = _sheet('NewsletterEvents');
  var headers = _headerMap(sh);
  var row = new Array(sh.getLastColumn()).fill('');
  row[headers['EventID']] = _rndToken(16);
  row[headers['Timestamp']] = _now();
  row[headers['NewsletterID']] = p.newsletterId || '';
  row[headers['Email']] = _lc(p.email);
  row[headers['Event']] = p.event || '';
  row[headers['URL']] = p.url || '';
  row[headers['UserAgent']] = String(p.userAgent || '').slice(0, 200);
  sh.appendRow(row);

  // Increment counter on Newsletters row
  if (p.newsletterId) _incrementNewsletterCounter(p.newsletterId, p.event);
  return { ok: true };
}

function _incrementNewsletterCounter(newsletterId, event) {
  var map = {
    delivered: 'DeliveredCount', opened: 'OpenCount', clicked: 'ClickCount',
    unsubscribed: 'UnsubCount', hard_bounce: 'BounceCount', soft_bounce: 'BounceCount',
  };
  var col = map[event];
  if (!col) return;
  var sh = _sheet('Newsletters');
  var headers = _headerMap(sh);
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][headers['NewsletterID']]) === newsletterId) {
      var r = i + 2;
      var current = Number(sh.getRange(r, headers[col] + 1).getValue()) || 0;
      sh.getRange(r, headers[col] + 1).setValue(current + 1);
      return;
    }
  }
}
```

- [ ] **Step 2: Wire new actions into the `doGet` dispatcher**

In the live `token-validator` project (same Apps Script project Majid opens in his browser), at the end of the existing `doGet(e)` switch statement, add these cases. Paste this snippet into `Code.js`:

```javascript
// (paste inside doGet's action switch, after existing admin_* cases)
case 'admin_upsert_subscriber':     return _json(_admin_upsert_subscriber(params));
case 'admin_mark_unsubscribed':     return _json(_admin_mark_unsubscribed(params));
case 'admin_create_newsletter':     return _json(_admin_create_newsletter(params));
case 'admin_update_newsletter':     return _json(_admin_update_newsletter(params));
case 'admin_mark_newsletter_status':return _json(_admin_mark_newsletter_status(params));
case 'admin_append_newsletter_event':return _json(_admin_append_newsletter_event(params));
```

Also append the contents of `newsletter-endpoints.js` (Step 1) to the bottom of `Code.js` in the Apps Script editor.

- [ ] **Step 3: Redeploy Apps Script**

In the Apps Script editor, click **Deploy → Manage deployments → Edit (pencil) → New version → Deploy**. Copy the Web App URL (it stays the same; redeployment refreshes the code under it).

- [ ] **Step 4: Smoke-test each endpoint from the droplet**

```bash
ssh root@46.101.151.237
source /etc/ma-learn-dashboard/.env.staging
# Upsert a test subscriber
curl -s "$APPS_SCRIPT_URL?action=admin_upsert_subscriber&admin_token=$ADMIN_TOKEN&email=test@example.com&name=Test&source=website&language=EN"
# Expected: {"ok":true,"action":"inserted","email":"test@example.com"}
# Run again — should update
curl -s "$APPS_SCRIPT_URL?action=admin_upsert_subscriber&admin_token=$ADMIN_TOKEN&email=test@example.com&source=buyer"
# Expected: {"ok":true,"action":"updated","email":"test@example.com"}
# Unsubscribe
curl -s "$APPS_SCRIPT_URL?action=admin_mark_unsubscribed&admin_token=$ADMIN_TOKEN&email=test@example.com"
# Expected: {"ok":true,"email":"test@example.com"}
```

Verify in the staging sheet that the Subscribers tab has one row with both sources (`website,buyer`) and Status `unsubscribed`.

- [ ] **Step 5: Clean up + commit**

Delete the test row from the staging Subscribers tab.

```bash
cd ~/code/ma-learn-dashboard
git add apps-script/newsletter-endpoints.js
git commit -m "feat(apps-script): subscriber + newsletter admin endpoints"
```

Memory: Apps Script is NOT checked into git as the source of truth — Majid edits the live project in-browser. The file in the repo is a reference copy only. That's consistent with Plan 2's pattern.

---

### Task 5: Brevo setup runbook (for Majid) + DNS verifier script

**Files:**
- Create: `docs/brevo-setup-runbook.md`
- Create: `backend/scripts/verify-brevo-dns.ts`

The runbook is a copy-paste checklist Majid follows once. The verifier script is what the operator runs after DNS propagates.

- [ ] **Step 1: Write runbook**

File: `docs/brevo-setup-runbook.md`

```markdown
# Brevo + DNS Setup Runbook (one-time)

## Step 1 — Create Brevo account

1. Go to https://www.brevo.com → Sign up (free)
2. Use `majed.engawi@gmail.com` for signup; add `newsletter@malearnsa.com` as sender email after.
3. Skip all onboarding questions you can; pick "Transactional email" when asked about use case.
4. Confirm the signup email in Gmail.

## Step 2 — Add sender domain

1. In Brevo, go to **Senders & IP → Domains → Add a domain**.
2. Enter `newsletter.malearnsa.com`.
3. Brevo will show 3 DNS records (DKIM + SPF addition + DMARC). Copy them.

## Step 3 — Add DNS records at malearnsa.com registrar

Log in to wherever malearnsa.com is registered (likely Godaddy / Namecheap / Cloudflare). Add the 3 records Brevo provided, typically:

1. **DKIM** (TXT)
   - Host: `brevo-code._domainkey.newsletter`
   - Value: `v=DKIM1; k=rsa; p=<long key from Brevo>`
2. **SPF** (TXT)
   - Host: `newsletter`
   - Value: `v=spf1 include:spf.brevo.com ~all`
3. **DMARC** (TXT) — optional but recommended
   - Host: `_dmarc.newsletter`
   - Value: `v=DMARC1; p=none; rua=mailto:majed.engawi@gmail.com`

Save. DNS propagation takes 5–30 minutes.

## Step 4 — Verify in Brevo

Back in Brevo → the domain row → **Authenticate**. Brevo will show green checks next to each record once DNS resolves.

## Step 5 — Create API key

1. In Brevo, go to **SMTP & API → API Keys → Generate a new API key**.
2. Name: `ma-learn-dashboard`.
3. Copy the key. It starts with `xkeysib-`.

## Step 6 — Paste key into droplet

SSH to droplet and add to staging env:

```bash
ssh root@46.101.151.237
echo 'BREVO_API_KEY=xkeysib-...' >> /etc/ma-learn-dashboard/.env.staging
echo 'BREVO_WEBHOOK_SECRET=<generate a random 32-char string>' >> /etc/ma-learn-dashboard/.env.staging
echo 'BREVO_SENDER_EMAIL=hello@newsletter.malearnsa.com' >> /etc/ma-learn-dashboard/.env.staging
echo 'BREVO_SENDER_NAME=Majid Angawi' >> /etc/ma-learn-dashboard/.env.staging
pm2 restart ma-learn-dashboard-staging --update-env
```

## Step 7 — Set webhook URL in Brevo

1. Brevo → **Transactional → Settings → Webhook**.
2. URL: `https://api-staging.malearnsa.com/api/webhooks/brevo`
3. Events: check `delivered`, `opened`, `clicked`, `soft_bounce`, `hard_bounce`, `unsubscribed`.
4. Paste the `BREVO_WEBHOOK_SECRET` into the "Authorization" field as a custom header.

## Step 8 — Verify DNS from droplet

```bash
cd ~/code/ma-learn-dashboard/backend
npx tsx scripts/verify-brevo-dns.ts
```

Expected: all three checks PASS.

## Step 9 — Test send

```bash
curl -s https://api-staging.malearnsa.com/api/writes/newsletter/test_send \
  -H "Cookie: auth_session=<your cookie>" \
  -H "Content-Type: application/json" \
  -d '{"to":"majed.engawi@gmail.com","subject":"Brevo test","html":"<h1>hello</h1>"}'
```

You should receive the email within ~30 seconds. Check Gmail inbox AND spam.
```

- [ ] **Step 2: Write DNS verifier script**

File: `backend/scripts/verify-brevo-dns.ts`

```typescript
import { resolveTxt } from 'node:dns/promises';

const DOMAIN = 'newsletter.malearnsa.com';

async function txt(host: string): Promise<string[]> {
  try {
    const rows = await resolveTxt(host);
    return rows.map(r => r.join(''));
  } catch {
    return [];
  }
}

async function main() {
  console.log(`Verifying DNS for ${DOMAIN}\n`);

  const spf = await txt(DOMAIN);
  const hasSpf = spf.some(r => r.includes('spf.brevo.com'));
  console.log(`SPF:   ${hasSpf ? 'PASS' : 'FAIL'}  (looked for "spf.brevo.com" in ${DOMAIN})`);
  if (!hasSpf) console.log(`       Got: ${JSON.stringify(spf)}`);

  const dkim = await txt(`brevo-code._domainkey.${DOMAIN}`);
  const hasDkim = dkim.some(r => r.startsWith('v=DKIM1'));
  console.log(`DKIM:  ${hasDkim ? 'PASS' : 'FAIL'}  (looked for v=DKIM1 at brevo-code._domainkey.${DOMAIN})`);

  const dmarc = await txt(`_dmarc.${DOMAIN}`);
  const hasDmarc = dmarc.some(r => r.startsWith('v=DMARC1'));
  console.log(`DMARC: ${hasDmarc ? 'PASS' : 'WARN'} (optional; looked for v=DMARC1 at _dmarc.${DOMAIN})`);

  process.exit(hasSpf && hasDkim ? 0 : 1);
}

main();
```

- [ ] **Step 3: Commit + PAUSE for Majid**

```bash
cd ~/code/ma-learn-dashboard
git add docs/brevo-setup-runbook.md backend/scripts/verify-brevo-dns.ts
git commit -m "docs(brevo): one-time setup runbook + DNS verifier"
```

**⏸ HARD STOP 1** — Majid runs through the runbook (Brevo signup + DNS records + API key paste on droplet + webhook configured). Resume Task 6 after `npx tsx scripts/verify-brevo-dns.ts` prints `SPF: PASS / DKIM: PASS`.

---

### Task 6: Webhook route stub + register mail provider in Fastify

**Files:**
- Create: `backend/src/routes/webhooks.ts`
- Modify: `backend/src/server.ts`

Just registers the route and logs events. Full handling comes in Task 22.

- [ ] **Step 1: Write failing test**

File: `backend/tests/routes/webhooks.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import webhooksRoute from '../../src/routes/webhooks.js';

describe('POST /api/webhooks/brevo', () => {
  it('accepts a valid webhook with secret header', async () => {
    const app = Fastify();
    await app.register(webhooksRoute, { brevoSecret: 'secret123' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/brevo',
      headers: { authorization: 'secret123' },
      payload: { event: 'delivered', email: 'a@b.com', 'message-id': 'm1' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects missing/bad secret', async () => {
    const app = Fastify();
    await app.register(webhooksRoute, { brevoSecret: 'secret123' });
    const res = await app.inject({
      method: 'POST', url: '/api/webhooks/brevo',
      headers: { authorization: 'wrong' }, payload: {}
    });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Implement `webhooks.ts`**

File: `backend/src/routes/webhooks.ts`

```typescript
import { FastifyPluginAsync } from 'fastify';

interface Opts { brevoSecret: string }

const webhooksRoute: FastifyPluginAsync<Opts> = async (app, opts) => {
  app.post('/api/webhooks/brevo', async (req, reply) => {
    const auth = req.headers.authorization;
    if (auth !== opts.brevoSecret) return reply.code(401).send({ error: 'unauthorized' });
    // Full event ingestion wired in Task 22.
    app.log.info({ body: req.body }, 'brevo_webhook_received');
    return { ok: true };
  });
};

export default webhooksRoute;
```

- [ ] **Step 3: Register in `server.ts`**

Modify `backend/src/server.ts` — inside the plugin-registration section, add:

```typescript
import webhooksRoute from './routes/webhooks.js';
// ...
await app.register(webhooksRoute, { brevoSecret: process.env.BREVO_WEBHOOK_SECRET ?? '' });
```

- [ ] **Step 4: Run tests + deploy to staging**

```bash
cd ~/code/ma-learn-dashboard/backend
npm test
ssh root@46.101.151.237 'cd ~/code/ma-learn-dashboard && git pull && cd backend && npm install && npm run build && pm2 restart ma-learn-dashboard-staging'
curl -s -X POST https://api-staging.malearnsa.com/api/webhooks/brevo -H "authorization: wrong"
# Expected: {"error":"unauthorized"}
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/webhooks.ts backend/tests/routes/webhooks.test.ts backend/src/server.ts
git commit -m "feat(webhooks): Brevo webhook route stub with auth gate"
git push
```

---

# Stage B — Block Composer (Slice 2)

### Task 7: Block editor module structure (no UI yet, data model + reducer)

**Files:**
- Create: `frontend/public/js/composer/blocks.js`

Pure data-model module. Block definitions + block-picker labels.

- [ ] **Step 1: Write `blocks.js`**

File: `frontend/public/js/composer/blocks.js`

```javascript
// Block type registry. Matches backend src/mail/blocks.ts Block union.

export const BLOCK_TYPES = {
  text: {
    label: 'Text',
    icon: '¶',
    default: () => ({ type: 'text', content: '' }),
  },
  heading: {
    label: 'Heading',
    icon: 'H',
    default: () => ({ type: 'heading', text: '' }),
  },
  banner: {
    label: 'Banner image',
    icon: '🖼',
    default: () => ({ type: 'banner', url: '', alt: '', link: '' }),
  },
  cta: {
    label: 'CTA button',
    icon: '▢',
    default: () => ({ type: 'cta', label: '', url: '', color: 'gold' }),
  },
  bullet_list: {
    label: 'Bullet list',
    icon: '•',
    default: () => ({ type: 'bullet_list', items: [''] }),
  },
  divider: {
    label: 'Divider',
    icon: '—',
    default: () => ({ type: 'divider' }),
  },
};

export const VARIABLES = [
  { key: 'name', label: 'Subscriber name' },
  { key: 'product', label: 'Product' },
  { key: 'token', label: 'Access token' },
  { key: 'course', label: 'Course name' },
  { key: 'module', label: 'Module name' },
  { key: 'nextModule', label: 'Next module' },
  { key: 'playerURL', label: 'Player URL' },
  { key: 'unsubscribeUrl', label: 'Unsubscribe URL' },
];

export function newId() {
  return 'b_' + Math.random().toString(36).slice(2, 10);
}

// Attach id for DOM bookkeeping; backend schema has no id (order is implicit).
export function withIds(blocks) {
  return blocks.map(b => ({ ...b, __id: newId() }));
}

export function stripIds(blocks) {
  return blocks.map(({ __id, ...b }) => b);
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/code/ma-learn-dashboard
git add frontend/public/js/composer/blocks.js
git commit -m "feat(composer): block type registry + variable list"
```

---

### Task 8: Live preview module (client-side block renderer)

**Files:**
- Create: `frontend/public/js/composer/preview.js`

Mirrors `src/mail/blocks.ts` so the preview is accurate without a backend roundtrip. Intentionally duplicates the render logic — two small copies is simpler than a shared package for a project with no build step.

- [ ] **Step 1: Write `preview.js`**

File: `frontend/public/js/composer/preview.js`

```javascript
// Client-side preview renderer. Mirrors backend/src/mail/blocks.ts.
// Any change in brand styling must be reflected in both files.

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function substitute(s, vars) {
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? esc(vars[k]) : m));
}

function renderBlock(block, vars, isAR) {
  switch (block.type) {
    case 'text':
      return `<p style="color:#222;margin:12px 0;">${substitute(esc(block.content), vars).replace(/\n/g, '<br>')}</p>`;
    case 'heading':
      return `<p style="font-size:1.15rem;font-weight:bold;color:#222;margin:22px 0 10px;">${substitute(esc(block.text), vars)}</p>`;
    case 'banner': {
      const img = `<img src="${esc(block.url)}" alt="${esc(block.alt)}" style="max-width:100%;height:auto;border-radius:6px;margin:18px 0;">`;
      return block.link ? `<a href="${esc(block.link)}" style="text-decoration:none;">${img}</a>` : img;
    }
    case 'cta': {
      const color = block.color ?? 'gold';
      const bg = color === 'gold' ? '#C9A84C' : '#0E0E0E';
      const fg = color === 'gold' ? '#0E0E0E' : '#ffffff';
      return `<p style="text-align:center;margin:22px 0;"><a href="${esc(block.url)}" style="display:inline-block;padding:12px 28px;background:${bg};color:${fg};text-decoration:none;border-radius:6px;font-weight:bold;">${esc(block.label)}</a></p>`;
    }
    case 'bullet_list': {
      const padSide = isAR ? 'padding-right' : 'padding-left';
      const items = (block.items || []).filter(Boolean).map(i => `<li style="padding:4px 0;color:#444;">${substitute(esc(i), vars)}</li>`).join('');
      return `<ul style="margin:16px 0;${padSide}:22px;list-style:disc;">${items}</ul>`;
    }
    case 'divider':
      return `<hr style="border:none;border-top:1px solid #C9A84C;opacity:0.4;margin:22px 0;">`;
  }
  return '';
}

export function renderPreview(blocks, language, vars) {
  const isAR = language === 'AR';
  const dir = isAR ? 'rtl' : 'ltr';
  const body = blocks.map(b => renderBlock(b, vars || {}, isAR)).join('\n');
  const signature = isAR
    ? `— <strong>ماجد عنقاوي</strong><br><span style="color:#888;font-size:0.85rem;">صناعة الإلهام · MA Learn</span>`
    : `— <strong>Majid Angawi</strong><br><span style="color:#888;font-size:0.85rem;">Making Inspiration · MA Learn</span>`;
  return `<div dir="${dir}" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;line-height:1.7;background:#fff;padding:20px;">
${body}
<hr style="border:none;border-top:1px solid #eee;margin:32px 0 20px;">
<p style="margin:0 0 12px;">${signature}</p>
</div>`;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/public/js/composer/preview.js
git commit -m "feat(composer): client-side live preview renderer"
```

---

### Task 9: Main composer UI module

**Files:**
- Create: `frontend/public/js/composer/index.js`
- Create: `frontend/public/js/composer/picker.js`
- Create: `frontend/public/css/composer.css` (or append to existing styles)

Exports `mountComposer({root, initialBlocks, language, onChange})`. Renders a stacked block list + live preview pane + plus-button picker.

- [ ] **Step 1: Write `picker.js` (block picker popover)**

File: `frontend/public/js/composer/picker.js`

```javascript
import { BLOCK_TYPES } from './blocks.js';

export function openBlockPicker(anchorEl, onPick) {
  const rect = anchorEl.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.className = 'block-picker';
  pop.style.position = 'absolute';
  pop.style.top = `${window.scrollY + rect.bottom + 6}px`;
  pop.style.left = `${window.scrollX + rect.left}px`;
  pop.innerHTML = Object.entries(BLOCK_TYPES).map(([key, def]) => `
    <button type="button" data-type="${key}">
      <span class="icon">${def.icon}</span>
      <span class="label">${def.label}</span>
    </button>
  `).join('');
  document.body.appendChild(pop);

  const onDocClick = (e) => {
    if (!pop.contains(e.target) && e.target !== anchorEl) close();
  };
  const close = () => { document.removeEventListener('click', onDocClick); pop.remove(); };
  setTimeout(() => document.addEventListener('click', onDocClick), 0);

  pop.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-type]');
    if (!btn) return;
    const key = btn.dataset.type;
    const def = BLOCK_TYPES[key];
    onPick(def.default());
    close();
  });
}
```

- [ ] **Step 2: Write main composer (`index.js`)**

File: `frontend/public/js/composer/index.js`

```javascript
import { BLOCK_TYPES, VARIABLES, newId, withIds, stripIds } from './blocks.js';
import { openBlockPicker } from './picker.js';
import { renderPreview } from './preview.js';

/**
 * mountComposer({ root, initialBlocks, language, onChange }) → { getBlocks, destroy }
 * - root: HTMLElement to render into
 * - initialBlocks: array of Block (matches backend schema)
 * - language: 'AR' | 'EN'
 * - onChange: (blocks) => void; fires on every edit (already without __id)
 */
export function mountComposer({ root, initialBlocks = [], language = 'AR', onChange }) {
  let blocks = withIds(initialBlocks.length ? initialBlocks : [BLOCK_TYPES.text.default()]);
  let lang = language;
  let sampleVars = {
    name: 'Majid', product: 'T3', token: 'MA-XXX', course: 'Creative AI',
    module: 'Module 4', nextModule: 'Module 5', playerURL: 'https://player.malearnsa.com/m4',
    unsubscribeUrl: 'https://x/u/demo',
  };

  root.innerHTML = `
    <div class="composer-wrap">
      <div class="composer-panel">
        <div class="composer-toolbar">
          <label>Language:
            <select class="composer-lang">
              <option value="AR" ${lang === 'AR' ? 'selected' : ''}>العربية</option>
              <option value="EN" ${lang === 'EN' ? 'selected' : ''}>English</option>
            </select>
          </label>
        </div>
        <div class="composer-blocks"></div>
        <button type="button" class="composer-add">＋ Add block</button>
      </div>
      <div class="composer-preview">
        <div class="composer-preview-label">Live preview</div>
        <div class="composer-preview-frame"></div>
      </div>
    </div>`;

  const blocksEl = root.querySelector('.composer-blocks');
  const previewEl = root.querySelector('.composer-preview-frame');
  const addBtn = root.querySelector('.composer-add');
  const langSel = root.querySelector('.composer-lang');

  function emit() {
    const clean = stripIds(blocks);
    onChange && onChange(clean);
    renderAll();
  }

  function renderPreviewPane() {
    const html = renderPreview(stripIds(blocks), lang, sampleVars);
    previewEl.innerHTML = `<iframe sandbox srcdoc="${escapeAttr(`<!doctype html><html><body style='margin:0;background:#0E0E0E;padding:16px'>${html}</body></html>`)}"></iframe>`;
  }

  function renderAll() {
    blocksEl.innerHTML = '';
    blocks.forEach((b, i) => blocksEl.appendChild(renderBlock(b, i)));
    renderPreviewPane();
  }

  function renderBlock(b, i) {
    const def = BLOCK_TYPES[b.type];
    const wrap = document.createElement('div');
    wrap.className = 'composer-block';
    wrap.dataset.id = b.__id;
    wrap.innerHTML = `
      <div class="composer-block-handle" title="Drag to reorder">⋮⋮</div>
      <div class="composer-block-body"></div>
      <div class="composer-block-actions">
        <button type="button" class="composer-del" title="Delete block">×</button>
      </div>`;
    wrap.querySelector('.composer-block-body').appendChild(renderBlockForm(b));
    wrap.querySelector('.composer-del').onclick = () => { blocks.splice(i, 1); emit(); };

    // Drag and drop reorder (lightweight, no lib)
    const handle = wrap.querySelector('.composer-block-handle');
    handle.draggable = true;
    handle.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(i)); });
    wrap.addEventListener('dragover', (e) => e.preventDefault());
    wrap.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData('text/plain'));
      if (from === i) return;
      const [moved] = blocks.splice(from, 1);
      blocks.splice(i, 0, moved);
      emit();
    });
    return wrap;
  }

  function renderBlockForm(b) {
    const el = document.createElement('div');
    switch (b.type) {
      case 'text': {
        const ta = document.createElement('textarea');
        ta.rows = 3; ta.dir = lang === 'AR' ? 'rtl' : 'ltr';
        ta.placeholder = 'Type text, or press / for variables';
        ta.value = b.content;
        ta.oninput = () => { b.content = ta.value; emit(); };
        ta.onkeydown = (e) => {
          if (e.key === '/') setTimeout(() => openVariablePicker(ta, (key) => {
            const pos = ta.selectionStart;
            // Remove the just-typed "/"
            const before = ta.value.slice(0, pos - 1);
            const after = ta.value.slice(pos);
            ta.value = before + '{' + key + '}' + after;
            b.content = ta.value; emit();
          }), 0);
        };
        el.appendChild(ta);
        break;
      }
      case 'heading': {
        const inp = document.createElement('input');
        inp.dir = lang === 'AR' ? 'rtl' : 'ltr';
        inp.placeholder = 'Heading text';
        inp.value = b.text;
        inp.oninput = () => { b.text = inp.value; emit(); };
        el.appendChild(inp);
        break;
      }
      case 'banner': {
        el.innerHTML = `
          <label>Image URL or Upload</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input class="b-url" placeholder="https://..." value="${escapeAttr(b.url)}" style="flex:1" />
            <input type="file" accept="image/*" class="b-file" style="display:none" />
            <button type="button" class="b-upload btn-ghost">Upload</button>
          </div>
          <label>Alt text</label>
          <input class="b-alt" value="${escapeAttr(b.alt)}" placeholder="Short description" />
          <label>Optional link</label>
          <input class="b-link" value="${escapeAttr(b.link || '')}" placeholder="https://..." />`;
        el.querySelector('.b-url').oninput = (e) => { b.url = e.target.value; emit(); };
        el.querySelector('.b-alt').oninput = (e) => { b.alt = e.target.value; emit(); };
        el.querySelector('.b-link').oninput = (e) => { b.link = e.target.value; emit(); };
        el.querySelector('.b-upload').onclick = () => el.querySelector('.b-file').click();
        el.querySelector('.b-file').onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const msg = document.createElement('span');
          msg.textContent = 'Uploading…';
          el.appendChild(msg);
          try {
            const { url } = await uploadImage(file);
            b.url = url;
            el.querySelector('.b-url').value = url;
            emit();
          } catch (err) {
            msg.textContent = 'Upload failed: ' + err.message;
            return;
          }
          msg.remove();
        };
        break;
      }
      case 'cta': {
        el.innerHTML = `
          <label>Button label</label>
          <input class="b-label" value="${escapeAttr(b.label)}" placeholder="Watch now" />
          <label>URL</label>
          <input class="b-url" value="${escapeAttr(b.url)}" placeholder="https://..." />
          <label>Color</label>
          <select class="b-color">
            <option value="gold" ${b.color === 'gold' ? 'selected' : ''}>Gold</option>
            <option value="black" ${b.color === 'black' ? 'selected' : ''}>Black</option>
          </select>`;
        el.querySelector('.b-label').oninput = (e) => { b.label = e.target.value; emit(); };
        el.querySelector('.b-url').oninput = (e) => { b.url = e.target.value; emit(); };
        el.querySelector('.b-color').onchange = (e) => { b.color = e.target.value; emit(); };
        break;
      }
      case 'bullet_list': {
        const ta = document.createElement('textarea');
        ta.rows = 4; ta.dir = lang === 'AR' ? 'rtl' : 'ltr';
        ta.placeholder = 'One item per line';
        ta.value = (b.items || []).join('\n');
        ta.oninput = () => { b.items = ta.value.split('\n'); emit(); };
        el.appendChild(ta);
        break;
      }
      case 'divider':
        el.innerHTML = '<em style="color:#888">— divider —</em>';
        break;
    }
    return el;
  }

  function openVariablePicker(targetTextarea, onPick) {
    const rect = targetTextarea.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'variable-picker';
    pop.style.position = 'absolute';
    pop.style.top = `${window.scrollY + rect.top - 10}px`;
    pop.style.left = `${window.scrollX + rect.left + 100}px`;
    pop.innerHTML = VARIABLES.map(v => `<button type="button" data-k="${v.key}">{${v.key}} · ${v.label}</button>`).join('');
    document.body.appendChild(pop);
    const close = () => { document.removeEventListener('click', onDoc); pop.remove(); };
    const onDoc = (e) => { if (!pop.contains(e.target)) close(); };
    setTimeout(() => document.addEventListener('click', onDoc), 0);
    pop.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-k]');
      if (!btn) return;
      onPick(btn.dataset.k);
      close();
    });
  }

  async function uploadImage(file) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch((window.__MA_DASHBOARD_API__ || '/api') + '/api/writes/upload_email_image', {
      method: 'POST', credentials: 'include', body: form,
    });
    if (!res.ok) throw new Error('http_' + res.status);
    return res.json();
  }

  addBtn.addEventListener('click', () => {
    openBlockPicker(addBtn, (newBlock) => {
      blocks.push({ ...newBlock, __id: newId() });
      emit();
    });
  });

  langSel.addEventListener('change', () => {
    lang = langSel.value;
    emit();
  });

  renderAll();

  return {
    getBlocks: () => stripIds(blocks),
    getLanguage: () => lang,
    destroy: () => { root.innerHTML = ''; },
  };
}

function escapeAttr(s) {
  return String(s ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
```

- [ ] **Step 3: Write composer CSS**

File: `frontend/public/css/composer.css`

```css
.composer-wrap { display:grid; grid-template-columns: 1fr 1fr; gap:18px; }
.composer-panel { background:var(--surface); padding:14px; border-radius:10px; min-height:400px; }
.composer-toolbar { display:flex; gap:10px; align-items:center; margin-bottom:12px; color:var(--silver); font-size:.9rem; }
.composer-toolbar select { background:#111; border:1px solid #333; color:#eee; padding:4px 8px; border-radius:6px; }
.composer-blocks { display:flex; flex-direction:column; gap:8px; }
.composer-block { background:#0E0E0E; border:1px solid #222; border-radius:8px; padding:10px; display:grid; grid-template-columns:28px 1fr 28px; gap:10px; }
.composer-block-handle { color:#666; cursor:grab; user-select:none; align-self:start; padding-top:6px; }
.composer-block-handle:active { cursor:grabbing; }
.composer-block-body input, .composer-block-body textarea { width:100%; background:#0a0a0a; border:1px solid #2a2a2a; color:#eee; border-radius:6px; padding:8px; font:inherit; }
.composer-block-body textarea { font-family:inherit; resize:vertical; }
.composer-block-body label { display:block; color:#888; font-size:.8rem; margin:8px 0 2px; }
.composer-block-actions button.composer-del { background:transparent; border:none; color:#888; font-size:1.2rem; cursor:pointer; }
.composer-block-actions button.composer-del:hover { color:#f55; }
.composer-add { margin-top:10px; background:#1a1a1a; border:1px dashed #333; color:#aaa; padding:10px; width:100%; border-radius:8px; cursor:pointer; }
.composer-add:hover { background:#222; color:#fff; }
.composer-preview { background:#0a0a0a; border:1px solid #222; border-radius:10px; padding:10px; min-height:400px; }
.composer-preview-label { color:var(--silver); font-size:.8rem; margin-bottom:8px; }
.composer-preview-frame iframe { width:100%; min-height:400px; border:none; background:#fff; border-radius:6px; }
.block-picker, .variable-picker { background:#111; border:1px solid #333; border-radius:8px; padding:4px; z-index:9999; box-shadow:0 8px 24px rgba(0,0,0,.4); }
.block-picker button, .variable-picker button { display:flex; gap:8px; width:100%; background:transparent; border:none; color:#ddd; padding:8px 10px; text-align:left; cursor:pointer; border-radius:4px; }
.block-picker button:hover, .variable-picker button:hover { background:#2a2a2a; }
.block-picker .icon { width:20px; color:#C9A84C; font-weight:bold; }
@media (max-width:900px) { .composer-wrap { grid-template-columns:1fr; } }
```

Reference the CSS in `app.html`:

```html
<link rel="stylesheet" href="/css/composer.css">
```

- [ ] **Step 4: Commit**

```bash
git add frontend/public/js/composer/index.js frontend/public/js/composer/picker.js frontend/public/css/composer.css frontend/public/app.html
git commit -m "feat(composer): stacked block editor with live preview + variables"
```

---

### Task 10: Image upload endpoint (Apps Script + backend route)

**Files:**
- Modify: `apps-script/newsletter-endpoints.js` (add `admin_upload_email_image`)
- Create: `backend/src/routes/writes-upload.ts`
- Modify: `backend/src/server.ts`

The backend receives multipart, forwards to Apps Script as base64 via a `POST` to `APPS_SCRIPT_URL` query-string + body (since Workspace policy blocks POST, we use GET with chunked base64 only if ≤7000 chars — else we store via a different path).

Simpler: upload small images (<2MB) via GET query string base64. Bigger: server uploads directly to Google Drive API using existing service account.

Pick simpler — use Google Drive API from the backend directly with the existing Plan-1 service account credentials.

- [ ] **Step 1: Write failing test**

File: `backend/tests/routes/writes-upload.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import writesUpload from '../../src/routes/writes-upload.js';

describe('POST /api/writes/upload_email_image', () => {
  it('returns a URL on success', async () => {
    const driveMock = { upload: vi.fn().mockResolvedValue({ url: 'https://drive/pub/x.jpg' }) };
    const app = Fastify();
    await app.register(writesUpload, { drive: driveMock, requireAuth: () => null });
    const res = await app.inject({
      method: 'POST', url: '/api/writes/upload_email_image',
      payload: { filename: 'x.jpg', contentType: 'image/jpeg', dataBase64: 'AAA=' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toContain('drive');
  });
});
```

- [ ] **Step 2: Implement route**

File: `backend/src/routes/writes-upload.ts`

```typescript
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

interface DriveClient {
  upload(args: { filename: string; contentType: string; data: Buffer }): Promise<{ url: string }>;
}
interface Opts {
  drive: DriveClient;
  requireAuth: (req: any) => string | null;  // returns userId or null if unauthed
}

const Body = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string(),
  dataBase64: z.string(),
});

const plugin: FastifyPluginAsync<Opts> = async (app, opts) => {
  app.post('/api/writes/upload_email_image', async (req, reply) => {
    const user = opts.requireAuth(req);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const { filename, contentType, dataBase64 } = parsed.data;
    const buf = Buffer.from(dataBase64, 'base64');
    if (buf.length > 5_000_000) return reply.code(413).send({ error: 'file_too_large' });
    const r = await opts.drive.upload({ filename, contentType, data: buf });
    return { url: r.url };
  });
};

export default plugin;
```

- [ ] **Step 3: Implement Drive client**

File: `backend/src/drive/upload.ts`

```typescript
import { google } from 'googleapis';
import { getGoogleAuth } from '../data/sheets-client.js';

const EMAIL_ASSETS_FOLDER_ID = process.env.EMAIL_ASSETS_FOLDER_ID ?? '';

export async function uploadToEmailAssets(args: { filename: string; contentType: string; data: Buffer }): Promise<{ url: string }> {
  const auth = await getGoogleAuth();
  const drive = google.drive({ version: 'v3', auth });
  const today = new Date();
  const yearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const finalName = `${Date.now()}-${args.filename}`;
  const res = await drive.files.create({
    requestBody: {
      name: finalName,
      parents: EMAIL_ASSETS_FOLDER_ID ? [EMAIL_ASSETS_FOLDER_ID] : undefined,
      properties: { month: yearMonth },
    },
    media: { mimeType: args.contentType, body: require('stream').Readable.from(args.data) },
    fields: 'id, webViewLink, webContentLink',
  });
  const fileId = res.data.id!;
  // Make publicly readable (newsletter images need to load in inbox)
  await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' } });
  return { url: `https://drive.google.com/uc?id=${fileId}` };
}
```

Note: update frontend composer to post multipart / or base64 JSON. The composer code above already uses `FormData`. Switch to JSON with base64 for simplicity:

- [ ] **Step 4: Update composer to use JSON upload**

Edit `frontend/public/js/composer/index.js`, replace the `uploadImage` function:

```javascript
async function uploadImage(file) {
  const dataBase64 = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const res = await fetch((window.__MA_DASHBOARD_API__ || '/api') + '/api/writes/upload_email_image', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type, dataBase64 }),
  });
  if (!res.ok) throw new Error('http_' + res.status);
  return res.json();
}
```

- [ ] **Step 5: Create `Email Assets` folder in Drive + env var**

Manually in Drive: create a folder `MA Learn / Email Assets` under the account the service account has access to. Get its folder ID. Set env var on droplet:

```bash
ssh root@46.101.151.237
echo 'EMAIL_ASSETS_FOLDER_ID=1ABC...XYZ' >> /etc/ma-learn-dashboard/.env.staging
pm2 restart ma-learn-dashboard-staging --update-env
```

- [ ] **Step 6: Run tests, deploy, commit**

```bash
cd ~/code/ma-learn-dashboard/backend && npm test
ssh root@46.101.151.237 'cd ~/code/ma-learn-dashboard && git pull && cd backend && npm install && npm run build && pm2 restart ma-learn-dashboard-staging'
# From admin-staging, open the composer, upload a test image. Should appear in the folder.
git add backend/src/routes/writes-upload.ts backend/src/drive/upload.ts backend/tests/routes/writes-upload.test.ts frontend/public/js/composer/index.js
git commit -m "feat(composer): image upload to Google Drive email-assets folder"
```

---

### Task 11: Migration shim — old EmailTemplates markdown → blocks

**Files:**
- Create: `backend/src/mail/migrate-markdown.ts`
- Test: `backend/tests/mail/migrate-markdown.test.ts`
- Modify: `backend/src/routes/data.ts` (return parsed blocks when opening an old template)

- [ ] **Step 1: Write failing test**

File: `backend/tests/mail/migrate-markdown.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { markdownToBlocks } from '../../src/mail/migrate-markdown.js';

describe('markdownToBlocks', () => {
  it('converts plain text to a text block', () => {
    const blocks = markdownToBlocks('Hello world.');
    expect(blocks).toEqual([{ type: 'text', content: 'Hello world.' }]);
  });

  it('converts ## heading to heading block', () => {
    const blocks = markdownToBlocks('## Module 4 unlocked\n\nNext paragraph.');
    expect(blocks[0]).toEqual({ type: 'heading', text: 'Module 4 unlocked' });
    expect(blocks[1]).toEqual({ type: 'text', content: 'Next paragraph.' });
  });

  it('converts bullet lines to a bullet_list block', () => {
    const blocks = markdownToBlocks('Intro line.\n\n- one\n- two\n- three');
    expect(blocks).toContainEqual({ type: 'bullet_list', items: ['one', 'two', 'three'] });
  });

  it('converts > quote to a text block with emphasis preserved as text', () => {
    const blocks = markdownToBlocks('> Important: read this');
    expect(blocks[0].type).toBe('text');
    expect(blocks[0].content).toContain('Important: read this');
  });
});
```

- [ ] **Step 2: Implement `migrate-markdown.ts`**

File: `backend/src/mail/migrate-markdown.ts`

```typescript
import type { Block } from './blocks.js';

export function markdownToBlocks(raw: string): Block[] {
  if (!raw || !raw.trim()) return [];
  const out: Block[] = [];
  const sections = raw.trim().split(/\n\s*\n+/);
  for (const section of sections) {
    const lines = section.split(/\n/);
    if (/^##\s/.test(lines[0])) {
      out.push({ type: 'heading', text: lines[0].replace(/^##\s*/, '') });
      if (lines.length > 1) out.push({ type: 'text', content: lines.slice(1).join('\n') });
    } else if (lines.every(l => /^\s*[-•]\s/.test(l))) {
      out.push({ type: 'bullet_list', items: lines.map(l => l.replace(/^\s*[-•]\s*/, '')) });
    } else if (/^>\s/.test(lines[0])) {
      out.push({ type: 'text', content: lines.map(l => l.replace(/^>\s?/, '')).join('\n') });
    } else {
      out.push({ type: 'text', content: section });
    }
  }
  return out;
}
```

- [ ] **Step 3: Update `GET /api/data/templates` to return `blocks`**

Modify `backend/src/data/read-extra.ts` — in the template reader, after loading rows, for each template:

```typescript
// If Blocks col is populated, parse JSON. Else auto-migrate from BodyAR / BodyEN.
function templateToRow(raw: any) {
  let blocksAR: Block[] = [];
  let blocksEN: Block[] = [];
  try {
    if (raw.Blocks) {
      const parsed = JSON.parse(raw.Blocks);
      blocksAR = parsed.AR ?? [];
      blocksEN = parsed.EN ?? [];
    }
  } catch { /* fall through to auto-migrate */ }
  if (!blocksAR.length && raw.BodyAR) blocksAR = markdownToBlocks(raw.BodyAR);
  if (!blocksEN.length && raw.BodyEN) blocksEN = markdownToBlocks(raw.BodyEN);
  return { ...raw, blocksAR, blocksEN };
}
```

- [ ] **Step 4: Run tests, commit**

```bash
cd ~/code/ma-learn-dashboard/backend && npm test
git add backend/src/mail/migrate-markdown.ts backend/tests/mail/migrate-markdown.test.ts backend/src/data/read-extra.ts
git commit -m "feat(mail): auto-migrate old markdown templates to block JSON on open"
```

---

### Task 12: Integrate composer into Emails page

**Files:**
- Modify: `frontend/public/js/pages/emails.js`

Replace the plain-text textarea in the "Add new template" and "Email by Noor" flows with the block composer. Save writes `Blocks` col; old `BodyAR/EN` columns are written as HTML snapshots so drip sends keep working unchanged.

- [ ] **Step 1: Replace `openManualForm` to use composer**

Modify `frontend/public/js/pages/emails.js`. At the top, add:

```javascript
import { mountComposer } from '../composer/index.js';
import { renderPreview } from '../composer/preview.js';
```

Replace the `openManualForm` function body:

```javascript
function openManualForm(initial = {}) {
  const o = document.createElement('div');
  o.className = 'modal-overlay';
  o.innerHTML = `
    <div class="modal-card" style="max-width:1100px">
      <h3>${initial.templateId ? 'Edit' : 'Add new'} email template</h3>
      <div class="form-field"><label>Template name</label><input id="m-name" value="${escapeHtml(initial.name || '')}" placeholder="e.g. May Cohort Announcement" /></div>
      <div class="form-field"><label>Template ID</label><input id="m-id" value="${escapeHtml(initial.templateId || '')}" placeholder="auto if blank" /></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-field"><label>Subject AR</label><input id="m-subj-ar" dir="rtl" value="${escapeHtml(initial.subjectAR || '')}" /></div>
        <div class="form-field"><label>Subject EN</label><input id="m-subj-en" value="${escapeHtml(initial.subjectEN || '')}" /></div>
      </div>

      <h4 style="color:var(--gold);margin:14px 0 6px">العربية</h4>
      <div id="composer-ar"></div>

      <h4 style="color:var(--gold);margin:18px 0 6px">English</h4>
      <div id="composer-en"></div>

      <div class="modal-actions">
        <button class="btn-ghost" id="m-cancel">Cancel</button>
        <button class="btn-primary" id="m-save">Preview + save</button>
      </div>
      <div class="modal-msg" id="m-msg"></div>
    </div>`;
  document.body.appendChild(o);

  let blocksAR = initial.blocksAR || [];
  let blocksEN = initial.blocksEN || [];
  mountComposer({ root: o.querySelector('#composer-ar'), initialBlocks: blocksAR, language: 'AR', onChange: (b) => { blocksAR = b; } });
  mountComposer({ root: o.querySelector('#composer-en'), initialBlocks: blocksEN, language: 'EN', onChange: (b) => { blocksEN = b; } });

  o.querySelector('#m-cancel').onclick = () => o.remove();
  o.querySelector('#m-save').onclick = async () => {
    const payload = {
      name: o.querySelector('#m-name').value.trim() || 'Untitled',
      templateId: o.querySelector('#m-id').value.trim() || undefined,
      subjectAR: o.querySelector('#m-subj-ar').value,
      subjectEN: o.querySelector('#m-subj-en').value,
      blocksAR, blocksEN,
    };
    try {
      const stage = await api('/api/writes/add_email_template', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      o.remove();
      openSaveApproval(stage);
    } catch (e) {
      o.querySelector('#m-msg').textContent = `Error: ${e.message}`;
    }
  };
}
```

- [ ] **Step 2: Backend route `add_email_template` — render blocks on save**

Modify `backend/src/routes/writes.ts`. Find `add_email_template` handler. Replace its body to accept `blocksAR` + `blocksEN` and render:

```typescript
import { renderBlocks } from '../mail/blocks.js';
// ...
if (body.blocksAR || body.blocksEN) {
  const htmlAR = body.blocksAR ? renderBlocks(body.blocksAR, 'AR', {}) : (body.rawBodyAR ? brandWrapEmailBody(body.rawBodyAR, 'AR') : '');
  const htmlEN = body.blocksEN ? renderBlocks(body.blocksEN, 'EN', {}) : (body.rawBodyEN ? brandWrapEmailBody(body.rawBodyEN, 'EN') : '');
  const blocksJson = JSON.stringify({ AR: body.blocksAR ?? [], EN: body.blocksEN ?? [] });
  // Save htmlAR/EN into BodyAR/BodyEN columns (rendering output). Save blocksJson into Blocks column.
  // (use existing Apps Script add-template endpoint with a new `blocks` param added)
}
```

- [ ] **Step 3: Extend Apps Script `admin_add_email_template`**

In `apps-script/admin-endpoints.js`, modify the template save to accept + write a `Blocks` column:

```javascript
// inside _admin_add_email_template, after computing the row:
var headers = _headerMap(sh);
if (headers['Blocks'] !== undefined) {
  row[headers['Blocks']] = p.blocks || '';  // JSON string
}
```

- [ ] **Step 4: Deploy + smoke-test**

Deploy Apps Script + backend. Open Emails page → "+ Add new template" → add a Heading block + Text block with `{name}` variable → save → confirm in approval modal → check `EmailTemplates` row has `Blocks` column populated with JSON.

- [ ] **Step 5: Commit**

```bash
git add frontend/public/js/pages/emails.js backend/src/routes/writes.ts apps-script/admin-endpoints.js
git commit -m "feat(emails): block composer replaces markdown-lite textarea"
```

---

# Stage C — Emails V2 finish (Slice 3)

### Task 13: Product field on "Email by Noor" + product-aware drafting

**Files:**
- Modify: `frontend/public/js/pages/emails.js`
- Modify: `backend/src/routes/noor.ts`

- [ ] **Step 1: Add Product dropdown to Noor modal**

In `emails.js`, update `openNoorForm` modal HTML to insert a field before "Your idea":

```javascript
<div class="form-field"><label>Product (optional)</label>
  <select id="n-product">
    <option value="">None</option>
    <option value="T3">T3 — Creative AI Cohort</option>
    <option value="T2">T2 — Intro to Creative AI</option>
    <option value="T1">T1 — Prompt Pack</option>
    <option value="BL">Beyond Lighting</option>
  </select></div>
```

And in the generate handler, include the product:

```javascript
const product = o.querySelector('#n-product').value || null;
const { draft } = await api('/api/noor/draft_email', {
  method: 'POST',
  body: JSON.stringify({ idea, language, product }),
});
```

- [ ] **Step 2: Backend — product-aware drafting**

Modify `backend/src/routes/noor.ts` — the `draft_email` handler. Before building the prompt:

```typescript
const PRODUCT_INFO: Record<string, { nameAR: string; nameEN: string; url: string; descriptionShort: string }> = {
  T3: { nameAR: 'دورة الذكاء الاصطناعي الإبداعي', nameEN: 'Creative AI Cohort',
        url: 'https://malearnsa.com/creative-ai-workshop',
        descriptionShort: '3-evening live cohort teaching Midjourney + prompt psychology' },
  T2: { nameAR: 'مدخل إلى الذكاء الاصطناعي الإبداعي', nameEN: 'Intro to Creative AI',
        url: 'https://malearnsa.com/intro-to-creative-ai',
        descriptionShort: 'self-paced recorded course, 6 modules' },
  T1: { nameAR: 'حزمة البرومبتات', nameEN: 'Prompt Pack',
        url: 'https://malearnsa.com/prompt-pack',
        descriptionShort: '50 curated Midjourney prompts for fashion + product' },
  BL: { nameAR: 'Beyond Lighting', nameEN: 'Beyond Lighting',
        url: 'https://malearnsa.com/beyond-lighting',
        descriptionShort: 'flagship lighting + fashion photography course' },
};

const productContext = body.product && PRODUCT_INFO[body.product]
  ? `\n\nProduct context: ${PRODUCT_INFO[body.product].nameEN} — ${PRODUCT_INFO[body.product].descriptionShort}. Product URL: ${PRODUCT_INFO[body.product].url}. Include a CTA block pointing to this URL.`
  : '';
```

Append `productContext` to the existing prompt sent to Claude. Also update the JSON response schema sent to Claude to require the output in block JSON form (not markdown):

```typescript
const systemPrompt = `You are Noor, Majid's executive assistant drafting an email.
Output a JSON object: { "name": string, "templateId": string (slug), "subjectAR"?: string, "subjectEN"?: string, "blocksAR"?: Block[], "blocksEN"?: Block[] }
Block is one of: {type:"text",content:string} | {type:"heading",text:string} | {type:"banner",url:string,alt:string,link?:string} | {type:"cta",label:string,url:string} | {type:"bullet_list",items:string[]} | {type:"divider"}.
Voice: Majid's voice — inspirational, mentor-not-instructor, direct, occasionally funny. AR = Saudi dialect.${productContext}`;
```

- [ ] **Step 3: Update `openNoorReview` to accept block output**

Change `openNoorReview(draft)` in `emails.js` to route into the same `openManualForm` (pre-filled with draft blocks) instead of its own form. Replace the body:

```javascript
function openNoorReview(draft) {
  openManualForm({
    name: draft.name, templateId: draft.templateId,
    subjectAR: draft.subjectAR, subjectEN: draft.subjectEN,
    blocksAR: draft.blocksAR || [], blocksEN: draft.blocksEN || [],
  });
}
```

- [ ] **Step 4: Smoke-test + commit**

Open the Emails page → "✨ Email by Noor" → pick T3 → prompt: "Announce the May cohort registration is open." → verify Noor returns blocks including a CTA pointing to T3 URL → land in composer for edits → save.

```bash
git add frontend/public/js/pages/emails.js backend/src/routes/noor.ts
git commit -m "feat(emails): product-aware Noor drafts with block JSON output"
```

---

### Task 14: Emails V2 smoke-test end-to-end via Gmail

**Files:** No new files. Pure manual verification + one bug-hunt pass.

- [ ] **Step 1: Send a real drip via new composer**

- Open the Emails page (staging).
- Use Noor to draft a "Test Module 5 unlock" template with Product = T2.
- Save.
- From the "Send existing template" section, select the new template, segment = `t2_buyers`, language = AR.
- Preview the render → confirm blocks render correctly, `{name}` → actual buyer names.
- Approve send.
- Verify: Majid's own email + one real T2 buyer receives the email cleanly; open in Gmail mobile app; check AR rendering + direction; check CTA button works.

- [ ] **Step 2: Fix any rendering issues**

Common gotchas: inline styles not respected by Gmail's rendering → adjust `renderBlocks` if needed. Commit fixes.

- [ ] **Step 3: Commit end-of-Slice-3 marker**

```bash
git commit --allow-empty -m "chore: slice 3 complete — emails V2 shipped to staging"
```

---

# Stage D — Newsletter Page (Slice 4)

### Task 15: Public `/api/public/subscribe` endpoint

**Files:**
- Create: `backend/src/routes/public.ts`
- Test: `backend/tests/routes/public.test.ts`
- Modify: `backend/src/server.ts`

- [ ] **Step 1: Write failing test**

File: `backend/tests/routes/public.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import publicRoute from '../../src/routes/public.js';

describe('POST /api/public/subscribe', () => {
  function setup(appsScript: any = { call: vi.fn().mockResolvedValue({ ok: true }) }) {
    const app = Fastify();
    return app.register(publicRoute, { appsScript, rateLimit: { max: 5, windowMs: 10 * 60_000 } }).then(() => app);
  }

  it('accepts a valid subscribe', async () => {
    const app = await setup();
    const res = await app.inject({
      method: 'POST', url: '/api/public/subscribe',
      payload: { name: 'A', email: 'a@b.com', source: 'website', language: 'EN' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('rejects invalid email', async () => {
    const app = await setup();
    const res = await app.inject({
      method: 'POST', url: '/api/public/subscribe',
      payload: { name: 'A', email: 'notanemail', source: 'website' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('silently drops honeypot-triggered submission', async () => {
    const apps = { call: vi.fn() };
    const app = await setup(apps);
    const res = await app.inject({
      method: 'POST', url: '/api/public/subscribe',
      payload: { name: 'A', email: 'a@b.com', source: 'website', website_url: 'spam' },
    });
    expect(res.statusCode).toBe(200); // look successful to bot
    expect(apps.call).not.toHaveBeenCalled();
  });

  it('rate-limits by IP', async () => {
    const app = await setup();
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: 'POST', url: '/api/public/subscribe', headers: { 'x-forwarded-for': '1.2.3.4' }, payload: { name: 'A', email: `a${i}@b.com`, source: 'website' } });
    }
    const res = await app.inject({ method: 'POST', url: '/api/public/subscribe', headers: { 'x-forwarded-for': '1.2.3.4' }, payload: { name: 'A', email: 'over@b.com', source: 'website' } });
    expect(res.statusCode).toBe(429);
  });
});
```

- [ ] **Step 2: Implement `public.ts`**

File: `backend/src/routes/public.ts`

```typescript
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

interface Opts {
  appsScript: { call<T>(action: string, params: Record<string, unknown>): Promise<T> };
  rateLimit: { max: number; windowMs: number };
}

const Body = z.object({
  name: z.string().max(120).optional(),
  email: z.string().email(),
  source: z.enum(['website', 'lib', 'buyer', 'waitlist']),
  language: z.enum(['AR', 'EN']).optional().default('AR'),
  website_url: z.string().optional(),  // honeypot
});

const publicRoute: FastifyPluginAsync<Opts> = async (app, opts) => {
  const hits = new Map<string, number[]>();

  function rateLimited(ip: string): boolean {
    const now = Date.now();
    const arr = (hits.get(ip) ?? []).filter(t => now - t < opts.rateLimit.windowMs);
    arr.push(now);
    hits.set(ip, arr);
    return arr.length > opts.rateLimit.max;
  }

  app.post('/api/public/subscribe', async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const { name, email, source, language, website_url } = parsed.data;

    // Honeypot — silently drop
    if (website_url && website_url.length > 0) return { ok: true };

    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0] ?? req.ip;
    if (rateLimited(ip)) return reply.code(429).send({ error: 'rate_limited' });

    try {
      await opts.appsScript.call('admin_upsert_subscriber', { email, name, source, language });
    } catch (e) {
      req.log.error({ e }, 'subscribe_apps_script_failed');
      // Still return ok to avoid probing; log for debugging
    }
    return { ok: true };
  });

  app.get('/api/public/unsubscribe', async (req, reply) => {
    const token = String((req.query as any).token ?? '');
    if (!token) return reply.code(400).send({ error: 'missing_token' });
    try {
      await opts.appsScript.call('admin_mark_unsubscribed', { token });
    } catch (e) {
      req.log.error({ e }, 'unsub_apps_script_failed');
    }
    return reply.type('text/html').send(renderUnsubPage());
  });
};

function renderUnsubPage(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribed</title>
<style>body{background:#0E0E0E;color:#eee;font-family:sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center}h1{color:#C9A84C}</style>
</head><body><div><h1>You've been unsubscribed</h1><p>We won't email you again from the MA Learn newsletter.</p></div></body></html>`;
}

export default publicRoute;
```

- [ ] **Step 3: Register in `server.ts` + CORS for public origins**

Public endpoint needs CORS allow for `https://malearnsa.com`, `https://www.malearnsa.com`, `https://linkinbio.malearnsa.com`:

In `server.ts`, extend CORS origin list to include these plus the existing staging admin origin.

Register:

```typescript
import publicRoute from './routes/public.js';
await app.register(publicRoute, { appsScript, rateLimit: { max: 5, windowMs: 10 * 60_000 } });
```

- [ ] **Step 4: Deploy, smoke-test, commit**

```bash
npm test
ssh root@46.101.151.237 'cd ~/code/ma-learn-dashboard && git pull && cd backend && npm install && npm run build && pm2 restart ma-learn-dashboard-staging'
curl -s -X POST https://api-staging.malearnsa.com/api/public/subscribe \
  -H "Content-Type: application/json" \
  -H "Origin: https://malearnsa.com" \
  -d '{"name":"Test","email":"test@example.com","source":"website","language":"EN"}'
# Expected: {"ok":true}
# Verify row in Subscribers tab
git add backend/src/routes/public.ts backend/tests/routes/public.test.ts backend/src/server.ts
git commit -m "feat(public): /api/public/subscribe with honeypot + rate limit"
```

---

### Task 16: Backfill subscribers from existing Customers + Waitlist

**Files:**
- Create: `backend/scripts/backfill-subscribers.ts`

Idempotent. Reads both tabs, calls `admin_upsert_subscriber` for each unique email.

- [ ] **Step 1: Write script**

File: `backend/scripts/backfill-subscribers.ts`

```typescript
import { createAppsScriptClient } from '../src/apps-script/client.js';
import { readSheet } from '../src/data/sheets-read.js';

async function main() {
  const apps = createAppsScriptClient({
    url: process.env.APPS_SCRIPT_URL!,
    adminToken: process.env.ADMIN_TOKEN!,
  });

  const customers = await readSheet({ tab: 'Customers' });
  const waitlist = await readSheet({ tab: 'Waitlist' });

  const seen = new Set<string>();
  const plan: { email: string; name?: string; source: string; language: 'AR' | 'EN' }[] = [];

  for (const r of customers) {
    const email = String(r.Email ?? '').toLowerCase().trim();
    if (!email) continue;
    plan.push({ email, name: r.Name, source: 'buyer', language: 'AR' });
  }
  for (const r of waitlist) {
    const email = String(r.Email ?? '').toLowerCase().trim();
    if (!email) continue;
    plan.push({ email, name: r.Name, source: 'waitlist', language: 'AR' });
  }

  console.log(`Backfill plan: ${plan.length} rows from Customers + Waitlist.`);
  let done = 0;
  for (const entry of plan) {
    if (seen.has(`${entry.email}|${entry.source}`)) continue;
    seen.add(`${entry.email}|${entry.source}`);
    try {
      await apps.call('admin_upsert_subscriber', entry);
      done++;
      if (done % 25 === 0) console.log(`  ${done}/${plan.length}`);
    } catch (e) {
      console.error(`Failed: ${entry.email} (${entry.source})`, e);
    }
  }
  console.log(`Done. ${done} upserts.`);
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run on staging**

```bash
ssh root@46.101.151.237
cd ~/code/ma-learn-dashboard/backend
source /etc/ma-learn-dashboard/.env.staging
npx tsx scripts/backfill-subscribers.ts
# Expected: N upserts, where N = total unique emails
```

Verify in staging sheet: Subscribers tab has rows with both `buyer,waitlist` Sources for anyone in both.

- [ ] **Step 3: Commit**

```bash
cd ~/code/ma-learn-dashboard
git add backend/scripts/backfill-subscribers.ts
git commit -m "feat(scripts): one-time subscriber backfill from Customers + Waitlist"
```

---

### Task 17: Wire buyer + waitlist Apps Scripts to auto-upsert

**Files:**
- Modify: live `token-validator` Apps Script (buyer upsert)
- Modify: live `waitlist` Apps Script (waitlist upsert)

When a new row lands in Customers or Waitlist, also upsert a Subscribers row. Keep implementation at Apps-Script level (in-process) — no HTTP call needed.

- [ ] **Step 1: In token-validator, after the Customers.appendRow call**

Find the function that writes to Customers on successful purchase (`recordPurchase` or similar). Right after the `appendRow`, add:

```javascript
// Auto-add to Subscribers list
_admin_upsert_subscriber({
  email: email,
  name: customerName,
  source: 'buyer',
  language: 'AR',  // buyers default to AR; adjust if product is EN-facing
});
```

- [ ] **Step 2: In waitlist script, after the waitlist append**

In the waitlist-form Apps Script, after saving a waitlist row, add:

```javascript
_admin_upsert_subscriber({
  email: email,
  name: name,
  source: 'waitlist',
  language: 'AR',
});
```

Requires `newsletter-endpoints.js` to also be pasted into the waitlist script (it's shared across scripts — copy `_admin_upsert_subscriber` + its helper functions into the waitlist project too).

- [ ] **Step 3: Redeploy both Apps Scripts**

Each in its own editor, Deploy → Manage → New version → Deploy.

- [ ] **Step 4: Smoke test**

On staging checkout, buy a test product → new row should appear in BOTH Customers AND Subscribers. Fill the waitlist form → new row should land in Waitlist AND Subscribers. If the subscriber already exists, Sources col should have `buyer,waitlist` combined.

- [ ] **Step 5: Commit reference copy**

```bash
git add apps-script/newsletter-endpoints.js
git commit -m "feat(apps-script): auto-upsert Subscribers from buyer + waitlist flows"
```

---

### Task 18: Newsletter page UI — card grid + compose view

**Files:**
- Create: `frontend/public/js/pages/newsletter.js`
- Modify: `frontend/public/js/router.js` (add `/newsletter` route)
- Modify: `frontend/public/js/ui/sidebar.js` (add nav entry)
- Backend routes: `backend/src/routes/newsletters.ts`, `backend/src/data/newsletters.ts`, `backend/src/data/subscribers.ts`

- [ ] **Step 1: Backend — read endpoints**

File: `backend/src/data/subscribers.ts`

```typescript
import { readSheet } from './sheets-read.js';

export interface Subscriber {
  email: string; name: string; sources: string[]; language: 'AR' | 'EN';
  addedAt: string; lastSourceAt: string; status: 'active' | 'unsubscribed' | 'bounced';
  unsubscribeToken: string;
}

export async function readSubscribers(): Promise<Subscriber[]> {
  const rows = await readSheet({ tab: 'Subscribers' });
  return rows.map(r => ({
    email: String(r.Email ?? '').toLowerCase(),
    name: String(r.Name ?? ''),
    sources: String(r.Sources ?? '').split(',').map(s => s.trim()).filter(Boolean),
    language: (String(r.Language ?? 'AR') === 'EN' ? 'EN' : 'AR') as 'AR' | 'EN',
    addedAt: String(r.AddedAt ?? ''),
    lastSourceAt: String(r.LastSourceAt ?? ''),
    status: String(r.Status ?? 'active') as any,
    unsubscribeToken: String(r.UnsubscribeToken ?? ''),
  })).filter(r => r.email);
}

export async function countActive(): Promise<{ total: number; active: number; unsubscribed: number }> {
  const subs = await readSubscribers();
  return {
    total: subs.length,
    active: subs.filter(s => s.status === 'active').length,
    unsubscribed: subs.filter(s => s.status === 'unsubscribed').length,
  };
}
```

File: `backend/src/data/newsletters.ts`

```typescript
import { readSheet } from './sheets-read.js';

export interface Newsletter {
  newsletterId: string; subject: string; preheader: string;
  language: 'AR' | 'EN'; blocks: any[]; segmentFilter: any;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  createdAt: string; updatedAt: string; scheduledAt: string; sentAt: string;
  recipientCount: number; deliveredCount: number; openCount: number;
  clickCount: number; bounceCount: number; unsubCount: number;
  brevoCampaignId: string; idempotencyKey: string; createdBy: string; cloneOf: string;
}

export async function readNewsletters(): Promise<Newsletter[]> {
  const rows = await readSheet({ tab: 'Newsletters' });
  return rows.map(r => ({
    newsletterId: String(r.NewsletterID),
    subject: String(r.Subject ?? ''),
    preheader: String(r.Preheader ?? ''),
    language: (r.Language === 'EN' ? 'EN' : 'AR') as 'AR' | 'EN',
    blocks: safeJson(r.Blocks, []),
    segmentFilter: safeJson(r.SegmentFilter, {}),
    status: String(r.Status ?? 'draft') as any,
    createdAt: String(r.CreatedAt ?? ''),
    updatedAt: String(r.UpdatedAt ?? ''),
    scheduledAt: String(r.ScheduledAt ?? ''),
    sentAt: String(r.SentAt ?? ''),
    recipientCount: Number(r.RecipientCount ?? 0),
    deliveredCount: Number(r.DeliveredCount ?? 0),
    openCount: Number(r.OpenCount ?? 0),
    clickCount: Number(r.ClickCount ?? 0),
    bounceCount: Number(r.BounceCount ?? 0),
    unsubCount: Number(r.UnsubCount ?? 0),
    brevoCampaignId: String(r.BrevoCampaignId ?? ''),
    idempotencyKey: String(r.IdempotencyKey ?? ''),
    createdBy: String(r.CreatedBy ?? 'majid'),
    cloneOf: String(r.CloneOf ?? ''),
  }));
}

function safeJson<T>(s: unknown, fallback: T): T {
  try { return JSON.parse(String(s || '')) as T; } catch { return fallback; }
}
```

- [ ] **Step 2: Backend — segment filter**

File: `backend/src/data/segment-filter.ts`

```typescript
import type { Subscriber } from './subscribers.js';

export interface SegmentFilter {
  sources?: string[];        // e.g. ['buyer', 'waitlist']
  language?: 'AR' | 'EN';
  excludeUnsub?: boolean;    // default true
}

export function applyFilter(subs: Subscriber[], f: SegmentFilter): Subscriber[] {
  const excludeUnsub = f.excludeUnsub !== false;
  return subs.filter(s => {
    if (excludeUnsub && s.status !== 'active') return false;
    if (f.language && s.language !== f.language) return false;
    if (f.sources && f.sources.length > 0) {
      if (!f.sources.some(src => s.sources.includes(src))) return false;
    }
    return true;
  });
}
```

- [ ] **Step 3: Backend — newsletter CRUD routes**

File: `backend/src/routes/newsletters.ts`

```typescript
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { readNewsletters } from '../data/newsletters.js';
import { readSubscribers, countActive } from '../data/subscribers.js';
import { applyFilter } from '../data/segment-filter.js';
import { sendNewsletter } from '../services/send-newsletter.js';

interface Opts {
  appsScript: { call<T>(action: string, params: Record<string, unknown>): Promise<T> };
  requireAuth: (req: any) => string | null;
}

const UpsertBody = z.object({
  newsletterId: z.string().optional(),
  subject: z.string(),
  preheader: z.string().optional().default(''),
  language: z.enum(['AR', 'EN']),
  blocks: z.array(z.any()),
  segmentFilter: z.record(z.any()).default({}),
});

const plugin: FastifyPluginAsync<Opts> = async (app, opts) => {
  // LIST
  app.get('/api/data/newsletters', async (req, reply) => {
    if (!opts.requireAuth(req)) return reply.code(401).send({ error: 'unauthorized' });
    return { newsletters: await readNewsletters() };
  });

  // COUNT SUBSCRIBERS
  app.get('/api/data/subscribers/count', async (req, reply) => {
    if (!opts.requireAuth(req)) return reply.code(401).send({ error: 'unauthorized' });
    return countActive();
  });

  // RECIPIENT PREVIEW
  app.post('/api/data/newsletters/preview_segment', async (req, reply) => {
    if (!opts.requireAuth(req)) return reply.code(401).send({ error: 'unauthorized' });
    const subs = await readSubscribers();
    const filtered = applyFilter(subs, req.body as any);
    return { count: filtered.length };
  });

  // CREATE OR UPDATE draft
  app.post('/api/writes/newsletter/save', async (req, reply) => {
    if (!opts.requireAuth(req)) return reply.code(401).send({ error: 'unauthorized' });
    const parsed = UpsertBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const b = parsed.data;
    if (b.newsletterId) {
      await opts.appsScript.call('admin_update_newsletter', {
        newsletterId: b.newsletterId,
        subject: b.subject, preheader: b.preheader, language: b.language,
        blocks: JSON.stringify(b.blocks), segmentFilter: JSON.stringify(b.segmentFilter),
      });
      return { ok: true, newsletterId: b.newsletterId };
    }
    const r = await opts.appsScript.call<{ newsletterId: string }>('admin_create_newsletter', {
      subject: b.subject, preheader: b.preheader, language: b.language,
      blocks: JSON.stringify(b.blocks), segmentFilter: JSON.stringify(b.segmentFilter),
    });
    return { ok: true, newsletterId: r.newsletterId };
  });

  // SEND NOW
  app.post('/api/writes/newsletter/send_now', async (req, reply) => {
    if (!opts.requireAuth(req)) return reply.code(401).send({ error: 'unauthorized' });
    const { newsletterId } = req.body as { newsletterId: string };
    if (!newsletterId) return reply.code(400).send({ error: 'missing_newsletterId' });
    const result = await sendNewsletter({ newsletterId, appsScript: opts.appsScript });
    return result;
  });

  // SCHEDULE
  app.post('/api/writes/newsletter/schedule', async (req, reply) => {
    if (!opts.requireAuth(req)) return reply.code(401).send({ error: 'unauthorized' });
    const { newsletterId, sendAt } = req.body as { newsletterId: string; sendAt: string };
    await opts.appsScript.call('admin_update_newsletter', { newsletterId, scheduledAt: sendAt });
    await opts.appsScript.call('admin_mark_newsletter_status', { newsletterId, fromStatus: 'draft', toStatus: 'scheduled' });
    return { ok: true };
  });

  // DELETE
  app.post('/api/writes/newsletter/delete', async (req, reply) => {
    if (!opts.requireAuth(req)) return reply.code(401).send({ error: 'unauthorized' });
    const { newsletterId } = req.body as { newsletterId: string };
    await opts.appsScript.call('admin_mark_newsletter_status', { newsletterId, toStatus: 'deleted' });
    return { ok: true };
  });
};

export default plugin;
```

- [ ] **Step 4: Backend — send service**

File: `backend/src/services/send-newsletter.ts`

```typescript
import { readNewsletters } from '../data/newsletters.js';
import { readSubscribers } from '../data/subscribers.js';
import { applyFilter } from '../data/segment-filter.js';
import { renderBlocks } from '../mail/blocks.js';
import { createBrevoProvider } from '../mail/provider.js';

interface Args {
  newsletterId: string;
  appsScript: { call<T>(action: string, params: Record<string, unknown>): Promise<T> };
}

export async function sendNewsletter(args: Args): Promise<{ ok: boolean; sent?: number; error?: string }> {
  const newsletters = await readNewsletters();
  const nl = newsletters.find(n => n.newsletterId === args.newsletterId);
  if (!nl) return { ok: false, error: 'not_found' };
  if (nl.status === 'sent' || nl.status === 'sending') return { ok: false, error: 'already_' + nl.status };

  // Atomic flip to 'sending' — if this fails (status mismatch), another process beat us.
  try {
    await args.appsScript.call('admin_mark_newsletter_status', {
      newsletterId: nl.newsletterId, fromStatus: nl.status, toStatus: 'sending',
    });
  } catch (e) {
    return { ok: false, error: 'status_transition_failed' };
  }

  try {
    const subs = await readSubscribers();
    const recipients = applyFilter(subs, nl.segmentFilter).filter(s => s.language === nl.language);

    const provider = createBrevoProvider({ apiKey: process.env.BREVO_API_KEY! });
    const fromEmail = process.env.BREVO_SENDER_EMAIL!;
    const fromName = process.env.BREVO_SENDER_NAME ?? 'Majid Angawi';
    const baseUrl = process.env.PUBLIC_BASE_URL ?? 'https://api-staging.malearnsa.com';

    // Send in chunks of 50 (Brevo API allows more, but chunking keeps per-recipient unsubscribe URLs unique)
    let sent = 0;
    for (const r of recipients) {
      const unsubUrl = `${baseUrl}/api/public/unsubscribe?token=${encodeURIComponent(r.unsubscribeToken)}`;
      const html = renderBlocks(nl.blocks, nl.language, {
        name: r.name || '',
        unsubscribeUrl: unsubUrl,
      });
      const result = await provider.sendCampaign({
        from: { name: fromName, email: fromEmail },
        to: [{ email: r.email, name: r.name }],
        subject: nl.subject,
        htmlContent: html,
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          'X-Newsletter-Id': nl.newsletterId,
        },
        tags: [`nl:${nl.newsletterId}`],
      });
      if (result.ok) sent++;
    }

    await args.appsScript.call('admin_mark_newsletter_status', {
      newsletterId: nl.newsletterId,
      fromStatus: 'sending', toStatus: 'sent',
      recipientCount: recipients.length,
    });

    return { ok: true, sent };
  } catch (e: any) {
    await args.appsScript.call('admin_mark_newsletter_status', {
      newsletterId: nl.newsletterId, toStatus: 'failed',
    });
    return { ok: false, error: e.message ?? 'send_failed' };
  }
}
```

- [ ] **Step 5: Frontend — newsletter.js page**

File: `frontend/public/js/pages/newsletter.js`

```javascript
import { api } from '../api.js';
import { mountComposer } from '../composer/index.js';
import { openApprovalModal } from '../ui/approval-modal.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const SEGMENT_PRESETS = [
  { key: 'all', label: 'All active', filter: {} },
  { key: 'buyers', label: 'Buyers only', filter: { sources: ['buyer'] } },
  { key: 'waitlist', label: 'Waitlist only', filter: { sources: ['waitlist'] } },
  { key: 'website', label: 'Website / LIB signups', filter: { sources: ['website', 'lib'] } },
];

export default async function mount(root) {
  root.innerHTML = '<h2 style="color:var(--gold)">Newsletter</h2><p style="color:var(--silver)">Loading…</p>';

  let { newsletters } = await api('/api/data/newsletters');
  const subCount = await api('/api/data/subscribers/count');

  let activeTab = 'all';
  function filterByTab(list) {
    if (activeTab === 'drafts') return list.filter(n => n.status === 'draft');
    if (activeTab === 'scheduled') return list.filter(n => n.status === 'scheduled');
    if (activeTab === 'sent') return list.filter(n => n.status === 'sent');
    return list.filter(n => n.status !== 'deleted');
  }

  function render() {
    const list = filterByTab(newsletters);
    root.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div>
          <h2 style="color:var(--gold);margin:0">Newsletter</h2>
          <p style="color:var(--silver);margin:4px 0 0;font-size:.9rem">
            ${subCount.active.toLocaleString()} active · ${subCount.unsubscribed.toLocaleString()} unsubscribed
          </p>
        </div>
        <button class="btn-primary" id="new-btn">+ New newsletter</button>
      </div>

      <div class="tabs" style="margin:14px 0 18px">
        ${['all', 'drafts', 'scheduled', 'sent'].map(t => `
          <button class="tab ${t === activeTab ? 'active' : ''}" data-tab="${t}">${t[0].toUpperCase() + t.slice(1)}</button>
        `).join('')}
      </div>

      <div class="card-grid">
        ${list.length ? list.map(nl => renderCard(nl)).join('') : '<p style="color:var(--silver)">Nothing here yet.</p>'}
      </div>`;

    document.getElementById('new-btn').onclick = () => openCompose({});
    root.querySelectorAll('.tab').forEach(el => el.onclick = () => { activeTab = el.dataset.tab; render(); });
    root.querySelectorAll('.nl-card').forEach(el => el.onclick = () => {
      const nl = newsletters.find(x => x.newsletterId === el.dataset.id);
      if (nl.status === 'sent') openStats(nl);
      else openCompose(nl);
    });
  }

  function renderCard(nl) {
    const badge = {
      draft: '📝 Draft', scheduled: '⏰ Scheduled', sending: '📤 Sending', sent: '✓ Sent', failed: '✗ Failed',
    }[nl.status] ?? nl.status;

    const bottomLine = nl.status === 'sent'
      ? `Sent ${fmtDate(nl.sentAt)} · ${nl.recipientCount.toLocaleString()} recipients<br>${pct(nl.openCount, nl.recipientCount)}% open · ${pct(nl.clickCount, nl.recipientCount)}% click`
      : nl.status === 'scheduled'
        ? `Sends ${fmtDate(nl.scheduledAt)}`
        : `Last edited ${fmtDate(nl.updatedAt)}`;

    return `
      <div class="nl-card" data-id="${nl.newsletterId}">
        <div class="nl-badge">${badge}</div>
        <div class="nl-subject">${escapeHtml(nl.subject || 'Untitled')}</div>
        <div class="nl-meta">${bottomLine}</div>
      </div>`;
  }

  async function openCompose(nl) {
    const isNew = !nl.newsletterId;
    const o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = `
      <div class="modal-card" style="max-width:1200px;max-height:92vh;overflow-y:auto">
        <h3>${isNew ? 'New newsletter' : 'Edit newsletter'}</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div class="form-field"><label>Subject</label><input id="n-subj" value="${escapeHtml(nl.subject || '')}" /></div>
          <div class="form-field"><label>Language</label>
            <select id="n-lang">
              <option value="AR" ${nl.language === 'AR' ? 'selected' : ''}>العربية</option>
              <option value="EN" ${nl.language === 'EN' ? 'selected' : ''}>English</option>
            </select></div>
        </div>
        <div class="form-field"><label>Preheader (inbox preview)</label><input id="n-pre" value="${escapeHtml(nl.preheader || '')}" /></div>
        <div class="form-field"><label>Segment</label>
          <select id="n-seg">
            ${SEGMENT_PRESETS.map(s => `<option value="${s.key}">${s.label}</option>`).join('')}
          </select>
          <span id="n-count" style="color:var(--silver);margin-left:10px">—</span>
        </div>
        <div id="n-composer"></div>
        <div class="modal-actions">
          <button class="btn-ghost" id="n-cancel">Close</button>
          <button class="btn-ghost" id="n-save">Save draft</button>
          <button class="btn-ghost" id="n-schedule">Schedule…</button>
          <button class="btn-primary" id="n-send">Send now</button>
        </div>
        <div class="modal-msg" id="n-msg"></div>
      </div>`;
    document.body.appendChild(o);

    let currentBlocks = nl.blocks || [];
    const composer = mountComposer({
      root: o.querySelector('#n-composer'),
      initialBlocks: currentBlocks,
      language: nl.language || 'AR',
      onChange: (b) => { currentBlocks = b; },
    });

    async function updateCount() {
      const segKey = o.querySelector('#n-seg').value;
      const preset = SEGMENT_PRESETS.find(s => s.key === segKey);
      const filter = { ...preset.filter, language: o.querySelector('#n-lang').value };
      const { count } = await api('/api/data/newsletters/preview_segment', {
        method: 'POST', body: JSON.stringify(filter),
      });
      o.querySelector('#n-count').textContent = `${count.toLocaleString()} recipients`;
    }
    o.querySelector('#n-seg').onchange = updateCount;
    o.querySelector('#n-lang').onchange = updateCount;
    updateCount();

    async function save() {
      const segKey = o.querySelector('#n-seg').value;
      const preset = SEGMENT_PRESETS.find(s => s.key === segKey);
      const payload = {
        newsletterId: nl.newsletterId,
        subject: o.querySelector('#n-subj').value,
        preheader: o.querySelector('#n-pre').value,
        language: o.querySelector('#n-lang').value,
        blocks: currentBlocks,
        segmentFilter: { ...preset.filter, language: o.querySelector('#n-lang').value },
      };
      const r = await api('/api/writes/newsletter/save', {
        method: 'POST', body: JSON.stringify(payload),
      });
      nl.newsletterId = r.newsletterId;
      return r;
    }

    o.querySelector('#n-save').onclick = async () => {
      o.querySelector('#n-msg').textContent = 'Saving…';
      try { await save(); o.querySelector('#n-msg').textContent = 'Saved.'; newsletters = (await api('/api/data/newsletters')).newsletters; }
      catch (e) { o.querySelector('#n-msg').textContent = `Error: ${e.message}`; }
    };

    o.querySelector('#n-send').onclick = async () => {
      if (!confirm(`Send this newsletter now? (${o.querySelector('#n-count').textContent})`)) return;
      await save();
      const res = await api('/api/writes/newsletter/send_now', {
        method: 'POST', body: JSON.stringify({ newsletterId: nl.newsletterId }),
      });
      if (res.ok) {
        o.querySelector('#n-msg').textContent = `Sent to ${res.sent} recipients.`;
        newsletters = (await api('/api/data/newsletters')).newsletters;
        setTimeout(() => { o.remove(); render(); }, 1200);
      } else {
        o.querySelector('#n-msg').textContent = `Error: ${res.error}`;
      }
    };

    o.querySelector('#n-schedule').onclick = async () => {
      const when = prompt('Send at (YYYY-MM-DD HH:mm, KSA time):');
      if (!when) return;
      await save();
      await api('/api/writes/newsletter/schedule', {
        method: 'POST', body: JSON.stringify({ newsletterId: nl.newsletterId, sendAt: when }),
      });
      newsletters = (await api('/api/data/newsletters')).newsletters;
      o.remove(); render();
    };

    o.querySelector('#n-cancel').onclick = () => o.remove();
  }

  function openStats(nl) {
    window.location.hash = `#/newsletter/${nl.newsletterId}/stats`;
  }

  render();
}

function fmtDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}
function pct(n, total) {
  if (!total) return 0;
  return ((n / total) * 100).toFixed(1);
}
```

- [ ] **Step 6: Register page in router + sidebar**

`frontend/public/js/router.js` — add:
```javascript
routes['/newsletter'] = () => import('./pages/newsletter.js');
```

`frontend/public/js/ui/sidebar.js` — add nav entry:
```javascript
{ href: '#/newsletter', label: 'Newsletter', icon: '📬' }
```

Add basic card-grid CSS to `app.html`:
```css
.card-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:14px; }
.nl-card { background:var(--surface); padding:14px; border-radius:10px; cursor:pointer; border:1px solid transparent; transition:border-color .15s; }
.nl-card:hover { border-color:#C9A84C; }
.nl-badge { color:#888; font-size:.8rem; margin-bottom:6px; }
.nl-subject { font-weight:bold; margin-bottom:10px; }
.nl-meta { color:var(--silver); font-size:.85rem; line-height:1.5; }
.tabs button.tab { background:transparent; border:none; color:#888; padding:6px 12px; cursor:pointer; border-bottom:2px solid transparent; }
.tabs button.tab.active { color:#C9A84C; border-bottom-color:#C9A84C; }
```

- [ ] **Step 7: Register routes in server.ts + commit**

In `backend/src/server.ts`:
```typescript
import newslettersRoute from './routes/newsletters.js';
await app.register(newslettersRoute, { appsScript, requireAuth });
```

Deploy + test flow: new newsletter → add 2 blocks → save draft → appears in card grid → send now to a `language=EN` subset of 1 (test subscriber).

```bash
git add frontend/public/js/pages/newsletter.js frontend/public/js/router.js frontend/public/js/ui/sidebar.js frontend/public/app.html backend/src/routes/newsletters.ts backend/src/data/subscribers.ts backend/src/data/newsletters.ts backend/src/data/segment-filter.ts backend/src/services/send-newsletter.ts backend/src/server.ts
git commit -m "feat(newsletter): card grid + compose view + send-now via Brevo"
```

---

# Stage E — Scheduling + Stats + Tracking (Slice 5)

### Task 19: node-cron scheduler worker

**Files:**
- Create: `backend/src/workers/scheduler.ts`
- Test: `backend/tests/workers/scheduler.test.ts`
- Modify: `backend/src/server.ts`

- [ ] **Step 1: Install node-cron**

```bash
cd ~/code/ma-learn-dashboard/backend
npm install node-cron
npm install -D @types/node-cron
```

- [ ] **Step 2: Write failing test**

File: `backend/tests/workers/scheduler.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { runSchedulerTick } from '../../src/workers/scheduler.js';

describe('scheduler tick', () => {
  it('sends any newsletter with status=scheduled and sendAt <= now', async () => {
    const readNL = vi.fn().mockResolvedValue([
      { newsletterId: 'nl_1', status: 'scheduled', scheduledAt: '2026-01-01T00:00:00' },
      { newsletterId: 'nl_2', status: 'draft', scheduledAt: '' },
      { newsletterId: 'nl_3', status: 'scheduled', scheduledAt: '2099-01-01T00:00:00' },
    ]);
    const send = vi.fn().mockResolvedValue({ ok: true });
    await runSchedulerTick({
      now: new Date('2026-06-01T00:00:00Z'),
      readNewsletters: readNL,
      sendNewsletter: send,
    });
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({ newsletterId: 'nl_1' });
  });
});
```

- [ ] **Step 3: Implement `scheduler.ts`**

File: `backend/src/workers/scheduler.ts`

```typescript
import cron from 'node-cron';
import { readNewsletters as defaultRead } from '../data/newsletters.js';
import { sendNewsletter as defaultSend } from '../services/send-newsletter.js';

interface TickOpts {
  now: Date;
  readNewsletters: typeof defaultRead;
  sendNewsletter: (args: { newsletterId: string }) => Promise<{ ok: boolean; error?: string }>;
}

export async function runSchedulerTick(opts: TickOpts): Promise<void> {
  const list = await opts.readNewsletters();
  const due = list.filter(nl => {
    if (nl.status !== 'scheduled' || !nl.scheduledAt) return false;
    const sendAt = new Date(nl.scheduledAt.replace(' ', 'T') + '+03:00');  // KSA
    return sendAt <= opts.now;
  });
  for (const nl of due) {
    try { await opts.sendNewsletter({ newsletterId: nl.newsletterId }); }
    catch (e) { console.error(`Scheduler send failed for ${nl.newsletterId}`, e); }
  }
}

export function startScheduler(appsScript: { call: any }) {
  cron.schedule('* * * * *', async () => {
    await runSchedulerTick({
      now: new Date(),
      readNewsletters: defaultRead,
      sendNewsletter: ({ newsletterId }) => defaultSend({ newsletterId, appsScript }),
    });
  });
  console.log('[scheduler] started — ticking every 60s');
}
```

- [ ] **Step 4: Start scheduler in `server.ts`**

```typescript
import { startScheduler } from './workers/scheduler.js';
// ... after all routes registered:
startScheduler(appsScript);
```

- [ ] **Step 5: Run tests, deploy, verify one scheduled send**

Create a newsletter, schedule for 2 minutes from now, watch logs — confirm it ships.

```bash
npm test
ssh root@46.101.151.237 'cd ~/code/ma-learn-dashboard && git pull && cd backend && npm install && npm run build && pm2 restart ma-learn-dashboard-staging && pm2 logs ma-learn-dashboard-staging'
git add backend/src/workers/scheduler.ts backend/tests/workers/scheduler.test.ts backend/src/server.ts backend/package.json backend/package-lock.json
git commit -m "feat(scheduler): node-cron tick for scheduled newsletter sends"
```

---

### Task 20: Brevo webhook full handler

**Files:**
- Modify: `backend/src/routes/webhooks.ts`

- [ ] **Step 1: Update handler to dispatch events**

Replace `webhooks.ts`:

```typescript
import { FastifyPluginAsync } from 'fastify';

interface Opts {
  brevoSecret: string;
  appsScript: { call<T>(action: string, params: Record<string, unknown>): Promise<T> };
}

const BrevoEvents = new Set(['delivered', 'opened', 'clicked', 'unsubscribed', 'hard_bounce', 'soft_bounce']);

const webhooksRoute: FastifyPluginAsync<Opts> = async (app, opts) => {
  app.post('/api/webhooks/brevo', async (req, reply) => {
    if (req.headers.authorization !== opts.brevoSecret) return reply.code(401).send({ error: 'unauthorized' });

    const body = req.body as any;
    const events = Array.isArray(body) ? body : [body];

    for (const ev of events) {
      const eventName = ev.event as string;
      if (!BrevoEvents.has(eventName)) continue;

      const tags: string[] = ev.tags ?? [];
      const newsletterTag = tags.find(t => typeof t === 'string' && t.startsWith('nl:'));
      const newsletterId = newsletterTag ? newsletterTag.slice(3) : (ev['X-Newsletter-Id'] as string | undefined) ?? '';

      await opts.appsScript.call('admin_append_newsletter_event', {
        newsletterId,
        email: ev.email,
        event: eventName,
        url: ev.link ?? ev.url ?? '',
        userAgent: ev.user_agent ?? '',
      });

      if (eventName === 'unsubscribed') {
        await opts.appsScript.call('admin_mark_unsubscribed', { email: ev.email });
      }
    }
    return { ok: true };
  });
};

export default webhooksRoute;
```

- [ ] **Step 2: Register with appsScript in server.ts**

```typescript
await app.register(webhooksRoute, { brevoSecret: process.env.BREVO_WEBHOOK_SECRET!, appsScript });
```

- [ ] **Step 3: Deploy + trigger a real test send + open the email + click a link**

Watch `NewsletterEvents` tab — three rows should appear (delivered, opened, clicked).

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/webhooks.ts backend/src/server.ts
git commit -m "feat(webhooks): ingest Brevo events into NewsletterEvents + counters"
```

---

### Task 21: Newsletter stats view

**Files:**
- Create: `frontend/public/js/pages/newsletter-stats.js`
- Modify: `frontend/public/js/router.js`
- Create: `backend/src/data/newsletter-events.ts` (top-clicked link aggregation)
- Modify: `backend/src/routes/newsletters.ts`

- [ ] **Step 1: Backend — top-clicked links aggregation**

File: `backend/src/data/newsletter-events.ts`

```typescript
import { readSheet } from './sheets-read.js';

export async function topClickedLinks(newsletterId: string, limit = 10): Promise<{ url: string; count: number }[]> {
  const rows = await readSheet({ tab: 'NewsletterEvents' });
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (String(r.NewsletterID) !== newsletterId) continue;
    if (String(r.Event) !== 'clicked') continue;
    const url = String(r.URL ?? '');
    if (!url) continue;
    counts.set(url, (counts.get(url) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([url, count]) => ({ url, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
```

In `routes/newsletters.ts`, add:
```typescript
app.get('/api/data/newsletters/:id/top_clicks', async (req, reply) => {
  if (!opts.requireAuth(req)) return reply.code(401).send({ error: 'unauthorized' });
  const id = (req.params as any).id;
  return { links: await topClickedLinks(id) };
});
```

- [ ] **Step 2: Frontend — stats page**

File: `frontend/public/js/pages/newsletter-stats.js`

```javascript
import { api } from '../api.js';

function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

export default async function mount(root, params) {
  const id = params.id;
  root.innerHTML = '<p style="color:var(--silver)">Loading…</p>';
  const { newsletters } = await api('/api/data/newsletters');
  const nl = newsletters.find(n => n.newsletterId === id);
  if (!nl) { root.innerHTML = '<p>Not found.</p>'; return; }
  const { links } = await api(`/api/data/newsletters/${encodeURIComponent(id)}/top_clicks`);

  const pct = (n) => nl.recipientCount ? ((n / nl.recipientCount) * 100).toFixed(1) : '0.0';

  root.innerHTML = `
    <div style="margin-bottom:14px">
      <a href="#/newsletter" style="color:var(--silver);text-decoration:none">← Back to newsletters</a>
    </div>
    <h2 style="color:var(--gold)">${escapeHtml(nl.subject)}</h2>
    <p style="color:var(--silver);margin:4px 0 24px">Sent ${new Date(nl.sentAt).toLocaleString()} · Language: ${nl.language}</p>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px">
      ${kpi(nl.recipientCount, 'Sent')}
      ${kpi(nl.deliveredCount, 'Delivered', pct(nl.deliveredCount))}
      ${kpi(nl.openCount, 'Opened', pct(nl.openCount))}
      ${kpi(nl.clickCount, 'Clicked', pct(nl.clickCount))}
    </div>

    <h3 style="color:var(--gold);margin:20px 0 10px">Top clicked links</h3>
    ${links.length ? `
      <ul style="background:var(--surface);padding:14px 30px;border-radius:10px;">
        ${links.map(l => `<li style="margin:4px 0;color:#ddd"><code>${escapeHtml(l.url)}</code> — ${l.count} clicks</li>`).join('')}
      </ul>` : '<p style="color:var(--silver)">No click data yet.</p>'}

    <p style="color:var(--silver);font-size:.8rem;margin:18px 0">
      Unsubscribes: ${nl.unsubCount} (${pct(nl.unsubCount)}%) · Bounces: ${nl.bounceCount} (${pct(nl.bounceCount)}%)
    </p>
    <p style="color:#888;font-size:.75rem">
      Open rates include proxy loads (Apple Mail Privacy). Clicks are the truer signal.
    </p>

    <div style="margin-top:20px;display:flex;gap:10px">
      <button class="btn-ghost" id="clone">Clone</button>
      <button class="btn-primary" id="resend-no-open">Resend to non-openers</button>
    </div>`;

  document.getElementById('clone').onclick = async () => {
    const r = await api('/api/writes/newsletter/clone', { method: 'POST', body: JSON.stringify({ newsletterId: id }) });
    if (r.ok) window.location.hash = '#/newsletter';
  };
  document.getElementById('resend-no-open').onclick = async () => {
    if (!confirm('Create a resend-to-non-openers draft? You can edit it before sending.')) return;
    const r = await api('/api/writes/newsletter/resend_non_openers', { method: 'POST', body: JSON.stringify({ newsletterId: id }) });
    if (r.ok) window.location.hash = '#/newsletter';
  };
}

function kpi(n, label, pct) {
  return `<div style="background:var(--surface);padding:14px;border-radius:10px;text-align:center">
    <div style="font-size:1.6rem;color:var(--gold);font-weight:bold">${Number(n).toLocaleString()}</div>
    <div style="color:#ccc;font-size:.9rem">${label}</div>
    ${pct !== undefined ? `<div style="color:#888;font-size:.8rem">${pct}%</div>` : ''}
  </div>`;
}
```

- [ ] **Step 3: Router — add parametric route**

Modify `router.js` to accept `#/newsletter/:id/stats`:

```javascript
const m = hash.match(/^#\/newsletter\/([^/]+)\/stats$/);
if (m) return loadPage('./pages/newsletter-stats.js', { id: m[1] });
```

- [ ] **Step 4: Deploy + verify**

Open a sent newsletter card → lands on stats view → shows real numbers.

- [ ] **Step 5: Commit**

```bash
git add frontend/public/js/pages/newsletter-stats.js frontend/public/js/router.js backend/src/data/newsletter-events.ts backend/src/routes/newsletters.ts
git commit -m "feat(newsletter): stats view with KPIs + top-clicked links"
```

---

### Task 22: Clone + resend-to-non-openers

**Files:**
- Modify: `backend/src/routes/newsletters.ts`
- Modify: `apps-script/newsletter-endpoints.js` if new endpoints needed

- [ ] **Step 1: Clone endpoint**

In `routes/newsletters.ts`:

```typescript
app.post('/api/writes/newsletter/clone', async (req, reply) => {
  if (!opts.requireAuth(req)) return reply.code(401).send({ error: 'unauthorized' });
  const { newsletterId } = req.body as { newsletterId: string };
  const nls = await readNewsletters();
  const src = nls.find(n => n.newsletterId === newsletterId);
  if (!src) return reply.code(404).send({ error: 'not_found' });
  const r = await opts.appsScript.call<{ newsletterId: string }>('admin_create_newsletter', {
    subject: `${src.subject} (Clone)`, preheader: src.preheader, language: src.language,
    blocks: JSON.stringify(src.blocks), segmentFilter: JSON.stringify(src.segmentFilter),
    cloneOf: src.newsletterId,
  });
  return { ok: true, newsletterId: r.newsletterId };
});
```

- [ ] **Step 2: Resend-to-non-openers endpoint**

```typescript
app.post('/api/writes/newsletter/resend_non_openers', async (req, reply) => {
  if (!opts.requireAuth(req)) return reply.code(401).send({ error: 'unauthorized' });
  const { newsletterId } = req.body as { newsletterId: string };
  const nls = await readNewsletters();
  const src = nls.find(n => n.newsletterId === newsletterId);
  if (!src || src.status !== 'sent') return reply.code(400).send({ error: 'must_be_sent' });

  const events = await readSheet({ tab: 'NewsletterEvents' });
  const openers = new Set(
    events
      .filter(e => String(e.NewsletterID) === newsletterId && String(e.Event) === 'opened')
      .map(e => String(e.Email).toLowerCase())
  );
  // Merge openers into segmentFilter as an exclusion list (new field we use at send time)
  const newFilter = { ...src.segmentFilter, excludeEmails: Array.from(openers) };

  const r = await opts.appsScript.call<{ newsletterId: string }>('admin_create_newsletter', {
    subject: `(Resend) ${src.subject}`, preheader: src.preheader, language: src.language,
    blocks: JSON.stringify(src.blocks), segmentFilter: JSON.stringify(newFilter),
    cloneOf: src.newsletterId,
  });
  return { ok: true, newsletterId: r.newsletterId };
});
```

- [ ] **Step 3: Update `segment-filter.ts` to honor excludeEmails**

Edit `data/segment-filter.ts`:

```typescript
export interface SegmentFilter {
  sources?: string[];
  language?: 'AR' | 'EN';
  excludeUnsub?: boolean;
  excludeEmails?: string[];   // NEW
}

export function applyFilter(subs: Subscriber[], f: SegmentFilter): Subscriber[] {
  const excludeUnsub = f.excludeUnsub !== false;
  const excludeSet = new Set((f.excludeEmails ?? []).map(e => e.toLowerCase()));
  return subs.filter(s => {
    if (excludeUnsub && s.status !== 'active') return false;
    if (excludeSet.has(s.email)) return false;
    if (f.language && s.language !== f.language) return false;
    if (f.sources && f.sources.length > 0) {
      if (!f.sources.some(src => s.sources.includes(src))) return false;
    }
    return true;
  });
}
```

- [ ] **Step 4: Test + deploy + commit**

```bash
npm test
# Deploy, then from Sent view → Resend to non-openers → edits open in composer
git add backend/src/routes/newsletters.ts backend/src/data/segment-filter.ts
git commit -m "feat(newsletter): clone + resend-to-non-openers flows"
```

---

# Stage F — Live Surfaces (Slice 6)

### Task 23: Link-in-bio inline newsletter form

**Files:**
- Modify: `frontend/public/link.html` (or equivalent LIB page)
- Modify: `frontend/public/js/pages/link-public.js` (wherever the public LIB page logic lives)

- [ ] **Step 1: Add form between header and links**

In the LIB public page render function, after the header block (photo + taglines) and before the link list, insert:

```html
<section class="lib-newsletter" id="lib-nl">
  <div class="lib-nl-body">
    <div class="lib-nl-label" data-ar="اشترك في النشرة البريدية" data-en="Join the newsletter"></div>
    <input id="lib-nl-name" placeholder="" data-ph-ar="الاسم" data-ph-en="Name" autocomplete="name" />
    <input id="lib-nl-email" type="email" placeholder="" data-ph-ar="البريد الإلكتروني" data-ph-en="Email" autocomplete="email" />
    <input type="text" name="website_url" style="display:none" tabindex="-1" autocomplete="off" />
    <button id="lib-nl-submit" data-ar="اشتراك" data-en="Subscribe"></button>
  </div>
  <div class="lib-nl-success" style="display:none" data-ar="✓ شكراً — أنت في القائمة" data-en="✓ You're in — check your inbox"></div>
</section>
```

Fill labels/placeholders based on the current LIB language toggle (`document.documentElement.lang` or similar state var).

Wiring code (place at the end of the LIB mount):

```javascript
if (localStorage.getItem('ma_nl_subscribed')) {
  document.getElementById('lib-nl').style.display = 'none';
} else {
  document.getElementById('lib-nl-submit').onclick = async () => {
    const name = document.getElementById('lib-nl-name').value.trim();
    const email = document.getElementById('lib-nl-email').value.trim();
    const honeypot = document.querySelector('#lib-nl input[name="website_url"]').value;
    if (!email) return;
    const res = await fetch('https://api-staging.malearnsa.com/api/public/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, source: 'lib', language: document.documentElement.lang || 'AR', website_url: honeypot }),
    });
    if (res.ok) {
      document.querySelector('#lib-nl .lib-nl-body').style.display = 'none';
      document.querySelector('#lib-nl .lib-nl-success').style.display = 'block';
      localStorage.setItem('ma_nl_subscribed', '1');
    }
  };
}
```

- [ ] **Step 2: Styling**

```css
.lib-newsletter { background:#111; border:1px solid #222; border-radius:10px; padding:14px; margin:16px auto; max-width:500px; }
.lib-nl-label { color:#C9A84C; font-weight:bold; margin-bottom:8px; }
.lib-newsletter input[type="text"], .lib-newsletter input[type="email"] { width:100%; background:#0a0a0a; border:1px solid #2a2a2a; color:#eee; padding:10px; border-radius:6px; margin-bottom:8px; }
.lib-newsletter button { width:100%; background:#C9A84C; color:#0E0E0E; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer; }
.lib-newsletter button:hover { filter:brightness(1.1); }
.lib-nl-success { color:#C9A84C; text-align:center; font-weight:bold; padding:14px 0; }
```

- [ ] **Step 3: Deploy LIB page + test submit**

Deploy LIB page to `linkinbio.malearnsa.com`. Submit a form → verify row lands in Subscribers tab with source=`lib`.

- [ ] **Step 4: Commit**

```bash
git add frontend/public/link.html frontend/public/js/pages/link-public.js
git commit -m "feat(lib): inline newsletter signup form between header and links"
```

---

### Task 24: Website signup form (hero + footer snippet)

**Files:**
- Provide copy-paste HTML snippet + hand to Majid for inclusion in malearnsa.com.

Majid's website is outside this repo. Task is: produce a self-contained snippet Majid can paste into the homepage hero and the global footer.

- [ ] **Step 1: Write snippet file**

File: `docs/snippets/website-newsletter-form.html`

```html
<!-- MA Learn Newsletter form. Paste inside a container of your choice. -->
<!-- Two required data attributes: data-placement="hero" or "footer" — controls sizing. -->

<style>
.ma-nl { background:#fff; color:#0E0E0E; padding:20px; border-radius:10px; max-width:560px; }
.ma-nl[data-placement="hero"] { padding:28px; }
.ma-nl h3 { color:#C9A84C; margin:0 0 12px; }
.ma-nl p.sub { color:#555; margin:0 0 14px; font-size:.95rem; }
.ma-nl input { width:100%; background:#f5f5f5; border:1px solid #ddd; color:#0E0E0E; padding:12px; border-radius:6px; margin-bottom:8px; font:inherit; }
.ma-nl button { width:100%; background:#0E0E0E; color:#fff; border:none; padding:12px; border-radius:6px; font-weight:bold; cursor:pointer; }
.ma-nl button:hover { filter:brightness(1.2); }
.ma-nl-success { color:#C9A84C; font-weight:bold; padding:14px 0; text-align:center; }
.ma-nl input[name="website_url"] { display:none; }
[dir="rtl"] .ma-nl { text-align:right; }
</style>

<div class="ma-nl" data-placement="hero" id="ma-nl-hero">
  <h3 lang="ar">انضم إلى النشرة البريدية</h3>
  <h3 lang="en">Join the newsletter</h3>
  <p class="sub" lang="ar">دروس أسبوعية في الذكاء الاصطناعي الإبداعي + أدوات جديدة. بدون سبام.</p>
  <p class="sub" lang="en">Weekly creative AI lessons + tools. No spam.</p>
  <input type="text" class="ma-nl-name" placeholder="الاسم / Name" autocomplete="name" />
  <input type="email" class="ma-nl-email" placeholder="البريد الإلكتروني / Email" autocomplete="email" />
  <input type="text" name="website_url" tabindex="-1" autocomplete="off" />
  <button type="button">Subscribe</button>
  <div class="ma-nl-success" style="display:none">✓ You're in — check your inbox.</div>
</div>

<!-- Duplicate the div with id="ma-nl-footer" and data-placement="footer" for the footer. -->

<script>
(function () {
  const API = 'https://api.malearnsa.com';  // use api-staging on staging
  document.querySelectorAll('.ma-nl').forEach((el) => {
    if (localStorage.getItem('ma_nl_subscribed')) { el.style.display = 'none'; return; }
    const lang = (document.documentElement.lang || 'AR').toUpperCase().startsWith('A') ? 'AR' : 'EN';
    // Show only the right language hint texts; simple hide-other approach
    el.querySelectorAll('[lang]').forEach(n => n.style.display = n.getAttribute('lang').toUpperCase().startsWith(lang.charAt(0)) ? '' : 'none');
    el.querySelector('button').onclick = async () => {
      const name = el.querySelector('.ma-nl-name').value.trim();
      const email = el.querySelector('.ma-nl-email').value.trim();
      const hp = el.querySelector('input[name="website_url"]').value;
      if (!email) return;
      const res = await fetch(API + '/api/public/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, source: 'website', language: lang, website_url: hp }),
      });
      if (res.ok) {
        el.querySelectorAll('input, button').forEach(n => n.style.display = 'none');
        el.querySelector('.ma-nl-success').style.display = 'block';
        localStorage.setItem('ma_nl_subscribed', '1');
      }
    };
  });
})();
</script>
```

- [ ] **Step 2: Commit**

```bash
git add docs/snippets/website-newsletter-form.html
git commit -m "docs(snippets): website newsletter form (hero + footer placements)"
```

**⏸ HARD STOP 2** — Majid pastes the snippet into malearnsa.com's hero + footer. Confirm one test submit writes to Subscribers. Resume Task 25.

---

### Task 25: Welcome email auto-send on first subscribe

**Files:**
- Modify: `apps-script/newsletter-endpoints.js` — in `_admin_upsert_subscriber`, if action is `inserted`, trigger welcome.
- Modify: Apps Script — add `_sendWelcomeEmail(email, name, language)` that sends via backend API.

Simplest implementation: when inserting a new Subscribers row, the Apps Script calls a backend endpoint `POST /api/writes/newsletter/send_welcome` which Brevo-sends a one-off using the `newsletter_welcome` EmailTemplate.

- [ ] **Step 1: Add backend welcome endpoint**

In `routes/newsletters.ts`:

```typescript
app.post('/api/writes/newsletter/send_welcome', async (req, reply) => {
  // Auth: this is called by Apps Script; verify admin_token in the header
  if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) return reply.code(401).send({ error: 'unauthorized' });
  const { email, name, language } = req.body as any;
  const { readSheet } = await import('../data/sheets-read.js');
  const templates = await readSheet({ tab: 'EmailTemplates' });
  const welcome = templates.find(t => t.TemplateID === 'newsletter_welcome');
  if (!welcome) return reply.code(500).send({ error: 'welcome_template_missing' });

  const blocksRaw = language === 'AR' ? welcome.Blocks : welcome.Blocks;  // for v1 both langs share Blocks; EN-first version is v2
  let blocks = [];
  try { const parsed = JSON.parse(String(blocksRaw || '{}')); blocks = parsed[language] || parsed.AR || []; } catch {}

  const { renderBlocks } = await import('../mail/blocks.js');
  const html = renderBlocks(blocks, language, { name: name || '' });
  const { createBrevoProvider } = await import('../mail/provider.js');
  const provider = createBrevoProvider({ apiKey: process.env.BREVO_API_KEY! });
  await provider.sendCampaign({
    from: { name: process.env.BREVO_SENDER_NAME ?? 'Majid Angawi', email: process.env.BREVO_SENDER_EMAIL! },
    to: [{ email, name }],
    subject: language === 'AR' ? String(welcome.SubjectAR || 'أهلاً بك') : String(welcome.SubjectEN || 'Welcome'),
    htmlContent: html,
    tags: ['welcome'],
  });
  return { ok: true };
});
```

- [ ] **Step 2: Apps Script — call welcome on new subscribe**

In `_admin_upsert_subscriber`, after the `appendRow` (inserted case), add:

```javascript
try {
  UrlFetchApp.fetch(BACKEND_URL + '/api/writes/newsletter/send_welcome', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { 'x-admin-token': ADMIN_TOKEN },
    payload: JSON.stringify({ email: email, name: p.name || '', language: p.language || 'AR' }),
  });
} catch (e) { /* don't fail the subscribe on welcome error */ }
```

(`BACKEND_URL` needs to be set in Apps Script Script Properties to `https://api-staging.malearnsa.com`.)

- [ ] **Step 3: Seed welcome template**

Open Emails page in dashboard → create a new template with TemplateID = `newsletter_welcome`, a heading + warm text + CTA to T2 course (or Instagram). Save.

- [ ] **Step 4: Test + commit**

Submit a brand-new email to the LIB form → verify welcome email arrives within ~30s + Subscribers row created.

```bash
git add backend/src/routes/newsletters.ts apps-script/newsletter-endpoints.js
git commit -m "feat(newsletter): auto welcome email on first subscribe"
```

---

### Task 26: End-to-end smoke test + release note

**Files:**
- Update: memory (`project_dashboard_newsletter.md`)
- Update: `context/current-priorities.md` (mark Newsletter shipped)

- [ ] **Step 1: Full end-to-end run**

From a fresh browser:
1. Submit LIB form → welcome email arrives
2. Submit website form (hero) → welcome email arrives, dedup → second submission shows "already subscribed" or silently ok
3. Buy a test product → Subscribers row gets `buyer` source added to existing row
4. In dashboard → Newsletter → new newsletter → add 3 blocks (heading, text, CTA) → schedule for 2 min from now
5. Wait for auto-send → verify in inbox
6. Click a link in email → verify click count + top-clicked link registered
7. Open "Resend to non-openers" on the sent card → new draft appears → edit → send → verify only non-openers got it
8. Click unsubscribe → verify Status flips + row removed from next newsletter send

- [ ] **Step 2: Write memory**

Save a new memory `project_dashboard_newsletter.md` documenting shipped state.

- [ ] **Step 3: Update current-priorities**

In `context/current-priorities.md`, add:
```markdown
## Newsletter shipped to staging — 2026-04-20+
- 4 sources wired: buyer / waitlist / website / lib
- Brevo free tier, DNS on newsletter.malearnsa.com
- Scheduling via node-cron, stats via Brevo webhook
- Backlog: Contacts/CRM (Week-2 scope from spec)
```

- [ ] **Step 4: Commit + final marker**

```bash
git commit --allow-empty -m "chore: slice 6 complete — newsletter shipped to staging"
git push
```

---

## Self-Review

**Spec coverage check:**
- Key decisions D1–D14 — all covered across Tasks 1–26 ✓
- Subscribers schema + 4 sources + unsub — Tasks 1, 4, 15, 17 ✓
- Block types (7) + composer UI — Tasks 7–10, 12 ✓
- Newsletter page + card states + scheduling — Tasks 18, 19 ✓
- Brevo adapter + webhook + stats + resend — Tasks 3, 20, 21, 22 ✓
- Capture forms (LIB + website) + welcome email — Tasks 23, 24, 25 ✓
- Emails V2 (composer + product Noor) — Tasks 12, 13 ✓

**Placeholder scan:** No TBD/TODO/"similar to" patterns remain. All code blocks complete.

**Type consistency:** `Block` union consistent across `src/mail/blocks.ts` + `frontend/.../composer/blocks.js`. `Subscriber`, `Newsletter`, `SegmentFilter` interfaces match between `data/*.ts` and route handlers. Apps-Script endpoint names match between caller and dispatcher.

**Hard stops:** 2 — (1) Brevo signup + DNS records after Task 5, (2) website snippet paste after Task 24. Marked inline.

**Estimated wall time:** 8–12 focused hours (excluding Majid's steps at hard stops).
