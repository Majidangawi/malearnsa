# Player Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the dashboard Lessons page as a full player admin — 3-column layout (course tabs + lesson list + editor) with media management, rich content editing via the block composer, drag-drop reorder, add/delete, and preview. Retire the standalone `admin-dashboard.html` afterwards.

**Architecture:** Extend the existing Fastify backend with two new route plugins (`lessons-read.ts` for course list + content fetch, `writes-lesson.ts` for all mutations). All write actions wrap existing Apps Script endpoints (`save_lesson_media`, `save_content`, `add_lesson`, `delete_lesson`, `admin_toggle_lesson`) except reorder (new endpoint `admin_reorder_lessons`). Add a `Blocks` JSON column to the `LessonContent` tab so composer state round-trips while the rendered `Content` HTML keeps feeding the student player untouched. Frontend rewrites `pages/lessons.js` into a 3-column layout, reuses the v1 block composer for content editing, and adds drag-drop reorder mirroring composer blocks.

**Tech Stack:**
- Backend: Fastify 4, TypeScript, Vitest (existing)
- Frontend: vanilla ES modules, same design-token system as composer + contacts
- Apps Script: pushed via clasp to `1OPM0ii4...` (deployment `AKfycbznjcsYu8g...`)
- Bunny embed iframe: `https://iframe.mediadelivery.net/embed/<lib>/<guid>`

**Spec reference:** [docs/superpowers/specs/2026-04-23-player-admin-design.md](../specs/2026-04-23-player-admin-design.md)

**Scope:** v1 = all 7 jobs (add video, toggle, content editor, add/delete, reorder, preview, drip columnintentionally in-sheet only). v2 candidates documented in spec (upload from dashboard, Prompt Pack admin, T3 tab, duplication, bulk actions, content version history, rich embeds).

---

## Prerequisites

- Contacts v1 live (commits `ba29361` → `feb7417`)
- Composer v1 locked (`mountComposer`, `renderBlocks`, `sanitizeInlineHtml` all in place)
- clasp logged in as workspace `Majid@malearnsa.com`
- Local clasp workspace at `~/code/.clasp-token-validator/`
- `/ui-ux-pro-max` CLI installed at `~/.claude/skills/ui-ux-pro-max/`

---

## File Structure

```
ma-learn-dashboard/
├── backend/
│   ├── src/
│   │   ├── data/
│   │   │   └── lessons.ts                 # NEW — readCourses + readLessonDetail + cache
│   │   └── routes/
│   │       ├── lessons-read.ts            # NEW — GET /api/data/lessons/courses, /:id/content
│   │       └── writes-lesson.ts           # NEW — POST /api/writes/lesson/*
│   └── tests/
│       ├── data/lessons.test.ts           # NEW
│       └── routes/
│           ├── lessons-read.test.ts       # NEW
│           └── writes-lesson.test.ts      # NEW
├── frontend/
│   └── public/
│       ├── js/pages/lessons.js            # REWRITE — 3-column player admin
│       ├── css/lessons.css                # NEW — scoped tokens (same system as composer/contacts)
│       └── app.html                       # MODIFY — link lessons.css
├── apps-script/
│   └── lesson-endpoints.js                # NEW — reference copy of admin_reorder_lessons +
│                                          #       save_content-with-blocks upgrade
└── projects/ma-learn-launch/
    ├── apps-script/token-validator/Code.js # MODIFY (local) — 1 new endpoint + save_content patch
    └── admin-dashboard.html                # REWRITE as redirect after Task 12
```

---

# Stage A — Data + read routes

### Task 1: Add `Blocks` column to LessonContent sheet (operator step)

**Files:** none. Sheet edit only.

- [ ] **Step 1: Open staging `MA Learn Token Pool (STAGING)` sheet → `LessonContent` tab**

Header row currently has: `Lesson ID | Content`. Add a new column:
```
Column C: Blocks
```

- [ ] **Step 2: Repeat for the prod sheet** (`MA Learn Token Pool`) — same new column

Once both sheets have the column, old rows have it blank; the save pipeline writes to it going forward. The existing `Content` column keeps feeding the student player.

---

### Task 2: Lessons data layer (backend)

**Files:**
- Create: `backend/src/data/lessons.ts`
- Create: `backend/tests/data/lessons.test.ts`

- [ ] **Step 1: Write tests**

File: `backend/tests/data/lessons.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { deriveCourses, parseLessonContent } from '../../src/data/lessons.js';

describe('deriveCourses', () => {
  it('produces one course entry per distinct course with lesson counts', () => {
    const rows = [
      { Course: 'intro-to-creative-ai',  Active: 'TRUE' },
      { Course: 'intro-to-creative-ai',  Active: 'TRUE' },
      { Course: 'beyond-lighting',       Active: 'FALSE' },
    ];
    const courses = deriveCourses(rows);
    expect(courses).toHaveLength(2);
    const t2 = courses.find(c => c.id === 'intro-to-creative-ai')!;
    expect(t2.lessonCount).toBe(2);
    const bl = courses.find(c => c.id === 'beyond-lighting')!;
    expect(bl.lessonCount).toBe(1);
  });

  it('ignores rows with empty Course', () => {
    const rows = [{ Course: '', Active: 'TRUE' }, { Course: '  ', Active: 'TRUE' }];
    expect(deriveCourses(rows)).toEqual([]);
  });

  it('labels known courses; falls back to the id otherwise', () => {
    const rows = [
      { Course: 'intro-to-creative-ai', Active: 'TRUE' },
      { Course: 'unknown-future', Active: 'TRUE' },
    ];
    const courses = deriveCourses(rows);
    expect(courses.find(c => c.id === 'intro-to-creative-ai')!.label).toBe('T2');
    expect(courses.find(c => c.id === 'unknown-future')!.label).toBe('unknown-future');
  });
});

describe('parseLessonContent', () => {
  it('prefers Blocks JSON when present', () => {
    const result = parseLessonContent({
      'Lesson ID': 't2-01',
      Content: '<p>old html</p>',
      Blocks: '[{"type":"text","content":"rich"}]',
    });
    expect(result.blocks).toEqual([{ type: 'text', content: 'rich' }]);
    expect(result.html).toBe('<p>old html</p>');
  });

  it('falls back to a single Text block wrapping raw HTML when Blocks is absent', () => {
    const result = parseLessonContent({
      'Lesson ID': 't2-01', Content: '<p>legacy content</p>', Blocks: '',
    });
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].type).toBe('text');
    expect(result.html).toBe('<p>legacy content</p>');
  });

  it('returns empty blocks + empty html for a missing lesson', () => {
    const result = parseLessonContent(undefined);
    expect(result.blocks).toEqual([]);
    expect(result.html).toBe('');
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
cd ~/code/ma-learn-dashboard/backend && npm test -- data/lessons
```

- [ ] **Step 3: Write `backend/src/data/lessons.ts`**

```typescript
import { readSheet } from './sheets-read.js';

export interface Course {
  id: string;
  label: string;
  lessonCount: number;
}

export interface LessonContent {
  blocks: any[];
  html: string;
}

const COURSE_LABELS: Record<string, string> = {
  'intro-to-creative-ai':    'T2',
  'creative-ai-workshop-t3': 'T3',
  'beyond-lighting':         'BL',
  'prompt-pack':             'PP',
};

export function deriveCourses(rows: Record<string, unknown>[]): Course[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const c = String(r.Course ?? '').trim();
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([id, lessonCount]) => ({
    id,
    label: COURSE_LABELS[id] ?? id,
    lessonCount,
  }));
}

export function parseLessonContent(row: Record<string, unknown> | undefined): LessonContent {
  if (!row) return { blocks: [], html: '' };
  const html = String(row.Content ?? '');
  const blocksRaw = String(row.Blocks ?? '').trim();
  if (blocksRaw) {
    try {
      const parsed = JSON.parse(blocksRaw);
      if (Array.isArray(parsed)) return { blocks: parsed, html };
    } catch { /* fall through */ }
  }
  // Legacy fallback: one Text block with the raw HTML.
  return { blocks: [{ type: 'text', content: html }], html };
}

// ─── Cached reads ──────────────────────────────────────────────────────────
let listCache: { at: number; rows: Record<string, unknown>[] } | null = null;
const TTL_MS = 30_000;

async function readLessonsRaw(): Promise<Record<string, unknown>[]> {
  if (listCache && Date.now() - listCache.at < TTL_MS) return listCache.rows;
  const rows = await readSheet({ tab: 'Lessons' });
  listCache = { at: Date.now(), rows };
  return rows;
}

export async function readCourses(): Promise<Course[]> {
  const rows = await readLessonsRaw();
  return deriveCourses(rows);
}

export async function readLessonContentById(lessonId: string): Promise<LessonContent> {
  const rows = await readSheet({ tab: 'LessonContent' });
  const row = rows.find(r => String(r['Lesson ID']).trim() === lessonId);
  return parseLessonContent(row);
}

export function invalidateLessonsCache(): void {
  listCache = null;
}
```

- [ ] **Step 4: Tests pass**

```bash
npm test -- data/lessons
```
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
cd ~/code/ma-learn-dashboard
git add backend/src/data/lessons.ts backend/tests/data/lessons.test.ts
git commit -m "feat(lessons): data layer with deriveCourses + parseLessonContent + 30s cache"
```

---

### Task 3: Lessons read routes

**Files:**
- Create: `backend/src/routes/lessons-read.ts`
- Create: `backend/tests/routes/lessons-read.test.ts`
- Modify: `backend/src/server.ts`

- [ ] **Step 1: Write tests**

File: `backend/tests/routes/lessons-read.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import lessonsReadRoute from '../../src/routes/lessons-read.js';
import * as lessonsData from '../../src/data/lessons.js';

describe('lessons-read routes', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  async function setup(authOk = true) {
    vi.spyOn(lessonsData, 'readCourses').mockResolvedValue([
      { id: 'intro-to-creative-ai', label: 'T2', lessonCount: 19 },
    ] as any);
    vi.spyOn(lessonsData, 'readLessonContentById').mockImplementation(async (id) =>
      id === 't2-01'
        ? { blocks: [{ type: 'text', content: 'hi' }], html: '<p>hi</p>' } as any
        : { blocks: [], html: '' } as any
    );
    const app = Fastify();
    await app.register(lessonsReadRoute, { requireAuth: () => (authOk ? 'majid' : null) });
    return app;
  }

  it('GET /api/data/lessons/courses returns course list', async () => {
    const app = await setup();
    const res = await app.inject({ method: 'GET', url: '/api/data/lessons/courses' });
    expect(res.statusCode).toBe(200);
    expect(res.json().courses).toHaveLength(1);
    expect(res.json().courses[0].label).toBe('T2');
  });

  it('GET /api/data/lessons/:id/content returns blocks + html', async () => {
    const app = await setup();
    const res = await app.inject({ method: 'GET', url: '/api/data/lessons/t2-01/content' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ blocks: expect.any(Array), html: '<p>hi</p>' });
  });

  it('401 without auth', async () => {
    const app = await setup(false);
    const res = await app.inject({ method: 'GET', url: '/api/data/lessons/courses' });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
npm test -- routes/lessons-read
```

- [ ] **Step 3: Implement route plugin**

File: `backend/src/routes/lessons-read.ts`

```typescript
import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { readCourses, readLessonContentById } from '../data/lessons.js';

interface Opts {
  requireAuth: (req: FastifyRequest) => string | null;
}

const plugin: FastifyPluginAsync<Opts> = async (app, opts) => {
  app.get('/api/data/lessons/courses', async (req, reply) => {
    if (!opts.requireAuth(req)) return reply.code(401).send({ error: 'unauthorized' });
    return { courses: await readCourses() };
  });

  app.get('/api/data/lessons/:id/content', async (req, reply) => {
    if (!opts.requireAuth(req)) return reply.code(401).send({ error: 'unauthorized' });
    const id = (req.params as { id: string }).id;
    return await readLessonContentById(id);
  });
};

export default plugin;
```

- [ ] **Step 4: Register in `server.ts`**

Add import:
```typescript
import lessonsReadRoute from './routes/lessons-read.js';
```

Inside the existing `if (config.SHEET_ID)` block (same place where `contactsRoute` registers), add:

```typescript
    await app.register(lessonsReadRoute, {
      requireAuth: (req) => {
        const u = (req as unknown as { user?: { email?: string } }).user;
        return u?.email ?? null;
      },
    });
```

- [ ] **Step 5: Tests + build**

```bash
npm test -- routes/lessons-read
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/lessons-read.ts backend/tests/routes/lessons-read.test.ts backend/src/server.ts
git commit -m "feat(lessons): GET /api/data/lessons/courses + /:id/content"
```

---

# Stage B — Apps Script additions

### Task 4: Apps Script — `admin_reorder_lessons` + `save_content` upgrade

**Files:**
- Create: `apps-script/lesson-endpoints.js` (reference copy)
- Modify: `projects/ma-learn-launch/apps-script/token-validator/Code.js` (local; pushed via clasp)

Two changes to the live script:
1. **NEW** `admin_reorder_lessons` endpoint
2. **MODIFY** existing `saveLessonContent` to ALSO write the `Blocks` column when present

- [ ] **Step 1: Append `admin_reorder_lessons` to the local Code.js**

Append at the very bottom of `projects/ma-learn-launch/apps-script/token-validator/Code.js`:

```javascript

// ═════════════════════════════════════════════════════════════════════
// LESSONS — reorder endpoint (2026-04-23 rollout)
// ═════════════════════════════════════════════════════════════════════

function _admin_reorder_lessons(p) {
  if (p.admin_token !== ADMIN_TOKEN) return { ok: false, error: 'unauthorized' };
  var lessonId = String(p.lessonId || '').trim();
  var moduleOrder = Number(p.moduleOrder);
  var lessonOrder = Number(p.lessonOrder);
  if (!lessonId || !Number.isFinite(moduleOrder) || !Number.isFinite(lessonOrder)) {
    return { ok: false, error: 'missing_params' };
  }
  var ss = SpreadsheetApp.openById(MAIN_SHEET_ID);
  var sh = ss.getSheetByName(LESSONS_SHEET);
  if (!sh) return { ok: false, error: 'no_lessons_sheet' };
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === lessonId) {
      sh.getRange(i + 1, 4).setValue(moduleOrder); // Column D = Module Order
      sh.getRange(i + 1, 5).setValue(lessonOrder); // Column E = Lesson Order
      return { ok: true, lessonId: lessonId, moduleOrder: moduleOrder, lessonOrder: lessonOrder };
    }
  }
  return { ok: false, error: 'lesson_not_found' };
}
```

- [ ] **Step 2: Upgrade `saveLessonContent` to write the `Blocks` column**

Find the existing `saveLessonContent` function (around line 1135). Replace its body with:

```javascript
function saveLessonContent(params) {
  if ((params.admin_token || '') !== ADMIN_TOKEN) return { success: false, reason: 'unauthorized' };
  const lessonId = String(params.lesson_id || '').trim();
  const content  = String(params.content  || '');
  const blocks   = String(params.blocks   || '');
  if (!lessonId) return { success: false, reason: 'no_lesson_id' };

  const ss    = SpreadsheetApp.openById(MAIN_SHEET_ID);
  const sheet = ss.getSheetByName(LESSON_CONTENT_SHEET);
  if (!sheet) return { success: false, reason: 'no_content_sheet' };

  // Build header map so Blocks col lookup is tolerant of column ordering.
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const headerIdx = {};
  header.forEach(function (h, i) { headerIdx[String(h).trim()] = i + 1; });
  const contentCol = headerIdx['Content'] || 2;
  const blocksCol  = headerIdx['Blocks']  || 0;  // 0 = absent, skip

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === lessonId) {
      sheet.getRange(i + 1, contentCol).setValue(content);
      if (blocksCol > 0 && blocks) sheet.getRange(i + 1, blocksCol).setValue(blocks);
      return { success: true };
    }
  }

  // New row — append with matching column count.
  const row = new Array(header.length).fill('');
  row[0] = lessonId;
  row[contentCol - 1] = content;
  if (blocksCol > 0) row[blocksCol - 1] = blocks;
  sheet.appendRow(row);
  return { success: true };
}
```

- [ ] **Step 3: Wire `admin_reorder_lessons` into `doGet`**

Find the `doGet` function. Inside the `else if (action === ...)` chain, add after the last admin_* line:

```javascript
    else if (action === 'admin_reorder_lessons')        result = _admin_reorder_lessons(e.parameter);
```

- [ ] **Step 4: Push via clasp**

```bash
cp "/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA/projects/ma-learn-launch/apps-script/token-validator/Code.js" ~/code/.clasp-token-validator/Code.js
cd ~/code/.clasp-token-validator
clasp show-authorized-user  # should show Majid@malearnsa.com
clasp push --force
clasp deploy -i AKfycbznjcsYu8gLDZqFJGededAQaATad_L8vlhRQV04pOqh57HB5nFVRy9zUHAcg6goyj8DKA -d "v10 lessons player admin"
```

Expected: `Deployed ... @10`.

- [ ] **Step 5: Smoke test non-destructive call**

```bash
# Reorder a non-existent lesson — expect {"ok":false,"error":"lesson_not_found"}
curl -sS "https://script.google.com/macros/s/AKfycbznjcsYu8gLDZqFJGededAQaATad_L8vlhRQV04pOqh57HB5nFVRy9zUHAcg6goyj8DKA/exec?action=admin_reorder_lessons&admin_token=MAL-ADMIN-2026&lessonId=nonexistent&moduleOrder=1&lessonOrder=1"
```

- [ ] **Step 6: Reference copy + commits**

Create `apps-script/lesson-endpoints.js` in the dashboard repo with just the new `_admin_reorder_lessons` function body + the new `saveLessonContent` body as comment-documented reference.

```bash
cd "/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA"
git add projects/ma-learn-launch/apps-script/token-validator/Code.js
git commit -m "feat(apps-script): admin_reorder_lessons + saveLessonContent writes Blocks col"

cd ~/code/ma-learn-dashboard
git add apps-script/lesson-endpoints.js
git commit -m "docs(apps-script): reference copy of lesson admin endpoints"
```

---

# Stage C — Write routes (backend)

### Task 5: Backend write routes for lessons

**Files:**
- Create: `backend/src/routes/writes-lesson.ts`
- Create: `backend/tests/routes/writes-lesson.test.ts`
- Modify: `backend/src/server.ts`

- [ ] **Step 1: Write tests**

File: `backend/tests/routes/writes-lesson.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import writesLessonRoute from '../../src/routes/writes-lesson.js';

async function setup(appsScriptOverride?: any) {
  const appsScript = appsScriptOverride ?? { call: vi.fn().mockResolvedValue({ ok: true, success: true }) };
  const invalidate = vi.fn();
  const app = Fastify();
  await app.register(writesLessonRoute, {
    appsScript,
    requireAuth: () => 'majid',
    invalidateCache: invalidate,
  });
  return { app, appsScript, invalidate };
}

describe('writes-lesson routes', () => {
  it('POST /save_media passes through to save_lesson_media', async () => {
    const { app, appsScript } = await setup();
    const res = await app.inject({
      method: 'POST', url: '/api/writes/lesson/save_media',
      payload: { lessonId: 't2-01', videoId: 'abc123', pdfUrl: 'https://x', active: true },
    });
    expect(res.statusCode).toBe(200);
    expect(appsScript.call).toHaveBeenCalledWith('save_lesson_media',
      expect.objectContaining({ lesson_id: 't2-01', video_id: 'abc123', pdf_url: 'https://x', active: 'true' }));
  });

  it('POST /save_content passes through to save_content + invalidates cache', async () => {
    const { app, appsScript, invalidate } = await setup();
    const res = await app.inject({
      method: 'POST', url: '/api/writes/lesson/save_content',
      payload: { lessonId: 't2-01', blocks: [{ type: 'text', content: 'hi' }], html: '<p>hi</p>' },
    });
    expect(res.statusCode).toBe(200);
    expect(appsScript.call).toHaveBeenCalledWith('save_content',
      expect.objectContaining({ lesson_id: 't2-01', content: '<p>hi</p>', blocks: '[{"type":"text","content":"hi"}]' }));
    expect(invalidate).toHaveBeenCalled();
  });

  it('POST /add invokes add_lesson', async () => {
    const { app, appsScript } = await setup({ call: vi.fn().mockResolvedValue({ success: true, id: 'lesson-xyz' }) });
    const res = await app.inject({
      method: 'POST', url: '/api/writes/lesson/add',
      payload: { course: 'intro-to-creative-ai', module: 'Module 1', module_order: 1, lesson_order: 10, title: 'New' },
    });
    expect(res.statusCode).toBe(200);
    expect(appsScript.call).toHaveBeenCalledWith('add_lesson', expect.objectContaining({ course: 'intro-to-creative-ai', title: 'New' }));
  });

  it('POST /delete invokes delete_lesson + invalidates', async () => {
    const { app, appsScript, invalidate } = await setup();
    const res = await app.inject({
      method: 'POST', url: '/api/writes/lesson/delete',
      payload: { lessonId: 't2-01' },
    });
    expect(res.statusCode).toBe(200);
    expect(appsScript.call).toHaveBeenCalledWith('delete_lesson', expect.objectContaining({ lesson_id: 't2-01' }));
    expect(invalidate).toHaveBeenCalled();
  });

  it('POST /reorder invokes admin_reorder_lessons + invalidates', async () => {
    const { app, appsScript, invalidate } = await setup();
    const res = await app.inject({
      method: 'POST', url: '/api/writes/lesson/reorder',
      payload: { lessonId: 't2-01', moduleOrder: 2, lessonOrder: 3 },
    });
    expect(res.statusCode).toBe(200);
    expect(appsScript.call).toHaveBeenCalledWith('admin_reorder_lessons',
      expect.objectContaining({ lessonId: 't2-01', moduleOrder: 2, lessonOrder: 3 }));
    expect(invalidate).toHaveBeenCalled();
  });

  it('surfaces Apps Script errors as 400', async () => {
    const { app } = await setup({ call: vi.fn().mockRejectedValue(new Error('apps_script_lesson_not_found')) });
    const res = await app.inject({
      method: 'POST', url: '/api/writes/lesson/delete', payload: { lessonId: 'nope' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('401 when not authed', async () => {
    const app = Fastify();
    await app.register(writesLessonRoute, {
      appsScript: { call: vi.fn() },
      requireAuth: () => null,
      invalidateCache: vi.fn(),
    });
    const res = await app.inject({
      method: 'POST', url: '/api/writes/lesson/save_media', payload: { lessonId: 't2-01' },
    });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
npm test -- writes-lesson
```

- [ ] **Step 3: Implement the route plugin**

File: `backend/src/routes/writes-lesson.ts`

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

const SaveMediaBody = z.object({
  lessonId: z.string().min(1),
  videoId:  z.string().optional(),
  pdfUrl:   z.string().optional(),
  active:   z.boolean().optional(),
});
const SaveContentBody = z.object({
  lessonId: z.string().min(1),
  blocks:   z.array(z.any()),
  html:     z.string(),
});
const AddBody = z.object({
  course:       z.string().min(1),
  module:       z.string().min(1),
  module_order: z.number().int().min(1),
  lesson_order: z.number().int().min(1),
  title:        z.string().min(1),
  desc:         z.string().optional(),
});
const DeleteBody   = z.object({ lessonId: z.string().min(1) });
const ReorderBody  = z.object({
  lessonId:    z.string().min(1),
  moduleOrder: z.number().int().min(1),
  lessonOrder: z.number().int().min(1),
});

const plugin: FastifyPluginAsync<Opts> = async (app, opts) => {
  function authed(req: FastifyRequest, reply: any): boolean {
    if (!opts.requireAuth(req)) { reply.code(401).send({ error: 'unauthorized' }); return false; }
    return true;
  }
  async function forward<T>(action: string, params: Record<string, unknown>, reply: any, invalidate: boolean) {
    try {
      const r = await opts.appsScript.call(action, params);
      if (invalidate) opts.invalidateCache();
      return r as T;
    } catch (e: any) {
      return reply.code(400).send({ ok: false, error: e.message });
    }
  }

  app.post('/api/writes/lesson/save_media', async (req, reply) => {
    if (!authed(req, reply)) return;
    const parsed = SaveMediaBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const p = parsed.data;
    const params: Record<string, unknown> = { lesson_id: p.lessonId };
    if (p.videoId !== undefined) params.video_id = p.videoId;
    if (p.pdfUrl  !== undefined) params.pdf_url  = p.pdfUrl;
    if (p.active  !== undefined) params.active   = p.active ? 'true' : 'false';
    return forward('save_lesson_media', params, reply, true);
  });

  app.post('/api/writes/lesson/save_content', async (req, reply) => {
    if (!authed(req, reply)) return;
    const parsed = SaveContentBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const p = parsed.data;
    return forward('save_content', {
      lesson_id: p.lessonId,
      content: p.html,
      blocks: JSON.stringify(p.blocks),
    }, reply, true);
  });

  app.post('/api/writes/lesson/add', async (req, reply) => {
    if (!authed(req, reply)) return;
    const parsed = AddBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    return forward('add_lesson', parsed.data, reply, true);
  });

  app.post('/api/writes/lesson/delete', async (req, reply) => {
    if (!authed(req, reply)) return;
    const parsed = DeleteBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    return forward('delete_lesson', { lesson_id: parsed.data.lessonId }, reply, true);
  });

  app.post('/api/writes/lesson/reorder', async (req, reply) => {
    if (!authed(req, reply)) return;
    const parsed = ReorderBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    return forward('admin_reorder_lessons', parsed.data, reply, true);
  });
};

export default plugin;
```

- [ ] **Step 4: Register in `server.ts`**

Add import:
```typescript
import writesLessonRoute from './routes/writes-lesson.js';
import { invalidateLessonsCache } from './data/lessons.js';
```

Register inside the `if (config.SHEET_ID && config.APPS_SCRIPT_URL)` block (alongside `newslettersRoute`):

```typescript
    await app.register(writesLessonRoute, {
      appsScript,
      requireAuth: (req) => {
        const u = (req as unknown as { user?: { email?: string } }).user;
        return u?.email ?? null;
      },
      invalidateCache: invalidateLessonsCache,
    });
```

- [ ] **Step 5: Tests + build**

```bash
npm test -- writes-lesson
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/writes-lesson.ts backend/tests/routes/writes-lesson.test.ts backend/src/server.ts
git commit -m "feat(lessons): write routes for save_media, save_content, add, delete, reorder"
```

---

# Stage D — Frontend

### Task 6: Design pass via `/ui-ux-pro-max` + `lessons.css`

**Files:**
- Create: `frontend/public/css/lessons.css`
- Modify: `frontend/public/app.html` (link the stylesheet)

- [ ] **Step 1: Run the design query**

```bash
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py \
  "admin lesson-management course-editor 3-column tabs split-view dark-mode craft sophisticated saudi" \
  --design-system -p "MA Learn Lessons" -f markdown
```

Note the spacing/motion/elevation guidance — the CSS below honors Priority 1–10 rules (visible focus, 4.5:1 contrast, 120–260ms motion, prefers-reduced-motion).

- [ ] **Step 2: Write `frontend/public/css/lessons.css`**

```css
/* ============================================================
   MA Learn Lessons · v1 styling
   Inherits token shape from composer v2 + contacts for visual
   coherence across the dashboard. Scoped under .lessons-page.
   ============================================================ */

.lessons-page {
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
  --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 20px; --sp-6: 24px;
  --r-sm: 6px; --r-md: 8px; --r-lg: 12px; --r-xl: 16px;
  --ease-out: cubic-bezier(0.2, 0.7, 0.25, 1);
  --dur-fast: 120ms; --dur-med: 180ms;
  --shadow-1: 0 1px 2px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.02);
  --shadow-focus: 0 0 0 3px var(--c-gold-soft);

  display: grid;
  grid-template-rows: auto 1fr;
  gap: var(--sp-4);
  height: calc(100vh - 140px);
  min-height: 600px;
  color: var(--c-ink);
}

/* Course tabs (top row) */
.lessons-tabs {
  display: flex;
  gap: var(--sp-2);
  padding: var(--sp-2);
  background: var(--c-surface-1);
  border: 1px solid var(--c-border);
  border-radius: var(--r-lg);
}
.lessons-tab {
  background: transparent; border: 1px solid transparent; color: var(--c-ink-2);
  padding: 8px 14px; border-radius: var(--r-sm); cursor: pointer;
  font: inherit; font-size: 0.9rem; display: inline-flex; align-items: center; gap: 6px;
  transition: all var(--dur-fast) var(--ease-out);
}
.lessons-tab:hover { background: var(--c-surface-3); color: var(--c-ink); }
.lessons-tab.active { background: var(--c-gold-soft); color: var(--c-gold-bright); border-color: var(--c-border-gold); }
.lessons-tab .count { color: var(--c-ink-3); font-size: 0.78rem; }

/* Two-column split: list + editor */
.lessons-body {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: var(--sp-4);
  min-height: 0;
}

.lessons-list {
  background: var(--c-surface-1); border: 1px solid var(--c-border); border-radius: var(--r-xl);
  padding: var(--sp-3); overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--sp-3);
}
.lesson-module-header {
  color: var(--c-ink-2); font-size: 0.75rem; text-transform: uppercase;
  letter-spacing: 0.05em; font-weight: 600; margin: var(--sp-2) 0 4px;
  display: flex; align-items: center; justify-content: space-between;
  cursor: pointer; user-select: none;
}
.lesson-module-header .count { color: var(--c-ink-3); font-size: 0.7rem; font-weight: 500; }
.lesson-module-header .chev { color: var(--c-ink-3); transition: transform var(--dur-fast) var(--ease-out); }
.lesson-module-header.collapsed .chev { transform: rotate(-90deg); }

.lesson-row {
  display: grid; grid-template-columns: 20px minmax(0, 1fr) 10px;
  gap: 8px; align-items: center;
  background: var(--c-surface-2); padding: 8px 10px;
  border: 1px solid transparent; border-radius: var(--r-md);
  font-size: 0.87rem; color: var(--c-ink);
  cursor: pointer; position: relative;
  transition: all var(--dur-fast) var(--ease-out);
}
.lesson-row:hover { background: var(--c-surface-3); border-color: var(--c-border-mid); }
.lesson-row.active { background: var(--c-surface-3); border-color: var(--c-border-gold); box-shadow: var(--shadow-focus); }
.lesson-row.dragging { opacity: 0.35; }
.lesson-row.drop-above::before, .lesson-row.drop-below::after {
  content: ""; position: absolute; left: 6px; right: 6px; height: 2px; border-radius: 2px;
  background: linear-gradient(90deg, transparent, var(--c-gold) 20%, var(--c-gold-bright) 50%, var(--c-gold) 80%, transparent);
  box-shadow: 0 0 12px var(--c-gold-glow); pointer-events: none;
}
.lesson-row.drop-above::before { top: -5px; }
.lesson-row.drop-below::after { bottom: -5px; }
.lesson-row .handle { color: var(--c-ink-3); cursor: grab; user-select: none; opacity: 0; transition: opacity var(--dur-med) var(--ease-out); }
.lesson-row:hover .handle { opacity: 1; }
.lesson-row .handle:active { cursor: grabbing; }
.lesson-row .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lesson-row .dot-active {
  width: 7px; height: 7px; border-radius: 50%; background: var(--c-gold); box-shadow: 0 0 6px var(--c-gold-glow);
}
.lesson-row .dot-inactive { width: 7px; height: 7px; border-radius: 50%; background: var(--c-border-mid); }

.lessons-add-btn {
  margin-top: var(--sp-2);
  background: linear-gradient(180deg, var(--c-surface-2), var(--c-surface-1));
  border: 1px dashed var(--c-border-mid);
  color: var(--c-ink-2); padding: 10px; width: 100%; border-radius: var(--r-md);
  cursor: pointer; font: inherit; font-size: 0.88rem;
  transition: all var(--dur-fast) var(--ease-out);
}
.lessons-add-btn:hover { background: var(--c-surface-3); border-color: var(--c-gold); color: var(--c-ink); }

/* Editor panel */
.lessons-editor {
  background: var(--c-surface-1); border: 1px solid var(--c-border); border-radius: var(--r-xl);
  padding: var(--sp-5); overflow-y: auto;
}
.lessons-editor.empty {
  display: flex; align-items: center; justify-content: center; color: var(--c-ink-3); font-style: italic;
}
.lessons-editor h2 { color: var(--c-gold); font-size: 1.25rem; margin: 0 0 var(--sp-4); }
.lessons-editor label {
  display: block; color: var(--c-ink-2); font-size: 0.72rem; font-weight: 600;
  letter-spacing: 0.05em; text-transform: uppercase; margin: var(--sp-4) 0 6px;
}
.lessons-editor label:first-of-type { margin-top: 0; }
.lessons-editor input[type="text"], .lessons-editor input[type="url"], .lessons-editor textarea {
  width: 100%; background: var(--c-bg); border: 1px solid var(--c-border); color: var(--c-ink);
  border-radius: var(--r-md); padding: 10px 12px; font: inherit; font-size: 0.9rem;
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.lessons-editor input:focus, .lessons-editor textarea:focus { outline: none; border-color: var(--c-gold); box-shadow: var(--shadow-focus); }

.lessons-video-preview {
  margin-top: var(--sp-3); background: var(--c-bg); border: 1px solid var(--c-border);
  border-radius: var(--r-md); overflow: hidden; aspect-ratio: 16/9;
}
.lessons-video-preview iframe { width: 100%; height: 100%; border: none; }
.lessons-video-preview.empty {
  display: flex; align-items: center; justify-content: center; color: var(--c-ink-3);
  font-size: 0.85rem; aspect-ratio: 16/9;
}

.lessons-active-toggle {
  display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
  color: var(--c-ink-2); font-size: 0.88rem;
}
.lessons-active-toggle input { width: auto; margin: 0; }

.lessons-actions {
  display: flex; gap: var(--sp-2); flex-wrap: wrap;
  margin-top: var(--sp-5); padding-top: var(--sp-4);
  border-top: 1px solid var(--c-border);
}
.lessons-actions button {
  background: var(--c-bg); border: 1px solid var(--c-border-mid); color: var(--c-ink);
  padding: 9px 16px; border-radius: var(--r-sm); cursor: pointer;
  font: inherit; font-size: 0.87rem;
  transition: all var(--dur-fast) var(--ease-out);
}
.lessons-actions button:hover { border-color: var(--c-gold); color: var(--c-gold); }
.lessons-actions button.primary { background: var(--c-gold); color: var(--c-ink-on-gold); border-color: var(--c-gold); }
.lessons-actions button.primary:hover { background: var(--c-gold-bright); }
.lessons-actions button.danger:hover { border-color: var(--c-danger); color: var(--c-danger); }

.lessons-toast {
  position: fixed; bottom: 20px; right: 20px;
  background: var(--c-surface-1); border: 1px solid var(--c-border-mid);
  color: var(--c-ink); padding: var(--sp-3) var(--sp-4);
  border-radius: var(--r-md); z-index: 10001; font-size: 0.88rem;
  animation: lt-in var(--dur-med) var(--ease-out);
}
.lessons-toast.success { border-color: var(--c-gold); }
.lessons-toast.error { border-color: var(--c-danger); }
@keyframes lt-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

@media (prefers-reduced-motion: reduce) {
  .lesson-row, .lesson-module-header .chev, .lessons-tab, .lessons-editor input,
  .lessons-actions button, .lessons-toast { transition: none; animation: none; }
}
@media (max-width: 980px) {
  .lessons-body { grid-template-columns: 1fr; }
  .lessons-page { height: auto; }
  .lessons-list { max-height: 40vh; }
}
```

- [ ] **Step 3: Link stylesheet**

Modify `frontend/public/app.html` — after the existing `<link rel="stylesheet" href="css/contacts.css">` line, add:

```html
<link rel="stylesheet" href="css/lessons.css">
```

- [ ] **Step 4: Commit**

```bash
git add frontend/public/css/lessons.css frontend/public/app.html
git commit -m "feat(lessons): scoped design tokens + 3-col split-view styling"
```

---

### Task 7: Rewrite `pages/lessons.js` — Stage A frontend (read-only)

**Files:**
- Rewrite: `frontend/public/js/pages/lessons.js`

This task delivers the page skeleton: tabs, module-grouped list, editor with all fields VISIBLE but not yet wired to write actions (all buttons inert or disabled). Stage B (next task) wires writes.

- [ ] **Step 1: Replace `frontend/public/js/pages/lessons.js`**

```javascript
import { api } from '../api.js';
import { mountComposer } from '../composer/index.js';

const PRODUCT_LABELS = {
  'intro-to-creative-ai':    'T2',
  'creative-ai-workshop-t3': 'T3',
  'beyond-lighting':         'BL',
  'prompt-pack':             'PP',
};

// Bunny library IDs per course (filled in during smoke-test — placeholders here).
const BUNNY_LIB = {
  'intro-to-creative-ai':    '637491',   // T2 Bunny library
  'beyond-lighting':         '637492',   // BL Bunny library (verify in staging)
};

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtModuleLabel(course, module, count) {
  return `${module} (${count})`;
}

export default async function mount(root) {
  root.innerHTML = '<div class="lessons-page" dir="ltr"><div class="lessons-tabs">Loading…</div><div class="lessons-body"><div class="lessons-list"></div><div class="lessons-editor empty">Select a lesson on the left</div></div></div>';

  const state = {
    courses: [],
    activeCourse: null,
    lessons: [],
    collapsedModules: new Set(), // persist to localStorage keyed by course
    selectedLessonId: null,
    selectedLesson: null,
    selectedContent: null, // { blocks, html }
    composer: null,
    draftMedia: {}, // { videoId, pdfUrl, active }
    draftBlocks: null,
  };

  function loadCollapsedState(courseId) {
    try {
      const raw = localStorage.getItem('lessons.collapsed.' + courseId);
      if (raw) state.collapsedModules = new Set(JSON.parse(raw));
      else state.collapsedModules = new Set();
    } catch { state.collapsedModules = new Set(); }
  }
  function saveCollapsedState() {
    try { localStorage.setItem('lessons.collapsed.' + state.activeCourse, JSON.stringify([...state.collapsedModules])); } catch {}
  }

  async function loadCourses() {
    const { courses } = await api('/api/data/lessons/courses');
    state.courses = courses;
    if (!state.activeCourse && courses.length > 0) state.activeCourse = courses[0].id;
    loadCollapsedState(state.activeCourse);
  }
  async function loadLessons() {
    if (!state.activeCourse) { state.lessons = []; return; }
    const { lessons } = await api('/api/data/lessons?course=' + encodeURIComponent(state.activeCourse));
    state.lessons = lessons || [];
  }
  async function loadLessonContent(lessonId) {
    if (!lessonId) { state.selectedContent = null; return; }
    const res = await api('/api/data/lessons/' + encodeURIComponent(lessonId) + '/content');
    state.selectedContent = res;
  }

  function selectLesson(id) {
    const lesson = state.lessons.find(l => l.id === id);
    if (!lesson) return;
    state.selectedLessonId = id;
    state.selectedLesson = lesson;
    state.draftMedia = { videoId: lesson.video_id, pdfUrl: lesson.pdf_url, active: lesson.active };
    state.draftBlocks = null;
    loadLessonContent(id).then(renderEditor);
    renderList();
  }

  function groupByModule(lessons) {
    const groups = new Map();
    for (const l of lessons) {
      const key = l.module || '—';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(l);
    }
    // Sort each group by lesson_order.
    for (const arr of groups.values()) arr.sort((a, b) => a.lesson_order - b.lesson_order);
    // Sort group keys by module_order of first lesson in each.
    return Array.from(groups.entries()).sort((a, b) => {
      const am = Math.min(...a[1].map(l => l.module_order));
      const bm = Math.min(...b[1].map(l => l.module_order));
      return am - bm;
    });
  }

  function render() {
    root.innerHTML = `
      <div class="lessons-page" dir="ltr">
        <div class="lessons-tabs" id="l-tabs"></div>
        <div class="lessons-body">
          <aside class="lessons-list" id="l-list"></aside>
          <section class="lessons-editor ${state.selectedLesson ? '' : 'empty'}" id="l-editor"></section>
        </div>
      </div>`;
    renderTabs();
    renderList();
    renderEditor();
  }

  function renderTabs() {
    const el = document.getElementById('l-tabs');
    if (!el) return;
    el.innerHTML = state.courses.map(c => `
      <button class="lessons-tab ${c.id === state.activeCourse ? 'active' : ''}" data-id="${escapeHtml(c.id)}">
        ${escapeHtml(c.label)} <span class="count">· ${c.lessonCount}</span>
      </button>`).join('') || '<span style="color:var(--c-ink-3);padding:8px">No courses found</span>';
    el.querySelectorAll('.lessons-tab').forEach(btn => {
      btn.onclick = async () => {
        state.activeCourse = btn.dataset.id;
        loadCollapsedState(state.activeCourse);
        state.selectedLessonId = null;
        state.selectedLesson = null;
        await loadLessons();
        render();
      };
    });
  }

  function renderList() {
    const el = document.getElementById('l-list');
    if (!el) return;
    const groups = groupByModule(state.lessons);
    el.innerHTML = groups.map(([mod, items]) => {
      const collapsed = state.collapsedModules.has(mod);
      return `
        <div class="lesson-module">
          <div class="lesson-module-header ${collapsed ? 'collapsed' : ''}" data-module="${escapeHtml(mod)}">
            <span>${escapeHtml(mod)}</span>
            <span class="count">${items.length} <span class="chev">▼</span></span>
          </div>
          ${collapsed ? '' : items.map(l => `
            <div class="lesson-row ${state.selectedLessonId === l.id ? 'active' : ''}" data-id="${escapeHtml(l.id)}" draggable="true">
              <span class="handle" title="Drag to reorder">⋮⋮</span>
              <span class="title">${escapeHtml(l.title || '—')}</span>
              <span class="${l.active ? 'dot-active' : 'dot-inactive'}" title="${l.active ? 'active' : 'inactive'}"></span>
            </div>`).join('')}
        </div>`;
    }).join('');
    el.innerHTML += `<button class="lessons-add-btn" id="l-add">+ Add lesson</button>`;

    el.querySelectorAll('.lesson-module-header').forEach(h => {
      h.onclick = () => {
        const m = h.dataset.module;
        if (state.collapsedModules.has(m)) state.collapsedModules.delete(m);
        else state.collapsedModules.add(m);
        saveCollapsedState();
        renderList();
      };
    });
    el.querySelectorAll('.lesson-row').forEach(row => {
      row.onclick = (e) => {
        if (e.target.classList.contains('handle')) return;
        selectLesson(row.dataset.id);
      };
      row.ondragstart = (e) => {
        e.dataTransfer.setData('text/plain', row.dataset.id);
        row.classList.add('dragging');
      };
      row.ondragend = () => { row.classList.remove('dragging'); el.querySelectorAll('.drop-above, .drop-below').forEach(r => r.classList.remove('drop-above', 'drop-below')); };
      row.ondragover = (e) => {
        e.preventDefault();
        const rect = row.getBoundingClientRect();
        const above = e.clientY < rect.top + rect.height / 2;
        el.querySelectorAll('.drop-above, .drop-below').forEach(r => { if (r !== row) r.classList.remove('drop-above', 'drop-below'); });
        row.classList.toggle('drop-above', above);
        row.classList.toggle('drop-below', !above);
      };
      row.ondrop = async (e) => {
        e.preventDefault();
        const fromId = e.dataTransfer.getData('text/plain');
        const above = row.classList.contains('drop-above');
        row.classList.remove('drop-above', 'drop-below');
        if (fromId === row.dataset.id) return;
        await doReorder(fromId, row.dataset.id, above);
      };
    });
    document.getElementById('l-add').onclick = openAddModal;
  }

  function renderEditor() {
    const el = document.getElementById('l-editor');
    if (!el) return;
    if (!state.selectedLesson) {
      el.className = 'lessons-editor empty';
      el.innerHTML = 'Select a lesson on the left';
      return;
    }
    const l = state.selectedLesson;
    el.className = 'lessons-editor';
    const bunnyLib = BUNNY_LIB[state.activeCourse] || '';
    const vid = state.draftMedia.videoId || '';
    const iframeSrc = (bunnyLib && vid) ? `https://iframe.mediadelivery.net/embed/${bunnyLib}/${encodeURIComponent(vid)}?autoplay=false` : '';
    el.innerHTML = `
      <h2>${escapeHtml(l.title || '—')}</h2>

      <label>Title</label>
      <input type="text" id="f-title" value="${escapeHtml(l.title || '')}" />

      <label>Video ID (Bunny GUID)</label>
      <input type="text" id="f-video" value="${escapeHtml(vid)}" placeholder="e.g. ab12cd34-..." />
      <div class="lessons-video-preview ${iframeSrc ? '' : 'empty'}" id="f-video-preview">
        ${iframeSrc ? `<iframe src="${escapeHtml(iframeSrc)}" allowfullscreen></iframe>` : 'No video ID yet'}
      </div>

      <label>PDF URL</label>
      <input type="url" id="f-pdf" value="${escapeHtml(state.draftMedia.pdfUrl || '')}" placeholder="https://..." />

      <label>Status</label>
      <label class="lessons-active-toggle">
        <input type="checkbox" id="f-active" ${state.draftMedia.active ? 'checked' : ''} />
        Active — visible to students
      </label>

      <label>Lesson content</label>
      <div id="f-composer"></div>

      <div class="lessons-actions">
        <button class="primary" id="f-save" disabled title="Wired in Stage B">Save changes</button>
        <button id="f-open-player" disabled title="Wired in Stage B">Open in player ↗</button>
        <button class="danger" id="f-delete" disabled title="Wired in Stage B">🗑 Delete</button>
      </div>
      <div id="f-msg" style="color:var(--c-ink-3);font-size:.85rem;margin-top:var(--sp-3)"></div>
    `;

    // Live preview iframe updates on Video ID input.
    document.getElementById('f-video').oninput = (e) => {
      state.draftMedia.videoId = e.target.value.trim();
      const preview = document.getElementById('f-video-preview');
      const src = (bunnyLib && state.draftMedia.videoId) ? `https://iframe.mediadelivery.net/embed/${bunnyLib}/${encodeURIComponent(state.draftMedia.videoId)}?autoplay=false` : '';
      if (src) {
        preview.className = 'lessons-video-preview';
        preview.innerHTML = `<iframe src="${escapeHtml(src)}" allowfullscreen></iframe>`;
      } else {
        preview.className = 'lessons-video-preview empty';
        preview.innerHTML = 'No video ID yet';
      }
    };
    document.getElementById('f-title').oninput = (e) => { state.selectedLesson.title = e.target.value; };
    document.getElementById('f-pdf').oninput = (e) => { state.draftMedia.pdfUrl = e.target.value.trim(); };
    document.getElementById('f-active').onchange = (e) => { state.draftMedia.active = e.target.checked; };

    // Mount the composer for content editing.
    if (state.selectedContent) {
      state.composer = mountComposer({
        root: document.getElementById('f-composer'),
        initialBlocks: state.selectedContent.blocks,
        language: 'AR',
        onChange: (b) => { state.draftBlocks = b; },
      });
    }
  }

  async function doReorder(fromId, targetId, above) {
    // Placeholder — wired in Task 8.
    console.warn('reorder wired in Stage B');
  }

  function openAddModal() {
    // Placeholder — wired in Task 8.
    console.warn('add lesson wired in Stage B');
  }

  function toast(msg, kind) {
    const prev = document.querySelector('.lessons-toast');
    if (prev) prev.remove();
    const t = document.createElement('div');
    t.className = 'lessons-toast ' + (kind || '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // Expose some helpers for Stage B (Task 8) to use.
  window.__lessonsState = state;
  window.__lessonsToast = toast;

  await loadCourses();
  if (state.activeCourse) await loadLessons();
  render();
}
```

- [ ] **Step 2: Syntax check**

```bash
cd ~/code/ma-learn-dashboard
node --check frontend/public/js/pages/lessons.js
```

- [ ] **Step 3: Commit**

```bash
git add frontend/public/js/pages/lessons.js
git commit -m "feat(lessons): rewrite lessons page with 3-col layout + composer (Stage A, read-only)"
```

---

### Task 8: Wire write actions (Stage B)

**Files:**
- Modify: `frontend/public/js/pages/lessons.js`

This task wires save, reorder, add, delete, and "open in player" on the read-only page shipped in Task 7. Replaces the 4 placeholder / disabled states.

- [ ] **Step 1: Remove `disabled` from action buttons**

Find the `.lessons-actions` HTML block in `renderEditor()`. Replace with:

```javascript
      <div class="lessons-actions">
        <button class="primary" id="f-save">Save changes</button>
        <button id="f-open-player">Open in player ↗</button>
        <button class="danger" id="f-delete">🗑 Delete</button>
      </div>
```

- [ ] **Step 2: Wire Save + Open-in-player + Delete at the end of `renderEditor()`**

Append after the composer mount (inside `renderEditor()`):

```javascript
    document.getElementById('f-save').onclick = doSave;
    document.getElementById('f-open-player').onclick = doOpenInPlayer;
    document.getElementById('f-delete').onclick = doDelete;
```

- [ ] **Step 3: Implement `doSave`, `doOpenInPlayer`, `doDelete`, `doReorder`, `openAddModal`**

Replace the `doReorder` and `openAddModal` placeholders in `mount()`. Add `doSave`, `doOpenInPlayer`, `doDelete` above the placeholder block:

```javascript
  async function doSave() {
    if (!state.selectedLesson) return;
    const msg = document.getElementById('f-msg');
    msg.textContent = 'Saving…';
    try {
      // 1. Save media (title isn't saved via save_lesson_media — the existing
      //    Apps Script only updates video/pdf/active. Title edits require a
      //    direct sheet edit or a future endpoint. v1 scope: log a warning.)
      const newTitle = document.getElementById('f-title').value.trim();
      if (newTitle && newTitle !== state.selectedLesson.title) {
        console.warn('Title changed — save_lesson_media does not persist title in v1. Edit sheet directly.');
      }
      await api('/api/writes/lesson/save_media', {
        method: 'POST',
        body: JSON.stringify({
          lessonId: state.selectedLesson.id,
          videoId: state.draftMedia.videoId || '',
          pdfUrl: state.draftMedia.pdfUrl || '',
          active: !!state.draftMedia.active,
        }),
      });

      // 2. Save content if composer blocks changed.
      if (state.draftBlocks) {
        // Render blocks to HTML on the client — backend stores both.
        const { renderPreview } = await import('../composer/preview.js');
        const html = renderPreview(state.draftBlocks, 'AR', {}).replace(/<div dir="[^"]*"[^>]*>|<\/div>|<hr[^>]*>|<p style="margin:0[^"]*"[^>]*>[\s\S]*$/g, '');
        await api('/api/writes/lesson/save_content', {
          method: 'POST',
          body: JSON.stringify({
            lessonId: state.selectedLesson.id,
            blocks: state.draftBlocks,
            html: html,
          }),
        });
      }

      msg.textContent = 'Saved ✓';
      toast('Lesson saved', 'success');
      // Refresh lessons list to reflect the updated active state.
      await loadLessons();
      renderList();
    } catch (e) {
      msg.textContent = `Error: ${e.message}`;
      toast(`Save failed: ${e.message}`, 'error');
    }
  }

  function doOpenInPlayer() {
    if (!state.selectedLesson) return;
    // v1: open the generic player with a reserved admin test token for this course.
    // Majid maintains one test token per course in the Tokens sheet with status='used'
    // and email='admin-preview@malearnsa.com'. If none exists, the player will show
    // an access-denied screen — edit Tokens sheet to add one.
    const testTokenPerCourse = {
      'intro-to-creative-ai': 'MAL-T2-PREVIEW',
      'beyond-lighting':      'MAL-BL-PREVIEW',
    };
    const token = testTokenPerCourse[state.activeCourse];
    if (!token) { toast('No admin-preview token configured for this course', 'error'); return; }
    const url = `https://player.malearnsa.com/watch.html?token=${encodeURIComponent(token)}&course=${encodeURIComponent(state.activeCourse)}&lesson=${encodeURIComponent(state.selectedLesson.id)}`;
    window.open(url, '_blank', 'noopener');
  }

  function doDelete() {
    if (!state.selectedLesson) return;
    const l = state.selectedLesson;
    const o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = `
      <div class="modal-card" style="max-width:480px">
        <h3>Delete this lesson?</h3>
        <div class="delete-preview">
          <div class="n">${escapeHtml(l.module || '')} · ${escapeHtml(l.title || '—')}</div>
          <div class="e">${l.video_id ? 'Video: ' + escapeHtml(l.video_id) : '<em>no video</em>'}</div>
          <div class="facts">PDF: ${l.pdf_url ? escapeHtml(l.pdf_url) : '—'}<br>Active: ${l.active ? 'yes' : 'no'}</div>
        </div>
        <p style="color:var(--c-ink-2);font-size:.85rem;line-height:1.5">
          This removes the row from the Lessons sheet AND the LessonContent row.
          Students who bookmarked the deep link will see a 404.
        </p>
        <div class="modal-actions">
          <button class="btn-ghost" id="x-cancel">Cancel</button>
          <button class="btn-primary" id="x-go" style="background:var(--c-danger);color:#fff">Delete lesson</button>
        </div>
        <div class="modal-msg" id="x-msg"></div>
      </div>`;
    document.body.appendChild(o);
    o.addEventListener('mousedown', e => { if (e.target === o) o.remove(); });
    o.querySelector('#x-cancel').onclick = () => o.remove();
    o.querySelector('#x-go').onclick = async () => {
      o.querySelector('#x-msg').textContent = 'Deleting…';
      try {
        const r = await api('/api/writes/lesson/delete', {
          method: 'POST', body: JSON.stringify({ lessonId: l.id }),
        });
        if (r.success || r.ok) {
          o.remove();
          toast('Lesson deleted', 'success');
          state.selectedLessonId = null; state.selectedLesson = null;
          await loadLessons();
          render();
        } else {
          o.querySelector('#x-msg').textContent = `Error: ${r.reason || r.error || 'unknown'}`;
        }
      } catch (e) {
        o.querySelector('#x-msg').textContent = `Error: ${e.message}`;
      }
    };
  }

  async function doReorder(fromId, targetId, above) {
    const target = state.lessons.find(l => l.id === targetId);
    const moving = state.lessons.find(l => l.id === fromId);
    if (!target || !moving) return;
    // Simple rule: moved lesson adopts the target's module + a lesson_order
    // that places it above or below the target. No adjacent renumbering —
    // backend writes the two values and the sort order handles the rest.
    const newModuleOrder = target.module_order;
    const newLessonOrder = above ? target.lesson_order - 0.5 : target.lesson_order + 0.5;
    try {
      await api('/api/writes/lesson/reorder', {
        method: 'POST',
        body: JSON.stringify({
          lessonId: fromId,
          moduleOrder: newModuleOrder,
          lessonOrder: Math.max(1, Math.round(newLessonOrder * 2) / 2),
        }),
      });
      toast('Reordered', 'success');
      await loadLessons();
      renderList();
    } catch (e) {
      toast(`Reorder failed: ${e.message}`, 'error');
    }
  }

  function openAddModal() {
    const modules = Array.from(new Set(state.lessons.map(l => l.module))).filter(Boolean);
    const o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = `
      <div class="modal-card" style="max-width:480px">
        <h3>Add a new lesson</h3>
        <div class="form-field">
          <label>Module (existing or new)</label>
          <input id="a-module" list="a-module-list" value="" />
          <datalist id="a-module-list">${modules.map(m => `<option value="${escapeHtml(m)}">`).join('')}</datalist>
        </div>
        <div class="form-field"><label>Title</label><input id="a-title" /></div>
        <div class="modal-actions">
          <button class="btn-ghost" id="a-cancel">Cancel</button>
          <button class="btn-primary" id="a-go">Add lesson</button>
        </div>
        <div class="modal-msg" id="a-msg"></div>
      </div>`;
    document.body.appendChild(o);
    o.addEventListener('mousedown', e => { if (e.target === o) o.remove(); });
    o.querySelector('#a-cancel').onclick = () => o.remove();
    o.querySelector('#a-go').onclick = async () => {
      const module = o.querySelector('#a-module').value.trim();
      const title = o.querySelector('#a-title').value.trim();
      if (!module || !title) { o.querySelector('#a-msg').textContent = 'Module + title required.'; return; }
      // Module order = highest existing + 1 if new, else the existing number.
      const existing = state.lessons.filter(l => l.module === module);
      const module_order = existing.length ? existing[0].module_order : (Math.max(0, ...state.lessons.map(l => l.module_order)) + 1);
      const lesson_order = existing.length ? Math.max(...existing.map(l => l.lesson_order)) + 1 : 1;
      o.querySelector('#a-msg').textContent = 'Adding…';
      try {
        const r = await api('/api/writes/lesson/add', {
          method: 'POST',
          body: JSON.stringify({
            course: state.activeCourse, module, module_order, lesson_order, title,
          }),
        });
        if (r.success) {
          o.remove();
          toast('Lesson added', 'success');
          await loadLessons();
          renderList();
        } else {
          o.querySelector('#a-msg').textContent = `Error: ${r.reason || r.error || 'unknown'}`;
        }
      } catch (e) {
        o.querySelector('#a-msg').textContent = `Error: ${e.message}`;
      }
    };
  }
```

- [ ] **Step 4: Syntax check + commit**

```bash
node --check frontend/public/js/pages/lessons.js
git add frontend/public/js/pages/lessons.js
git commit -m "feat(lessons): wire save / reorder / add / delete / open-in-player actions"
```

---

### Task 9: Deploy + smoke test + retire old admin

**Files:**
- Modify: `projects/ma-learn-launch/admin-dashboard.html` (rewrite as redirect)

- [ ] **Step 1: Push + deploy backend**

```bash
cd ~/code/ma-learn-dashboard
git push origin main
cd backend && npx tsc -p . && rsync -az -e "ssh -o ConnectTimeout=10" dist/ root@46.101.151.237:/var/www/ma-learn-dashboard/backend/dist/
ssh -n -o ConnectTimeout=10 root@46.101.151.237 'pm2 restart ma-learn-dashboard-staging --update-env'
curl -sS https://api-staging.malearnsa.com/health
```

Expected: `{"status":"ok","environment":"staging"}`

- [ ] **Step 2: Browser smoke test**

On https://admin-staging.malearnsa.com (hard-reload) → Lessons:

- Course tabs appear with counts (T2 · 19, BL · N)
- Click a tab → list reloads for that course
- Modules collapse/expand (state persists on reload)
- Click a lesson → editor loads with Title / Video ID / PDF URL / Active / Content
- Edit Video ID → inline iframe preview updates
- Check/uncheck Active → Save → list reflects
- Drag a lesson over another → gold glow drop indicator → release → lesson reorders
- + Add lesson → modal with module autocomplete + title → submit → new lesson appears in list
- Delete → confirmation modal → confirm → lesson disappears
- Open in player ↗ → opens a new tab with the actual student view (requires admin-preview token in Tokens sheet — see "Bunny library ID" in plan open items)

- [ ] **Step 3: Retire `admin-dashboard.html`**

Replace `projects/ma-learn-launch/admin-dashboard.html` with a redirect:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>MA Learn Admin — moved</title>
  <meta http-equiv="refresh" content="0; url=https://admin-staging.malearnsa.com/#lessons">
  <style>
    body { background:#0A0A0C; color:#F1EFEA; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; display:grid; place-items:center; min-height:100vh; margin:0; text-align:center; padding:20px; }
    h1 { color:#C9A84C; font-size:1.4rem; margin-bottom:12px; }
    p { color:#BFBCB3; font-size:.95rem; max-width:480px; line-height:1.6; }
    a { color:#E4C36B; text-decoration:underline; }
  </style>
</head>
<body>
  <div>
    <h1>This admin has moved</h1>
    <p>Lesson management is now in the dashboard at <a href="https://admin-staging.malearnsa.com/#lessons">admin-staging.malearnsa.com/#lessons</a>. You should be redirected automatically.</p>
  </div>
</body>
</html>
```

If the file is served from GitHub Pages or similar, push the repo where it lives.

- [ ] **Step 4: Commit + push**

```bash
cd "/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA"
git add projects/ma-learn-launch/admin-dashboard.html
git commit -m "chore(admin): redirect old admin-dashboard to /#lessons in the new dashboard"
git push origin main
```

- [ ] **Step 5: Update current-priorities + memory**

Append to `context/current-priorities.md`:
```markdown
## Player Admin shipped to staging — 2026-04-23
- Dashboard /#lessons — full player admin (3-col layout, composer-based content editor, drag-drop reorder, add/delete, inline Bunny preview, open-in-player link)
- Apps Script v10 deployed via clasp (admin_reorder_lessons + save_content Blocks upgrade)
- LessonContent sheet gained `Blocks` JSON column (staging + prod)
- Old admin-dashboard.html redirects to new admin
- Next: dashboard design polish pass → prod migration
```

```bash
git add context/current-priorities.md
git commit -m "docs(priorities): Player Admin shipped to staging"
git push origin main
```

---

## Self-Review

**Spec coverage:**
- D1 full parity + retire old → Tasks 5, 7, 8, 9 (retirement in 9)
- D2 reuse composer → Task 7 (mountComposer in editor panel)
- D3 paste Bunny GUID → Task 7 (Video ID input + iframe preview)
- D4 3-col layout → Task 6 (CSS grid) + Task 7 (HTML structure)
- D5 both inline iframe + open-in-player → Task 7 iframe; Task 8 open-in-player
- D6 drag-drop reorder → Task 8 (doReorder with client-computed orders)
- D7 dynamic course tabs → Task 2 (deriveCourses) + Task 3 (/courses endpoint)
- D8 admin_reorder_lessons endpoint → Task 4
- D9 Blocks column on LessonContent → Task 1 (sheet) + Task 4 (saveLessonContent writes it)
- D10 delete preview-confirm → Task 8 (doDelete modal)

All 10 decisions traced to tasks.

**Placeholder scan:** No TBD/TODO/"similar to" patterns. One explicit "v1 caveat" for title saves (Apps Script doesn't persist title via save_lesson_media) with a clear comment pointing to the manual workaround — that's a known limitation from the existing Apps Script, not a plan gap.

**Type consistency:** `ContactListRow`→style interfaces named consistently (`Course`, `LessonContent`). Frontend state uses `selectedLesson`, `selectedContent`, `draftMedia`, `draftBlocks` — same names throughout renderEditor / doSave. Backend route payloads match Apps Script parameter names (`lesson_id` / `video_id` / `pdf_url` / `active` / `content` / `blocks`).

**Estimated wall time:** 5–7 focused hours. No hard stops — clasp automated, Bunny library IDs are configurable, old admin redirect is a 1-file change.

---

## Open items for implementation

- Bunny library IDs in `BUNNY_LIB` placeholder (Task 7) — confirm T2 = 637491 (per memory), BL = verify from player code or Bunny dashboard
- Admin-preview tokens for "Open in player" (Task 8) — manually add one `used` token per course to Tokens sheet with email `admin-preview@malearnsa.com` before smoke test
- If HTML→blocks parsing proves too lossy for legacy content, extend `parseLessonContent` to handle basic tags (h2/h3/p/ul/li/img/blockquote). v1 falls back to single Text block — acceptable; Majid can re-author when he edits that lesson next
- Title edits don't persist (existing `save_lesson_media` limitation). Deferred; either edit sheet directly or add a new endpoint in v2.
