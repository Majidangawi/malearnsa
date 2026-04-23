# Player Chat V1 Implementation Plan (Supabase)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship per-lesson realtime chat inside the MA Learn player (`player.malearnsa.com`) for BL and ITCAI courses, backed by Supabase (Postgres + Realtime + Edge Functions + pg_cron) with custom HS256 JWTs minted by the existing Apps Script token-validator.

**Architecture:** Apps Script mints Supabase-compatible HS256 JWTs on top of the existing MA Learn token-validator flow. Postgres holds the data with RLS policies enforcing access. Supabase Realtime exposes `postgres_changes` subscriptions to the client. Edge Functions + pg_cron run weekly wipe + daily pin expiry. Visual language follows the Editorial Atelier tokens shipped in the player redesign.

**Tech Stack:** Vanilla ES modules · Supabase JS SDK v2 · Postgres 15 + RLS · pg_cron · Supabase Edge Functions (Deno) · Google Sheets API · Apps Script (V8 runtime) · HS256 HMAC for JWT signing.

**Spec:** `docs/superpowers/specs/2026-04-23-player-chat-design.md` (see especially §16 Supabase pivot)

**Supersedes:** `docs/superpowers/plans/2026-04-23-player-chat.md` (Firebase — deprecated 2026-04-24 due to KSA CNTXT reseller block)

---

## File structure

```
# NEW — Supabase project at ~/code/malearn-chat/
malearn-chat/
├── supabase/
│   ├── config.toml                      # supabase init output
│   ├── migrations/
│   │   ├── 0001_chat_schema.sql         # tables
│   │   ├── 0002_rls_policies.sql        # RLS helpers + policies
│   │   ├── 0003_wipe_functions.sql      # weekly_wipe() + pin_expiry_sweep() SQL funcs
│   │   └── 0004_pg_cron_schedules.sql   # cron.schedule() calls
│   ├── functions/
│   │   ├── archive-to-sheet/
│   │   │   ├── index.ts
│   │   │   └── deno.json
│   │   └── noor-alert/
│   │       ├── index.ts
│   │       └── deno.json
│   └── tests/
│       ├── messages_rls.test.sql        # pgTAP RLS tests
│       ├── pins_rls.test.sql
│       └── users_rls.test.sql
├── .gitignore
└── README.md

# MODIFIED — Player at ~/code/malearnsa-player/
malearnsa-player/
├── watch.html                           # add Supabase SDK, tabs, modals, chat UI
├── css/
│   ├── primitives.css                   # +3 imports
│   ├── primitives/
│   │   ├── tabs.css                     # NEW
│   │   ├── modal.css                    # NEW
│   │   └── dropdown.css                 # NEW
│   └── chat.css                         # NEW
└── js/
    ├── supabase-config.js               # NEW (project URL + anon key)
    └── chat/
        ├── auth.js                      # NEW — signs in via Apps Script-minted JWT
        ├── messages.js                  # NEW — realtime subscribe + send
        ├── mentions.js                  # NEW
        ├── moderation.js                # NEW
        ├── pins.js                      # NEW
        ├── unread.js                    # NEW
        └── displayName.js               # NEW

# MODIFIED — Apps Script at projects/ma-learn-launch/apps-script/token-validator/
token-validator/
├── Code.js                              # add action=mint_supabase_token
├── SupabaseAdmin.js                     # NEW — HS256 HMAC JWT signing
└── appsscript.json                      # unchanged
```

---

## Prerequisites (complete before Task 1)

Each item must be verified, not assumed:

- [ ] **P1:** Redesign Phases 1–5 live. Run `curl -s https://player.malearnsa.com/watch.html | grep -c '\-\-c-ink-0'` — expect ≥ 1.
- [ ] **P2:** `~/code/malearnsa-player/` clone exists and is on `main`, clean working tree (`git -C ~/code/malearnsa-player status`).
- [ ] **P3:** Apps Script token-validator scriptId matches memory `reference_apps_script_ids.md`: `1L9-cZE...`. Verify: `cat projects/ma-learn-launch/apps-script/token-validator/.clasp.json` shows that scriptId (per `feedback_verify_clasp_before_push.md`).
- [ ] **P4:** Node 20+ installed (`node --version`).
- [ ] **P5:** Supabase CLI installed (`supabase --version` ≥ 2.0). Install: `brew install supabase/tap/supabase`.
- [ ] **P6:** `clasp` installed and logged in (`clasp login --status`). Still required for Apps Script push.
- [ ] **P7:** Majid has a Supabase-eligible account. Supabase project `malearn-chat` already exists under `Majidangawi` → organization `MA Learn` (per `reference_supabase.md`, created 2026-04-24).

---

## Phase A — Backend foundation

Lays down the Supabase project wiring, Postgres schema, RLS policies, Apps Script HS256 JWT minting, and the Edge Function scaffolding. No UI changes. Exits when a student (via test curl against Apps Script) can obtain a Supabase-compatible JWT and `supabase.auth.setSession()` succeeds.

### Task 1: Initialize malearn-chat repo + supabase scaffolding

**Files:**
- Create: `~/code/malearn-chat/.gitignore`
- Create: `~/code/malearn-chat/README.md`
- Create: `~/code/malearn-chat/supabase/config.toml` (via `supabase init`)

- [ ] **Step 1: Create the directory and init git**

```bash
mkdir -p ~/code/malearn-chat
cd ~/code/malearn-chat
git init
```

- [ ] **Step 2: Run `supabase init`** — scaffolds `supabase/config.toml`, `supabase/migrations/`, `supabase/functions/`, `supabase/seed.sql`

```bash
cd ~/code/malearn-chat
supabase init
```

Expected output ends with: `Finished supabase init.`

- [ ] **Step 3: Link to the remote project** — binds this local repo to project ref `rmefydapbrirzgmmbyxx` (from `reference_supabase.md`)

```bash
supabase link --project-ref rmefydapbrirzgmmbyxx
```

Supabase will prompt for the DB password (stored in Majid's password manager under "Supabase malearn-chat DB"). **`[MANUAL — Majid]`** paste it when prompted.

Expected: `Finished supabase link.`

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
.env
.env.*
*.log
.DS_Store
.supabase/
supabase/.temp/
*.pem
*service-account*.json
```

- [ ] **Step 5: Create a minimal `README.md`**

```markdown
# malearn-chat

Supabase backend for the MA Learn player chat feature.

- **Project ref:** `rmefydapbrirzgmmbyxx`
- **URL:** `https://rmefydapbrirzgmmbyxx.supabase.co`
- **Region:** Frankfurt (`eu-central-1`)
- **Plan:** Free

Schema, RLS policies, Edge Functions, and cron schedules live under `supabase/`. Apply with `supabase db push`; deploy functions with `supabase functions deploy`.

See `docs/superpowers/plans/2026-04-24-player-chat-supabase.md` in the MA EA repo for the full implementation plan.
```

- [ ] **Step 6: Commit**

```bash
cd ~/code/malearn-chat
git add .gitignore README.md supabase/config.toml
git commit -m "chore: init malearn-chat supabase project scaffolding"
```

### Task 2: Verify Supabase CLI + project access

**Files:** none (verification step).

**Context:** Supabase project already created in Studio 2026-04-24 (see memory `reference_supabase.md`). This task confirms the CLI works end-to-end against the live project before we start pushing schema.

- [ ] **Step 1: Install/upgrade CLI** — skip if already installed

```bash
brew install supabase/tap/supabase
supabase --version
```

Expected: `2.x.x` or higher.

- [ ] **Step 2: Login to Supabase CLI**

```bash
supabase login
```

This opens a browser tab. **`[MANUAL — Majid]`** authorize with the `Majidangawi` GitHub account.

- [ ] **Step 3: Verify project link from Task 1 resolves**

```bash
cd ~/code/malearn-chat
supabase status
```

Expected: prints `API URL: https://rmefydapbrirzgmmbyxx.supabase.co` and related project metadata. If it errors, rerun `supabase link --project-ref rmefydapbrirzgmmbyxx`.

- [ ] **Step 4: Confirm the DB is reachable**

```bash
supabase db remote commit --dry-run
```

Expected: the CLI reports the current remote schema (empty on a fresh project) and no pending diff. If it prompts for DB password, paste from password manager.

### Task 3: Write migration `0001_chat_schema.sql` — all tables from spec §16.5

**Files:**
- Create: `~/code/malearn-chat/supabase/migrations/0001_chat_schema.sql`

- [ ] **Step 1: Create the migration file**

```bash
cd ~/code/malearn-chat
mkdir -p supabase/migrations
```

Write `supabase/migrations/0001_chat_schema.sql`:

```sql
-- 0001_chat_schema.sql
-- All tables for MA Learn player chat V1. RLS enabled on every table;
-- policies come in 0002_rls_policies.sql.

create extension if not exists pgcrypto;

-- ── users ───────────────────────────────────────────────────────────
create table public.users (
  uid           text primary key,
  email         text not null,
  display_name  text,
  is_majid      boolean not null default false,
  created_at    timestamptz not null default now(),
  last_seen     jsonb not null default '{}'::jsonb
);
alter table public.users enable row level security;

-- ── rooms ───────────────────────────────────────────────────────────
create table public.rooms (
  lesson_id        text primary key,
  course_id        text not null,
  lesson_title     text,
  message_count    integer not null default 0,
  last_message_at  timestamptz
);
alter table public.rooms enable row level security;

-- ── messages ────────────────────────────────────────────────────────
create table public.messages (
  id                    uuid primary key default gen_random_uuid(),
  lesson_id             text not null references public.rooms(lesson_id) on delete cascade,
  author_uid            text not null references public.users(uid),
  author_display_name   text not null,
  is_majid              boolean not null default false,
  body                  text not null check (char_length(body) between 1 and 500),
  mentions              text[] not null default array[]::text[],
  created_at            timestamptz not null default now(),
  deleted               boolean not null default false,
  ip_hash               text,
  user_agent            text
);
create index messages_lesson_created_idx on public.messages (lesson_id, created_at);
create index messages_mentions_gin       on public.messages using gin (mentions);
alter table public.messages enable row level security;

-- Trigger: keep rooms.message_count + last_message_at in sync on insert
create or replace function public.messages_room_counter() returns trigger
language plpgsql as $$
begin
  update public.rooms
     set message_count   = message_count + 1,
         last_message_at = new.created_at
   where lesson_id = new.lesson_id;
  return new;
end;
$$;

create trigger messages_room_counter_aiu
after insert on public.messages
for each row execute function public.messages_room_counter();

-- ── pins ────────────────────────────────────────────────────────────
create table public.pins (
  id                   uuid primary key default gen_random_uuid(),
  lesson_id            text not null references public.rooms(lesson_id) on delete cascade,
  author_uid           text not null,
  author_display_name  text not null,
  body                 text not null,
  pinned_at            timestamptz not null default now(),
  pinned_by            text not null,
  expires_at           timestamptz
);
create index pins_lesson_idx on public.pins (lesson_id);
create index pins_expires_idx on public.pins (expires_at) where expires_at is not null;
alter table public.pins enable row level security;

-- ── banned_uids ─────────────────────────────────────────────────────
create table public.banned_uids (
  uid         text primary key,
  banned_by   text not null,
  banned_at   timestamptz not null default now(),
  reason      text,
  expires_at  timestamptz
);
alter table public.banned_uids enable row level security;

-- ── reports ─────────────────────────────────────────────────────────
create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  msg_id        uuid not null,
  reporter_uid  text not null,
  room_id       text not null,
  created_at    timestamptz not null default now(),
  resolved      boolean not null default false
);
alter table public.reports enable row level security;

-- ── moderation_log ──────────────────────────────────────────────────
create table public.moderation_log (
  id             uuid primary key default gen_random_uuid(),
  action         text not null check (action in ('pin','unpin','soft_delete','hard_delete','ban','unban','clear_room')),
  actor_uid      text not null,
  target_uid     text,
  target_msg_id  uuid,
  room_id        text,
  reason         text,
  timestamp      timestamptz not null default now()
);
alter table public.moderation_log enable row level security;

-- ── archives ────────────────────────────────────────────────────────
create table public.archives (
  week_tag           text primary key,
  week_start         date not null,
  week_end           date not null,
  sheet_url          text not null,
  message_count      integer not null,
  wipe_completed_at  timestamptz not null
);
alter table public.archives enable row level security;

-- ── wipe_errors ─────────────────────────────────────────────────────
create table public.wipe_errors (
  id            uuid primary key default gen_random_uuid(),
  error         text not null,
  stack         text,
  retry_count   integer not null default 0,
  occurred_at   timestamptz not null default now()
);
alter table public.wipe_errors enable row level security;

-- ── session_events ──────────────────────────────────────────────────
create table public.session_events (
  id          uuid primary key default gen_random_uuid(),
  uid         text not null,
  event       text not null check (event in ('sign_in','token_refresh')),
  ip_hash     text,
  user_agent  text,
  timestamp   timestamptz not null default now()
);
alter table public.session_events enable row level security;

-- ── rate_state ──────────────────────────────────────────────────────
create table public.rate_state (
  uid            text primary key,
  minute_bucket  timestamptz not null,
  minute_count   integer not null default 0,
  hour_bucket    timestamptz not null,
  hour_count     integer not null default 0,
  day_bucket     timestamptz not null,
  day_count      integer not null default 0,
  last_body      text,
  last_body_at   timestamptz
);
alter table public.rate_state enable row level security;
```

- [ ] **Step 2: Push the migration to the live project**

```bash
cd ~/code/malearn-chat
supabase db push
```

Expected: `Applying migration 0001_chat_schema.sql... Finished supabase db push.`

- [ ] **Step 3: Verify the tables landed**

```bash
supabase db remote commit --dry-run
```

Expected: no pending diff — local migrations match remote.

- [ ] **Step 4: Enable Realtime on `messages` and `pins`** (one-click toggle in Studio)

**`[MANUAL — Majid]`** Go to `https://supabase.com/dashboard/project/rmefydapbrirzgmmbyxx/database/replication`. Toggle ON replication for tables `messages` and `pins`. Leave all other tables OFF — we only push realtime feeds where the client actually subscribes.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_chat_schema.sql
git commit -m "feat(db): 0001 — chat schema (users/rooms/messages/pins + supporting tables)"
```

### Task 4: Scaffold pgTAP test harness

**Files:**
- Create: `~/code/malearn-chat/supabase/tests/.gitkeep`

**Context:** Supabase CLI ships `supabase test db` which runs SQL files under `supabase/tests/` through pgTAP against a local test DB. Each RLS test file asserts behavior against seed data.

- [ ] **Step 1: Enable pgTAP in a new migration helper** — pgTAP is already present in Supabase local dev DB, but we need to expose its helpers. Create the file `supabase/tests/README.md`:

```markdown
# RLS tests (pgTAP)

Run with `supabase test db` from the repo root. Each file seeds its own JWT context via `set request.jwt.claims` and asserts that RLS allows/denies the expected rows.
```

- [ ] **Step 2: Start the local stack** — required to run tests

```bash
cd ~/code/malearn-chat
supabase start
```

Expected: prints local API URL, DB URL, Studio URL (typically `http://localhost:54321`, `postgresql://postgres:postgres@localhost:54322/postgres`, `http://localhost:54323`).

- [ ] **Step 3: Smoke-run the (empty) test suite**

```bash
supabase test db
```

Expected: `No test files found` (or `0 tests`) — confirms the harness is wired.

- [ ] **Step 4: Commit**

```bash
git add supabase/tests/README.md
git commit -m "chore(tests): scaffold supabase pgTAP test harness"
```

### Task 5: Write failing RLS tests for `users` table

**Files:**
- Create: `~/code/malearn-chat/supabase/tests/users_rls.test.sql`

- [ ] **Step 1: Create `users_rls.test.sql`**

```sql
-- supabase/tests/users_rls.test.sql
-- Expected behavior:
--  1) authed user can read own row
--  2) authed user cannot read another user's row
--  3) authed user can insert own row with is_majid=false
--  4) authed user CANNOT insert with is_majid=true (unless JWT claims it)
--  5) unauthed user cannot read any row

begin;
select plan(5);

-- Seed one row bypassing RLS (we use service role in tests implicitly via plain SQL here)
set local role postgres;
insert into public.users (uid, email, display_name, is_majid)
  values ('alice', 'alice@example.com', 'Alice', false),
         ('bob',   'bob@example.com',   'Bob',   false);

-- ── Test 1: alice can read her own row ─────────────────────────────
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"alice","role":"authenticated","app_metadata":{"isMajid":false}}';
select is(
  (select count(*)::int from public.users where uid = 'alice'),
  1,
  'alice can read her own row'
);

-- ── Test 2: alice cannot read bob's row ────────────────────────────
select is(
  (select count(*)::int from public.users where uid = 'bob'),
  0,
  'alice cannot read bob''s row'
);

-- ── Test 3: alice can insert a row for herself with is_majid=false ─
set local "request.jwt.claims" to '{"sub":"carol","role":"authenticated","app_metadata":{"isMajid":false}}';
prepare insert_self as
  insert into public.users (uid, email, display_name, is_majid)
  values ('carol', 'carol@example.com', 'Carol', false);
select lives_ok('execute insert_self', 'authed user can insert own row with is_majid=false');

-- ── Test 4: alice cannot claim is_majid=true on insert ─────────────
set local "request.jwt.claims" to '{"sub":"mallory","role":"authenticated","app_metadata":{"isMajid":false}}';
prepare insert_majid as
  insert into public.users (uid, email, display_name, is_majid)
  values ('mallory', 'mallory@example.com', 'Mallory', true);
select throws_ok('execute insert_majid', '42501', 'new row violates row-level security policy for table "users"',
  'authed user cannot claim is_majid=true on insert');

-- ── Test 5: unauthed user cannot read any row ──────────────────────
set local role anon;
set local "request.jwt.claims" to null;
select is(
  (select count(*)::int from public.users),
  0,
  'anon cannot read any user row'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the suite — expect all 5 to fail (RLS has no policies yet, default-deny)**

```bash
cd ~/code/malearn-chat
supabase test db
```

Expected: 5 tests fail because RLS blocks ALL access (even the expected-succeed cases). The failures confirm RLS is on.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/users_rls.test.sql
git commit -m "test(rls): failing users table RLS tests"
```

### Task 6: Write migration `0002_rls_policies.sql` — helpers + users policies

**Files:**
- Create: `~/code/malearn-chat/supabase/migrations/0002_rls_policies.sql`

- [ ] **Step 1: Create the migration**

```sql
-- 0002_rls_policies.sql
-- RLS helpers + policies for users table. Other tables' policies
-- come in this same file once Task 18 extends it; split kept logical.

-- ── Helpers ─────────────────────────────────────────────────────────
create or replace function public.is_majid() returns boolean
language sql stable as $$
  select coalesce((auth.jwt()->'app_metadata'->>'isMajid')::boolean, false);
$$;

create or replace function public.is_banned() returns boolean
language sql stable as $$
  select exists (
    select 1 from public.banned_uids
    where uid = auth.uid()
      and (expires_at is null or expires_at > now())
  );
$$;

-- ── users: self read/write; cannot claim is_majid ──────────────────
create policy users_self_read on public.users for select
  using (uid = auth.uid() or public.is_majid());

create policy users_self_insert on public.users for insert
  with check (
    uid = auth.uid()
    and is_majid = public.is_majid()
  );

create policy users_self_update on public.users for update
  using (uid = auth.uid())
  with check (
    is_majid = (select is_majid from public.users where uid = auth.uid())
    and email = (select email from public.users where uid = auth.uid())
  );
```

- [ ] **Step 2: Apply locally first via `supabase db reset`** — replays all migrations

```bash
cd ~/code/malearn-chat
supabase db reset
```

- [ ] **Step 3: Re-run the test suite — expect 5 passing**

```bash
supabase test db
```

Expected: 5 passing for `users_rls.test.sql`.

- [ ] **Step 4: Push to remote**

```bash
supabase db push
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_rls_policies.sql
git commit -m "feat(rls): users policies + is_majid/is_banned helpers"
```

### Task 7: Scaffold Edge Functions directories

**Files:**
- Create: `~/code/malearn-chat/supabase/functions/archive-to-sheet/index.ts` (stub)
- Create: `~/code/malearn-chat/supabase/functions/archive-to-sheet/deno.json`
- Create: `~/code/malearn-chat/supabase/functions/noor-alert/index.ts` (stub)
- Create: `~/code/malearn-chat/supabase/functions/noor-alert/deno.json`

- [ ] **Step 1: Create the `archive-to-sheet` stub**

Write `supabase/functions/archive-to-sheet/index.ts`:

```typescript
// supabase/functions/archive-to-sheet/index.ts
// Called by public.weekly_wipe() over net.http_post. Body: { weekTag, rows }.
// Implementation lands in Task 27 — stub here to keep the deploy shape stable.

Deno.serve(async (_req: Request) => {
  return new Response(
    JSON.stringify({ ok: false, error: 'not_implemented' }),
    { status: 501, headers: { 'content-type': 'application/json' } }
  );
});
```

Write `supabase/functions/archive-to-sheet/deno.json`:

```json
{
  "imports": {
    "google-auth-library": "npm:google-auth-library@9.14.0",
    "googleapis": "npm:googleapis@134.0.0"
  }
}
```

- [ ] **Step 2: Create the `noor-alert` stub**

Write `supabase/functions/noor-alert/index.ts`:

```typescript
// supabase/functions/noor-alert/index.ts
// Called by public.weekly_wipe() on completion + failure.
// Body: { source: 'chat-wipe', text: '...' }. Implementation lands in Task 29.

Deno.serve(async (_req: Request) => {
  return new Response(
    JSON.stringify({ ok: false, error: 'not_implemented' }),
    { status: 501, headers: { 'content-type': 'application/json' } }
  );
});
```

Write `supabase/functions/noor-alert/deno.json`:

```json
{ "imports": {} }
```

- [ ] **Step 3: Smoke-deploy the stubs** — confirms the functions folder layout is valid

```bash
cd ~/code/malearn-chat
supabase functions deploy archive-to-sheet
supabase functions deploy noor-alert
```

Expected: both deploy green with URLs `https://rmefydapbrirzgmmbyxx.supabase.co/functions/v1/archive-to-sheet` and `.../noor-alert`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/
git commit -m "chore(functions): scaffold archive-to-sheet + noor-alert stubs"
```

### Task 8: Store `SUPABASE_JWT_SECRET` in Apps Script Script Properties

**Files:** none locally. Apps Script Properties Service only.

**Context:** Apps Script needs the Supabase **Legacy JWT Secret** (the HS256 symmetric key) to sign custom JWTs. Value lives only in Script Properties — never in git, never in this plan, never in memory files.

- [ ] **Step 1:** **`[MANUAL — Majid]`** Open Supabase Studio → Settings → API → **JWT Settings**. Copy the value shown as **"JWT Secret"** (the legacy HS256 secret) to clipboard.

- [ ] **Step 2:** **`[MANUAL — Majid]`** Open `https://script.google.com/` → `token-validator` (scriptId `1L9-cZE...` per memory `reference_apps_script_ids.md`).

- [ ] **Step 3:** **`[MANUAL — Majid]`** Project Settings (gear icon) → Script Properties → Add script property:

- Key: `SUPABASE_JWT_SECRET`
- Value: *(paste the secret from Step 1)*

Click "Save".

- [ ] **Step 4: Verification in Apps Script editor** — **`[MANUAL — Majid]`** paste this one-liner into the Apps Script editor, run it, then delete:

```javascript
function __verifySupabaseSecret() {
  var p = PropertiesService.getScriptProperties().getProperty('SUPABASE_JWT_SECRET');
  Logger.log('SUPABASE_JWT_SECRET length = ' + (p ? p.length : 0));
}
```

Expected Logger output: a length > 20 (a real JWT Secret is typically 40+ chars). If 0 or null, re-do Step 3.

Delete the `__verifySupabaseSecret` function after the check — never leave a secret-length probe in production code.

### Task 9: Implement `SupabaseAdmin.js` (HS256 JWT signing) in Apps Script

**Files:**
- Create: `projects/ma-learn-launch/apps-script/token-validator/SupabaseAdmin.js`

- [ ] **Step 1: Create the file with:**

```javascript
/**
 * SupabaseAdmin.js
 * Mint Supabase-compatible JWTs from Apps Script using HS256 HMAC signing with
 * the JWT Secret stored in Script Properties. Payload matches spec §16.4.
 *
 * Contract: mintSupabaseToken_(uid, email, displayName, isMajid) -> signed JWT string (1h expiry)
 */

function mintSupabaseToken_(uid, email, displayName, isMajid) {
  var props = PropertiesService.getScriptProperties();
  var jwtSecret = props.getProperty('SUPABASE_JWT_SECRET');
  if (!jwtSecret) throw new Error('SUPABASE_JWT_SECRET not set in Script Properties');

  var now = Math.floor(Date.now() / 1000);
  var header = { alg: 'HS256', typ: 'JWT' };
  var payload = {
    sub: String(uid),
    aud: 'authenticated',
    role: 'authenticated',
    email: String(email || ''),
    iss: 'supabase',
    iat: now,
    exp: now + 3600,
    app_metadata: { isMajid: !!isMajid, provider: 'ma-learn' },
    user_metadata: { displayName: displayName || null }
  };

  var encHeader = base64UrlEncode_(JSON.stringify(header));
  var encPayload = base64UrlEncode_(JSON.stringify(payload));
  var signingInput = encHeader + '.' + encPayload;

  var signatureBytes = Utilities.computeHmacSha256Signature(signingInput, jwtSecret);
  var encSignature = base64UrlEncodeBytes_(signatureBytes);

  return signingInput + '.' + encSignature;
}

function base64UrlEncode_(str) {
  return base64UrlEncodeBytes_(Utilities.newBlob(str).getBytes());
}

function base64UrlEncodeBytes_(bytes) {
  return Utilities.base64Encode(bytes)
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
```

- [ ] **Step 2: Verify syntactically via Apps Script editor**

Open `token-validator` in Apps Script. **`[MANUAL — Majid]`** paste the file contents as a new script file named `SupabaseAdmin.gs` (Apps Script renames `.js` to `.gs` on save), save. Confirm no syntax errors shown.

- [ ] **Step 3: Verify the secret works by decoding the JWT** — **`[MANUAL — Majid]`** in the Apps Script editor, paste this probe and run once:

```javascript
function __probeMintSupabase() {
  var jwt = mintSupabaseToken_('u_test', 'test@example.com', 'Test', false);
  Logger.log(jwt);
}
```

Logger will print the JWT. Copy it. Open `https://jwt.io/`, paste in the "Encoded" box, expand the "Verify Signature" section, paste the JWT Secret into the `your-256-bit-secret` box. Check "secret base64 encoded" = OFF. Expected: green "Signature Verified" indicator, decoded payload shows `sub: "u_test"`, `aud: "authenticated"`, `app_metadata.isMajid: false`. Delete the probe function after.

### Task 10: Add `action=mint_supabase_token` endpoint to `Code.js`

**Files:**
- Modify: `projects/ma-learn-launch/apps-script/token-validator/Code.js` (near the `doGet` action dispatcher)

- [ ] **Step 1: Locate the `doGet` action switch in `Code.js`**

Grep within the file for `'validate_token'` to find the dispatcher (~line 110 per current file).

- [ ] **Step 2: Add a new branch for `mint_supabase_token`**

Inside the `if/else` chain in `doGet`, alongside the other `else if` lines, insert:

```javascript
    else if (action === 'mint_supabase_token')    result = handleMintSupabaseToken_(e.parameter);
```

- [ ] **Step 3: Add the handler function at the bottom of `Code.js`**

```javascript
/**
 * action=mint_supabase_token
 * Params: token (required), course (required)
 * Validates the MA Learn token, looks up the student in the Tokens sheet,
 * mints a Supabase-compatible HS256 JWT, returns it plus basic profile fields.
 * Returns: { ok: true, supabaseToken, uid, email, displayName?, isMajid }
 */
function handleMintSupabaseToken_(params) {
  var token = params.token;
  var course = params.course;
  if (!token || !course) {
    return { ok: false, error: 'missing token or course' };
  }

  var check = validateToken(token, course);
  if (!check.valid) {
    return { ok: false, error: 'invalid_token', reason: check.reason };
  }

  // Re-open the Tokens sheet once to find the full row (email, displayName).
  var ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  var sheet = ss.getSheetByName(TOKENS_SHEET);
  if (!sheet) return { ok: false, error: 'tokens_sheet_missing' };
  var data = sheet.getDataRange().getValues();
  var row = null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === token) { row = data[i]; break; }
  }
  if (!row) return { ok: false, error: 'row_not_found' };

  // Column layout (match other handlers in this file): 0 token, 1 course,
  // 2 status, 3 email, 4 displayName. If your sheet differs, adjust here.
  var email = String(row[3] || '').toLowerCase();
  var displayName = row[4] ? String(row[4]) : null;
  var isMajid = (email === 'majid@malearnsa.com' || email === 'majed.engawi@gmail.com');

  var uid = 'u_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email)
  ).replace(/=+$/, '').slice(0, 28);

  var supabaseToken = mintSupabaseToken_(uid, email, displayName, isMajid);

  return {
    ok: true,
    supabaseToken: supabaseToken,
    uid: uid,
    email: email,
    displayName: displayName,
    isMajid: isMajid
  };
}
```

- [ ] **Step 4: Verify the email column index matches the existing Tokens sheet**

Open `Code.js`, grep for other places that read `data[i][3]` or `row[3]` for email. If the Tokens sheet in production uses a different column for email (e.g. column E = index 4), adjust `row[3]` / `row[4]` in the snippet above. Don't guess — **`[MANUAL — Majid]`** confirm the column mapping if unsure.

- [ ] **Step 5: Save + deploy Apps Script** (per memory `feedback_verify_clasp_before_push.md`)

```bash
cd "/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA/projects/ma-learn-launch/apps-script/token-validator"
cat .clasp.json
```

Confirm `scriptId` matches `1L9-cZE...` (per memory `reference_apps_script_ids.md`). Then:

```bash
clasp push
```

Expected: `Pushed 3 files.` (Code.js + SupabaseAdmin.gs + appsscript.json).

- [ ] **Step 6: Smoke test** — **`[MANUAL — Majid]`** hit the deployed endpoint with a real test token

```bash
curl "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?action=mint_supabase_token&token=<valid-test-token>&course=bl"
```

Expected response:

```json
{ "ok": true, "supabaseToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....",
  "uid": "u_...", "email": "<student>", "displayName": null, "isMajid": false }
```

If `ok: false` — debug the Tokens sheet lookup before proceeding.

- [ ] **Step 7: Commit**

```bash
cd "/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA"
git add projects/ma-learn-launch/apps-script/token-validator/Code.js \
        projects/ma-learn-launch/apps-script/token-validator/SupabaseAdmin.js
git commit -m "feat(apps-script): mint_supabase_token endpoint + HS256 signing"
```

### Task 11: Verify Supabase accepts the minted JWT (browser smoke)

**Files:** none (smoke test only).

- [ ] **Step 1: Create a throwaway HTML test page** — **`[MANUAL — Majid]`** save as `/tmp/sb-smoke.html`:

```html
<!DOCTYPE html>
<html><body>
<pre id="log"></pre>
<script type="module">
  import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

  const log = (...xs) => { document.getElementById('log').textContent += xs.join(' ') + '\n'; };

  const SUPABASE_URL  = 'https://rmefydapbrirzgmmbyxx.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtZWZ5ZGFwYnJpcnpnbW1ieXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODQzMzQsImV4cCI6MjA5MjU2MDMzNH0.WBIXHC7QxbvUxO5dK3rKOh7179SoXL61vOkNwDJhQvQ';

  const MINTED_JWT = 'PASTE_FROM_TASK_10_STEP_6';

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
  const { data, error } = await supabase.auth.setSession({
    access_token: MINTED_JWT,
    refresh_token: MINTED_JWT
  });
  if (error) { log('setSession ERROR:', error.message); throw error; }
  log('setSession OK uid=', data?.user?.id || '(no user)');

  const { data: u, error: e2 } = await supabase.auth.getUser();
  if (e2) { log('getUser ERROR:', e2.message); throw e2; }
  log('getUser OK email=', u?.user?.email, 'isMajid=', u?.user?.app_metadata?.isMajid);
</script>
</body></html>
```

- [ ] **Step 2: Open in browser**

```bash
open /tmp/sb-smoke.html
```

Expected output in the `<pre>`:

```
setSession OK uid= u_<hash>
getUser OK email= <student>@... isMajid= false
```

If `setSession ERROR: invalid JWT: unable to parse or verify signature` — the JWT Secret in Apps Script doesn't match the project's JWT Secret. Re-check Task 8 Step 1.

- [ ] **Step 3: Delete the throwaway**

```bash
rm /tmp/sb-smoke.html
```

Per memory `feedback_show_before_delete.md`: contents already shown, approval is implicit in Task 11 structure. If revisited later, preview before deletion.

---

## Phase B — Core player UI

Ships tabbed lesson body + realtime messages + composer + display-name modal + Majid moderation menu on staging (`player.malearnsa.com`). No @mentions autocomplete, no unread badges, no wipe yet. Exits when Majid can post and delete messages in a real lesson room.

### Task 12: Add tabs primitive CSS

**Files:**
- Create: `~/code/malearnsa-player/css/primitives/tabs.css`
- Modify: `~/code/malearnsa-player/css/primitives.css`

- [ ] **Step 1: Create `tabs.css`**

```css
/* ── Tabs primitive — editorial underline ────────────────────────── */
[data-ui="tabs"] {
  display: flex; flex-direction: column; min-height: 0;
}
[data-ui="tabs"] > [data-role="tablist"] {
  display: flex; gap: var(--s-5);
  border-bottom: 0.5px solid var(--c-ink-4);
  padding: 0 var(--s-2);
  position: relative;
}
[data-ui="tabs"] > [data-role="tablist"] > [role="tab"] {
  background: transparent; border: 0; cursor: pointer;
  padding: var(--s-3) 0; margin: 0;
  font-size: var(--fs-label); letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--c-fg-2); font-weight: 500;
  border-bottom: 2px solid transparent;
  transition: color var(--dur-fast) var(--ease-out),
              border-color var(--dur-med) var(--ease-out);
}
[data-ui="tabs"] > [data-role="tablist"] > [role="tab"]:hover { color: var(--c-fg); }
[data-ui="tabs"] > [data-role="tablist"] > [role="tab"][aria-selected="true"] {
  color: var(--c-fg); border-bottom-color: var(--c-gold);
}
[data-ui="tabs"] > [data-role="tablist"] > [role="tab"] .tab-count {
  margin-inline-start: var(--s-1);
  color: var(--c-gold); font-variant-numeric: tabular-nums;
}
[data-ui="tabs"] > [data-role="tabpanel"] {
  display: none; flex: 1; min-height: 0;
  padding-top: var(--s-4);
}
[data-ui="tabs"] > [data-role="tabpanel"][data-state="active"] { display: flex; flex-direction: column; }
```

- [ ] **Step 2: Import in `primitives.css`**

Open `~/code/malearnsa-player/css/primitives.css` and add at the top (after existing `@import` lines):

```css
@import url('primitives/tabs.css');
```

- [ ] **Step 3: Commit**

```bash
cd ~/code/malearnsa-player
git add css/primitives/tabs.css css/primitives.css
git commit -m "feat(primitives): tabs — editorial underline variant"
```

### Task 13: Add modal + dropdown primitive CSS

**Files:**
- Create: `~/code/malearnsa-player/css/primitives/modal.css`
- Create: `~/code/malearnsa-player/css/primitives/dropdown.css`
- Modify: `~/code/malearnsa-player/css/primitives.css`

- [ ] **Step 1: Create `modal.css`**

```css
/* ── Modal primitive ─────────────────────────────────────────────── */
[data-ui="modal"] {
  position: fixed; inset: 0; z-index: 1000;
  display: none; align-items: center; justify-content: center;
  padding: var(--s-4);
}
[data-ui="modal"][data-state="open"] { display: flex; }
[data-ui="modal"] > .backdrop {
  position: absolute; inset: 0;
  background: oklch(0.04 0.003 82 / 0.72);
  backdrop-filter: blur(4px);
}
[data-ui="modal"] > .panel {
  position: relative;
  background: var(--c-ink-1);
  border: 0.5px solid var(--c-ink-4);
  border-radius: var(--r-lg);
  box-shadow: var(--e-modal);
  padding: var(--s-6);
  width: min(440px, 100%);
  animation: modalIn var(--dur-med) var(--ease-out);
}
[data-ui="modal"] > .panel > h2 {
  font-size: var(--fs-h2); margin-bottom: var(--s-3);
}
[data-ui="modal"] > .panel > p {
  color: var(--c-fg-2); margin-bottom: var(--s-5);
  font-size: var(--fs-body-sm); line-height: 1.6;
}
[data-ui="modal"] > .panel > .actions {
  display: flex; gap: var(--s-3); justify-content: flex-end;
}
@keyframes modalIn {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: none; }
}
```

- [ ] **Step 2: Create `dropdown.css`**

```css
/* ── Dropdown / menu primitive ───────────────────────────────────── */
[data-ui="menu"] {
  position: absolute; z-index: 900;
  background: var(--c-ink-2);
  border: 0.5px solid var(--c-ink-4);
  border-radius: var(--r-md);
  box-shadow: var(--e-raised);
  padding: var(--s-2);
  min-width: 180px; max-height: 280px;
  overflow-y: auto;
  display: none;
}
[data-ui="menu"][data-state="open"] { display: block; }
[data-ui="menu"] > [role="menuitem"] {
  display: flex; align-items: center; gap: var(--s-2);
  height: 32px; padding: 0 var(--s-2);
  border: 0; background: transparent; width: 100%;
  text-align: start; cursor: pointer;
  color: var(--c-fg); font-size: var(--fs-body-sm);
  border-radius: var(--r-sm);
}
[data-ui="menu"] > [role="menuitem"]:hover,
[data-ui="menu"] > [role="menuitem"][data-active="true"] {
  background: var(--c-ink-3);
}
[data-ui="menu"] > [role="menuitem"][data-tone="danger"] { color: var(--c-danger); }
[data-ui="menu"] > hr {
  border: 0; border-top: 0.5px solid var(--c-ink-4);
  margin: var(--s-1) 0;
}
```

- [ ] **Step 3: Update `primitives.css` imports**

```css
@import url('primitives/tabs.css');
@import url('primitives/modal.css');
@import url('primitives/dropdown.css');
@import url('primitives/toggle.css');
@import url('primitives/toast.css');
@import url('primitives/loader.css');
```

- [ ] **Step 4: Commit**

```bash
git add css/primitives/modal.css css/primitives/dropdown.css css/primitives.css
git commit -m "feat(primitives): modal + dropdown/menu primitives"
```

### Task 14: Add chat.css page styling

**Files:**
- Create: `~/code/malearnsa-player/css/chat.css`

- [ ] **Step 1: Create `chat.css`**

```css
/* ── Chat panel — inside Discussion tab ──────────────────────────── */
.chat-panel {
  display: flex; flex-direction: column; min-height: 0;
  gap: var(--s-3);
  height: 60vh; max-height: 640px;
}
.chat-empty {
  display: flex; align-items: center; justify-content: center;
  flex: 1; color: var(--c-fg-3); font-size: var(--fs-body-sm);
  text-align: center; padding: var(--s-6);
}
.chat-list {
  flex: 1; overflow-y: auto;
  padding: var(--s-3) var(--s-2);
  display: flex; flex-direction: column; gap: var(--s-3);
}
.chat-list::-webkit-scrollbar { width: 3px; }
.chat-list::-webkit-scrollbar-thumb { background: var(--c-gold-faint); border-radius: 2px; }

.chat-message {
  display: grid; grid-template-columns: 28px 1fr auto;
  gap: var(--s-3); align-items: start;
  padding: var(--s-2) var(--s-2);
  border-radius: var(--r-sm);
  position: relative;
}
.chat-message:hover { background: var(--c-ink-2); }
.chat-message[data-is-majid="true"] {
  background: var(--c-gold-faint);
  border-inline-start: 2px solid var(--c-gold);
  padding-inline-start: var(--s-3);
}
.chat-message[data-deleted="true"] .chat-body {
  color: var(--c-fg-4); font-style: italic;
}
.chat-message[data-mentioned-self="true"] {
  border-inline-start: 2px solid var(--c-gold-bright);
}
.chat-author {
  grid-column: 2; display: flex; align-items: center; gap: var(--s-2);
  font-size: var(--fs-label); letter-spacing: 0.05em;
  color: var(--c-fg-2); font-weight: 600;
}
.chat-author[data-is-majid="true"] {
  color: var(--c-gold-bright);
}
.chat-author .verified {
  font-size: 10px; color: var(--c-gold);
}
.chat-body {
  grid-column: 2; font-size: var(--fs-body-sm);
  line-height: 1.6; color: var(--c-fg); word-wrap: break-word;
}
.chat-body a { color: var(--c-gold-bright); text-decoration: underline; text-underline-offset: 3px; }
.chat-body .mention {
  background: var(--c-gold-faint);
  color: var(--c-gold-bright);
  padding: 1px 4px; border-radius: var(--r-xs);
  font-weight: 500;
}
.chat-time {
  grid-column: 3; font-size: 10px;
  color: var(--c-fg-3); font-variant-numeric: tabular-nums;
  align-self: start;
}
.chat-actions-trigger {
  position: absolute; top: var(--s-1); inset-inline-end: var(--s-1);
  display: none;
  background: transparent; border: 0; cursor: pointer;
  color: var(--c-fg-3); padding: 2px 6px; border-radius: var(--r-xs);
}
.chat-message:hover .chat-actions-trigger { display: inline-block; }

/* ── Composer ────────────────────────────────────────────────────── */
.chat-composer {
  display: flex; gap: var(--s-2); align-items: flex-end;
  padding: var(--s-2);
  border-top: 0.5px solid var(--c-ink-4);
  position: relative;
}
.chat-composer textarea {
  flex: 1; resize: none;
  min-height: 40px; max-height: 120px;
  line-height: 1.5;
}
.chat-composer .char-count {
  position: absolute; top: var(--s-1); inset-inline-end: 56px;
  font-size: 10px; color: var(--c-fg-3);
}
.chat-composer .char-count[data-state="warn"] { color: var(--c-warning); }
.chat-composer .char-count[data-state="error"] { color: var(--c-danger); }

/* ── Pinned panel ────────────────────────────────────────────────── */
.pinned-panel {
  display: flex; flex-direction: column; gap: var(--s-3);
  max-height: 60vh; overflow-y: auto;
}
.pinned-empty {
  color: var(--c-fg-3); font-size: var(--fs-body-sm);
  text-align: center; padding: var(--s-6);
}
.pinned-item {
  background: var(--c-gold-faint);
  border-inline-start: 2px solid var(--c-gold);
  padding: var(--s-3);
  border-radius: var(--r-sm);
}
.pinned-item .pinned-meta {
  font-size: var(--fs-label); color: var(--c-gold-bright);
  letter-spacing: 0.05em; text-transform: uppercase; font-weight: 600;
  margin-bottom: var(--s-2);
}
.pinned-item .pinned-expiry {
  margin-inline-start: var(--s-2);
  color: var(--c-fg-3); text-transform: none; letter-spacing: 0;
}

/* ── @mention autocomplete ───────────────────────────────────────── */
.mention-autocomplete {
  position: absolute; bottom: 100%; inset-inline-start: 0;
  margin-bottom: var(--s-2);
  min-width: 220px; max-height: 220px; overflow-y: auto;
  background: var(--c-ink-2); border: 0.5px solid var(--c-ink-4);
  border-radius: var(--r-md); box-shadow: var(--e-raised);
  padding: var(--s-2);
  display: none;
}
.mention-autocomplete[data-state="open"] { display: block; }
.mention-autocomplete .mention-item {
  display: flex; align-items: center; gap: var(--s-2);
  height: 32px; padding: 0 var(--s-2);
  border-radius: var(--r-sm); cursor: pointer;
}
.mention-autocomplete .mention-item[data-active="true"],
.mention-autocomplete .mention-item:hover { background: var(--c-ink-3); }
.mention-autocomplete .mention-item[data-is-majid="true"] {
  color: var(--c-gold-bright); font-weight: 600;
}

/* ── Unread badge on lessons sidebar ─────────────────────────────── */
.lesson-item .unread-dot {
  display: none;
  margin-inline-start: auto;
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--c-danger);
  flex-shrink: 0;
}
.lesson-item[data-unread] .unread-dot { display: inline-block; }
.lesson-item[data-mentioned] .mention-mark {
  display: inline-block;
  color: var(--c-gold); font-weight: 700; margin-inline-start: var(--s-1);
}
.lesson-item .mention-mark { display: none; }

/* ── Mobile — composer pins to bottom, video becomes mini ─────────── */
@media (max-width: 760px) {
  .chat-panel { height: calc(100dvh - 56vh); }
  .chat-composer.keyboard-active { position: fixed; bottom: 0; left: 0; right: 0; z-index: 400; background: var(--c-ink-1); }
  .video-area.mini {
    position: fixed; bottom: 72px; inset-inline-end: var(--s-3);
    width: 140px; aspect-ratio: 16/9;
    z-index: 450; border-radius: var(--r-md);
    box-shadow: var(--e-modal); overflow: hidden;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add css/chat.css
git commit -m "feat(player): chat.css page-scoped styles"
```

### Task 15: Add Supabase SDK + chat script imports + tab structure to `watch.html`

**Files:**
- Modify: `~/code/malearnsa-player/watch.html`

- [ ] **Step 1: Add stylesheet link in `<head>`** after the existing `primitives.css` link

```html
<link rel="stylesheet" href="css/chat.css">
```

- [ ] **Step 2: Wrap `lesson-info` internals in a tabs structure**

Find in `watch.html` (around line 589–614):

```html
<div class="lesson-info">
  <p class="lesson-module-tag" id="lesson-module">—</p>
  <h2 class="lesson-title" id="lesson-title">...</h2>
  ... (existing content through lesson-nav) ...
  <aside class="player-notes" hidden></aside>
</div>
```

Replace with:

```html
<div class="lesson-info">
  <div data-ui="tabs" id="lesson-tabs">
    <div data-role="tablist" role="tablist">
      <button role="tab" aria-selected="true" data-panel="panel-desc" id="tab-desc">الوصف</button>
      <button role="tab" aria-selected="false" data-panel="panel-chat" id="tab-chat">
        <span class="tab-label">النقاش</span>
        <span class="tab-count" id="tab-chat-count" hidden></span>
      </button>
      <button role="tab" aria-selected="false" data-panel="panel-pinned" id="tab-pinned">
        <span class="tab-label">مثبت</span>
        <span class="tab-count" id="tab-pinned-count" hidden></span>
      </button>
    </div>

    <div data-role="tabpanel" data-state="active" id="panel-desc" role="tabpanel" aria-labelledby="tab-desc">
      <p class="lesson-module-tag" id="lesson-module">—</p>
      <h2 class="lesson-title" id="lesson-title">اختر درساً من القائمة</h2>
      <p class="lesson-desc" id="lesson-desc">اختر أي درس من القائمة لتبدأ المشاهدة.</p>
      <div id="lesson-content" class="lesson-content"></div>
      <div id="pdf-area" style="display:none;">
        <a id="pdf-btn" href="#" target="_blank" class="pdf-btn" data-ui="btn" data-variant="primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>
          </svg>
          تحميل ملف PDF
        </a>
      </div>
      <div class="lesson-nav">
        <button class="nav-btn" id="btn-prev" onclick="nav(-1)" disabled>→ السابق</button>
        <button class="nav-btn primary" id="btn-next" onclick="nav(1)" disabled>التالي ←</button>
      </div>
      <aside class="player-notes" hidden></aside>
    </div>

    <div data-role="tabpanel" id="panel-chat" role="tabpanel" aria-labelledby="tab-chat">
      <div class="chat-panel">
        <div class="chat-empty" id="chat-empty">كن أول من يشارك فكرة أو سؤال في هذا الدرس.</div>
        <div class="chat-list" id="chat-list" hidden></div>
        <div class="chat-composer" id="chat-composer">
          <textarea data-ui="textarea" id="composer-input" maxlength="500" placeholder="اكتب رسالة..."></textarea>
          <span class="char-count" id="char-count"></span>
          <button data-ui="btn" data-variant="primary" data-size="sm" id="composer-send" disabled>إرسال</button>
          <div class="mention-autocomplete" id="mention-ac"></div>
        </div>
      </div>
    </div>

    <div data-role="tabpanel" id="panel-pinned" role="tabpanel" aria-labelledby="tab-pinned">
      <div class="pinned-panel" id="pinned-panel">
        <div class="pinned-empty">لا توجد رسائل مثبتة بعد.</div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add ES module imports before `</body>`** — note the Supabase SDK loads via `esm.sh` so all chat modules can `import { supabase } from './auth.js'` without repeating the CDN URL.

```html
<script type="module" src="js/chat/auth.js"></script>
<script type="module" src="js/chat/messages.js"></script>
<script type="module" src="js/chat/displayName.js"></script>
<script type="module" src="js/chat/moderation.js"></script>
<script type="module" src="js/chat/pins.js"></script>
<script type="module" src="js/chat/mentions.js"></script>
<script type="module" src="js/chat/unread.js"></script>
<script type="module">
  // Tab switching
  const tabs = document.getElementById('lesson-tabs');
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[role="tab"]');
    if (!btn) return;
    const panelId = btn.dataset.panel;
    tabs.querySelectorAll('[role="tab"]').forEach(t => t.setAttribute('aria-selected', t === btn ? 'true' : 'false'));
    tabs.querySelectorAll('[data-role="tabpanel"]').forEach(p => p.dataset.state = p.id === panelId ? 'active' : '');
    localStorage.setItem('ma-chat-last-tab', panelId);
  });
  // Restore last tab
  const last = localStorage.getItem('ma-chat-last-tab');
  if (last) {
    const btn = tabs.querySelector(`[data-panel="${last}"]`);
    if (btn) btn.click();
  }
</script>
```

- [ ] **Step 4: Smoke test manually**

```bash
cd ~/code/malearnsa-player
python3 -m http.server 8000
# open http://localhost:8000/watch.html?token=<test-token>&course=bl
```

Verify: 3 tabs visible, clicking switches panels, Description tab shows the existing lesson content unchanged, Discussion tab shows the empty state, Pinned tab shows "لا توجد رسائل مثبتة بعد".

- [ ] **Step 5: Commit**

```bash
git add watch.html
git commit -m "feat(player): wrap lesson-info in tabs with Discussion + Pinned panels"
```

### Task 16: Implement `supabase-config.js` + `js/chat/auth.js`

**Files:**
- Create: `~/code/malearnsa-player/js/supabase-config.js`
- Create: `~/code/malearnsa-player/js/chat/auth.js`

- [ ] **Step 1: Create `supabase-config.js`** — values straight from `reference_supabase.md`. Both are public by design (the anon key is long-lived, and RLS enforces access).

```javascript
/**
 * Supabase client config for malearn-chat.
 * anon key is public by design — RLS + signed JWT enforce access.
 * Security envelope: JWT Secret lives ONLY in Apps Script Script Properties.
 */
export const SUPABASE_URL = 'https://rmefydapbrirzgmmbyxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtZWZ5ZGFwYnJpcnpnbW1ieXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODQzMzQsImV4cCI6MjA5MjU2MDMzNH0.WBIXHC7QxbvUxO5dK3rKOh7179SoXL61vOkNwDJhQvQ';

export const APPS_SCRIPT_URL = 'REPLACE_ME_WITH_APPS_SCRIPT_DEPLOYMENT_URL';
```

**`[MANUAL — Majid]`** Replace `APPS_SCRIPT_URL` with the live deployment URL of the token-validator script (same URL used today for `action=validate_token` in the other MA Learn pages — grep any current checkout/success page for `macros/s/` to find it).

- [ ] **Step 2: Create `js/chat/auth.js`**

```javascript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY, APPS_SCRIPT_URL } from '../supabase-config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // We manage the JWT ourselves via setSession; disable automatic refresh
    // so Supabase doesn't try to refresh a token it can't refresh (HS256
    // custom JWT has no refresh endpoint).
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
});

/**
 * Given MA Learn token + course, fetch a Supabase-compatible JWT from Apps
 * Script and sign in. Returns { uid, displayName, isMajid, email } on success.
 */
export async function signInStudent(token, course) {
  const url = new URL(APPS_SCRIPT_URL);
  url.searchParams.set('action', 'mint_supabase_token');
  url.searchParams.set('token', token);
  url.searchParams.set('course', course);
  const res = await fetch(url, { method: 'GET' });
  const payload = await res.json();
  if (!payload.ok) throw new Error('mint_supabase_token: ' + (payload.error || 'unknown'));

  const { data, error } = await supabase.auth.setSession({
    access_token: payload.supabaseToken,
    refresh_token: payload.supabaseToken
  });
  if (error) throw error;

  const profile = {
    uid: payload.uid,
    email: payload.email,
    displayName: payload.displayName,
    isMajid: payload.isMajid
  };

  // Ensure users/{uid} row exists (first-time) — RLS self_insert allows this.
  const { error: upsertErr } = await supabase.from('users').upsert({
    uid: profile.uid,
    email: profile.email,
    display_name: profile.displayName,
    is_majid: profile.isMajid,
    last_seen: {}
  }, { onConflict: 'uid', ignoreDuplicates: false });
  if (upsertErr) console.warn('users upsert (non-fatal):', upsertErr.message);

  window.__chatProfile = profile;
  window.__sbUser = data?.user || null;
  window.dispatchEvent(new CustomEvent('chat:ready', { detail: profile }));
  return profile;
}

/**
 * Silent re-mint: called on a timer to keep the JWT fresh before the 1h exp.
 * Driven by messages.js on a send-fail with `PGRST301` (JWT expired).
 */
export async function refreshSession() {
  const u = new URL(window.location.href);
  const token = u.searchParams.get('token');
  const course = u.searchParams.get('course') || 'bl';
  if (!token) return;
  await signInStudent(token, course);
}
```

- [ ] **Step 3: Wire `signInStudent` into the existing `watch.html` bootstrap**

In `watch.html`, locate the existing bootstrap that calls `validate_token` (grep for `validate_token` within the file). After its success path (where `courseId` and `token` are both known), add:

```javascript
import('./js/chat/auth.js').then(async ({ signInStudent }) => {
  try { await signInStudent(token, courseId); }
  catch (e) { console.warn('chat signin failed:', e); }
});
```

- [ ] **Step 4: Smoke test**

Reload `http://localhost:8000/watch.html?token=<real-test-token>&course=bl`. In DevTools console: expect `window.__chatProfile` to be set with `{ uid, email, isMajid: false }` within ~2 seconds. Expect `window.__sbUser.id === window.__chatProfile.uid`. In Supabase Studio → Table Editor → `users`, a row with that uid should now exist.

- [ ] **Step 5: Commit**

```bash
git add js/supabase-config.js js/chat/auth.js watch.html
git commit -m "feat(chat): sign in via Apps Script-minted Supabase JWT"
```

### Task 17: Write failing RLS tests for `messages` table

**Files:**
- Create: `~/code/malearn-chat/supabase/tests/messages_rls.test.sql`

- [ ] **Step 1: Create `messages_rls.test.sql`**

```sql
-- supabase/tests/messages_rls.test.sql
-- Expected behavior (all from spec §16.6):
--  1) authed user can SELECT any message
--  2) authed user can INSERT a message with their own author_uid
--  3) authed user CANNOT impersonate another author_uid
--  4) authed user CANNOT set is_majid=true (JWT claim mismatch)
--  5) Majid CAN insert with is_majid=true
--  6) body length > 500 rejected
--  7) authed user can soft-delete own message within 5 min
--  8) authed user CANNOT hard-delete own message
--  9) Majid CAN hard-delete any message
-- 10) banned user CANNOT insert

begin;
select plan(10);

set local role postgres;
-- Seed rooms, users, ban
insert into public.rooms (lesson_id, course_id) values ('lesson-1', 'bl');
insert into public.users (uid, email, is_majid) values
  ('alice', 'alice@example.com', false),
  ('bob',   'bob@example.com',   false),
  ('majid', 'majid@malearnsa.com', true);
insert into public.banned_uids (uid, banned_by) values ('eve', 'majid');
insert into public.users (uid, email, is_majid) values ('eve', 'eve@example.com', false);

-- Seed one existing message as alice (bypass RLS)
insert into public.messages (id, lesson_id, author_uid, author_display_name, is_majid, body)
  values ('00000000-0000-0000-0000-000000000001'::uuid, 'lesson-1', 'alice', 'Alice', false, 'hello');

-- ── Test 1: select any message as authed user ──────────────────────
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"alice","role":"authenticated","app_metadata":{"isMajid":false}}';
select is(
  (select count(*)::int from public.messages where lesson_id = 'lesson-1'),
  1,
  'authed user can SELECT messages'
);

-- ── Test 2: insert own message ─────────────────────────────────────
prepare insert_self as
  insert into public.messages (lesson_id, author_uid, author_display_name, is_majid, body)
  values ('lesson-1', 'alice', 'Alice', false, 'my own msg');
select lives_ok('execute insert_self', 'author_uid matches auth.uid()');

-- ── Test 3: impersonation rejected ─────────────────────────────────
prepare insert_impersonate as
  insert into public.messages (lesson_id, author_uid, author_display_name, is_majid, body)
  values ('lesson-1', 'bob', 'Bob', false, 'impersonating');
select throws_ok('execute insert_impersonate', '42501', 'new row violates row-level security policy for table "messages"',
  'cannot impersonate author_uid');

-- ── Test 4: fake is_majid rejected ─────────────────────────────────
prepare insert_fake_majid as
  insert into public.messages (lesson_id, author_uid, author_display_name, is_majid, body)
  values ('lesson-1', 'alice', 'Alice', true, 'fake majid');
select throws_ok('execute insert_fake_majid', '42501', 'new row violates row-level security policy for table "messages"',
  'cannot claim is_majid=true without JWT app_metadata.isMajid=true');

-- ── Test 5: Majid with real claim ──────────────────────────────────
set local "request.jwt.claims" to '{"sub":"majid","role":"authenticated","app_metadata":{"isMajid":true}}';
prepare insert_majid as
  insert into public.messages (lesson_id, author_uid, author_display_name, is_majid, body)
  values ('lesson-1', 'majid', 'Majid', true, 'official pin material');
select lives_ok('execute insert_majid', 'Majid can insert with is_majid=true');

-- ── Test 6: body cap ───────────────────────────────────────────────
set local "request.jwt.claims" to '{"sub":"alice","role":"authenticated","app_metadata":{"isMajid":false}}';
prepare insert_too_long as
  insert into public.messages (lesson_id, author_uid, author_display_name, is_majid, body)
  values ('lesson-1', 'alice', 'Alice', false, repeat('x', 501));
select throws_ok('execute insert_too_long', '23514', null,
  'body > 500 rejected by CHECK');

-- ── Test 7: soft-delete own within 5 min ───────────────────────────
prepare soft_delete_own as
  update public.messages set deleted = true
  where id = '00000000-0000-0000-0000-000000000001'::uuid;
select lives_ok('execute soft_delete_own', 'can soft-delete own message within 5 min');

-- ── Test 8: cannot hard-delete own ─────────────────────────────────
prepare hard_delete_own as
  delete from public.messages
  where id = '00000000-0000-0000-0000-000000000001'::uuid;
select throws_ok('execute hard_delete_own', '42501', null,
  'cannot hard-delete own message as non-Majid');

-- ── Test 9: Majid can hard-delete ──────────────────────────────────
set local "request.jwt.claims" to '{"sub":"majid","role":"authenticated","app_metadata":{"isMajid":true}}';
prepare hard_delete_majid as
  delete from public.messages
  where id = '00000000-0000-0000-0000-000000000001'::uuid;
select lives_ok('execute hard_delete_majid', 'Majid can hard-delete any message');

-- ── Test 10: banned user cannot insert ─────────────────────────────
set local "request.jwt.claims" to '{"sub":"eve","role":"authenticated","app_metadata":{"isMajid":false}}';
prepare insert_banned as
  insert into public.messages (lesson_id, author_uid, author_display_name, is_majid, body)
  values ('lesson-1', 'eve', 'Eve', false, 'still writing');
select throws_ok('execute insert_banned', '42501', null,
  'banned user blocked by is_banned() check');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the suite — expect all 10 to fail (no messages policies yet)**

```bash
cd ~/code/malearn-chat
supabase db reset
supabase test db
```

Expected: 10 failures because RLS has no policies for messages.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/messages_rls.test.sql
git commit -m "test(rls): failing messages RLS tests (insert/update/delete + ban)"
```

### Task 18: Extend migration `0002_rls_policies.sql` — messages + pins + bans + reports + modlog + sessions

**Files:**
- Modify: `~/code/malearn-chat/supabase/migrations/0002_rls_policies.sql`

- [ ] **Step 1: Append to `0002_rls_policies.sql`** — keep the existing users policies at the top; add everything below them.

```sql
-- ── messages ────────────────────────────────────────────────────────
create policy messages_read on public.messages for select
  using (auth.role() = 'authenticated');

create policy messages_insert_self on public.messages for insert
  with check (
    auth.role() = 'authenticated'
    and author_uid = auth.uid()
    and is_majid = public.is_majid()
    and not public.is_banned()
    and deleted = false
  );

create policy messages_self_soft_delete on public.messages for update
  using (author_uid = auth.uid())
  with check (
    deleted = true
    and created_at > now() - interval '5 minutes'
  );

create policy messages_self_edit on public.messages for update
  using (author_uid = auth.uid())
  with check (
    created_at > now() - interval '2 minutes'
    and char_length(body) <= 500
  );

create policy messages_majid_moderate on public.messages for update
  using (public.is_majid());

create policy messages_majid_hard_delete on public.messages for delete
  using (public.is_majid());

-- ── rooms ───────────────────────────────────────────────────────────
create policy rooms_read on public.rooms for select
  using (auth.role() = 'authenticated');

create policy rooms_authed_insert on public.rooms for insert
  with check (auth.role() = 'authenticated');

create policy rooms_majid_update on public.rooms for update
  using (public.is_majid())
  with check (public.is_majid());

create policy rooms_majid_delete on public.rooms for delete
  using (public.is_majid());

-- Note: message_count + last_message_at are updated by the messages_room_counter
-- trigger which runs with the inserting user's privileges. The trigger body
-- executes under the definer's context for UPDATE on rooms — since it's a
-- SECURITY INVOKER function by default we also need a tight policy. Simplest:
-- grant the authed role a scoped UPDATE that only touches the two counter cols.
create policy rooms_authed_counter_update on public.rooms for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ── pins ────────────────────────────────────────────────────────────
create policy pins_read on public.pins for select
  using (auth.role() = 'authenticated');

create policy pins_majid_all on public.pins for all
  using (public.is_majid())
  with check (public.is_majid());

-- ── banned_uids ─────────────────────────────────────────────────────
create policy banned_self_read on public.banned_uids for select
  using (uid = auth.uid() or public.is_majid());

create policy banned_majid_write on public.banned_uids for all
  using (public.is_majid())
  with check (public.is_majid());

-- ── reports ─────────────────────────────────────────────────────────
create policy reports_insert on public.reports for insert
  with check (reporter_uid = auth.uid());

create policy reports_majid_read on public.reports for select
  using (public.is_majid());

create policy reports_majid_update on public.reports for update
  using (public.is_majid())
  with check (public.is_majid());

-- ── moderation_log ──────────────────────────────────────────────────
create policy modlog_majid_read on public.moderation_log for select
  using (public.is_majid());

create policy modlog_majid_insert on public.moderation_log for insert
  with check (public.is_majid() and actor_uid = auth.uid());

-- ── session_events ──────────────────────────────────────────────────
create policy session_insert on public.session_events for insert
  with check (uid = auth.uid());

create policy session_majid_read on public.session_events for select
  using (public.is_majid());

-- ── rate_state ──────────────────────────────────────────────────────
-- Tight: self-read/write only; Majid can inspect.
create policy rate_state_self on public.rate_state for all
  using (uid = auth.uid() or public.is_majid())
  with check (uid = auth.uid());

-- ── archives / wipe_errors ──────────────────────────────────────────
-- Majid read-only; inserts come from the weekly_wipe() function which runs
-- with postgres role (bypasses RLS).
create policy archives_majid_read on public.archives for select
  using (public.is_majid());

create policy wipe_errors_majid_read on public.wipe_errors for select
  using (public.is_majid());
```

- [ ] **Step 2: Apply locally + run tests**

```bash
cd ~/code/malearn-chat
supabase db reset
supabase test db
```

Expected: 5 users tests + 10 messages tests = 15 passing.

- [ ] **Step 3: Push to remote**

```bash
supabase db push
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_rls_policies.sql
git commit -m "feat(rls): messages + pins + bans + reports + modlog + sessions + rate_state policies"
```

### Task 19: Implement `js/chat/messages.js` — realtime list + send

**Files:**
- Create: `~/code/malearnsa-player/js/chat/messages.js`

- [ ] **Step 1: Create `messages.js`**

```javascript
import { supabase } from './auth.js';

let currentLessonId = null;
let currentChannel = null;
const chatList = document.getElementById('chat-list');
const chatEmpty = document.getElementById('chat-empty');
const input = document.getElementById('composer-input');
const sendBtn = document.getElementById('composer-send');
const charCount = document.getElementById('char-count');

/**
 * Switch chat to a lesson. Call whenever the active lesson changes.
 */
export async function openRoom(lessonId, courseId) {
  if (currentChannel) {
    try { await supabase.removeChannel(currentChannel); } catch (_) {}
    currentChannel = null;
  }
  currentLessonId = lessonId;
  chatList.innerHTML = '';
  chatEmpty.hidden = false;
  chatList.hidden = true;

  // Ensure room row exists. If not present, authed users can insert it (RLS).
  await supabase.from('rooms').upsert(
    { lesson_id: lessonId, course_id: courseId || 'bl' },
    { onConflict: 'lesson_id', ignoreDuplicates: true }
  );

  // Initial load — last 200 messages, ascending
  const { data: initial, error } = await supabase
    .from('messages')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) { console.warn('messages select:', error.message); return; }
  initial.forEach(appendMessage);
  syncEmptyState();

  // Realtime channel per lesson
  currentChannel = supabase
    .channel(`messages:${lessonId}`)
    .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `lesson_id=eq.${lessonId}` },
        (payload) => { appendMessage(payload.new); syncEmptyState(); })
    .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `lesson_id=eq.${lessonId}` },
        (payload) => { replaceMessage(payload.new); })
    .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages', filter: `lesson_id=eq.${lessonId}` },
        (payload) => { removeMessage(payload.old.id); syncEmptyState(); })
    .subscribe();
}

function appendMessage(m) {
  if (document.getElementById('msg-' + m.id)) return;  // de-dupe vs optimistic
  const profile = window.__chatProfile || {};
  const row = document.createElement('div');
  row.className = 'chat-message';
  row.id = 'msg-' + m.id;
  row.dataset.isMajid = String(!!m.is_majid);
  row.dataset.deleted = String(!!m.deleted);
  row.dataset.authorUid = m.author_uid;
  if (Array.isArray(m.mentions) && m.mentions.includes(profile.uid)) {
    row.dataset.mentionedSelf = 'true';
  }
  row.innerHTML = `
    <div data-ui="avatar">${(m.author_display_name || '?').slice(0, 2).toUpperCase()}</div>
    <div class="chat-author" data-is-majid="${!!m.is_majid}">
      ${escape(m.author_display_name || 'مستخدم')}
      ${m.is_majid ? '<span class="verified">✓</span>' : ''}
    </div>
    <div class="chat-body" dir="auto">${renderBody(m)}</div>
    <div class="chat-time">${formatTime(m.created_at)}</div>
    ${profile.isMajid ? '<button class="chat-actions-trigger" data-msg-id="' + m.id + '">⋮</button>' : ''}
  `;
  chatList.appendChild(row);
  chatList.scrollTop = chatList.scrollHeight;
}

function replaceMessage(m) {
  const existing = document.getElementById('msg-' + m.id);
  if (!existing) return appendMessage(m);
  existing.remove();
  appendMessage(m);
}
function removeMessage(id) {
  const existing = document.getElementById('msg-' + id);
  if (existing) existing.remove();
}

function syncEmptyState() {
  const any = chatList.children.length > 0;
  chatEmpty.hidden = any;
  chatList.hidden = !any;
}

function renderBody(m) {
  if (m.deleted) return '<em>[تم حذف الرسالة]</em>';
  let s = escape(m.body || '');
  s = s.replace(/\b(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  return s;
}

function escape(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTime(ts) {
  if (!ts) return '';
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'الآن';
  if (diffMin < 60) return `قبل ${diffMin}د`;
  if (diffMin < 1440) return `قبل ${Math.round(diffMin / 60)}س`;
  return d.toLocaleDateString('ar-SA');
}

// Composer state
input.addEventListener('input', () => {
  const len = input.value.length;
  charCount.textContent = `${len}/500`;
  charCount.dataset.state = len > 480 ? 'error' : (len > 400 ? 'warn' : '');
  sendBtn.disabled = !input.value.trim() || !currentLessonId || !window.__chatProfile;
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});

sendBtn.addEventListener('click', async () => {
  const body = input.value.trim();
  if (!body || !currentLessonId) return;
  const profile = window.__chatProfile;
  if (!profile) return;

  const urlCount = (body.match(/\bhttps?:\/\/\S+/g) || []).length;
  if (urlCount > 3) { toast('الحد الأقصى ٣ روابط في الرسالة.'); return; }

  if (!profile.displayName) {
    window.dispatchEvent(new CustomEvent('chat:need-display-name'));
    return;
  }

  sendBtn.disabled = true;
  try {
    const payload = {
      lesson_id: currentLessonId,
      author_uid: profile.uid,
      author_display_name: profile.displayName,
      is_majid: profile.isMajid,
      body,
      mentions: window.__parseMentions ? window.__parseMentions(body) : [],
      deleted: false,
      ip_hash: window.__ipHash || null,
      user_agent: navigator.userAgent.slice(0, 200)
    };
    const { error } = await supabase.from('messages').insert(payload);
    if (error) {
      if (error.code === 'PGRST301' || /jwt/i.test(error.message)) {
        // Token expired. Silent re-mint and retry once.
        const { refreshSession } = await import('./auth.js');
        await refreshSession();
        const { error: err2 } = await supabase.from('messages').insert(payload);
        if (err2) throw err2;
      } else {
        throw error;
      }
    }
    input.value = '';
    charCount.textContent = '';
  } catch (err) {
    toast('فشل الإرسال: ' + (err.code || err.message));
  } finally {
    sendBtn.disabled = !input.value.trim();
  }
});

function toast(msg) {
  const t = document.createElement('div');
  t.setAttribute('data-ui', 'toast');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// Open room whenever the active lesson changes. watch.html dispatches 'lesson:changed'.
window.addEventListener('lesson:changed', (e) => {
  openRoom(e.detail.lessonId, e.detail.courseId);
});
// Initial open if a lesson is already active
window.addEventListener('chat:ready', () => {
  if (window.__currentLessonId) openRoom(window.__currentLessonId, window.__currentCourseId);
});
```

- [ ] **Step 2: Dispatch `lesson:changed` from existing lesson-switching code**

In `watch.html`, find the function that switches the active lesson (grep for `lesson-iframe` or `video-iframe`). At the end of that function, add:

```javascript
window.__currentLessonId = lessonId;
window.__currentCourseId = courseId;
window.dispatchEvent(new CustomEvent('lesson:changed', { detail: { lessonId, courseId } }));
```

- [ ] **Step 3: Manual smoke test**

Reload the player. Switch to the Discussion tab. Type a message, hit Enter. Verify:
- Message appears in the list immediately (realtime INSERT).
- Supabase Studio → Table Editor → `messages` → row with the body exists, `author_uid` matches your uid, `is_majid` correct.
- Reload the page — message persists.
- In Studio → Database → Replication, inspect the `realtime` channel is delivering `INSERT` payloads.

- [ ] **Step 4: Commit**

```bash
cd ~/code/malearnsa-player
git add js/chat/messages.js watch.html
git commit -m "feat(chat): realtime message list + composer with URL cap"
```

### Task 20: Implement `js/chat/displayName.js` — first-message modal

**Files:**
- Create: `~/code/malearnsa-player/js/chat/displayName.js`
- Modify: `~/code/malearnsa-player/watch.html` (append the modal DOM)

- [ ] **Step 1: Add modal DOM at the end of `<body>` in `watch.html`** (before the `<script>` imports)

```html
<div data-ui="modal" id="display-name-modal">
  <div class="backdrop"></div>
  <div class="panel">
    <h2>اختر اسماً يراه الآخرون في النقاش</h2>
    <p>سيظهر هذا الاسم على كل رسالة تكتبها.</p>
    <div data-ui="field">
      <input data-ui="input" id="display-name-input" maxlength="30" placeholder="الاسم">
      <span class="helper" id="display-name-error" hidden></span>
    </div>
    <div class="actions">
      <button data-ui="btn" data-variant="ghost" id="display-name-cancel">إلغاء</button>
      <button data-ui="btn" data-variant="primary" id="display-name-save">حفظ</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Create `displayName.js`**

```javascript
import { supabase } from './auth.js';

const modal = document.getElementById('display-name-modal');
const input = document.getElementById('display-name-input');
const saveBtn = document.getElementById('display-name-save');
const cancelBtn = document.getElementById('display-name-cancel');
const errEl = document.getElementById('display-name-error');

function open() {
  modal.dataset.state = 'open';
  setTimeout(() => input.focus(), 60);
}
function close() {
  modal.dataset.state = '';
  errEl.hidden = true;
  input.value = '';
}

window.addEventListener('chat:need-display-name', open);

cancelBtn.addEventListener('click', close);
modal.querySelector('.backdrop').addEventListener('click', close);

saveBtn.addEventListener('click', async () => {
  const name = input.value.trim();
  if (name.length < 2) {
    errEl.textContent = 'الاسم قصير جداً (٢ حروف على الأقل).';
    errEl.hidden = false;
    return;
  }
  if (name.length > 30) {
    errEl.textContent = 'الاسم طويل (٣٠ حرف كحد أقصى).';
    errEl.hidden = false;
    return;
  }

  const profile = window.__chatProfile;
  saveBtn.disabled = true;
  try {
    const { error } = await supabase.from('users')
      .update({ display_name: name })
      .eq('uid', profile.uid);
    if (error) throw error;
    profile.displayName = name;
    close();
    // Retry-send the message they were composing
    document.getElementById('composer-send').click();
  } catch (err) {
    errEl.textContent = 'خطأ: ' + (err.code || err.message);
    errEl.hidden = false;
  } finally {
    saveBtn.disabled = false;
  }
});
```

- [ ] **Step 3: Smoke test**

In Supabase Studio → Table Editor → `users` → clear `display_name` on your row. Reload player. Type "hi" in composer, press Enter. Verify:
- Modal opens.
- Typing "ma" → Save → modal closes → "hi" posts with author "ma".
- Reload — `users.display_name` persists.

- [ ] **Step 4: Commit**

```bash
git add js/chat/displayName.js watch.html
git commit -m "feat(chat): display-name modal on first message"
```

### Task 21: Implement `js/chat/moderation.js` — Majid-only actions

**Files:**
- Create: `~/code/malearnsa-player/js/chat/moderation.js`
- Modify: `~/code/malearnsa-player/watch.html` (add moderation menu + confirm modals)

- [ ] **Step 1: Add DOM at end of `<body>`**

```html
<div data-ui="menu" id="mod-menu">
  <button role="menuitem" data-action="pin">📌 تثبيت</button>
  <button role="menuitem" data-action="soft-delete">حذف ناعم</button>
  <button role="menuitem" data-action="hard-delete" data-tone="danger">حذف نهائي</button>
  <hr>
  <button role="menuitem" data-action="ban" data-tone="danger">حظر المستخدم</button>
  <button role="menuitem" data-action="clear-room" data-tone="danger">مسح الغرفة كاملة</button>
</div>

<div data-ui="modal" id="confirm-modal">
  <div class="backdrop"></div>
  <div class="panel">
    <h2 id="confirm-title">تأكيد</h2>
    <p id="confirm-body"></p>
    <div class="actions">
      <button data-ui="btn" data-variant="ghost" id="confirm-cancel">إلغاء</button>
      <button data-ui="btn" data-variant="danger" id="confirm-ok">تأكيد</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Create `moderation.js`**

```javascript
import { supabase } from './auth.js';

const menu = document.getElementById('mod-menu');
const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmBody = document.getElementById('confirm-body');
const confirmOk = document.getElementById('confirm-ok');
const confirmCancel = document.getElementById('confirm-cancel');

let activeMsgId = null;
let activeMsgAuthorUid = null;
let activeMsgAuthorName = null;

document.addEventListener('click', (e) => {
  const trigger = e.target.closest('.chat-actions-trigger');
  if (trigger) {
    activeMsgId = trigger.dataset.msgId;
    const row = trigger.closest('.chat-message');
    activeMsgAuthorUid = row?.dataset.authorUid || null;
    activeMsgAuthorName = row?.querySelector('.chat-author')?.textContent.trim() || '';
    const rect = trigger.getBoundingClientRect();
    menu.style.top = rect.bottom + window.scrollY + 'px';
    menu.style.left = rect.left + 'px';
    menu.dataset.state = 'open';
  } else if (!menu.contains(e.target)) {
    menu.dataset.state = '';
  }
});

menu.addEventListener('click', async (e) => {
  const item = e.target.closest('[role="menuitem"]');
  if (!item || !activeMsgId) return;
  const action = item.dataset.action;
  menu.dataset.state = '';

  const lessonId = window.__currentLessonId;
  const profile = window.__chatProfile;
  if (!profile?.isMajid) return;

  if (action === 'pin')          return doPin(lessonId, activeMsgId);
  if (action === 'soft-delete')  return doSoftDelete(lessonId, activeMsgId);
  if (action === 'hard-delete')  return confirmAction('حذف نهائي', 'لا يمكن التراجع عن هذا الإجراء.',
                                    () => doHardDelete(lessonId, activeMsgId));
  if (action === 'ban')          return confirmAction('حظر المستخدم',
                                    `حظر "${activeMsgAuthorName}"؟ سيتمكن من القراءة ولن يستطيع الكتابة.`,
                                    () => doBan(activeMsgAuthorUid));
  if (action === 'clear-room')   return confirmAction('مسح الغرفة كاملة',
                                    'سيتم حذف كل الرسائل في هذا الدرس. لا يمكن التراجع.',
                                    () => doClearRoom(lessonId));
});

async function doPin(lessonId, msgId) {
  const { data: msg, error } = await supabase.from('messages').select('*').eq('id', msgId).single();
  if (error) { alert('خطأ: ' + error.message); return; }

  const expires = prompt('تاريخ انتهاء التثبيت (فارغ = دائم). صيغة: YYYY-MM-DD', '');
  let expiresAt = null;
  if (expires && expires.trim()) {
    const d = new Date(expires.trim());
    if (isNaN(d)) { alert('تاريخ غير صالح.'); return; }
    expiresAt = d.toISOString();
  }

  const { error: pinErr } = await supabase.from('pins').insert({
    lesson_id: lessonId,
    author_uid: msg.author_uid,
    author_display_name: msg.author_display_name,
    body: msg.body,
    pinned_by: window.__chatProfile.uid,
    expires_at: expiresAt
  });
  if (pinErr) { alert('خطأ في التثبيت: ' + pinErr.message); return; }
  await logAction('pin', { targetMsgId: msgId, roomId: lessonId });
}

async function doSoftDelete(lessonId, msgId) {
  const { error } = await supabase.from('messages')
    .update({ deleted: true })
    .eq('id', msgId);
  if (error) { alert('خطأ: ' + error.message); return; }
  await logAction('soft_delete', { targetMsgId: msgId, roomId: lessonId });
}

async function doHardDelete(lessonId, msgId) {
  const { error } = await supabase.from('messages').delete().eq('id', msgId);
  if (error) { alert('خطأ: ' + error.message); return; }
  await logAction('hard_delete', { targetMsgId: msgId, roomId: lessonId });
}

async function doBan(targetUid) {
  if (!targetUid) { alert('uid غير موجود على الرسالة.'); return; }
  const { error } = await supabase.from('banned_uids').upsert({
    uid: targetUid,
    banned_by: window.__chatProfile.uid,
    reason: 'moderation',
    expires_at: null
  }, { onConflict: 'uid' });
  if (error) { alert('خطأ في الحظر: ' + error.message); return; }
  await logAction('ban', { targetUid });
}

async function doClearRoom(lessonId) {
  const { error } = await supabase.rpc('clear_room', { p_lesson_id: lessonId });
  if (error) { alert('خطأ في مسح الغرفة: ' + error.message); return; }
  await logAction('clear_room', { roomId: lessonId });
}

async function logAction(action, extras) {
  await supabase.from('moderation_log').insert({
    action,
    actor_uid: window.__chatProfile.uid,
    target_uid: extras.targetUid || null,
    target_msg_id: extras.targetMsgId || null,
    room_id: extras.roomId || null,
    reason: extras.reason || null
  });
}

function confirmAction(title, body, onOk) {
  confirmTitle.textContent = title;
  confirmBody.textContent = body;
  confirmModal.dataset.state = 'open';
  const handler = async () => {
    confirmOk.removeEventListener('click', handler);
    confirmCancel.removeEventListener('click', cancel);
    confirmModal.dataset.state = '';
    await onOk();
  };
  const cancel = () => {
    confirmOk.removeEventListener('click', handler);
    confirmCancel.removeEventListener('click', cancel);
    confirmModal.dataset.state = '';
  };
  confirmOk.addEventListener('click', handler, { once: true });
  confirmCancel.addEventListener('click', cancel, { once: true });
}
```

- [ ] **Step 3: Add the `clear_room` RPC to the schema** — extend migration `0002_rls_policies.sql` (append at the bottom):

```sql
-- ── clear_room RPC (Majid only) ─────────────────────────────────────
create or replace function public.clear_room(p_lesson_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_majid() then
    raise exception 'permission denied: clear_room requires Majid';
  end if;
  delete from public.messages where lesson_id = p_lesson_id;
  update public.rooms set message_count = 0, last_message_at = null
   where lesson_id = p_lesson_id;
end;
$$;

grant execute on function public.clear_room(text) to authenticated;
```

Apply + push:

```bash
cd ~/code/malearn-chat
supabase db reset
supabase test db     # all 15 still pass
supabase db push
```

- [ ] **Step 4: Smoke test (as Majid)**

Sign in with a Majid-claimed token (email `majid@malearnsa.com` or `majed.engawi@gmail.com`). Hover a message → click ⋮ → menu appears → click "حذف ناعم" → body changes to `[تم حذف الرسالة]` immediately (realtime UPDATE). Check `moderation_log` table — a `soft_delete` row exists.

- [ ] **Step 5: Commit**

```bash
cd ~/code/malearnsa-player
git add js/chat/moderation.js watch.html
git commit -m "feat(chat): Majid moderation menu (pin/delete/ban/clear-room)"

cd ~/code/malearn-chat
git add supabase/migrations/0002_rls_policies.sql
git commit -m "feat(rls): clear_room RPC (Majid-only, security-definer)"
```

### Task 22: Implement `js/chat/pins.js` — pinned panel

**Files:**
- Create: `~/code/malearnsa-player/js/chat/pins.js`

- [ ] **Step 1: Create `pins.js`**

```javascript
import { supabase } from './auth.js';

const panel = document.getElementById('pinned-panel');
const tabCount = document.getElementById('tab-pinned-count');
let currentChannel = null;
let currentLessonId = null;

export async function openPins(lessonId) {
  if (currentChannel) {
    try { await supabase.removeChannel(currentChannel); } catch (_) {}
    currentChannel = null;
  }
  currentLessonId = lessonId;
  await renderAll();

  currentChannel = supabase
    .channel(`pins:${lessonId}`)
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'pins', filter: `lesson_id=eq.${lessonId}` },
        () => { renderAll(); })
    .subscribe();
}

async function renderAll() {
  if (!currentLessonId) return;
  const { data: pins, error } = await supabase
    .from('pins')
    .select('*')
    .eq('lesson_id', currentLessonId)
    .order('pinned_at', { ascending: false });
  if (error) { console.warn('pins select:', error.message); return; }

  const profile = window.__chatProfile || {};
  panel.innerHTML = '';
  if (!pins || pins.length === 0) {
    panel.innerHTML = '<div class="pinned-empty">لا توجد رسائل مثبتة بعد.</div>';
    tabCount.hidden = true;
    return;
  }
  tabCount.hidden = false;
  tabCount.textContent = String(pins.length);
  for (const p of pins) {
    const el = document.createElement('div');
    el.className = 'pinned-item';
    el.innerHTML = `
      <div class="pinned-meta">
        ${escape(p.author_display_name || 'مثبت')} ✓
        ${p.expires_at ? `<span class="pinned-expiry">ينتهي ${fmt(p.expires_at)}</span>` : ''}
        ${profile.isMajid ? `<button class="unpin-btn" data-pin-id="${p.id}" style="margin-inline-start:8px;background:transparent;border:0;color:var(--c-danger);cursor:pointer;">إلغاء التثبيت</button>` : ''}
      </div>
      <div dir="auto" style="font-size:var(--fs-body-sm);line-height:1.6;">${escape(p.body)}</div>
    `;
    panel.appendChild(el);
  }
}

panel.addEventListener('click', async (e) => {
  const btn = e.target.closest('.unpin-btn');
  if (!btn) return;
  const { error } = await supabase.from('pins').delete().eq('id', btn.dataset.pinId);
  if (error) alert('خطأ: ' + error.message);
});

function fmt(ts) {
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  return d.toLocaleDateString('ar-SA');
}
function escape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.addEventListener('lesson:changed', (e) => openPins(e.detail.lessonId));
window.addEventListener('chat:ready', () => {
  if (window.__currentLessonId) openPins(window.__currentLessonId);
});
```

- [ ] **Step 2: Smoke test**

As Majid: pin a message → switch to Pinned tab → verify it appears with gold border. As non-Majid: switch to Pinned tab → verify pin visible but no "إلغاء التثبيت" button. Unpin as Majid → pin disappears from both tabs via realtime.

- [ ] **Step 3: Commit**

```bash
git add js/chat/pins.js
git commit -m "feat(chat): pinned messages panel + Majid unpin action"
```

---

## Phase C — @mentions, unread badges, mobile polish

Adds @mentions autocomplete + in-render highlighting + unread badges on lessons sidebar + mention markers + mobile composer sticking. Exits when a student sees a red unread dot on lesson X when Majid posts there while they're on lesson Y.

### Task 23: Implement `js/chat/mentions.js` — autocomplete + parsing

**Files:**
- Create: `~/code/malearnsa-player/js/chat/mentions.js`

- [ ] **Step 1: Create `mentions.js`**

```javascript
import { supabase } from './auth.js';

const input = document.getElementById('composer-input');
const ac = document.getElementById('mention-ac');
let activeMatches = [];
let activeIdx = 0;
let triggerStart = -1;
let roomUsers = new Map();  // uid -> { uid, name, isMajid } seen in room last 7d

// Refresh recent-author cache on lesson change.
window.addEventListener('lesson:changed', async (e) => {
  roomUsers.clear();
  const lessonId = e.detail.lessonId;
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const { data, error } = await supabase
    .from('messages')
    .select('author_uid, author_display_name, is_majid, created_at')
    .eq('lesson_id', lessonId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) { console.warn('mentions authors:', error.message); return; }

  data.forEach(m => {
    if (m.author_display_name) {
      roomUsers.set(m.author_uid, {
        uid: m.author_uid,
        name: m.author_display_name,
        isMajid: !!m.is_majid
      });
    }
  });
});

input.addEventListener('input', () => {
  const pos = input.selectionStart;
  const before = input.value.slice(0, pos);
  const m = before.match(/@(\S*)$/);
  if (!m) { hide(); return; }
  triggerStart = pos - m[0].length;
  const needle = m[1].toLowerCase();
  show(needle);
});

input.addEventListener('keydown', (e) => {
  if (ac.dataset.state !== 'open') return;
  if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
  else if (e.key === 'Enter' || e.key === 'Tab') {
    if (activeMatches.length > 0) { e.preventDefault(); pick(activeMatches[activeIdx]); }
  } else if (e.key === 'Escape') { hide(); }
});

function show(needle) {
  const out = [];
  // Majid always first
  out.push({ uid: 'majid', name: 'Majid', isMajid: true, pinned: true });
  for (const u of roomUsers.values()) {
    if (u.isMajid) continue;
    if (u.name.toLowerCase().includes(needle)) out.push(u);
  }
  activeMatches = out.slice(0, 8);
  activeIdx = 0;
  if (activeMatches.length === 0) { hide(); return; }
  ac.innerHTML = activeMatches.map((u, i) => `
    <div class="mention-item" data-uid="${u.uid}" data-name="${escape(u.name)}" data-is-majid="${u.isMajid}" data-active="${i === activeIdx}">
      <span>@${escape(u.name)}</span>
      ${u.isMajid ? '<span style="color:var(--c-gold);font-size:10px;">✓</span>' : ''}
    </div>
  `).join('');
  ac.dataset.state = 'open';
  ac.querySelectorAll('.mention-item').forEach((el, i) => {
    el.addEventListener('click', () => pick(activeMatches[i]));
  });
}

function move(delta) {
  activeIdx = (activeIdx + delta + activeMatches.length) % activeMatches.length;
  ac.querySelectorAll('.mention-item').forEach((el, i) => {
    el.dataset.active = String(i === activeIdx);
  });
}

function hide() {
  ac.dataset.state = '';
  activeMatches = [];
  triggerStart = -1;
}

function pick(u) {
  const before = input.value.slice(0, triggerStart);
  const after = input.value.slice(input.selectionStart);
  const inserted = `@${u.name} `;
  input.value = before + inserted + after;
  input.selectionStart = input.selectionEnd = (before + inserted).length;
  input.focus();
  hide();
  input.dispatchEvent(new Event('input'));
}

// Parse mentions from composed text — called by messages.js on send
window.__parseMentions = (text) => {
  const names = [...text.matchAll(/@([^\s]+)/g)].map(m => m[1]);
  const mentioned = [];
  for (const name of names) {
    if (name === 'Majid') mentioned.push('majid');
    for (const u of roomUsers.values()) {
      if (u.name === name) mentioned.push(u.uid);
    }
  }
  return [...new Set(mentioned)];
};

function escape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Wrap @mentions in rendered bodies — hook into DOM after messages render
const observer = new MutationObserver(() => {
  document.querySelectorAll('.chat-body').forEach(el => {
    if (el.dataset.mentionsProcessed) return;
    el.innerHTML = el.innerHTML.replace(/@([^\s<]+)/g, '<span class="mention">@$1</span>');
    el.dataset.mentionsProcessed = 'true';
  });
});
observer.observe(document.getElementById('chat-list'), { childList: true, subtree: true });
```

- [ ] **Step 2: Smoke test**

Type `@` in composer → autocomplete appears with "Majid ✓" at top. Type `@Maj` → only "Majid" shows. Arrow down/up + Enter inserts. Send. Verify mention renders with gold-tinted chip in the message body. Verify Supabase Studio → `messages` → row has `mentions: {majid}` (Postgres array literal).

- [ ] **Step 3: Commit**

```bash
git add js/chat/mentions.js
git commit -m "feat(chat): @mention autocomplete + parsing + gold chip rendering"
```

### Task 24: Implement `js/chat/unread.js` — badges on lessons sidebar

**Files:**
- Create: `~/code/malearnsa-player/js/chat/unread.js`
- Modify: `~/code/malearnsa-player/watch.html` (add unread dot span to each `lesson-item`)

**Note:** the `messages_room_counter` trigger from migration 0001 already keeps `rooms.message_count` current on every insert, so the client only has to subscribe to the `rooms` rows and diff against `users.last_seen[lesson_id]`.

- [ ] **Step 1: Update the lesson rendering in `watch.html`**

Find the code that builds `<div class="lesson-item">` entries (grep for `lesson-item` in the inline `<script>` block). Add a span inside each, and ensure each lesson-item has `data-lesson-id="<lessonId>"`:

```javascript
// Inside the lesson-item template string, append:
`<span class="unread-dot"></span><span class="mention-mark">@</span>`
```

- [ ] **Step 2: Create `unread.js`**

```javascript
import { supabase } from './auth.js';

/**
 * For each lesson visible in the sidebar, subscribe to that room row and
 * compare message_count against users.last_seen[lessonId]. Render dot.
 */
let roomChannel = null;
let lastSeenCache = {};

async function bootstrap(profile) {
  // Fetch current lastSeen
  const { data, error } = await supabase.from('users')
    .select('last_seen')
    .eq('uid', profile.uid)
    .single();
  if (error) { console.warn('unread users select:', error.message); return; }
  lastSeenCache = data?.last_seen || {};

  // Initial render from a single rooms query
  const { data: rooms, error: e2 } = await supabase.from('rooms').select('lesson_id, message_count');
  if (e2) { console.warn('unread rooms select:', e2.message); return; }
  rooms.forEach(applyRoomRow);

  // Subscribe to all rooms — one channel, filter by table
  roomChannel = supabase
    .channel('rooms:all')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'rooms' },
        (payload) => {
          const r = payload.new || payload.old;
          if (r) applyRoomRow(r);
        })
    .subscribe();
}

function applyRoomRow(r) {
  const el = document.querySelector(`.lesson-item[data-lesson-id="${CSS.escape(r.lesson_id)}"]`);
  if (!el) return;
  const seen = Number(lastSeenCache[r.lesson_id] || 0);
  const count = Number(r.message_count || 0);
  if (count > seen && r.lesson_id !== window.__currentLessonId) {
    el.dataset.unread = 'true';
  } else {
    delete el.dataset.unread;
  }
}

window.addEventListener('chat:ready', (e) => {
  bootstrap(e.detail);
});

/**
 * Mark the active lesson as seen after 2s dwell.
 */
let dwellTimer = null;
window.addEventListener('lesson:changed', (e) => {
  clearTimeout(dwellTimer);
  const lessonId = e.detail.lessonId;
  dwellTimer = setTimeout(async () => {
    const profile = window.__chatProfile;
    if (!profile) return;
    const { data: room, error } = await supabase.from('rooms').select('message_count').eq('lesson_id', lessonId).single();
    if (error) { console.warn('lastSeen fetch:', error.message); return; }
    const count = Number(room?.message_count || 0);

    // Merge into existing last_seen JSONB
    const next = { ...lastSeenCache, [lessonId]: count };
    const { error: updErr } = await supabase.from('users')
      .update({ last_seen: next })
      .eq('uid', profile.uid);
    if (updErr) { console.warn('lastSeen update:', updErr.message); return; }
    lastSeenCache = next;

    const el = document.querySelector(`.lesson-item[data-lesson-id="${CSS.escape(lessonId)}"]`);
    if (el) delete el.dataset.unread;
  }, 2000);
});
```

- [ ] **Step 3: Smoke test (two browsers)**

Open player on lesson A as student 1. In a second browser as student 2 (or Majid), post a message on lesson B. In first browser, verify lesson B in sidebar shows red dot within ~1s (realtime). Click lesson B → wait 2s → dot clears. Reload → dot stays cleared (persisted via `last_seen`).

- [ ] **Step 4: Commit**

```bash
cd ~/code/malearnsa-player
git add js/chat/unread.js watch.html
git commit -m "feat(chat): unread badges via rooms realtime + last_seen JSONB merge"
```

### Task 25: Mobile polish — sticky composer + mini player + hamburger dot

**Files:**
- Modify: `~/code/malearnsa-player/watch.html` (script block)
- Modify: `~/code/malearnsa-player/js/chat/unread.js` (aggregate hamburger dot)

- [ ] **Step 1: Add keyboard-focus detection in inline script**

In `watch.html`, in the module script at bottom:

```javascript
const composerEl = document.getElementById('chat-composer');
const videoArea = document.querySelector('.video-area');
const composerInput = document.getElementById('composer-input');

composerInput.addEventListener('focus', () => {
  if (window.innerWidth <= 760) {
    composerEl.classList.add('keyboard-active');
    videoArea.classList.add('mini');
  }
});
composerInput.addEventListener('blur', () => {
  composerEl.classList.remove('keyboard-active');
  videoArea.classList.remove('mini');
});
```

- [ ] **Step 2: Hamburger dot aggregation**

Append to `unread.js`:

```javascript
// Aggregate hamburger dot: show if ANY lesson other than current has unread
const navMenuBtn = document.querySelector('.nav-menu-btn') || document.getElementById('hamburger');

function refreshHamburgerDot() {
  if (!navMenuBtn) return;
  const anyUnread = !!document.querySelector('.lesson-item[data-unread]');
  if (anyUnread) {
    if (!navMenuBtn.querySelector('.hamburger-dot')) {
      const dot = document.createElement('span');
      dot.className = 'hamburger-dot';
      dot.style.cssText = 'position:absolute;top:6px;right:6px;width:6px;height:6px;border-radius:50%;background:var(--c-danger);';
      navMenuBtn.style.position = 'relative';
      navMenuBtn.appendChild(dot);
    }
  } else {
    navMenuBtn.querySelector('.hamburger-dot')?.remove();
  }
}
new MutationObserver(refreshHamburgerDot).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-unread'] });
```

- [ ] **Step 3: Test on mobile (Safari iOS simulator or real device)**

- Tap Discussion tab → tap composer → video shrinks to corner mini-player, composer sticks above keyboard.
- Tap somewhere else → video restores.
- Open lesson A, second browser posts in lesson B, hamburger shows red dot.

- [ ] **Step 4: Commit**

```bash
cd ~/code/malearnsa-player
git add js/chat/unread.js watch.html
git commit -m "feat(chat): mobile sticky composer + mini-player + hamburger unread dot"
```

---

## Phase D — Weekly wipe + pin-expiry + Google Sheet archive

Ships Edge Functions for the archive + Noor alert, Postgres wipe/sweep functions, and `pg_cron` schedules. Exits when a dry-run of `weekly_wipe()` correctly archives to the sheet and deletes the archived rows.

### Task 26: Port `isoWeekTag` util into the archive Edge Function

**Files:**
- Modify: `~/code/malearn-chat/supabase/functions/archive-to-sheet/index.ts` (add inline util)

**Context:** the Firebase plan had a standalone `isoWeek.js` + unit test. In Supabase we inline it into the Deno Edge Function; the `weekly_wipe()` SQL function computes the tag server-side (using a CTE) and also passes it as a belt-and-braces check.

- [ ] **Step 1: Append the util to `archive-to-sheet/index.ts`** (top of file, exported as a local helper). We'll fully rewrite the file in Task 27 — for now, just confirm the formula matches the Firebase plan's test cases.

Reference formula (for Task 27):

```typescript
// ISO week tag "YYYY-Www" for a given Date (UTC-based).
// Test cases (from Firebase plan Task 26):
//   isoWeekTag(new Date(Date.UTC(2026, 3, 20))) === '2026-W17'
//   isoWeekTag(new Date(Date.UTC(2026, 0, 1)))  === '2026-W01'
//   isoWeekTag(new Date(Date.UTC(2024, 11, 30))) === '2025-W01'
export function isoWeekTag(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}
```

- [ ] **Step 2: Quick manual verification** — in a Deno one-liner:

```bash
deno eval "
  const isoWeekTag = (date) => {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return d.getUTCFullYear() + '-W' + String(weekNum).padStart(2, '0');
  };
  console.log(isoWeekTag(new Date(Date.UTC(2026, 3, 20))));
  console.log(isoWeekTag(new Date(Date.UTC(2026, 0, 1))));
  console.log(isoWeekTag(new Date(Date.UTC(2024, 11, 30))));
"
```

Expected:
```
2026-W17
2026-W01
2025-W01
```

No commit — this was verification only. The formula lands in Task 27 as part of the real Edge Function.

### Task 27: Implement `archive-to-sheet` Edge Function (full rewrite)

**Files:**
- Modify: `~/code/malearn-chat/supabase/functions/archive-to-sheet/index.ts`
- Modify: `~/code/malearn-chat/supabase/functions/archive-to-sheet/deno.json`

**Contract:** POST JSON `{ weekTag, rows, spreadsheetId }`. The function:
1. Authenticates with a Google Sheets service account (creds from Supabase secret).
2. Ensures a tab named `weekTag` exists (creates + adds header if not).
3. Appends `rows` to that tab.
4. Returns `{ ok: true, appended: <N> }` or `{ ok: false, error: '...' }`.

- [ ] **Step 1: Create a Google Cloud service account for sheet writes** — **`[MANUAL — Majid]`**

1. Open `https://console.cloud.google.com/`. Create or select a project named `ma-learn-chat-archive` (any project works — this is the writer identity, NOT the chat backend).
2. IAM & Admin → Service Accounts → Create service account.
3. Name: `chat-archive-writer`. Create.
4. Keys tab → Add key → Create new key → JSON. Download the JSON file (e.g. `~/Downloads/chat-archive-sa.json`).
5. Enable the **Google Sheets API** for this project: APIs & Services → Library → "Google Sheets API" → Enable.

The service account email (visible in the JSON) will be something like `chat-archive-writer@ma-learn-chat-archive.iam.gserviceaccount.com`. Note it down — we'll share the master sheet with this email in Task 30.

- [ ] **Step 2: Store the service account JSON as a Supabase secret**

```bash
cd ~/code/malearn-chat
supabase secrets set GOOGLE_SHEETS_CREDS="$(cat ~/Downloads/chat-archive-sa.json)"
```

Verify:

```bash
supabase secrets list
```

Expected: `GOOGLE_SHEETS_CREDS` present.

- [ ] **Step 3: Delete the local JSON file** — preview before delete per memory `feedback_show_before_delete.md`

```bash
ls -la ~/Downloads/chat-archive-sa.json
```

**`[MANUAL — Majid]`** Confirm the file exists (preview size/date) then:

```bash
rm ~/Downloads/chat-archive-sa.json
```

- [ ] **Step 4: Overwrite `archive-to-sheet/index.ts`**

```typescript
// supabase/functions/archive-to-sheet/index.ts
// Append chat message rows to a weekly tab in the master archive sheet.
// Creates the tab + header if it doesn't exist. Called by public.weekly_wipe()
// via net.http_post inside a transaction — archive MUST return ok:true before
// the messages delete commits.

import { google } from 'npm:googleapis@134.0.0';

interface Body {
  weekTag: string;         // "2026-W17"
  spreadsheetId: string;   // master "MA Learn — Chat Archive" sheet ID
  rows: string[][];        // K columns per row (see header below)
}

const HEADER_ROW = [
  'timestamp_utc','timestamp_ksa','course_id','lesson_id','lesson_title',
  'author_display_name','author_uid','is_majid','deleted_flag','body','mentions'
];

function badRequest(msg: string): Response {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status: 400, headers: { 'content-type': 'application/json' }
  });
}

async function sheetsClient() {
  const credsRaw = Deno.env.get('GOOGLE_SHEETS_CREDS');
  if (!credsRaw) throw new Error('GOOGLE_SHEETS_CREDS not set');
  const creds = JSON.parse(credsRaw);
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return badRequest('POST only');

  let body: Body;
  try { body = await req.json(); }
  catch { return badRequest('invalid json'); }

  if (!body.weekTag || !body.spreadsheetId || !Array.isArray(body.rows)) {
    return badRequest('weekTag, spreadsheetId, rows[] required');
  }

  try {
    const sheets = await sheetsClient();

    // Ensure tab exists
    const meta = await sheets.spreadsheets.get({ spreadsheetId: body.spreadsheetId });
    const existing = (meta.data.sheets || []).map((s: any) => s.properties?.title);
    if (!existing.includes(body.weekTag)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: body.spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: body.weekTag } } }]
        }
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: body.spreadsheetId,
        range: `${body.weekTag}!A1:K1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADER_ROW] }
      });
    }

    if (body.rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, appended: 0 }), {
        headers: { 'content-type': 'application/json' }
      });
    }

    const resp = await sheets.spreadsheets.values.append({
      spreadsheetId: body.spreadsheetId,
      range: `${body.weekTag}!A:K`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: body.rows }
    });

    return new Response(JSON.stringify({
      ok: true,
      appended: resp.data.updates?.updatedRows || 0
    }), { headers: { 'content-type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({
      ok: false, error: (err as Error).message
    }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
});
```

Update `deno.json`:

```json
{
  "imports": {
    "googleapis": "npm:googleapis@134.0.0"
  }
}
```

- [ ] **Step 5: Deploy**

```bash
cd ~/code/malearn-chat
supabase functions deploy archive-to-sheet
```

Expected: deploy green. URL printed.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/archive-to-sheet/index.ts supabase/functions/archive-to-sheet/deno.json
git commit -m "feat(functions): archive-to-sheet — append rows to weekly tab"
```

### Task 28: Write migration `0003_wipe_functions.sql` — weekly_wipe + pin_expiry_sweep

**Files:**
- Create: `~/code/malearn-chat/supabase/migrations/0003_wipe_functions.sql`

- [ ] **Step 1: Enable `pg_net` extension for outbound HTTP from SQL**

**`[MANUAL — Majid]`** Supabase Studio → Database → Extensions → search `pg_net` → toggle ON. It's in the default allow-list so no ticket required. (Leave `pg_cron` OFF until Task 30.)

- [ ] **Step 2: Create `0003_wipe_functions.sql`**

```sql
-- 0003_wipe_functions.sql
-- Postgres functions for weekly wipe + daily pin expiry.
-- weekly_wipe() invokes the archive-to-sheet Edge Function synchronously
-- via pg_net, verifies ok:true, THEN deletes messages. pin_expiry_sweep()
-- is a trivial delete-where-expired.

-- ── ISO week tag helper ─────────────────────────────────────────────
create or replace function public.iso_week_tag(d timestamptz) returns text
language sql stable as $$
  select to_char(date_trunc('day', d at time zone 'UTC'), 'IYYY-"W"IW');
$$;

-- ── weekly_wipe() ───────────────────────────────────────────────────
create or replace function public.weekly_wipe() returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_tag       text := public.iso_week_tag(now());
  v_sheet_id       text := current_setting('app.settings.chat_archive_sheet_id', true);
  v_archive_url    text := current_setting('app.settings.archive_fn_url', true);
  v_service_key    text := current_setting('app.settings.service_role_key', true);
  v_noor_url       text := current_setting('app.settings.noor_alert_url', true);
  v_rows           jsonb;
  v_message_count  integer;
  v_http_id        bigint;
  v_http_status    integer;
  v_http_body      text;
begin
  if v_sheet_id is null or v_archive_url is null or v_service_key is null then
    raise exception 'missing settings: chat_archive_sheet_id/archive_fn_url/service_role_key';
  end if;

  -- Collect all messages as a JSONB array (one row per message, columns matching HEADER_ROW in the Edge Function)
  select coalesce(jsonb_agg(row_to_columns order by created_at), '[]'::jsonb), count(*)
    into v_rows, v_message_count
  from (
    select jsonb_build_array(
      to_char(m.created_at at time zone 'UTC',        'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      to_char(m.created_at at time zone 'Asia/Riyadh','YYYY-MM-DD HH24:MI:SS'),
      coalesce(r.course_id, ''),
      m.lesson_id,
      coalesce(r.lesson_title, ''),
      m.author_display_name,
      m.author_uid,
      case when m.is_majid then 'true' else 'false' end,
      case when m.deleted then 'true' else 'false' end,
      m.body,
      array_to_string(m.mentions, ',')
    ) as row_to_columns,
           m.created_at
      from public.messages m
      left join public.rooms r on r.lesson_id = m.lesson_id
  ) t;

  -- Post to archive-to-sheet Edge Function, get a request id
  select net.http_post(
    url     := v_archive_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'weekTag',       v_week_tag,
      'spreadsheetId', v_sheet_id,
      'rows',          v_rows
    ),
    timeout_milliseconds := 120000
  ) into v_http_id;

  -- Block until the request finishes. net._http_collect_response is supabase's
  -- synchronous helper; if it's unavailable on this version, poll net.http_response.
  perform pg_sleep(0.5);
  select status_code, content into v_http_status, v_http_body
    from net._http_response where id = v_http_id;
  -- Poll up to 60 times (30s total). In practice the function returns in <5s.
  for i in 1..60 loop
    exit when v_http_status is not null;
    perform pg_sleep(0.5);
    select status_code, content into v_http_status, v_http_body
      from net._http_response where id = v_http_id;
  end loop;

  if v_http_status is null then
    insert into public.wipe_errors (error) values ('archive-to-sheet timeout');
    perform public.noor_alert_post('Chat wipe FAILED: archive-to-sheet timeout. Manual retry needed.');
    raise exception 'archive-to-sheet timeout';
  end if;

  if v_http_status <> 200 or (v_http_body::jsonb ->> 'ok')::boolean is not true then
    insert into public.wipe_errors (error, stack)
      values ('archive non-ok', concat('status=', v_http_status, ' body=', v_http_body));
    perform public.noor_alert_post(
      format('Chat wipe FAILED: archive returned status=%s. Manual retry needed.', v_http_status)
    );
    raise exception 'archive non-ok: %', v_http_body;
  end if;

  -- Archive succeeded. Delete messages, reset room counters, clear last_seen.
  delete from public.messages;
  update public.rooms set message_count = 0, last_message_at = null;
  update public.users set last_seen = '{}'::jsonb;

  insert into public.archives (week_tag, week_start, week_end, sheet_url, message_count, wipe_completed_at)
  values (
    v_week_tag,
    (date_trunc('week', now()))::date,
    (date_trunc('week', now()) + interval '6 days')::date,
    'https://docs.google.com/spreadsheets/d/' || v_sheet_id || '/edit',
    v_message_count,
    now()
  )
  on conflict (week_tag) do update
    set message_count = excluded.message_count,
        wipe_completed_at = excluded.wipe_completed_at;

  if v_noor_url is not null then
    perform public.noor_alert_post(
      format('Chat wipe complete. %s messages archived. Tab: %s.', v_message_count, v_week_tag)
    );
  end if;
end;
$$;

grant execute on function public.weekly_wipe() to postgres;

-- ── Noor alert helper (wraps pg_net call to noor-alert Edge Function) ──
create or replace function public.noor_alert_post(p_text text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_noor_url    text := current_setting('app.settings.noor_alert_url', true);
  v_service_key text := current_setting('app.settings.service_role_key', true);
begin
  if v_noor_url is null then return; end if;
  perform net.http_post(
    url     := v_noor_url,
    headers := jsonb_build_object(
      'content-type',  'application/json',
      'authorization', 'Bearer ' || v_service_key
    ),
    body    := jsonb_build_object('source', 'chat-wipe', 'text', p_text),
    timeout_milliseconds := 10000
  );
end;
$$;

grant execute on function public.noor_alert_post(text) to postgres;

-- ── pin_expiry_sweep() ──────────────────────────────────────────────
create or replace function public.pin_expiry_sweep() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  with del as (
    delete from public.pins
     where expires_at is not null and expires_at < now()
     returning 1
  )
  select count(*) into v_deleted from del;
  return v_deleted;
end;
$$;

grant execute on function public.pin_expiry_sweep() to postgres;
```

- [ ] **Step 3: Set the runtime settings used by `weekly_wipe()`**

Supabase exposes `ALTER DATABASE ... SET app.settings.*` for in-DB config. Values come from Supabase secrets + the master sheet ID we'll create in Task 30.

**`[MANUAL — Majid]`** open Supabase Studio → SQL Editor → run (replace `<VALUES>`):

```sql
alter database postgres set app.settings.chat_archive_sheet_id = '<SHEET_ID_FROM_TASK_30>';
alter database postgres set app.settings.archive_fn_url        = 'https://rmefydapbrirzgmmbyxx.supabase.co/functions/v1/archive-to-sheet';
alter database postgres set app.settings.noor_alert_url        = 'https://rmefydapbrirzgmmbyxx.supabase.co/functions/v1/noor-alert';
alter database postgres set app.settings.service_role_key      = '<SERVICE_ROLE_KEY_FROM_STUDIO_SETTINGS_API>';
```

The `service_role_key` is visible in Studio → Settings → API → `service_role` key. It's a secret; leave it only in this ALTER DATABASE. Do NOT paste it into git or this plan.

**Sheet ID placeholder:** you'll run the first two `ALTER DATABASE` lines NOW with the URLs; leave the sheet_id with a placeholder `'PENDING'` and revisit in Task 30 after creating the sheet.

- [ ] **Step 4: Apply + push**

```bash
cd ~/code/malearn-chat
supabase db reset
supabase test db     # all 15 still pass (wipe functions don't touch RLS surface)
supabase db push
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_wipe_functions.sql
git commit -m "feat(db): weekly_wipe + pin_expiry_sweep + noor_alert_post (SECURITY DEFINER)"
```

### Task 29: Implement `noor-alert` Edge Function (full rewrite)

**Files:**
- Modify: `~/code/malearn-chat/supabase/functions/noor-alert/index.ts`

**Contract:** POST JSON `{ source, text }`. Forwards to the Noor Telegram bot webhook. Secrets: `NOOR_WEBHOOK_URL` + `NOOR_WEBHOOK_TOKEN`. If either is missing, return `ok:true, skipped:true` (don't block the wipe on a missing alert config).

- [ ] **Step 1: Set secrets** — **`[MANUAL — Majid]`** get the URL + token from the Noor bot ops (or stub with placeholders you'll update later)

```bash
cd ~/code/malearn-chat
supabase secrets set NOOR_WEBHOOK_URL="<noor webhook url>"
supabase secrets set NOOR_WEBHOOK_TOKEN="<noor webhook bearer>"
```

If Majid hasn't wired a Noor webhook for chat alerts yet: set placeholders

```bash
supabase secrets set NOOR_WEBHOOK_URL="TODO"
supabase secrets set NOOR_WEBHOOK_TOKEN="TODO"
```

The function will short-circuit on the `TODO` sentinel (see implementation below).

- [ ] **Step 2: Overwrite `noor-alert/index.ts`**

```typescript
// supabase/functions/noor-alert/index.ts
// Relay weekly-wipe completion / failure alerts to the Noor Telegram bot.
// Body: { source: string, text: string }. Returns { ok: true } on success or
// { ok: true, skipped: true } when the webhook URL is missing/TODO.

interface Body { source: string; text: string; }

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 400, headers: { 'content-type': 'application/json' }
    });
  }
  let body: Body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ ok: false, error: 'invalid json' }), {
    status: 400, headers: { 'content-type': 'application/json' }
  }); }

  const url   = Deno.env.get('NOOR_WEBHOOK_URL') || '';
  const token = Deno.env.get('NOOR_WEBHOOK_TOKEN') || '';
  if (!url || url === 'TODO') {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'webhook not configured' }), {
      headers: { 'content-type': 'application/json' }
    });
  }

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ source: body.source, text: body.text })
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return new Response(JSON.stringify({ ok: false, error: `webhook ${resp.status}: ${txt}` }), {
        status: 502, headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 502, headers: { 'content-type': 'application/json' }
    });
  }
});
```

- [ ] **Step 3: Deploy**

```bash
cd ~/code/malearn-chat
supabase functions deploy noor-alert
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/noor-alert/index.ts
git commit -m "feat(functions): noor-alert — forward wipe alerts to Telegram bot"
```

### Task 30: Write migration `0004_pg_cron_schedules.sql` + create archive sheet + dry-run

**Files:**
- Create: `~/code/malearn-chat/supabase/migrations/0004_pg_cron_schedules.sql`

**Timezone note:** `pg_cron` runs in **UTC** on Supabase. Friday 02:00 KSA (UTC+3) = **Thursday 23:00 UTC** → cron expression `0 23 * * 4`. Similarly 02:00 KSA daily = 23:00 UTC the previous day → `0 23 * * *`. Document this in the migration header to avoid confusion when reading from Studio.

- [ ] **Step 1: Enable `pg_cron` extension**

**`[MANUAL — Majid]`** Supabase Studio → Database → Extensions → search `pg_cron` → toggle ON. It installs into the `extensions` schema; the `cron.schedule` function is exposed via the `cron` schema.

- [ ] **Step 2: Create the master "MA Learn — Chat Archive" Google Sheet**

**`[MANUAL — Majid]`**

1. Create new Google Sheet titled `MA Learn — Chat Archive`.
2. Share with the service account email from Task 27 Step 1 (`chat-archive-writer@ma-learn-chat-archive.iam.gserviceaccount.com`) as **Editor**.
3. Copy the sheet ID from the URL (the string between `/d/` and `/edit`).
4. Update the `app.settings.chat_archive_sheet_id` setting Majid set in Task 28 Step 3:

```sql
alter database postgres set app.settings.chat_archive_sheet_id = '<the sheet id>';
```

- [ ] **Step 3: Create `0004_pg_cron_schedules.sql`**

```sql
-- 0004_pg_cron_schedules.sql
-- pg_cron runs in UTC. KSA = UTC+3, so:
--   Friday 02:00 KSA = Thursday 23:00 UTC -> '0 23 * * 4'
--   Daily 02:00 KSA  = 23:00 UTC prior day -> '0 23 * * *'
-- Re-running this migration is safe: cron.unschedule is idempotent.

create extension if not exists pg_cron;

-- Unschedule any prior jobs with the same name (safe idempotent rerun)
do $$
begin
  perform cron.unschedule('weekly-wipe');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('daily-pin-expiry');
exception when others then null;
end $$;

-- Weekly wipe: Thursday 23:00 UTC == Friday 02:00 KSA
select cron.schedule(
  'weekly-wipe',
  '0 23 * * 4',
  $$ select public.weekly_wipe(); $$
);

-- Daily pin expiry sweep: 23:00 UTC prior day == 02:00 KSA
select cron.schedule(
  'daily-pin-expiry',
  '0 23 * * *',
  $$ select public.pin_expiry_sweep(); $$
);
```

- [ ] **Step 4: Apply + push**

```bash
cd ~/code/malearn-chat
supabase db push
```

Verify in Studio → Database → Cron Jobs: two rows visible (`weekly-wipe`, `daily-pin-expiry`).

- [ ] **Step 5: Dry-run via Supabase functions invoke**

First confirm the Edge Functions are reachable and the service account has sheet access:

```bash
# archive-to-sheet dry run with a tiny row set
curl -X POST \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "content-type: application/json" \
  "https://rmefydapbrirzgmmbyxx.supabase.co/functions/v1/archive-to-sheet" \
  -d '{
    "weekTag": "2026-W17-DRYRUN",
    "spreadsheetId": "<THE_SHEET_ID>",
    "rows": [["x","x","bl","lesson-1","Intro","alice","alice-uid","false","false","hello","majid"]]
  }'
```

Expected: `{ "ok": true, "appended": 1 }`. Sheet has a tab `2026-W17-DRYRUN` with the header + the row. **`[MANUAL — Majid]`** delete the `2026-W17-DRYRUN` tab after inspecting.

- [ ] **Step 6: Dry-run `public.weekly_wipe()` on a small seeded dataset**

**`[MANUAL — Majid]`** seed a couple of test messages via the player UI on any BL lesson. Then in Studio → SQL Editor:

```sql
select public.weekly_wipe();
```

After ~5–15 seconds:
- Studio → Table Editor → `messages` is empty.
- `rooms.message_count` reset to 0 on every row.
- `users.last_seen` reset to `{}` on every row.
- `archives` has a new row for this week's tag.
- The master sheet has a new tab `2026-WNN` populated with the test rows.
- Noor receives a Telegram alert (or the function returns `skipped: true` if webhook not configured).

If any step fails → check `wipe_errors` + Studio → Logs → Edge Functions for traces before retrying.

- [ ] **Step 7: Deploy both Edge Functions** (for the scheduled cron at 02:00 KSA tonight)

```bash
cd ~/code/malearn-chat
supabase functions deploy
```

Expected: both `archive-to-sheet` and `noor-alert` redeploy green.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0004_pg_cron_schedules.sql
git commit -m "feat(cron): pg_cron schedules for weekly-wipe + daily-pin-expiry (UTC-adjusted for KSA)"
```

---

## Phase E — Anti-piracy telemetry

Captures IP hash + session events. No detection logic yet.

### Task 31: Capture `ipHash` on the client before sending messages

**Files:**
- Modify: `~/code/malearnsa-player/js/chat/auth.js`

- [ ] **Step 1: After successful sign-in, fetch and hash the client IP**

In `auth.js`, after the `window.dispatchEvent(new CustomEvent('chat:ready', ...))` line in `signInStudent`, append:

```javascript
  try {
    const ipRes = await fetch('https://api.ipify.org?format=json');
    const { ip } = await ipRes.json();
    const enc = new TextEncoder().encode(ip);
    const hashBuf = await crypto.subtle.digest('SHA-256', enc);
    window.__ipHash = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  } catch (e) { window.__ipHash = null; }

  // Log session event
  await supabase.from('session_events').insert({
    uid: profile.uid,
    event: 'sign_in',
    ip_hash: window.__ipHash,
    user_agent: navigator.userAgent.slice(0, 200)
  });
```

- [ ] **Step 2: Smoke test**

Reload the player. Verify in Supabase Studio → Table Editor → `session_events` — a row with `uid`, `ip_hash` (16-char hex), `user_agent`, `timestamp`. Send a message; verify `messages.ip_hash` and `messages.user_agent` are populated on the row.

- [ ] **Step 3: Commit**

```bash
cd ~/code/malearnsa-player
git add js/chat/auth.js
git commit -m "feat(chat): capture ipHash + session_events for future anti-piracy"
```

---

## Phase F — Production rollout

### Task 32: Staging soak on BL

**Files:** none (observational).

- [ ] **Step 1: Point staging deploy of player at the live Supabase project**

Verify `supabase-config.js` has correct `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `APPS_SCRIPT_URL`.

- [ ] **Step 2: Send Majid the staging URL with his real token**

**`[MANUAL — Majid]`** exercise the feature for 48 hours:
- Post messages (Arabic + English)
- Reply in thread (same lesson)
- Use @mentions (Majid first; then other students)
- Pin messages (with + without expiry date)
- Soft delete + hard delete
- Ban a test user, then verify they can read but not write
- Clear a whole room (verify destructive action message)
- Switch between lessons to see unread badges + hamburger dot
- Test on iPhone in Safari + Chrome (composer sticky + mini video)
- Close + reopen browser → session regains via mint flow

Record any bugs/tweaks in a `staging-feedback.md` file (local only).

- [ ] **Step 3: Fix any bugs in dedicated commits**

Repeat per bug:

```bash
git add <files>
git commit -m "fix(chat): <short desc>"
```

### Task 33: Production rollout — BL first

**Files:** none (deploy step).

- [ ] **Step 1: Merge `main` to production of malearnsa-player**

```bash
cd ~/code/malearnsa-player
git push origin main
```

GitHub Pages auto-deploys `player.malearnsa.com` from `main`. Per memory `feedback_deployment_ownership.md` — Noor pushes code and verifies live, does not ask Majid to do deploys.

- [ ] **Step 2: Verify live**

```bash
curl -s https://player.malearnsa.com/watch.html | grep -c 'data-ui="tabs"'
curl -s https://player.malearnsa.com/watch.html | grep -c 'supabase-config.js'
```

Both expected ≥ 1.

- [ ] **Step 3: Smoke test with a real BL student token**

Open `https://player.malearnsa.com/watch.html?token=<live-bl-token>&course=bl`. Verify chat loads, a message sends, the row lands in Supabase `messages`, the page persists the message on reload.

- [ ] **Step 4: Monitor Supabase usage for 48 hours**

Supabase Studio → Usage. Verify:
- DB size well under 500 MB free-tier cap.
- Bandwidth well under 2 GB/month.
- Realtime concurrent connections < 200.
- Auth MAU < 50K.

If any metric tracks toward 60%+ in a day, upgrade to Pro at $25/mo before it throttles.

### Task 34: ITCAI rollout

**Files:** none.

- [ ] **Step 1: Verify `course=itcai` works**

The same `watch.html` serves both. Open `https://player.malearnsa.com/watch.html?token=<itcai-token>&course=itcai`. Chat works identically. The Apps Script `handleMintSupabaseToken_` already routes on `course` — no new code needed.

- [ ] **Step 2: Announce to Cohort 1 WhatsApp group**

Message template (**`[MANUAL — Majid]`** reviews before sending):

> "تم تفعيل النقاش داخل المنصة لكل درس! افتح أي درس، تبويب 'النقاش'، واكتب سؤالك — أو شاركنا فكرتك. راح أقرأ وأرد."

### Task 35: Post-launch memory + priorities update

**Files:**
- Modify: MA EA memory `project_player_chat_v1.md`
- Modify: `context/current-priorities.md`

- [ ] **Step 1: Update memory to "live" status**

Change the memory entry to reflect shipped state. Remove any "gated on redesign" note. Log the commit hash from Task 33 Step 1 + the live URL + the Supabase project ref.

- [ ] **Step 2: Add to `context/current-priorities.md` under "Compound / Active"**

Short line:

> "Player chat V1 live on `player.malearnsa.com` — Supabase (Postgres + RLS + Realtime) + Apps Script HS256 JWT. Weekly archive to Google Sheet + Noor alert. Monitor usage + gather feedback for v2 (rate limits, report button, edit-own, reactions, AI assistant)."

- [ ] **Step 3: Commit**

```bash
cd "/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA"
git add context/current-priorities.md
git commit -m "docs(priorities): player chat V1 live on Supabase"
```

---

## Appendix A — Rollback plan

If the wipe job corrupts data:

1. **Supabase Free tier does NOT include Point-in-Time Recovery.** PITR is a Pro-tier feature ($25/mo). Until upgraded, rollback relies on the **weekly archive Google Sheet** as the source of truth:
   - Read the relevant week tab (e.g. `2026-W17`).
   - Run a one-off SQL script (Supabase Studio → SQL Editor) that INSERTs rows back from the sheet. A CSV import from the tab is fastest: Sheet → Download as CSV → Studio → Table Editor → Import CSV → `messages`. Re-set `rooms.message_count` after the import with:
     ```sql
     update public.rooms r set message_count = (
       select count(*) from public.messages m where m.lesson_id = r.lesson_id
     );
     ```
2. **If PITR is later enabled** (Pro upgrade): Studio → Settings → Backups → Restore → pick a timestamp before the bad wipe. Restores the entire DB to that point.

If RLS migration blocks legitimate writes:

1. Revert the offending migration by writing a new migration that drops the broken policies / restores the previous versions. Never edit a migration file that already ran in prod.
2. `supabase db push`.
3. Investigate locally with `supabase db reset` + `supabase test db` before re-deploying the fix.

If client JS breaks the player entirely:

1. Revert the problematic commit on `main` in `malearnsa-player`.
2. `git push origin main`. GitHub Pages redeploys on push.
3. No force-push needed.

If `pg_cron` starts firing `weekly_wipe()` while archive-to-sheet is broken:

1. Disable the cron job immediately — Studio → Database → Cron Jobs → toggle OFF `weekly-wipe`.
2. Alternatively: `select cron.unschedule('weekly-wipe');` in SQL Editor.
3. Fix the archive function; redeploy; re-enable the schedule.

---

## Appendix B — Open items deferred beyond V1

### B.1 Known gaps vs spec — must land BEFORE production (Task 33)

Spec requires these in V1; they're not individually scoped as tasks above to keep the plan tight. Add as a short polish task before production rollout — each is small enough to land in under half a day:

1. **Rate limit enforcement (spec §8.3):** 5 messages/minute, 30/hour, 200/day per user; no-duplicate-same-body within 30s. Implementation on Postgres: a `BEFORE INSERT` trigger on `public.messages` that upserts `rate_state` for the inserting uid, checks the three windows + duplicate body, and raises an exception on breach. Migration pattern:

   ```sql
   create or replace function public.messages_rate_limit() returns trigger
   language plpgsql as $$
   declare r public.rate_state%rowtype; t timestamptz := now();
   begin
     select * into r from public.rate_state where uid = new.author_uid for update;
     if not found then
       insert into public.rate_state (uid, minute_bucket, hour_bucket, day_bucket, last_body, last_body_at)
       values (new.author_uid, date_trunc('minute', t), date_trunc('hour', t), date_trunc('day', t), new.body, t);
       return new;
     end if;
     -- Reset buckets if the window rolled over
     if r.minute_bucket <> date_trunc('minute', t) then
       update public.rate_state set minute_bucket = date_trunc('minute', t), minute_count = 0 where uid = new.author_uid;
       r.minute_count := 0;
     end if;
     if r.hour_bucket <> date_trunc('hour', t) then
       update public.rate_state set hour_bucket = date_trunc('hour', t), hour_count = 0 where uid = new.author_uid;
       r.hour_count := 0;
     end if;
     if r.day_bucket <> date_trunc('day', t) then
       update public.rate_state set day_bucket = date_trunc('day', t), day_count = 0 where uid = new.author_uid;
       r.day_count := 0;
     end if;
     if r.minute_count >= 5 then raise exception 'rate_limit_minute'; end if;
     if r.hour_count   >= 30 then raise exception 'rate_limit_hour'; end if;
     if r.day_count    >= 200 then raise exception 'rate_limit_day'; end if;
     if r.last_body = new.body and (t - r.last_body_at) < interval '30 seconds' then raise exception 'duplicate_body'; end if;
     update public.rate_state
        set minute_count = r.minute_count + 1,
            hour_count   = r.hour_count + 1,
            day_count    = r.day_count + 1,
            last_body    = new.body,
            last_body_at = t
      where uid = new.author_uid;
     return new;
   end $$;
   create trigger messages_rate_limit_bi before insert on public.messages
     for each row execute function public.messages_rate_limit();
   ```

   Client catches the Postgres error codes (the thrown `exception` surfaces as `code: 'P0001'` with the message) and shows Arabic toast `أنت ترسل بسرعة. استرح لحظة.` on rate-limit, `لقد أرسلت نفس الرسالة للتو.` on duplicate.

2. **Student report-message UI (spec §8.2):** tiny 🚩 button on every non-own message row that opens a one-click confirm → writes `reports` with `{ msg_id, reporter_uid, room_id, resolved: false }`. RLS already allows this (Task 18). Majid sees 🚩 overlay on reported messages when logged in as Majid (left-join from `messages` against `reports`).

3. **Edit own message within 2 min (spec §8.2):** RLS already allows it (Task 18 `messages_self_edit`). Client needs a pencil icon on own messages that are <2min old, inline textarea, save/cancel. Lower priority than the two above — can optionally defer to a post-V1 polish.

### B.2 Deferred beyond V1 — separate spec + plan each

Captured in spec §13 + §10.2:

- Weekly digest email (spec §10.2)
- Image/voice/video messages (spec §10.2) — Supabase Storage buckets will be added with their own RLS policies
- Reactions / threading (spec §10.2)
- AI assistant with Majid's knowledge (spec future hooks) — Supabase pgvector extension already available on Free tier
- Anti-piracy detection jobs (spec §9) — cron + pg_cron sum query over `session_events`
- Dedicated admin dashboard for chat (spec §10.2)
- Message search (spec §10.2) — Supabase full-text search via `tsvector` column + GIN index
- Profanity auto-moderation (spec §8.5)
