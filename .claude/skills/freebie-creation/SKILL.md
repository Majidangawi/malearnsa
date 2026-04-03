# Skill: freebie-creation

Create a freebie Google Doc from a post idea, write the content in Majid's voice, save it to his Drive freebies folder, and return a shareable link.

---

## Trigger

Use this skill when Majid says:
- "create a freebie for [post/topic]"
- "build a freebie based on this post"
- "make a lead magnet for [topic]"

---

## Inputs to Gather

Before starting, confirm:
1. **Post content or topic** — paste the post, or describe the idea
2. **Freebie type** — one of:
   - `mini-guide` — conceptual explainer with steps or tips
   - `prompt-pack` — a collection of ready-to-use prompts
   - `link` — a freebie that delivers an external link (platform, affiliate, resource)
   - `template` — a reusable framework or fill-in-the-blank structure
3. **Freebie title** — Arabic title preferred, or Majid can describe and Claude suggests
4. **Main content** — what specifically goes inside (prompts, steps, links, tips)

If any input is missing, ask before proceeding.

---

## Document Structure

Every freebie follows this exact structure. Never deviate.

```
[Label: دليل الأداة / دليل المحتوى / حزمة البروومبتات / etc.]
[Main Title — English or mixed]
[Subtitle — Arabic, Saudi dialect, one line that delivers the promise]


الفكرة
[2–3 short paragraphs. The "why". The mindset. Why this matters.
Written in Saudi dialect. Inspirational and direct — friend and mentor tone.
Not instructional yet. Make them feel something before you show them anything.]


[Section title based on type:]
  mini-guide  → الخطوات
  prompt-pack → البروومبتات
  link        → الأداة
  template    → القالب

[Main content — see type-specific structure below]


تواصل معي
إذا استفدت، تابعني للمزيد من المحتوى عن الذكاء الاصطناعي والإبداع البصري
Instagram  @majidangawi
Instagram  @angawi.studio
MA Learn   malearnsa.com


صنّاع الإلهام
✦
```

---

## Type-Specific Content Structure

### mini-guide
- Numbered steps (use Arabic numerals: ١ ٢ ٣)
- Each step: bold label + 1–2 sentence explanation
- End with a one-line closing insight in italics
- Max 5–7 steps

### prompt-pack
- Brief intro: what these prompts do and how to use them
- Each prompt labeled: PROMPT 01, PROMPT 02, etc.
- Full prompt in English (exact, copy-paste ready)
- One-line Arabic note below each prompt explaining what it achieves
- End with a tip about customizing or combining prompts

### link
- Explain what the platform/resource is and why it matters (الفكرة section)
- Under الأداة: numbered steps to access or use it (٣–٥ steps)
- Dedicated line for the link: **الرابط:** [link here]
- If it's a video: **رابط الشرح:** [link here]

### template
- Explain the framework and when to use it
- Present the template clearly labeled with fill-in-the-blank markers ([اكتب هنا])
- Include one worked example showing the template filled in
- End with a reminder of when NOT to use it

---

## Voice & Tone Rules

- **Language:** Arabic Saudi dialect throughout. English only for proper nouns, tool names, prompts.
- **Tone:** Friend and mentor. Cares about the reader. Direct because he's honest, not cold.
- **Style:** Short sentences. No fluff. Inspirational but never vague. Can be funny. Can be blunt.
- **Never:** formal MSA, corporate language, filler phrases, or sycophantic openers.
- Match the existing freebie voice — read the الفكرة section of the Moodboards guide as the benchmark.

---

## Execution Steps

Run these steps in order. Do not skip any.

### Step 1 — Write the content
Write the full freebie text following the structure and type rules above.
Present it to Majid for a quick review before creating the doc.
Ask: "Ready to create the doc, or any changes first?"

### Step 2 — Create the Google Doc
```bash
gws docs documents create --json '{"title": "FREEBIE_TITLE"}' 2>&1
```
Save the returned `documentId`.

### Step 3 — Insert the content
```bash
gws docs documents batchUpdate \
  --params '{"documentId": "DOC_ID"}' \
  --json '{
    "requests": [
      {
        "insertText": {
          "location": {"index": 1},
          "text": "FULL_CONTENT_HERE"
        }
      }
    ]
  }' 2>&1
```

### Step 4 — Move to freebies folder
```bash
gws drive files update \
  --params '{"fileId": "DOC_ID", "addParents": "1dvgALtbTwOHyJINept4N4pCwmFFoYWPe", "removeParents": "root"}' \
  --json '{}' 2>&1
```

### Step 5 — Set public sharing (anyone with link can view)
```bash
gws drive permissions create \
  --params '{"fileId": "DOC_ID"}' \
  --json '{"role": "reader", "type": "anyone"}' 2>&1
```

### Step 6 — Return the result
Return:
- **Google Doc link:** `https://docs.google.com/document/d/DOC_ID/edit`
- **Reminder:** Open the doc → apply brand design (colors, fonts, logo) → File → Download → PDF → upload the PDF to the same Drive folder: https://drive.google.com/drive/folders/1dvgALtbTwOHyJINept4N4pCwmFFoYWPe

---

## Brand Constants

- Freebies folder ID: `1dvgALtbTwOHyJINept4N4pCwmFFoYWPe`
- Brand closing: `صنّاع الإلهام ✦`
- Instagram: `@majidangawi` and `@angawi.studio`
- Platform: `malearnsa.com`
- Accent color (for design reference): warm golden amber — RGB(201, 168, 76)

---

## What This Skill Does NOT Do

- Does not apply visual design (colors, fonts, logo) — that step stays manual in Google Docs
- Does not export or upload the PDF — that step stays manual
- Does not publish or share the link anywhere — Majid does that
