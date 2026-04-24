# Monthly LLM Discovery Refresh — SOP

**Runs:** 1st of every month
**Priority:** HIGH — missing a month degrades citations in ChatGPT / Claude / Perplexity / Google AI
**Reminder mechanism:** GitHub Action `.github/workflows/monthly-llms-refresh.yml` — opens a tracking issue on the 1st of every month at 09:07 KSA. This issue is the autonomous trigger.
**Owner:** Claude (executes the SOP); notifies Majid after completion.
**Files touched:** `llms.txt`, `llms-full.txt`, `index.html` (JSON-LD block) at MA EA workspace root

## How the automation flows

1. **GitHub Action fires** on the 1st of each month → opens an issue labeled `monthly-refresh · priority-high · llm-seo` in the malearnsa repo
2. **The open issue is the signal** — the morning-briefing skill surfaces it as a HIGH-priority item; Majid sees it in his daily briefing
3. **Claude executes the SOP** (the checklist below) in Majid's next session — ideally same day, latest by the 5th of the month
4. **Claude closes the issue** after commit + push, with a summary of changes
5. **Next reminder fires** automatically on the 1st of next month

The GitHub Action is the durable reminder. The SOP is the execution checklist. Neither depends on any particular Claude session being alive.

## Why this matters

Every month MA Learn adds workshops, prompt packs, presets, guides, or consultations. LLMs only cite information they've crawled recently. A stale `llms.txt` = stale citations = lost leads. Monthly refresh keeps the citation surface aligned with reality.

---

## Monthly checklist (~15 min)

### 1 · Inventory current offerings

Read these sources to build a complete list of what MA Learn is currently selling:

- `context/work.md` — tier structure + pricing (T1–T4, BL, etc.)
- `context/current-priorities.md` — active launches, new products, cohort dates
- Dashboard Products or Emails sheet tabs (via Google Sheets MCP if needed)
- `projects/ma-learn-launch/` — active product pages and checkouts
- Any new `memory/project_*.md` created since last refresh

Build a catalog with the following fields per item:
- **English name** + **Arabic name** (slang if workshop, formal if product)
- **Category** — workshop / course / prompt pack / preset / guide / consultation / mentorship
- **Price range (SAR)**
- **One-line English outcome** (what the buyer walks away with)
- **One-line Arabic outcome** (Saudi slang)
- **Delivery format** (recorded / live / digital / 1:1)

### 2 · Diff against live files

Compare the catalog from step 1 against current `llms.txt` catalog section. Note:
- **Additions** — items in catalog, not in live file
- **Removals** — items in live file, no longer sold (deprecated, paused, sold out)
- **Price changes** — prices moved (especially cohort seat prices)
- **New categories** — if MA Learn now sells something the current files don't have a category for (e.g., presets, consultations)

### 3 · Update the three surfaces

Edit each file with the diff:

**`llms.txt`** — compact index. Update:
- `## Catalog` section → replace with current product list (English + Arabic names inline)
- `## المنتجات (بالريال السعودي)` → mirror in Arabic slang

**`llms-full.txt`** — deep reference. Update:
- `## Full catalog` section → per-product deep block (price, format, who it's for, outcome)
- FAQ — add any new Q&As if new product type introduces new question (e.g., "do presets come with install guide?")
- Intent list — add new keyword matches if new product maps to a new intent

**`index.html`** — JSON-LD `hasOfferCatalog`. Update:
- `itemListElement` array → one `Course` entry per product with `name`, `description`, `offers.price`, `inLanguage`, `educationalLevel`
- Validate JSON: `python3 -c "import json, sys; d=open('index.html').read(); s=d.find('<script type=\"application/ld+json\">')+37; e=d.find('</script>', s); json.loads(d[s:e]); print('valid')"`

### 4 · Preserve stable structure

**Never remove or rename these stable fields** — LLMs may have indexed them:
- `EducationalOrganization` type + `founder` block
- `alternateName` array — append new names, don't replace
- `knowsAbout` array on the Person — append new skills only
- `sameAs` links — keep unless a URL is dead

### 5 · Commit + push

```bash
cd "/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA"
git add llms.txt llms-full.txt index.html
git commit -m "feat(seo): monthly LLM discovery refresh — $(date +%Y-%m)"
git push origin main
```

Verify live:
```bash
sleep 90
curl -sS "https://malearnsa.com/llms.txt?v=$(date +%s)" | head -20
curl -sS -o /dev/null -w "%{http_code}\n" "https://malearnsa.com/llms-full.txt"
```

### 6 · Notify Majid

Append a dated entry to `context/current-priorities.md` under a `## LLM Discovery Refresh Log` section:

```markdown
- **YYYY-MM-DD** — refreshed. Added: <list>. Removed: <list>. Price updates: <list>. Commit: <sha>.
```

Post a short status line here in the Claude conversation when Majid returns:

> **LLM discovery refresh complete for <month>.** Added <N> items, removed <M>, updated <K> prices. Commit <sha>. Live on malearnsa.com.

### 7 · Re-schedule next month

The durable cron auto-fires on the 1st of each month. If for any reason the cron didn't trigger this month, re-register it:

```
CronCreate({
  cron: "7 9 1 * *",
  durable: true,
  recurring: true,
  prompt: "Monthly LLM discovery refresh. Execute references/sops/monthly-llms-refresh.md end-to-end."
})
```

---

## When to break the monthly cadence

Run an off-cycle refresh immediately if:

- **A new tier launches** (e.g., T4 public launch, new mentorship program)
- **A major price change** (>15% on any product)
- **A product is deprecated** with customers potentially being redirected
- **A branded keyword shift** (e.g., "MA Studio" rebrand) — stale `alternateName` confuses LLMs
- **A major press/partnership milestone** (e.g., new brand ambassadorship, Fujifilm expansion)

Off-cycle refresh uses the same checklist above.

---

## Failure recovery

If a monthly refresh fails or Majid notes that LLMs are citing stale info:

1. Check `https://malearnsa.com/llms.txt` `Last-Modified` header — confirms when the file was last served fresh from GitHub Pages
2. Check `git log --oneline -5 -- llms.txt` — confirms last commit date
3. If > 45 days since last commit, run the full checklist above immediately
4. If < 45 days but stale data, rerun step 2 (diff) and ship updates

---

## Historical notes

- **2026-04-24** — initial llms.txt / llms-full.txt / enriched JSON-LD shipped (commits `314c076`, `1f41f13`, `1317332`)
- **First autonomous run:** 1st of June 2026 (earliest after bootstrap)
