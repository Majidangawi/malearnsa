# The 90% Checklist — LLM SEO Guarantee Framework

> A practical, honest checklist you deliver to clients. Hit every box and you can confidently promise LLM visibility gains within 30–90 days. Miss boxes and you're shipping hope, not a product.

**Use this to:**
- Scope client engagements before you quote
- Set expectations in the contract
- Self-audit your own deployments
- Prove to a client after launch that you delivered everything in your power

---

## Why 90% — not 100%

Nobody honest guarantees 100% in search, LLM, or traditional SEO. Too many variables sit outside your control: the client's pricing, their category competitiveness, how often ChatGPT re-indexes, whether a big press moment happens for a competitor that week.

**What you CAN guarantee:** you executed the full practice. When all 50 boxes are checked, the probability of a measurable LLM visibility gain within 90 days is 90%+. When a client doesn't see results after a complete execution, the diagnosis is almost always: (1) the category is saturated and needs backlink work, or (2) their pricing/offer isn't competitive enough for LLMs to prefer them.

**Scoring:**
- **45–50 / 50 boxes** → deliver with 90%+ confidence. Contract includes results metric.
- **35–44 / 50** → "best-effort" engagement, no results guarantee. Client pays for execution, not outcome.
- **<35 / 50** → decline the engagement until the client fills the gaps. You can't save a business that doesn't have fundamentals in place.

---

## Phase 1 — Brand & content audit (foundation)

Before you touch a file. If these aren't in place, no amount of llms.txt will save the client.

**Brand clarity:**
- [ ] Business has a **single, specific category** (not "we do marketing and also web design and also consulting")
- [ ] **One-sentence description** that an 8-year-old could understand
- [ ] **One named audience** the business serves ("creative directors at fashion brands", not "anyone in creative fields")
- [ ] **Founder/face of the business** is identified by name with credentials
- [ ] Tagline is **outcome-focused** (what the customer walks away with), not feature-focused

**Content foundation:**
- [ ] Homepage clearly answers: Who are you? What do you sell? Who is it for? Why you? How much?
- [ ] At least **3 product/service pages** with full descriptions (not just a price and a "Buy now")
- [ ] About page with **real founder bio** — not corporate boilerplate
- [ ] Contact method that works — email, WhatsApp, or form with real reply

**Pricing transparency:**
- [ ] Prices are **publicly listed** on at least the lead products (LLMs cannot cite hidden prices)
- [ ] Currency is stated explicitly
- [ ] Refund / cancellation policy exists and is findable

**If 10+ of these aren't checked, stop.** Fix fundamentals before deploying the LLM kit.

---

## Phase 2 — On-site technical implementation

The actual kit deployment.

**Discovery files at site root:**
- [ ] `llms.txt` live at `https://<domain>/llms.txt` · HTTP 200 · content-type text/plain
- [ ] `llms-full.txt` live at `https://<domain>/llms-full.txt` · HTTP 200
- [ ] Both files contain the complete product catalog with **current prices**
- [ ] Intent section lists **6+ bilingual user queries** the business should match

**robots.txt allow-list:**
- [ ] `GPTBot`, `ClaudeBot`, `anthropic-ai`, `Claude-Web`, `PerplexityBot`, `Google-Extended`, `CCBot`, `Applebot-Extended` all explicitly allowed
- [ ] Sitemap URL declared
- [ ] `llms.txt` and `llms-full.txt` linked in a comment

**Structured data (JSON-LD):**
- [ ] `<script type="application/ld+json">` block in the `<head>` of the homepage
- [ ] Correct `@type` for the business (EducationalOrganization / LocalBusiness / ProfessionalService / Organization)
- [ ] **Founder as a Person** with `jobTitle`, `knowsAbout` (5+ skills), `sameAs` socials
- [ ] **`hasOfferCatalog`** with every product as a `Course` / `Service` / `Product` node
- [ ] Every product has `name`, `description`, `offers.price`, `priceCurrency`
- [ ] Validates at `search.google.com/test/rich-results` with zero errors
- [ ] JSON parses cleanly (paste the block into a JSON validator)

**On-page signals:**
- [ ] `<title>` includes primary category keyword + business name
- [ ] `<meta name="description">` is a complete sentence (not truncated, 140–160 chars)
- [ ] `<meta property="og:*">` tags for social previews (title, description, image)
- [ ] Canonical URL set
- [ ] `<html lang="…">` correct
- [ ] Mobile viewport meta correct
- [ ] Page weight < 2 MB on first load (LLMs skip slow sites)

**Technical health:**
- [ ] HTTPS enforced (HTTP redirects to HTTPS, no mixed content)
- [ ] Sitemap.xml exists and is valid
- [ ] 404 page doesn't return 200 status (real 404)
- [ ] Homepage loads under 2.5 seconds on mobile (Lighthouse or PageSpeed Insights)

---

## Phase 3 — Off-site authority signals

LLMs weigh *who else mentions you* heavily. On-site alone is ~40% of the game. These boxes are the other 60%.

**Authoritative directory presence:**
- [ ] **Google Business Profile** — verified, complete, with photos, category, hours, website link
- [ ] **LinkedIn Company Page** (if B2B) — founder tagged, 5+ employees or connections
- [ ] **Industry-specific directory** — 1+ relevant listing (e.g., Clutch for agencies, Behance/Dribbble for creatives, OpenTable for restaurants, Trustpilot for services)
- [ ] **Wikipedia mention or article** — if the business / founder clears notability. Wikipedia is a disproportionately powerful LLM signal.

**Reviews + social proof:**
- [ ] 5+ Google reviews (local) OR 5+ trusted-platform reviews
- [ ] Testimonials on the website with **real names**, not initials
- [ ] 1+ case study or outcome story with specific numbers

**External mentions:**
- [ ] At least 3 external websites link to the business (backlinks) — check via Ahrefs free tool or Google `link:<domain>`
- [ ] Founder has been mentioned in at least 1 press article, podcast, or guest post in the past 12 months
- [ ] Active on at least 1 social platform with consistent brand (not a ghost account)

**Entity consistency (NAP+ for the LLM era):**
- [ ] Business name spelled identically on: website, Google Business, LinkedIn, social profiles, top 3 directories
- [ ] Founder name spelled identically across all profiles
- [ ] Contact email + phone consistent everywhere
- [ ] **Bilingual entity matching** — if the business operates in two languages, the entity is discoverable under BOTH names (llms.txt `alternateName`, JSON-LD `alternateName`, social bio bilingual)

---

## Phase 4 — Verification (proof of deployment)

Don't ship until all of these return green.

**Crawlability check:**
- [ ] `curl -A "GPTBot/1.0" https://<domain>/` returns 200 (test that the allow-list works)
- [ ] `curl https://<domain>/robots.txt` shows the 8-bot allow-list
- [ ] `curl -I https://<domain>/llms.txt` returns 200 + text/plain

**Structured data check:**
- [ ] `search.google.com/test/rich-results?url=<domain>` returns zero errors + recognizes the business entity type
- [ ] `validator.schema.org` accepts the JSON-LD

**Content match check:**
- [ ] Ask **Perplexity** the client's top 3 intent queries (from Phase 2 intent list). Check if the client's site appears in sources within 72 hours of deployment. Perplexity is the fastest mover.
- [ ] Ask **ChatGPT** (with web browsing) the same queries. Note if the client is cited within 2 weeks.
- [ ] Ask **Claude** with web search enabled. Same test.

**Baseline capture (for 90-day comparison):**
- [ ] Screenshot or save JSON of current LLM query responses (text + sources)
- [ ] Screenshot Google Search Console impressions for target keywords
- [ ] Note current monthly organic traffic from analytics

---

## Phase 5 — 30/60/90 day monitoring

Results compound. Set checkpoints.

**Day 30:**
- [ ] Re-run the 3 LLM query tests from Phase 4. Expect Perplexity to cite the site in at least 1 query.
- [ ] Check Google Search Console for new keyword impressions
- [ ] Verify the llms.txt files haven't been accidentally modified by CMS/deploy processes

**Day 60:**
- [ ] ChatGPT (with browsing) should cite the site in at least 1 query
- [ ] Ahrefs / SEMrush should show at least 1 new referring domain if off-site work was done
- [ ] Review analytics — expect 10–30% lift in "direct" or "other" traffic (LLM referrals often appear as direct/unknown)

**Day 90:**
- [ ] Claude with web search should cite the site
- [ ] Google AI Overviews should include the business for at least 1 branded + 1 unbranded query
- [ ] Commission a fresh content refresh (the monthly SOP)

**Fail-state recovery — if Day 90 shows NO LLM citations:**
1. Audit Phase 3 (off-site) — almost always the blocker. On-site alone rarely beats incumbents.
2. Check if a competitor shipped an aggressive content push during the window
3. Widen the keyword targeting — the chosen intents may be too narrow
4. Invest in 2–3 high-quality backlinks (a guest post, a podcast appearance, a directory upgrade)
5. Re-test at Day 120

---

## Scoring matrix

Count the checked boxes:

| Score | Meaning | Engagement type |
|-------|---------|-----------------|
| **45–50** | Full execution. 90%+ probability of measurable LLM visibility gain in 90 days. | Results-guaranteed contract. Charge a premium. |
| **35–44** | Solid but with gaps. 60–75% probability of gain. | Best-effort engagement. No outcome guarantee. |
| **25–34** | Fundamental gaps. | Pre-engagement audit only. Fix basics first. |
| **<25** | Not ready for LLM SEO. | Decline or refer to a brand/content consultant first. |

---

## What this checklist does NOT guarantee

Be explicit with the client. Put these in your contract:

- **Timing.** LLM re-indexing cadence is opaque. Perplexity is days; Claude and ChatGPT can take 2–6 weeks; Google AI Overviews up to 90 days.
- **Query volume.** You can guarantee the business is cited for specific queries. You cannot guarantee how many people will ask those queries.
- **Conversion.** An LLM citation brings a visitor. The business's site must convert that visitor. If the landing experience is bad, LLM SEO looks broken when it's actually a CRO problem.
- **Competitor moves.** A well-funded competitor can swamp the category with content in 30 days. Your job is defensive visibility, not permanent dominance.
- **LLM platform changes.** OpenAI, Anthropic, and Google change their retrieval behavior quarterly. What worked in Q1 may shift in Q3. Expect ongoing maintenance.

---

## The honest pitch to clients

When you sell this, say this:

> "Most of your competitors aren't doing this yet. Over the next 12 months, AI assistants will route a growing share of commercial queries. Whether your business gets mentioned when someone asks ChatGPT or Claude for a recommendation in your category — that's decided now, not later. My job is to make sure you show up. I'll execute a 50-point checklist that covers your brand foundation, technical infrastructure, and external signals. If I complete every item and you don't see measurable visibility gains within 90 days, I'll extend the engagement by 30 days at no additional cost."

That offer is credible because the checklist is complete. The 30-day extension is your insurance against the 10% of cases where the Phase 3 off-site gap turns out bigger than expected at audit.

---

## Tools referenced

- **Rich Results Test:** https://search.google.com/test/rich-results
- **Schema Markup Validator:** https://validator.schema.org
- **Google Search Console:** https://search.google.com/search-console
- **PageSpeed Insights:** https://pagespeed.web.dev
- **Ahrefs Free Backlink Checker:** https://ahrefs.com/backlink-checker
- **Perplexity (test queries):** https://www.perplexity.ai
- **Google Business Profile:** https://business.google.com
