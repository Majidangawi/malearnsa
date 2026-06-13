#!/usr/bin/env node
/**
 * CCS Weekly Review — deterministic data layer.
 *
 * Pulls @majidangawi's last ~14 days of Instagram posts via Apify, matches each
 * post back to its Content Calendar row in Notion, and writes the live IG URL +
 * public metrics (Views/Likes/Comments) into that row, flipping Status -> Published.
 *
 * It ONLY reads Instagram and writes metrics/links/Status to Notion.
 * It NEVER publishes content anywhere. Saves/Shares/Reach are NOT scraped
 * (Apify can't see them) and are left blank — do not fabricate them.
 *
 * The judgment layer (lesson synthesis, scorecard, calibration — steps 4-6 of
 * .claude/skills/ccs-performance-review/SKILL.md) stays with Layan and is
 * triggered by the GitHub issue this run's summary produces.
 *
 * Usage:
 *   node scripts/ccs-weekly-review.mjs            # live: PATCHes matched rows
 *   node scripts/ccs-weekly-review.mjs --dry-run  # prints what it WOULD write, no PATCH
 *
 * Env (from vault locally, or GitHub Secrets in CI):
 *   APIFY_API_TOKEN  (required)
 *   NOTION_API_TOKEN (required)
 *   APIFY_API_BASE   (optional, default https://api.apify.com/v2)
 *   NOTION_API_URL   (optional, default https://api.notion.com/v1)
 *   IG_USERNAME      (optional, default majidangawi)
 *   LOOKBACK         (optional, default "14 days")
 *
 * Output: a JSON object on the LAST stdout line (the workflow parses it to build
 * the tracking issue). Human-readable progress goes to stderr.
 */

const DRY_RUN = process.argv.includes("--dry-run");

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const NOTION_TOKEN = process.env.NOTION_API_TOKEN;
const APIFY_BASE = (process.env.APIFY_API_BASE || "https://api.apify.com/v2").replace(/\/$/, "");
const NOTION_URL = (process.env.NOTION_API_URL || "https://api.notion.com/v1").replace(/\/$/, "");
const NOTION_VERSION = "2022-06-28";

const IG_USERNAME = process.env.IG_USERNAME || "majidangawi";
const LOOKBACK = process.env.LOOKBACK || "14 days";

const APIFY_ACTOR = "apify~instagram-scraper"; // id shu8hvrXbJbY3Eb9W
const CONTENT_CALENDAR_DB = "37ecb219-078e-81bf-90e1-d28fbfdb29f8";

// Status options that mean "supposed to be / now live" and so are candidates for a metric write-back.
const CANDIDATE_STATUSES = ["Ready to publish", "Published"];

// --- matching thresholds (best-effort, conservative — never guess-link) ---
const MIN_CONFIDENCE = 0.55;        // below this -> leave unmatched, flag for Majid
const DATE_WINDOW_DAYS = 7;         // |post date - publication date| within this scores positively

const log = (...a) => console.error(...a);
const die = (msg) => { console.error("FATAL:", msg); process.exit(1); };

if (!APIFY_TOKEN) die("APIFY_API_TOKEN missing");
if (!NOTION_TOKEN) die("NOTION_API_TOKEN missing");

/* ----------------------------- Apify ----------------------------- */

async function pullInstagramPosts() {
  const input = {
    resultsType: "posts",
    directUrls: [`https://www.instagram.com/${IG_USERNAME}/`],
    onlyPostsNewerThan: LOOKBACK,
    resultsLimit: 40,
    addParentData: false,
  };
  // run-sync-get-dataset-items: runs the actor and returns dataset items in one call.
  const url = `${APIFY_BASE}/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}`;
  log(`[apify] running ${APIFY_ACTOR} for @${IG_USERNAME} (newer than ${LOOKBACK})…`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Apify run failed: ${res.status} ${res.statusText} ${txt.slice(0, 300)}`);
  }
  const items = await res.json();
  const posts = (Array.isArray(items) ? items : [])
    // Drop profile/error rows; keep only real post items with a url + shortcode.
    .filter((it) => it && it.url && (it.shortCode || it.id) && !it.error)
    .map((it) => ({
      url: it.url,
      caption: (it.caption || "").trim(),
      timestamp: it.timestamp || null,
      likesCount: numOrNull(it.likesCount),
      commentsCount: numOrNull(it.commentsCount),
      views: numOrNull(it.videoViewCount) ?? numOrNull(it.videoPlayCount),
      type: it.type || null, // "Image" | "Video" | "Sidecar"
      isPinned: !!it.isPinned,
    }));
  log(`[apify] pulled ${posts.length} posts`);
  return posts;
}

function numOrNull(v) {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

/* ----------------------------- Notion ----------------------------- */

async function notion(path, method = "GET", body) {
  const res = await fetch(`${NOTION_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Notion ${method} ${path} -> ${res.status} ${txt.slice(0, 400)}`);
  }
  return res.json();
}

async function fetchCandidateRows() {
  const rows = [];
  let cursor;
  do {
    const body = {
      filter: {
        and: [
          { or: CANDIDATE_STATUSES.map((s) => ({ property: "Status", select: { equals: s } })) },
          { property: "Instagram URL", url: { is_empty: true } },
        ],
      },
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;
    const data = await notion(`/databases/${CONTENT_CALENDAR_DB}/query`, "POST", body);
    for (const pg of data.results) {
      const p = pg.properties || {};
      rows.push({
        id: pg.id,
        name: plainText(p.Name?.title),
        caption: plainText(p.Caption?.rich_text),
        status: p.Status?.select?.name || null,
        pubDate: p["Publication Date"]?.date?.start || null,
      });
    }
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  log(`[notion] ${rows.length} candidate rows (status in {${CANDIDATE_STATUSES.join(", ")}}, no Instagram URL)`);
  return rows;
}

function plainText(arr) {
  if (!Array.isArray(arr)) return "";
  return arr.map((t) => t.plain_text || "").join("").trim();
}

async function patchRow(rowId, post) {
  const properties = {
    "Instagram URL": { url: post.url },
    Status: { select: { name: "Published" } },
  };
  if (post.likesCount != null) properties.Likes = { number: post.likesCount };
  if (post.commentsCount != null) properties.Comments = { number: post.commentsCount };
  if (post.views != null) properties.Views = { number: post.views };
  // Saves / Shares intentionally untouched — Apify cannot see them.
  await notion(`/pages/${rowId}`, "PATCH", { properties });
}

/* ----------------------------- Matching ----------------------------- */

const STOP = new Set([
  "the","a","an","and","or","of","to","in","for","on","with","is","are","this","that","you","your",
  "في","من","على","عن","الى","إلى","مع","هذا","هذه","ان","أن","ما","لا","يا","و","ال",
]);

function tokenize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#@]/g, " ")
    // keep Arabic + latin letters/digits, drop the rest
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

function jaccard(aTokens, bTokens) {
  const a = new Set(aTokens), b = new Set(bTokens);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function dateProximityScore(postTs, pubDate) {
  if (!postTs || !pubDate) return 0;
  const dt = Math.abs(new Date(postTs) - new Date(pubDate)) / 86400000;
  if (Number.isNaN(dt)) return 0;
  if (dt <= 1) return 1;
  if (dt >= DATE_WINDOW_DAYS) return 0;
  return 1 - dt / DATE_WINDOW_DAYS; // linear falloff
}

function scorePostVsRow(post, row) {
  const postTok = tokenize(post.caption);
  const rowTok = tokenize([row.caption, row.name].filter(Boolean).join(" "));
  const textSim = jaccard(postTok, rowTok);             // 0..1
  const dateSim = dateProximityScore(post.timestamp, row.pubDate); // 0..1
  // Weighted: caption similarity is the strong signal, date is supporting.
  // If there's effectively no caption overlap, date alone must not carry a match.
  const confidence = textSim < 0.08 ? textSim * 0.6 : 0.7 * textSim + 0.3 * dateSim;
  return { confidence, textSim, dateSim };
}

/** Greedy 1:1 assignment: highest-confidence pairs first, each post/row used once. */
function matchAll(posts, rows) {
  const pairs = [];
  for (const post of posts) {
    for (const row of rows) {
      const s = scorePostVsRow(post, row);
      if (s.confidence >= MIN_CONFIDENCE) pairs.push({ post, row, ...s });
    }
  }
  pairs.sort((a, b) => b.confidence - a.confidence);

  const usedPosts = new Set(), usedRows = new Set(), matches = [];
  for (const pr of pairs) {
    if (usedPosts.has(pr.post.url) || usedRows.has(pr.row.id)) continue;
    usedPosts.add(pr.post.url);
    usedRows.add(pr.row.id);
    matches.push(pr);
  }
  const unmatchedPosts = posts.filter((p) => !usedPosts.has(p.url));
  const unmatchedRows = rows.filter((r) => !usedRows.has(r.id));
  return { matches, unmatchedPosts, unmatchedRows };
}

/* ----------------------------- Main ----------------------------- */

const short = (s, n = 80) => (s || "").replace(/\s+/g, " ").slice(0, n);
const notionPageUrl = (id) => `https://www.notion.so/${id.replace(/-/g, "")}`;

(async () => {
  const startedAt = new Date().toISOString();
  let posts, rows;
  try {
    [posts, rows] = await Promise.all([pullInstagramPosts(), fetchCandidateRows()]);
  } catch (e) {
    // Emit a machine-readable failure summary so the workflow can still open an issue.
    const summary = { ok: false, dryRun: DRY_RUN, error: String(e.message || e), startedAt };
    console.error("ERROR:", summary.error);
    console.log(JSON.stringify(summary));
    process.exit(1);
  }

  const { matches, unmatchedPosts, unmatchedRows } = matchAll(posts, rows);

  log(`\n[match] ${matches.length} matched · ${unmatchedPosts.length} unmatched posts · ${unmatchedRows.length} unmatched rows\n`);

  const written = [];
  for (const m of matches) {
    const metrics = `views=${m.post.views ?? "-"} likes=${m.post.likesCount ?? "-"} comments=${m.post.commentsCount ?? "-"}`;
    log(`  ${DRY_RUN ? "WOULD WRITE" : "WRITING"}: "${short(m.row.name || m.row.caption, 50)}" <- ${m.post.url}`);
    log(`     conf=${m.confidence.toFixed(2)} (text=${m.textSim.toFixed(2)} date=${m.dateSim.toFixed(2)}) ${metrics}`);
    if (!DRY_RUN) {
      try {
        await patchRow(m.row.id, m.post);
      } catch (e) {
        log(`     !! PATCH failed: ${e.message}`);
        m.patchError = String(e.message || e);
      }
    }
    written.push({
      rowId: m.row.id,
      rowUrl: notionPageUrl(m.row.id),
      rowName: m.row.name || m.row.caption || "(untitled)",
      postUrl: m.post.url,
      views: m.post.views,
      likes: m.post.likesCount,
      comments: m.post.commentsCount,
      type: m.post.type,
      confidence: Number(m.confidence.toFixed(2)),
      patchError: m.patchError || null,
    });
  }

  const summary = {
    ok: true,
    dryRun: DRY_RUN,
    startedAt,
    account: IG_USERNAME,
    lookback: LOOKBACK,
    postsPulled: posts.length,
    candidateRows: rows.length,
    matchedCount: matches.length,
    matched: written,
    unmatchedPosts: unmatchedPosts.map((p) => ({
      url: p.url,
      caption: short(p.caption, 100),
      timestamp: p.timestamp,
      views: p.views,
      likes: p.likesCount,
      comments: p.commentsCount,
      type: p.type,
      pinned: p.isPinned,
    })),
    unmatchedRows: unmatchedRows.map((r) => ({
      rowUrl: notionPageUrl(r.id),
      name: r.name || r.caption || "(untitled)",
      status: r.status,
      pubDate: r.pubDate,
    })),
  };

  // LAST stdout line = machine-readable summary for the workflow.
  console.log(JSON.stringify(summary));
})();
