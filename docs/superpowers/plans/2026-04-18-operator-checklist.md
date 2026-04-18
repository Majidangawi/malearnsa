# Operator Checklist — MA Learn Dashboard Foundation

**Purpose:** Steps only YOU (Majid) can do. Claude can't click in your Google Cloud Console, your Cloudflare dashboard, or SSH into your droplet. These tasks unblock Tasks 2, 3, 4, 11-Step-1, 13 (partial), and 15 (partial) of [2026-04-18-ma-learn-dashboard-foundation.md](2026-04-18-ma-learn-dashboard-foundation.md).

**How to use:** Work top-to-bottom. Don't skip batches — later ones depend on earlier ones. When finished, come back and paste the **"Secrets to hand back"** section at the bottom to Noor in chat.

**Time estimate:** ~60 minutes total if done in one sitting. Can be split into the 4 batches.

---

## Before you start

- [ ] Log into `majid@malearnsa.com` in the browser you'll use (Google Workspace account — see memory file `Apps Script Owner Account`). All Google Cloud / Sheet / Apps Script work must happen under THIS account, not your personal gmail.
- [ ] Have terminal ready with SSH to droplet: `ssh root@46.101.151.237` should work. If it prompts for a password, that's fine.
- [ ] Have `gh` CLI authenticated: run `gh auth status` — should show `Majidangawi`. If not, run `gh auth login`.

---

## Batch A — Google Cloud, Sheets, OAuth (~25 min)

### A1. Duplicate the production Sheet

1. Open the production Sheet:
   `https://docs.google.com/spreadsheets/d/1nkrwK-KJ7nD2kv_8zdYiLqot6RFoH-v67VpmjCzvYi0/edit`
2. File → Make a copy. Name: `MA Learn Token Pool (STAGING)`. Leave "Copy to: My Drive" (inside majid@malearnsa.com).
3. Open the new copy. Copy the Sheet ID from its URL — the string between `/d/` and `/edit`.
4. **Record:** `STAGING_SHEET_ID = ________________`

### A2. Wipe real customer data from the staging copy

In the staging copy **only** (not production):
1. Click tab `Customers`. Select all rows below row 1 (the header). Right-click → Delete rows.
2. Click tab `Tokens`. Same thing — delete all rows below row 1.
3. Click tab `Lessons`. **Keep this one intact** — lessons are config, not customer data. Just change nothing here.
4. Click tab `Config`. Find the `MODE` cell. Change its value to `TEST`.

### A3. Create a Google Cloud project

1. Go to https://console.cloud.google.com — log in as majid@malearnsa.com.
2. Click the project dropdown (top left) → New Project.
3. Name: `ma-learn-dashboard`. Organization: leave as-is (probably `malearnsa.com`).
4. Click Create. Wait ~30 seconds. Switch to the new project via the dropdown.

### A4. Enable APIs

In the new project:
1. Navigation menu (☰) → APIs & Services → Library.
2. Search "Google Sheets API" → click it → Enable.
3. Search "Gmail API" → click it → Enable.

### A5. Create a service account for the dashboard backend

1. Navigation menu → IAM & Admin → Service Accounts → Create Service Account.
2. Name: `noor-dashboard`. Click Create and Continue.
3. Role: skip (click Continue without assigning one — we grant access per-Sheet).
4. Click Done.
5. Click the new service account → Keys tab → Add Key → Create New Key → JSON. Download the JSON file. **Keep this file safe — it's a secret.** You'll upload it to the droplet in Batch C.
6. **Record:** `SERVICE_ACCOUNT_EMAIL = ___________@ma-learn-dashboard.iam.gserviceaccount.com` (you'll find it on the service account details page).

### A6. Share both Sheets with the service account

1. Open the **staging** Sheet. Click Share (top right). Paste `SERVICE_ACCOUNT_EMAIL`. Permission: **Editor**. **Uncheck** "Notify people" (service accounts can't read email). Click Share.
2. Open the **production** Sheet (`1nkrwK-KJ7nD2kv_8zdYiLqot6RFoH-v67VpmjCzvYi0`). Same thing — share with service account as Editor, notify off.

Both shares needed now so the same credentials work after promotion.

### A7. Create OAuth 2.0 Client for Google Sign-In (admin login)

1. Navigation menu → APIs & Services → Credentials → Create Credentials → OAuth client ID.
2. First time will ask to configure OAuth consent screen:
   - User Type: Internal (since majid@malearnsa.com is a Workspace account)
   - App name: `MA Learn Dashboard`
   - User support email: majid@malearnsa.com
   - Developer contact: majid@malearnsa.com
   - Save and continue through scopes (skip) and test users (skip for Internal)
3. Back to Create Credentials → OAuth client ID → Application type: **Web application**.
4. Name: `MA Learn Dashboard`.
5. Authorized JavaScript origins — add both:
   - `https://admin-staging.malearnsa.com`
   - `http://localhost:3401`
6. Authorized redirect URIs — leave empty.
7. Click Create. A modal pops up with Client ID and Client Secret.
8. **Record:**
   - `GOOGLE_OAUTH_CLIENT_ID = ___________.apps.googleusercontent.com`
   - `GOOGLE_OAUTH_CLIENT_SECRET = ___________`

### A8. Create OAuth 2.0 Client for Gmail API (sending emails from the dashboard)

We need a SEPARATE "Desktop app" OAuth client so the dashboard can send emails via Gmail API. This is the consent flow for Task 11.

1. Credentials → Create Credentials → OAuth client ID → Application type: **Desktop app**.
2. Name: `ma-learn-dashboard-gmail`.
3. Click Create. Record:
   - `GMAIL_CLIENT_ID = ___________.apps.googleusercontent.com`
   - `GMAIL_CLIENT_SECRET = ___________`
4. **Now do the consent flow to get a refresh token.** In a terminal on your laptop:
   ```bash
   cd ~/code/ma-learn-dashboard
   cat > /tmp/get-gmail-refresh-token.mjs <<'EOF'
   import { google } from 'googleapis';
   import readline from 'node:readline/promises';
   const [clientId, clientSecret] = process.argv.slice(2);
   const oauth = new google.auth.OAuth2(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
   const url = oauth.generateAuthUrl({
     access_type: 'offline',
     prompt: 'consent',
     scope: ['https://www.googleapis.com/auth/gmail.send'],
   });
   console.log('\nOpen this URL in a browser logged in as majid@malearnsa.com:\n');
   console.log(url);
   console.log('\nAfter consent, Google shows a code. Paste it here:');
   const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
   const code = (await rl.question('> ')).trim();
   rl.close();
   const { tokens } = await oauth.getToken(code);
   console.log('\nRefresh token:', tokens.refresh_token);
   EOF
   cd backend && node /tmp/get-gmail-refresh-token.mjs "<GMAIL_CLIENT_ID>" "<GMAIL_CLIENT_SECRET>"
   ```
5. Follow the printed URL, log in as majid@malearnsa.com if prompted, click Allow, copy the code Google shows, paste it into the terminal. It will print a `Refresh token: ...` line.
6. **Record:** `GMAIL_REFRESH_TOKEN = 1//________________`

> If the browser shows "This app isn't verified" — click Advanced → "Go to MA Learn Dashboard (unsafe)" → Allow. That's normal for Internal apps.

### A9. Save all the Batch A secrets

Paste everything you recorded above into a scratch file so you have one place to copy from:

```
STAGING_SHEET_ID=
SERVICE_ACCOUNT_EMAIL=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
```

The service account JSON file stays in your Downloads folder until Batch C.

---

## Batch B — DNS on Cloudflare (~10 min)

You have 3 subdomains to add for `malearnsa.com`:

### B1. Log in to Cloudflare

Open https://dash.cloudflare.com — select the `malearnsa.com` zone.

### B2. Add the records

Go to DNS → Records → Add record. Add these three, one at a time:

| Type | Name | Target | Proxy status |
|---|---|---|---|
| CNAME | `admin-staging` | `majidangawi.github.io` | DNS only (gray cloud) |
| CNAME | `link-staging` | `majidangawi.github.io` | DNS only (gray cloud) |
| A | `api-staging` | `46.101.151.237` | DNS only (gray cloud) |

**Important:** proxy must be OFF (gray cloud), not on (orange cloud). GitHub Pages and the droplet serve their own TLS — Cloudflare proxy would double-encrypt and break things.

### B3. Verify propagation

Wait 2–5 minutes, then from your laptop:

```bash
dig +short admin-staging.malearnsa.com
dig +short api-staging.malearnsa.com
```

Expected output (roughly):
- `admin-staging.malearnsa.com` resolves to something containing `185.199.108.153` (GitHub Pages IPs)
- `api-staging.malearnsa.com` resolves to `46.101.151.237`

If nothing returns, wait another 2–5 minutes. DNS can be slow.

---

## Batch C — Droplet prep (~15 min)

### C1. SSH to droplet and verify Node 20

```bash
ssh root@46.101.151.237
node --version
```

- If you see `v20.x.x` — skip to C2.
- If you see anything else: `curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs` then re-check.

### C2. Create directories

On the droplet:

```bash
mkdir -p /etc/ma-learn-dashboard /var/www/ma-learn-dashboard
chmod 700 /etc/ma-learn-dashboard
```

### C3. Upload service account JSON

From your laptop (new terminal, don't close the SSH session):

```bash
scp ~/Downloads/ma-learn-dashboard-*.json root@46.101.151.237:/etc/ma-learn-dashboard/service-account.json
ssh root@46.101.151.237 'chmod 600 /etc/ma-learn-dashboard/service-account.json'
```

If the file in Downloads has a different name (Chrome sometimes adds `(1)` etc.), adjust the pattern.

### C4. Install Caddy for auto-TLS

Back on the droplet:

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy
```

Then write the Caddyfile for `api-staging.malearnsa.com`:

```bash
cat > /etc/caddy/Caddyfile <<'EOF'
api-staging.malearnsa.com {
  reverse_proxy localhost:3401
}
EOF
systemctl reload caddy
```

### C5. Generate a JWT secret

On the droplet:

```bash
openssl rand -hex 32
```

**Record:** `JWT_SECRET = ________________` (the 64-char hex string)

### C6. Generate a password hash for dashboard login

On your laptop (not droplet), decide what password you want. Write it down somewhere safe (1Password, your password manager). Then:

```bash
cd ~/code/ma-learn-dashboard/backend
npm install bcryptjs
node -e "import('bcryptjs').then(b => b.default.hash('YOUR_PASSWORD_HERE', 12).then(h => console.log(h)))"
```

Replace `YOUR_PASSWORD_HERE` with your chosen password. The output is a long `$2a$12$...` string.

**Record:** `PASSWORD_HASH = $2a$12$________________`

### C7. Write the staging env file on the droplet

On the droplet, use all the values you recorded. Run this carefully — all placeholders must be filled:

```bash
cat > /etc/ma-learn-dashboard/.env.staging <<EOF
NODE_ENV=staging
SHEET_ID=<STAGING_SHEET_ID from A1>
GOOGLE_SERVICE_ACCOUNT_JSON_PATH=/etc/ma-learn-dashboard/service-account.json
APPS_SCRIPT_URL=
GOOGLE_OAUTH_CLIENT_ID=<from A7>
ALLOWED_ADMIN_EMAIL=majed.engawi@gmail.com
JWT_SECRET=<from C5>
PASSWORD_HASH=<from C6>
GMAIL_SENDER=majid@malearnsa.com
GMAIL_REFRESH_TOKEN=<from A8>
GMAIL_CLIENT_ID=<from A8>
GMAIL_CLIENT_SECRET=<from A8>
ANTHROPIC_API_KEY=<from memory file reference_anthropic.md>
NOOR_MONTHLY_CAP_USD=100
PORT=3401
FRONTEND_ORIGIN=https://admin-staging.malearnsa.com
EOF
chmod 600 /etc/ma-learn-dashboard/.env.staging
```

Leave `APPS_SCRIPT_URL=` blank for now — Plan 2 fills it in.

For `ANTHROPIC_API_KEY`: check the memory file `reference_anthropic.md` — the key is stored there starting with `sk-ant-api03-Ye19...`.

### C8. Write the brand context file

```bash
cat > /etc/ma-learn-dashboard/brand-context.txt <<'EOF'
Majid Angawi is a creative educator, fashion photographer, and AI creative director.
North star: inspire 1M people to believe in their creative potential.
Tone: Inspirational, wise, friend-and-mentor. Can be funny and tough-love. Never corporate.
Default to numbered bullets for internal messages, paragraphs for customer copy.
Bilingual by default (AR + EN). Saudi dialect in Arabic.
EOF
chmod 600 /etc/ma-learn-dashboard/brand-context.txt
```

### C9. Confirm files in place

```bash
ls -la /etc/ma-learn-dashboard/
```

Expected three files, all with mode `-rw-------` (600):
- `.env.staging`
- `brand-context.txt`
- `service-account.json`

---

## Batch D — GitHub repo for dashboard frontend (~10 min)

### D1. Create the dashboard repo

From your laptop:

```bash
cd ~/code/ma-learn-dashboard
gh repo create Majidangawi/ma-learn-dashboard --public --source=. --push
```

### D2. Add the OAuth Client ID as a GitHub secret

The frontend deploy needs this at build time:

```bash
gh secret set GOOGLE_OAUTH_CLIENT_ID -b "<GOOGLE_OAUTH_CLIENT_ID from A7>" -R Majidangawi/ma-learn-dashboard
```

Replace `<...>` with the actual value.

### D3. Enable GitHub Pages with Actions as source

Go to https://github.com/Majidangawi/ma-learn-dashboard/settings/pages and set:
- Source: **GitHub Actions**
- Save

---

## Secrets to hand back to Noor

When you're done with all 4 batches, come back to Claude Code and paste these (with the placeholders filled in):

```
STAGING_SHEET_ID=<from A1>
SERVICE_ACCOUNT_EMAIL=<from A5>
GOOGLE_OAUTH_CLIENT_ID=<from A7>
GMAIL_CLIENT_ID=<from A8>
GMAIL_REFRESH_TOKEN=<from A8>
JWT_SECRET=<from C5, first 8 chars only as a checksum>
PASSWORD_HASH=<from C6, first 15 chars as a checksum>

Confirmations:
- [ ] Production Sheet shared with SERVICE_ACCOUNT_EMAIL as Editor
- [ ] Staging Sheet shared with SERVICE_ACCOUNT_EMAIL as Editor
- [ ] DNS resolves for admin-staging, link-staging, api-staging
- [ ] /etc/ma-learn-dashboard/ on droplet has 3 files, all mode 600
- [ ] Caddy reverse proxy live (https://api-staging.malearnsa.com/health will 502 until backend ships — that's fine)
- [ ] GitHub repo Majidangawi/ma-learn-dashboard exists with GOOGLE_OAUTH_CLIENT_ID secret set
```

Do NOT paste:
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GMAIL_CLIENT_SECRET`
- `JWT_SECRET` (full value)
- `PASSWORD_HASH` (full value)
- `ANTHROPIC_API_KEY`
- Service account JSON contents
- Your dashboard password

Those stay on the droplet only. The checksums let Claude confirm they're set without seeing the secret itself.

---

## When you're done

Reply to Claude in chat with the filled-in template above. Claude will verify DNS + Caddy + GitHub repo access from the outside, then resume with Task 5 (seed data generation) and proceed through Tasks 6–14.
