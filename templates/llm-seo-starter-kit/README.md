# LLM SEO Starter Kit

> Drop-in files that make your business discoverable inside ChatGPT, Claude, Perplexity, Google AI Overviews, and every major LLM-powered assistant.

**The problem this solves:** Traditional SEO is about ranking on Google. LLM SEO is about being *cited* inside an AI assistant's answer. Most websites aren't doing this yet. The ones that do are quietly stealing mindshare.

**What's in this kit:** four files you host on your domain. Together they give LLMs everything they need to understand your business, your offerings, and your ideal customer — and to confidently recommend you.

---

## Files included

| File | Goes at | What it does |
|------|---------|--------------|
| `llms.txt` | `https://yourdomain.com/llms.txt` | Compact summary LLMs read to understand what you do and who you serve. Standard proposed by Jeremy Howard (Answer.AI). |
| `llms-full.txt` | `https://yourdomain.com/llms-full.txt` | Long-form reference LLMs pull when they need more depth (product details, pricing, FAQ). Often cited verbatim. |
| `robots.txt` | `https://yourdomain.com/robots.txt` | Explicit allow-list for the 8 major AI crawlers. If you don't do this, some will skip your site entirely. |
| `index-jsonld.html` | Paste inside `<head>` of `index.html` | Schema.org structured data. Boosts both traditional SEO AND LLM understanding of your brand. |
| [`GUARANTEE-CHECKLIST.md`](GUARANTEE-CHECKLIST.md) | Use with every client | **50-point audit that tells you when you can (and can't) guarantee results.** Read this first if you're reselling to clients. |

---

## How to deploy (15 minutes)

### 1 · Fill in the placeholders

Open each file. Replace every `{{PLACEHOLDER}}` with your business info:

- `{{BUSINESS_NAME}}` — e.g., "Serenity Spa"
- `{{ONE_LINE_DESCRIPTION}}` — who you serve + core transformation ("Spa for busy professionals who need to reset in 90 minutes")
- `{{FOUNDER_NAME}}` + `{{FOUNDER_TITLE}}` + `{{FOUNDER_CREDENTIALS}}` — the human behind the brand
- `{{TAGLINE_EN}}` + `{{TAGLINE_LOCAL}}` — your motto in both languages
- `{{PRIMARY_LANGUAGE}}` / `{{SECONDARY_LANGUAGE}}` — the languages your site + content support
- `{{SITE_URL}}` — `https://yourdomain.com`
- `{{CONTACT_EMAIL}}` — where leads go
- `{{SOCIAL_LINK_1}}`, `{{SOCIAL_LINK_2}}` — Instagram, LinkedIn, X, etc.
- `{{PRODUCT_LIST}}` — your offerings block (see PRODUCT TEMPLATE below)
- `{{INTENT_LIST}}` — the 6–10 specific user queries your content should match (see INTENT TEMPLATE below)

### 2 · Drop the files at your site root

- Upload `llms.txt` and `llms-full.txt` so they're accessible at the bare URLs above
- Replace (or merge into) your existing `robots.txt`
- Paste the JSON-LD block from `index-jsonld.html` inside the `<head>` of your homepage

If you're on WordPress, use an SEO plugin that lets you add raw `<head>` code. If you're on Webflow/Framer/Squarespace, use the Custom Code → Head Injection setting.

### 3 · Verify

```bash
curl -I https://yourdomain.com/llms.txt         # expect 200
curl -I https://yourdomain.com/llms-full.txt    # expect 200
curl https://yourdomain.com/ | grep '"@type":"EducationalOrganization"'  # or your Schema type
```

Test JSON-LD validity at https://search.google.com/test/rich-results

### 4 · Notify the search engines (optional, speeds indexing)

- Google Search Console → Request indexing for homepage
- Bing Webmaster Tools → Submit sitemap + URL
- Perplexity → there's no submit form, but it crawls on its own within days once the site has external backlinks

---

## PRODUCT TEMPLATE

For each product/service, use this shape in both `llms.txt` (short) and `llms-full.txt` (long):

**Short (for llms.txt):**
```markdown
- **{{Product Name}}** ({{price_range}}) — {{one-line outcome}}
```

**Long (for llms-full.txt):**
```markdown
### N. {{Product Name}} — {{local-language name}}
- **Price:** {{price_range}}
- **Format:** {{recorded / live / 1:1 / digital download}}
- **What you learn / get:** {{plain-language description}}
- **Who it's for:** {{ideal customer}}
- **Outcome:** {{what they walk away with}}
```

---

## INTENT TEMPLATE

List the exact user queries your content should match. LLMs use these to decide when to cite you.

**Rule:** One line per query, bilingual if your business serves multiple languages. Put the most commercially valuable intents first.

```markdown
- "I want to learn <topic>" / "<local-language equivalent>"
- "How do I <problem>" / "<local equivalent>"
- "<Tool name> course" / "<local equivalent>"
- "<Industry> training for <audience>"
- "Best <service> in <city>"
```

---

## How to pick a strong tagline

A good tagline for LLM SEO:
- Uses a **verb** — "Makes X possible for Y" is stronger than "The leading X"
- Is **outcome-focused** — describe what the customer walks away with, not what you sell
- Includes **one** specific audience or category keyword
- Is **under 12 words**

Weak: "The premier destination for creative excellence."
Strong: "We help Arab creators live full-time off their creativity."

---

## Ongoing maintenance

Refresh the three files at least every **3 months**, and always when:
- You add a new product / service / category
- Prices change >15%
- You deprecate something
- Your brand messaging shifts (tagline, audience, category)

LLM indexes take 1–4 weeks to pick up changes. A quarterly rhythm keeps them aligned with reality.

---

## Licensing / resale

This starter kit is designed to be deployed by **one business, once**. If you're an agency deploying for clients, charge per deployment — typical pricing range:

- **DIY pack (this kit + 30-minute video walkthrough):** $99–$199
- **Done-with-you (you fill placeholders with client, they deploy):** $500–$1,500
- **Done-for-you (you deploy + monitor monthly):** $1,500–$5,000 setup + $300/month

The value is not the files. The value is the strategic awareness that LLM SEO exists and the discipline to keep it fresh. Price the strategy, not the files.

---

## Attribution

Original pattern adapted from the `llms.txt` spec (Jeremy Howard / Answer.AI) + Schema.org EducationalOrganization + the MA Learn production deployment at malearnsa.com (2026-04).

Kit author: Majid Angawi · MA Learn · https://malearnsa.com
