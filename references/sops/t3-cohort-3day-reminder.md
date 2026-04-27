# SOP — T3 Cohort 3-Day Reminder Email

**Trigger:** Exactly 3 days before any T3 live cohort begins. Standard delivery touchpoint for every T3 cohort, every product.

**First established:** 2026-04-27 (T3 Cohort 1 — ورشة صناعة الإلهام)
**Locked by Majid:** copy + structure approved 2026-04-27.
**Send mechanism:** Reuse [bulk-email.md](./bulk-email.md) flow + `bulk-email-template-script.js`. Standalone Apps Script project, sheet-based recipient list, status column tracking.

---

## When to use

- **3 calendar days before Day 1.** If the cohort starts Thu, send Mon. If it starts Sat, send Wed.
- One send per cohort. Do not re-send daily — the message is the 3-day mark, not a countdown drumbeat.
- Rerunning the script is safe (skips rows marked `SENT`) — useful if anyone signs up between draft and blast.
- **Channel:** Email only. WhatsApp pin in the cohort group is a separate touchpoint owned by Majid (delivery surface per the channel-split rule: WhatsApp = paying-student groups, Email = delivery/reminders).

---

## What to gather before drafting

| Variable | Where it comes from |
|---|---|
| `[الاسم]` | Column B in recipient sheet (per [bulk-email.md](./bulk-email.md) schema) |
| Cohort name (Arabic) | Ask Majid — e.g. `ورشة صناعة الإلهام` |
| Cohort number | Arabic ordinal: `الدفعة الأولى` / `الدفعة الثانية` / etc. |
| Three session dates (Arabic numerals) | Locked at cohort sale; check Linear milestone or current-priorities |
| Three Google Meet links | Created by Majid before send; one per session — each session gets its own room |
| Time window | `٧:٠٠ – ١٠:٠٠ مساءً · بتوقيت جدة` (default for T3) — confirm with Majid if changed |
| Apps list | Cohort-specific — Majid provides. Format as `- App name` bullets. |
| Sender | `Majid <majid@malearnsa.com>` — never personal Gmail |
| Recipient sheet URL | T3 buyer list for that specific cohort. **Never email the waitlist as if they were buyers.** |

---

## Subject line — locked formula

```
جهز نفسك — [اسم الورشة] بعد ٣ أيام !
```

Example:
```
جهز نفسك — ورشة صناعة الإلهام بعد ٣ أيام !
```

Keep the warning mark (`!`) — it's part of the locked tone. Don't use `صباح الخير` or other corporate openers in the subject.

---

## Body — locked Arabic template (Saudi dialect)

Use exactly this structure. Replace placeholders in `[…]`. Don't reorder sections. Don't add a P.S. or upsell — this is a delivery message, not a sales touch.

```
السلام عليكم ورحمة الله وبركاته
كيف حالك يا [الاسم]،

باقي ثلاثة أيام وتبدأ معنا "[اسم الورشة]" — [الدفعة الأولى/الثانية/...].

والصراحة متحمس أشوفك!

تفاصيل الجلسات الحية:

📅 [اليوم] [التاريخ بالعربي] · الجلسة الأولى
[Google Meet link 1]
📅 [اليوم] [التاريخ بالعربي] · الجلسة الثانية
[Google Meet link 2]
📅 [اليوم] [التاريخ بالعربي] · الجلسة الثالثة
[Google Meet link 3]

🕖 الوقت: ٧:٠٠ – ١٠:٠٠ مساءً · بتوقيت جدة

جهز هذي التطبيقات إذا تحب:
- [App 1]
- [App 2]
- [App 3]
- [App 4]
- [App 5]

قبل الورشة — حضّر نفسك:

١. مكان هادئ تقدر تركز فيه ٣ ساعات بدون مقاطعة
٢. دفتر ملاحظات (ورقي أو رقمي — اللي يريحك)
٣. تأكد من الإنترنت والصوت قبل الجلسة بنص ساعة
٤. الكاميرا اختيارية بس تخلي التجربة أحلى — وأنا بشوفك بحب أكثر

نصيحة من القلب: ما تبدأ الجلسة وأنت متعب أو مشغول الذهن. خمس دقائق هدوء قبل ما تدخل تسوي فرق كبير في اللي راح تستفيده.

أي سؤال أو طارئ — رد على هذي الرسالة مباشرة.

نلتقي يوم الورشة بإذن الله.

ماجد
```

---

## Canonical example — T3 Cohort 1 (sent 2026-04-27)

- **Subject:** `جهز نفسك — ورشة صناعة الإلهام بعد ٣ أيام !`
- **Cohort name:** `ورشة صناعة الإلهام`
- **Cohort number:** `الدفعة الأولى`
- **Dates:** الخميس ٣٠ أبريل · الجمعة ١ مايو · السبت ٢ مايو
- **Apps list:**
  - Higgsfield
  - Gemini
  - Midjourney
  - Weavy ai
  - Adobe Fireflies or Figma FigJam

---

## Rendering rules (HTML for the actual send)

Follow the brand template in [bulk-email.md](./bulk-email.md) §Email Design. Specifics for this reminder:

- `<div dir="rtl">` wrapper, `font-family: Arial, sans-serif`, `max-width: 600px`, `line-height: 1.8`.
- Workshop name in brand gold: `<span style="color:#C9A84C;">[اسم الورشة]</span>`.
- The three session links go inside one detail box (gold left border, cream background) with each session as its own paragraph: emoji + date + on the next line a styled link.
- Apps list as `<ul style="margin: 8px 0 0; padding-right: 20px;">`.
- Numbered prep list as `<ol style="padding-right: 20px;">`.
- The "نصيحة من القلب" line lives in its own block-quote style (light italic, soft gray border-right).
- Sign-off `ماجد` on its own line, no signature block, no logo, no unsubscribe footer (this is transactional delivery, not marketing).

---

## Send sequence (when running the blast)

1. **Confirm copy is locked** for this cohort (subject + cohort name + dates + apps + Meet links).
2. **Get the recipient sheet URL** — must be the buyer list for THIS cohort, not the waitlist.
3. **Render HTML preview** locally and open in Chrome → Majid eyeballs in RTL view → iterate if needed.
4. **Build the standalone Apps Script project** by copying `bulk-email-template-script.js` and replacing the 3 placeholders (`SHEET_ID`, `SUBJECT`, `buildEmailHtml()`).
5. **Run `testSingleEmail` first** — sends to Majid only. Confirm rendering, links, Arabic shaping, mobile preview.
6. **On Majid's "send it" approval, run `sendBulkBlast`.** Watch the Executions tab.
7. **Log in `decisions/log.md`:** `[YYYY-MM-DD] DECISION: 3-day reminder sent to [cohort] | RECIPIENTS: N | CONTEXT: T3 SOP`.

**Never send without per-cohort approval.** Even though the template is locked, Majid approves every blast individually (memory: feedback_show_before_delete + feedback_manychat_confirm_copy patterns apply to bulk email too).

---

## Why this template works (so we don't drift)

- **No countdown noise.** One reminder, three days out. Not three reminders, not daily.
- **Mentor voice, not corporate.** "كيف حالك يا [الاسم]" + "والصراحة متحمس أشوفك" earns the right to give the prep list.
- **Practical > performative.** Specific apps, specific prep, specific time-buffer ("نص ساعة قبل") = student arrives ready.
- **The "نصيحة من القلب" line is the hidden weapon.** Most reminders skip the *how to show up* — that line is what makes students arrive present, not just on time.
- **No sell.** Nothing about the next cohort, the T2 launch, or the upsell. This is a delivery promise being kept.
