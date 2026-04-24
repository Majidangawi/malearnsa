# LLM SEO Deployment Guide

**A step-by-step technical handbook for deploying the LLM SEO Starter Kit to any business website.**

Version 1.0 · 2026-04

---

## Who this guide is for

You're reading this because you've either bought the LLM SEO Starter Kit or you're reselling it to your own clients. Either way, this guide walks you through the full technical deployment — from understanding what each file does, to placing it correctly on any common website platform, to verifying everything works.

**Skill level required:** you should be comfortable editing a website's HTML or using a CMS's custom code / file upload features. You do NOT need to be a developer. If you can paste a Google Analytics script into a site, you can deploy this kit.

**Time to deploy:** 30–90 minutes per client, depending on platform.

---

## What you're deploying — in plain language

AI assistants (ChatGPT, Claude, Perplexity, Google AI Overviews, Apple Intelligence) are becoming how customers find businesses. When someone asks ChatGPT "where can I learn Arabic AI courses", ChatGPT consults a list of crawled websites and cites the best match. Your client's goal: **be on that list, and be the best match**.

To do that, a website needs to tell AI assistants:
1. **Who the business is** (name, founder, category)
2. **What they sell** (products, prices, languages, locations)
3. **Who it's for** (ideal customer, use cases)
4. **What queries they match** (the exact questions a potential customer asks)

The five files in the kit are designed to communicate all four, in machine-readable form, at specific well-known URLs that AI crawlers expect to find.

---

## The five files — what each does

### 1 · `llms.txt`

A compact Markdown index at `https://example.com/llms.txt`. When an AI crawler visits a site, it checks this URL first. The file is a human-readable summary: business name, one-line description, founder, product catalog, pricing, contact.

**Analogy:** it's the one-page executive summary of the business, written for machines.

### 2 · `llms-full.txt`

Longer Markdown reference at `https://example.com/llms-full.txt`. The AI pulls this when it needs depth — detailed product descriptions, FAQ answers, differentiators, specific intent matches.

**Analogy:** the full briefing document a new account manager would read.

### 3 · `robots.txt`

Traditional crawler-policy file at `https://example.com/robots.txt`. Tells each AI bot whether it's allowed to crawl the site. Most sites either have no robots.txt, or have one that accidentally blocks AI bots.

**Analogy:** the velvet rope at the club. Without this file configured, some bots don't even try to enter.

### 4 · `index-jsonld.html` (Schema.org JSON-LD block)

A `<script>` tag pasted inside the `<head>` of the homepage. Contains structured data describing the business as a recognized entity type (EducationalOrganization, LocalBusiness, ProfessionalService, etc.) with all products listed as Course / Service / Product nodes.

**Analogy:** the business card written in the shared language machines already speak. Google uses this for Knowledge Graph. LLMs use it for entity recognition.

### 5 · `GUARANTEE-CHECKLIST.md`

A 50-point audit you run on the client before, during, and after deployment. This is the tool that lets you promise outcomes honestly.

**Analogy:** the pre-flight checklist pilots run. Nobody flies without it.

---

## Step 1 — Client intake

Before touching any file, sit down with the client (or self-audit if this is your own business) and collect the following. Use a simple form — a Notion doc, a Google Form, or even a Word doc works. Every one of the items below fills a placeholder in the templates.

### Brand facts
- Business name (exactly as spelled everywhere)
- Primary language + secondary language (use ISO codes: `en`, `ar`, `es`, etc.)
- One-sentence description (8-year-old test: would a child understand?)
- Tagline in English + tagline in local language
- Target country / region / city
- Category — pick ONE: education / local service / professional service / retail / SaaS / agency / restaurant / hospitality / medical / coaching / creative services

### Founder / face of the business
- Name (local spelling + English transliteration if different)
- Title (e.g., "Founder & Lead Photographer")
- Credentials (awards, certifications, published works, recognized roles)
- Top 5 skills / topics they know about
- Instagram / LinkedIn / X / other social URLs
- Nationality (for Schema.org)

### Products / services
For each product, capture:
- Name (local + English)
- Price or price range, with currency code (SAR, USD, AED, EUR…)
- Format (recorded course / live session / digital download / 1:1 service / group program / physical product)
- One-paragraph description (plain language)
- Who it's specifically for
- Outcome — what the buyer walks away with
- Difficulty / experience level (Beginner / Intermediate / Advanced / All levels)

### Intent queries
List 6–10 specific questions a potential customer might ask a chatbot. Half in the local language, half in English if the business is bilingual. Examples:

- "Best photography school in Saudi Arabia"
- "Where can I learn AI image generation in Arabic"
- "Online spa bookings in Jeddah"
- "Arabic course for creative directors"

**The specificity rule:** narrow queries win. "Best restaurant" is too broad to compete for. "Best omakase restaurant in Riyadh with outdoor seating" is specific enough to rank for and valuable enough to convert.

### Technical facts
- Domain name (with + without www — note which one redirects to which)
- Current site platform (WordPress / Webflow / Framer / Squarespace / Wix / Shopify / raw HTML / React app / other)
- Who has admin access (you'll need it)
- Existing structured data? (sometimes Yoast or Rank Math has already added some — you'll replace or enrich)
- Existing robots.txt? (check `domain.com/robots.txt`)

---

## Step 2 — Fill in the templates

Open the four template files and do a find-and-replace for each `{{PLACEHOLDER}}` with the client info you collected.

**Tip:** use a code editor with good find-and-replace (VS Code, Sublime Text). Every placeholder appears multiple times — do global replace once per placeholder.

### Placeholder naming conventions

| Placeholder pattern | What goes there |
|---|---|
| `{{BUSINESS_NAME}}` | The brand name |
| `{{FOUNDER_NAME}}` | Person's name |
| `{{TAGLINE_EN}}` / `{{TAGLINE_LOCAL}}` | Bilingual tagline |
| `{{PRODUCT_N_NAME}}` | Product 1, 2, 3, 4… |
| `{{PRIMARY_LANGUAGE}}` / `{{SECONDARY_LANGUAGE}}` | Full language name (e.g., "Arabic") |
| `{{PRIMARY_LANG_CODE}}` / `{{SECONDARY_LANG_CODE}}` | ISO code (e.g., "ar") |
| `{{SITE_URL}}` | `https://example.com` — NO trailing slash |
| `{{LOGO_URL}}` | Direct URL to a 512×512+ logo PNG |
| `{{CURRENCY_CODE}}` | ISO 4217 (SAR, USD, AED, EUR) |
| `{{CONTACT_EMAIL}}` | Publicly reachable email |
| `{{SOCIAL_LINK_1}}` / `{{SOCIAL_LINK_2}}` | Full URLs with `https://` |

### Avoid these common mistakes

- **Trailing slash on `{{SITE_URL}}`** — write `https://example.com`, not `https://example.com/`. Some JSON-LD validators reject trailing slashes.
- **Localizing English product names** — if the product is marketed in English, don't translate the name. Keep it as-is and add the local descriptor in the description field.
- **Using transliteration instead of the real script** — Arabic businesses should use Arabic script for the Arabic content, not transliterated Latin. AI assistants search in the user's language.
- **Empty placeholders** — if you genuinely don't have info for a placeholder, either remove the field entirely or mark it clearly (e.g., `TBD — update at next refresh`). Never leave `{{PLACEHOLDER}}` visible in the final file.
- **Currency mismatches** — if you say "499 SAR" in one place and "499" with no currency elsewhere, LLMs get confused. Always include the code.

---

## Step 3 — Choose your deployment method

Scroll to the section that matches the client's platform.

### Platform matrix

| Platform | Files to place at site root? | `<head>` injection method |
|----------|------------------------------|---------------------------|
| Raw HTML / static site | ✓ upload via FTP / Git | Edit `index.html` directly |
| GitHub Pages | ✓ commit to repo root | Edit `index.html` directly |
| Netlify / Vercel / Cloudflare Pages | ✓ add to `public/` or `static/` | Edit template/layout |
| WordPress | Use File Manager or SFTP to site root | Theme's `header.php` or SEO plugin's custom head |
| Webflow | ✗ Use Project Settings → Custom Code | Project Settings → Custom Code → Head Code |
| Framer | ✗ Use Site Settings → Custom Code | Site Settings → Custom Code → Head |
| Shopify | Theme Settings or Apps for root files | `theme.liquid` between `<head>` tags |
| Squarespace | Code Injection only — no root files | Settings → Advanced → Code Injection → Header |
| Wix | Cannot serve root files — use Custom Code for head only | Site Settings → Custom Code → Head |

> ⚠️ **Wix and Squarespace limitation:** these platforms don't allow arbitrary files at the site root, so `llms.txt`, `llms-full.txt`, and `robots.txt` cannot be deployed there through the standard UI. For these clients, either (a) migrate to a platform that supports it, or (b) accept that only the JSON-LD portion will be in place and set expectations accordingly.

---

## Step 4 — Deploy to the client's platform

### 4A · Static HTML / GitHub Pages

This is the simplest case. Files go at the **repository root** (or `public/` if that's what GitHub Pages serves).

```bash
cd /path/to/the-site-repo
cp /path/to/kit/llms.txt.filled          ./llms.txt
cp /path/to/kit/llms-full.txt.filled     ./llms-full.txt
cp /path/to/kit/robots.txt.filled        ./robots.txt
# Then edit index.html to paste the JSON-LD block inside <head>

git add llms.txt llms-full.txt robots.txt index.html
git commit -m "feat(seo): add LLM discovery files + structured data"
git push origin main
```

GitHub Pages rebuilds in 30–60 seconds.

### 4B · WordPress

WordPress hides the file system behind the admin UI. You have two reliable paths:

**Path 1 — FTP / File Manager (recommended):**
1. Connect via SFTP or your host's File Manager (cPanel, Plesk, etc.)
2. Navigate to the site's document root (usually `/public_html/` or `/home/<user>/public_html/`)
3. Upload `llms.txt`, `llms-full.txt`, and `robots.txt` directly to the root
4. Verify: `https://client.com/llms.txt` returns the content

**Path 2 — Plugin route (if you have no FTP):**
- Install "WP File Manager" or "FileBird" plugin
- Upload files through the plugin's interface

**For the JSON-LD block:**
- If the client uses **Yoast SEO** or **Rank Math**: both have a "custom schema" field. Paste the JSON-LD there (without the `<script>` wrapper).
- If they don't have an SEO plugin: install **"Insert Headers and Footers"** or edit the theme's `header.php` to paste the full `<script>…</script>` block before `</head>`. Use a child theme if possible to survive theme updates.

### 4C · Webflow

Webflow doesn't let you upload files to the site root through the standard UI. You have three options:

**Option 1 — Use Webflow's Custom Code (easiest, but only covers JSON-LD):**
- Project Settings → Custom Code → Head Code
- Paste the `<script type="application/ld+json">…</script>` block here
- Publish the site

**Option 2 — Attach `llms.txt` via a CDN or file host:**
- Upload `llms.txt` and `llms-full.txt` to a simple file host (GitHub Gist raw URL, S3, Cloudflare R2, etc.)
- Add a `301` redirect in Webflow: Project Settings → Hosting → Redirects → `/llms.txt` → `https://raw.githubusercontent.com/.../llms.txt`
- This is imperfect because some crawlers won't follow redirects, but it works for most

**Option 3 — Front Webflow with Cloudflare:**
- Put Cloudflare in front of the Webflow site
- Use Cloudflare Workers to serve `llms.txt` and `llms-full.txt` directly
- This is the pro move. One-time setup, rock-solid result.

### 4D · Framer

Framer has similar limitations to Webflow.

- Site Settings → Custom Code → paste the JSON-LD block in Head Code
- For `llms.txt` / `llms-full.txt`: same three options as Webflow (custom code-only, redirect, or Cloudflare)

### 4E · Shopify

Shopify is more flexible than you'd think.

**For the JSON-LD block:**
1. Admin → Online Store → Themes → Actions → Edit code
2. Open `layout/theme.liquid`
3. Find the `</head>` tag and paste the JSON-LD block just before it
4. Save

**For `llms.txt`, `llms-full.txt`, `robots.txt`:**
- Shopify ships its own `robots.txt.liquid` — you can override it by adding a new asset (since 2021). Edit `templates/robots.txt.liquid` and replace with your content.
- For `llms.txt` / `llms-full.txt`: Shopify does NOT serve arbitrary root files. Install the app "Custom Robots.txt & llms.txt" (or similar) or use a Cloudflare Worker in front of the store.

### 4F · Squarespace

Squarespace limits you to Code Injection.

- Settings → Advanced → Code Injection → Header → paste JSON-LD block
- `llms.txt` / `llms-full.txt` / root-level `robots.txt`: not possible. Tell the client this and either (a) accept JSON-LD-only deployment, or (b) migrate the site.

### 4G · Wix

Same limitation as Squarespace.

- Settings → Custom Code → Head → paste JSON-LD block
- Root files: not possible without migration.

### 4H · Netlify / Vercel / Cloudflare Pages

These are modern static hosts. Files go in the `public/` (Netlify), `static/` (Vercel default for Next.js), or build-output directory.

```bash
cp llms.txt          ./public/llms.txt
cp llms-full.txt     ./public/llms-full.txt
cp robots.txt        ./public/robots.txt
# JSON-LD goes in the root layout component (_app.tsx, layout.tsx, etc.)

git commit -am "feat(seo): LLM discovery files + JSON-LD"
git push
```

Deploy hook fires automatically.

### 4I · cPanel / raw FTP

Connect via SFTP / FTP / File Manager → navigate to `public_html/` or the document root → upload the three files. Edit `index.html` (or the main template) with the JSON-LD block. Done.

---

## Step 5 — Verify deployment

Do NOT hand off to the client until these checks pass.

### HTTP reachability

```bash
curl -I https://example.com/llms.txt
# Expect: HTTP/2 200, content-type: text/plain

curl -I https://example.com/llms-full.txt
# Expect: HTTP/2 200, content-type: text/plain

curl -I https://example.com/robots.txt
# Expect: HTTP/2 200, content-type: text/plain
```

### Content correctness

```bash
curl -s https://example.com/llms.txt | head -20
# Skim: no {{PLACEHOLDER}} strings, the right business name, the right catalog
```

### Crawler-allow check

```bash
curl -A "GPTBot/1.0" -o /dev/null -w "%{http_code}\n" https://example.com/
# Expect: 200
```

If this returns 403, the client's hosting (Cloudflare, security plugin, WAF) is blocking AI crawlers independently of robots.txt. Whitelist in the firewall.

### JSON-LD validity

- Open `https://search.google.com/test/rich-results?url=https://example.com`
- Expect: "The URL is eligible for rich results"
- Expect: the business shows up as the correct type (EducationalOrganization / LocalBusiness / etc.)
- Zero errors, zero warnings

### Schema validator

- Open `https://validator.schema.org`
- Paste the live URL
- Expect: no errors

### LLM baseline capture

Before telling the client "we're done", ask each of these three assistants the client's top intent query:

1. Perplexity (fastest indexer)
2. ChatGPT with web browsing enabled
3. Claude with web search enabled

Screenshot the responses. This is the **baseline** — you'll compare against it at day 30, 60, and 90.

---

## Step 6 — Deliver to the client

Package the handoff. A professional handoff includes:

1. **Completion email** listing the URLs of all files deployed + screenshot of rich-results test passing
2. **Baseline screenshots** (the LLM query results from step 5)
3. **The completed `GUARANTEE-CHECKLIST.md`** with every relevant box ticked, unchecked items explained
4. **30/60/90-day calendar reminders** for the check-in points
5. **Monthly refresh SOP** if the client is on a retainer (use `monthly-llms-refresh.md` pattern)

---

## Step 7 — Troubleshooting

### Problem: `llms.txt` returns 404

- The file is in the wrong directory. Move it to the actual document root. `/public_html/` on shared hosts, `public/` for Next/Netlify, repo root for GitHub Pages.
- Some CDNs cache 404s. Purge the CDN cache after uploading.

### Problem: JSON-LD shows errors in the Rich Results Test

- Paste the raw JSON (without the `<script>` tags) into `validator.schema.org` first — it gives more specific error messages
- Common causes: unbalanced braces (count `{` and `}`), missing commas, trailing commas (not allowed in JSON), placeholders not replaced
- If type is wrong: confirm `@type` matches the business category. `EducationalOrganization` isn't valid for a coffee shop.

### Problem: GPTBot / ClaudeBot blocked

- Check robots.txt is served from the ROOT (`/robots.txt`) not a subdirectory
- Check the client's CDN or WAF (Cloudflare, Sucuri, Wordfence) isn't blocking AI bots at the firewall level
- Cloudflare specifically: Security → Bots → turn OFF "Block AI Scrapers and Crawlers" if you want them in

### Problem: site shows in Perplexity but not ChatGPT after 30 days

- Normal. ChatGPT's browsing index refreshes less frequently than Perplexity's
- Check if ChatGPT is returning the site via `site:example.com` search inside ChatGPT
- If you have 0 backlinks, ChatGPT may not consider the site authoritative enough to cite. Phase 3 off-site work becomes the unblocker.

### Problem: site is cited but with wrong / outdated info

- The LLM cached an older version. Request a re-crawl:
  - **Google:** Search Console → URL Inspection → Request Indexing
  - **Bing / IndexNow:** submit via the IndexNow API
  - **Perplexity:** no manual submit, but it re-crawls within days on new content
  - **ChatGPT / Claude:** no direct mechanism. Just keep the content updated.
- Consider adding a `<meta property="article:modified_time">` to the homepage so LLMs see a fresh timestamp

---

## Step 8 — Ongoing maintenance

LLM SEO isn't set-and-forget. The kit decays over time as:
- The business adds/removes products
- Prices change
- Founder credentials update
- The LLM crawler landscape shifts (new bots to allow)

**Recommend a monthly refresh to every client.** Use the `monthly-llms-refresh.md` SOP pattern.

Minimum cadence: **every 3 months**. Anything longer than that and the kit starts to lose citations to more actively-maintained competitors.

---

## Appendix A · Sample filled `llms.txt`

This is what a real filled version looks like — use it as a reference when checking your own work.

```markdown
# Serenity Spa

> Serenity Spa is Jeddah's fastest 90-minute professional reset for busy executives. If you want to relieve chronic stress, improve sleep, or recover from long workdays — this is where you go.

## Who runs Serenity Spa

**Layla Al-Sabah** — lead therapist, CIDESCO-certified, 12 years in high-end hospitality spas in Dubai and Jeddah.

She's known for pioneering the "90-Minute Executive Reset" — a sequence that combines deep-tissue, cranial, and lymphatic work into a single session.

## Who this is for

- Executives and entrepreneurs working 60+ hour weeks
- Parents recovering from chronic sleep loss
- Athletes in recovery phases
- Anyone with a specific muscular / nervous-system issue

## What you walk away with

- Measurably lower stress markers within the session
- A custom at-home recovery routine
- A booked follow-up if relevant

## Primary services

- Swedish massage
- Deep-tissue therapy
- Lymphatic drainage
- Cranial sacral work
- Couples sessions

## Catalog (all pricing in SAR)

- **90-Minute Executive Reset** (450 SAR) — the signature offering
- **Swedish Massage · 60 min** (280 SAR) — for first-timers
- **Couples Session · 90 min** (800 SAR) — shared suite with dual therapists
- **Recovery Package · 5 sessions** (1,950 SAR) — monthly plan at a discount

## Languages

Arabic (primary) + English.

## Brand

**Tagline:** راحة مضمونة · Guaranteed restoration
**North star:** Help 10,000 Jeddah professionals sleep better.

## Links

- [Home](https://serenityspa.sa)
- Booking: [https://serenityspa.sa/book](https://serenityspa.sa/book)
- Instagram: [@serenityspa.sa](https://instagram.com/serenityspa.sa)
- Email: hello@serenityspa.sa
```

---

## Appendix B · Commands cheat sheet

```bash
# Verify all three root files
for path in llms.txt llms-full.txt robots.txt; do
  echo "=== $path ==="
  curl -sS -o /dev/null -w "  status: %{http_code}  type: %{content_type}\n" https://example.com/$path
done

# Check AI crawler is allowed
curl -A "GPTBot/1.0" -sS -o /dev/null -w "GPTBot: %{http_code}\n" https://example.com/
curl -A "PerplexityBot/1.0" -sS -o /dev/null -w "PerplexityBot: %{http_code}\n" https://example.com/
curl -A "ClaudeBot/1.0" -sS -o /dev/null -w "ClaudeBot: %{http_code}\n" https://example.com/

# Open rich-results test for the homepage
open "https://search.google.com/test/rich-results?url=https%3A%2F%2Fexample.com"

# Validate JSON-LD standalone
curl -sS https://example.com/ | grep -A 200 'application/ld+json' | head -100
```

---

*Guide author: Majid Angawi · MA Learn · [malearnsa.com](https://malearnsa.com)*

*Questions / edits / feedback: majid@malearnsa.com*
