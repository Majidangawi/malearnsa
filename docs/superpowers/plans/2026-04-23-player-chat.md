# Player Chat V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship per-lesson realtime chat inside the MA Learn player (`player.malearnsa.com`) for BL and ITCAI courses, backed by Firestore + Firebase Auth custom tokens minted by the existing Apps Script token-validator.

**Architecture:** Three moving parts. (1) **Apps Script** mints Firebase custom tokens on top of the existing MA Learn token-validator flow — chat never checks purchase state on its own. (2) **Firestore + Cloud Functions** hold the data + run weekly wipe/archive + daily pin-expiry. (3) **Player client** adds a tabbed lesson body (Description / Discussion / Pinned), realtime `onSnapshot` listeners, a composer with `@mention` autocomplete, and Majid-only moderation. Visual language follows the Editorial Atelier tokens already shipped.

**Tech Stack:** Vanilla ES modules · Firebase Web SDK v10 (modular) · Firestore security rules · Cloud Functions for Firebase (Node 20) · Cloud Scheduler · Google Sheets API · Apps Script (V8 runtime) · RS256 JWT for custom token signing.

**Spec:** `docs/superpowers/specs/2026-04-23-player-chat-design.md` (commit `d21d9be`)

---

## File structure

### NEW — Firebase project at `~/code/malearn-chat/`

```
malearn-chat/
├── .firebaserc
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── functions/
│   ├── package.json
│   ├── index.js                     # entry — exports wipe + pinExpiry + noorAlert
│   ├── src/
│   │   ├── weeklyWipe.js
│   │   ├── pinExpiry.js
│   │   ├── archiveToSheet.js
│   │   ├── noorAlert.js
│   │   └── isoWeek.js               # pure util
│   └── test/
│       ├── weeklyWipe.test.js
│       ├── pinExpiry.test.js
│       └── isoWeek.test.js
└── rules-tests/
    ├── package.json
    ├── messages.test.js
    ├── pins.test.js
    ├── users.test.js
    └── bans.test.js
```

### MODIFIED — Player at `~/code/malearnsa-player/`

```
malearnsa-player/
├── watch.html                        # add chat tabs, modals, SDK imports
├── css/
│   ├── primitives.css                # +3 imports
│   ├── primitives/
│   │   ├── tabs.css                  # NEW
│   │   ├── modal.css                 # NEW
│   │   └── dropdown.css              # NEW
│   └── chat.css                      # NEW — page-scoped chat styles
└── js/
    ├── firebase-config.js            # NEW
    └── chat/
        ├── auth.js                   # NEW
        ├── messages.js               # NEW
        ├── mentions.js               # NEW
        ├── moderation.js             # NEW
        ├── pins.js                   # NEW
        ├── unread.js                 # NEW
        └── displayName.js            # NEW
```

### MODIFIED — Apps Script at `projects/ma-learn-launch/apps-script/token-validator/`

```
token-validator/
├── Code.js                           # add action=mint_firebase_token
├── FirebaseAdmin.js                  # NEW — RS256 JWT signing
└── appsscript.json                   # unchanged (already has Script Properties + UrlFetch)
```

---

## Prerequisites (complete before Task 1)

Each item must be verified, not assumed:

- [ ] **P1:** Redesign Phases 1–5 live. Run `curl -s https://player.malearnsa.com/watch.html | grep -c '\-\-c-ink-0'` — expect ≥ 1.
- [ ] **P2:** `~/code/malearnsa-player/` clone exists and is on `main`, clean working tree (`git -C ~/code/malearnsa-player status`).
- [ ] **P3:** Apps Script token-validator scriptId matches memory `reference_apps_script_ids.md`: `1L9-cZE...`. Verify: `cat projects/ma-learn-launch/apps-script/token-validator/.clasp.json` shows that scriptId (per `feedback_verify_clasp_before_push.md`).
- [ ] **P4:** Node 20+ installed (`node --version`).
- [ ] **P5:** Firebase CLI installed (`firebase --version` ≥ 13).
- [ ] **P6:** `clasp` installed and logged in (`clasp login --status`).
- [ ] **P7:** Majid has a Firebase-eligible Google account. We'll use `majid@malearnsa.com` (Workspace) since it already owns the Apps Script (per memory `project_apps_script_account.md`).

---

## Phase A — Backend foundation

Lays down the Firebase project, security rules, Firestore schema, Apps Script custom-token minting, and the Cloud Function scaffolding. No UI changes. Exits when a student (via test curl against Apps Script) can obtain a Firebase custom token and sign in successfully.

### Task 1: Initialize Firebase project directory

**Files:**
- Create: `~/code/malearn-chat/.firebaserc`
- Create: `~/code/malearn-chat/firebase.json`
- Create: `~/code/malearn-chat/.gitignore`

- [ ] **Step 1: Create the directory and init git**

```bash
mkdir -p ~/code/malearn-chat
cd ~/code/malearn-chat
git init
```

- [ ] **Step 2: Create `.firebaserc`** — project alias for `malearn-chat` (actual project ID assigned in Task 2)

```json
{
  "projects": {
    "default": "malearn-chat"
  }
}
```

- [ ] **Step 3: Create `firebase.json`** — tells Firebase CLI what to deploy

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "runtime": "nodejs20"
    }
  ],
  "emulators": {
    "firestore": { "port": 8080 },
    "functions": { "port": 5001 },
    "auth":      { "port": 9099 },
    "ui":        { "enabled": true, "port": 4000 }
  }
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
.env
.env.*
*.log
.DS_Store
functions/lib/
rules-tests/node_modules/
.firebase/
*.pem
*service-account*.json
```

- [ ] **Step 5: Commit**

```bash
git add .firebaserc firebase.json .gitignore
git commit -m "chore: init malearn-chat firebase project scaffolding"
```

### Task 2: Create the Firebase project in the Google Cloud Console (manual)

**Files:** none (this is a one-time cloud setup step).

- [ ] **Step 1: Create project in https://console.firebase.google.com/**
  - Sign in as `majid@malearnsa.com`
  - Project name: `MA Learn Chat`
  - Project ID: `malearn-chat` (exact — matches `.firebaserc`)
  - Google Analytics: **disabled** (we don't need it)

- [ ] **Step 2: Enable Firestore**
  - Build → Firestore Database → Create database
  - Location: `eur3` (multi-region Europe — lowest latency for KSA + EU students)
  - Start in **production mode** (we'll replace default rules in Task 4)

- [ ] **Step 3: Enable Authentication with Custom Token sign-in**
  - Build → Authentication → Get started
  - Sign-in method tab → nothing to enable in the UI for Custom Tokens (always on). Skip email/Google/etc — we only use server-minted custom tokens.

- [ ] **Step 4: Enable Cloud Functions**
  - Build → Functions → Get started → **upgrade project to Blaze plan** (required for Cloud Functions). Set a budget alert at **$10/month** (per spec §11 ceiling).

- [ ] **Step 5: Download service account key**
  - Project Settings → Service accounts → Generate new private key (Firebase Admin SDK)
  - Save as `~/Downloads/malearn-chat-firebase-adminsdk.json` (temporary — used in Task 7)

- [ ] **Step 6: Login Firebase CLI to this project**

```bash
cd ~/code/malearn-chat
firebase login --reauth
firebase use malearn-chat
```

Expected: `Now using project malearn-chat`.

### Task 3: Write the initial security rules (all denied by default)

**Files:**
- Create: `~/code/malearn-chat/firestore.rules`
- Create: `~/code/malearn-chat/firestore.indexes.json`

- [ ] **Step 1: Create `firestore.rules`** — deny everything except what we explicitly allow later

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // Default deny. Every collection below explicitly opens access.
    match /{document=**} { allow read, write: if false; }
  }
}
```

- [ ] **Step 2: Create `firestore.indexes.json`**

```json
{
  "indexes": [
    {
      "collectionGroup": "messages",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "createdAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "messages",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "mentions", "arrayConfig": "CONTAINS" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 3: Deploy the empty ruleset to verify wiring**

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Expected: `✔  Deploy complete!`

- [ ] **Step 4: Commit**

```bash
git add firestore.rules firestore.indexes.json
git commit -m "chore(rules): initial default-deny firestore rules + indexes"
```

### Task 4: Scaffold the rules-tests harness

**Files:**
- Create: `~/code/malearn-chat/rules-tests/package.json`
- Create: `~/code/malearn-chat/rules-tests/.mocharc.cjs`

- [ ] **Step 1: Create `rules-tests/package.json`**

```json
{
  "name": "malearn-chat-rules-tests",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "firebase emulators:exec --only firestore 'mocha --timeout 15000 \"**/*.test.js\"'"
  },
  "devDependencies": {
    "@firebase/rules-unit-testing": "^3.0.3",
    "firebase": "^10.12.0",
    "mocha": "^10.4.0"
  }
}
```

- [ ] **Step 2: Create `rules-tests/.mocharc.cjs`**

```javascript
module.exports = {
  spec: ['**/*.test.js'],
  ignore: ['node_modules/**']
};
```

- [ ] **Step 3: Install dependencies**

```bash
cd ~/code/malearn-chat/rules-tests
npm install
```

Expected: `added XXX packages`.

- [ ] **Step 4: Commit**

```bash
cd ~/code/malearn-chat
git add rules-tests/package.json rules-tests/.mocharc.cjs rules-tests/package-lock.json
git commit -m "chore(rules-tests): scaffold mocha + firebase rules unit testing"
```

### Task 5: Write failing tests for user-profile rules

**Files:**
- Create: `~/code/malearn-chat/rules-tests/users.test.js`

- [ ] **Step 1: Write `users.test.js`**

```javascript
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';

describe('users/{uid} rules', () => {
  let env;
  before(async () => {
    env = await initializeTestEnvironment({
      projectId: 'malearn-chat-test',
      firestore: {
        rules: readFileSync('../firestore.rules', 'utf8'),
        host: '127.0.0.1',
        port: 8080
      }
    });
  });
  after(async () => env.cleanup());
  beforeEach(async () => env.clearFirestore());

  it('authed user can read their own profile', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(getDoc(doc(alice, 'users/alice')));
  });

  it('authed user cannot read another user profile', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(getDoc(doc(alice, 'users/bob')));
  });

  it('authed user can create their own profile with displayName', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(alice, 'users/alice'), {
      displayName: 'Alice',
      email: 'alice@x.com',
      isMajid: false,
      createdAt: Date.now(),
      lastSeen: {}
    }));
  });

  it('authed user cannot claim isMajid: true', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(alice, 'users/alice'), {
      displayName: 'Alice',
      email: 'alice@x.com',
      isMajid: true,
      createdAt: Date.now(),
      lastSeen: {}
    }));
  });

  it('unauthed user cannot read any profile', async () => {
    const guest = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(guest, 'users/alice')));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/code/malearn-chat/rules-tests
npm test
```

Expected: 5 failures, all `PERMISSION_DENIED` (current rules deny everything).

- [ ] **Step 3: Commit**

```bash
cd ~/code/malearn-chat
git add rules-tests/users.test.js
git commit -m "test(rules): failing tests for users/{uid} access"
```

### Task 6: Implement user-profile rules to pass Task 5 tests

**Files:**
- Modify: `~/code/malearn-chat/firestore.rules`

- [ ] **Step 1: Replace `firestore.rules` with:**

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ── Helpers ─────────────────────────────────────────────────
    function isSignedIn() { return request.auth != null; }
    function isSelf(uid) { return isSignedIn() && request.auth.uid == uid; }
    function isMajid() { return isSignedIn() && request.auth.token.isMajid == true; }

    // ── users/{uid} ─────────────────────────────────────────────
    match /users/{uid} {
      allow read: if isSelf(uid) || isMajid();

      allow create: if isSelf(uid)
        && request.resource.data.isMajid == false
        && request.resource.data.keys().hasAll(['displayName','email','isMajid','createdAt','lastSeen']);

      allow update: if isSelf(uid)
        && request.resource.data.isMajid == resource.data.isMajid  // cannot change isMajid
        && request.resource.data.email == resource.data.email;     // cannot change email
    }

    // Default deny everything else.
    match /{document=**} { allow read, write: if false; }
  }
}
```

- [ ] **Step 2: Run tests**

```bash
cd ~/code/malearn-chat/rules-tests
npm test
```

Expected: 5 passing.

- [ ] **Step 3: Deploy rules**

```bash
cd ~/code/malearn-chat
firebase deploy --only firestore:rules
```

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat(rules): users/{uid} — self read/write, cannot claim isMajid"
```

### Task 7: Scaffold Cloud Functions package

**Files:**
- Create: `~/code/malearn-chat/functions/package.json`
- Create: `~/code/malearn-chat/functions/index.js`
- Create: `~/code/malearn-chat/functions/.eslintrc.cjs`

- [ ] **Step 1: Create `functions/package.json`**

```json
{
  "name": "malearn-chat-functions",
  "version": "0.0.1",
  "private": true,
  "main": "index.js",
  "type": "module",
  "engines": { "node": "20" },
  "scripts": {
    "serve": "firebase emulators:start --only functions,firestore",
    "deploy": "firebase deploy --only functions",
    "test": "mocha --timeout 15000 'test/**/*.test.js'",
    "logs": "firebase functions:log"
  },
  "dependencies": {
    "firebase-admin": "^12.1.0",
    "firebase-functions": "^5.0.1",
    "googleapis": "^134.0.0"
  },
  "devDependencies": {
    "mocha": "^10.4.0",
    "sinon": "^18.0.0"
  }
}
```

- [ ] **Step 2: Create `functions/index.js` (empty entry point)**

```javascript
// Entry point — individual handlers wired up in later tasks.
import * as admin from 'firebase-admin';
admin.initializeApp();

// Exported handlers are attached in Tasks 20, 21, 22.
```

- [ ] **Step 3: Create `.eslintrc.cjs`**

```javascript
module.exports = {
  env: { node: true, es2024: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' }
};
```

- [ ] **Step 4: Install deps**

```bash
cd ~/code/malearn-chat/functions
npm install
```

- [ ] **Step 5: Commit**

```bash
cd ~/code/malearn-chat
git add functions/package.json functions/index.js functions/.eslintrc.cjs functions/package-lock.json
git commit -m "chore(functions): scaffold firebase functions package"
```

### Task 8: Store Firebase Admin service account key in Apps Script Properties

**Files:** none locally. Apps Script Properties Service only.

**Context:** Apps Script needs the Firebase Admin SDK private key to sign custom tokens. We store it as a Script Property so it's never checked into git.

- [ ] **Step 1: Open the downloaded service account JSON**

```bash
cat ~/Downloads/malearn-chat-firebase-adminsdk.json
```

Copy the entire JSON content to clipboard.

- [ ] **Step 2: Open token-validator Apps Script**

Open https://script.google.com/ → `token-validator` (scriptId per memory `reference_apps_script_ids.md`).

- [ ] **Step 3: Set Script Properties**

Project Settings (gear icon) → Script Properties → Add script property:

- Key: `FIREBASE_SERVICE_ACCOUNT`
- Value: (paste the full JSON)

- Key: `FIREBASE_PROJECT_ID`
- Value: `malearn-chat`

- [ ] **Step 4: Delete the local JSON file**

```bash
rm ~/Downloads/malearn-chat-firebase-adminsdk.json
```

Per memory `feedback_show_before_delete.md`: Majid has approved this delete in the spec (one-time key handoff). Confirm with Majid in chat before executing.

### Task 9: Implement `FirebaseAdmin.js` (RS256 JWT signing) in Apps Script

**Files:**
- Create: `projects/ma-learn-launch/apps-script/token-validator/FirebaseAdmin.js`

- [ ] **Step 1: Create the file with:**

```javascript
/**
 * FirebaseAdmin.js
 * Mint Firebase custom tokens from Apps Script using RS256 signing with
 * the service account private key stored in Script Properties.
 *
 * Contract: mintCustomToken_(uid, claims) -> signed JWT string (1h expiry)
 */

var FIREBASE_AUDIENCE_ = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';

function mintCustomToken_(uid, claims) {
  var props = PropertiesService.getScriptProperties();
  var serviceAccountJson = props.getProperty('FIREBASE_SERVICE_ACCOUNT');
  if (!serviceAccountJson) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
  var serviceAccount = JSON.parse(serviceAccountJson);

  var now = Math.floor(Date.now() / 1000);
  var header = { alg: 'RS256', typ: 'JWT' };
  var payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: FIREBASE_AUDIENCE_,
    iat: now,
    exp: now + 3600,
    uid: String(uid),
    claims: claims || {}
  };

  var encHeader = base64UrlEncode_(JSON.stringify(header));
  var encPayload = base64UrlEncode_(JSON.stringify(payload));
  var signingInput = encHeader + '.' + encPayload;

  var signatureBytes = Utilities.computeRsaSha256Signature(
    signingInput,
    serviceAccount.private_key
  );
  var encSignature = base64UrlEncodeBytes_(signatureBytes);

  return signingInput + '.' + encSignature;
}

function base64UrlEncode_(str) {
  return base64UrlEncodeBytes_(Utilities.newBlob(str).getBytes());
}

function base64UrlEncodeBytes_(bytes) {
  return Utilities.base64Encode(bytes)
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
```

- [ ] **Step 2: Verify syntactically via Apps Script editor**

Open `token-validator` in Apps Script, paste the file contents as `FirebaseAdmin.js`, save. Confirm no syntax errors.

### Task 10: Add `action=mint_firebase_token` endpoint to `Code.js`

**Files:**
- Modify: `projects/ma-learn-launch/apps-script/token-validator/Code.js` (near the existing `doGet` action dispatcher)

- [ ] **Step 1: Locate the `doGet` action switch in `Code.js`**

Grep within the file for `action === 'validate_token'` to find the dispatcher block.

- [ ] **Step 2: Add a new branch for `mint_firebase_token`**

Inside the `if/else` chain in `doGet`, insert a new branch:

```javascript
} else if (action === 'mint_firebase_token') {
  return handleMintFirebaseToken_(e);
```

- [ ] **Step 3: Add the handler function at the bottom of `Code.js`**

```javascript
/**
 * action=mint_firebase_token
 * Params: token (required), course (required)
 * Validates the MA Learn token, looks up the student, mints a Firebase
 * custom token with { uid: <hash(email)>, displayName?, isMajid } claims.
 * Returns: { ok: true, firebaseToken, uid, displayName?, isMajid }
 */
function handleMintFirebaseToken_(e) {
  var token = e.parameter.token;
  var course = e.parameter.course;
  if (!token || !course) {
    return jsonOut_({ ok: false, error: 'missing token or course' });
  }

  var row = lookupTokenRow_(token, course);
  if (!row) return jsonOut_({ ok: false, error: 'invalid token' });

  var email = String(row.email || '').toLowerCase();
  var isMajid = (email === 'majid@malearnsa.com' || email === 'majed.engawi@gmail.com');
  var uid = 'u_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email)
  ).replace(/=+$/, '').slice(0, 28);

  var claims = { isMajid: isMajid };
  var firebaseToken = mintCustomToken_(uid, claims);

  return jsonOut_({
    ok: true,
    firebaseToken: firebaseToken,
    uid: uid,
    email: email,
    displayName: row.displayName || null,
    isMajid: isMajid
  });
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

- [ ] **Step 4: Verify `lookupTokenRow_` already exists and returns `{ email, ... }`**

Grep Code.js for `function lookupTokenRow_`. If it's named differently (e.g. `findTokenRow_`, `validateToken_`), adapt the call above. DO NOT invent a new helper — reuse whatever the existing `validate_token` action uses internally.

- [ ] **Step 5: Save + deploy Apps Script**

```bash
cd "/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA/projects/ma-learn-launch/apps-script/token-validator"
clasp push
```

Per memory `feedback_verify_clasp_before_push.md`: confirm `.clasp.json` scriptId matches `1L9-cZE...` before pushing.

- [ ] **Step 6: Smoke test**

```bash
curl "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?action=mint_firebase_token&token=<valid-test-token>&course=itcai"
```

Expected: `{ "ok": true, "firebaseToken": "eyJ...", "uid": "u_...", "isMajid": false, ... }`

- [ ] **Step 7: Commit**

```bash
cd "/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA"
git add projects/ma-learn-launch/apps-script/token-validator/Code.js projects/ma-learn-launch/apps-script/token-validator/FirebaseAdmin.js
git commit -m "feat(apps-script): mint_firebase_token endpoint + RS256 signing"
```

### Task 11: Verify Firebase Auth accepts the custom token

**Files:** none (smoke test only).

- [ ] **Step 1: Create a throwaway HTML test page**

Save as `/tmp/fb-smoke.html`:

```html
<!DOCTYPE html>
<html><body>
<script type="module">
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, signInWithCustomToken } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const app = initializeApp({
  apiKey: 'PASTE_WEB_API_KEY_FROM_FIREBASE_CONSOLE',
  authDomain: 'malearn-chat.firebaseapp.com',
  projectId: 'malearn-chat'
});
const auth = getAuth(app);

const token = 'PASTE_TOKEN_FROM_TASK_10_STEP_6';
signInWithCustomToken(auth, token)
  .then(cred => document.body.innerText = 'OK uid=' + cred.user.uid)
  .catch(err => document.body.innerText = 'FAIL ' + err.message);
</script>
</body></html>
```

- [ ] **Step 2: Open in browser**

```bash
open /tmp/fb-smoke.html
```

Expected: page shows `OK uid=u_<hash>`.

- [ ] **Step 3: Delete the throwaway**

```bash
rm /tmp/fb-smoke.html
```

If this fails, revisit Task 9/10 before continuing.

---

## Phase B — Core player UI

Ships tabbed lesson body + realtime messages + composer + display-name modal + Majid moderation menu on staging (`player.malearnsa.com`). No @mentions, no unread badges, no wipe yet. Exits when Majid can post and delete messages in a real lesson room.

### Task 12: Add tabs primitive CSS

**Files:**
- Create: `~/code/malearnsa-player/css/primitives/tabs.css`
- Modify: `~/code/malearnsa-player/css/primitives.css`

- [ ] **Step 1: Create `tabs.css`**

```css
/* ── Tabs primitive — editorial underline ────────────────────────── */
[data-ui="tabs"] {
  display: flex; flex-direction: column; min-height: 0;
}
[data-ui="tabs"] > [data-role="tablist"] {
  display: flex; gap: var(--s-5);
  border-bottom: 0.5px solid var(--c-ink-4);
  padding: 0 var(--s-2);
  position: relative;
}
[data-ui="tabs"] > [data-role="tablist"] > [role="tab"] {
  background: transparent; border: 0; cursor: pointer;
  padding: var(--s-3) 0; margin: 0;
  font-size: var(--fs-label); letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--c-fg-2); font-weight: 500;
  border-bottom: 2px solid transparent;
  transition: color var(--dur-fast) var(--ease-out),
              border-color var(--dur-med) var(--ease-out);
}
[data-ui="tabs"] > [data-role="tablist"] > [role="tab"]:hover { color: var(--c-fg); }
[data-ui="tabs"] > [data-role="tablist"] > [role="tab"][aria-selected="true"] {
  color: var(--c-fg); border-bottom-color: var(--c-gold);
}
[data-ui="tabs"] > [data-role="tablist"] > [role="tab"] .tab-count {
  margin-inline-start: var(--s-1);
  color: var(--c-gold); font-variant-numeric: tabular-nums;
}
[data-ui="tabs"] > [data-role="tabpanel"] {
  display: none; flex: 1; min-height: 0;
  padding-top: var(--s-4);
}
[data-ui="tabs"] > [data-role="tabpanel"][data-state="active"] { display: flex; flex-direction: column; }
```

- [ ] **Step 2: Import in `primitives.css`**

Open `~/code/malearnsa-player/css/primitives.css` and add at the top (after existing `@import` lines):

```css
@import url('primitives/tabs.css');
```

- [ ] **Step 3: Commit**

```bash
cd ~/code/malearnsa-player
git add css/primitives/tabs.css css/primitives.css
git commit -m "feat(primitives): tabs — editorial underline variant"
```

### Task 13: Add modal + dropdown primitive CSS

**Files:**
- Create: `~/code/malearnsa-player/css/primitives/modal.css`
- Create: `~/code/malearnsa-player/css/primitives/dropdown.css`
- Modify: `~/code/malearnsa-player/css/primitives.css`

- [ ] **Step 1: Create `modal.css`**

```css
/* ── Modal primitive ─────────────────────────────────────────────── */
[data-ui="modal"] {
  position: fixed; inset: 0; z-index: 1000;
  display: none; align-items: center; justify-content: center;
  padding: var(--s-4);
}
[data-ui="modal"][data-state="open"] { display: flex; }
[data-ui="modal"] > .backdrop {
  position: absolute; inset: 0;
  background: oklch(0.04 0.003 82 / 0.72);
  backdrop-filter: blur(4px);
}
[data-ui="modal"] > .panel {
  position: relative;
  background: var(--c-ink-1);
  border: 0.5px solid var(--c-ink-4);
  border-radius: var(--r-lg);
  box-shadow: var(--e-modal);
  padding: var(--s-6);
  width: min(440px, 100%);
  animation: modalIn var(--dur-med) var(--ease-out);
}
[data-ui="modal"] > .panel > h2 {
  font-size: var(--fs-h2); margin-bottom: var(--s-3);
}
[data-ui="modal"] > .panel > p {
  color: var(--c-fg-2); margin-bottom: var(--s-5);
  font-size: var(--fs-body-sm); line-height: 1.6;
}
[data-ui="modal"] > .panel > .actions {
  display: flex; gap: var(--s-3); justify-content: flex-end;
}
@keyframes modalIn {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: none; }
}
```

- [ ] **Step 2: Create `dropdown.css`**

```css
/* ── Dropdown / menu primitive ───────────────────────────────────── */
[data-ui="menu"] {
  position: absolute; z-index: 900;
  background: var(--c-ink-2);
  border: 0.5px solid var(--c-ink-4);
  border-radius: var(--r-md);
  box-shadow: var(--e-raised);
  padding: var(--s-2);
  min-width: 180px; max-height: 280px;
  overflow-y: auto;
  display: none;
}
[data-ui="menu"][data-state="open"] { display: block; }
[data-ui="menu"] > [role="menuitem"] {
  display: flex; align-items: center; gap: var(--s-2);
  height: 32px; padding: 0 var(--s-2);
  border: 0; background: transparent; width: 100%;
  text-align: start; cursor: pointer;
  color: var(--c-fg); font-size: var(--fs-body-sm);
  border-radius: var(--r-sm);
}
[data-ui="menu"] > [role="menuitem"]:hover,
[data-ui="menu"] > [role="menuitem"][data-active="true"] {
  background: var(--c-ink-3);
}
[data-ui="menu"] > [role="menuitem"][data-tone="danger"] { color: var(--c-danger); }
[data-ui="menu"] > hr {
  border: 0; border-top: 0.5px solid var(--c-ink-4);
  margin: var(--s-1) 0;
}
```

- [ ] **Step 3: Update `primitives.css` imports**

```css
@import url('primitives/tabs.css');
@import url('primitives/modal.css');
@import url('primitives/dropdown.css');
@import url('primitives/toggle.css');
@import url('primitives/toast.css');
@import url('primitives/loader.css');
```

- [ ] **Step 4: Commit**

```bash
git add css/primitives/modal.css css/primitives/dropdown.css css/primitives.css
git commit -m "feat(primitives): modal + dropdown/menu primitives"
```

### Task 14: Add chat.css page styling

**Files:**
- Create: `~/code/malearnsa-player/css/chat.css`

- [ ] **Step 1: Create `chat.css`**

```css
/* ── Chat panel — inside Discussion tab ──────────────────────────── */
.chat-panel {
  display: flex; flex-direction: column; min-height: 0;
  gap: var(--s-3);
  height: 60vh; max-height: 640px;
}
.chat-empty {
  display: flex; align-items: center; justify-content: center;
  flex: 1; color: var(--c-fg-3); font-size: var(--fs-body-sm);
  text-align: center; padding: var(--s-6);
}
.chat-list {
  flex: 1; overflow-y: auto;
  padding: var(--s-3) var(--s-2);
  display: flex; flex-direction: column; gap: var(--s-3);
}
.chat-list::-webkit-scrollbar { width: 3px; }
.chat-list::-webkit-scrollbar-thumb { background: var(--c-gold-faint); border-radius: 2px; }

.chat-message {
  display: grid; grid-template-columns: 28px 1fr auto;
  gap: var(--s-3); align-items: start;
  padding: var(--s-2) var(--s-2);
  border-radius: var(--r-sm);
  position: relative;
}
.chat-message:hover { background: var(--c-ink-2); }
.chat-message[data-is-majid="true"] {
  background: var(--c-gold-faint);
  border-inline-start: 2px solid var(--c-gold);
  padding-inline-start: var(--s-3);
}
.chat-message[data-deleted="true"] .chat-body {
  color: var(--c-fg-4); font-style: italic;
}
.chat-message[data-mentioned-self="true"] {
  border-inline-start: 2px solid var(--c-gold-bright);
}
.chat-author {
  grid-column: 2; display: flex; align-items: center; gap: var(--s-2);
  font-size: var(--fs-label); letter-spacing: 0.05em;
  color: var(--c-fg-2); font-weight: 600;
}
.chat-author[data-is-majid="true"] {
  color: var(--c-gold-bright);
}
.chat-author .verified {
  font-size: 10px; color: var(--c-gold);
}
.chat-body {
  grid-column: 2; font-size: var(--fs-body-sm);
  line-height: 1.6; color: var(--c-fg); word-wrap: break-word;
}
.chat-body a { color: var(--c-gold-bright); text-decoration: underline; text-underline-offset: 3px; }
.chat-body .mention {
  background: var(--c-gold-faint);
  color: var(--c-gold-bright);
  padding: 1px 4px; border-radius: var(--r-xs);
  font-weight: 500;
}
.chat-time {
  grid-column: 3; font-size: 10px;
  color: var(--c-fg-3); font-variant-numeric: tabular-nums;
  align-self: start;
}
.chat-actions-trigger {
  position: absolute; top: var(--s-1); inset-inline-end: var(--s-1);
  display: none;
  background: transparent; border: 0; cursor: pointer;
  color: var(--c-fg-3); padding: 2px 6px; border-radius: var(--r-xs);
}
.chat-message:hover .chat-actions-trigger { display: inline-block; }

/* ── Composer ────────────────────────────────────────────────────── */
.chat-composer {
  display: flex; gap: var(--s-2); align-items: flex-end;
  padding: var(--s-2);
  border-top: 0.5px solid var(--c-ink-4);
  position: relative;
}
.chat-composer textarea {
  flex: 1; resize: none;
  min-height: 40px; max-height: 120px;
  line-height: 1.5;
}
.chat-composer .char-count {
  position: absolute; top: var(--s-1); inset-inline-end: 56px;
  font-size: 10px; color: var(--c-fg-3);
}
.chat-composer .char-count[data-state="warn"] { color: var(--c-warning); }
.chat-composer .char-count[data-state="error"] { color: var(--c-danger); }

/* ── Pinned panel ────────────────────────────────────────────────── */
.pinned-panel {
  display: flex; flex-direction: column; gap: var(--s-3);
  max-height: 60vh; overflow-y: auto;
}
.pinned-empty {
  color: var(--c-fg-3); font-size: var(--fs-body-sm);
  text-align: center; padding: var(--s-6);
}
.pinned-item {
  background: var(--c-gold-faint);
  border-inline-start: 2px solid var(--c-gold);
  padding: var(--s-3);
  border-radius: var(--r-sm);
}
.pinned-item .pinned-meta {
  font-size: var(--fs-label); color: var(--c-gold-bright);
  letter-spacing: 0.05em; text-transform: uppercase; font-weight: 600;
  margin-bottom: var(--s-2);
}
.pinned-item .pinned-expiry {
  margin-inline-start: var(--s-2);
  color: var(--c-fg-3); text-transform: none; letter-spacing: 0;
}

/* ── @mention autocomplete ───────────────────────────────────────── */
.mention-autocomplete {
  position: absolute; bottom: 100%; inset-inline-start: 0;
  margin-bottom: var(--s-2);
  min-width: 220px; max-height: 220px; overflow-y: auto;
  background: var(--c-ink-2); border: 0.5px solid var(--c-ink-4);
  border-radius: var(--r-md); box-shadow: var(--e-raised);
  padding: var(--s-2);
  display: none;
}
.mention-autocomplete[data-state="open"] { display: block; }
.mention-autocomplete .mention-item {
  display: flex; align-items: center; gap: var(--s-2);
  height: 32px; padding: 0 var(--s-2);
  border-radius: var(--r-sm); cursor: pointer;
}
.mention-autocomplete .mention-item[data-active="true"],
.mention-autocomplete .mention-item:hover { background: var(--c-ink-3); }
.mention-autocomplete .mention-item[data-is-majid="true"] {
  color: var(--c-gold-bright); font-weight: 600;
}

/* ── Unread badge on lessons sidebar ─────────────────────────────── */
.lesson-item .unread-dot {
  display: none;
  margin-inline-start: auto;
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--c-danger);
  flex-shrink: 0;
}
.lesson-item[data-unread] .unread-dot { display: inline-block; }
.lesson-item[data-mentioned] .mention-mark {
  display: inline-block;
  color: var(--c-gold); font-weight: 700; margin-inline-start: var(--s-1);
}
.lesson-item .mention-mark { display: none; }

/* ── Mobile — composer pins to bottom, video becomes mini ─────────── */
@media (max-width: 760px) {
  .chat-panel { height: calc(100dvh - 56vh); }
  .chat-composer.keyboard-active { position: fixed; bottom: 0; left: 0; right: 0; z-index: 400; background: var(--c-ink-1); }
  .video-area.mini {
    position: fixed; bottom: 72px; inset-inline-end: var(--s-3);
    width: 140px; aspect-ratio: 16/9;
    z-index: 450; border-radius: var(--r-md);
    box-shadow: var(--e-modal); overflow: hidden;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add css/chat.css
git commit -m "feat(player): chat.css page-scoped styles"
```

### Task 15: Add Firebase SDK + chat script imports + tab structure to `watch.html`

**Files:**
- Modify: `~/code/malearnsa-player/watch.html`

- [ ] **Step 1: Add stylesheet link in `<head>`** after the existing `primitives.css` link

```html
<link rel="stylesheet" href="css/chat.css">
```

- [ ] **Step 2: Wrap `lesson-info` internals in a tabs structure**

Find in `watch.html` (around line 589–614):

```html
<div class="lesson-info">
  <p class="lesson-module-tag" id="lesson-module">—</p>
  <h2 class="lesson-title" id="lesson-title">...</h2>
  ... (existing content through lesson-nav) ...
  <aside class="player-notes" hidden></aside>
</div>
```

Replace with:

```html
<div class="lesson-info">
  <div data-ui="tabs" id="lesson-tabs">
    <div data-role="tablist" role="tablist">
      <button role="tab" aria-selected="true" data-panel="panel-desc" id="tab-desc">الوصف</button>
      <button role="tab" aria-selected="false" data-panel="panel-chat" id="tab-chat">
        <span class="tab-label">النقاش</span>
        <span class="tab-count" id="tab-chat-count" hidden></span>
      </button>
      <button role="tab" aria-selected="false" data-panel="panel-pinned" id="tab-pinned">
        <span class="tab-label">مثبت</span>
        <span class="tab-count" id="tab-pinned-count" hidden></span>
      </button>
    </div>

    <div data-role="tabpanel" data-state="active" id="panel-desc" role="tabpanel" aria-labelledby="tab-desc">
      <p class="lesson-module-tag" id="lesson-module">—</p>
      <h2 class="lesson-title" id="lesson-title">اختر درساً من القائمة</h2>
      <p class="lesson-desc" id="lesson-desc">اختر أي درس من القائمة لتبدأ المشاهدة.</p>
      <div id="lesson-content" class="lesson-content"></div>
      <div id="pdf-area" style="display:none;">
        <a id="pdf-btn" href="#" target="_blank" class="pdf-btn" data-ui="btn" data-variant="primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>
          </svg>
          تحميل ملف PDF
        </a>
      </div>
      <div class="lesson-nav">
        <button class="nav-btn" id="btn-prev" onclick="nav(-1)" disabled>→ السابق</button>
        <button class="nav-btn primary" id="btn-next" onclick="nav(1)" disabled>التالي ←</button>
      </div>
      <aside class="player-notes" hidden></aside>
    </div>

    <div data-role="tabpanel" id="panel-chat" role="tabpanel" aria-labelledby="tab-chat">
      <div class="chat-panel">
        <div class="chat-empty" id="chat-empty">كن أول من يشارك فكرة أو سؤال في هذا الدرس.</div>
        <div class="chat-list" id="chat-list" hidden></div>
        <div class="chat-composer" id="chat-composer">
          <textarea data-ui="textarea" id="composer-input" maxlength="500" placeholder="اكتب رسالة..."></textarea>
          <span class="char-count" id="char-count"></span>
          <button data-ui="btn" data-variant="primary" data-size="sm" id="composer-send" disabled>إرسال</button>
          <div class="mention-autocomplete" id="mention-ac"></div>
        </div>
      </div>
    </div>

    <div data-role="tabpanel" id="panel-pinned" role="tabpanel" aria-labelledby="tab-pinned">
      <div class="pinned-panel" id="pinned-panel">
        <div class="pinned-empty">لا توجد رسائل مثبتة بعد.</div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add ES module imports before `</body>`**

```html
<script type="module" src="js/chat/auth.js"></script>
<script type="module" src="js/chat/messages.js"></script>
<script type="module" src="js/chat/displayName.js"></script>
<script type="module" src="js/chat/moderation.js"></script>
<script type="module" src="js/chat/pins.js"></script>
<script type="module" src="js/chat/mentions.js"></script>
<script type="module" src="js/chat/unread.js"></script>
<script type="module">
  // Tab switching
  const tabs = document.getElementById('lesson-tabs');
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[role="tab"]');
    if (!btn) return;
    const panelId = btn.dataset.panel;
    tabs.querySelectorAll('[role="tab"]').forEach(t => t.setAttribute('aria-selected', t === btn ? 'true' : 'false'));
    tabs.querySelectorAll('[data-role="tabpanel"]').forEach(p => p.dataset.state = p.id === panelId ? 'active' : '');
    localStorage.setItem('ma-chat-last-tab', panelId);
  });
  // Restore last tab
  const last = localStorage.getItem('ma-chat-last-tab');
  if (last) {
    const btn = tabs.querySelector(`[data-panel="${last}"]`);
    if (btn) btn.click();
  }
</script>
```

- [ ] **Step 4: Smoke test manually**

```bash
cd ~/code/malearnsa-player
python3 -m http.server 8000
# open http://localhost:8000/watch.html?token=<test-token>&course=bl
```

Verify: 3 tabs visible, clicking switches panels, Description tab shows the existing lesson content unchanged, Discussion tab shows the empty state, Pinned tab shows "لا توجد رسائل مثبتة بعد".

- [ ] **Step 5: Commit**

```bash
git add watch.html
git commit -m "feat(player): wrap lesson-info in tabs with Discussion + Pinned panels"
```

### Task 16: Implement `firebase-config.js` and `js/chat/auth.js`

**Files:**
- Create: `~/code/malearnsa-player/js/firebase-config.js`
- Create: `~/code/malearnsa-player/js/chat/auth.js`

- [ ] **Step 1: Create `firebase-config.js`**

```javascript
/**
 * Firebase client config for malearn-chat.
 * apiKey is public by design (Firebase keys identify project, not grant access).
 * Security is enforced by Firestore rules + Firebase Auth custom tokens minted by Apps Script.
 */
export const FIREBASE_CONFIG = {
  apiKey: 'REPLACE_ME_WITH_WEB_API_KEY',
  authDomain: 'malearn-chat.firebaseapp.com',
  projectId: 'malearn-chat'
};

export const APPS_SCRIPT_URL = 'REPLACE_ME_WITH_APPS_SCRIPT_DEPLOYMENT_URL';
```

Get the `apiKey`: Firebase Console → Project Settings → General → Web API Key.
Get the `APPS_SCRIPT_URL`: the deployment URL of token-validator (same as current `validate_token` endpoint in existing watch.html).

- [ ] **Step 2: Create `js/chat/auth.js`**

```javascript
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, signInWithCustomToken, onAuthStateChanged, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { FIREBASE_CONFIG, APPS_SCRIPT_URL } from '../firebase-config.js';

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

await setPersistence(auth, browserSessionPersistence);

export { app, auth, db };

/**
 * Given MA Learn token + course, fetch a Firebase custom token from Apps Script
 * and sign in. Returns { uid, displayName, isMajid, email } on success.
 */
export async function signInStudent(token, course) {
  const url = new URL(APPS_SCRIPT_URL);
  url.searchParams.set('action', 'mint_firebase_token');
  url.searchParams.set('token', token);
  url.searchParams.set('course', course);
  const res = await fetch(url, { method: 'GET' });
  const payload = await res.json();
  if (!payload.ok) throw new Error('mint_firebase_token: ' + payload.error);

  const cred = await signInWithCustomToken(auth, payload.firebaseToken);
  const profile = {
    uid: cred.user.uid,
    email: payload.email,
    displayName: payload.displayName,
    isMajid: payload.isMajid
  };

  // Ensure users/{uid} doc exists (first-time)
  const userRef = doc(db, 'users', profile.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      displayName: null,     // set on first message
      email: profile.email,
      isMajid: profile.isMajid,
      createdAt: serverTimestamp(),
      lastSeen: {}
    });
  }

  window.__chatProfile = profile;
  window.dispatchEvent(new CustomEvent('chat:ready', { detail: profile }));
  return profile;
}

// Hook: existing watch.html already reads ?token and ?course. Find that code block
// and add: await signInStudent(token, course); after its own token validation succeeds.
```

- [ ] **Step 3: Wire signInStudent into watch.html bootstrap**

In `watch.html`, locate the existing bootstrap that calls `validate_token` (grep for `validate_token` within the file). After its success path, add:

```javascript
import('./js/chat/auth.js').then(async ({ signInStudent }) => {
  try { await signInStudent(token, courseId); }
  catch (e) { console.warn('chat signin failed:', e); }
});
```

- [ ] **Step 4: Smoke test**

Reload `http://localhost:8000/watch.html?token=<real-test-token>&course=bl`. In DevTools console: expect `window.__chatProfile` to be set with `{ uid, email, isMajid: false }` within 2 seconds.

- [ ] **Step 5: Commit**

```bash
git add js/firebase-config.js js/chat/auth.js watch.html
git commit -m "feat(chat): sign in via Apps Script-minted Firebase custom token"
```

### Task 17: Write rules tests for messages collection

**Files:**
- Create: `~/code/malearn-chat/rules-tests/messages.test.js`

- [ ] **Step 1: Create `messages.test.js`**

```javascript
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

describe('rooms/{lessonId}/messages rules', () => {
  let env;
  before(async () => {
    env = await initializeTestEnvironment({
      projectId: 'malearn-chat-test',
      firestore: {
        rules: readFileSync('../firestore.rules', 'utf8'),
        host: '127.0.0.1',
        port: 8080
      }
    });
  });
  after(async () => env.cleanup());
  beforeEach(async () => {
    await env.clearFirestore();
    // Seed a room
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'rooms/lesson-1'), {
        courseId: 'bl', messageCount: 0, lastMessageAt: Date.now()
      });
    });
  });

  function msg(overrides = {}) {
    return {
      authorUid: 'alice',
      authorDisplayName: 'Alice',
      isMajid: false,
      body: 'hello',
      mentions: [],
      createdAt: Date.now(),
      deleted: false,
      ipHash: 'abc',
      userAgent: 'ua',
      ...overrides
    };
  }

  it('authed user can read any message', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'rooms/lesson-1/messages/m1'), msg());
    });
    await assertSucceeds(getDoc(doc(alice, 'rooms/lesson-1/messages/m1')));
  });

  it('user can write a message with their own authorUid', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(alice, 'rooms/lesson-1/messages/m1'), msg()));
  });

  it('user CANNOT write a message claiming another authorUid', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(alice, 'rooms/lesson-1/messages/m1'), msg({ authorUid: 'bob' })));
  });

  it('user CANNOT write a message with isMajid: true', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(alice, 'rooms/lesson-1/messages/m1'), msg({ isMajid: true })));
  });

  it('Majid CAN write a message with isMajid: true', async () => {
    const majid = env.authenticatedContext('majid', { isMajid: true }).firestore();
    await assertSucceeds(setDoc(doc(majid, 'rooms/lesson-1/messages/m1'), msg({ authorUid: 'majid', isMajid: true })));
  });

  it('user CANNOT write a body over 500 chars', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(alice, 'rooms/lesson-1/messages/m1'), msg({ body: 'x'.repeat(501) })));
  });

  it('user can soft-delete their own message', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'rooms/lesson-1/messages/m1'), msg());
    });
    await assertSucceeds(updateDoc(doc(alice, 'rooms/lesson-1/messages/m1'), { deleted: true }));
  });

  it('user CANNOT hard-delete their own message', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'rooms/lesson-1/messages/m1'), msg());
    });
    await assertFails(deleteDoc(doc(alice, 'rooms/lesson-1/messages/m1')));
  });

  it('Majid CAN hard-delete any message', async () => {
    const majid = env.authenticatedContext('majid', { isMajid: true }).firestore();
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'rooms/lesson-1/messages/m1'), msg());
    });
    await assertSucceeds(deleteDoc(doc(majid, 'rooms/lesson-1/messages/m1')));
  });

  it('banned user CANNOT post', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'banned_uids/alice'), {
        bannedBy: 'majid', bannedAt: Date.now(), reason: 'test', expiresAt: null
      });
    });
    await assertFails(setDoc(doc(alice, 'rooms/lesson-1/messages/m1'), msg()));
  });
});
```

- [ ] **Step 2: Run — expect all to fail (rules still default-deny messages)**

```bash
cd ~/code/malearn-chat/rules-tests
npm test
```

Expected: 10 failures (rules missing).

- [ ] **Step 3: Commit**

```bash
cd ~/code/malearn-chat
git add rules-tests/messages.test.js
git commit -m "test(rules): failing tests for messages access + ban enforcement"
```

### Task 18: Implement messages + pins + bans rules to pass Task 17 tests

**Files:**
- Modify: `~/code/malearn-chat/firestore.rules`

- [ ] **Step 1: Extend `firestore.rules`** — add these match blocks BEFORE the final catch-all default-deny:

```
    // ── rooms/{lessonId} ────────────────────────────────────────
    match /rooms/{lessonId} {
      allow read: if isSignedIn();
      allow write: if isMajid();

      // ── messages ──────────────────────────────────────────────
      match /messages/{msgId} {
        allow read: if isSignedIn();

        allow create: if isSignedIn()
          && !isBanned(request.auth.uid)
          && request.resource.data.authorUid == request.auth.uid
          && request.resource.data.isMajid == isMajid()
          && request.resource.data.body is string
          && request.resource.data.body.size() > 0
          && request.resource.data.body.size() <= 500
          && request.resource.data.mentions is list
          && request.resource.data.mentions.size() <= 20
          && request.resource.data.deleted == false;

        // Owner can soft-delete (deleted: true) within 5 min, OR edit body within 2 min.
        allow update: if isSignedIn()
          && resource.data.authorUid == request.auth.uid
          && (
            // soft-delete within 5 min
            (request.resource.data.deleted == true
              && resource.data.deleted == false
              && request.time < resource.data.createdAt + duration.value(5, 'm')
              && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['deleted']))
            ||
            // edit body within 2 min
            (request.resource.data.body != resource.data.body
              && request.time < resource.data.createdAt + duration.value(2, 'm')
              && request.resource.data.body.size() <= 500
              && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['body']))
          );

        // Majid can soft-delete any time, or hard-delete
        allow update: if isMajid()
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['deleted']);
        allow delete: if isMajid();
      }

      // ── pins ──────────────────────────────────────────────────
      match /pins/{pinId} {
        allow read: if isSignedIn();
        allow write, delete: if isMajid();
      }
    }

    // ── banned_uids/{uid} ──────────────────────────────────────
    match /banned_uids/{uid} {
      allow read: if isSelf(uid) || isMajid();
      allow write, delete: if isMajid();
    }

    // ── reports/{reportId} ─────────────────────────────────────
    match /reports/{reportId} {
      allow read: if isMajid();
      allow create: if isSignedIn()
        && request.resource.data.reporterUid == request.auth.uid;
      allow update, delete: if isMajid();
    }

    // ── moderation_log/{actionId} ──────────────────────────────
    match /moderation_log/{actionId} {
      allow read: if isMajid();
      allow create: if isMajid();
      allow update, delete: if false;  // append-only
    }
```

And add these helpers to the existing helpers block:

```
    function isBanned(uid) {
      return exists(/databases/$(database)/documents/banned_uids/$(uid))
        && (!('expiresAt' in get(/databases/$(database)/documents/banned_uids/$(uid)).data)
            || get(/databases/$(database)/documents/banned_uids/$(uid)).data.expiresAt == null
            || request.time < get(/databases/$(database)/documents/banned_uids/$(uid)).data.expiresAt);
    }
```

- [ ] **Step 2: Run tests**

```bash
cd ~/code/malearn-chat/rules-tests
npm test
```

Expected: 10 messages tests + 5 users tests = 15 passing.

- [ ] **Step 3: Deploy**

```bash
cd ~/code/malearn-chat
firebase deploy --only firestore:rules
```

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat(rules): messages + pins + bans + reports + moderation_log"
```

### Task 19: Implement `js/chat/messages.js` — realtime list + send

**Files:**
- Create: `~/code/malearnsa-player/js/chat/messages.js`

- [ ] **Step 1: Create `messages.js`**

```javascript
import { db, auth } from './auth.js';
import { collection, query, orderBy, limit, onSnapshot, addDoc, doc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

let currentLessonId = null;
let currentUnsub = null;
const chatList = document.getElementById('chat-list');
const chatEmpty = document.getElementById('chat-empty');
const input = document.getElementById('composer-input');
const sendBtn = document.getElementById('composer-send');
const charCount = document.getElementById('char-count');

/**
 * Switch chat to a lesson. Call whenever the active lesson changes.
 */
export function openRoom(lessonId) {
  if (currentUnsub) currentUnsub();
  currentLessonId = lessonId;
  chatList.innerHTML = '';
  chatEmpty.hidden = false;
  chatList.hidden = true;

  const q = query(
    collection(db, 'rooms', lessonId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(200)
  );
  currentUnsub = onSnapshot(q, (snap) => {
    snap.docChanges().forEach((chg) => {
      if (chg.type === 'added') appendMessage(chg.doc);
      else if (chg.type === 'modified') updateMessage(chg.doc);
      else if (chg.type === 'removed') removeMessage(chg.doc.id);
    });
    const hasAny = chatList.children.length > 0;
    chatEmpty.hidden = hasAny;
    chatList.hidden = !hasAny;
    chatList.scrollTop = chatList.scrollHeight;
  });
}

function appendMessage(d) {
  const m = d.data();
  const row = document.createElement('div');
  row.className = 'chat-message';
  row.id = 'msg-' + d.id;
  row.dataset.isMajid = String(!!m.isMajid);
  row.dataset.deleted = String(!!m.deleted);
  const profile = window.__chatProfile || {};
  if (Array.isArray(m.mentions) && m.mentions.includes(profile.uid)) row.dataset.mentionedSelf = 'true';
  row.innerHTML = `
    <div data-ui="avatar">${(m.authorDisplayName || '?').slice(0, 2).toUpperCase()}</div>
    <div class="chat-author" data-is-majid="${!!m.isMajid}">
      ${escape(m.authorDisplayName || 'مستخدم')}
      ${m.isMajid ? '<span class="verified">✓</span>' : ''}
    </div>
    <div class="chat-body" dir="auto">${renderBody(m)}</div>
    <div class="chat-time">${formatTime(m.createdAt)}</div>
    ${profile.isMajid ? '<button class="chat-actions-trigger" data-msg-id="' + d.id + '">⋮</button>' : ''}
  `;
  chatList.appendChild(row);
}

function updateMessage(d) {
  const existing = document.getElementById('msg-' + d.id);
  if (existing) {
    existing.remove();
    appendMessage(d);
  }
}
function removeMessage(id) {
  const existing = document.getElementById('msg-' + id);
  if (existing) existing.remove();
}

function renderBody(m) {
  if (m.deleted) return '<em>[تم حذف الرسالة]</em>';
  let s = escape(m.body || '');
  // Linkify URLs
  s = s.replace(/\b(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  // Render mention chips (rendered by mentions.js post-process)
  return s;
}

function escape(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'الآن';
  if (diffMin < 60) return `قبل ${diffMin}د`;
  if (diffMin < 1440) return `قبل ${Math.round(diffMin / 60)}س`;
  return d.toLocaleDateString('ar-SA');
}

// Composer state
input.addEventListener('input', () => {
  const len = input.value.length;
  charCount.textContent = `${len}/500`;
  charCount.dataset.state = len > 480 ? 'error' : (len > 400 ? 'warn' : '');
  sendBtn.disabled = !input.value.trim() || !currentLessonId || !window.__chatProfile;
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});

sendBtn.addEventListener('click', async () => {
  const body = input.value.trim();
  if (!body || !currentLessonId) return;
  const profile = window.__chatProfile;
  if (!profile) return;

  // Link count cap
  const urlCount = (body.match(/\bhttps?:\/\/\S+/g) || []).length;
  if (urlCount > 3) {
    toast('الحد الأقصى ٣ روابط في الرسالة.');
    return;
  }

  // Ensure displayName exists (dispatched by displayName.js)
  if (!profile.displayName) {
    window.dispatchEvent(new CustomEvent('chat:need-display-name'));
    return;
  }

  sendBtn.disabled = true;
  try {
    await addDoc(collection(db, 'rooms', currentLessonId, 'messages'), {
      authorUid: profile.uid,
      authorDisplayName: profile.displayName,
      isMajid: profile.isMajid,
      body,
      mentions: window.__parseMentions ? window.__parseMentions(body) : [],
      createdAt: serverTimestamp(),
      deleted: false,
      ipHash: window.__ipHash || '',
      userAgent: navigator.userAgent.slice(0, 200)
    });
    input.value = '';
    charCount.textContent = '';
  } catch (err) {
    toast('فشل الإرسال: ' + (err.code || err.message));
  } finally {
    sendBtn.disabled = !input.value.trim();
  }
});

function toast(msg) {
  const t = document.createElement('div');
  t.setAttribute('data-ui', 'toast');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// Open room whenever the active lesson changes. watch.html dispatches 'lesson:changed'.
window.addEventListener('lesson:changed', (e) => openRoom(e.detail.lessonId));
// Initial open if a lesson is already active
window.addEventListener('chat:ready', () => {
  if (window.__currentLessonId) openRoom(window.__currentLessonId);
});
```

- [ ] **Step 2: Dispatch `lesson:changed` from existing lesson-switching code**

In `watch.html`, find the function that switches the active lesson (grep for `lesson-iframe` or `video-iframe`). At the end of that function, add:

```javascript
window.__currentLessonId = lessonId;
window.dispatchEvent(new CustomEvent('lesson:changed', { detail: { lessonId } }));
```

- [ ] **Step 3: Manual smoke test**

Reload the player. Switch to the Discussion tab. Type a message, hit Enter. Verify:
- Message appears in the list.
- Firebase Console → Firestore → `rooms/<lessonId>/messages/` shows the doc.
- Reload the page — message persists.

- [ ] **Step 4: Commit**

```bash
cd ~/code/malearnsa-player
git add js/chat/messages.js watch.html
git commit -m "feat(chat): realtime message list + composer with URL cap"
```

### Task 20: Implement `js/chat/displayName.js` — first-message modal

**Files:**
- Create: `~/code/malearnsa-player/js/chat/displayName.js`
- Modify: `~/code/malearnsa-player/watch.html` (append the modal DOM)

- [ ] **Step 1: Add modal DOM at the end of `<body>` in `watch.html`** (before the `<script>` imports)

```html
<div data-ui="modal" id="display-name-modal">
  <div class="backdrop"></div>
  <div class="panel">
    <h2>اختر اسماً يراه الآخرون في النقاش</h2>
    <p>سيظهر هذا الاسم على كل رسالة تكتبها.</p>
    <div data-ui="field">
      <input data-ui="input" id="display-name-input" maxlength="30" placeholder="الاسم">
      <span class="helper" id="display-name-error" hidden></span>
    </div>
    <div class="actions">
      <button data-ui="btn" data-variant="ghost" id="display-name-cancel">إلغاء</button>
      <button data-ui="btn" data-variant="primary" id="display-name-save">حفظ</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Create `displayName.js`**

```javascript
import { db } from './auth.js';
import { doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const modal = document.getElementById('display-name-modal');
const input = document.getElementById('display-name-input');
const saveBtn = document.getElementById('display-name-save');
const cancelBtn = document.getElementById('display-name-cancel');
const errEl = document.getElementById('display-name-error');

function open() {
  modal.dataset.state = 'open';
  setTimeout(() => input.focus(), 60);
}
function close() {
  modal.dataset.state = '';
  errEl.hidden = true;
  input.value = '';
}

window.addEventListener('chat:need-display-name', open);

cancelBtn.addEventListener('click', close);
modal.querySelector('.backdrop').addEventListener('click', close);

saveBtn.addEventListener('click', async () => {
  const name = input.value.trim();
  if (name.length < 2) {
    errEl.textContent = 'الاسم قصير جداً (٢ حروف على الأقل).';
    errEl.hidden = false;
    return;
  }
  if (name.length > 30) {
    errEl.textContent = 'الاسم طويل (٣٠ حرف كحد أقصى).';
    errEl.hidden = false;
    return;
  }

  const profile = window.__chatProfile;
  saveBtn.disabled = true;
  try {
    await updateDoc(doc(db, 'users', profile.uid), { displayName: name });
    profile.displayName = name;
    close();
    // Retry-send the message they were composing
    document.getElementById('composer-send').click();
  } catch (err) {
    errEl.textContent = 'خطأ: ' + (err.code || err.message);
    errEl.hidden = false;
  } finally {
    saveBtn.disabled = false;
  }
});
```

- [ ] **Step 3: Smoke test**

Clear Firestore `users/{your-uid}.displayName`. Reload player. Type "hi" in composer, press Enter. Verify:
- Modal opens.
- Typing "ma" → Save → modal closes → "hi" posts with author "ma".
- Reload — displayName persists.

- [ ] **Step 4: Commit**

```bash
git add js/chat/displayName.js watch.html
git commit -m "feat(chat): display-name modal on first message"
```

### Task 21: Implement `js/chat/moderation.js` — Majid-only actions

**Files:**
- Create: `~/code/malearnsa-player/js/chat/moderation.js`
- Modify: `~/code/malearnsa-player/watch.html` (add moderation menu + confirm modals)

- [ ] **Step 1: Add DOM at end of `<body>`**

```html
<div data-ui="menu" id="mod-menu">
  <button role="menuitem" data-action="pin">📌 تثبيت</button>
  <button role="menuitem" data-action="soft-delete">حذف ناعم</button>
  <button role="menuitem" data-action="hard-delete" data-tone="danger">حذف نهائي</button>
  <hr>
  <button role="menuitem" data-action="ban" data-tone="danger">حظر المستخدم</button>
</div>

<div data-ui="modal" id="confirm-modal">
  <div class="backdrop"></div>
  <div class="panel">
    <h2 id="confirm-title">تأكيد</h2>
    <p id="confirm-body"></p>
    <div class="actions">
      <button data-ui="btn" data-variant="ghost" id="confirm-cancel">إلغاء</button>
      <button data-ui="btn" data-variant="danger" id="confirm-ok">تأكيد</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Create `moderation.js`**

```javascript
import { db } from './auth.js';
import { doc, updateDoc, deleteDoc, setDoc, collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const menu = document.getElementById('mod-menu');
const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmBody = document.getElementById('confirm-body');
const confirmOk = document.getElementById('confirm-ok');
const confirmCancel = document.getElementById('confirm-cancel');

let activeMsgId = null;
let activeMsgAuthor = null;

document.addEventListener('click', (e) => {
  const trigger = e.target.closest('.chat-actions-trigger');
  if (trigger) {
    activeMsgId = trigger.dataset.msgId;
    const row = trigger.closest('.chat-message');
    activeMsgAuthor = row?.querySelector('.chat-author')?.textContent.trim() || '';
    const rect = trigger.getBoundingClientRect();
    menu.style.top = rect.bottom + window.scrollY + 'px';
    menu.style.left = rect.left + 'px';
    menu.dataset.state = 'open';
  } else if (!menu.contains(e.target)) {
    menu.dataset.state = '';
  }
});

menu.addEventListener('click', async (e) => {
  const item = e.target.closest('[role="menuitem"]');
  if (!item || !activeMsgId) return;
  const action = item.dataset.action;
  menu.dataset.state = '';

  const lessonId = window.__currentLessonId;
  const profile = window.__chatProfile;
  if (!profile?.isMajid) return;

  if (action === 'pin') return doPin(lessonId, activeMsgId);
  if (action === 'soft-delete') return doSoftDelete(lessonId, activeMsgId);
  if (action === 'hard-delete') return confirm('حذف نهائي', 'لا يمكن التراجع عن هذا الإجراء.', () => doHardDelete(lessonId, activeMsgId));
  if (action === 'ban') return confirm('حظر المستخدم', `حظر "${activeMsgAuthor}"؟ سيتمكن من القراءة ولن يستطيع الكتابة.`, () => doBan(activeMsgId));
});

async function doPin(lessonId, msgId) {
  const msgRef = doc(db, 'rooms', lessonId, 'messages', msgId);
  const snap = await (await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')).getDoc(msgRef);
  const m = snap.data();
  const expires = prompt('تاريخ انتهاء التثبيت (فارغ = دائم). صيغة: YYYY-MM-DD', '');
  let expiresAt = null;
  if (expires && expires.trim()) {
    const d = new Date(expires.trim());
    if (isNaN(d)) { alert('تاريخ غير صالح.'); return; }
    expiresAt = d;
  }
  await addDoc(collection(db, 'rooms', lessonId, 'pins'), {
    authorUid: m.authorUid,
    authorDisplayName: m.authorDisplayName,
    body: m.body,
    pinnedAt: serverTimestamp(),
    pinnedBy: window.__chatProfile.uid,
    expiresAt
  });
  await logAction('pin', { targetMsgId: msgId, roomId: lessonId });
}

async function doSoftDelete(lessonId, msgId) {
  await updateDoc(doc(db, 'rooms', lessonId, 'messages', msgId), { deleted: true });
  await logAction('soft_delete', { targetMsgId: msgId, roomId: lessonId });
}

async function doHardDelete(lessonId, msgId) {
  await deleteDoc(doc(db, 'rooms', lessonId, 'messages', msgId));
  await logAction('hard_delete', { targetMsgId: msgId, roomId: lessonId });
}

async function doBan(msgId) {
  const row = document.getElementById('msg-' + msgId);
  const targetUid = row?.dataset.authorUid;
  if (!targetUid) { alert('uid غير موجود على الرسالة.'); return; }
  await setDoc(doc(db, 'banned_uids', targetUid), {
    bannedBy: window.__chatProfile.uid,
    bannedAt: serverTimestamp(),
    reason: 'moderation',
    expiresAt: null
  });
  await logAction('ban', { targetUid });
}

async function logAction(action, extras) {
  await addDoc(collection(db, 'moderation_log'), {
    action,
    actorUid: window.__chatProfile.uid,
    targetUid: extras.targetUid || null,
    targetMsgId: extras.targetMsgId || null,
    roomId: extras.roomId || null,
    reason: extras.reason || null,
    timestamp: serverTimestamp()
  });
}

function confirm(title, body, onOk) {
  confirmTitle.textContent = title;
  confirmBody.textContent = body;
  confirmModal.dataset.state = 'open';
  const handler = async () => {
    confirmOk.removeEventListener('click', handler);
    confirmCancel.removeEventListener('click', cancel);
    confirmModal.dataset.state = '';
    await onOk();
  };
  const cancel = () => {
    confirmOk.removeEventListener('click', handler);
    confirmCancel.removeEventListener('click', cancel);
    confirmModal.dataset.state = '';
  };
  confirmOk.addEventListener('click', handler, { once: true });
  confirmCancel.addEventListener('click', cancel, { once: true });
}
```

- [ ] **Step 3: Add `data-author-uid` to message rows**

In `messages.js` `appendMessage`, add on the `row` element:

```javascript
row.dataset.authorUid = m.authorUid;
```

(Edit the already-created file.)

- [ ] **Step 4: Smoke test (as Majid)**

Sign in with a Majid-claimed token. Hover a message → click ⋮ → menu appears → click "حذف ناعم" → body changes to `[تم حذف الرسالة]`.

- [ ] **Step 5: Commit**

```bash
git add js/chat/moderation.js js/chat/messages.js watch.html
git commit -m "feat(chat): Majid moderation menu (pin/delete/ban) + confirm modal"
```

### Task 22: Implement `js/chat/pins.js` — pinned panel

**Files:**
- Create: `~/code/malearnsa-player/js/chat/pins.js`

- [ ] **Step 1: Create `pins.js`**

```javascript
import { db } from './auth.js';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const panel = document.getElementById('pinned-panel');
const tabCount = document.getElementById('tab-pinned-count');
let currentUnsub = null;

export function openPins(lessonId) {
  if (currentUnsub) currentUnsub();
  panel.innerHTML = '<div class="pinned-empty">لا توجد رسائل مثبتة بعد.</div>';

  const q = query(collection(db, 'rooms', lessonId, 'pins'), orderBy('pinnedAt', 'desc'));
  currentUnsub = onSnapshot(q, (snap) => {
    const profile = window.__chatProfile || {};
    const pins = snap.docs;
    panel.innerHTML = '';
    if (pins.length === 0) {
      panel.innerHTML = '<div class="pinned-empty">لا توجد رسائل مثبتة بعد.</div>';
      tabCount.hidden = true;
      return;
    }
    tabCount.hidden = false;
    tabCount.textContent = pins.length;
    pins.forEach(d => {
      const p = d.data();
      const el = document.createElement('div');
      el.className = 'pinned-item';
      el.innerHTML = `
        <div class="pinned-meta">
          ${escape(p.authorDisplayName || 'مثبت')} ✓
          ${p.expiresAt ? `<span class="pinned-expiry">ينتهي ${fmt(p.expiresAt)}</span>` : ''}
          ${profile.isMajid ? `<button class="unpin-btn" data-pin-id="${d.id}" style="margin-inline-start:8px;background:transparent;border:0;color:var(--c-danger);cursor:pointer;">إلغاء التثبيت</button>` : ''}
        </div>
        <div dir="auto" style="font-size:var(--fs-body-sm);line-height:1.6;">${escape(p.body)}</div>
      `;
      panel.appendChild(el);
    });
  });
}

panel.addEventListener('click', async (e) => {
  const btn = e.target.closest('.unpin-btn');
  if (!btn) return;
  const lessonId = window.__currentLessonId;
  await deleteDoc(doc(db, 'rooms', lessonId, 'pins', btn.dataset.pinId));
});

function fmt(ts) {
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('ar-SA');
}
function escape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.addEventListener('lesson:changed', (e) => openPins(e.detail.lessonId));
window.addEventListener('chat:ready', () => {
  if (window.__currentLessonId) openPins(window.__currentLessonId);
});
```

- [ ] **Step 2: Smoke test**

As Majid: pin a message → switch to Pinned tab → verify it appears with gold border. As non-Majid: switch to Pinned tab → verify pin visible but no "إلغاء التثبيت" button.

- [ ] **Step 3: Commit**

```bash
git add js/chat/pins.js
git commit -m "feat(chat): pinned messages panel + Majid unpin action"
```

---

## Phase C — @mentions, unread badges, mobile polish

Adds @mentions autocomplete + in-render highlighting + unread badges on lessons sidebar + mention markers + mobile composer sticking. Exits when a student sees a red unread dot on lesson X when Majid posts there while they're on lesson Y.

### Task 23: Implement `js/chat/mentions.js` — autocomplete + parsing

**Files:**
- Create: `~/code/malearnsa-player/js/chat/mentions.js`

- [ ] **Step 1: Create `mentions.js`**

```javascript
import { db } from './auth.js';
import { collection, query, orderBy, limit, onSnapshot, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const input = document.getElementById('composer-input');
const ac = document.getElementById('mention-ac');
let activeMatches = [];
let activeIdx = 0;
let triggerStart = -1;
let roomUsers = new Map();  // uid -> displayName seen in room last 7d

// Track recent authors per active room
window.addEventListener('lesson:changed', (e) => {
  roomUsers.clear();
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  const q = query(
    collection(db, 'rooms', e.detail.lessonId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(100)
  );
  onSnapshot(q, snap => {
    snap.docs.forEach(d => {
      const m = d.data();
      const ts = m.createdAt?.toMillis ? m.createdAt.toMillis() : (m.createdAt || 0);
      if (ts > cutoff && m.authorDisplayName) {
        roomUsers.set(m.authorUid, { uid: m.authorUid, name: m.authorDisplayName, isMajid: m.isMajid });
      }
    });
  });
});

input.addEventListener('input', () => {
  const pos = input.selectionStart;
  const before = input.value.slice(0, pos);
  const m = before.match(/@(\S*)$/);
  if (!m) { hide(); return; }
  triggerStart = pos - m[0].length;
  const needle = m[1].toLowerCase();
  show(needle);
});

input.addEventListener('keydown', (e) => {
  if (ac.dataset.state !== 'open') return;
  if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
  else if (e.key === 'Enter' || e.key === 'Tab') {
    if (activeMatches.length > 0) { e.preventDefault(); pick(activeMatches[activeIdx]); }
  } else if (e.key === 'Escape') { hide(); }
});

function show(needle) {
  const out = [];
  // Majid always first
  out.push({ uid: 'majid', name: 'Majid', isMajid: true, pinned: true });
  // Recent room authors
  for (const u of roomUsers.values()) {
    if (u.isMajid) continue;
    if (u.name.toLowerCase().includes(needle)) out.push(u);
  }
  activeMatches = out.slice(0, 8);
  activeIdx = 0;
  if (activeMatches.length === 0) { hide(); return; }
  ac.innerHTML = activeMatches.map((u, i) => `
    <div class="mention-item" data-uid="${u.uid}" data-name="${u.name}" data-is-majid="${u.isMajid}" data-active="${i === activeIdx}">
      <span>@${escape(u.name)}</span>
      ${u.isMajid ? '<span style="color:var(--c-gold);font-size:10px;">✓</span>' : ''}
    </div>
  `).join('');
  ac.dataset.state = 'open';
  ac.querySelectorAll('.mention-item').forEach((el, i) => {
    el.addEventListener('click', () => pick(activeMatches[i]));
  });
}

function move(delta) {
  activeIdx = (activeIdx + delta + activeMatches.length) % activeMatches.length;
  ac.querySelectorAll('.mention-item').forEach((el, i) => {
    el.dataset.active = String(i === activeIdx);
  });
}

function hide() {
  ac.dataset.state = '';
  activeMatches = [];
  triggerStart = -1;
}

function pick(u) {
  const before = input.value.slice(0, triggerStart);
  const after = input.value.slice(input.selectionStart);
  const inserted = `@${u.name} `;
  input.value = before + inserted + after;
  input.selectionStart = input.selectionEnd = (before + inserted).length;
  input.focus();
  hide();
  input.dispatchEvent(new Event('input'));
}

// Parse mentions from composed text — called by messages.js on send
window.__parseMentions = (text) => {
  const names = [...text.matchAll(/@([^\s]+)/g)].map(m => m[1]);
  const mentioned = [];
  for (const name of names) {
    if (name === 'Majid') mentioned.push('majid');
    for (const u of roomUsers.values()) {
      if (u.name === name) mentioned.push(u.uid);
    }
  }
  return [...new Set(mentioned)];
};

function escape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Wrap @mentions in rendered bodies — hook into DOM after messages render
const observer = new MutationObserver(() => {
  document.querySelectorAll('.chat-body').forEach(el => {
    if (el.dataset.mentionsProcessed) return;
    el.innerHTML = el.innerHTML.replace(/@([^\s<]+)/g, '<span class="mention">@$1</span>');
    el.dataset.mentionsProcessed = 'true';
  });
});
observer.observe(document.getElementById('chat-list'), { childList: true, subtree: true });
```

- [ ] **Step 2: Smoke test**

Type `@` in composer → autocomplete appears with "Majid ✓" at top. Type `@Maj` → only "Majid" shows. Arrow down/up + Enter inserts. Send. Verify mention renders with gold-tinted chip in the message body. Verify `mentions: ['majid']` in Firestore doc.

- [ ] **Step 3: Commit**

```bash
git add js/chat/mentions.js
git commit -m "feat(chat): @mention autocomplete + parsing + gold chip rendering"
```

### Task 24: Implement `js/chat/unread.js` — badges on lessons sidebar

**Files:**
- Create: `~/code/malearnsa-player/js/chat/unread.js`
- Modify: `~/code/malearnsa-player/watch.html` (add unread dot span to each `lesson-item`)

- [ ] **Step 1: Update the lesson rendering in `watch.html`**

Find the code that builds `<div class="lesson-item">` entries (grep for `lesson-item` in the inline `<script>` block). Add a span inside each:

```javascript
// Inside the lesson-item template string, append:
`<span class="unread-dot"></span><span class="mention-mark">@</span>`
```

And ensure each lesson-item has `data-lesson-id="<lessonId>"`.

- [ ] **Step 2: Create `unread.js`**

```javascript
import { db } from './auth.js';
import { collection, query, onSnapshot, doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

/**
 * For each lesson visible in the sidebar, subscribe to that room doc and
 * compare messageCount to users/{uid}.lastSeen[lessonId]. Render dot + count.
 * Also subscribe to messages with mentions containing self for the mention marker.
 */
let roomUnsubs = new Map();

window.addEventListener('chat:ready', async (e) => {
  const profile = e.detail;
  const userSnap = await getDoc(doc(db, 'users', profile.uid));
  const lastSeen = userSnap.data()?.lastSeen || {};

  // Subscribe to each lesson-item's room
  document.querySelectorAll('.lesson-item[data-lesson-id]').forEach(el => {
    const lessonId = el.dataset.lessonId;
    if (roomUnsubs.has(lessonId)) return;
    const unsub = onSnapshot(doc(db, 'rooms', lessonId), snap => {
      const count = snap.data()?.messageCount || 0;
      const seen = lastSeen[lessonId] || 0;
      const delta = count - seen;
      if (delta > 0 && lessonId !== window.__currentLessonId) {
        el.dataset.unread = 'true';
        el.querySelector('.unread-dot')?.setAttribute('data-count', delta);
      } else {
        delete el.dataset.unread;
      }
    });
    roomUnsubs.set(lessonId, unsub);
  });
});

/**
 * When a lesson opens and stays open for 2s, mark it seen.
 */
let dwellTimer = null;
window.addEventListener('lesson:changed', (e) => {
  clearTimeout(dwellTimer);
  const lessonId = e.detail.lessonId;
  dwellTimer = setTimeout(async () => {
    const profile = window.__chatProfile;
    if (!profile) return;
    const roomSnap = await getDoc(doc(db, 'rooms', lessonId));
    const count = roomSnap.data()?.messageCount || 0;
    await updateDoc(doc(db, 'users', profile.uid), {
      [`lastSeen.${lessonId}`]: count
    });
    const el = document.querySelector(`.lesson-item[data-lesson-id="${lessonId}"]`);
    if (el) delete el.dataset.unread;
  }, 2000);
});
```

- [ ] **Step 3: Increment `messageCount` in `messages.js` on send**

Update `messages.js` `sendBtn.addEventListener('click', ...)` — after the `addDoc`, add:

```javascript
// Increment room.messageCount
await updateDoc(doc(db, 'rooms', currentLessonId), {
  messageCount: increment(1),
  lastMessageAt: serverTimestamp()
});
```

And add to the imports at the top of `messages.js`:

```javascript
import { doc, updateDoc, increment } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
```

**Note:** The room doc must exist before this increment. Add on first send:

```javascript
// Ensure room doc exists
const roomRef = doc(db, 'rooms', currentLessonId);
const roomSnap = await getDoc(roomRef);
if (!roomSnap.exists()) {
  await setDoc(roomRef, { courseId, messageCount: 0, lastMessageAt: null });
}
```

- [ ] **Step 4: Relax rules to allow `messageCount` increment by authed users**

In `firestore.rules`, update the `rooms/{lessonId}` block:

```
    match /rooms/{lessonId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn()
        && request.resource.data.keys().hasOnly(['courseId','messageCount','lastMessageAt'])
        && request.resource.data.messageCount == 0;
      allow update: if isSignedIn()
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['messageCount','lastMessageAt'])
        && request.resource.data.messageCount == resource.data.messageCount + 1;
      // pins + messages sub-rules unchanged below
```

Update tests + redeploy:

```bash
cd ~/code/malearn-chat && firebase deploy --only firestore:rules
```

- [ ] **Step 5: Smoke test**

Open player on lesson A. In a second browser (different account), post a message on lesson B. In first browser, verify lesson B in sidebar shows red dot within a few seconds. Click lesson B → wait 2s → dot clears.

- [ ] **Step 6: Commit**

```bash
git add js/chat/unread.js js/chat/messages.js watch.html
git -C ~/code/malearn-chat add firestore.rules
git commit -m "feat(chat): unread badges + lastSeen tracking + messageCount increment"
cd ~/code/malearn-chat && git commit -m "feat(rules): allow messageCount increment by authed users"
```

### Task 25: Mobile polish — sticky composer + mini player + hamburger dot

**Files:**
- Modify: `~/code/malearnsa-player/watch.html` (script block)
- Modify: `~/code/malearnsa-player/css/chat.css` (mobile section already exists)

- [ ] **Step 1: Add keyboard-focus detection in inline script**

In `watch.html`, in the module script at bottom:

```javascript
const composerEl = document.getElementById('chat-composer');
const videoArea = document.querySelector('.video-area');
const input = document.getElementById('composer-input');

input.addEventListener('focus', () => {
  if (window.innerWidth <= 760) {
    composerEl.classList.add('keyboard-active');
    videoArea.classList.add('mini');
  }
});
input.addEventListener('blur', () => {
  composerEl.classList.remove('keyboard-active');
  videoArea.classList.remove('mini');
});
```

- [ ] **Step 2: Hamburger dot aggregation**

Append to `unread.js`:

```javascript
// Aggregate hamburger dot: show if ANY lesson other than current has unread
const navMenuBtn = document.querySelector('.nav-menu-btn') || document.getElementById('hamburger');

function refreshHamburgerDot() {
  if (!navMenuBtn) return;
  const anyUnread = !!document.querySelector('.lesson-item[data-unread]');
  if (anyUnread) {
    if (!navMenuBtn.querySelector('.hamburger-dot')) {
      const dot = document.createElement('span');
      dot.className = 'hamburger-dot';
      dot.style.cssText = 'position:absolute;top:6px;right:6px;width:6px;height:6px;border-radius:50%;background:var(--c-danger);';
      navMenuBtn.style.position = 'relative';
      navMenuBtn.appendChild(dot);
    }
  } else {
    navMenuBtn.querySelector('.hamburger-dot')?.remove();
  }
}
new MutationObserver(refreshHamburgerDot).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-unread'] });
```

- [ ] **Step 3: Test on mobile (Safari iOS simulator or real device)**

- Tap Discussion tab → tap composer → video shrinks to corner mini-player, composer sticks above keyboard.
- Tap somewhere else → video restores.
- Open lesson A, second browser posts in lesson B, hamburger shows red dot.

- [ ] **Step 4: Commit**

```bash
cd ~/code/malearnsa-player
git add js/chat/unread.js watch.html
git commit -m "feat(chat): mobile sticky composer + mini-player + hamburger unread dot"
```

---

## Phase D — Weekly wipe + pin-expiry + Google Sheet archive

Ships Cloud Functions for weekly wipe + daily pin sweep + Google Sheet archive + Noor Telegram alert. Exits when a dry-run wipe correctly archives to the sheet and deletes the archived docs.

### Task 26: Write `isoWeek.js` util + test

**Files:**
- Create: `~/code/malearn-chat/functions/src/isoWeek.js`
- Create: `~/code/malearn-chat/functions/test/isoWeek.test.js`

- [ ] **Step 1: Write failing test**

```javascript
// functions/test/isoWeek.test.js
import { strict as assert } from 'node:assert';
import { isoWeekTag } from '../src/isoWeek.js';

describe('isoWeekTag', () => {
  it('returns YYYY-WW for Monday Apr 20 2026', () => {
    assert.equal(isoWeekTag(new Date(Date.UTC(2026, 3, 20))), '2026-W17');
  });
  it('returns YYYY-WW for Jan 1 2026 (ISO week 01 of 2026)', () => {
    assert.equal(isoWeekTag(new Date(Date.UTC(2026, 0, 1))), '2026-W01');
  });
  it('handles year-boundary: Dec 30 2024 is 2025-W01', () => {
    assert.equal(isoWeekTag(new Date(Date.UTC(2024, 11, 30))), '2025-W01');
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
cd ~/code/malearn-chat/functions
npm test
```

Expected: module not found.

- [ ] **Step 3: Implement**

```javascript
// functions/src/isoWeek.js
/** ISO week tag "YYYY-Www" for a given Date (UTC-based). */
export function isoWeekTag(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run — pass**

```bash
npm test
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
cd ~/code/malearn-chat
git add functions/src/isoWeek.js functions/test/isoWeek.test.js
git commit -m "feat(functions): isoWeekTag util with tests"
```

### Task 27: Implement `archiveToSheet.js`

**Files:**
- Create: `~/code/malearn-chat/functions/src/archiveToSheet.js`

- [ ] **Step 1: Create `archiveToSheet.js`**

```javascript
import { google } from 'googleapis';

/**
 * Append message rows to a weekly tab in the master archive sheet.
 * Creates the tab if it doesn't exist.
 *
 * Contract: archiveMessages(spreadsheetId, weekTag, rows) -> appended row count
 * Each row: [timestampUtc, timestampKsa, courseId, lessonId, lessonTitle,
 *            authorDisplayName, authorUid, isMajid, deletedFlag, body, mentions]
 */
export async function archiveMessages(spreadsheetId, weekTag, rows) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // Ensure the tab exists
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existingTabs = meta.data.sheets.map(s => s.properties.title);
  if (!existingTabs.includes(weekTag)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: weekTag } } }]
      }
    });
    // Header row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${weekTag}!A1:K1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          'timestamp_utc','timestamp_ksa','course_id','lesson_id','lesson_title',
          'author_display_name','author_uid','is_majid','deleted_flag','body','mentions'
        ]]
      }
    });
  }

  if (rows.length === 0) return 0;

  const resp = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${weekTag}!A:K`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows }
  });
  return resp.data.updates.updatedRows || 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add functions/src/archiveToSheet.js
git commit -m "feat(functions): archiveToSheet — append rows to weekly tab"
```

### Task 28: Implement `weeklyWipe.js` — archive then delete

**Files:**
- Create: `~/code/malearn-chat/functions/src/weeklyWipe.js`

- [ ] **Step 1: Create `weeklyWipe.js`**

```javascript
import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { isoWeekTag } from './isoWeek.js';
import { archiveMessages } from './archiveToSheet.js';
import { noorAlert } from './noorAlert.js';

const SHEET_ID = process.env.CHAT_ARCHIVE_SHEET_ID;

export const weeklyWipe = onSchedule({
  schedule: '0 2 * * 5',             // Friday 02:00
  timeZone: 'Asia/Riyadh',
  memory: '512MiB',
  timeoutSeconds: 540
}, async () => {
  const db = admin.firestore();
  const wipeStart = admin.firestore.Timestamp.now();
  const weekTag = isoWeekTag(new Date());

  try {
    // Collect all messages across all rooms
    const roomsSnap = await db.collection('rooms').get();
    const rows = [];
    const docsToDelete = [];

    for (const roomDoc of roomsSnap.docs) {
      const roomId = roomDoc.id;
      const roomData = roomDoc.data();
      const msgsSnap = await db.collection('rooms').doc(roomId).collection('messages')
        .where('createdAt', '<', wipeStart).get();

      msgsSnap.docs.forEach(m => {
        const d = m.data();
        const utc = d.createdAt?.toDate?.().toISOString() || '';
        const ksa = d.createdAt?.toDate?.().toLocaleString('en-GB', { timeZone: 'Asia/Riyadh' }) || '';
        rows.push([
          utc, ksa, roomData.courseId || '', roomId,
          roomData.lessonTitle || '',
          d.authorDisplayName || '', d.authorUid || '',
          String(!!d.isMajid), String(!!d.deleted),
          d.body || '', Array.isArray(d.mentions) ? d.mentions.join(',') : ''
        ]);
        docsToDelete.push(m.ref);
      });
    }

    const archivedCount = await archiveMessages(SHEET_ID, weekTag, rows);
    if (archivedCount !== rows.length) {
      throw new Error(`archive mismatch: appended ${archivedCount}, expected ${rows.length}`);
    }

    // Safe to delete in batches of 500
    for (let i = 0; i < docsToDelete.length; i += 500) {
      const batch = db.batch();
      docsToDelete.slice(i, i + 500).forEach(ref => batch.delete(ref));
      await batch.commit();
    }

    // Reset messageCount on every room, clear lastSeen on every user
    const roomBatch = db.batch();
    roomsSnap.docs.forEach(r => {
      roomBatch.update(r.ref, { messageCount: 0 });
    });
    await roomBatch.commit();

    const usersSnap = await db.collection('users').get();
    for (let i = 0; i < usersSnap.docs.length; i += 500) {
      const batch = db.batch();
      usersSnap.docs.slice(i, i + 500).forEach(u => {
        batch.update(u.ref, { lastSeen: {} });
      });
      await batch.commit();
    }

    await db.collection('archives').doc(weekTag).set({
      weekStart: weekTag,
      weekEnd: weekTag,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=0`,
      messageCount: rows.length,
      wipeCompletedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await noorAlert(`Chat wipe complete. ${rows.length} messages archived across ${roomsSnap.size} rooms. Tab: ${weekTag}.`);
  } catch (err) {
    await db.collection('wipe_errors').doc(String(Date.now())).set({
      error: err.message,
      stack: err.stack,
      retryCount: 0,
      occurredAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await noorAlert(`Chat wipe FAILED: ${err.message}. Manual retry needed.`);
    throw err;
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add functions/src/weeklyWipe.js
git commit -m "feat(functions): weeklyWipe — archive-then-delete with safety gate"
```

### Task 29: Implement `pinExpiry.js`

**Files:**
- Create: `~/code/malearn-chat/functions/src/pinExpiry.js`

- [ ] **Step 1: Create `pinExpiry.js`**

```javascript
import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';

export const dailyPinExpiry = onSchedule({
  schedule: '0 2 * * *',           // every day 02:00
  timeZone: 'Asia/Riyadh',
  memory: '256MiB'
}, async () => {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  const roomsSnap = await db.collection('rooms').get();
  let deleted = 0;
  for (const room of roomsSnap.docs) {
    const pinsSnap = await db.collection('rooms').doc(room.id).collection('pins')
      .where('expiresAt', '<', now).get();
    if (pinsSnap.empty) continue;
    const batch = db.batch();
    pinsSnap.docs.forEach(p => { batch.delete(p.ref); deleted++; });
    await batch.commit();
  }
  console.log(`dailyPinExpiry: deleted ${deleted} expired pins`);
});
```

- [ ] **Step 2: Commit**

```bash
git add functions/src/pinExpiry.js
git commit -m "feat(functions): dailyPinExpiry sweep"
```

### Task 30: Implement `noorAlert.js` (Telegram webhook caller)

**Files:**
- Create: `~/code/malearn-chat/functions/src/noorAlert.js`

- [ ] **Step 1: Create `noorAlert.js`**

```javascript
/**
 * POST a plain text alert to the Noor Telegram bot webhook.
 * Secrets come from Firebase env: NOOR_WEBHOOK_URL + NOOR_WEBHOOK_TOKEN.
 */
export async function noorAlert(text) {
  const url = process.env.NOOR_WEBHOOK_URL;
  const token = process.env.NOOR_WEBHOOK_TOKEN;
  if (!url) { console.warn('NOOR_WEBHOOK_URL not set; skipping alert'); return; }
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token || ''}` },
      body: JSON.stringify({ source: 'chat-wipe', text })
    });
  } catch (e) {
    console.error('noorAlert failed:', e.message);
  }
}
```

- [ ] **Step 2: Update `functions/index.js` to export the scheduled handlers**

```javascript
import * as admin from 'firebase-admin';
admin.initializeApp();
export { weeklyWipe } from './src/weeklyWipe.js';
export { dailyPinExpiry } from './src/pinExpiry.js';
```

- [ ] **Step 3: Set env vars + deploy**

```bash
cd ~/code/malearn-chat
# Create secrets (prompts for value)
firebase functions:secrets:set CHAT_ARCHIVE_SHEET_ID
firebase functions:secrets:set NOOR_WEBHOOK_URL
firebase functions:secrets:set NOOR_WEBHOOK_TOKEN

# Wire secrets into the functions
```

Update `weeklyWipe.js` and `pinExpiry.js` `onSchedule` options to include:
```javascript
secrets: ['CHAT_ARCHIVE_SHEET_ID', 'NOOR_WEBHOOK_URL', 'NOOR_WEBHOOK_TOKEN']
```

Deploy:
```bash
firebase deploy --only functions
```

Expected: `✔ Deploy complete!` showing `weeklyWipe` + `dailyPinExpiry` scheduled.

- [ ] **Step 4: Create the master archive Google Sheet**

Create a new Google Sheet titled **"MA Learn — Chat Archive"**. Share it with the Firebase service account email (visible in `firebase.json` service-account; find via `gcloud iam service-accounts list --project=malearn-chat`). Copy the sheet ID (from URL) and set it via the secret above.

- [ ] **Step 5: Manually trigger `weeklyWipe` for a dry run**

Firebase Console → Cloud Scheduler → `firebase-schedule-weeklyWipe` → "Force run". After ~30 seconds, check:
- Master sheet has a new tab `2026-W17` (current week) with header row + any existing message rows archived.
- Firestore `rooms/*/messages` is empty.
- Noor received a Telegram alert.

- [ ] **Step 6: Commit**

```bash
git add functions/src/noorAlert.js functions/src/weeklyWipe.js functions/src/pinExpiry.js functions/index.js
git commit -m "feat(functions): Noor alert webhook + deploy scheduled handlers"
```

---

## Phase E — Anti-piracy telemetry

Captures IP hash + session events. No detection logic yet.

### Task 31: Capture `ipHash` on the client before sending messages

**Files:**
- Modify: `~/code/malearnsa-player/js/chat/auth.js`

- [ ] **Step 1: After successful sign-in, fetch and hash the client IP**

In `auth.js`, after the `window.dispatchEvent(new CustomEvent('chat:ready', ...))` line, add:

```javascript
try {
  const ipRes = await fetch('https://api.ipify.org?format=json');
  const { ip } = await ipRes.json();
  // SHA-256 hash client-side (salt lives in env in Cloud Functions; here we hash raw, server can re-hash)
  const enc = new TextEncoder().encode(ip);
  const hashBuf = await crypto.subtle.digest('SHA-256', enc);
  window.__ipHash = Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
} catch (e) { window.__ipHash = ''; }

// Log session event
const { addDoc, collection, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
await addDoc(collection(db, 'session_events'), {
  uid: profile.uid,
  event: 'sign_in',
  ipHash: window.__ipHash || '',
  userAgent: navigator.userAgent.slice(0, 200),
  timestamp: serverTimestamp()
});
```

- [ ] **Step 2: Relax rules to allow session_events appends**

In `firestore.rules`, add:

```
    match /session_events/{eventId} {
      allow read: if isMajid();
      allow create: if isSignedIn()
        && request.resource.data.uid == request.auth.uid;
      allow update, delete: if false;
    }
```

Deploy rules.

- [ ] **Step 3: Smoke test**

Reload the player. Verify in Firestore:
- `session_events/<newId>` with `uid`, `ipHash`, `userAgent`, `timestamp`.
- Any new message in `rooms/*/messages/*` has `ipHash` and `userAgent` fields populated.

- [ ] **Step 4: Commit**

```bash
cd ~/code/malearnsa-player
git add js/chat/auth.js
git commit -m "feat(chat): capture ipHash + session_events for future anti-piracy"

cd ~/code/malearn-chat
git add firestore.rules
git commit -m "feat(rules): allow session_events append by authenticated self"
firebase deploy --only firestore:rules
```

---

## Phase F — Production rollout

### Task 32: Staging soak on BL

**Files:** none (observational).

- [ ] **Step 1: Point staging deploy of player at malearn-chat Firebase project**

Verify `firebase-config.js` has correct `apiKey` and `projectId`.

- [ ] **Step 2: Send Majid the staging URL with his real token**

Ask Majid to exercise the feature for 48 hours:
- Post messages
- Reply
- Use @mentions
- Pin messages (with + without expiry)
- Soft delete, hard delete
- Ban a test user
- Switch between lessons to see unread badges
- Test on iPhone in Safari + Chrome

Record any bugs/tweaks in a staging-feedback.md file.

- [ ] **Step 3: Fix any bugs in dedicated commits**

Repeat per bug:
```bash
git add <files>
git commit -m "fix(chat): <short desc>"
```

### Task 33: Production rollout — BL first

**Files:** none (deploy step).

- [ ] **Step 1: Merge `main` to production branch of malearnsa-player**

```bash
cd ~/code/malearnsa-player
git push origin main
```

GitHub Pages auto-deploys `player.malearnsa.com` from `main`.

- [ ] **Step 2: Verify live**

```bash
curl -s https://player.malearnsa.com/watch.html | grep -c 'data-ui="tabs"'
```

Expected: ≥ 1.

- [ ] **Step 3: Smoke test with a real BL student token**

Open `https://player.malearnsa.com/watch.html?token=<live-bl-token>&course=bl`. Verify chat loads, message sends, persists.

- [ ] **Step 4: Monitor Firestore usage for 48 hours**

Firebase Console → Usage. Verify reads/writes stay well under free tier caps.

### Task 34: ITCAI rollout

**Files:** none.

- [ ] **Step 1: Verify course=itcai works**

The same `watch.html` serves both. Open `https://player.malearnsa.com/watch.html?token=<itcai-token>&course=itcai`. Chat should work identically.

- [ ] **Step 2: Announce to Cohort 1 WhatsApp group**

Message template (Majid reviews before sending):

> "تم تفعيل النقاش داخل المنصة لكل درس! افتح أي درس، تبويب 'النقاش'، واكتب سؤالك — أو شاركنا فكرتك. راح أقرأ وأرد."

### Task 35: Post-launch memory + priorities update

**Files:**
- Modify: MA EA memory `project_player_chat_v1.md`
- Modify: `context/current-priorities.md`

- [ ] **Step 1: Update memory to "live" status**

Change description to reflect shipped state; remove the "gated on redesign" note. Log commit hash + live URL.

- [ ] **Step 2: Add to current-priorities.md under "Compound / Active"**

Short line: "Player chat V1 live on `player.malearnsa.com` — Firestore + Apps Script custom tokens. Monitor usage + gather feedback for v2 (mentions-email, reactions, AI assistant)."

- [ ] **Step 3: Commit**

```bash
cd "/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA"
git add context/current-priorities.md
git commit -m "docs(priorities): player chat V1 live"
```

---

## Appendix A — Rollback plan

If the wipe job corrupts data:
1. Firestore has automatic backups if Point-in-Time-Recovery is enabled. Enable at Task 2 Step 2. If enabled, restore to pre-wipe timestamp.
2. If not enabled: the archive sheet has all messages. Manually re-seed rooms from the sheet (Apps Script script can read tab → batch-write to Firestore).

If rules deploy blocks legitimate writes:
1. Revert `firestore.rules` to previous commit.
2. `firebase deploy --only firestore:rules`.
3. Investigate with the emulator before re-deploying.

If client JS breaks the player entirely:
1. Revert the problematic commit on `main` in `malearnsa-player`.
2. Force-push is not needed — GitHub Pages redeploys on push.

---

## Appendix B — Open items deferred beyond V1

### B.1 Known gaps vs spec — must land BEFORE production (Task 33)

Spec requires these in V1; they're not individually scoped as tasks above to keep the plan tight. Add as a short polish task before production rollout — each is small enough to land in under half a day:

1. **Rate limit enforcement (spec §8.3):** 5 messages/minute, 30/hour, 200/day per user; no-duplicate-same-body within 30s. Implementation: one helper collection `rate_state/{uid}` holding `{ minuteBucket, minuteCount, hourBucket, hourCount, dayBucket, dayCount, lastBody, lastBodyAt }`. Each send is a transaction that reads, checks, updates the state, then writes the message. Firestore rules enforce the state doc exists + matches. Client shows toast `أنت ترسل بسرعة. استرح لحظة.` on rejection.

2. **Student report-message UI (spec §8.2):** tiny 🚩 button on every non-own message row that opens a one-click confirm → writes `reports/{autoId}` with `{ msgId, reporterUid, roomId, createdAt, resolved: false }`. Rules already allow this (Task 18). Majid sees 🚩 overlay on reported messages when logged in as Majid.

3. **Edit own message within 2 min (spec §8.2):** rules already allow it (Task 18). Client needs pencil icon on own messages within 2 min, inline textarea, save/cancel. Lower priority than the two above — can optionally defer to a post-V1 polish.

### B.2 Deferred beyond V1 — separate spec + plan each

Captured in spec §13 + §10.2:

- Weekly digest email (spec §10.2)
- Image/voice/video messages (spec §10.2)
- Reactions / threading (spec §10.2)
- AI assistant with Majid's knowledge (spec future hooks)
- Anti-piracy detection jobs (spec §9)
- Dedicated admin dashboard for chat (spec §10.2)
- Message search (spec §10.2)
- Profanity auto-moderation (spec §8.5)
