# Contacts / CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Contacts page — split view (list left, detail right) over joined Subscribers + Customers + Tokens — with five per-contact actions (Send email, Resend access link, Gift access, Copy email, Delete with confirm).

**Architecture:** Extend the existing Fastify + vanilla-JS dashboard. Two new backend route plugins (`contacts.ts` for reads, `writes-contact.ts` for writes) plus a new data layer (`data/contacts.ts`) with a 30s in-memory cache. Three new Apps Script endpoints (`admin_gift_token`, `admin_remove_subscriber`, `admin_resend_access_link`) pushed via clasp. One new frontend page (`pages/contacts.js`) + scoped stylesheet (`css/contacts.css`) following the design-token system established in the composer. Reuses the block composer for 1:1 email via a new `onlyEmails` field on `SegmentFilter`.

**Tech Stack:**
- Backend: Fastify 4, TypeScript, Vitest, existing `sheets-read` + `apps-script/client` adapters
- Frontend: vanilla ES modules (no build step), same design-token conventions as composer v2
- Apps Script: pushed via clasp to live `token-validator` project (scriptId `1OPM0ii4...`)

**Spec reference:** [docs/superpowers/specs/2026-04-23-contacts-crm-design.md](../specs/2026-04-23-contacts-crm-design.md)

**Scope:** This plan ships v1 exactly — nothing more. Tags, notes, unsubscribe toggle, engagement stats, bulk actions, virtualization, audit-log UI all explicitly out of scope.

---

## Prerequisites

- Composer v1 live on staging (2026-04-20)
- Newsletter + Subscribers stack live (Apps Script v8 via clasp deployment `AKfycbznjcsYu8g...`)
- clasp logged in as `Majid@malearnsa.com` workspace account (verify with `clasp show-authorized-user`)
- Local workspace `~/code/.clasp-token-validator/` exists with `.clasp.json` pointing to scriptId `1OPM0ii4S234ZXjV1QmzbudQcS8hDImSqDStGQZpXyG_aoAlzWgdPECud`
- ui-ux-pro-max plugin installed at `~/.claude/skills/ui-ux-pro-max/` with full scripts + data

---

## File Structure

```
ma-learn-dashboard/
├── backend/
│   ├── src/
│   │   ├── data/
│   │   │   ├── contacts.ts              # NEW — readContacts + readContactDetail + cache
│   │   │   └── segment-filter.ts        # MODIFY — add onlyEmails field
│   │   ├── routes/
│   │   │   ├── contacts.ts              # NEW — GET /api/data/contacts, /:email
│   │   │   └── writes-contact.ts        # NEW — POST /api/writes/contact/*
│   │   └── server.ts                    # MODIFY — register both new plugins
│   └── tests/
│       ├── data/
│       │   ├── contacts.test.ts         # NEW
│       │   └── segment-filter.test.ts   # MODIFY — onlyEmails tests
│       └── routes/
│           ├── contacts.test.ts         # NEW
│           └── writes-contact.test.ts   # NEW
├── frontend/
│   └── public/
│       ├── js/
│       │   ├── pages/
│       │   │   └── contacts.js          # NEW — list + detail + actions
│       │   ├── router.js                # MODIFY — register #contacts route
│       │   └── ui/sidebar.js            # MODIFY — add nav entry
│       ├── css/
│       │   └── contacts.css             # NEW — scoped tokens, designed via /ui-ux-pro-max
│       └── app.html                     # MODIFY — link contacts.css
├── apps-script/
│   └── contact-endpoints.js             # NEW — reference copy of the 3 new handlers
└── projects/ma-learn-launch/apps-script/token-validator/Code.js
                                         # MODIFY (local only — actual deploy via clasp)
```

---

# Stage A — Read-only list + detail

### Task 1: Extend SegmentFilter with `onlyEmails`

**Files:**
- Modify: `backend/src/data/segment-filter.ts`
- Modify: `backend/tests/data/segment-filter.test.ts`

- [ ] **Step 1: Add failing test for `onlyEmails` short-circuit**

Append to `backend/tests/data/segment-filter.test.ts`:

```typescript
it('with onlyEmails, returns ONLY matching emails ignoring other filters', () => {
  const subs: Subscriber[] = [
    { email: 'a@x.com', name: 'A', sources: ['waitlist'], language: 'AR', addedAt: '', lastSourceAt: '', status: 'active', unsubscribeToken: '' },
    { email: 'b@x.com', name: 'B', sources: ['buyer'],    language: 'EN', addedAt: '', lastSourceAt: '', status: 'active', unsubscribeToken: '' },
    { email: 'c@x.com', name: 'C', sources: ['buyer'],    language: 'AR', addedAt: '', lastSourceAt: '', status: 'active', unsubscribeToken: '' },
  ];
  const result = applyFilter(subs, { onlyEmails: ['b@x.com'], sources: ['waitlist'], language: 'AR' });
  expect(result).toHaveLength(1);
  expect(result[0].email).toBe('b@x.com');
});

it('with onlyEmails, still excludes unsubscribed when excludeUnsub=true (default)', () => {
  const subs: Subscriber[] = [
    { email: 'a@x.com', name: 'A', sources: ['buyer'], language: 'AR', addedAt: '', lastSourceAt: '', status: 'unsubscribed', unsubscribeToken: '' },
  ];
  expect(applyFilter(subs, { onlyEmails: ['a@x.com'] })).toHaveLength(0);
});
```

- [ ] **Step 2: Run tests — should fail**

```bash
cd ~/code/ma-learn-dashboard/backend && npm test -- segment-filter
```
Expected: 2 new tests fail.

- [ ] **Step 3: Add `onlyEmails` to the type + filter**

Replace `backend/src/data/segment-filter.ts`:

```typescript
import type { Subscriber } from './subscribers.js';

export interface SegmentFilter {
  sources?: string[];
  language?: 'AR' | 'EN';
  excludeUnsub?: boolean;
  excludeEmails?: string[];
  onlyEmails?: string[];     // NEW — 1:1 or small-set targeting (Contacts page)
}

export function applyFilter(subs: Subscriber[], f: SegmentFilter): Subscriber[] {
  const excludeUnsub = f.excludeUnsub !== false;
  const excludeSet = new Set((f.excludeEmails ?? []).map(e => e.toLowerCase()));
  const onlySet = f.onlyEmails && f.onlyEmails.length > 0
    ? new Set(f.onlyEmails.map(e => e.toLowerCase()))
    : null;

  return subs.filter(s => {
    if (excludeUnsub && s.status !== 'active') return false;
    if (excludeSet.has(s.email.toLowerCase())) return false;
    // onlyEmails short-circuits source/language filters — targeted send.
    if (onlySet) return onlySet.has(s.email.toLowerCase());
    if (f.language && s.language !== f.language) return false;
    if (f.sources && f.sources.length > 0) {
      if (!f.sources.some(src => s.sources.includes(src))) return false;
    }
    return true;
  });
}
```

- [ ] **Step 4: Run tests — should pass**

```bash
npm test -- segment-filter
```
Expected: all segment-filter tests green.

- [ ] **Step 5: Commit**

```bash
cd ~/code/ma-learn-dashboard
git add backend/src/data/segment-filter.ts backend/tests/data/segment-filter.test.ts
git commit -m "feat(segment): onlyEmails short-circuit for 1:1 targeted sends"
```

---

### Task 2: Contacts data layer + cache

**Files:**
- Create: `backend/src/data/contacts.ts`
- Create: `backend/tests/data/contacts.test.ts`

- [ ] **Step 1: Write failing tests for `joinContactList` + `joinContactDetail`**

File: `backend/tests/data/contacts.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { joinContactList, joinContactDetail } from '../../src/data/contacts.js';

const SUBS = [
  { Email: 'a@x.com', Name: 'Alice', Sources: 'buyer,waitlist', Language: 'AR', AddedAt: '2026-04-01T00:00:00', LastSourceAt: '2026-04-14T00:00:00', Status: 'active', UnsubscribeToken: 'tok1' },
  { Email: 'b@x.com', Name: 'Bob',   Sources: 'website',        Language: 'EN', AddedAt: '2026-04-10T00:00:00', LastSourceAt: '2026-04-10T00:00:00', Status: 'active', UnsubscribeToken: 'tok2' },
];
const CUSTS = [
  { Date: '2026-04-14 12:00:00', Email: 'a@x.com', Name: 'Alice', Phone: '+966501234567', Product: 'creative-ai-workshop-t3', Amount: '799', Coupon: 'EARLYBIRD', 'Payment ID': 'pay_1' },
  { Date: '2026-04-14 12:00:01', Email: 'a@x.com', Name: 'Alice', Phone: '+966501234567', Product: 'intro-to-creative-ai',    Amount: '0',   Coupon: '',           'Payment ID': 'pay_2' },
];
const TOKENS = [
  { Token: 'MAL-T3-AAAA', Course: 'creative-ai-workshop-t3', Status: 'used', 'Customer Email': 'a@x.com' },
  { Token: 'MAL-T2-BBBB', Course: 'intro-to-creative-ai',    Status: 'used', 'Customer Email': 'a@x.com' },
];

describe('joinContactList', () => {
  it('produces one row per Subscribers email with products computed from Customers', () => {
    const rows = joinContactList(SUBS, CUSTS, TOKENS);
    expect(rows).toHaveLength(2);
    const alice = rows.find(r => r.email === 'a@x.com')!;
    expect(alice.hasBought).toBe(true);
    expect(alice.productsBought).toEqual(expect.arrayContaining(['creative-ai-workshop-t3', 'intro-to-creative-ai']));
    expect(alice.sources).toEqual(['buyer', 'waitlist']);
    const bob = rows.find(r => r.email === 'b@x.com')!;
    expect(bob.hasBought).toBe(false);
    expect(bob.productsBought).toEqual([]);
  });

  it('lastActivityAt is the max of LastSourceAt and most-recent PurchasedAt', () => {
    const rows = joinContactList(SUBS, CUSTS, TOKENS);
    const alice = rows.find(r => r.email === 'a@x.com')!;
    expect(alice.lastActivityAt).toBe('2026-04-14T12:00:01');
  });

  it('lowercases emails for joining', () => {
    const mixed = [{ ...SUBS[0], Email: 'A@X.COM' }];
    const custs = [{ ...CUSTS[0], Email: 'a@x.com' }];
    const rows = joinContactList(mixed, custs, []);
    expect(rows[0].email).toBe('a@x.com');
    expect(rows[0].hasBought).toBe(true);
  });
});

describe('joinContactDetail', () => {
  it('returns joined detail for one email with purchases sorted newest first', () => {
    const detail = joinContactDetail('a@x.com', SUBS, CUSTS, TOKENS);
    expect(detail).not.toBeNull();
    expect(detail!.email).toBe('a@x.com');
    expect(detail!.phone).toBe('+966501234567');
    expect(detail!.purchases).toHaveLength(2);
    expect(detail!.purchases[0].paymentId).toBe('pay_2'); // newest first
    expect(detail!.tokens).toHaveLength(2);
    expect(detail!.tokens[0]).toMatchObject({ product: expect.any(String), status: 'used' });
  });

  it('returns null for unknown email', () => {
    expect(joinContactDetail('nope@x.com', SUBS, CUSTS, TOKENS)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — should fail (module missing)**

```bash
npm test -- data/contacts
```
Expected: module-not-found.

- [ ] **Step 3: Write `data/contacts.ts`**

File: `backend/src/data/contacts.ts`

```typescript
import { readSheet } from './sheets-read.js';

export interface ContactListRow {
  email: string;
  name: string;
  language: 'AR' | 'EN';
  sources: string[];
  status: 'active' | 'unsubscribed' | 'bounced';
  hasBought: boolean;
  productsBought: string[];
  addedAt: string;
  lastActivityAt: string;
}

export interface ContactDetail extends ContactListRow {
  phone: string;
  purchases: Array<{
    product: string;
    amountSAR: number;
    coupon: string;
    paymentId: string;
    purchasedAt: string;
  }>;
  tokens: Array<{
    product: string;
    token: string;
    status: 'available' | 'used' | 'revoked';
  }>;
}

function lc(s: unknown): string {
  return String(s ?? '').trim().toLowerCase();
}

function parseSources(s: unknown): string[] {
  return String(s ?? '').split(',').map(x => x.trim()).filter(Boolean);
}

function maxIso(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export function joinContactList(
  subs: Record<string, unknown>[],
  custs: Record<string, unknown>[],
  _tokens: Record<string, unknown>[],
): ContactListRow[] {
  // Index customer rows by email → list of purchases (order preserved for lastActivity).
  const custsByEmail = new Map<string, Record<string, unknown>[]>();
  for (const c of custs) {
    const email = lc(c.Email);
    if (!email) continue;
    const arr = custsByEmail.get(email) ?? [];
    arr.push(c);
    custsByEmail.set(email, arr);
  }

  return subs
    .map(s => {
      const email = lc(s.Email);
      if (!email) return null;
      const custRows = custsByEmail.get(email) ?? [];
      const productsBought = Array.from(new Set(custRows.map(c => String(c.Product ?? '')).filter(Boolean)));
      const lastPurchasedAt = custRows
        .map(c => String(c.Date ?? '').replace(' ', 'T'))
        .filter(Boolean)
        .sort()
        .pop() ?? '';
      const lastSourceAt = String(s.LastSourceAt ?? '');
      const statusRaw = String(s.Status ?? 'active') as 'active' | 'unsubscribed' | 'bounced';
      return {
        email,
        name: String(s.Name ?? ''),
        language: (String(s.Language ?? 'AR') === 'EN' ? 'EN' : 'AR') as 'AR' | 'EN',
        sources: parseSources(s.Sources),
        status: statusRaw,
        hasBought: productsBought.length > 0,
        productsBought,
        addedAt: String(s.AddedAt ?? ''),
        lastActivityAt: maxIso(lastSourceAt, lastPurchasedAt),
      };
    })
    .filter((r): r is ContactListRow => r !== null);
}

export function joinContactDetail(
  email: string,
  subs: Record<string, unknown>[],
  custs: Record<string, unknown>[],
  tokens: Record<string, unknown>[],
): ContactDetail | null {
  const target = lc(email);
  const sub = subs.find(s => lc(s.Email) === target);
  if (!sub) return null;
  const custRows = custs.filter(c => lc(c.Email) === target);
  const tokRows = tokens.filter(t => lc(t['Customer Email']) === target);

  const list = joinContactList([sub], custRows, tokRows)[0]!;
  const phone = String(custRows.find(c => String(c.Phone ?? '').trim())?.Phone ?? '');

  const purchases = custRows
    .map(c => ({
      product: String(c.Product ?? ''),
      amountSAR: Number(c.Amount ?? 0),
      coupon: String(c.Coupon ?? ''),
      paymentId: String(c['Payment ID'] ?? ''),
      purchasedAt: String(c.Date ?? '').replace(' ', 'T'),
    }))
    .sort((a, b) => (a.purchasedAt < b.purchasedAt ? 1 : -1));

  const tokenRows = tokRows.map(t => ({
    product: String(t.Course ?? ''),
    token: String(t.Token ?? ''),
    status: String(t.Status ?? 'available') as 'available' | 'used' | 'revoked',
  }));

  return { ...list, phone, purchases, tokens: tokenRows };
}

// ─── In-memory cache for list reads ────────────────────────────────────────
// Prevents hammering the Sheets API when Majid toggles filters in the UI.
let listCache: { at: number; rows: ContactListRow[] } | null = null;
const LIST_TTL_MS = 30_000;

export async function readContacts(): Promise<ContactListRow[]> {
  if (listCache && Date.now() - listCache.at < LIST_TTL_MS) return listCache.rows;
  const [subs, custs, tokens] = await Promise.all([
    readSheet({ tab: 'Subscribers' }),
    readSheet({ tab: 'Customers' }),
    readSheet({ tab: 'Tokens' }),
  ]);
  const rows = joinContactList(subs, custs, tokens);
  listCache = { at: Date.now(), rows };
  return rows;
}

export async function readContactDetail(email: string): Promise<ContactDetail | null> {
  const [subs, custs, tokens] = await Promise.all([
    readSheet({ tab: 'Subscribers' }),
    readSheet({ tab: 'Customers' }),
    readSheet({ tab: 'Tokens' }),
  ]);
  return joinContactDetail(email, subs, custs, tokens);
}

export function invalidateContactsCache(): void {
  listCache = null;
}
```

- [ ] **Step 4: Run — tests pass**

```bash
npm test -- data/contacts
```
Expected: all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/data/contacts.ts backend/tests/data/contacts.test.ts
git commit -m "feat(contacts): data layer with joined list + detail + 30s cache"
```

---

### Task 3: Contacts read routes

**Files:**
- Create: `backend/src/routes/contacts.ts`
- Create: `backend/tests/routes/contacts.test.ts`
- Modify: `backend/src/server.ts`

- [ ] **Step 1: Write failing tests**

File: `backend/tests/routes/contacts.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import contactsRoute from '../../src/routes/contacts.js';
import * as contactsData from '../../src/data/contacts.js';

const LIST_FIXTURE = [
  { email: 'a@x.com', name: 'Alice', language: 'AR', sources: ['buyer'],   status: 'active',       hasBought: true,  productsBought: ['creative-ai-workshop-t3'], addedAt: '2026-04-01T00:00:00', lastActivityAt: '2026-04-14T12:00:00' },
  { email: 'b@x.com', name: 'Bob',   language: 'EN', sources: ['website'], status: 'unsubscribed', hasBought: false, productsBought: [],                          addedAt: '2026-04-10T00:00:00', lastActivityAt: '2026-04-10T00:00:00' },
];

describe('contacts routes', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  async function setup() {
    vi.spyOn(contactsData, 'readContacts').mockResolvedValue(LIST_FIXTURE as any);
    vi.spyOn(contactsData, 'readContactDetail').mockImplementation(async (email) =>
      email === 'a@x.com'
        ? { ...LIST_FIXTURE[0], phone: '+966500000000', purchases: [], tokens: [] } as any
        : null
    );
    const app = Fastify();
    await app.register(contactsRoute, { requireAuth: () => 'majid' });
    return app;
  }

  it('GET /api/data/contacts returns list', async () => {
    const app = await setup();
    const res = await app.inject({ method: 'GET', url: '/api/data/contacts' });
    expect(res.statusCode).toBe(200);
    expect(res.json().contacts).toHaveLength(2);
  });

  it('GET /api/data/contacts filters by status=unsubscribed', async () => {
    const app = await setup();
    const res = await app.inject({ method: 'GET', url: '/api/data/contacts?status=unsubscribed' });
    expect(res.json().contacts).toHaveLength(1);
    expect(res.json().contacts[0].email).toBe('b@x.com');
  });

  it('GET /api/data/contacts filters by sources', async () => {
    const app = await setup();
    const res = await app.inject({ method: 'GET', url: '/api/data/contacts?sources=website' });
    expect(res.json().contacts).toHaveLength(1);
    expect(res.json().contacts[0].email).toBe('b@x.com');
  });

  it('GET /api/data/contacts filters by products', async () => {
    const app = await setup();
    const res = await app.inject({ method: 'GET', url: '/api/data/contacts?products=creative-ai-workshop-t3' });
    expect(res.json().contacts).toHaveLength(1);
    expect(res.json().contacts[0].email).toBe('a@x.com');
  });

  it('GET /api/data/contacts search by q matches name or email case-insensitive', async () => {
    const app = await setup();
    expect((await app.inject({ method: 'GET', url: '/api/data/contacts?q=ALICE' })).json().contacts).toHaveLength(1);
    expect((await app.inject({ method: 'GET', url: '/api/data/contacts?q=b@x' })).json().contacts).toHaveLength(1);
  });

  it('GET /api/data/contacts?sort=name sorts alphabetically', async () => {
    const app = await setup();
    const res = await app.inject({ method: 'GET', url: '/api/data/contacts?sort=name' });
    const emails = res.json().contacts.map((c: any) => c.email);
    expect(emails).toEqual(['a@x.com', 'b@x.com']);
  });

  it('GET /api/data/contacts/:email returns detail', async () => {
    const app = await setup();
    const res = await app.inject({ method: 'GET', url: '/api/data/contacts/a@x.com' });
    expect(res.statusCode).toBe(200);
    expect(res.json().contact.email).toBe('a@x.com');
  });

  it('GET /api/data/contacts/:email returns 404 for unknown', async () => {
    const app = await setup();
    const res = await app.inject({ method: 'GET', url: '/api/data/contacts/nope@x.com' });
    expect(res.statusCode).toBe(404);
  });

  it('401 without auth', async () => {
    vi.spyOn(contactsData, 'readContacts').mockResolvedValue(LIST_FIXTURE as any);
    const app = Fastify();
    await app.register(contactsRoute, { requireAuth: () => null });
    const res = await app.inject({ method: 'GET', url: '/api/data/contacts' });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
npm test -- routes/contacts
```
Expected: module not found.

- [ ] **Step 3: Write route plugin**

File: `backend/src/routes/contacts.ts`

```typescript
import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { readContacts, readContactDetail, type ContactListRow } from '../data/contacts.js';

interface Opts {
  requireAuth: (req: FastifyRequest) => string | null;
}

type SortKey = 'activity' | 'added' | 'name';

function applyListFilters(rows: ContactListRow[], q: URLSearchParams): ContactListRow[] {
  const status = q.get('status') || 'all';
  const sources = (q.get('sources') || '').split(',').map(s => s.trim()).filter(Boolean);
  const products = (q.get('products') || '').split(',').map(s => s.trim()).filter(Boolean);
  const language = q.get('language') || 'all';
  const search = (q.get('q') || '').toLowerCase().trim();

  return rows.filter(r => {
    if (status !== 'all' && r.status !== status) return false;
    if (language !== 'all' && r.language !== language) return false;
    if (sources.length > 0 && !sources.some(s => r.sources.includes(s))) return false;
    if (products.length > 0) {
      const wantsNonBuyer = products.includes('__nonbuyer');
      const matchesProduct = products.some(p => r.productsBought.includes(p));
      if (wantsNonBuyer && r.hasBought) return false;
      if (!wantsNonBuyer && !matchesProduct) return false;
    }
    if (search) {
      const hay = `${r.name} ${r.email}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

function sortRows(rows: ContactListRow[], sort: SortKey): ContactListRow[] {
  const copy = [...rows];
  if (sort === 'name')     return copy.sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
  if (sort === 'added')    return copy.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
  return copy.sort((a, b) => (b.lastActivityAt || '').localeCompare(a.lastActivityAt || ''));
}

const plugin: FastifyPluginAsync<Opts> = async (app, opts) => {
  app.get('/api/data/contacts', async (req, reply) => {
    if (!opts.requireAuth(req)) return reply.code(401).send({ error: 'unauthorized' });
    const url = new URL(req.url, 'http://local');
    const rows = await readContacts();
    const filtered = applyListFilters(rows, url.searchParams);
    const sort = (url.searchParams.get('sort') || 'activity') as SortKey;
    const sorted = sortRows(filtered, sort);
    return { contacts: sorted };
  });

  app.get('/api/data/contacts/:email', async (req, reply) => {
    if (!opts.requireAuth(req)) return reply.code(401).send({ error: 'unauthorized' });
    const email = decodeURIComponent((req.params as { email: string }).email);
    const detail = await readContactDetail(email);
    if (!detail) return reply.code(404).send({ error: 'not_found' });
    return { contact: detail };
  });
};

export default plugin;
```

- [ ] **Step 4: Register in `server.ts`**

Modify `backend/src/server.ts` — find where newsletters route registers, add above/below:

```typescript
import contactsRoute from './routes/contacts.js';
// ... inside the plugin registration block, alongside newslettersRoute:
await app.register(contactsRoute, { requireAuth });
```

- [ ] **Step 5: Run tests + build**

```bash
npm test -- routes/contacts
npm run build
```
Expected: 9 tests pass, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/contacts.ts backend/tests/routes/contacts.test.ts backend/src/server.ts
git commit -m "feat(contacts): GET /api/data/contacts + /api/data/contacts/:email"
```

---

### Task 4: Design pass for contacts.css via `/ui-ux-pro-max`

**Files:**
- Create: `frontend/public/css/contacts.css`
- Modify: `frontend/public/app.html` (link the new stylesheet)

This task invokes the ui-ux-pro-max skill BEFORE writing CSS, per the saved SOP rule. The output informs spacing, elevation, motion, typography tokens.

- [ ] **Step 1: Run the design-system generator**

```bash
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py \
  "admin CRM contacts table split-view dark-mode craft sophisticated saudi" \
  --design-system -p "MA Learn Contacts" -f markdown
```

Save the output for reference. Note its spacing/motion/elevation recommendations.

- [ ] **Step 2: Write `contacts.css` using the composer v2 token system**

The composer already established a tokenized design system. Reuse its tokens by scoping a new root (`.contacts-page`) with the same token names. This keeps the dashboard's visual language coherent.

File: `frontend/public/css/contacts.css`

```css
/* ============================================================
   MA Learn Contacts · v1 styling
   Inherits the token shape from composer v2 (same brand palette,
   4pt scale, motion tokens) — scoped to .contacts-page.
   ============================================================ */

.contacts-page {
  /* Same token shape as composer. Single source of visual truth. */
  --c-bg:          #0A0A0C;
  --c-surface-1:   #131316;
  --c-surface-2:   #1A1A1E;
  --c-surface-3:   #22222A;
  --c-surface-4:   #2A2A34;
  --c-border:      #26262E;
  --c-border-mid:  #353540;
  --c-border-gold: rgba(201,168,76,0.5);
  --c-ink:         #F1EFEA;
  --c-ink-2:       #BFBCB3;
  --c-ink-3:       #89867E;
  --c-ink-on-gold: #0A0A0C;
  --c-gold:        #C9A84C;
  --c-gold-bright: #E4C36B;
  --c-gold-soft:   rgba(201,168,76,0.12);
  --c-gold-glow:   rgba(201,168,76,0.38);
  --c-danger:      #E26D63;
  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px; --sp-4: 16px;
  --sp-5: 20px; --sp-6: 24px; --sp-8: 32px;
  --r-sm: 6px;  --r-md: 8px;  --r-lg: 12px; --r-xl: 16px;
  --ease-out: cubic-bezier(0.2, 0.7, 0.25, 1);
  --dur-fast: 120ms; --dur-med: 180ms;
  --shadow-1: 0 1px 2px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.02);
  --shadow-2: 0 6px 18px rgba(0,0,0,0.45);
  --shadow-focus: 0 0 0 3px var(--c-gold-soft);

  display: grid;
  grid-template-columns: 380px minmax(0, 1fr);
  gap: var(--sp-5);
  height: calc(100vh - 140px);
  min-height: 600px;
  color: var(--c-ink);
}

/* LEFT column — list */
.contacts-list {
  background: var(--c-surface-1);
  border: 1px solid var(--c-border);
  border-radius: var(--r-xl);
  padding: var(--sp-4);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.contacts-head h2 { color: var(--c-gold); margin: 0 0 4px; font-size: 1.25rem; }
.contacts-head .sub { color: var(--c-ink-2); font-size: 0.85rem; margin: 0 0 var(--sp-3); }
.contacts-search input {
  width: 100%;
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  color: var(--c-ink);
  border-radius: var(--r-md);
  padding: 10px 12px;
  font: inherit;
  transition: border-color var(--dur-fast) var(--ease-out);
}
.contacts-search input:focus { outline: none; border-color: var(--c-gold); box-shadow: var(--shadow-focus); }
.contacts-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 0.82rem;
}
.contacts-filters select {
  background: var(--c-surface-2);
  border: 1px solid var(--c-border-mid);
  color: var(--c-ink);
  padding: 6px 8px;
  border-radius: var(--r-sm);
  font: inherit; font-size: inherit;
}
.contacts-rows { display: flex; flex-direction: column; gap: var(--sp-2); margin-top: var(--sp-2); }
.contact-row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: var(--sp-3);
  background: var(--c-surface-2);
  border: 1px solid transparent;
  border-radius: var(--r-md);
  padding: var(--sp-3);
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}
.contact-row:hover, .contact-row.active {
  background: var(--c-surface-3);
  border-color: var(--c-border-mid);
}
.contact-row.active {
  border-color: var(--c-border-gold);
  box-shadow: var(--shadow-focus);
}
.contact-row.unsub { opacity: 0.55; }
.contact-avatar {
  width: 40px; height: 40px; border-radius: 50%;
  background: var(--c-gold-soft); color: var(--c-gold-bright);
  display: flex; align-items: center; justify-content: center;
  font-weight: 600; font-size: 0.9rem;
}
.contact-body { min-width: 0; }
.contact-name { color: var(--c-ink); font-weight: 500; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.contact-email { color: var(--c-ink-3); font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.contact-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.chip {
  display: inline-flex; align-items: center;
  padding: 2px 6px; border-radius: 3px;
  font-size: 0.7rem; font-weight: 500; letter-spacing: 0.02em;
}
.chip.source-buyer    { background: rgba(95,176,140,0.15); color: #8FCCA8; }
.chip.source-waitlist { background: rgba(226,109,99,0.15); color: #EE9088; }
.chip.source-website  { background: rgba(96,140,224,0.15); color: #92B1EA; }
.chip.source-lib      { background: rgba(201,168,76,0.15); color: var(--c-gold-bright); }
.chip.product         { background: var(--c-surface-3); color: var(--c-ink-2); }
.contact-activity { color: var(--c-ink-3); font-size: 0.72rem; margin-top: 4px; }

/* RIGHT column — detail */
.contacts-detail {
  background: var(--c-surface-1);
  border: 1px solid var(--c-border);
  border-radius: var(--r-xl);
  padding: var(--sp-5);
  overflow-y: auto;
}
.contacts-detail.empty {
  display: flex; align-items: center; justify-content: center;
  color: var(--c-ink-3); font-style: italic;
}
.detail-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--sp-3); }
.detail-head h2 { color: var(--c-ink); font-size: 1.3rem; margin: 0 0 4px; }
.detail-email { display: flex; align-items: center; gap: var(--sp-2); color: var(--c-ink-2); font-size: 0.9rem; }
.detail-email button.copy {
  background: transparent; border: none; color: var(--c-ink-3); cursor: pointer;
  padding: 2px 6px; border-radius: 3px; font-size: 0.85rem;
}
.detail-email button.copy:hover { color: var(--c-gold); background: var(--c-surface-2); }
.detail-meta { color: var(--c-ink-3); font-size: 0.82rem; margin-top: 4px; }
.detail-close {
  background: transparent; border: none; color: var(--c-ink-3); font-size: 1.3rem;
  cursor: pointer; padding: 4px 8px; border-radius: var(--r-sm);
}
.detail-close:hover { color: var(--c-ink); background: var(--c-surface-2); }

.action-bar {
  display: flex; gap: var(--sp-2); flex-wrap: wrap;
  margin: var(--sp-4) 0; padding: var(--sp-3);
  background: var(--c-surface-2); border: 1px solid var(--c-border);
  border-radius: var(--r-md);
}
.action-bar button {
  background: var(--c-bg); border: 1px solid var(--c-border-mid);
  color: var(--c-ink); padding: 8px 14px; border-radius: var(--r-sm);
  cursor: pointer; font: inherit; font-size: 0.87rem;
  display: inline-flex; align-items: center; gap: 6px;
  transition: all var(--dur-fast) var(--ease-out);
}
.action-bar button:hover { border-color: var(--c-gold); color: var(--c-gold); }
.action-bar button:disabled {
  opacity: 0.4; cursor: not-allowed;
}
.action-bar button.danger:hover { border-color: var(--c-danger); color: var(--c-danger); }
.action-bar button.primary { background: var(--c-gold); color: var(--c-ink-on-gold); border-color: var(--c-gold); }
.action-bar button.primary:hover { background: var(--c-gold-bright); }

.detail-section { margin-top: var(--sp-5); }
.detail-section h3 {
  color: var(--c-ink-2); font-size: 0.72rem; text-transform: uppercase;
  letter-spacing: 0.05em; font-weight: 600; margin: 0 0 var(--sp-3);
}
.detail-section .row {
  background: var(--c-surface-2); padding: var(--sp-3);
  border: 1px solid var(--c-border); border-radius: var(--r-md);
  margin-bottom: var(--sp-2); font-size: 0.88rem;
}
.detail-section .row .row-title { color: var(--c-ink); font-weight: 500; margin-bottom: 4px; }
.detail-section .row .row-meta { color: var(--c-ink-3); font-size: 0.8rem; }
.token-row {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--c-surface-2); padding: var(--sp-3);
  border: 1px solid var(--c-border); border-radius: var(--r-md);
  margin-bottom: var(--sp-2); font-size: 0.85rem;
}
.token-row .product { color: var(--c-gold-bright); font-weight: 500; min-width: 50px; }
.token-row code { color: var(--c-ink); font-family: 'SF Mono', Menlo, monospace; }
.token-row .status { color: var(--c-ink-3); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
.token-row button.reveal {
  background: transparent; border: 1px solid var(--c-border-mid); color: var(--c-ink-2);
  padding: 3px 8px; border-radius: var(--r-sm); font-size: 0.72rem; cursor: pointer;
}
.token-row button.reveal:hover { border-color: var(--c-gold); color: var(--c-gold); }

/* Confirm delete modal content */
.delete-preview {
  background: var(--c-surface-2); padding: var(--sp-4);
  border: 1px solid var(--c-border); border-radius: var(--r-md);
  margin: var(--sp-3) 0;
}
.delete-preview .n { color: var(--c-ink); font-weight: 600; }
.delete-preview .e { color: var(--c-ink-2); font-size: 0.87rem; margin: 4px 0; }
.delete-preview .facts { color: var(--c-ink-3); font-size: 0.82rem; }

/* Toast (reuses composer's modal-msg but scoped) */
.contacts-toast {
  position: fixed; bottom: 20px; right: 20px;
  background: var(--c-surface-1); border: 1px solid var(--c-border-mid);
  color: var(--c-ink); padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-md); box-shadow: var(--shadow-2);
  z-index: 10001; font-size: 0.88rem;
  animation: toast-in var(--dur-med) var(--ease-out);
}
.contacts-toast.error { border-color: var(--c-danger); }
.contacts-toast.success { border-color: var(--c-gold); }
@keyframes toast-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .contact-row, .action-bar button, .token-row button.reveal,
  .detail-close, .contacts-toast { transition: none; animation: none; }
}

@media (max-width: 980px) {
  .contacts-page { grid-template-columns: 1fr; height: auto; }
  .contacts-list { max-height: 50vh; }
}
```

- [ ] **Step 3: Link stylesheet in `app.html`**

Modify `frontend/public/app.html` — find the existing `<link rel="stylesheet" href="/css/composer.css">` line and add right after:

```html
<link rel="stylesheet" href="/css/contacts.css">
```

- [ ] **Step 4: Commit**

```bash
git add frontend/public/css/contacts.css frontend/public/app.html
git commit -m "feat(contacts): scoped design tokens + list/detail styling"
```

---

### Task 5: Contacts page — list + detail (read-only)

**Files:**
- Create: `frontend/public/js/pages/contacts.js`
- Modify: `frontend/public/js/router.js`
- Modify: `frontend/public/js/ui/sidebar.js`

- [ ] **Step 1: Write `pages/contacts.js` (read-only; actions wired in Stage B)**

File: `frontend/public/js/pages/contacts.js`

```javascript
import { api } from '../api.js';

const SOURCE_LABELS = { buyer: 'buyer', waitlist: 'waitlist', website: 'website', lib: 'lib' };
const PRODUCT_LABELS = {
  'intro-to-creative-ai':   'T2',
  'creative-ai-workshop-t3': 'T3',
  'beyond-lighting':         'BL',
  'prompt-pack':             'PP',
};

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function initials(name, email) {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s@]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function relativeTime(iso) {
  if (!iso) return '—';
  const then = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'));
  if (Number.isNaN(then.getTime())) return '—';
  const diffMs = Date.now() - then.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) return 'today';
  if (diffMs < 2 * day) return 'yesterday';
  if (diffMs < 30 * day) return `${Math.floor(diffMs / day)} days ago`;
  if (diffMs < 365 * day) return `${Math.floor(diffMs / (30 * day))} months ago`;
  return `${Math.floor(diffMs / (365 * day))} years ago`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderChip(type, key) {
  const cls = type === 'source' ? `chip source-${key}` : 'chip product';
  const label = type === 'source' ? (SOURCE_LABELS[key] || key) : (PRODUCT_LABELS[key] || key);
  return `<span class="${cls}">${escapeHtml(label)}</span>`;
}

export default async function mount(root) {
  root.innerHTML = '<div class="contacts-page" dir="ltr"><div class="contacts-list">Loading…</div><div class="contacts-detail empty">Select a contact on the left</div></div>';

  const state = {
    rows: [],
    selectedEmail: null,
    selectedDetail: null,
    filters: { status: 'all', sources: [], products: [], language: 'all', q: '', sort: 'activity' },
  };
  let searchTimer = null;

  async function loadList() {
    const q = new URLSearchParams();
    if (state.filters.status !== 'all') q.set('status', state.filters.status);
    if (state.filters.sources.length) q.set('sources', state.filters.sources.join(','));
    if (state.filters.products.length) q.set('products', state.filters.products.join(','));
    if (state.filters.language !== 'all') q.set('language', state.filters.language);
    if (state.filters.q) q.set('q', state.filters.q);
    if (state.filters.sort) q.set('sort', state.filters.sort);
    const { contacts } = await api('/api/data/contacts?' + q.toString());
    state.rows = contacts;
    renderList();
  }

  async function loadDetail(email) {
    if (!email) { state.selectedDetail = null; renderDetail(); return; }
    state.selectedEmail = email;
    renderDetail({ loading: true });
    try {
      const { contact } = await api('/api/data/contacts/' + encodeURIComponent(email));
      state.selectedDetail = contact;
    } catch (e) {
      state.selectedDetail = { error: e.message };
    }
    renderDetail();
  }

  function render() {
    root.innerHTML = `
      <div class="contacts-page" dir="ltr">
        <aside class="contacts-list" id="contacts-list"></aside>
        <section class="contacts-detail ${state.selectedDetail ? '' : 'empty'}" id="contacts-detail"></section>
      </div>`;
    renderList();
    renderDetail();
  }

  function renderList() {
    const el = document.getElementById('contacts-list');
    if (!el) return;
    const unsubCount = state.rows.filter(r => r.status === 'unsubscribed').length;
    el.innerHTML = `
      <div class="contacts-head">
        <h2>Contacts</h2>
        <p class="sub">${state.rows.length} contacts · ${unsubCount} unsubscribed</p>
      </div>
      <div class="contacts-search">
        <input id="c-search" type="search" placeholder="Search by name or email…" value="${escapeHtml(state.filters.q)}" />
      </div>
      <div class="contacts-filters">
        <select id="c-status">
          <option value="all" ${state.filters.status==='all'?'selected':''}>All status</option>
          <option value="active" ${state.filters.status==='active'?'selected':''}>Active</option>
          <option value="unsubscribed" ${state.filters.status==='unsubscribed'?'selected':''}>Unsubscribed</option>
          <option value="bounced" ${state.filters.status==='bounced'?'selected':''}>Bounced</option>
        </select>
        <select id="c-source">
          <option value="">All sources</option>
          <option value="buyer">Buyer</option>
          <option value="waitlist">Waitlist</option>
          <option value="website">Website</option>
          <option value="lib">Link-in-bio</option>
        </select>
        <select id="c-product">
          <option value="">All products</option>
          <option value="intro-to-creative-ai">T2</option>
          <option value="creative-ai-workshop-t3">T3</option>
          <option value="beyond-lighting">BL</option>
          <option value="prompt-pack">PP</option>
          <option value="__nonbuyer">Non-buyers</option>
        </select>
        <select id="c-language">
          <option value="all" ${state.filters.language==='all'?'selected':''}>AR + EN</option>
          <option value="AR" ${state.filters.language==='AR'?'selected':''}>AR</option>
          <option value="EN" ${state.filters.language==='EN'?'selected':''}>EN</option>
        </select>
        <select id="c-sort">
          <option value="activity" ${state.filters.sort==='activity'?'selected':''}>Sort: last activity</option>
          <option value="added"    ${state.filters.sort==='added'   ?'selected':''}>Sort: added date</option>
          <option value="name"     ${state.filters.sort==='name'    ?'selected':''}>Sort: name A→Z</option>
        </select>
      </div>
      <div class="contacts-rows">
        ${state.rows.length === 0 ? '<p style="color:var(--c-ink-3);padding:20px 0;text-align:center">No contacts match.</p>' :
          state.rows.map(r => `
            <div class="contact-row ${state.selectedEmail===r.email?'active':''} ${r.status==='unsubscribed'?'unsub':''}" data-email="${escapeHtml(r.email)}">
              <div class="contact-avatar">${escapeHtml(initials(r.name, r.email))}</div>
              <div class="contact-body">
                <div class="contact-name">${escapeHtml(r.name || '—')}</div>
                <div class="contact-email">${escapeHtml(r.email)}</div>
                <div class="contact-chips">
                  ${r.sources.map(s => renderChip('source', s)).join('')}
                  ${r.productsBought.map(p => renderChip('product', p)).join('')}
                </div>
                <div class="contact-activity">${escapeHtml(relativeTime(r.lastActivityAt))}</div>
              </div>
            </div>`).join('')}
      </div>`;

    // Wire filter + search handlers.
    document.getElementById('c-status').onchange   = e => { state.filters.status   = e.target.value; loadList(); };
    document.getElementById('c-language').onchange = e => { state.filters.language = e.target.value; loadList(); };
    document.getElementById('c-sort').onchange     = e => { state.filters.sort     = e.target.value; loadList(); };
    document.getElementById('c-source').onchange   = e => { state.filters.sources  = e.target.value ? [e.target.value] : []; loadList(); };
    document.getElementById('c-product').onchange  = e => { state.filters.products = e.target.value ? [e.target.value] : []; loadList(); };
    document.getElementById('c-search').oninput    = e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.filters.q = e.target.value; loadList(); }, 200);
    };
    el.querySelectorAll('.contact-row').forEach(row => {
      row.onclick = () => loadDetail(row.dataset.email);
    });
  }

  function renderDetail(opts = {}) {
    const el = document.getElementById('contacts-detail');
    if (!el) return;
    if (opts.loading) {
      el.className = 'contacts-detail';
      el.innerHTML = '<p style="color:var(--c-ink-3)">Loading…</p>';
      return;
    }
    if (!state.selectedDetail) {
      el.className = 'contacts-detail empty';
      el.innerHTML = 'Select a contact on the left';
      return;
    }
    if (state.selectedDetail.error) {
      el.className = 'contacts-detail';
      el.innerHTML = `<p style="color:var(--c-danger)">Error: ${escapeHtml(state.selectedDetail.error)}</p>`;
      return;
    }
    const c = state.selectedDetail;
    el.className = 'contacts-detail';
    el.innerHTML = `
      <div class="detail-head">
        <div>
          <h2>${escapeHtml(c.name || '—')}</h2>
          <div class="detail-email">
            <span>${escapeHtml(c.email)}</span>
            <button class="copy" id="d-copy" title="Copy email to clipboard">📋</button>
          </div>
          <div class="detail-meta">
            ${escapeHtml(c.status === 'active' ? 'Active' : c.status)} · ${escapeHtml(c.language)}${c.phone ? ' · ' + escapeHtml(c.phone) : ''}
          </div>
        </div>
        <button class="detail-close" id="d-close" title="Close">×</button>
      </div>

      <!-- Action bar is a placeholder here; wired in Stage B. -->
      <div class="action-bar" id="d-actions">
        <button class="primary" data-act="email" disabled title="Wired in Stage B">✉ Send email</button>
        <button data-act="resend" disabled title="Wired in Stage B">🔗 Resend link</button>
        <button data-act="gift" disabled title="Wired in Stage B">🎁 Gift</button>
        <button class="danger" data-act="delete" disabled title="Wired in Stage B">🗑 Delete</button>
      </div>

      <div class="detail-section">
        <h3>Sources</h3>
        ${c.sources.map(s => `<div class="row"><span class="row-title">${escapeHtml(SOURCE_LABELS[s] || s)}</span></div>`).join('')}
      </div>

      <div class="detail-section">
        <h3>Purchases (${c.purchases.length})</h3>
        ${c.purchases.length === 0 ? '<p style="color:var(--c-ink-3);font-size:.85rem">No purchases yet.</p>' :
          c.purchases.map(p => `
            <div class="row">
              <div class="row-title">${escapeHtml(PRODUCT_LABELS[p.product] || p.product)}</div>
              <div class="row-meta">
                ${Number(p.amountSAR).toLocaleString()} SAR${p.coupon ? ' · coupon ' + escapeHtml(p.coupon) : ''} · ${escapeHtml(fmtDate(p.purchasedAt))}
                ${p.paymentId ? '<br>Payment: <code>' + escapeHtml(p.paymentId) + '</code>' : ''}
              </div>
            </div>`).join('')}
      </div>

      <div class="detail-section">
        <h3>Tokens (${c.tokens.length})</h3>
        ${c.tokens.length === 0 ? '<p style="color:var(--c-ink-3);font-size:.85rem">No tokens assigned.</p>' :
          c.tokens.map((t, i) => `
            <div class="token-row">
              <span class="product">${escapeHtml(PRODUCT_LABELS[t.product] || t.product)}</span>
              <code data-idx="${i}">${'█'.repeat(Math.min(16, t.token.length))}</code>
              <span class="status">${escapeHtml(t.status)}</span>
              <button class="reveal" data-idx="${i}">reveal</button>
            </div>`).join('')}
      </div>

      <div class="detail-section">
        <h3>Metadata</h3>
        <div class="row">
          <div class="row-meta">
            Added: ${escapeHtml(fmtDate(c.addedAt))}<br>
            Last activity: ${escapeHtml(fmtDate(c.lastActivityAt))}
          </div>
        </div>
      </div>`;

    // Wire copy + close + token reveal.
    document.getElementById('d-close').onclick = () => {
      state.selectedEmail = null; state.selectedDetail = null; render();
    };
    document.getElementById('d-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(c.email); toast('Email copied ✓', 'success'); }
      catch { toast('Copy failed', 'error'); }
    };
    el.querySelectorAll('button.reveal').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.idx);
        const codeEl = el.querySelector(`code[data-idx="${idx}"]`);
        if (codeEl.textContent.startsWith('█')) {
          codeEl.textContent = c.tokens[idx].token;
          btn.textContent = 'copy';
        } else {
          navigator.clipboard.writeText(c.tokens[idx].token);
          toast('Token copied ✓', 'success');
        }
      };
    });

    // Keyboard nav: Escape closes, j/k & arrows move between rows.
    document.onkeydown = (e) => {
      if (e.key === 'Escape' && state.selectedEmail) {
        state.selectedEmail = null; state.selectedDetail = null; render();
      } else if (['j', 'ArrowDown', 'k', 'ArrowUp'].includes(e.key) && state.selectedEmail) {
        const idx = state.rows.findIndex(r => r.email === state.selectedEmail);
        if (idx === -1) return;
        const delta = (e.key === 'j' || e.key === 'ArrowDown') ? 1 : -1;
        const next = state.rows[idx + delta];
        if (next) { e.preventDefault(); loadDetail(next.email); }
      }
    };
  }

  function toast(msg, kind) {
    const prev = document.querySelector('.contacts-toast');
    if (prev) prev.remove();
    const t = document.createElement('div');
    t.className = 'contacts-toast ' + (kind || '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  render();
  await loadList();
}
```

- [ ] **Step 2: Register `#contacts` route**

Modify `frontend/public/js/router.js` — add to the ROUTES map:

```javascript
contacts: () => import('./pages/contacts.js'),
```

- [ ] **Step 3: Add sidebar nav entry**

Modify `frontend/public/js/ui/sidebar.js` — add alongside the other entries (right after `newsletter`):

```javascript
{ id: 'contacts', label: 'Contacts', href: '#contacts' },
```

- [ ] **Step 4: Syntax-check + visual smoke**

```bash
cd ~/code/ma-learn-dashboard
node --check frontend/public/js/pages/contacts.js
node --check frontend/public/js/router.js
node --check frontend/public/js/ui/sidebar.js
```

- [ ] **Step 5: Commit**

```bash
git add frontend/public/js/pages/contacts.js frontend/public/js/router.js frontend/public/js/ui/sidebar.js
git commit -m "feat(contacts): read-only list + detail page with filters + search + keyboard nav"
```

---

### Task 6: Deploy Stage A + smoke test

**Files:** No file changes. Operator deploy.

- [ ] **Step 1: Push + deploy backend**

```bash
cd ~/code/ma-learn-dashboard
git push origin main
cd backend && npx tsc -p . && rsync -az -e "ssh -o ConnectTimeout=10" dist/ root@46.101.151.237:/var/www/ma-learn-dashboard/backend/dist/
ssh -n -o ConnectTimeout=10 root@46.101.151.237 'pm2 restart ma-learn-dashboard-staging --update-env'
curl -sS https://api-staging.malearnsa.com/health
```

Expected: `{"status":"ok","environment":"staging"}`

- [ ] **Step 2: Smoke test the read routes**

From Mac terminal (using your admin session cookie):

```bash
# Substitute your real cookie value
COOKIE='auth_session=YOUR_COOKIE_HERE'
curl -sS -H "Cookie: $COOKIE" 'https://api-staging.malearnsa.com/api/data/contacts' | head -c 500
curl -sS -H "Cookie: $COOKIE" 'https://api-staging.malearnsa.com/api/data/contacts?status=active&language=AR&sort=name' | head -c 500
curl -sS -H "Cookie: $COOKIE" 'https://api-staging.malearnsa.com/api/data/contacts/majed.engawi%40gmail.com' | head -c 500
```

Expected: valid JSON responses.

- [ ] **Step 3: In-browser smoke**

- Go to https://admin-staging.malearnsa.com
- Hard-reload (Cmd+Shift+R) — clears Cloudflare cached assets
- Click `Contacts` in sidebar
- List should render all subscribers
- Click a row → detail should open on right
- Try each filter (status / source / product / language)
- Try the search box (should live-filter 200ms after typing)
- Try sorting (last activity / added / name)
- Press `Escape` → detail closes
- Press `j`/`k` on a selected contact → next/previous loads

- [ ] **Step 4: Stage A done**

---

# Stage B — Actions

### Task 7: Apps Script — `admin_gift_token`, `admin_remove_subscriber`, `admin_resend_access_link`

**Files:**
- Create: `apps-script/contact-endpoints.js` (reference copy)
- Modify: `projects/ma-learn-launch/apps-script/token-validator/Code.js` (local copy)
- Push via clasp from `~/code/.clasp-token-validator/`

- [ ] **Step 1: Write the three handlers in the local Code.js**

Append to `projects/ma-learn-launch/apps-script/token-validator/Code.js` (at the bottom, after the existing newsletter endpoints):

```javascript
// ═════════════════════════════════════════════════════════════════════
// CONTACTS / CRM — admin endpoints (2026-04-23 rollout)
// ═════════════════════════════════════════════════════════════════════
// Called by the dashboard's Contacts page via the /api/writes/contact/* routes.
// All endpoints check admin_token and return { ok, ... } consistent with the
// existing admin_* pattern.

// ─── admin_resend_access_link ──────────────────────────────────────────────
// Params: admin_token, email, product.
// Looks up the existing token for this email+product and re-sends the same
// access email that was sent at purchase. If no token exists, returns error.
function _admin_resend_access_link(p) {
  if (p.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  var email = _nl_lc(p.email);
  var product = String(p.product || '').trim();
  if (!email || !product) return { ok: false, error: 'missing_params' };

  var ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  var tokensSheet = ss.getSheetByName(TOKENS_SHEET);
  if (!tokensSheet) return { ok: false, error: 'no_tokens_sheet' };

  var data = tokensSheet.getDataRange().getValues();
  var foundToken = null;
  for (var i = 1; i < data.length; i++) {
    if (_nl_lc(data[i][3]) === email && String(data[i][1]).trim() === product) {
      foundToken = String(data[i][0]).trim();
      break;
    }
  }
  if (!foundToken) return { ok: false, error: 'no_token_for_product' };

  // Find customer name for the greeting.
  var custSheet = ss.getSheetByName(CUSTOMERS_SHEET);
  var name = '';
  if (custSheet) {
    var cdata = custSheet.getDataRange().getValues();
    for (var j = 1; j < cdata.length; j++) {
      if (_nl_lc(cdata[j][1]) === email) { name = String(cdata[j][2] || ''); break; }
    }
  }

  var courseUrl, subject, body;
  if (product === T2_PRODUCT) {
    courseUrl = 'https://player.malearnsa.com/watch.html?token=' + foundToken;
    subject = 'وصلك رابط الدورة — مدخل إلى الذكاء الاصطناعي الإبداعي';
    body = buildT2Email(name, courseUrl);
  } else if (product === T3_PRODUCT) {
    // T3 doesn't have its own player token — it's cohort-only. Resend the T3
    // confirmation email with the existing T2 gift token.
    var t2Url = 'https://player.malearnsa.com/watch.html?token=' + foundToken + '&course=' + T2_PRODUCT;
    subject = 'تم تسجيلك — ورشة صناعة الإلهام';
    body = buildT3Email(name, t2Url);
  } else if (product === BL_PRODUCT) {
    courseUrl = 'https://player.malearnsa.com/watch.html?token=' + foundToken + '&course=beyond-lighting';
    subject = 'وصلك رابط الدورة — أبعد من إمكانيات الإضاءة';
    body = buildBLEmail(name, courseUrl);
  } else if (product === PP_PRODUCT) {
    var libUrl = 'https://malearnsa.com/prompt-pack/library/?token=' + foundToken;
    subject = 'وصلك كود الوصول — حزمة البرومبتات الإبداعية';
    body = buildPPEmail(name, libUrl, foundToken);
  } else {
    return { ok: false, error: 'unknown_product' };
  }

  try {
    GmailApp.sendEmail(email, subject, '', { htmlBody: body, name: FROM_NAME, from: FROM_EMAIL });
    return { ok: true, product: product, email: email };
  } catch (e) {
    return { ok: false, error: 'send_failed: ' + String(e) };
  }
}

// ─── admin_gift_token ──────────────────────────────────────────────────────
// Params: admin_token, email, name (optional), product, note (optional).
// Finds an available token for the product, marks used, logs Customers row
// with amount=0 + coupon="gift", sends access email.
function _admin_gift_token(p) {
  if (p.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  var email = _nl_lc(p.email);
  var product = String(p.product || '').trim();
  if (!email || !product) return { ok: false, error: 'missing_params' };

  var ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  var tokensSheet = ss.getSheetByName(TOKENS_SHEET);
  if (!tokensSheet) return { ok: false, error: 'no_tokens_sheet' };

  // Find an available token.
  var data = tokensSheet.getDataRange().getValues();
  var tokenRow = -1, assignedToken = null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() === product && String(data[i][2]).trim() === 'available') {
      assignedToken = String(data[i][0]).trim();
      tokenRow = i + 1;
      break;
    }
  }
  if (!assignedToken) return { ok: false, error: 'no_tokens_available' };

  // Mark used.
  tokensSheet.getRange(tokenRow, 3).setValue('used');
  tokensSheet.getRange(tokenRow, 4).setValue(email);

  // Log Customers row with amount=0.
  var custSheet = ss.getSheetByName(CUSTOMERS_SHEET);
  var name = String(p.name || '');
  var dateStr = Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd HH:mm:ss');
  var paymentId = 'gift-' + _nl_rndToken(10);
  if (custSheet) custSheet.appendRow([dateStr, email, name, '', product, 0, 'gift', paymentId]);

  // Send access email using existing builders.
  var subject, body;
  if (product === T2_PRODUCT) {
    subject = 'هديتك — مدخل إلى الذكاء الاصطناعي الإبداعي';
    body = buildT2Email(name, 'https://player.malearnsa.com/watch.html?token=' + assignedToken);
  } else if (product === T3_PRODUCT) {
    subject = 'هديتك — ورشة صناعة الإلهام';
    body = buildT3Email(name, 'https://player.malearnsa.com/watch.html?token=' + assignedToken + '&course=' + T2_PRODUCT);
  } else if (product === BL_PRODUCT) {
    subject = 'هديتك — أبعد من إمكانيات الإضاءة';
    body = buildBLEmail(name, 'https://player.malearnsa.com/watch.html?token=' + assignedToken + '&course=beyond-lighting');
  } else if (product === PP_PRODUCT) {
    subject = 'هديتك — حزمة البرومبتات الإبداعية';
    body = buildPPEmail(name, 'https://malearnsa.com/prompt-pack/library/?token=' + assignedToken, assignedToken);
  } else {
    return { ok: false, error: 'unknown_product' };
  }

  try {
    GmailApp.sendEmail(email, subject, '', { htmlBody: body, name: FROM_NAME, from: FROM_EMAIL });
    return { ok: true, token: assignedToken, paymentId: paymentId, product: product };
  } catch (e) {
    return { ok: false, error: 'send_failed: ' + String(e) };
  }
}

// ─── admin_remove_subscriber ───────────────────────────────────────────────
// Deletes the Subscribers row for this email. Does NOT touch Customers /
// Tokens. Returns { ok: true, removed: true/false }.
function _admin_remove_subscriber(p) {
  if (p.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  var email = _nl_lc(p.email);
  if (!email) return { ok: false, error: 'missing_email' };

  var sh = _nl_sheet('Subscribers', p.sheetId);
  if (!sh) return { ok: false, error: 'Subscribers_tab_missing' };
  var headers = _nl_headerMap(sh);
  var last = sh.getLastRow();
  if (last < 2) return { ok: true, removed: false };
  var data = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  for (var i = 0; i < data.length; i++) {
    if (_nl_lc(data[i][headers['Email']]) === email) {
      sh.deleteRow(i + 2);
      return { ok: true, removed: true, email: email };
    }
  }
  return { ok: true, removed: false };
}
```

- [ ] **Step 2: Wire the 3 new actions into `doGet`**

Find the `doGet` function in `Code.js`. Inside the `else if (action === ...)` chain, after the last existing `admin_upload_email_image` line, add:

```javascript
    else if (action === 'admin_resend_access_link')     result = _admin_resend_access_link(e.parameter);
    else if (action === 'admin_gift_token')              result = _admin_gift_token(e.parameter);
    else if (action === 'admin_remove_subscriber')       result = _admin_remove_subscriber(e.parameter);
```

- [ ] **Step 3: Save reference copy in repo**

Also create `apps-script/contact-endpoints.js` with the same 3 function bodies (no `doGet` wiring). This is a reference-only file — Majid doesn't paste this; the live deploy goes via clasp.

- [ ] **Step 4: Push to live script via clasp**

```bash
cp "/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA/projects/ma-learn-launch/apps-script/token-validator/Code.js" ~/code/.clasp-token-validator/Code.js
wc -l ~/code/.clasp-token-validator/Code.js
cd ~/code/.clasp-token-validator
clasp push --force
clasp deploy -i AKfycbznjcsYu8gLDZqFJGededAQaATad_L8vlhRQV04pOqh57HB5nFVRy9zUHAcg6goyj8DKA -d "v9 contacts actions"
```

Expected: "Deployed ... @9"

- [ ] **Step 5: Smoke test each endpoint**

```bash
# 1. admin_resend_access_link (use Majid's own email + a course he owns)
curl -sS "https://script.google.com/macros/s/AKfycbznjcsYu8gLDZqFJGededAQaATad_L8vlhRQV04pOqh57HB5nFVRy9zUHAcg6goyj8DKA/exec?action=admin_resend_access_link&admin_token=MAL-ADMIN-2026&email=majed.engawi@gmail.com&product=creative-ai-workshop-t3"

# Expected: {"ok":true,"product":"creative-ai-workshop-t3","email":"majed.engawi@gmail.com"}
# (Check Gmail inbox — the T3 confirmation email should arrive)

# 2. admin_remove_subscriber (test with a dummy email we've added + remove)
curl -sS "https://script.google.com/macros/s/AKfycbznjcsYu8gLDZqFJGededAQaATad_L8vlhRQV04pOqh57HB5nFVRy9zUHAcg6goyj8DKA/exec?action=admin_upsert_subscriber&admin_token=MAL-ADMIN-2026&email=contact-delete-test@example.com&source=website&language=EN&sheetId=17OXBVq8XBXDWUY7Zh88MTycqMYJA8zYRtGSk9WE08QI"
curl -sS "https://script.google.com/macros/s/AKfycbznjcsYu8gLDZqFJGededAQaATad_L8vlhRQV04pOqh57HB5nFVRy9zUHAcg6goyj8DKA/exec?action=admin_remove_subscriber&admin_token=MAL-ADMIN-2026&email=contact-delete-test@example.com&sheetId=17OXBVq8XBXDWUY7Zh88MTycqMYJA8zYRtGSk9WE08QI"

# Expected: {"ok":true,"removed":true,"email":"contact-delete-test@example.com"}

# 3. admin_gift_token — SKIP LIVE TEST here (would consume a real token).
#    Instead, test via the dashboard UI in Task 9.
```

- [ ] **Step 6: Commit**

```bash
cd "/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA"
git add projects/ma-learn-launch/apps-script/token-validator/Code.js
cd ~/code/ma-learn-dashboard
git add apps-script/contact-endpoints.js
git commit -m "feat(apps-script): admin_gift_token + admin_remove_subscriber + admin_resend_access_link"
```

---

### Task 8: Backend write routes for contact actions

**Files:**
- Create: `backend/src/routes/writes-contact.ts`
- Create: `backend/tests/routes/writes-contact.test.ts`
- Modify: `backend/src/server.ts`

- [ ] **Step 1: Write failing tests**

File: `backend/tests/routes/writes-contact.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import writesContactRoute from '../../src/routes/writes-contact.js';

function setup(appsScriptOverride?: any) {
  const appsScript = appsScriptOverride ?? { call: vi.fn().mockResolvedValue({ ok: true }) };
  const app = Fastify();
  return app.register(writesContactRoute, {
    appsScript,
    requireAuth: () => 'majid',
    invalidateCache: vi.fn(),
  }).then(() => ({ app, appsScript }));
}

describe('writes-contact routes', () => {
  it('POST /resend_link calls admin_resend_access_link', async () => {
    const { app, appsScript } = await setup();
    const res = await app.inject({
      method: 'POST', url: '/api/writes/contact/resend_link',
      payload: { email: 'a@x.com', product: 'creative-ai-workshop-t3' },
    });
    expect(res.statusCode).toBe(200);
    expect(appsScript.call).toHaveBeenCalledWith('admin_resend_access_link',
      expect.objectContaining({ email: 'a@x.com', product: 'creative-ai-workshop-t3' }));
  });

  it('POST /gift calls admin_gift_token + invalidates cache', async () => {
    const invalidate = vi.fn();
    const appsScript = { call: vi.fn().mockResolvedValue({ ok: true }) };
    const app = Fastify();
    await app.register(writesContactRoute, { appsScript, requireAuth: () => 'majid', invalidateCache: invalidate });
    const res = await app.inject({
      method: 'POST', url: '/api/writes/contact/gift',
      payload: { email: 'a@x.com', product: 'intro-to-creative-ai', name: 'Alice' },
    });
    expect(res.statusCode).toBe(200);
    expect(appsScript.call).toHaveBeenCalledWith('admin_gift_token',
      expect.objectContaining({ email: 'a@x.com', product: 'intro-to-creative-ai', name: 'Alice' }));
    expect(invalidate).toHaveBeenCalled();
  });

  it('POST /delete calls admin_remove_subscriber + invalidates cache', async () => {
    const invalidate = vi.fn();
    const appsScript = { call: vi.fn().mockResolvedValue({ ok: true }) };
    const app = Fastify();
    await app.register(writesContactRoute, { appsScript, requireAuth: () => 'majid', invalidateCache: invalidate });
    const res = await app.inject({
      method: 'POST', url: '/api/writes/contact/delete',
      payload: { email: 'a@x.com' },
    });
    expect(res.statusCode).toBe(200);
    expect(appsScript.call).toHaveBeenCalledWith('admin_remove_subscriber',
      expect.objectContaining({ email: 'a@x.com' }));
    expect(invalidate).toHaveBeenCalled();
  });

  it('surfaces apps-script errors as 400', async () => {
    const appsScript = { call: vi.fn().mockRejectedValue(new Error('apps_script_no_tokens_available')) };
    const app = Fastify();
    await app.register(writesContactRoute, { appsScript, requireAuth: () => 'majid', invalidateCache: vi.fn() });
    const res = await app.inject({
      method: 'POST', url: '/api/writes/contact/gift',
      payload: { email: 'a@x.com', product: 'intro-to-creative-ai' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('no_tokens_available');
  });

  it('401 when not authed', async () => {
    const app = Fastify();
    await app.register(writesContactRoute, {
      appsScript: { call: vi.fn() },
      requireAuth: () => null,
      invalidateCache: vi.fn(),
    });
    const res = await app.inject({
      method: 'POST', url: '/api/writes/contact/delete',
      payload: { email: 'a@x.com' },
    });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Implement route plugin**

File: `backend/src/routes/writes-contact.ts`

```typescript
import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';

interface AppsScriptClient {
  call<T = unknown>(action: string, params: Record<string, unknown>): Promise<T>;
}

interface Opts {
  appsScript: AppsScriptClient;
  requireAuth: (req: FastifyRequest) => string | null;
  invalidateCache: () => void;
}

const ResendBody = z.object({ email: z.string().email(), product: z.string().min(1) });
const GiftBody   = z.object({ email: z.string().email(), product: z.string().min(1), name: z.string().optional(), note: z.string().optional() });
const DeleteBody = z.object({ email: z.string().email() });

const plugin: FastifyPluginAsync<Opts> = async (app, opts) => {
  app.post('/api/writes/contact/resend_link', async (req, reply) => {
    if (!opts.requireAuth(req)) return reply.code(401).send({ error: 'unauthorized' });
    const parsed = ResendBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    try {
      const r = await opts.appsScript.call('admin_resend_access_link', parsed.data);
      return r;
    } catch (e: any) {
      return reply.code(400).send({ ok: false, error: e.message });
    }
  });

  app.post('/api/writes/contact/gift', async (req, reply) => {
    if (!opts.requireAuth(req)) return reply.code(401).send({ error: 'unauthorized' });
    const parsed = GiftBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    try {
      const r = await opts.appsScript.call('admin_gift_token', parsed.data);
      opts.invalidateCache();
      return r;
    } catch (e: any) {
      return reply.code(400).send({ ok: false, error: e.message });
    }
  });

  app.post('/api/writes/contact/delete', async (req, reply) => {
    if (!opts.requireAuth(req)) return reply.code(401).send({ error: 'unauthorized' });
    const parsed = DeleteBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    try {
      const r = await opts.appsScript.call('admin_remove_subscriber', parsed.data);
      opts.invalidateCache();
      return r;
    } catch (e: any) {
      return reply.code(400).send({ ok: false, error: e.message });
    }
  });
};

export default plugin;
```

- [ ] **Step 3: Register in `server.ts`**

Modify `backend/src/server.ts`:

```typescript
import writesContactRoute from './routes/writes-contact.js';
import { invalidateContactsCache } from './data/contacts.js';
// ... next to other route registrations:
if (config.APPS_SCRIPT_URL && config.SHEET_ID) {
  await app.register(writesContactRoute, {
    appsScript,
    requireAuth,
    invalidateCache: invalidateContactsCache,
  });
}
```

- [ ] **Step 4: Run tests + build**

```bash
npm test -- writes-contact
npm run build
```
Expected: 5 tests pass, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/writes-contact.ts backend/tests/routes/writes-contact.test.ts backend/src/server.ts
git commit -m "feat(contacts): POST routes for resend_link, gift, delete"
```

---

### Task 9: Wire action buttons in Contacts page

**Files:**
- Modify: `frontend/public/js/pages/contacts.js`

- [ ] **Step 1: Import composer + openApprovalModal**

At top of `frontend/public/js/pages/contacts.js`:

```javascript
import { api } from '../api.js';
import { mountComposer } from '../composer/index.js';
```

- [ ] **Step 2: Remove `disabled` from all 4 action buttons + add handlers**

Find the `<div class="action-bar" id="d-actions">` HTML inside `renderDetail()`. Replace it with:

```javascript
      <div class="action-bar" id="d-actions">
        <button class="primary" data-act="email">✉ Send email</button>
        <button data-act="resend" ${c.tokens.length===0?'disabled title="No active courses to resend"':''}>🔗 Resend link</button>
        <button data-act="gift">🎁 Gift</button>
        <button class="danger" data-act="delete">🗑 Delete</button>
      </div>
```

Append the wiring in `renderDetail()` (right after the Escape keyboard listener block):

```javascript
    el.querySelectorAll('.action-bar button').forEach(btn => {
      btn.onclick = () => onAction(btn.dataset.act, c);
    });
```

Add a new `onAction` function in the same scope (inside `mount()`):

```javascript
  async function onAction(act, c) {
    if (act === 'email')   return actionSendEmail(c);
    if (act === 'resend')  return actionResendLink(c);
    if (act === 'gift')    return actionGift(c);
    if (act === 'delete')  return actionDelete(c);
  }

  function actionSendEmail(c) {
    const o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = `
      <div class="modal-card" style="max-width:1100px;max-height:92vh;overflow-y:auto">
        <h3>Send email to ${escapeHtml(c.name || c.email)}</h3>
        <p style="color:var(--c-ink-2);font-size:.85rem;margin-bottom:10px">
          Recipient: <strong>${escapeHtml(c.email)}</strong>
        </p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="form-field"><label>Subject</label><input id="e-subj" value="" /></div>
          <div class="form-field"><label>Language</label>
            <select id="e-lang">
              <option value="${c.language}">${c.language==='AR'?'العربية':'English'}</option>
              <option value="${c.language==='AR'?'EN':'AR'}">${c.language==='AR'?'English':'العربية'}</option>
            </select></div>
        </div>
        <div id="e-composer"></div>
        <div class="modal-actions">
          <button class="btn-ghost" id="e-cancel">Cancel</button>
          <button class="btn-primary" id="e-send">Send</button>
        </div>
        <div class="modal-msg" id="e-msg"></div>
      </div>`;
    document.body.appendChild(o);
    o.addEventListener('mousedown', e => { if (e.target === o) o.remove(); });

    let blocks = [];
    const subjEl = o.querySelector('#e-subj');
    const comp = mountComposer({
      root: o.querySelector('#e-composer'),
      initialBlocks: [],
      language: c.language,
      onChange: b => { blocks = b; },
      getHeader: () => ({ subject: subjEl.value, preheader: '' }),
    });
    subjEl.addEventListener('input', () => comp.refreshPreview());

    o.querySelector('#e-cancel').onclick = () => o.remove();
    o.querySelector('#e-send').onclick = async () => {
      const subject = subjEl.value.trim();
      if (!subject) { o.querySelector('#e-msg').textContent = 'Subject required.'; return; }
      o.querySelector('#e-msg').textContent = 'Sending…';
      try {
        // Step 1: create draft newsletter with onlyEmails segment
        const save = await api('/api/writes/newsletter/save', {
          method: 'POST',
          body: JSON.stringify({
            subject, preheader: '',
            language: o.querySelector('#e-lang').value,
            blocks,
            segmentFilter: { onlyEmails: [c.email] },
          }),
        });
        // Step 2: send now
        const send = await api('/api/writes/newsletter/send_now', {
          method: 'POST',
          body: JSON.stringify({ newsletterId: save.newsletterId }),
        });
        if (send.ok) {
          o.querySelector('#e-msg').textContent = `Sent to ${send.sent} recipient.`;
          setTimeout(() => o.remove(), 1200);
        } else {
          o.querySelector('#e-msg').textContent = `Error: ${send.error || 'unknown'}`;
        }
      } catch (e) {
        o.querySelector('#e-msg').textContent = `Error: ${e.message}`;
      }
    };
  }

  async function actionResendLink(c) {
    if (c.tokens.length === 0) return;
    // If multiple tokens, let the user pick.
    let product;
    if (c.tokens.length === 1) {
      product = c.tokens[0].product;
    } else {
      const options = c.tokens.map((t, i) => `${i + 1}. ${PRODUCT_LABELS[t.product] || t.product}`).join('\n');
      const pick = prompt(`Which course to resend?\n${options}\n\nType 1–${c.tokens.length}:`);
      const idx = Number(pick) - 1;
      if (!(idx >= 0 && idx < c.tokens.length)) return;
      product = c.tokens[idx].product;
    }
    toast('Resending…');
    try {
      const r = await api('/api/writes/contact/resend_link', {
        method: 'POST', body: JSON.stringify({ email: c.email, product }),
      });
      if (r.ok) toast(`Resent ${PRODUCT_LABELS[product] || product} access ✓`, 'success');
      else toast(`Error: ${r.error || 'unknown'}`, 'error');
    } catch (e) {
      toast(`Error: ${e.message}`, 'error');
    }
  }

  function actionGift(c) {
    const o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = `
      <div class="modal-card" style="max-width:480px">
        <h3>Gift access to ${escapeHtml(c.name || c.email)}</h3>
        <div class="form-field">
          <label>Which course?</label>
          <select id="g-product">
            <option value="">— Pick —</option>
            <option value="intro-to-creative-ai">T2 — Intro to Creative AI</option>
            <option value="creative-ai-workshop-t3">T3 — Creative AI Workshop</option>
            <option value="beyond-lighting">Beyond Lighting</option>
            <option value="prompt-pack">Prompt Pack</option>
          </select>
        </div>
        <div class="form-field">
          <label>Optional note (included in the email)</label>
          <textarea id="g-note" rows="3"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn-ghost" id="g-cancel">Cancel</button>
          <button class="btn-primary" id="g-go">Gift it</button>
        </div>
        <div class="modal-msg" id="g-msg"></div>
      </div>`;
    document.body.appendChild(o);
    o.addEventListener('mousedown', e => { if (e.target === o) o.remove(); });
    o.querySelector('#g-cancel').onclick = () => o.remove();
    o.querySelector('#g-go').onclick = async () => {
      const product = o.querySelector('#g-product').value;
      const note = o.querySelector('#g-note').value.trim();
      if (!product) { o.querySelector('#g-msg').textContent = 'Pick a course.'; return; }
      o.querySelector('#g-msg').textContent = 'Gifting…';
      try {
        const r = await api('/api/writes/contact/gift', {
          method: 'POST', body: JSON.stringify({ email: c.email, product, name: c.name, note }),
        });
        if (r.ok) {
          o.querySelector('#g-msg').textContent = 'Gifted ✓ — detail refreshing…';
          setTimeout(async () => {
            o.remove();
            await loadDetail(c.email);
            await loadList();
          }, 900);
        } else {
          o.querySelector('#g-msg').textContent = `Error: ${r.error || 'unknown'}`;
        }
      } catch (e) {
        o.querySelector('#g-msg').textContent = `Error: ${e.message}`;
      }
    };
  }

  function actionDelete(c) {
    const o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = `
      <div class="modal-card" style="max-width:480px">
        <h3>Delete this contact?</h3>
        <div class="delete-preview">
          <div class="n">${escapeHtml(c.name || '—')}</div>
          <div class="e">${escapeHtml(c.email)}</div>
          <div class="facts">
            Sources: ${escapeHtml(c.sources.join(', ') || '—')}<br>
            ${c.purchases.length} purchases · ${c.tokens.length} tokens
          </div>
        </div>
        <p style="color:var(--c-ink-2);font-size:.85rem;line-height:1.5">
          This removes their row from the Subscribers sheet. Their purchase
          history, tokens, and access stay intact — they can still log in with
          existing access links. They simply stop receiving newsletters and
          won't appear in Contacts.
        </p>
        <p style="color:var(--c-ink-3);font-size:.78rem">
          To fully revoke access, edit the Tokens sheet directly.
        </p>
        <div class="modal-actions">
          <button class="btn-ghost" id="x-cancel">Cancel</button>
          <button class="btn-primary" id="x-go" style="background:var(--c-danger);color:#fff">Delete this contact</button>
        </div>
        <div class="modal-msg" id="x-msg"></div>
      </div>`;
    document.body.appendChild(o);
    o.addEventListener('mousedown', e => { if (e.target === o) o.remove(); });
    o.querySelector('#x-cancel').onclick = () => o.remove();
    o.querySelector('#x-go').onclick = async () => {
      o.querySelector('#x-msg').textContent = 'Deleting…';
      try {
        const r = await api('/api/writes/contact/delete', {
          method: 'POST', body: JSON.stringify({ email: c.email }),
        });
        if (r.ok) {
          o.remove();
          toast('Deleted ✓', 'success');
          state.selectedEmail = null; state.selectedDetail = null;
          await loadList();
          render();
        } else {
          o.querySelector('#x-msg').textContent = `Error: ${r.error || 'unknown'}`;
        }
      } catch (e) {
        o.querySelector('#x-msg').textContent = `Error: ${e.message}`;
      }
    };
  }
```

- [ ] **Step 3: Syntax-check + commit**

```bash
node --check frontend/public/js/pages/contacts.js
git add frontend/public/js/pages/contacts.js
git commit -m "feat(contacts): wire send-email / resend / gift / delete actions"
```

---

### Task 10: Deploy Stage B + full smoke test

**Files:** No file changes. Operator deploy.

- [ ] **Step 1: Deploy**

```bash
cd ~/code/ma-learn-dashboard
git push origin main
cd backend && npx tsc -p . && rsync -az -e "ssh -o ConnectTimeout=10" dist/ root@46.101.151.237:/var/www/ma-learn-dashboard/backend/dist/
ssh -n -o ConnectTimeout=10 root@46.101.151.237 'pm2 restart ma-learn-dashboard-staging --update-env'
curl -sS https://api-staging.malearnsa.com/health
```

- [ ] **Step 2: End-to-end smoke**

On admin-staging.malearnsa.com → Contacts:

- **Send email**: pick any contact → click ✉ Send email → type subject + add a text block → Send → should appear in Newsletter → Sent with recipient count 1.
- **Resend link**: pick a contact who bought T2 or T3 → click 🔗 Resend link → inbox receives the original access email (same wording as purchase-time).
- **Gift access**: pick a contact with no T2 → click 🎁 Gift → select T2 → Gift it → should refresh detail showing a new T2 Purchase row + T2 Token row. Email arrives with access link.
- **Copy email**: click 📋 → toast "Email copied ✓", paste somewhere to confirm.
- **Delete**: pick a throwaway contact (create one via the public subscribe API first) → click 🗑 → confirm → row removed, list refreshes, detail closes.

- [ ] **Step 3: Update current-priorities**

Modify `context/current-priorities.md` — add/update:

```markdown
## Contacts page shipped — 2026-04-23
- Split view (list + detail) at admin-staging.malearnsa.com/#contacts
- Joins Subscribers + Customers + Tokens, cached 30s
- Actions: send email (1:1 via composer), resend access link, gift, copy email, delete (with confirm)
- Apps Script v9 deployed via clasp
- Backlog: tags, notes, unsubscribe toggle, engagement stats — all v2
```

- [ ] **Step 4: Final commit**

```bash
cd "/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA"
git add context/current-priorities.md
git commit -m "docs(priorities): Contacts page shipped to staging"
```

---

## Self-Review

**Spec coverage check (each section → task):**
- D1 browser-first framing → Tasks 3, 5 (list + detail emphasizes browsing)
- D2 split view → Task 4 (CSS grid), Task 5 (HTML structure)
- D3 no new tabs → Task 2 (joins happen in `contacts.ts`)
- D4 Subscribers as primary → Task 2 (`joinContactList` uses subs as base iteration)
- D5 reuse block composer → Task 9 (`actionSendEmail` mounts composer)
- D6 new Apps Script endpoints → Task 7 (all three)
- D7 Delete confirm modal → Task 9 (`actionDelete` with preview)
- D8 tokens masked → Task 5 (renderDetail masks + reveal button)
- D9 v1 scope discipline → not implementing tags/notes/etc. Honored.
- D10 30s cache → Task 2 (`LIST_TTL_MS`)
- List view filters/sort/search → Task 5 (renderList + loadList)
- Detail panel structure → Task 5 (renderDetail)
- Keyboard nav (j/k/Esc) → Task 5 (document.onkeydown)
- Error handling via toasts → Task 5 (toast fn) + Task 9 (error paths)

**Placeholder scan:** No TBD/TODO/"fill in details" patterns in steps. All code blocks complete.

**Type consistency:** `ContactListRow` and `ContactDetail` interfaces used consistently across data + routes + frontend state. `SegmentFilter.onlyEmails` declared in Task 1, used in Task 9.

**Estimated wall time:** 4–6 hours total. Hard stops: none — clasp push automated, no DNS/Brevo setup needed.
