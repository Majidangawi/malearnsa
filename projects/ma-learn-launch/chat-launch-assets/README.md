# Chat Launch Assets — BL rollout (2026-04-24)

Pre-approved copy + send instructions for announcing the Discussion tab to Beyond Lighting students and wider audience on Instagram.

## What shipped with chat V1

- Live on: `player.malearnsa.com` for `?course=beyond-lighting` students (no flag needed).
- Still flag-gated: ITCAI — needs `?chat=beta` until Majid's explicit review.
- Feature: per-lesson Discussion + Pinned tabs, realtime, Majid-as-verified, weekly wipe with pinned messages surviving.

## Email (Arabic body) — send via dashboard newsletter OR one-curl endpoint

**Subject:** جديد داخل المنصة — تبويب النقاش

**Body:** see `email-body-ar.html` (branded HTML, mobile-friendly)

### Option A — Dashboard newsletter (preferred per bulk-email SOP)

1. Open `admin.malearnsa.com` → Newsletters → New
2. Subject: paste the subject above
3. Body: paste HTML from `email-body-ar.html`
4. Segment: Beyond Lighting buyers
5. Preview → send

### Option B — One-curl endpoint (backup, Apps Script `admin_send_chat_launch_email` already deployed at `@13`)

```bash
# Dry-run first (returns target emails without sending):
curl -sSL "https://script.google.com/macros/s/AKfycbznjcsYu8gLDZqFJGededAQaATad_L8vlhRQV04pOqh57HB5nFVRy9zUHAcg6goyj8DKA/exec?action=admin_send_chat_launch_email&admin_token=<ADMIN_TOKEN - vault: TOKEN_VALIDATOR_ADMIN_TOKEN>&course=beyond-lighting&dry_run=true"

# Confirm the target_count matches expected BL buyer count, then:
curl -sSL "https://script.google.com/macros/s/AKfycbznjcsYu8gLDZqFJGededAQaATad_L8vlhRQV04pOqh57HB5nFVRy9zUHAcg6goyj8DKA/exec?action=admin_send_chat_launch_email&admin_token=<ADMIN_TOKEN - vault: TOKEN_VALIDATOR_ADMIN_TOKEN>&course=beyond-lighting"
```

As of 2026-04-24 the dry-run returned 2 targets (majed.engawi@gmail.com + salemphoto4@gmail.com). Small enough that a direct send is safe.

## Instagram — Story, Reel, Carousel

Open `instagram-story.md`, `instagram-reel.md`, `instagram-carousel.md` — each has copy + visual direction for Majid to produce/post in Canva or CapCut.

## Timing

Ship order per Harvest 22:
1. BL students: email + Story (same day)
2. Reel: 2–3 days later once a student has engaged with chat (social proof moment)
3. Carousel: within the week, recap the feature + hint at T2 public launch

## Do not send until

- ✅ Task 32 (48h staging soak) passes per criteria in spec §16.9
- ✅ Zero critical bugs during soak
