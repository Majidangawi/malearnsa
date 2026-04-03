# Skill: freebie-creation

End-to-end freebie creation — from post idea to public Drive link. Writes content in Majid's voice, generates a fully branded HTML file, opens it for PDF export, then uploads the PDF to Google Drive automatically.

---

## Trigger

- "create a freebie for [post/topic]"
- "build a freebie based on this post"
- "make a lead magnet for [topic]"

---

## Step 1 — Gather inputs

Ask only what's missing. If Majid already provided these, skip ahead.

1. **Post content or topic** — paste the post or describe the idea
2. **Freebie type:**
   - `mini-guide` — conceptual explainer with numbered steps
   - `prompt-pack` — ready-to-use prompt collection
   - `link` — delivers an external link (platform, tool, affiliate, workflow)
   - `template` — reusable fill-in-the-blank framework
3. **Hook / aha moment** — the insight that makes this freebie worth downloading
4. **Post angle** — the main point of the Instagram post this freebie supports
5. **Audience level** — beginner, familiar, or experienced with the topic
6. **Link URL** — if type is `link`, get the exact URL

---

## Step 2 — Write the content

Write the full freebie in Majid's voice. Present it to Majid before generating the design.
Ask: "Ready to generate the design, or any changes first?"

### Content structure (every freebie)

```
[Label]
[Title — English or mixed]
[Subtitle — Arabic, Saudi dialect, one line that delivers the promise]

[Link box — if type is `link`, place the URL prominently here]

الفكرة
[2–3 short paragraphs. The "why". The mindset. Make them feel something before showing anything.
Saudi dialect. Friend and mentor tone. Inspirational but never vague.]

[Section title by type:]
  mini-guide  → الخطوات
  prompt-pack → البروومبتات
  link        → الخطوات
  template    → القالب

[Main content — see type rules below]

[Closing insight — one italic line]

تواصل معي
إذا استفدت، تابعني على منصاتي للمزيد من المحتوى عن الذكاء الاصطناعي والإبداع البصري
Instagram  @majidangawi
Instagram  @angawi.studio
MA Learn   malearnsa.com

صنّاع الإلهام ✦
```

### Type-specific content rules

**mini-guide:** Arabic numerals (١ ٢ ٣). Each step: bold title + 1–2 sentence detail. Max 7 steps. End with one closing insight line.

**prompt-pack:** Brief intro on how to use the prompts. Label each: PROMPT 01, PROMPT 02. Full English prompt (copy-paste ready). One Arabic note below each explaining what it achieves. End with a customization tip.

**link:** الفكرة explains why the resource matters. الخطوات gives ٣–٥ numbered steps to use it. Link displayed prominently in a link box before الفكرة.

**template:** Explain the framework and when to use it. Present template with [اكتب هنا] markers. Include one worked example. End with when NOT to use it.

### Voice rules

- Saudi dialect throughout. English only for tool names, proper nouns, prompts.
- Friend and mentor — cares about the reader, direct because honest, not cold.
- Short sentences. No fluff. Can be funny. Can be blunt.
- Never: formal MSA, corporate language, filler phrases, hype words.

---

## Step 3 — Generate the branded HTML file

After Majid approves the content, generate the HTML file.

**File naming:** use the freebie title in English, kebab-case, e.g. `midjourney-moodboards.html`
**Save to:** `/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA/freebies-drafts/`

Use this exact HTML template. Replace only the content placeholders — never modify the CSS or brand elements.

```html
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{TITLE}}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;700&display=swap" rel="stylesheet">
  <style>
    @font-face { font-family:'Gumela'; src:url('../brand_assets/gumela-arabic-bold.otf') format('opentype'); font-weight:700; }
    @font-face { font-family:'Gumela'; src:url('../brand_assets/gumela-arabic-regular.otf') format('opentype'); font-weight:400; }
    @font-face { font-family:'Gumela'; src:url('../brand_assets/gumela-arabic-light.otf') format('opentype'); font-weight:300; }
    * { margin:0; padding:0; box-sizing:border-box; }
    @page { size:A4; margin:0; }
    body { font-family:'Gumela','Cairo',sans-serif; background:#040408; direction:rtl; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .page { width:210mm; min-height:297mm; margin:0 auto; background:#07070F; display:flex; flex-direction:column; background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E"); }
    .top-bar { height:4px; background:linear-gradient(to left,#8A6420,#C9A84C,#E8D08A,#C9A84C,#8A6420); flex-shrink:0; }
    .header { padding:7mm 16mm 6mm; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(201,168,76,0.2); flex-shrink:0; }
    .header-meta { font-size:8pt; font-weight:300; color:#555; letter-spacing:0.04em; direction:ltr; }
    .logo { height:26px; width:auto; }
    .content { flex:1; padding:9mm 16mm 6mm; }
    .label { font-size:7.5pt; font-weight:700; color:#C9A84C; letter-spacing:0.22em; margin-bottom:5px; }
    .title { font-size:26pt; font-weight:700; color:#F5F0E8; line-height:1.15; margin-bottom:7px; direction:ltr; text-align:right; }
    .subtitle { font-size:12pt; font-weight:300; color:#BBBBBB; line-height:1.7; margin-bottom:10px; }
    .link-box { background:rgba(201,168,76,0.06); border:1px solid rgba(201,168,76,0.3); border-radius:5px; padding:8px 12px; margin:10px 0; }
    .link-box-label { font-size:7.5pt; font-weight:700; color:#C9A84C; letter-spacing:0.1em; margin-bottom:4px; }
    .link-box a { font-size:8.5pt; font-weight:400; color:#E8D08A; text-decoration:none; word-break:break-all; direction:ltr; display:block; text-align:left; }
    .divider { height:1px; background:linear-gradient(to left,transparent,#C9A84C 30%,#C9A84C 70%,transparent); margin:10px 0; opacity:0.35; }
    .section { margin:10px 0; }
    .section-title { font-size:13pt; font-weight:700; color:#C9A84C; margin-bottom:8px; padding-bottom:5px; border-bottom:1px solid rgba(201,168,76,0.18); }
    p { font-size:10.5pt; font-weight:300; color:#BBBBBB; line-height:1.9; margin-bottom:8px; }
    .step { display:flex; gap:10px; align-items:flex-start; margin-bottom:10px; }
    .step-num { font-size:15pt; font-weight:700; color:#C9A84C; line-height:1.3; min-width:26px; flex-shrink:0; text-align:center; }
    .step-body { flex:1; }
    .step-title { font-size:10.5pt; font-weight:700; color:#F5F0E8; line-height:1.5; }
    .step-detail { font-size:9.5pt; font-weight:300; color:#888; line-height:1.7; margin-top:2px; }
    .prompt-block { background:rgba(201,168,76,0.04); border:1px solid rgba(201,168,76,0.15); border-radius:4px; padding:10px 12px; margin-bottom:12px; }
    .prompt-label { font-size:7.5pt; font-weight:700; color:#C9A84C; letter-spacing:0.15em; margin-bottom:6px; direction:ltr; }
    .prompt-text { font-size:8pt; font-weight:300; color:#888; line-height:1.7; direction:ltr; text-align:left; margin-bottom:6px; font-family:'Courier New',monospace; }
    .prompt-note { font-size:9pt; font-weight:300; color:#BBBBBB; line-height:1.6; }
    .closing-note { font-size:9.5pt; font-weight:400; font-style:italic; color:#888; text-align:center; padding:10px 0; border-top:1px solid rgba(201,168,76,0.2); border-bottom:1px solid rgba(201,168,76,0.2); margin:12px 0 0; line-height:1.7; }
    .footer { padding:7mm 16mm 6mm; border-top:1px solid rgba(201,168,76,0.2); flex-shrink:0; }
    .contact-title { font-size:10pt; font-weight:700; color:#F5F0E8; margin-bottom:3px; }
    .contact-sub { font-size:8.5pt; font-weight:300; color:#555; line-height:1.6; margin-bottom:7px; }
    .contact-links { display:flex; gap:0; flex-wrap:wrap; }
    .contact-link { font-size:8.5pt; font-weight:400; color:#BBBBBB; margin-left:18px; }
    .contact-link:last-child { margin-left:0; }
    .brand-close { text-align:center; margin-top:8px; padding-top:7px; border-top:1px solid rgba(201,168,76,0.15); }
    .brand-close-text { font-size:9.5pt; font-weight:700; color:#C9A84C; letter-spacing:0.08em; }
    .bottom-bar { height:4px; background:linear-gradient(to left,#8A6420,#C9A84C,#E8D08A,#C9A84C,#8A6420); flex-shrink:0; }
    @media print { body { background:#07070F; } .page { margin:0; box-shadow:none; } }
    @media screen { body { padding:12mm 0; } .page { box-shadow:0 8px 48px rgba(0,0,0,0.6); } }
  </style>
</head>
<body>
<div class="page">
  <div class="top-bar"></div>
  <div class="header">
    <span class="header-meta">malearnsa.com</span>
    <img src="../brand_assets/logo-malearn-white.png" alt="MA Learn" class="logo">
  </div>
  <div class="content">
    <div class="label">{{LABEL}}</div>
    <div class="title">{{TITLE_EN}}</div>
    <div class="subtitle">{{SUBTITLE_AR}}</div>

    {{LINK_BOX}}

    <div class="divider"></div>

    <div class="section">
      <div class="section-title">الفكرة</div>
      {{FIKRA_CONTENT}}
    </div>

    <div class="divider"></div>

    <div class="section">
      <div class="section-title">{{MAIN_SECTION_TITLE}}</div>
      {{MAIN_CONTENT}}
    </div>

    <div class="closing-note">{{CLOSING_NOTE}}</div>
  </div>
  <div class="footer">
    <div class="contact-title">تواصل معي</div>
    <div class="contact-sub">إذا استفدت من هذا الدليل، تابعني على منصاتي للمزيد من المحتوى عن الذكاء الاصطناعي والإبداع البصري</div>
    <div class="contact-links">
      <span class="contact-link">Instagram · @majidangawi</span>
      <span class="contact-link">Instagram · @angawi.studio</span>
      <span class="contact-link">MA Learn · malearnsa.com</span>
    </div>
    <div class="brand-close">
      <div class="brand-close-text">صنّاع الإلهام &nbsp; ✦</div>
    </div>
  </div>
  <div class="bottom-bar"></div>
</div>
</body>
</html>
```

### Template placeholder reference

| Placeholder | What to put |
|---|---|
| `{{LABEL}}` | دليل الأداة / حزمة البروومبتات / دليل المحتوى / القالب |
| `{{TITLE_EN}}` | English or mixed title |
| `{{SUBTITLE_AR}}` | One-line Arabic promise |
| `{{LINK_BOX}}` | Full link-box div if type=link, otherwise delete this line |
| `{{FIKRA_CONTENT}}` | 2–3 `<p>` tags |
| `{{MAIN_SECTION_TITLE}}` | الخطوات / البروومبتات / القالب |
| `{{MAIN_CONTENT}}` | Steps, prompts, or template HTML — see patterns below |
| `{{CLOSING_NOTE}}` | One italic closing insight |

### HTML patterns for main content

**Steps (mini-guide / link):**
```html
<div class="step">
  <div class="step-num">١</div>
  <div class="step-body">
    <div class="step-title">Step title here</div>
    <div class="step-detail">Optional detail line</div>
  </div>
</div>
```

**Prompts (prompt-pack):**
```html
<div class="prompt-block">
  <div class="prompt-label">PROMPT 01</div>
  <div class="prompt-text">Full English prompt text here...</div>
  <div class="prompt-note">Arabic note explaining what this prompt achieves</div>
</div>
```

**Link box (type=link only):**
```html
<div class="link-box">
  <div class="link-box-label">رابط الـ [Platform] — جاهز تجرّبه الآن</div>
  <a href="URL">URL</a>
</div>
```

---

## Step 4 — Open in browser

```bash
open "FULL_PATH_TO_HTML_FILE"
```

Tell Majid: "Design is open in your browser. File → Print → Save as PDF → save to the freebies-drafts folder. Tell me when done."

---

## Step 5 — Detect and upload the PDF

After Majid confirms the PDF is saved, find the newest PDF in the folder:

```bash
ls -t "/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA/freebies-drafts/"*.pdf | head -1
```

Upload it to Drive:

```bash
gws drive files create \
  --params '{"fields": "id,name,webViewLink"}' \
  --upload "PDF_FILE_PATH" \
  --upload-content-type "application/pdf" \
  --json '{"name": "PDF_FILENAME", "parents": ["1dvgALtbTwOHyJINept4N4pCwmFFoYWPe"]}' 2>&1
```

---

## Step 6 — Set public sharing

```bash
gws drive permissions create \
  --params '{"fileId": "FILE_ID"}' \
  --json '{"role": "reader", "type": "anyone"}' 2>&1
```

---

## Step 7 — Return the result

Return:
- **Public link:** `https://drive.google.com/file/d/FILE_ID/view?usp=sharing`
- Ready to paste into the post, story, or WhatsApp broadcast.

---

## Brand constants

- **Freebies folder ID:** `1dvgALtbTwOHyJINept4N4pCwmFFoYWPe`
- **Freebies drafts path:** `/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA/freebies-drafts/`
- **Brand assets path:** `/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA/brand_assets/`
- **Background:** Deep Space `#07070F`
- **Accent:** Heritage Gold `#C9A84C`
- **Primary text:** Warm Ivory `#F5F0E8`
- **Body text:** Silver Mist `#BBBBBB`
- **Logo:** white version on dark background
- **Font:** Gumela Arabic (Bold/Regular/Light) — Cairo as fallback
- **Brand closing:** `صنّاع الإلهام ✦`

---

## Automation summary

| Step | Who |
|---|---|
| Trigger the skill | Majid |
| Answer clarifying questions | Majid |
| Write content | Claude |
| Review content | Majid |
| Generate HTML + open browser | Claude |
| Export PDF to freebies-drafts/ | Majid |
| Upload to Drive + set sharing | Claude |
| Return public link | Claude |
