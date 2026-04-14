# Noor Agents Expansion — Design Spec (Addendum)

**Date:** 2026-04-15
**Status:** Draft — pending approval
**Scope:** Add two new specialist agents (Ideation Partner, Daftra) to the Noor stack before the MAL-137 deployment. Extends the approved 2026-04-14 Agent SDK upgrade spec.
**Parent spec:** `2026-04-14-noor-agent-sdk-upgrade-design.md`

---

## 1. What Changes

The pending deploy adds **2 new specialist agents** to the existing 4-specialist supervisor hierarchy, and updates one escalation rule. Nothing on the base architecture (SDK, tool loop, activity log, two-tier model) changes.

### Updated Agent Hierarchy

```
Noor (Supervisor — Haiku 4.5)
  ├── Calendar Agent
  ├── Linear Agent
  ├── Email Agent
  ├── Notion Agent
  ├── Ideation Partner Agent  ← NEW
  └── Daftra Agent             ← NEW
```

### Updated Escalation Rule

Parent spec Section 5 says "complex brainstorming → escalate to VS Code." That was written when Telegram Noor had no brainstorming capability. **With Ideation Partner, light-to-medium brainstorming now stays on Telegram.** Heavy work (content drafting, research, code) still escalates.

---

## 2. Ideation Partner Agent

**Role:** Brainstorm business ideas with Majid in real-time conversation. When the idea is explicitly approved, hand off to Linear Agent to create a task with a curated summary + full conversation transcript.

### Behavior

- Acts like a thinking partner: asks questions, proposes angles, challenges assumptions, pushes back when an idea is weak.
- Tone: inspirational, wise, direct. Clean English. Matches communication-style.md.
- **No auto-handoff.** Noor never creates a Linear task on its own. Only when Majid uses an explicit approval phrase.
- Approval phrases (match any): `approved`, `add to Linear`, `save this idea`, `save it`, `log this`.

### Handoff Flow

```
Step 1: Majid triggers brainstorming
  "I have an idea for a new product — a podcast with guests about creativity in Saudi"

Step 2: Noor routes to Ideation Partner (supervisor decision)
  — Detects brainstorming intent (idea, suggestion, what do you think, I'm thinking)
  — Dispatches to Ideation Partner agent

Step 3: Multi-turn discussion
  — Agent explores the idea, challenges weak points, proposes angles
  — Majid and Noor iterate until a shape emerges
  — State persists via SQLite memory (existing) + Agent SDK session

Step 4: Majid approves
  "approved, add this to Linear"

Step 5: Noor asks for target
  "Which team and project should I put it in?"
  — Options surfaced: MAL (MA Learn) / MAS (Majid Studio) / other
  — Optional project within that team

Step 6: Ideation Partner writes the Linear task
  — Title: concise idea summary (Noor generates)
  — Description:
      ## Idea
      [3–5 line curated summary — the why, the what, the next step]

      ## Full Brainstorm Transcript
      [verbatim conversation from Step 1 onward]
  — Label: "idea"
  — Priority: medium (default, Majid can override)

Step 7: Confirm + log
  "Added to Linear ✓ — MAL-XXX"
  — Activity log entry: ideation_approved / Linear task created
```

### Tools

- `linear_tools.create_task()` — reused from Linear agent
- `memory.py` SQLite — for cross-turn context within a brainstorm session
- Activity log write — for the idea_approved event

### System Prompt (summary)

```
You are the Ideation Partner for Noor, Majid Angawi's creative business
strategist. Majid runs MA Learn (creative education) and Majid Angawi
(photography + AI creative services). His north star: inspire 1 million
people in the Arab world.

Your job: brainstorm business ideas with Majid. Ask the right questions.
Challenge weak ideas. Push back when something isn't sharp. Help him
find the 10-star version of any idea.

Tone: inspirational, wise, direct. Friend and mentor, not corporate.
Can be funny. Can be provocative. Never condescending. English only.

NEVER auto-create a Linear task. Only when Majid says one of:
approved / add to Linear / save this / save it / log this

When he approves:
1. Ask which team (MAL / MAS / other) and which project (optional).
2. Write a curated 3-5 line summary of the idea.
3. Call create_linear_task with summary + full transcript as description.
4. Confirm with the task ID.

Format: conversational paragraphs, not bullets. This is discussion, not ops.
```

### State Management

Ideation Partner is a multi-turn agent like Email Agent. Uses the same pattern:

- Supervisor detects "brainstorming in progress" from memory and routes follow-up messages back to Ideation Partner until the flow resolves (approval, abandonment, or topic shift).
- SQLite memory stores the current brainstorm thread (messages + metadata: `brainstorm_active=True`).
- On approval → flush brainstorm thread to Linear, clear state, log to activity sheet.

---

## 3. Daftra Agent

**Role:** Create, send, and retrieve invoices and estimates in Daftra (ZATCA-compliant) from Telegram.

### Capabilities

| Operation | Description |
|-----------|-------------|
| `create_invoice` | Build a draft invoice: client, items, amounts, VAT. Present for approval before any action. |
| `send_invoice` | After approval, finalize and send via Daftra's email delivery. |
| `create_estimate` | Same as invoice but as a quote/estimate (pre-agreement). |
| `send_estimate` | Send an approved estimate to the client. |
| `list_recent` | "show my last invoices" / "show last estimates" → returns last N with status. |
| `get_status` | "is invoice X paid?" → check payment/send status of a specific invoice or estimate. |

### Approval Gate

Same rule as Email Agent: **Daftra Agent NEVER sends without Majid's explicit approval.** Always present the full draft (client, items, amounts, total, VAT) in Telegram first. Wait for `approved` / `send it` before sending.

### Tools

New file: `app/tools/daftra_tools.py`

```python
# Functions:
create_invoice(client_name, client_email, items, notes=None) -> dict
send_invoice(invoice_id) -> dict
create_estimate(client_name, client_email, items, notes=None) -> dict
send_estimate(estimate_id) -> dict
list_recent_invoices(limit=10) -> list
list_recent_estimates(limit=10) -> list
get_invoice_status(invoice_id) -> dict
get_estimate_status(estimate_id) -> dict
```

Uses the existing Daftra API key stored in memory (`reference_daftra.md`). Endpoint: `malearn.daftra.com/api2`.

### Client Lookup

Daftra stores clients. When Majid says "create invoice for client X":

1. Agent searches Daftra for existing client by name.
2. If found → uses that client ID.
3. If not found → asks Majid for: client name, email, and optionally phone + VAT number.
4. Creates the client record, then creates the invoice.

### System Prompt (summary)

```
You are the Daftra Agent for Noor. You manage Majid's invoicing via
malearn.daftra.com (ZATCA-compliant).

You can create invoices and estimates, send them, and look up existing
ones. You CANNOT send without explicit approval from Majid.

Always present a full draft first: client, items, unit prices, VAT,
total, notes. Wait for one of: approved / send it / send.

When creating an invoice, confirm: client name, email, line items
(description + quantity + unit price), VAT rate (default 15% KSA).

Language: English only for conversation and invoice content.
```

### Environment Variables

**New:**
```
DAFTRA_API_KEY=<existing key from memory>
DAFTRA_API_URL=https://malearn.daftra.com/api2
DAFTRA_DEFAULT_VAT=15
```

---

## 4. Supervisor Routing Updates

Noor supervisor's intent detection gets two new categories:

| Intent signal | Routes to |
|---------------|-----------|
| "I have an idea", "I'm thinking", "what do you think of", "brainstorm", "suggestion", "thoughts on" | Ideation Partner |
| "invoice", "estimate", "quote", "bill", "Daftra", "charge client" | Daftra Agent |

When a brainstorm session is active (flag in memory), subsequent messages route back to Ideation Partner automatically regardless of intent keywords. Same rule for Daftra's draft-approval state.

---

## 5. Directory Changes

### New files

```
app/agents/
  ├── ideation_agent.py       # NEW
  └── daftra_agent.py         # NEW

app/tools/
  └── daftra_tools.py         # NEW
```

### Modified files

- `app/agents/supervisor.py` — add routing for 2 new agents, update system prompt
- `app/tools/linear_tools.py` — no change (reuses existing `create_task`)
- `app/memory.py` — add `brainstorm_active` flag to session state
- `requirements.txt` — no new deps (Daftra uses `requests`, already present)

### Tests

```
tests/test_ideation_agent.py  # NEW — handoff flow, approval detection
tests/test_daftra_agent.py    # NEW — draft → approval → send, list, status
tests/test_supervisor_routing.py  # UPDATED — 2 new intent categories
```

---

## 6. Out of Scope (for this expansion)

- Heavy content drafting (social posts, marketing copy) — still escalated to VS Code tier
- Deep research — still VS Code tier
- Daftra: recurring invoices, credit notes, refunds — v2
- Ideation: automatic topic classification, cross-session idea linking — v2
- WhatsApp integration — separate track (MAL-46/47/49)
- Bunny.net — future phase with the LMS migration (MAL-117/118/119)

---

## 7. Deploy Plan (unchanged from MAL-137, extended)

1. Build Ideation Partner + Daftra on branch `agent-sdk-upgrade`
2. All tests pass
3. Update `generate_token.py` scopes (needed regardless — missing `gmail.modify` + `spreadsheets`)
4. Regenerate OAuth token (browser approval by Majid)
5. `scp token.json` to droplet
6. Add env vars to `/home/noor/.env`:
   - `ACTIVITY_LOG_SPREADSHEET_ID=1nkrwK-KJ7nD2kv_8zdYiLqot6RFoH-v67VpmjCzvYi0`
   - `ACTIVITY_LOG_SHEET_NAME=Noor Activity Log`
   - `DAFTRA_API_KEY=<from memory>`
   - `DAFTRA_API_URL=https://malearn.daftra.com/api2`
   - `DAFTRA_DEFAULT_VAT=15`
7. Merge `agent-sdk-upgrade` → `main` → GitHub Actions auto-deploys
8. Verify `curl https://noor.majidangawi.com/health` — expect tools count to reflect new agents
9. E2E tests via Telegram (@MajidNoorBot):
   - Calendar: "what's on my calendar today?"
   - Calendar create: "add a test meeting tomorrow at 3pm"
   - Linear create: "add a task: test the new Noor"
   - Email draft: "draft a test email"
   - Activity log: "what did we do today?"
   - **Ideation (NEW):** "I have an idea for a new mobile photography course" → discuss → "approved, add to Linear" → verify task created
   - **Daftra (NEW):** "create a test invoice for client Test — 99 SAR consulting" → review draft → "approved, send it" → verify sent
10. Close MAL-137 with deploy notes + link to this addendum
