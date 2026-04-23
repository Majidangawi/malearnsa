# MA Learn Player Chat — Design Spec

**Date:** 2026-04-23 · **Updated:** 2026-04-24 (Supabase pivot — see §16)
**Owner:** Majid Angawi
**Status:** Approved design · implementation in progress (backend pivoted from Firebase to Supabase)
**Scope:** Per-lesson realtime chat inside the MA Learn player for BL and ITCAI (T2) courses.
**Related:** `docs/superpowers/specs/2026-04-23-dashboard-player-redesign-design.md` (redesign shipped).

> **⚠️ Backend pivot:** §4 (Architecture), §5 (Data model), §7 (Wipe), §12 (Setup), and parts of §15 reference Firebase. **§16 supersedes these with Supabase equivalents** after Google Cloud in KSA required contracting through the CNTXT reseller (weeks of paperwork incompatible with Harvest 22 timeline). Design intent (§1–3, §6, §8–11) is unchanged. Read §16 as the authoritative backend architecture.

---

## 1 · Goal

Add a per-lesson realtime chat to the MA Learn player so paying students can discuss, ask questions, and see each other's insights while watching. Purpose is part async Q&A, part live chat, part engagement wall. Majid participates directly as a visible, verified voice.

Non-goals in V1: live-streaming, social profiles, DMs, video/voice messages, AI assistant replies (v3/v4).

---

## 2 · Prerequisites (hard gate — do not start implementation until all met)

1. **Player + dashboard redesign fully landed and approved** per `2026-04-23-dashboard-player-redesign-design.md`:
   - Phase 1 (Foundation tokens) complete
   - Phase 2 (Shell) complete
   - Phase 3 (Dashboard pages) complete
   - Phase 4 (BL player) complete and in production
   - Phase 5 (ITCAI player) complete and in production
2. **Majid explicit sign-off** that the redesign is fully working across BL player, ITCAI player, and the dashboard.
3. **Short design review pass** on this spec against the new Editorial Atelier tokens and layout (~1 hour rework max) before the implementation plan is written.

Building before the redesign lands causes double-polish work and cross-system token drift. Explicit approval gate is owned by Majid.

---

## 3 · Requirements summary

Captured from brainstorming session on 2026-04-23.

- Per-lesson rooms, evergreen (not cohort-tied). T2 courses (BL, ITCAI) are recorded; T3 cohort students watching T2 gifts use the same rooms.
- Slack-channel feel: async Q&A + live realtime + engagement wall in one view. Not a social platform.
- Majid participates as a verified voice (`isMajid: true`). Visually distinct in the UI.
- Students pick a display name on first message (one-time prompt). Stored per-user.
- Text + clickable links only. No images, voice, or video. Max 500 characters, max 3 URLs per message.
- Pinned messages survive the weekly wipe. Pins support an optional expiry date.
- Weekly wipe every Friday 02:00 Asia/Riyadh: ephemeral messages archived to a Google Sheet, then hard-deleted from Firestore.
- Daily 02:00 KSA pin-expiry sweep.
- In-player notifications only. No emails in V1. Unread badges on the lessons sidebar.
- `@mentions` with autocomplete. Majid always top of the list.
- Moderation by Majid inside the player (pin, soft delete, hard delete, ban, clear room). Firebase Console as fallback admin surface.
- Rate limits: 5/min, 30/hr, 200/day per user. Dup-message block within 30s. 3 URLs per message max.
- Telemetry (IP + session) written on every message for a future anti-piracy workstream — detection and alerting are not in V1 scope.

---

## 4 · Architecture & auth flow

```
Student opens player?token=XYZ&course=itcai
        ↓
player-watch.html sends token to Apps Script (existing validate_token call)
        ↓
Apps Script validate_token returns student record + (NEW) Firebase Custom Token
  signed with Firebase Admin private key, containing:
    { uid: <studentId>, displayName?, isMajid: false }
        ↓
Browser: signInWithCustomToken(firebaseToken)
        ↓
Firestore accepts reads/writes per security rules:
  • Any authed user: read messages in any lesson room
  • Write message: only where author.uid == auth.uid AND rate limits hold
  • Pin / delete / ban / clear room: only if auth.token.isMajid == true
```

**Key decisions:**

1. Apps Script remains the source of truth for "who paid." Firestore trusts the signed token; it never checks purchase state on its own.
2. Custom tokens expire in 1 hour. Player auto-refreshes silently while the tab is open.
3. Majid signs in from a whitelisted email (`majid@malearnsa.com`). That session mints a token with `isMajid: true`, which is what unlocks admin actions in the security rules.
4. First-ever message triggers a one-time modal: *"اختر اسمًا يراه الآخرون في النقاش"* → saved to `users/{uid}.displayName` → never asked again.
5. No new server. Apps Script = one new function (`mintFirebaseToken`). Player = static HTML with Firebase JS SDK. Firestore + Cloud Functions + Cloud Scheduler.

---

## 5 · Data model (Firestore)

```
users/{uid}
  displayName: string                    # set on first message
  email: string                          # private, not shown in UI
  isMajid: boolean
  createdAt: timestamp
  lastSeen: {                            # drives unread badges
    "<lessonId>": number,                # messageCount at last view
    ...
  }

rooms/{lessonId}
  courseId: string                       # "itcai" | "bl"
  lastMessageAt: timestamp
  messageCount: number                   # for unread math

rooms/{lessonId}/messages/{msgId}        # EPHEMERAL — wiped weekly
  authorUid: string
  authorDisplayName: string              # denormalized (immune to rename)
  isMajid: boolean
  body: string                           # text + links, ≤500 chars, ≤3 URLs
  mentions: string[]                     # array of mentioned uids
  createdAt: timestamp
  deleted: boolean                       # soft-delete flag
  ipHash: string                         # sha256(clientIp + salt) — anti-piracy telemetry
  userAgent: string                      # anti-piracy telemetry

rooms/{lessonId}/pins/{pinId}            # SURVIVES weekly wipe
  authorUid: string
  authorDisplayName: string
  body: string
  pinnedAt: timestamp
  pinnedBy: string                       # uid of the pinner (always Majid in V1)
  expiresAt: timestamp | null            # null = permanent; date = auto-unpin

reports/{reportId}                       # student-submitted reports
  msgId: string
  reporterUid: string
  roomId: string
  createdAt: timestamp
  resolved: boolean

banned_uids/{uid}
  bannedBy: string
  bannedAt: timestamp
  reason: string
  expiresAt: timestamp | null            # null = permanent

moderation_log/{actionId}                # audit trail
  action: "pin" | "soft_delete" | "hard_delete" | "ban" | "unban" | "clear_room"
  actorUid: string
  targetUid: string | null
  targetMsgId: string | null
  roomId: string | null
  reason: string | null
  timestamp: timestamp

archives/{YYYY-WW}                       # one per ISO week, metadata only
  weekStart: string                      # "2026-04-20"
  weekEnd: string                        # "2026-04-26"
  sheetUrl: string
  messageCount: number
  wipeCompletedAt: timestamp

wipe_errors/{timestamp}                  # only written on failure
  error: string
  stack: string
  retryCount: number

session_events/{eventId}                 # anti-piracy telemetry (opt-in hook)
  uid: string
  event: "sign_in" | "token_refresh"
  ipHash: string
  userAgent: string
  timestamp: timestamp
```

**Why denormalize `authorDisplayName` on messages:** a student who renames themselves next month keeps the original name on their historical posts. No cascading update cost.

**Why index `mentions: string[]`:** enables `messages where mentions array-contains myUid` queries for the "you were mentioned" badge logic.

---

## 6 · UX inside the player

### 6.1 Desktop layout

Chat lives inside the lesson body as a new tab, not in a second rail. Lessons sidebar (280px right rail in the redesign) is untouched.

```
┌────────────────────────────────────────────────┬──────────────────┐
│                                                │  MODULE 3        │
│            VIDEO (Bunny iframe 16:9)           │  ▸ Lesson 1 ✓    │
│                                                │  ● Lesson 2 ← ←  │
│                                                │  ▸ Lesson 3 ●2   │ ← unread dot
├────────────────────────────────────────────────┤                  │
│  [ الوصف ]  [ 💬 النقاش (٢) ]  [ 📌 مثبت ]      │  MODULE 4        │
│ ──gold hairline──────────────────────────────  │  (collapsed)     │
│                                                │                  │
│  Active tab scrolls independently              │                  │
│  (description | discussion | pinned)           │                  │
│                                                │                  │
│  Composer sticks to bottom of chat tab         │                  │
│                                                │                  │
└────────────────────────────────────────────────┴──────────────────┘
```

### 6.2 Mobile layout (primary experience)

```
┌─────────────────────────┐
│  ☰   MA Learn        ●  │  ← hamburger opens lessons sidebar
├─────────────────────────┤
│      VIDEO (16:9)       │  ← sticky top when scrolling
├─────────────────────────┤
│ [الوصف] [💬 النقاش ٢] [📌]│  ← segmented tabs
├─────────────────────────┤
│                         │
│  Active tab scrolls     │
│                         │
├─────────────────────────┤
│ [ اكتب رسالة... ]   →   │  ← sticky composer on discussion tab
└─────────────────────────┘
```

Mobile-specific behavior:
- Video sticks to top while tab content scrolls below.
- Composer pins to viewport bottom on the discussion tab. When focused, the keyboard pushes the composer up and the video shrinks to a floating mini-player (YouTube-style).
- Lessons sidebar stays behind the hamburger. Picking a new lesson auto-closes the sidebar and auto-opens the discussion tab.
- Hamburger gets a red dot when any other lesson has unread activity.
- Thumb-zone: tab bar directly under the video, composer at the bottom. No reach-to-top gestures.

### 6.3 Defaults

- Default active tab on lesson open = last tab the student used in any lesson. Zero settings.
- Unread dot on a lesson clears 2 seconds after opening that lesson.
- First message in a student's history triggers the display-name modal. Never asked again.

### 6.4 Message row anatomy

- **Student:** neutral-colored display name, message body, relative time (*"قبل ٣ دقائق"*).
- **Majid:** gold-accent name + ✓ badge, subtle gold-tinted background so his answers are scannable at a glance.
- **Deleted message:** `[تم حذف الرسالة]` placeholder. Preserves thread context.
- **Your own mention:** gold left-border accent on the message row + one-time toast on lesson open (*"تم ذكرك في رسالتين"*).
- **Arabic/RTL:** `dir="auto"` on every message body. Pure-Arabic, pure-English, and mixed-language messages all render correctly without per-user settings.

### 6.5 Composer

- Textarea, auto-grows. `Enter` sends. `Shift+Enter` inserts newline.
- 500-character cap (hard), 3-URL cap (soft — exceed = inline error).
- `@` triggers autocomplete dropdown under cursor (see 6.6).
- Paste detection: URLs are auto-detected and counted against the URL cap.
- Links stay as plain clickable `<a>` tags. No rich preview.

### 6.6 @mentions

- Type `@` → inline autocomplete appears under the cursor.
- Dropdown source, in order:
  1. **Majid** — always top, bolded, ✓ badge.
  2. Students who posted in this room in the last 7 days (cached in memory from the onSnapshot listener).
  3. Fuzzy-match fallback against `users/` if no match in room.
- Select → `@DisplayName` chip inserted visually. `uid` stored in `mentions[]` array separately so renames don't break the link.
- Rendering: `@DisplayName` highlighted with small gold-tinted background in the rendered message body.
- Mentioning yourself is a no-op (removed from `mentions[]` on send).

### 6.7 Notifications

- **Unread badge** on each lesson in the sidebar: red dot + delta count when `rooms/{lessonId}.messageCount > users/{uid}.lastSeen[lessonId]`. The displayed count is the delta. On lesson open (after a 2-second dwell), `lastSeen[lessonId]` is written with the current `room.messageCount` and the dot clears.
- **Mention marker** separate from unread: `@` symbol next to the lesson title. Cleared on lesson open.
- **Hamburger dot** on mobile when any non-current lesson has unread activity.
- **No emails. No push.** V2 adds a weekly digest if volume warrants.

### 6.8 Empty state

*"كن أول من يشارك فكرة أو سؤال في هذا الدرس."* No fake avatars, no prompts to "join the conversation."

---

## 7 · Weekly wipe + archive

### 7.1 Schedule

- **Weekly wipe:** every Friday 02:00 Asia/Riyadh. Friday is a locked zero-work day through Oct 1, 2am is the deadest window.
- **Daily pin-expiry sweep:** every day 02:00 Asia/Riyadh. On Fridays, this runs first, then the weekly wipe runs.

Both implemented as Firebase Cloud Functions triggered by Cloud Scheduler.

### 7.2 What gets wiped

- `rooms/{lessonId}/messages/*` — hard deleted after archive success.
- `users/{uid}.lastSeen` — all per-lesson entries reset to `0` so unread counts zero out for everyone after the wipe (since `room.messageCount` also resets to `0`).

### 7.3 What survives

- `rooms/{lessonId}/pins/*` — preserved unless `expiresAt < now()`.
- `users/{uid}` — display names, uid mapping, all preserved.
- `rooms/{lessonId}` metadata — `messageCount` resets to 0, other fields preserved.
- `moderation_log/*`, `archives/*`, `banned_uids/*` — append-only, never wiped.

### 7.4 Pin expiry

The daily 02:00 KSA sweep:
1. Query `rooms/*/pins/` where `expiresAt != null AND expiresAt < now()`.
2. Delete matching pins outright. Not moved to messages — they were pins, not chat.

### 7.5 Archive destination

One master Google Sheet titled **"MA Learn — Chat Archive"**, bookmarked by Majid, shared with the Firebase service account for write access.

Schema: one tab per ISO week, named `YYYY-WW` (e.g. `2026-W17` = week of Apr 20–26).

Columns:

```
timestamp_utc | timestamp_ksa | course_id | lesson_id | lesson_title |
author_display_name | author_uid | is_majid | deleted_flag | body | mentions
```

- `lesson_title` denormalized from the Lessons sheet at wipe time (one extra Apps Script call per wipe job) so the archive is grep-able without a join.
- `mentions` serialized as comma-separated uids.
- `author_uid` preserved to enable anti-piracy analysis and AI training downstream.

### 7.6 Archive-then-delete algorithm (non-negotiable order)

```
1. wipeStartTime = now()
2. Query all messages where createdAt < wipeStartTime
3. Append rows to this week's sheet tab
4. Verify sheet row count matches query count  ← safety gate
5. Batch-delete the exact queried doc IDs from Firestore
6. Write archives/{YYYY-WW} metadata doc
```

If step 4 fails, nothing gets deleted. Retry next day.

Messages created after `wipeStartTime` (during the wipe itself) are untouched and roll into the next wipe.

### 7.7 Failure handling

- Archive write failure → messages stay, `wipe_errors/{timestamp}` row written, Noor pushes a Telegram alert to Majid (`"Chat wipe failed: <reason>. Manual retry needed."`).
- Partial delete → on next run, detect "createdAt < last wipe timestamp still exists" and clean up.

### 7.8 Majid's view

- One bookmarked Google Sheet.
- Each Friday morning, a new tab appears.
- One-line Telegram summary from Noor: *"Chat wipe complete. 284 messages archived across 18 lessons. Sheet: [link]"*.

---

## 8 · Moderation + rate limits

### 8.1 Majid's powers (inside the player, when `isMajid: true`)

Hover (desktop) or long-press (mobile) any message → menu:

1. **Pin** — optional expiry date picker. `expiresAt: null` = permanent.
2. **Delete (soft)** — sets `deleted: true`. Shows `[تم حذف الرسالة]` placeholder.
3. **Delete (hard)** — removes the doc. Confirmation modal required.
4. **Ban author** — writes `banned_uids/{uid}` doc. Silent ban: they can still read but cannot post.
5. **Clear room** — wipes all messages in the current lesson immediately. Confirmation modal required.

All actions append to `moderation_log/`.

**Firebase Console** is the free admin fallback for anything rare. No dedicated dashboard in V1.

### 8.2 Student powers

- **Edit own message:** within 2 minutes of posting (typo fix window). After that, immutable.
- **Delete own message:** within 5 minutes of posting. After that, only Majid can remove.
- **Report a message:** writes `reports/{reportId}`. Does not auto-hide. Majid sees a small 🚩 on reported messages and can delete or dismiss.

### 8.3 Rate limits (Firestore security rules)

- **5 messages / minute / user** — hard.
- **30 messages / hour / user** — hard.
- **200 messages / day / user** — hard sanity cap.
- **No duplicate body in the same room within 30 seconds.**
- **Max 500 characters per message.**
- **Max 3 URLs per message.**

Exceeding any of these → write rejected by security rules. Client shows inline toast: *"أنت ترسل بسرعة. استرح لحظة."*

### 8.4 Ban behavior

- Default: silent ban (user reads normally, cannot post, sees inline *"لا يمكنك المشاركة في هذه الدردشة. تواصل مع الدعم."* on send attempt).
- Optional: temporary ban with `expiresAt`. Auto-lifted by the daily job.
- Permanent ban = `expiresAt: null`.

### 8.5 Profanity / auto-moderation

Deferred to V2. Human moderation handles V1 volume. Revisit if chat crosses ~500 messages/day.

---

## 9 · Anti-piracy telemetry (V1 hooks only, no detection)

Every message write logs `ipHash` (sha256 of client IP + salt) and `userAgent`. Every Firebase Auth sign-in writes a `session_events/` row. These are strictly for a **future** anti-piracy workstream; V1 does not query them, does not alert on them, does not block any user based on them.

**What this enables later:**

1. **Concurrent session detection** — one uid authed from distant IPs within minutes.
2. **IP fingerprinting per uid** — normal = 1–3 IPs (home, office, phone); anomaly = 7+ IPs in a week.
3. **Social friction** — a public display name means shared-token users impersonate the buyer in chat, which self-deters most sharing.

Caveats: VPN defeats IP signals; same-household WiFi is indistinguishable from the buyer; determined pirates who never chat remain undetectable via this surface.

**V1 task:** capture the data. **Future workstream:** analyze + alert. Separate spec when greenlit.

---

## 10 · V1 scope boundaries

### 10.1 In V1

- Firebase project + Firestore + Firebase Auth + Cloud Functions + Cloud Scheduler
- Apps Script: `mintFirebaseToken` function + stored service-account key
- Player UI: tabbed lesson body (Description / Discussion / Pinned) on the new redesign tokens
- First-message display-name modal
- Message composer with 500-char / 3-URL caps, Enter-to-send, Shift+Enter newline
- Realtime message list via Firestore `onSnapshot`
- `@mentions` with autocomplete (Majid first, then recent room authors, then fuzzy fallback)
- Unread badges + mention markers on the lessons sidebar
- Mobile sticky video + sticky composer + auto-close sidebar + floating mini-player on keyboard focus
- Majid moderation menu (pin with expiry, soft/hard delete, ban, clear room)
- Student powers: edit (2 min), delete (5 min), report
- Silent ban with optional expiry
- Rate limits + no-dup + URL cap enforced server-side in security rules
- Audit log (`moderation_log`) + wipe errors (`wipe_errors`)
- Weekly wipe + archive to Google Sheet + daily pin-expiry sweep
- Noor Telegram alert on wipe success and failure
- Anti-piracy telemetry (ipHash + userAgent on every message, session events on every auth)

### 10.2 NOT in V1

- Weekly email digest
- Instant email-on-reply notifications
- Image, voice, video messages
- Threading / replies to specific messages
- Reactions / emoji on messages
- Profanity auto-moderation
- AI assistant answering questions (v3/v4)
- Anti-piracy detection jobs and alerting (telemetry only — analysis is separate spec)
- Dedicated admin dashboard (Firebase Console is enough for V1)
- Web push / browser notifications
- Message search
- Presence ("who's online now")
- DMs between students

### 10.3 Future hooks baked in

| Future feature | What unlocks it |
|---|---|
| v3/v4 AI assistant | Weekly archive sheet + `moderation_log` = training corpus. Add `isAI: true` author type. |
| Anti-piracy workstream | `ipHash` + `session_events` already captured. New Cloud Function reads them. |
| Weekly digest email | Same data the wipe job touches. New Cloud Function, no schema change. |
| Profanity filter | Drop-in Cloud Function on message write. No client change. |
| Dedicated admin dashboard | All moderation APIs already exist. UI layer only. |
| Reactions | Add `reactions/{emoji}: string[]` subcollection under messages. |

---

## 11 · Cost model

### 11.1 Firebase free tier

- 50,000 reads / day
- 20,000 writes / day
- 1 GB stored
- 10 GB network egress / month
- 50,000 monthly active auth users

### 11.2 Realistic MA Learn usage (100 active students / day, 2 messages each, 8 rooms opened each)

- Reads: ~15,000/day (30% of cap)
- Writes: ~200/day (1% of cap)
- Storage: ~280 KB/week (auto-wiped, never grows)
- Egress: <100 MB/month

**Monthly cost: $0.**

### 11.3 At 10× scale (1,000 active students / day)

- Reads: ~150,000/day → over free tier
- Blended rate: ~$0.06 per 100K reads
- **Monthly cost: $2–5.**

### 11.4 Other Google services

- Cloud Scheduler: free for first 3 jobs (V1 uses 2)
- Cloud Functions: 2M invocations/month free (V1 uses ~40/month)
- Firebase Auth: 50K MAU free

**Ceiling at 10× scale: under $10/month** — less than a single T1 pack sale.

---

## 12 · One-time setup (when implementation starts)

1. Create Firebase project (free).
2. Enable Firestore, Firebase Auth (Custom Token sign-in), Cloud Functions, Cloud Scheduler.
3. Generate Firebase Admin service account key. Store encrypted in Apps Script Properties.
4. Create master "MA Learn — Chat Archive" Google Sheet, share with the service account email.
5. Deploy Firestore security rules (author-uid enforcement + rate limits + isMajid gates).
6. Deploy Cloud Functions (wipe job, pin-expiry job, Noor alert webhook).
7. Configure Cloud Scheduler (Friday 02:00 KSA weekly wipe, daily 02:00 KSA pin sweep).
8. Deploy updated `watch-updated.html` (and BL equivalent) with Firebase JS SDK + chat UI.
9. Smoke test on staging (both BL and ITCAI).
10. Migrate to production.

Total setup effort: 2–3 hours once the redesign is done. No recurring cost at current scale.

---

## 13 · Open questions / deferred decisions

None blocking V1. Items deferred to future iteration (re-review before writing the implementation plan):

1. Whether `ipHash` salt lives in Firestore (queryable) or Cloud Functions env (more secure). Decide in plan phase.
2. Whether the archive sheet is one master sheet (V1 default) or one sheet per course. V1 default is master; revisit if volume merits splitting.
3. Whether the AI assistant (v3/v4) lives as a distinct `authorType` or reuses the `isMajid` flag with a `isAI` sub-flag. Decide when v3/v4 is scoped.

---

## 14 · Implementation phases (outline — detailed plan comes in writing-plans skill)

**Prerequisite gate:** redesign Phases 1–5 complete, Majid signed off.

**Phase A — Backend foundation.** Firebase project + security rules + Firestore schema + `mintFirebaseToken` in Apps Script.

**Phase B — Core player UI.** Tabbed body + realtime messages + composer + display-name modal + Majid moderation menu. Staging only.

**Phase C — @mentions + unread badges + mobile polish.** Autocomplete + mention rendering + mention markers + sticky mobile composer + mini-player on keyboard focus.

**Phase D — Wipe + archive.** Cloud Functions + Cloud Scheduler + Google Sheet writes + Noor alert integration.

**Phase E — Anti-piracy telemetry.** `ipHash` + `session_events` capture, no detection logic.

**Phase F — Production rollout.** BL player first, 48-hour soak, then ITCAI player.

Detailed breakdown (task list, files, tests) lands in the implementation plan document after this spec is approved.

---

## 15 · Post-redesign review notes (2026-04-23 pre-plan pass)

Confirmed the Editorial Atelier redesign has shipped (Phases 1–5 merged on the player and dashboard repos). Majid signed off. Findings that update implementation surface without changing the V1 design intent:

### 15.1 Live repo + path (source of truth)

| Live URL | Repo | Local path | Role |
|---|---|---|---|
| `player.malearnsa.com/watch.html` | `Majidangawi/malearnsa-player` | `~/code/malearnsa-player/watch.html` | THE production player for BL + ITCAI (course via query param) |
| `admin-staging.malearnsa.com` | `Majidangawi/ma-learn-dashboard` | `~/code/ma-learn-dashboard/` | Dashboard (Majid's admin surface — separate repo) |

**Critical:** `projects/ma-learn-launch/player-watch.html` and `watch-updated.html` in the MA EA workspace are stale working copies. Implementation MUST target `~/code/malearnsa-player/watch.html`. Do not edit the MA EA copies.

### 15.2 Tokens in use (use these, not any new vars)

Canonical tokens file: `~/code/malearnsa-player/css/tokens.css`. All chat UI must consume these variables only.

- Gold: `--c-gold`, `--c-gold-bright`, `--c-gold-dim`, `--c-gold-faint`
- Surfaces: `--c-ink-0` (page bg) through `--c-ink-5` (accented borders)
- Text: `--c-fg`, `--c-fg-2`, `--c-fg-3`, `--c-fg-4`
- Semantic with matched backgrounds: `--c-success`/`--c-success-bg`, `--c-warning`/`--c-warning-bg`, `--c-danger`/`--c-danger-bg`
- Spacing: `--s-1` (4px) through `--s-8` (64px); `--s-page-x` for gutters
- Radius: `--r-xs/sm/md/lg/xl/pill`
- Elevation: `--e-card`, `--e-raised`, `--e-modal`, `--e-focus`
- Motion: `--dur-fast/med/slow`, `--ease-out`, `--ease-in`
- Typography: `--font-sans` (Cairo), `--font-display` (Gumela Arabic), `--fs-label/body-sm/body/h3/h2/h1/display-l/display-xl`

### 15.3 Sidebar width correction

Spec §6.1 referenced "280px right rail". Actual value: `--sidebar-w: 320px`. Implementation follows the live token; spec narrative remains valid.

### 15.4 Primitives already available (reuse, don't re-style)

At `~/code/malearnsa-player/css/primitives.css`, consumed via `[data-ui]` attributes. Page CSS never restyles primitives.

- `btn` — variants: `primary`, `secondary`, `ghost`, `danger`; sizes: default, `sm`; modifier `data-icon-only`
- `input` / `textarea` / `select`
- `field` (label + input wrapper with error state)
- `card`
- `tag` — tones: default, `gold`, `success`, `warning`, `danger`
- `avatar` — default 28px, `data-size="lg"` = 40px
- `hairline` (0.5px gold-dim editorial rule)
- Plus: `toggle`, `toast`, `loader` (Gumela gold loader)

### 15.5 Primitives MISSING — must be added as part of chat plan

These don't exist yet and are needed by V1 chat. The plan must add them to `~/code/malearnsa-player/css/primitives/` and import from `primitives.css`:

- **`tabs`** — for the lesson body tab switcher (Description / Discussion / Pinned). Editorial Atelier variant: 12/500 caps labels, 2px gold underline bar transitions between active tabs via `transform: translateX()`, no layout shift. `--c-fg-2` labels → `--c-fg` on active.
- **`modal`** — for display-name modal, hard-delete confirmation, ban confirmation, clear-room confirmation.
- **`dropdown` / `menu`** — reused for both (a) moderation action menu on long-press/hover of a message and (b) `@mention` autocomplete under the composer cursor. 10px radius, `--e-raised`, 8px padding, items 32h with hover `--c-ink-3`.

### 15.6 Current lesson body structure (target for tab refactor)

In `~/code/malearnsa-player/watch.html`, the `<main class="main">` contains `<div class="lesson-info">` which wraps:

```
lesson-module-tag → lesson-title → lesson-desc → lesson-content (#lesson-content) →
pdf-area (#pdf-area) → lesson-nav → <aside class="player-notes" hidden>
```

The chat plan wraps `lesson-title` through `lesson-nav` inside a new **`[data-ui="tabs"]`** container with three panels:

1. **الوصف (Description)** — the existing block, moved into the first tab panel unchanged
2. **النقاش (Discussion)** — new chat panel
3. **مثبت (Pinned)** — new pinned messages panel

The `<aside class="player-notes" hidden>` V2 slot is **reserved for future note-taking and must NOT be repurposed for chat.** Keep the tabs separate from it.

### 15.7 V2 affordances already shipped — do not disturb

Per `~/code/malearnsa-player/watch.html` recent commits (`ca83c3e feat(player): V2 affordances`):

- `data-progress` attribute on each lesson row
- `<aside class="player-notes" hidden>` slot
- Bookmark icon slot in the topbar (hidden in V1)
- `resume-from` query param passively respected

Chat implementation must not collide with or rename any of these.

### 15.8 Fonts + SDK loading

- Cairo loaded via Google Fonts (weights 200, 300, 400, 500, 600, 700 already linked in watch.html head).
- Gumela Arabic loaded via `@font-face` in `tokens.css`.
- Firebase JS SDK not yet present. Chat plan adds ES module imports:
  `firebase/app`, `firebase/auth`, `firebase/firestore` — from `gstatic.com/firebasejs/` CDN, versioned.

### 15.9 Apps Script token-validator is the auth anchor

Per CLAUDE.md local overrides and memory `reference_apps_script_ids.md`, the token-validator Apps Script is the live auth surface. `mintFirebaseToken` is a new function added to that same Apps Script project (scriptId already canonical — do not trust `.clasp.json` blindly per `feedback_verify_clasp_before_push.md`; verify before push).

### 15.10 Summary of drift vs original spec

| Spec reference | Original | Corrected |
|---|---|---|
| Player file | `watch-updated.html` in MA EA workspace | `~/code/malearnsa-player/watch.html` (live source) |
| Sidebar width | 280px | 320px (`--sidebar-w`) |
| Colors | Cairo-era hex | OKLCH tokens (`--c-*`) |
| Live URL | (unstated) | `player.malearnsa.com` |
| Primitives | (unstated) | Reuse `btn/input/tag/avatar/hairline/toast/loader/toggle`; add `tabs/modal/dropdown` |

Design intent (tabs inside lesson body, chat UX, data model, wipe flow, moderation, @mentions, cost model) is **unchanged and confirmed valid against the new token system.** Implementation plan proceeds with updated file paths + token names.

---

## 16 · Supabase pivot (2026-04-24 — supersedes Firebase in §4, §5, §7, §12, §15.1/.8/.9)

### 16.1 Why the pivot

On 2026-04-24, attempting to upgrade the Firebase project to Blaze plan triggered Google Cloud's **KSA reseller redirect**: all GCP customers with Saudi billing addresses must contract through **CNTXT** (Google's exclusive KSA reseller). This adds 1–3 weeks of contract setup, unknown minimums, and non-self-service billing — incompatible with the Harvest 22 timeline.

Supabase accepts direct credit-card billing with the same $0 cost at MA Learn's scale. It was Option B in the brainstorming round (§3 of spec). The KSA blocker tips the tech-choice balance decisively.

**Cost impact:** none. Supabase Free tier (500 MB DB, 50K MAU, 2 GB bandwidth, 200 concurrent realtime, unlimited API) covers MA Learn indefinitely at current scale. Pro tier at $25/mo remains well under the spec §11 ceiling.

**Design intent unchanged:** every decision from §1–11 (UX, moderation, wipe, @mentions, cost envelope, rollout order) stands. Only the backend fabric swaps.

### 16.2 Translation table

| Firebase reference (§4–§15) | Supabase equivalent (authoritative) |
|---|---|
| Firestore (NoSQL) | Postgres (SQL) via PostgREST |
| Firestore security rules | Postgres **Row-Level Security (RLS)** policies |
| Firebase Auth custom tokens (RS256 + service account) | Supabase-compatible JWT (**HS256** signed with project JWT Secret in Apps Script) |
| `onSnapshot` listeners | **Supabase Realtime** channels (`postgres_changes` events) |
| Cloud Functions + Cloud Scheduler | **Supabase Edge Functions** + **`pg_cron`** |
| Firebase Admin SDK | Postgres **`service_role`** key (server-side Edge Functions only) |
| Firebase Console | **Supabase Studio** (`https://supabase.com/dashboard/project/rmefydapbrirzgmmbyxx`) |
| Firebase CLI | **Supabase CLI** (`brew install supabase/tap/supabase`) |
| `~/code/malearn-chat/` (Firebase project dir) | `~/code/malearn-chat/` (now holds `supabase/` instead of `firestore.rules` + `functions/`) |

### 16.3 Project coordinates

- **Project ref:** `rmefydapbrirzgmmbyxx`
- **URL:** `https://rmefydapbrirzgmmbyxx.supabase.co`
- **Region:** Frankfurt (`eu-central-1`) — matches Bunny video library region for KSA+EU latency balance
- **Plan:** Free (no billing account required to start)
- **Owner:** `Majidangawi` GitHub account via org `MA Learn`
- **Credentials memory:** `reference_supabase.md` — anon key (public), JWT Secret (Apps Script only)

### 16.4 Architecture & auth flow (supersedes §4)

```
Student opens player?token=XYZ&course=itcai
        ↓
player-watch.html sends token to Apps Script (existing validate_token call)
        ↓
Apps Script validate_token returns student record + (NEW) Supabase-compatible JWT
  signed HS256 with the project JWT Secret, payload:
    {
      sub: <uid>,
      aud: 'authenticated',
      role: 'authenticated',
      email: <email>,
      iss: 'supabase',
      iat: <now>,
      exp: <now + 3600>,
      app_metadata: { isMajid: <bool>, provider: 'ma-learn' },
      user_metadata: { displayName: <name|null> }
    }
        ↓
Browser: supabase.auth.setSession({ access_token: jwt, refresh_token: jwt })
        ↓
Postgres accepts reads/writes per RLS policies:
  • authenticated users → read any message in any room
  • write message where author_uid == auth.uid() AND rate limits + body caps hold
  • pin / hard-delete / ban / clear room → only if (auth.jwt()->'app_metadata'->>'isMajid')::boolean
```

**Key invariants from §4 preserved:**
1. Apps Script remains source of truth for "who paid" — Supabase trusts the signed JWT; never checks purchase state.
2. Tokens expire in 1 hour. Player re-calls the Apps Script endpoint silently to refresh.
3. Majid whitelisted by email in Apps Script → mints JWT with `app_metadata.isMajid: true`.
4. First-message display-name modal still writes to the `users` row on first send.
5. No new server. Apps Script = one new function (`mintSupabaseToken_`, HS256). Player = static HTML with Supabase JS SDK.

**Why HS256 (vs Firebase's RS256):** simpler for Apps Script — no RSA private key management, no public-key distribution. The JWT Secret is a symmetric string; Apps Script signs, Supabase verifies with the same secret. The Secret lives only in Apps Script Script Properties (same security envelope as the Firebase service-account key would have had).

### 16.5 Data model (supersedes §5)

Same concepts; Postgres tables instead of Firestore collections. Migration lives at `supabase/migrations/0001_chat_schema.sql` (plan Task 3).

```sql
-- users: one row per paid student (keyed by uid = hash of email)
create table users (
  uid text primary key,
  email text not null,
  display_name text,
  is_majid boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen jsonb not null default '{}'::jsonb  -- { "<lessonId>": <messageCount at last view>, ... }
);

-- rooms: one row per lesson (evergreen)
create table rooms (
  lesson_id text primary key,
  course_id text not null,
  lesson_title text,
  message_count integer not null default 0,
  last_message_at timestamptz
);

-- messages: ephemeral, wiped weekly
create table messages (
  id uuid primary key default gen_random_uuid(),
  lesson_id text not null references rooms(lesson_id) on delete cascade,
  author_uid text not null references users(uid),
  author_display_name text not null,
  is_majid boolean not null default false,
  body text not null check (char_length(body) between 1 and 500),
  mentions text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  deleted boolean not null default false,
  ip_hash text,
  user_agent text
);
create index messages_lesson_created_idx on messages(lesson_id, created_at);
create index messages_mentions_gin on messages using gin(mentions);

-- pins: survives weekly wipe
create table pins (
  id uuid primary key default gen_random_uuid(),
  lesson_id text not null references rooms(lesson_id) on delete cascade,
  author_uid text not null,
  author_display_name text not null,
  body text not null,
  pinned_at timestamptz not null default now(),
  pinned_by text not null,
  expires_at timestamptz  -- null = permanent
);

-- banned users: silent bans
create table banned_uids (
  uid text primary key,
  banned_by text not null,
  banned_at timestamptz not null default now(),
  reason text,
  expires_at timestamptz  -- null = permanent
);

-- student-submitted reports
create table reports (
  id uuid primary key default gen_random_uuid(),
  msg_id uuid not null,
  reporter_uid text not null,
  room_id text not null,
  created_at timestamptz not null default now(),
  resolved boolean not null default false
);

-- audit log (append-only)
create table moderation_log (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('pin','unpin','soft_delete','hard_delete','ban','unban','clear_room')),
  actor_uid text not null,
  target_uid text,
  target_msg_id uuid,
  room_id text,
  reason text,
  timestamp timestamptz not null default now()
);

-- weekly archive metadata
create table archives (
  week_tag text primary key,      -- "2026-W17"
  week_start date not null,
  week_end date not null,
  sheet_url text not null,
  message_count integer not null,
  wipe_completed_at timestamptz not null
);

-- wipe failures
create table wipe_errors (
  id uuid primary key default gen_random_uuid(),
  error text not null,
  stack text,
  retry_count integer not null default 0,
  occurred_at timestamptz not null default now()
);

-- anti-piracy telemetry (populated V1, queried V2+)
create table session_events (
  id uuid primary key default gen_random_uuid(),
  uid text not null,
  event text not null check (event in ('sign_in','token_refresh')),
  ip_hash text,
  user_agent text,
  timestamp timestamptz not null default now()
);

-- rate limit state (Task 25.5 from plan Appendix B.1)
create table rate_state (
  uid text primary key,
  minute_bucket timestamptz not null,
  minute_count integer not null default 0,
  hour_bucket timestamptz not null,
  hour_count integer not null default 0,
  day_bucket timestamptz not null,
  day_count integer not null default 0,
  last_body text,
  last_body_at timestamptz
);
```

RLS is enabled on every table (project setting "Enable automatic RLS" was turned on at project creation).

**Notes carried from §5 unchanged:**
- `author_display_name` denormalized on messages — rename doesn't cascade.
- `mentions array-contains my_uid` query via GIN index for "mentioned me" feature.
- `last_seen` is a JSONB map `{ lessonId: messageCount at last view }` — unread count = `room.message_count - last_seen[lessonId]`.

### 16.6 Key RLS policies (enforce spec §8)

```sql
-- Helper: is current JWT Majid?
create or replace function public.is_majid() returns boolean
language sql stable as $$
  select coalesce((auth.jwt()->'app_metadata'->>'isMajid')::boolean, false);
$$;

-- Helper: is the current user banned?
create or replace function public.is_banned() returns boolean
language sql stable as $$
  select exists (
    select 1 from banned_uids
    where uid = auth.uid()
      and (expires_at is null or expires_at > now())
  );
$$;

-- messages: everyone authed reads; self-writes; Majid moderates
alter table messages enable row level security;

create policy messages_read on messages for select
  using (auth.role() = 'authenticated');

create policy messages_insert_self on messages for insert
  with check (
    auth.role() = 'authenticated'
    and author_uid = auth.uid()
    and is_majid = public.is_majid()
    and not public.is_banned()
    and deleted = false
  );

create policy messages_self_soft_delete on messages for update
  using (author_uid = auth.uid())
  with check (
    deleted = true
    and created_at > now() - interval '5 minutes'
  );

create policy messages_self_edit on messages for update
  using (author_uid = auth.uid())
  with check (
    created_at > now() - interval '2 minutes'
    and char_length(body) <= 500
  );

create policy messages_majid_moderate on messages for update
  using (public.is_majid());

create policy messages_majid_hard_delete on messages for delete
  using (public.is_majid());

-- pins: authed read; Majid write/delete
alter table pins enable row level security;
create policy pins_read on pins for select using (auth.role() = 'authenticated');
create policy pins_majid_all on pins for all using (public.is_majid()) with check (public.is_majid());

-- banned_uids: self read; Majid write
alter table banned_uids enable row level security;
create policy banned_self_read on banned_uids for select using (uid = auth.uid() or public.is_majid());
create policy banned_majid_write on banned_uids for all using (public.is_majid()) with check (public.is_majid());

-- users: self read/write; cannot claim isMajid
alter table users enable row level security;
create policy users_self_read on users for select using (uid = auth.uid() or public.is_majid());
create policy users_self_insert on users for insert
  with check (uid = auth.uid() and is_majid = public.is_majid());
create policy users_self_update on users for update
  using (uid = auth.uid())
  with check (is_majid = (select is_majid from users where uid = auth.uid()));

-- reports: self-create; Majid read
alter table reports enable row level security;
create policy reports_insert on reports for insert
  with check (reporter_uid = auth.uid());
create policy reports_majid_read on reports for select using (public.is_majid());

-- moderation_log: Majid only (and only append)
alter table moderation_log enable row level security;
create policy modlog_majid_read on moderation_log for select using (public.is_majid());
create policy modlog_majid_insert on moderation_log for insert
  with check (public.is_majid() and actor_uid = auth.uid());

-- session_events: self-create; Majid read
alter table session_events enable row level security;
create policy session_insert on session_events for insert with check (uid = auth.uid());
create policy session_majid_read on session_events for select using (public.is_majid());
```

### 16.7 Realtime subscriptions

Supabase Realtime exposes Postgres change feeds over WebSocket. Client:

```javascript
supabase
  .channel(`messages:${lessonId}`)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'messages', filter: `lesson_id=eq.${lessonId}` },
      (payload) => { /* handle INSERT/UPDATE/DELETE */ })
  .subscribe();
```

Equivalent to Firestore `onSnapshot`. Must enable Realtime on the `messages` and `pins` tables in Supabase Studio (one-click toggle per table).

### 16.8 Weekly wipe + daily pin-expiry (supersedes §7.1 runner; algorithm unchanged)

Implemented as:

- A Postgres function `public.weekly_wipe()` that collects message rows, calls a Supabase Edge Function via `net.http_post` to archive to Google Sheets, then deletes rows atomically (same archive-then-delete safety gate per §7.6).
- A Postgres function `public.pin_expiry_sweep()` that deletes pins where `expires_at < now()`.
- `pg_cron` extension schedules both:

```sql
create extension if not exists pg_cron;

select cron.schedule(
  'weekly-wipe',
  '0 2 * * 5',  -- Friday 02:00
  $$ select public.weekly_wipe() $$
) -- TIMEZONE handled at function level via at time zone 'Asia/Riyadh'
;

select cron.schedule(
  'daily-pin-expiry',
  '0 2 * * *',
  $$ select public.pin_expiry_sweep() $$
);
```

The Edge Function (`supabase/functions/archive-to-sheet/`) holds the Google Sheets service-account credentials and writes one tab per ISO week to the master archive sheet.

The Noor Telegram alert is a second Edge Function (`supabase/functions/noor-alert/`) called by `weekly_wipe()` on completion and on failure.

### 16.9 Setup checklist (supersedes §12)

1. ✅ Create Supabase project `malearn-chat` (done 2026-04-24).
2. Store `SUPABASE_JWT_SECRET` in Apps Script token-validator Script Properties (Majid pending).
3. Install Supabase CLI locally (`brew install supabase/tap/supabase`).
4. `cd ~/code/malearn-chat && supabase init && supabase link --project-ref rmefydapbrirzgmmbyxx`.
5. Write migration `supabase/migrations/0001_chat_schema.sql` (tables from §16.5 + RLS from §16.6). Apply: `supabase db push`.
6. Enable Realtime on `messages` and `pins` tables in Supabase Studio.
7. Write Edge Functions (`archive-to-sheet`, `noor-alert`). Deploy: `supabase functions deploy`.
8. Create `pg_cron` schedules.
9. Create master "MA Learn — Chat Archive" Google Sheet; share with the Edge Function's service account (generated in step 7).
10. Add `mintSupabaseToken_` function to token-validator Apps Script. `clasp push`.
11. Deploy updated player `watch.html` with Supabase JS SDK + chat UI.
12. Smoke test on staging then production.

Total setup: 2–3 hours (same as the Firebase estimate in §12). No recurring cost at current scale.

### 16.10 Plan reference

Full step-by-step implementation: `docs/superpowers/plans/2026-04-24-player-chat-supabase.md`. The Firebase-flavored plan at `docs/superpowers/plans/2026-04-23-player-chat.md` is archived (deprecation banner at top) but preserved for historical reference.
