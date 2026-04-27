# SOP — Bulk Email via Google Sheet + Apps Script

**Triggers:** "send a bulk email", "email the waitlist", "email all buyers", "blast the list", "send to everyone in [sheet/list/group]", or any variant that means sending a personalized email to multiple people.

**First established:** 2026-04-15 (waitlist blast for ورشة صناعة الإلهام)
**Template script:** `references/sops/bulk-email-template-script.js`

**Sub-SOPs (locked templates that reuse this flow):**
- [t3-cohort-3day-reminder.md](./t3-cohort-3day-reminder.md) — standard 3-day pre-cohort reminder for every T3 product. Subject + body locked 2026-04-27.

---

## The Method (always follow this exact flow)

1. **Get the recipient list in a Google Sheet**
   - If a sheet already exists → ask for the URL, read it via `mcp__google-sheets__sheets_read`, confirm columns
   - If no sheet exists → create one via `mcp__google-sheets__sheets_create` with the schema below
   - Never ask Majid to paste a list into the conversation — sheets are the source of truth

2. **Sheet schema (required)**

   | Col | Header (Arabic acceptable) | Purpose |
   |-----|---|---|
   | A | Timestamp / التاريخ والوقت | Optional — often auto-filled by a form |
   | B | Name / الاسم | **Required** — used for first-name personalization |
   | C | Email / البريد الإلكتروني | **Required** |
   | D | Phone / رقم الجوال | Optional |
   | E | Product / الدورة / الورشة | Optional — lets us segment |
   | F | **Sent Status** | **Reserved for the script** — auto-written as `SENT 2026-04-15 12:48` or `FAILED: …` |

   If the existing sheet has column F used for something else, pick the next free column and update `STATUS_COL` in the script.

3. **Draft the email copy with Majid**
   - Arabic (Saudi dialect), inspirational/mentor tone, per `.claude/rules/communication-style.md`
   - Show the copy in **plain text** first so Majid can edit
   - After approval, render as HTML and preview locally (Chrome) — he always wants to see it before send
   - Rebuild + reload preview on every edit round

4. **Apply the brand design template** (see "Email Design" section below)

5. **Build a standalone Apps Script project** from the template
   - Copy `references/sops/bulk-email-template-script.js`
   - Replace the 3 placeholders at the top: `SHEET_ID`, `SUBJECT`, `buildEmailHtml()` contents
   - Never modify the structure — the rate limiting, status tracking, re-run safety are all load-bearing
   - **Standalone project** (script.google.com → New project). Never sheet-bound — it may clash with existing form-submission scripts.

6. **Give Majid the exact run instructions:**
   1. Go to https://script.google.com → New project
   2. Delete default `Code.gs` → paste the script → save → name it
   3. Run `testSingleEmail` first → authorize Gmail + Sheets on first run → check test inbox
   4. Only when the test renders correctly: run `sendBulkBlast`
   5. Watch the Executions tab for per-row progress
   6. After done, optionally delete the project

7. **Safe re-runs for new signups**
   - `sendBulkBlast` skips any row where column F starts with `SENT`
   - So if 20 new people signup after the first blast, just click Run again → they get emails, everyone else is skipped
   - Same behavior for `FAILED: …` rows — re-running retries them

---

## Email Design (brand template)

Every bulk email must use this exact visual language — it's the MA Learn house style.

**Structure:**
- `<div dir="rtl">` wrapping everything
- `font-family: Arial, sans-serif` (Gmail-safe)
- `max-width: 600px`, `line-height: 1.8`
- `color: #222` default, `#444` for secondary text, `#888` for tertiary
- Personalized greeting: `السلام عليكم ورحمة الله وبركاته [firstName]،`
- One-line hook after the greeting (promise callback, exclusivity, warmth)
- Workshop/product name in `<span style="color:#C9A84C;">` (brand gold)

**The detail box pattern:**
```html
<div style="background:#f9f6f0;border-right:3px solid #C9A84C;padding:20px 24px;margin:28px 0;border-radius:4px;">
  <p style="margin:0 0 12px;font-weight:bold;color:#222;">تفاصيل [X]:</p>
  <p style="margin:6px 0;color:#444;">&#x1F4C5; <strong>التاريخ:</strong> ...</p>
  <p style="margin:6px 0;color:#444;">&#x1F556; <strong>الوقت:</strong> ...</p>
  <p style="margin:6px 0;color:#444;">&#x1F465; <strong>المقاعد:</strong> ...</p>
  <p style="margin:6px 0 0;color:#8a6f1e;font-weight:bold;">&#x1F4B0; <strong>الاستثمار:</strong> ...</p>
</div>
```

**The CTA button pattern:**
```html
<p style="text-align:center;margin:36px 0 28px;">
  <a href="[LANDING_PAGE_URL]"
     style="background:#C9A84C;color:#000;padding:16px 38px;text-decoration:none;font-weight:bold;font-size:1rem;display:inline-block;line-height:1.3;">
    [CTA_TEXT]<br>
    <span style="font-weight:400;font-size:0.82rem;">[optional sub-line]</span>
  </a>
</p>
```

**Always link to the landing page, never the checkout** — the landing is where the story sells.

**Sign-off pattern:**
```html
<hr style="border:none;border-top:1px solid #eee;margin:36px 0 24px;">
<p style="margin:0;">
  [context-appropriate closing],<br>
  <strong>ماجد عنقاوي</strong><br>
  <span style="color:#888;font-size:0.85rem;">صناعة الإلهام · MA Learn</span>
</p>
```

Common closings: "أشوفك في الورشة،", "ما لي أنتظر ردك،", "دمت على قلبي،" — match to the email's purpose.

---

## Technical Gotchas (non-negotiable — these are load-bearing)

1. **Never put 4-byte UTF-8 emojis in the email SUBJECT.**
   `GmailApp.sendEmail()`'s MIME subject encoder corrupts 4-byte chars like 🚀 🎁 📧 💡 — they render as `???` in Gmail. Use 3-byte BMP emojis only in subjects:
   - ✨ U+2728 (sparkles) — `%E2%9C%A8`
   - ★ U+2605 (star) — `%E2%98%85`
   - ⚡ U+26A1 (high voltage) — `%E2%9A%A1`
   - ❤ U+2764 (heart) — `%E2%9D%A4`
   - Or no emoji at all.

2. **Always build the SUBJECT via `decodeURIComponent`.**
   Arabic characters can get corrupted on paste into the Apps Script editor depending on the clipboard path. URL-encoded ASCII source → UTF-8 at runtime is bulletproof.
   ```javascript
   const SUBJECT = decodeURIComponent('%D9%88...');
   ```
   To encode: `python3 -c "from urllib.parse import quote; print(quote('الموضوع هنا', safe='()..'))"`

3. **In the HTML body, use HTML numeric entities for emojis, not raw UTF-8.**
   - 📅 → `&#x1F4C5;`
   - 🕖 → `&#x1F556;`
   - 👥 → `&#x1F465;`
   - 💰 → `&#x1F4B0;`
   - 🎁 → `&#x1F381;`
   - 🚀 → `&#x1F680;`
   - ✅ → `&#x2705;`
   HTML entities are pure ASCII in the source, survive any paste, render as emojis in every email client.

4. **Use a STANDALONE Apps Script project** (script.google.com → New project), **never sheet-bound**. Sheet-bound scripts clash with existing form-submission handlers (e.g. the form-submission script on the waitlist sheet).

5. **Read the sheet via `SpreadsheetApp.openById(SHEET_ID)`**, not `getActiveSpreadsheet()` — the standalone script has no "active" sheet.

6. **Delay between sends: `Utilities.sleep(1200)`** — 1.2s keeps us well under Gmail's rate limits. Never remove this.

7. **Auto-add the "Sent Status" column header** on first run. Don't require Majid to set it up.

8. **Skip rows where F starts with `SENT`** (not equals — `indexOf('SENT') === 0`). This is what enables the re-run-for-new-signups flow.

9. **Test function first, always.** `testSingleEmail` sends only to `majed.engawi@gmail.com`. Never send to the list before the test looks perfect.

10. **Mirror the greeting logic from the template:** `السلام عليكم ورحمة الله وبركاته [firstName]،` if name present, or `السلام عليكم ورحمة الله وبركاته،` if blank. Extract first name with `fullName.split(/[\s,]+/)[0]` and capitalize Latin first-letters.

---

## Reference: Gmail Limits (real-world, hard-learned)

**Apps Script limits are NOT the same as Gmail web limits:**
- **Consumer @gmail.com Apps Script:** **100 sends/day** (not 500)
- **Workspace Apps Script:** **1500 sends/day** (not 2000)
- Quota resets at **midnight US Pacific** ≈ 10:00 AM Jeddah

**The ownership trap:** the limit is based on which account *owns the Apps Script project*, not which email the script sends *from*. If the project was originally created by `majed.engawi@gmail.com` (consumer), moving the send-alias to `info@malearnsa.com` (a Workspace alias) does NOT upgrade the quota — you still get 100/day.

**How to verify which account owns a script:**
- Open the Apps Script project
- Click "Overview" in left sidebar → look at "Owner" field
- If it's a @gmail.com address → 100/day ceiling
- If it's a Workspace address → 1500/day ceiling

**The fix (when you need to ship a big blast):**
1. **Preferred:** Move script ownership to a Workspace account. In the Apps Script editor → Settings → share → transfer ownership.
2. **Fallback:** Split across days. Run the blast today for the first 80 rows, set a time-based trigger to run again tomorrow 11am for the rest.
3. **Emergency:** Create a second Apps Script project under a DIFFERENT consumer account, share the sheet with that account as Editor, run the remaining sends. Note: `from:` alias won't work on consumer accounts — emails will send from that account's own address, which breaks brand consistency.

**Hard-learned on 2026-04-15:** the waitlist blast of 115 recipients hit the 100/day wall after ~59 sends because the script was running from a consumer-account-owned project. The quota bucket ALSO includes purchase confirmation emails, notification emails, tests, and any other Apps Script email operation on the same account — so your effective waitlist budget is `100 - (sends already used today)`.

**Always check remaining quota before a blast:**
```javascript
function checkEmailQuota() {
  Logger.log('Remaining daily email quota: ' + MailApp.getRemainingDailyQuota());
}
```
Run this first. If below the size of your intended blast, split or delay.

---

## Reference: First Use Case

This SOP was established during the **ورشة صناعة الإلهام waitlist early-access blast** on 2026-04-15 — 115 waitlist recipients, personalized first-name greeting, 24hr exclusive before the Instagram announcement.

The working reference implementation lives at `projects/ma-learn-launch/waitlist-blast-apps-script.js`. Treat the template script as the generic version and this file as the "example completed instance" of the template.
