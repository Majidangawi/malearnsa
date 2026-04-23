# Backup — Pre-Redesign Snapshot

**Date:** 2026-04-23
**Purpose:** Restore point for the Editorial Atelier redesign of the dashboard + BL/ITCAI player.
**Spec:** `docs/superpowers/specs/2026-04-23-dashboard-player-redesign-design.md` (commit `bd6e7b9` in MA EA repo)

---

## Repos backed up

| Repo | Serves | Tag | HEAD at backup | Tarball |
|------|--------|-----|----------------|---------|
| `Majidangawi/ma-learn-dashboard` | `admin-staging.malearnsa.com` (admin dashboard) | `pre-redesign-2026-04-23` | `d9f0797` | `ma-learn-dashboard.tar.gz` (1.1 MB) |
| `Majidangawi/malearnsa-player` | `player.malearnsa.com` (BL + ITCAI student watch page; includes legacy `/admin/` subpath) | `pre-redesign-2026-04-23` | `d89195e` | `malearnsa-player.tar.gz` (71 KB) |
| `Majidangawi/malearnsa` (MA EA working tree) | `malearnsa.com` + shared `projects/ma-learn-launch/` working copies + specs/plans/context | `pre-redesign-2026-04-23` | `bd6e7b9` | — (git tag only; this IS the working tree) |

---

## Tarball contents

- **Includes** full source trees + `.git/` history (so branches/tags are preserved)
- **Excludes** `node_modules/`, `dist/`, `.DS_Store` (regeneratable or noise)
- Rebuild after restore: `cd ma-learn-dashboard/backend && npm install && npm run build`

---

## Restore — pick one path

### Option A · Full rollback via git tag (recommended for anything mid-flight)

```bash
# Dashboard
cd ~/code/ma-learn-dashboard
git checkout pre-redesign-2026-04-23                     # detached HEAD at snapshot
# ...inspect or branch from it...
git checkout -b rollback-from-snapshot

# Player
cd ~/code/malearnsa-player
git checkout pre-redesign-2026-04-23

# MA EA
cd "/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA"
git checkout pre-redesign-2026-04-23
```

To redeploy the old version to GitHub Pages / droplet after rollback:

```bash
# Dashboard backend (droplet)
cd ~/code/ma-learn-dashboard/backend && npm install && npm run build
rsync -az dist/ root@46.101.151.237:/var/www/ma-learn-dashboard/backend/dist/
ssh root@46.101.151.237 'pm2 restart ma-learn-dashboard-staging --update-env'

# Dashboard frontend + Player + MA EA (GitHub Pages)
# Force-push the rolled-back state to main of each repo:
git push origin rollback-from-snapshot:main --force-with-lease
```

### Option B · Expand the tarball (use if repo or GitHub access is gone)

```bash
ARCHIVE="/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA/archives/redesign-2026-04-23"
cd ~/code
mv ma-learn-dashboard ma-learn-dashboard.current            # keep current state
tar -xzf "$ARCHIVE/ma-learn-dashboard.tar.gz"
# Same for malearnsa-player
```

---

## What's NOT in this backup (but already safe)

- **Apps Script `token-validator` v10** — lives server-side on Google. `projects/ma-learn-launch/apps-script/token-validator/Code.js` is the mirror and gets tagged via MA EA's `pre-redesign-2026-04-23`. To re-deploy the pre-redesign version: `cp projects/.../Code.js ~/code/.clasp-token-validator/Code.js && clasp push --force && clasp deploy -i AKfycbznjcsYu8g... -d "rollback"`.
- **Google Sheet data** — authoritative in Google Sheets; no code changes can destroy it. Sheet ID `1nkrwK-KJ7nD2kv_8zdYiLqot6RFoH-v67VpmjCzvYi0` (Token Pool) is the live source.
- **Bunny videos** — stored on Bunny CDN; out of scope.
- **Brevo / Moyasar / Daftra** — external SaaS state.

---

## When to delete this archive

Keep **at least** through the redesign rollout and the first two weeks of production use. If you want to be conservative, keep permanently — total size is 1.2 MB.
