# Current Priorities
*Last updated: 2026-04-22*

## Active Plan — MA Learn Harvest 22 (Apr 22 → Sept 30 wedding)

22-week cash harvest plan, mentor-reviewed, Majid-approved 2026-04-22.
- **Target:** 120K SAR minimum by Sept 30 (wedding + house funding)
- **Linear project:** [MA Learn — Harvest 22](https://linear.app/majid-angawi-brand/project/ma-learn-harvest-22-0e18c801d56c) — 44 issues across 6 milestones (MAL-172 → MAL-215)
- **Calendar:** all events on primary calendar, color Blueberry (H22 tag), Asia/Riyadh
- **Full plan memory:** `project_harvest22_plan.md`, `project_harvest22_pricing.md`

### 6 Milestones

| # | Milestone | Dates | Core output |
|---|---|---|---|
| M1 | Deliver Cohort 1 | Apr 22 – May 2 | Flawless delivery + testimonials within 2hrs of Day 3 |
| M2 | T4 soft launch (waitlist) | May 3 – 6 | 3 T4 seats @ 3,500 SAR (3,000 group) |
| M3 | T2 public launch | May 6 – 10 | Public at 449 SAR, post-M6 graduation |
| M4 | T3 Cohort 2 | May 11 – Jun 5 | 1,199 flat, bundle 1,299, 30 seats. Delivery Jun 3-5. |
| M5 | Compound | Jun 8 – Aug 8 | T1 packs, T4 monthly, T3 C3 @ 1,399 |
| M6 | Pull back + wedding | Aug 9 – Sep 30 | Passive only, buffer week Aug 9-15, wedding Sept 30 |

### Non-negotiable constraints

- **Every Friday off** through Oct 1 (blocked recurring on GCal). Exceptions: pre-committed cohort delivery sessions only.
- **Aug 9–15 buffer week** fully off. No launches, no deliveries, no client work.
- **Cohort 1 promise sacred** — T2 stays gifted-only to C1 until after M6 graduation May 5.
- **Never discount** T3 C2 below 1,199, T2 below 449, T4 below 3,500 (3,000 group). Always ask Majid before any price move.

---

## This Week — Apr 22 to Apr 29 (Cohort 1 prep)

Live in the Linear M1 milestone. Key deliverables:

1. **Deliver Cohort 1 flawlessly** — Apr 30 (Thu), May 1 (Fri), May 2 (Sat), 7–10pm Jeddah, 3 hours each. Pre-session checklists MAL-169/170/171 already scheduled.
2. **Pin welcome in Cohort 1 WhatsApp group** — MAL-173, due Apr 29.
3. **Confirm M6 unlock email ready for May 5 graduation** — MAL-175, due May 3.
4. **Capture testimonials within 2 hours of Day 3 end** — MAL-172, May 2 @ 10pm KSA. Non-negotiable.

## Next Week — May 3 to May 10 (T4 soft + T2 public)

1. **T4 soft launch to 155 waitlist** — MAL-176 → MAL-181. Private WhatsApp + email. 3 seats at 3,500 SAR (or 3,000 group).
2. **T2 public launch May 6** — MAL-182 → MAL-189. Post-C1 graduation. 449 SAR. Testimonial-powered.

---

## T2 Gift Course — Drip Unlock Schedule (Cohort 1 only)

T2 "مدخل إلى الذكاء الاصطناعي الإبداعي" — free gift bundled with Cohort 1 seats. After May 5 graduation, T2 goes public at 449 SAR (T2 public launch is M3).

| Date | Module | Status |
|---|---|---|
| Apr 15 (Tue) | M1 + M2 | ✅ Auto on purchase |
| Apr 17 (Thu) | M3 | ✅ Sent retroactively Apr 19 |
| Apr 19 (Sat) | M4 | ✅ Shipped |
| Apr 21 (Mon) | M5 | ✅ Shipped |
| May 5 (Mon) | M6 | ⏳ Graduation drop — blocks T2 public launch |

---

## Payment Architecture

- **Moyasar** — all new products (T2, T3 C2+, T4, T1 packs) on malearnsa.com
- **Salla** — Beyond Lighting course only, deprecating ~May
- **Phase 1 (live):** Apps Script → Google Sheets → Gmail → token + Daftra ZATCA invoice
- **Phase 2 (May+):** Full LMS — Next.js + Supabase + Vercel. Token system retires.

---

## Fujifilm Partnership — Active Workshops

**Workshop 1 — Apr 4 (Jeddah) — ✅ Done.**

**Workshop 2 — May 7 (Riyadh)** — confirmed Apr 15. Camera X-T5. Concept TBD. Creative/application-based, not direct marketing. Note: this week overlaps M3 (T2 public launch) — keep travel/prep minimal.

---

## Daily Sync Format

- **Morning briefing** — HTML dashboard + Linear task table. Now extended with a "Harvest 22 Progress" block: current milestone, revenue vs 120K target, what ships today, what slipped.
- **Evening ~10pm Jeddah** — 3-line EOD check-in from Noor via chat + Telegram (@MajidNoorBot): shipped / moved / blocked.

---

## Dashboard + Player promoted to PROD — 2026-04-23

- **Live URLs:** `admin.malearnsa.com` (dashboard frontend), `api.malearnsa.com` (backend), `player.malearnsa.com` (BL + ITCAI player, already prod). Full Editorial Atelier redesign shipped across all surfaces.
- Player Admin (`/#lessons`) — 3-col layout, composer-based content editor, drag-drop reorder, inline Bunny preview, open-in-player
- Dashboard: all 8 pages refreshed (Home briefing, Emails, Newsletter, Contacts, Coupons inline, Lessons, Link-in-bio, Activity archive), sidebar consolidated (Noor + Activity both collapsible there), Gumela gold loader everywhere
- Apps Script v10 (admin_reorder_lessons + Blocks col), LessonContent `Blocks` column live in both sheets
- Staging pm2 app stopped; DNS + env file retained for rollback. Rollback tag: `pre-redesign-2026-04-23` on all repos.
- Operator tasks done today: DNS records (admin/api subdomains), Google Cloud OAuth (admin origin + api callback), Bunny referrer whitelist (BL + ITCAI libraries)
- Runbook: `~/code/ma-learn-dashboard/PROD.md`

---

## Deferred / Post-Wedding

- **Briefer V1** — all active work PAUSED as of 2026-04-22. Resume earliest Oct 2026, decided at MAL-215 Q4 debrief. Domain stays registered, no content work until then. See `project_briefer_v1.md` memory.
- Prompt Pack library build (handled inside M5)
- Full LMS Phase 2 migration (Next.js + Supabase + Vercel)
- MA Studio — Farsi Jewelry project active; intake pending
