# Noor Multi-Gmail — Phase 1 Design Spec (Addendum)

**Date:** 2026-04-15
**Status:** Approved — implementation in progress
**Scope:** Add support for multiple Google accounts to Noor's Gmail tools. Bundle this into the MAL-137 deploy so the first time Noor reaches production with the Agent SDK architecture, she already has multi-inbox capability.
**Parent specs:**
- `2026-04-14-noor-agent-sdk-upgrade-design.md`
- `2026-04-15-noor-agents-expansion-design.md`

---

## 1. Phasing Decision

The conversation producing this spec surfaced 4 distinct capability areas:

1. **Multi-Gmail access** — 4 accounts, read + send on each
2. **Auto-labeling** on inbound mail — 5 categories
3. **Proactive intelligence** — analyze Lead/Client emails, cross-reference calendar + Linear, push Telegram notifications; daily 10 AM digest
4. **Adaptive learning** — style mimicry + priority pattern detection

Shipping all four at once would delay Noor's first Agent SDK deploy by another full session. Approach agreed with Majid: **Phase 1 ships the passive multi-inbox layer only (item 1 above); Phase 2 builds the proactive/learning layer (items 2–4).**

**Phase 1 deliverable:** Noor can read, draft, send, and label emails across 4 Gmail accounts on demand from Telegram. Labels exist on each inbox so she can apply them when asked, but she does not yet auto-classify incoming mail.

**Phase 2 (deferred, own spec later):** Pub/Sub-driven auto-labeling, Lead/Client analysis with Telegram notifications, daily 10 AM digest, sent-mail few-shot learning.

---

## 2. Accounts in Scope

| Key | Email | Role | Token file | OAuth status |
|---|---|---|---|---|
| `Majed.Engawi` | `majed.engawi@gmail.com` | Primary (personal) | `token.json` | needs regen for expanded scopes |
| `Angawi.Majid` | `angawi.majid@gmail.com` | Personal #2 | `token-angawi.json` | fresh OAuth |
| `Malearn` | `majid@malearnsa.com` | Business (Workspace) | `token-malearn.json` | fresh OAuth |
| `Majidangawi` | `hello@majidangawi.com` | Brand inbox (not active yet) | `token-majidangawi.json` | **deferred** — token slot defined, generated when inbox goes live |

---

## 3. Scopes (Expanded — All 4 Accounts Get the Same)

Majid's decision: every account gets the full working toolset, not just Gmail. Same scopes across all 4 tokens:

```
https://www.googleapis.com/auth/calendar.readonly
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/gmail.compose
https://www.googleapis.com/auth/gmail.modify
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/drive
https://www.googleapis.com/auth/documents
```

**Drive scope:** `drive` (full) — Majid's explicit choice. Blast radius accepted.

**Why `gmail.modify`:** required for applying labels (moving messages between folders/labels).

**Why all accounts get Calendar/Sheets/Drive/Docs:** lets Noor work inside each account's ecosystem when relevant (e.g., attach a file from the Malearn Drive to a Malearn email). Cleaner than cross-account workarounds.

---

## 4. Send-As Aliases (Malearn Only)

`majid@malearnsa.com` has three configured "Send mail as" identities in Gmail settings:

- `majid@malearnsa.com` (default)
- `info@malearnsa.com`
- `support@malearnsa.com`

These are sending addresses that all route inbound to the same inbox. No extra OAuth tokens needed — Gmail's send API accepts the `From` header set to any verified send-as identity.

---

## 5. Account Registry

New file: `app/tools/accounts.py`

```python
"""
Account registry for Noor's multi-Google-account support.
Maps display-friendly account keys to token paths and metadata.
"""

import os

ACCOUNTS = {
    "Majed.Engawi": {
        "email": "majed.engawi@gmail.com",
        "token_path": os.environ.get(
            "GOOGLE_TOKEN_PATH_MAJED_ENGAWI",
            "/home/noor/token.json",
        ),
        "aliases": [],
        "display_name": "Majed.Engawi (primary)",
    },
    "Angawi.Majid": {
        "email": "angawi.majid@gmail.com",
        "token_path": os.environ.get(
            "GOOGLE_TOKEN_PATH_ANGAWI_MAJID",
            "/home/noor/token-angawi.json",
        ),
        "aliases": [],
        "display_name": "Angawi.Majid",
    },
    "Malearn": {
        "email": "majid@malearnsa.com",
        "token_path": os.environ.get(
            "GOOGLE_TOKEN_PATH_MALEARN",
            "/home/noor/token-malearn.json",
        ),
        "aliases": [
            {"key": "majid", "email": "majid@malearnsa.com"},
            {"key": "info", "email": "info@malearnsa.com"},
            {"key": "support", "email": "support@malearnsa.com"},
        ],
        "display_name": "Malearn (majid@malearnsa.com)",
    },
    "Majidangawi": {
        "email": "hello@majidangawi.com",
        "token_path": os.environ.get(
            "GOOGLE_TOKEN_PATH_MAJIDANGAWI",
            "/home/noor/token-majidangawi.json",
        ),
        "aliases": [],
        "display_name": "Majidangawi (hello@) — inactive until configured",
        "active": False,
    },
}

DEFAULT_ACCOUNT = "Majed.Engawi"


def get_account(key):
    """Look up an account by key. Raises KeyError with a helpful message if unknown."""
    if key not in ACCOUNTS:
        valid = ", ".join(ACCOUNTS.keys())
        raise KeyError(f"Unknown account '{key}'. Valid: {valid}")
    return ACCOUNTS[key]


def get_alias_email(account_key, alias_key):
    """Look up a send-as alias email. Returns None if the account has no such alias."""
    account = get_account(account_key)
    for alias in account.get("aliases", []):
        if alias["key"] == alias_key:
            return alias["email"]
    return None
```

---

## 6. Google Auth Refactor

`app/tools/google_auth.py` gains an `account` parameter:

```python
def get_google_service(service_name, version, account=None):
    """Get an authenticated Google API service client for a specific account.

    Args:
        service_name: e.g. "gmail", "calendar", "sheets", "drive", "docs"
        version: e.g. "v1", "v3"
        account: account key from accounts.ACCOUNTS. Defaults to DEFAULT_ACCOUNT.
    """
    from tools.accounts import get_account, DEFAULT_ACCOUNT
    account_key = account or DEFAULT_ACCOUNT
    token_path = get_account(account_key)["token_path"]
    creds = Credentials.from_authorized_user_file(token_path, SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        with open(token_path, "w") as f:
            f.write(creds.to_json())
    return build(service_name, version, credentials=creds)
```

SCOPES constant expands to the 9-scope list from Section 3.

Back-compat: calendar_tools, activity_log, and any other non-Gmail callers don't pass `account` — they use `DEFAULT_ACCOUNT` (primary).

---

## 7. Gmail Tool Changes

All 6 existing Gmail handlers gain an `account` parameter (required in schema). `draft_email` and `send_approved_email` also gain optional `from_alias`. One new handler: `label_email`.

### Tool signatures (after refactor)

| Handler | Parameters |
|---|---|
| `get_unread_emails` | `account` (req), `limit=10` |
| `get_email_count` | `account` (req) |
| `search_threads` | `account` (req), `query` (req), `limit=10` |
| `draft_email` | `account` (req), `to` (req), `subject` (req), `body` (req), `from_alias` (opt, only for Malearn) |
| `send_approved_email` | `account` (req), `to`, `subject`, `body`, `thread_id` (opt), `from_alias` (opt, only for Malearn) |
| `reply_to_thread` | `account` (req), `thread_id` (req), `body` (req), `from_alias` (opt, only for Malearn) |
| **NEW** `label_email` | `account` (req), `message_id` (req), `label` (req — one of "Lead", "Client", "Newsletter", "Payment", "Notification") |

### from_alias validation

If `from_alias` is passed with `account != "Malearn"`, handler returns an error string. Only Malearn has aliases configured.

---

## 8. Label Setup

New one-time script: `scripts/setup_gmail_labels.py` (in the noor-telegram-bot repo).

For each account in ACCOUNTS:
1. Fetch existing labels via Gmail API.
2. For each of the 5 canonical labels (`Lead`, `Client`, `Newsletter`, `Payment`, `Notification`):
   - If already present on that account, skip.
   - Else, create it with `labels.create`.
3. Print a summary (created / skipped) per account.

Idempotent. Safe to re-run. Run locally from Majid's Mac with fresh tokens; talks to Gmail API directly — no droplet dependency.

---

## 9. System Prompt Updates

Add to `app/system_prompt.txt` (inserted after the existing EMAIL RULES section):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MULTI-ACCOUNT EMAIL RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Majid has 4 Google accounts. Every Gmail tool call must specify which one:

  - Majed.Engawi — primary personal (majed.engawi@gmail.com)
  - Angawi.Majid — secondary personal (angawi.majid@gmail.com)
  - Malearn — business (majid@malearnsa.com)
  - Majidangawi — brand inbox (hello@majidangawi.com) — not active yet

For new outbound emails: ALWAYS ask Majid which account to send from. Never assume.

For replies: use the account the incoming email was sent to.

When account=Malearn, ask which send-from identity unless the context makes it
obvious (e.g. "reply from support" or "send from info"):
  - majid — majid@malearnsa.com (default business identity)
  - info — info@malearnsa.com (general inquiries)
  - support — support@malearnsa.com (customer support)

Pass the alias via the from_alias parameter ("majid" | "info" | "support").

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EMAIL LABELS (manual for now — auto in Phase 2)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Each inbox has 5 labels configured: Lead, Client, Newsletter, Payment, Notification.

Use label_email when Majid asks you to label a specific email. The 5 labels mean:
  - Lead — client asking for availability or rates
  - Client — follow-ups, opportunities, work requests, collaborations, approvals,
    changes
  - Newsletter — newsletters and broadcasts
  - Payment — payment events (success, failure, reminders, receipts)
  - Notification — calendar invites, app notifications, OTPs, verifications, MOMs

Automatic labeling on every inbound email is not yet live — a future update will
add that. For now you only label when explicitly asked.
```

---

## 10. Environment Variables (Droplet)

New entries appended to `/home/noor/.env`:

```
# Multi-Gmail account token paths
GOOGLE_TOKEN_PATH_MAJED_ENGAWI=/home/noor/token.json
GOOGLE_TOKEN_PATH_ANGAWI_MAJID=/home/noor/token-angawi.json
GOOGLE_TOKEN_PATH_MALEARN=/home/noor/token-malearn.json
GOOGLE_TOKEN_PATH_MAJIDANGAWI=/home/noor/token-majidangawi.json
```

The Majidangawi path is populated in advance; the token file won't exist until that inbox is activated in Phase 1.5 or 2.

---

## 11. Deployment Unblocker — chown

The existing GitHub Actions deploy has been broken since Apr 9 due to an invalid SSH key. Separately, `/home/noor/app` is owned by root, blocking any `git pull` from the `noor` user. Before this Phase 1 deploy can land, Majid runs one command:

```bash
ssh noor@noor.majidangawi.com "sudo chown -R noor:noor /home/noor/app"
```

(Requires his sudo password once.) After this, manual deploys and future GitHub Actions deploys (once the SSH key is fixed in a follow-up) both work.

---

## 12. What Phase 2 Will Add (scoped, not built)

For future-me / future-session context — do NOT build any of this in Phase 1:

- **Pub/Sub push notifications** on inbound Gmail per account (4 watches to maintain — 7-day renewal)
- **Classifier** — LLM prompt that reads incoming email + returns label. Haiku-based. ~$0.0002 per email.
- **Lead/Client deep analysis flow** — when label=Lead or Client, Noor also reads calendar for availability conflicts, reads Linear for related tasks, writes a summary + suggested next action, pushes to Majid via Telegram.
- **Daily 10 AM KSA digest** — systemd timer on droplet → endpoint that summarizes yesterday's labeled activity into a Telegram message.
- **Sent-mail few-shot store** — on every `send_approved_email`, append the message to a per-account rolling log. When Noor drafts a new reply, pull 3–5 recent sends on the same thread/topic/recipient and inject as style references in the drafter's prompt.
- **Label override tracking** — when Majid manually re-labels, log the override. Use to recalibrate classifier prompts.

Phase 2 gets its own spec when we're ready.

---

## 13. Risks and Known Issues

- **Token refresh on the droplet** — each of the 4 tokens has its own refresh cycle. `get_google_service` already writes refreshed tokens back; verify this path works with all 4.
- **Per-account rate limits** — each Gmail account has its own daily quotas. Unlikely to hit at Majid's volume but worth noting.
- **Drive scope blast radius** — accepted. Full `drive` on all 4 accounts means Noor can delete anything. Trust but verify during E2E.
- **GitHub Actions auto-deploy** — still broken after Phase 1 ships. Separate cleanup task in a future session; manual deploy is acceptable for now.
