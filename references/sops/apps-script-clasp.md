# Apps Script Workflow — clasp

All MA Learn Apps Script projects are managed via [clasp](https://github.com/google/clasp), Google's official CLI. No more copy-paste into the browser editor.

## Account
All scripts owned by **Majid@malearnsa.com** (Workspace). Personal Gmail (`majed.engawi@gmail.com`) is NOT used.

## Repo layout
```
projects/ma-learn-launch/apps-script/
├── token-validator/        # MA Learn — Checkout (token + Daftra invoice flow)
│   ├── .clasp.json         # links folder to live script ID
│   ├── appsscript.json     # script manifest (scopes, runtime)
│   └── Code.js             # source of truth
├── waitlist-blast/         # Bulk email sender (sendWaitlistBlast, sendReminderBlast)
│   ├── .clasp.json
│   ├── appsscript.json
│   └── Code.js
└── ciw-waitlist/           # CIW signup form receiver (doPost, doGet)
    ├── .clasp.json
    ├── appsscript.json     # webapp config: USER_DEPLOYING + ANYONE_ANONYMOUS
    └── Code.js
```

**Source of truth:** `apps-script/<name>/Code.js`. Never maintain a separate copy elsewhere.

## Daily workflow

**Edit a function:**
1. Edit `apps-script/<project>/Code.js` directly
2. `cd` into that folder, run `clasp push -f` → live in seconds
3. (For web-app deployments) `clasp deploy --deploymentId <id>` to refresh the production URL

**Add a new function:**
Same as above. Just write the function in `Code.js` and push.

**Verify what's live matches local:**
`clasp pull` — overwrites local with live. Diff against git to spot drift.

## Test before push
- `clasp run <functionName>` — runs a function on the live script. Use for smoke tests.
- For web apps, the HEAD deployment URL always points to the latest pushed code → useful for testing without bumping the production deployment.

## When you still need Majid (rare)
- **New OAuth scope** added to `appsscript.json` → first run after push prompts re-authorization in the browser. One-time per scope.
- **New time-based trigger** (daily/weekly cron) → must be created once in the browser editor (Triggers menu). After that, edits to the called function flow through clasp normally.
- **New web app deployment on Workspace** → first deploy via clasp defaults to "Anyone within malearnsa.com" regardless of `webapp.access` in manifest. Open Deploy → Manage Deployments → edit → set "Anyone" → Deploy. One-time per deployment.
- **First run on a new script** → owner must run any function once from the editor to approve OAuth scopes, otherwise anonymous requests get silent failures.

## Troubleshooting
- `Error: User has not enabled the Apps Script API` → toggle ON at https://script.google.com/home/usersettings
- `clasp push` overwrites live blindly. Always `clasp pull` first if there's a chance someone edited in the browser since last push.
- Wrong account showing in `clasp list` → `clasp logout && clasp login`, pick Majid@malearnsa.com
