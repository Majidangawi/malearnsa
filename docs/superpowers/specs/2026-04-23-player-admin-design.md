# Player Admin — Design Spec

**Date:** 2026-04-23
**Author:** Majid Angawi + Noor
**Status:** Approved — ready for implementation plan
**Scope:** Bring the standalone `admin-dashboard.html` player/lesson admin into the dashboard as a rebuilt Lessons page. Full feature parity with the old admin plus content editing via the block composer. Retire the old standalone admin after ship.

**Related:**
- Dashboard features plan: [docs/superpowers/plans/2026-04-19-ma-learn-dashboard-features.md](../plans/2026-04-19-ma-learn-dashboard-features.md)
- Composer v1 (reused here): [docs/superpowers/specs/2026-04-20-emails-v2-and-newsletter-design.md](2026-04-20-emails-v2-and-newsletter-design.md)
- Contacts/CRM: [docs/superpowers/specs/2026-04-23-contacts-crm-design.md](2026-04-23-contacts-crm-design.md)

---

## Goal

One place for every lesson-management workflow: add a video, toggle active, edit lesson content, add/delete lessons, reorder, preview. Replaces the standalone `admin-dashboard.html` (which survived from the pre-dashboard era and handles only media + active).

After this ships, `admin-dashboard.html` becomes a redirect to `admin-staging.malearnsa.com/#lessons` and is never opened directly again.

---

## Key Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **All 7 jobs + full parity + retire old admin** | Majid confirmed — one tool, one login, one style |
| D2 | **Reuse the block composer for lesson content** | Already v1-locked; blocks (Text/Heading/Banner/Quote/List) map cleanly to the HTML the player renders (h2/h3/p/img/blockquote/ul). Output HTML to the player, keep Blocks JSON for round-tripping |
| D3 | **Paste Bunny GUID (v1)**, upload-from-dashboard deferred to v2 | Video uploads are large; streaming through the droplet isn't worth building yet |
| D4 | **3-column layout: tabs on top, lesson list left, editor right** | Matches the old admin; hierarchy (course → module → lesson) is natural |
| D5 | **Both inline Bunny preview AND "open in player" link** | Inline = fast "is this the right file" check; player = real student view |
| D6 | **Drag-drop reorder** (composer pattern — gold glow drop indicator) | Consistent with the rest of the dashboard |
| D7 | **Dynamic course tabs** (derived from Lessons sheet `course` column) | Future-proof; no hardcoded list to maintain |
| D8 | **New `admin_reorder_lessons` Apps Script endpoint** | Only missing piece; everything else exists |
| D9 | **Add `Blocks` column to LessonContent tab** (same pattern as EmailTemplates) | Blocks JSON stored alongside rendered HTML; player keeps reading HTML |
| D10 | **Delete requires preview-confirm modal** (per SOP memory) | Destructive action — always preview before act |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Dashboard → Lessons page (#lessons)                         │
│  ┌──────────────────────────────────────────┐                │
│  │  Course tabs (dynamic from Lessons sheet)│                │
│  └──────────────────────────────────────────┘                │
│  ┌─────────────────────┬──────────────────────────────────┐  │
│  │  Lesson list        │  Lesson editor                   │  │
│  │  - modules grouped  │  · Title                         │  │
│  │  - drag handles     │  · Video ID (Bunny GUID)         │  │
│  │  - drop indicator   │  · Inline Bunny preview iframe   │  │
│  │  + Add lesson       │  · PDF URL                       │  │
│  │                     │  · Active toggle                 │  │
│  │                     │  · Content (block composer)      │  │
│  │                     │  · Open in player ↗              │  │
│  │                     │  · Delete (with confirm)         │  │
│  └─────────────────────┴──────────────────────────────────┘  │
└────────────────┬─────────────────────────────────────────────┘
                 │
┌────────────────┴─────────────────────────────────────────────┐
│  Backend routes (new + existing-wrap):                       │
│  EXISTING:                                                   │
│  └─ GET  /api/data/lessons            (already live)         │
│  └─ POST /api/writes/toggle_lesson    (already live)         │
│                                                              │
│  NEW:                                                        │
│  ├─ GET  /api/data/lessons/courses    (derives tab list)     │
│  ├─ GET  /api/data/lessons/:id/content                       │
│  ├─ POST /api/writes/lesson/save_media                       │
│  ├─ POST /api/writes/lesson/save_content                     │
│  ├─ POST /api/writes/lesson/add                              │
│  ├─ POST /api/writes/lesson/delete                           │
│  └─ POST /api/writes/lesson/reorder                          │
└────────────────┬─────────────────────────────────────────────┘
                 │
┌────────────────┴─────────────────────────────────────────────┐
│  Apps Script (pushed via clasp — no manual paste):           │
│  EXISTING (wrapped by new routes):                           │
│  ├─ admin_get_lessons, admin_toggle_lesson                   │
│  ├─ save_lesson_media, add_lesson, delete_lesson             │
│  ├─ save_content, get_content                                │
│                                                              │
│  NEW:                                                        │
│  └─ admin_reorder_lessons  — takes {lessonId, moduleOrder,   │
│                               lessonOrder, admin_token}      │
│                                                              │
│  Sheet change:                                               │
│  └─ LessonContent tab gains a `Blocks` column (JSON).        │
│     Existing `Content` column stays unchanged — the player   │
│     keeps reading HTML from it. Save pipeline writes both:   │
│     blocks → renderBlocks → Content (HTML) + Blocks (JSON).  │
└──────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Course tabs (dynamic)

```typescript
// GET /api/data/lessons/courses
// Scans Lessons sheet, returns distinct course IDs that have ≥1 row.
{ courses: [
  { id: 'intro-to-creative-ai',  label: 'T2',  lessonCount: 19 },
  { id: 'beyond-lighting',       label: 'BL',  lessonCount: 8  },
] }
```

Future courses appearing in the sheet auto-surface as tabs. No hardcoded list.

### Lesson list row (already from `/api/data/lessons`)

Grouped by `module` in the sidebar, sorted by `module_order`, then `lesson_order`.

### Lesson detail (editor panel)

```typescript
{
  id, course, module, module_order, lesson_order,
  title, desc, video_id, pdf_url, active,
  // And the content blocks (lazy-loaded on click):
  contentBlocks: Block[],  // from LessonContent.Blocks
  contentHtml: string,     // from LessonContent.Content (what the player reads)
}
```

---

## UI — Three-column layout

```
┌─ Course tabs ─────────────────────────────────────────────────┐
│  [ T2 · 19 ] [ BL · 8 ]     (dynamic, counts from sheet)      │
└───────────────────────────────────────────────────────────────┘
┌─ Lesson list (320px) ─┬─ Lesson editor (fills rest) ──────────┐
│                       │                                       │
│  Module 1 (5)         │  Lesson title                         │
│   ⋮⋮ Lesson 1.1       │  [___________________________]        │
│   ⋮⋮ Lesson 1.2 [●]   │  Video ID (Bunny GUID)                │
│   ⋮⋮ Lesson 1.3       │  [___________________________]        │
│   ⋮⋮ Lesson 1.4       │  ┌──────────────────────────┐         │
│   ⋮⋮ Lesson 1.5       │  │  Bunny iframe preview    │         │
│                       │  └──────────────────────────┘         │
│  Module 2 (4)         │  PDF URL                              │
│   ⋮⋮ Lesson 2.1       │  [___________________________]        │
│   ⋮⋮ ...              │  [✓] Active                           │
│                       │                                       │
│  [+ Add lesson]       │  ── Content ────────────────────      │
│                       │  [block composer mounts here]         │
│                       │                                       │
│                       │  [Open in player ↗]        [Delete]   │
│                       │  [Save changes]                       │
└───────────────────────┴───────────────────────────────────────┘
```

### Lesson list (left)

- Grouped by `module`, module headers collapsible (remember expand/collapse state in localStorage keyed by course+module)
- Each row: drag handle (⋮⋮) + lesson title + tiny active dot (●) if `active=true`
- Rows are `draggable`; reorder within or across modules. Gold glow drop indicator between rows (same pattern as composer blocks)
- On reorder: POST `/api/writes/lesson/reorder` with new `{moduleOrder, lessonOrder}` for the dropped lesson; adjacent lessons get renumbered server-side
- `+ Add lesson` at the bottom opens a small modal: module name (autocomplete from existing modules) + title → creates a new lesson at the end of that module with default order + inactive + empty content
- Click a row → right panel loads that lesson's editor

### Lesson editor (right)

Fields top → bottom:

1. **Title** — plain text input (no rich text)
2. **Video ID** — Bunny GUID text input + inline preview iframe below
3. **PDF URL** — plain text input
4. **Active toggle** — checkbox
5. **Content** — block composer mounted (reuses `mountComposer({root, initialBlocks, language})`)
6. Footer actions: **Open in player ↗** (external link), **Delete** (with confirm modal), **Save changes** (primary)

**Bunny preview iframe:** `https://iframe.mediadelivery.net/embed/<libraryId>/<guid>?autoplay=false`. Library ID stored in env or per-course constant (check existing player code).

**"Open in player ↗":** opens `https://player.malearnsa.com/watch.html?token=<majid's own admin test token>&course=<course>` — needs a reserved test token per course OR an admin-preview mode that bypasses token check. Detail in implementation plan.

**Delete confirm modal:**
```
Delete this lesson?

[ Module 1 · Lesson 1.3 ]
"Claude — getting started"
Video: ab12cd34-...
PDF: bit.ly/xxx

This removes the row from the Lessons sheet AND the LessonContent
row. Students who bookmarked the deep link will see a 404.

[Cancel]  [Delete lesson]
```

### Content editor (composer reuse)

- `mountComposer` embedded in the right panel
- Block types available: **Text · Heading · Banner · Quote · Bullet list · Divider** (skip CTA — not useful inside player; can be hidden per instance)
- Language: inherits course language (T2 = AR, BL = AR, others = AR default)
- On save:
  1. Compose blocks → HTML via `renderBlocks(blocks, 'AR', {})` — no email chrome, just the body
  2. POST `/api/writes/lesson/save_content` with `{lessonId, blocks, html}`
  3. Backend writes both fields: `LessonContent.Blocks = JSON`, `LessonContent.Content = html`
  4. Player keeps reading `Content` (HTML) — no migration needed

### Migration from existing LessonContent rows

- Rows with only `Content` (HTML, no blocks): composer loads them via `markdownToBlocks` (the existing shim from Emails v2) but operates on HTML; the shim can be extended to parse basic HTML tags (`<h2>`, `<p>`, `<ul>`, etc.) into blocks. Details in plan.
- If parse fails: composer falls back to a single "Text" block with the raw HTML. Editable, if imperfect.

---

## Backend routes

All under existing auth guard. Pattern matches Contacts/writes-contact.

```
GET  /api/data/lessons/courses             → { courses: [...] }
GET  /api/data/lessons/:id/content         → { blocks, html }
POST /api/writes/lesson/save_media         { lessonId, videoId?, pdfUrl?, active? } → passes all 3 as existing endpoint expects
POST /api/writes/lesson/save_content       { lessonId, blocks, html }
POST /api/writes/lesson/add                { course, module, module_order, lesson_order, title, desc? } → returns new lesson id
POST /api/writes/lesson/delete             { lessonId } → also deletes matching LessonContent row
POST /api/writes/lesson/reorder            { lessonId, moduleOrder, lessonOrder }
```

All write routes invalidate a 30s in-memory cache of `readLessons()` on success (same pattern as Contacts cache).

### `admin_reorder_lessons` Apps Script endpoint

Takes `{admin_token, lessonId, moduleOrder, lessonOrder}`. Updates columns D + E on the matching row. No adjacent-row renumbering — the frontend computes and sends the target positions; server just writes them. Simpler, keeps the logic on the client where the drag happens.

---

## Design pass (per SOP)

Before writing `lessons.css`, invoke `/ui-ux-pro-max` with:
> "admin CRM course-management lesson-editor split-view 3-column dark-mode craft sophisticated saudi"

Apply the Priority 1–10 rules (accessibility, touch, motion, typography, color). Reuse the same design tokens as composer + contacts (`--c-bg`, `--c-gold`, etc.) scoped under `.lessons-page`. No new palette — coherent with the rest of the dashboard.

---

## Out of scope for v1

- **Upload video from dashboard** (deferred to v2 — Bunny API integration)
- **Drip staging column UI** (column K in Lessons sheet — time-based triggers already auto-unlock; Majid can edit sheet directly for manual)
- **Prompt Pack admin** (different data model; separate page if/when needed)
- **T3 tab** (cohort-only, no lessons — auto-hidden by dynamic tab discovery)
- **Lesson duplication** (nice-to-have, not in v1)
- **Bulk actions** (activate many, delete many)
- **Lesson-level analytics** (views, completion — needs Bunny analytics API)
- **Content version history** (Content column overwrites — no snapshots)
- **Rich media inside content** (just img via Banner block — no inline video, no embeds)

---

## Risks + Mitigations

| Risk | Mitigation |
|---|---|
| Existing `LessonContent.Content` rows don't parse cleanly into blocks | Fall back to single Text block with raw HTML; Majid can re-author if desired |
| Drag-drop across modules breaks numbering | Client computes target `{moduleOrder, lessonOrder}` before sending; server trusts client. Worst case: numbers get weird but lessons still render in a valid order |
| Bunny preview iframe blocked by iframe sandbox | Test in staging — if blocked, use a plain `<video>` tag pointing at the Bunny HLS URL instead |
| Accidental delete | Preview-confirm modal (per SOP memory) |
| "Open in player" needs a token that bypasses access check | v1: use a reserved admin-test token per course stored in env; v2: Apps Script endpoint that generates a short-lived preview token |
| Old `admin-dashboard.html` URLs still bookmarked | Replace `admin-dashboard.html` body with a meta redirect to `https://admin-staging.malearnsa.com/#lessons` |

---

## Rollout order (2 slices, 1 plan)

### Slice 1 — Read-only player admin (tabs + list + detail, no actions)
- Backend: `GET /api/data/lessons/courses`, `GET /api/data/lessons/:id/content`
- Frontend: `lessons.js` rewrite — 3-column layout, dynamic course tabs, module-grouped list, editor panel (read-only fields + content rendered but not editable)
- Composer mounted for read-only content preview
- Design pass via `/ui-ux-pro-max`

### Slice 2 — Actions
- Backend: save_media, save_content, add, delete, reorder routes
- Apps Script: `admin_reorder_lessons` + `Blocks` column added to LessonContent sheet
- Frontend: wire save flow, drag-drop reorder, add-lesson modal, delete confirm, "open in player" link
- Replace `admin-dashboard.html` with a redirect
- Smoke test: edit a real lesson end-to-end

Each slice ends with commit + deploy + smoke test.

---

## Open items for the implementation plan

- Bunny library ID source (env var vs per-course constant)
- Test admin token strategy for "Open in player" (reserved token vs new endpoint)
- HTML → blocks parser for legacy LessonContent rows (existing `markdownToBlocks` may need extending for img/blockquote tags)
- Exact styling tokens for the 3-column layout at 13" laptop width (editor panel ~520px — needs confirmation composer still feels good at that width)

Handled in writing-plans phase.
