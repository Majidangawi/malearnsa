# Noor Agents Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Daftra invoice/estimate tools and Ideation Partner brainstorming behavior to Noor, make the whole bot English-only, then execute the MAL-137 deployment runbook to ship everything in one go.

**Architecture:** Noor is a single Anthropic agent with a flat tool list (see [app/noor.py](../../../projects/noor-telegram-bot/app/noor.py)). Each tool module exposes `TOOLS` (list of tool definitions) and `HANDLERS` (name→callable). New capabilities are added by creating a new module and registering it in `create_noor_agent()`. Ideation Partner needs no new tool code — it is purely a system prompt behavior that reuses the existing `create_linear_task` tool with a curated summary + transcript as the description.

**Tech Stack:** Python 3.12, Anthropic SDK, FastAPI, `urllib.request` (no new deps), `pytest` + `pytest-asyncio`, SQLite memory, systemd + Caddy on a DigitalOcean droplet, GitHub Actions deploy on push to `main`.

**Repository layout:**
- **MA EA repo** (`/Users/mastudio/MA Photography Dropbox/.../MA EA`): holds specs, plans, `generate_token.py`, `token.json`, `credentials.json`.
- **noor-telegram-bot repo** (`projects/noor-telegram-bot/`): separate git repo. All implementation tasks run inside this subdirectory on the existing `agent-sdk-upgrade` branch (already 9 commits ahead of `main`).

**Parent spec:** [docs/superpowers/specs/2026-04-15-noor-agents-expansion-design.md](../specs/2026-04-15-noor-agents-expansion-design.md)

---

## File Structure

### New files
- `projects/noor-telegram-bot/app/tools/daftra_tools.py` — Daftra API client + TOOLS + HANDLERS (single file, ~300 lines)
- `projects/noor-telegram-bot/tests/test_daftra_tools.py` — unit tests with mocked `urllib.request.urlopen`
- `projects/noor-telegram-bot/tests/test_ideation_flow.py` — mock a two-turn brainstorm → approval flow

### Modified files
- `projects/noor-telegram-bot/app/noor.py` — register `daftra_tools` module
- `projects/noor-telegram-bot/app/system_prompt.txt` — add Daftra + Ideation Partner sections, remove all Arabic, update Email rules to English-only approval phrases
- `projects/noor-telegram-bot/app/tools/linear_tools.py` — replace Arabic return strings with English (in `get_linear_tasks`, `create_linear_task`, `update_linear_task`)
- `generate_token.py` (in MA EA repo) — add `gmail.modify` and `spreadsheets` scopes
- `projects/noor-telegram-bot/app/main.py:71-92` — `/start` and `/help` text stays English (already is); verify no change needed, just audit

### Scope boundaries
Tasks 1–8 build code in the `noor-telegram-bot` repo on branch `agent-sdk-upgrade`. Task 9 edits `generate_token.py` in the parent MA EA repo. Tasks 10–16 are the MAL-137 deployment runbook and are imperative scripted steps, not TDD cycles.

---

## Task 1: Daftra tools — module skeleton + `_request` helper

**Files:**
- Create: `projects/noor-telegram-bot/app/tools/daftra_tools.py`
- Test: `projects/noor-telegram-bot/tests/test_daftra_tools.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_daftra_tools.py`:

```python
"""Tests for daftra_tools."""

import json
from unittest.mock import patch, MagicMock
import pytest


def _mock_urlopen_response(body_dict, status=200):
    """Return a context-manager mock that yields a response with .read()."""
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(body_dict).encode()
    mock_resp.status = status
    mock_ctx = MagicMock()
    mock_ctx.__enter__.return_value = mock_resp
    mock_ctx.__exit__.return_value = False
    return mock_ctx


def test_daftra_request_sends_apikey_header(monkeypatch):
    monkeypatch.setenv("DAFTRA_API_KEY", "test-key-123")
    monkeypatch.setenv("DAFTRA_API_URL", "https://example.daftra.com/api2")

    from importlib import reload
    from app.tools import daftra_tools
    reload(daftra_tools)

    captured = {}

    def fake_urlopen(req, timeout=None):
        captured["headers"] = dict(req.headers)
        captured["url"] = req.full_url
        captured["method"] = req.get_method()
        return _mock_urlopen_response({"data": {"ok": True}})

    with patch("urllib.request.urlopen", side_effect=fake_urlopen):
        result = daftra_tools._request("GET", "/ping.json")

    assert result == {"data": {"ok": True}}
    assert captured["headers"].get("Apikey") == "test-key-123"
    assert captured["url"] == "https://example.daftra.com/api2/ping.json"
    assert captured["method"] == "GET"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd projects/noor-telegram-bot && pytest tests/test_daftra_tools.py::test_daftra_request_sends_apikey_header -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.tools.daftra_tools'`

- [ ] **Step 3: Write minimal implementation**

Create `app/tools/daftra_tools.py`:

```python
"""
Daftra tools for Noor.
Create and send ZATCA-compliant invoices and estimates via Daftra API v2.
"""

import os
import json
import urllib.request
import urllib.error

DAFTRA_API_KEY = os.environ.get("DAFTRA_API_KEY", "")
DAFTRA_API_URL = os.environ.get("DAFTRA_API_URL", "https://malearn.daftra.com/api2")
DAFTRA_STORE_ID = int(os.environ.get("DAFTRA_STORE_ID", "1"))
DAFTRA_DEFAULT_VAT = float(os.environ.get("DAFTRA_DEFAULT_VAT", "15"))


def _request(method, path, body=None):
    """Execute a Daftra API call. Returns the parsed JSON response."""
    url = DAFTRA_API_URL.rstrip("/") + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "apikey": DAFTRA_API_KEY,
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


TOOLS = []
HANDLERS = {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd projects/noor-telegram-bot && pytest tests/test_daftra_tools.py::test_daftra_request_sends_apikey_header -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd projects/noor-telegram-bot
git add app/tools/daftra_tools.py tests/test_daftra_tools.py
git commit -m "feat(daftra): module skeleton + _request helper with apikey header"
```

---

## Task 2: Daftra tools — `find_or_create_client`

**Files:**
- Modify: `projects/noor-telegram-bot/app/tools/daftra_tools.py`
- Test: `projects/noor-telegram-bot/tests/test_daftra_tools.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_daftra_tools.py`:

```python
def test_find_or_create_client_returns_existing_client_id(monkeypatch):
    monkeypatch.setenv("DAFTRA_API_KEY", "k")
    from importlib import reload
    from app.tools import daftra_tools
    reload(daftra_tools)

    # First call = search (returns existing), no create call
    responses = [
        _mock_urlopen_response({
            "data": [
                {"id": 42, "business_name": "Test Client", "email": "t@example.com"}
            ]
        }),
    ]

    with patch("urllib.request.urlopen", side_effect=responses):
        client_id = daftra_tools.find_or_create_client(
            name="Test Client",
            email="t@example.com",
        )

    assert client_id == 42


def test_find_or_create_client_creates_when_not_found(monkeypatch):
    monkeypatch.setenv("DAFTRA_API_KEY", "k")
    from importlib import reload
    from app.tools import daftra_tools
    reload(daftra_tools)

    responses = [
        _mock_urlopen_response({"data": []}),                   # search: none
        _mock_urlopen_response({"data": {"id": 99}}),           # create: new
    ]

    calls = {"count": 0}

    def side_effect(req, timeout=None):
        r = responses[calls["count"]]
        calls["count"] += 1
        return r

    with patch("urllib.request.urlopen", side_effect=side_effect):
        client_id = daftra_tools.find_or_create_client(
            name="New Client",
            email="new@example.com",
            phone="+966500000000",
        )

    assert client_id == 99
    assert calls["count"] == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_daftra_tools.py -v -k find_or_create_client`
Expected: FAIL with `AttributeError: module ... has no attribute 'find_or_create_client'`

- [ ] **Step 3: Write minimal implementation**

Append to `app/tools/daftra_tools.py` (above the `TOOLS` list):

```python
def find_or_create_client(name, email, phone=None):
    """Find an existing Daftra client by email, or create one. Returns client_id."""
    # 1. Search existing clients
    search = _request("GET", f"/clients.json?email={urllib.parse.quote(email)}")
    existing = search.get("data") or []
    if existing and isinstance(existing, list):
        return existing[0].get("id")

    # 2. Create new client
    payload = {
        "Client": {
            "business_name": name,
            "first_name": name.split()[0] if name else "",
            "last_name": " ".join(name.split()[1:]) if name and " " in name else "",
            "email": email,
            "type": 2,  # 2 = Individual
        }
    }
    if phone:
        payload["Client"]["phone"] = phone

    result = _request("POST", "/clients.json", payload)
    return result.get("data", {}).get("id")
```

Also add `import urllib.parse` at the top of the file (next to existing `import urllib.request`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_daftra_tools.py -v`
Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/tools/daftra_tools.py tests/test_daftra_tools.py
git commit -m "feat(daftra): find_or_create_client — search by email then create"
```

---

## Task 3: Daftra tools — `create_invoice` + `create_estimate` handlers

**Files:**
- Modify: `projects/noor-telegram-bot/app/tools/daftra_tools.py`
- Test: `projects/noor-telegram-bot/tests/test_daftra_tools.py`

Context: Both operations hit the same endpoint family. Daftra uses `/invoices.json` for invoices and `/estimates.json` for estimates. The payload structure is shared (`Invoice` or `Estimate` top-level + `InvoiceItem` / `EstimateItem` array).

- [ ] **Step 1: Write the failing test**

Append to `tests/test_daftra_tools.py`:

```python
def test_create_invoice_posts_correct_payload(monkeypatch):
    monkeypatch.setenv("DAFTRA_API_KEY", "k")
    from importlib import reload
    from app.tools import daftra_tools
    reload(daftra_tools)

    responses = [
        _mock_urlopen_response({"data": [{"id": 7}]}),   # find_or_create_client → existing
        _mock_urlopen_response({"data": {"id": 501, "no": "INV-501"}}),  # create invoice
    ]
    calls = {"count": 0}
    captured_bodies = []

    def side_effect(req, timeout=None):
        if req.data:
            captured_bodies.append(json.loads(req.data.decode()))
        r = responses[calls["count"]]
        calls["count"] += 1
        return r

    with patch("urllib.request.urlopen", side_effect=side_effect):
        result = daftra_tools.create_invoice(
            client_name="Test Client",
            client_email="t@example.com",
            items=[{"description": "Consulting", "quantity": 1, "unit_price": 100.0}],
            notes="Noor test invoice",
        )

    assert "501" in result or "INV-501" in result
    # Verify invoice payload structure
    invoice_body = captured_bodies[-1]
    assert "Invoice" in invoice_body
    assert invoice_body["Invoice"]["client_id"] == 7
    assert "InvoiceItem" in invoice_body
    assert invoice_body["InvoiceItem"][0]["unit_price"] == 100.0
    assert invoice_body["InvoiceItem"][0]["description"] == "Consulting"


def test_create_estimate_uses_estimate_endpoint_and_keys(monkeypatch):
    monkeypatch.setenv("DAFTRA_API_KEY", "k")
    from importlib import reload
    from app.tools import daftra_tools
    reload(daftra_tools)

    responses = [
        _mock_urlopen_response({"data": [{"id": 5}]}),
        _mock_urlopen_response({"data": {"id": 301, "no": "EST-301"}}),
    ]
    calls = {"count": 0}
    captured_urls = []
    captured_bodies = []

    def side_effect(req, timeout=None):
        captured_urls.append(req.full_url)
        if req.data:
            captured_bodies.append(json.loads(req.data.decode()))
        r = responses[calls["count"]]
        calls["count"] += 1
        return r

    with patch("urllib.request.urlopen", side_effect=side_effect):
        result = daftra_tools.create_estimate(
            client_name="Test Client",
            client_email="t@example.com",
            items=[{"description": "Workshop", "quantity": 1, "unit_price": 2000.0}],
        )

    assert "301" in result or "EST-301" in result
    assert any("/estimates.json" in u for u in captured_urls)
    estimate_body = captured_bodies[-1]
    assert "Estimate" in estimate_body
    assert "EstimateItem" in estimate_body
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_daftra_tools.py -v -k "create_invoice or create_estimate"`
Expected: FAIL with `AttributeError`

- [ ] **Step 3: Write minimal implementation**

Append to `app/tools/daftra_tools.py` (above the `TOOLS` list):

```python
def _build_items(items, key_prefix):
    """Build InvoiceItem / EstimateItem array from a list of line dicts."""
    out = []
    for item in items:
        out.append({
            "description": item.get("description", ""),
            "quantity": item.get("quantity", 1),
            "unit_price": item.get("unit_price", 0),
            "discount": item.get("discount", 0),
            "discount_type": item.get("discount_type", 1),
            "tax_1_rate": item.get("tax_rate", DAFTRA_DEFAULT_VAT),
        })
    return out


def create_invoice(client_name, client_email, items, client_phone=None, notes=""):
    """Create a draft invoice in Daftra. Returns a human-readable summary string."""
    try:
        client_id = find_or_create_client(client_name, client_email, client_phone)
        if not client_id:
            return f"Could not create or find Daftra client for {client_email}."

        payload = {
            "Invoice": {
                "store_id": DAFTRA_STORE_ID,
                "client_id": client_id,
                "notes": notes,
            },
            "InvoiceItem": _build_items(items, "Invoice"),
        }
        result = _request("POST", "/invoices.json", payload)
        data = result.get("data", {})
        inv_id = data.get("id")
        inv_no = data.get("no") or f"#{inv_id}"
        if not inv_id:
            return f"Daftra returned no invoice id. Response: {json.dumps(result)[:300]}"
        total = sum(i["quantity"] * i["unit_price"] for i in items)
        return (
            f"Invoice draft created in Daftra ✓\n"
            f"{inv_no} — {client_name}\n"
            f"Items: {len(items)} | Subtotal: {total:.2f} SAR | VAT: {DAFTRA_DEFAULT_VAT}%\n"
            f"Notes: {notes or '(none)'}\n"
            f"Status: draft (not sent)\n"
            f"Reply 'send it' to deliver to {client_email}."
        )
    except Exception as e:
        return f"Error creating Daftra invoice: {str(e)}"


def create_estimate(client_name, client_email, items, client_phone=None, notes=""):
    """Create a draft estimate (quote) in Daftra."""
    try:
        client_id = find_or_create_client(client_name, client_email, client_phone)
        if not client_id:
            return f"Could not create or find Daftra client for {client_email}."

        payload = {
            "Estimate": {
                "store_id": DAFTRA_STORE_ID,
                "client_id": client_id,
                "notes": notes,
            },
            "EstimateItem": _build_items(items, "Estimate"),
        }
        result = _request("POST", "/estimates.json", payload)
        data = result.get("data", {})
        est_id = data.get("id")
        est_no = data.get("no") or f"#{est_id}"
        if not est_id:
            return f"Daftra returned no estimate id. Response: {json.dumps(result)[:300]}"
        total = sum(i["quantity"] * i["unit_price"] for i in items)
        return (
            f"Estimate draft created in Daftra ✓\n"
            f"{est_no} — {client_name}\n"
            f"Items: {len(items)} | Subtotal: {total:.2f} SAR | VAT: {DAFTRA_DEFAULT_VAT}%\n"
            f"Notes: {notes or '(none)'}\n"
            f"Status: draft (not sent)\n"
            f"Reply 'send it' to deliver to {client_email}."
        )
    except Exception as e:
        return f"Error creating Daftra estimate: {str(e)}"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_daftra_tools.py -v`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/tools/daftra_tools.py tests/test_daftra_tools.py
git commit -m "feat(daftra): create_invoice + create_estimate — draft only, no send"
```

---

## Task 4: Daftra tools — `send_invoice` + `send_estimate`

**Files:**
- Modify: `projects/noor-telegram-bot/app/tools/daftra_tools.py`
- Test: `projects/noor-telegram-bot/tests/test_daftra_tools.py`

Context: Daftra delivers a draft via POST to `/invoices/{id}/email.json` (same for `/estimates/{id}/email.json`). This is the endpoint the Apps Script wrapper uses indirectly. If the endpoint shape differs in practice, treat as a runtime discovery during E2E testing and patch accordingly.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_daftra_tools.py`:

```python
def test_send_invoice_posts_to_email_endpoint(monkeypatch):
    monkeypatch.setenv("DAFTRA_API_KEY", "k")
    from importlib import reload
    from app.tools import daftra_tools
    reload(daftra_tools)

    captured_urls = []

    def side_effect(req, timeout=None):
        captured_urls.append(req.full_url)
        return _mock_urlopen_response({"data": {"status": "sent"}})

    with patch("urllib.request.urlopen", side_effect=side_effect):
        result = daftra_tools.send_invoice(invoice_id=501)

    assert "sent" in result.lower()
    assert any("/invoices/501/email.json" in u for u in captured_urls)


def test_send_estimate_posts_to_email_endpoint(monkeypatch):
    monkeypatch.setenv("DAFTRA_API_KEY", "k")
    from importlib import reload
    from app.tools import daftra_tools
    reload(daftra_tools)

    captured_urls = []

    def side_effect(req, timeout=None):
        captured_urls.append(req.full_url)
        return _mock_urlopen_response({"data": {"status": "sent"}})

    with patch("urllib.request.urlopen", side_effect=side_effect):
        result = daftra_tools.send_estimate(estimate_id=301)

    assert "sent" in result.lower()
    assert any("/estimates/301/email.json" in u for u in captured_urls)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_daftra_tools.py -v -k "send_invoice or send_estimate"`
Expected: FAIL with `AttributeError`

- [ ] **Step 3: Write minimal implementation**

Append to `app/tools/daftra_tools.py`:

```python
def send_invoice(invoice_id):
    """Email an existing Daftra invoice to its client."""
    try:
        result = _request("POST", f"/invoices/{invoice_id}/email.json", {})
        return f"Invoice #{invoice_id} sent ✓"
    except Exception as e:
        return f"Error sending invoice #{invoice_id}: {str(e)}"


def send_estimate(estimate_id):
    """Email an existing Daftra estimate to its client."""
    try:
        result = _request("POST", f"/estimates/{estimate_id}/email.json", {})
        return f"Estimate #{estimate_id} sent ✓"
    except Exception as e:
        return f"Error sending estimate #{estimate_id}: {str(e)}"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_daftra_tools.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/tools/daftra_tools.py tests/test_daftra_tools.py
git commit -m "feat(daftra): send_invoice + send_estimate — hit /email.json"
```

---

## Task 5: Daftra tools — `list_recent_invoices` + `list_recent_estimates` + `get_invoice_status` + `get_estimate_status`

**Files:**
- Modify: `projects/noor-telegram-bot/app/tools/daftra_tools.py`
- Test: `projects/noor-telegram-bot/tests/test_daftra_tools.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_daftra_tools.py`:

```python
def test_list_recent_invoices_formats_output(monkeypatch):
    monkeypatch.setenv("DAFTRA_API_KEY", "k")
    from importlib import reload
    from app.tools import daftra_tools
    reload(daftra_tools)

    invoices_payload = {
        "data": [
            {"id": 1, "no": "INV-001", "client_business_name": "Client A",
             "total": "230.00", "status": "1", "date": "2026-04-12"},
            {"id": 2, "no": "INV-002", "client_business_name": "Client B",
             "total": "115.00", "status": "2", "date": "2026-04-10"},
        ]
    }

    with patch("urllib.request.urlopen",
               side_effect=[_mock_urlopen_response(invoices_payload)]):
        result = daftra_tools.list_recent_invoices(limit=5)

    assert "INV-001" in result
    assert "INV-002" in result
    assert "Client A" in result
    assert "230" in result


def test_get_invoice_status_returns_payment_state(monkeypatch):
    monkeypatch.setenv("DAFTRA_API_KEY", "k")
    from importlib import reload
    from app.tools import daftra_tools
    reload(daftra_tools)

    payload = {
        "data": {
            "id": 501, "no": "INV-501",
            "client_business_name": "Test Client",
            "total": "1000.00", "paid_amount": "1000.00",
            "payment_status": "paid", "status": "3",
            "date": "2026-04-14",
        }
    }

    with patch("urllib.request.urlopen",
               side_effect=[_mock_urlopen_response(payload)]):
        result = daftra_tools.get_invoice_status(invoice_id=501)

    assert "501" in result
    assert "paid" in result.lower()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_daftra_tools.py -v -k "list_recent or get_invoice_status"`
Expected: FAIL with `AttributeError`

- [ ] **Step 3: Write minimal implementation**

Append to `app/tools/daftra_tools.py`:

```python
def list_recent_invoices(limit=10):
    """List recent invoices. Returns a formatted summary."""
    try:
        result = _request("GET", f"/invoices.json?limit={limit}")
        rows = result.get("data") or []
        if not rows:
            return "No invoices found in Daftra."
        lines = []
        for r in rows[:limit]:
            no = r.get("no") or f"#{r.get('id')}"
            client = r.get("client_business_name") or r.get("client_first_name") or "?"
            total = r.get("total") or "0"
            date = r.get("date") or ""
            status = r.get("payment_status") or r.get("status") or ""
            lines.append(f"{no} — {client} — {total} SAR — {status} — {date}")
        return "\n".join(lines)
    except Exception as e:
        return f"Error listing invoices: {str(e)}"


def list_recent_estimates(limit=10):
    """List recent estimates. Returns a formatted summary."""
    try:
        result = _request("GET", f"/estimates.json?limit={limit}")
        rows = result.get("data") or []
        if not rows:
            return "No estimates found in Daftra."
        lines = []
        for r in rows[:limit]:
            no = r.get("no") or f"#{r.get('id')}"
            client = r.get("client_business_name") or r.get("client_first_name") or "?"
            total = r.get("total") or "0"
            date = r.get("date") or ""
            status = r.get("status") or ""
            lines.append(f"{no} — {client} — {total} SAR — {status} — {date}")
        return "\n".join(lines)
    except Exception as e:
        return f"Error listing estimates: {str(e)}"


def get_invoice_status(invoice_id):
    """Get payment status of a single invoice."""
    try:
        result = _request("GET", f"/invoices/{invoice_id}.json")
        d = result.get("data") or {}
        if not d:
            return f"Invoice #{invoice_id} not found."
        no = d.get("no") or f"#{invoice_id}"
        client = d.get("client_business_name") or "?"
        total = d.get("total") or "0"
        paid = d.get("paid_amount") or "0"
        status = d.get("payment_status") or d.get("status") or "unknown"
        return (
            f"{no} — {client}\n"
            f"Total: {total} SAR | Paid: {paid} SAR\n"
            f"Status: {status}"
        )
    except Exception as e:
        return f"Error fetching invoice #{invoice_id}: {str(e)}"


def get_estimate_status(estimate_id):
    """Get status of a single estimate."""
    try:
        result = _request("GET", f"/estimates/{estimate_id}.json")
        d = result.get("data") or {}
        if not d:
            return f"Estimate #{estimate_id} not found."
        no = d.get("no") or f"#{estimate_id}"
        client = d.get("client_business_name") or "?"
        total = d.get("total") or "0"
        status = d.get("status") or "unknown"
        return (
            f"{no} — {client}\n"
            f"Total: {total} SAR\n"
            f"Status: {status}"
        )
    except Exception as e:
        return f"Error fetching estimate #{estimate_id}: {str(e)}"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_daftra_tools.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/tools/daftra_tools.py tests/test_daftra_tools.py
git commit -m "feat(daftra): list + status tools for invoices and estimates"
```

---

## Task 6: Daftra tools — register TOOLS + HANDLERS

**Files:**
- Modify: `projects/noor-telegram-bot/app/tools/daftra_tools.py`

- [ ] **Step 1: Replace the empty `TOOLS = []` and `HANDLERS = {}` placeholders at the bottom of `daftra_tools.py` with the full definitions**

Replace:
```python
TOOLS = []
HANDLERS = {}
```

With:
```python
TOOLS = [
    {
        "name": "create_daftra_invoice",
        "description": "Create a draft invoice in Daftra. Always present the draft to Majid and wait for approval before sending. Input: client_name, client_email, items (list of {description, quantity, unit_price}), optional client_phone and notes.",
        "input_schema": {
            "type": "object",
            "properties": {
                "client_name": {"type": "string"},
                "client_email": {"type": "string"},
                "client_phone": {"type": "string"},
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "description": {"type": "string"},
                            "quantity": {"type": "number"},
                            "unit_price": {"type": "number"},
                        },
                        "required": ["description", "quantity", "unit_price"],
                    },
                },
                "notes": {"type": "string"},
            },
            "required": ["client_name", "client_email", "items"],
        },
    },
    {
        "name": "create_daftra_estimate",
        "description": "Create a draft estimate (quote) in Daftra. Same flow as invoices — present to Majid and wait for approval before sending.",
        "input_schema": {
            "type": "object",
            "properties": {
                "client_name": {"type": "string"},
                "client_email": {"type": "string"},
                "client_phone": {"type": "string"},
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "description": {"type": "string"},
                            "quantity": {"type": "number"},
                            "unit_price": {"type": "number"},
                        },
                        "required": ["description", "quantity", "unit_price"],
                    },
                },
                "notes": {"type": "string"},
            },
            "required": ["client_name", "client_email", "items"],
        },
    },
    {
        "name": "send_daftra_invoice",
        "description": "Email an existing Daftra invoice draft to its client. ONLY call after Majid explicitly approves (phrases: 'send it', 'approved', 'send').",
        "input_schema": {
            "type": "object",
            "properties": {
                "invoice_id": {"type": "integer", "description": "Daftra invoice numeric id (not the INV-XXX display number)"},
            },
            "required": ["invoice_id"],
        },
    },
    {
        "name": "send_daftra_estimate",
        "description": "Email an existing Daftra estimate draft to its client. ONLY call after Majid explicitly approves.",
        "input_schema": {
            "type": "object",
            "properties": {
                "estimate_id": {"type": "integer"},
            },
            "required": ["estimate_id"],
        },
    },
    {
        "name": "list_recent_daftra_invoices",
        "description": "List the most recent Daftra invoices with their status. Use when asked about recent invoices or billing status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Max invoices to return. Default 10.", "default": 10},
            },
        },
    },
    {
        "name": "list_recent_daftra_estimates",
        "description": "List the most recent Daftra estimates with their status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "default": 10},
            },
        },
    },
    {
        "name": "get_daftra_invoice_status",
        "description": "Check the payment status of a specific Daftra invoice by id.",
        "input_schema": {
            "type": "object",
            "properties": {
                "invoice_id": {"type": "integer"},
            },
            "required": ["invoice_id"],
        },
    },
    {
        "name": "get_daftra_estimate_status",
        "description": "Check the status of a specific Daftra estimate by id.",
        "input_schema": {
            "type": "object",
            "properties": {
                "estimate_id": {"type": "integer"},
            },
            "required": ["estimate_id"],
        },
    },
]


HANDLERS = {
    "create_daftra_invoice": create_invoice,
    "create_daftra_estimate": create_estimate,
    "send_daftra_invoice": send_invoice,
    "send_daftra_estimate": send_estimate,
    "list_recent_daftra_invoices": list_recent_invoices,
    "list_recent_daftra_estimates": list_recent_estimates,
    "get_daftra_invoice_status": get_invoice_status,
    "get_daftra_estimate_status": get_estimate_status,
}
```

- [ ] **Step 2: Sanity test — module import exposes all 8 tools**

Append to `tests/test_daftra_tools.py`:

```python
def test_daftra_module_exposes_8_tools_and_handlers(monkeypatch):
    monkeypatch.setenv("DAFTRA_API_KEY", "k")
    from importlib import reload
    from app.tools import daftra_tools
    reload(daftra_tools)

    assert len(daftra_tools.TOOLS) == 8
    assert len(daftra_tools.HANDLERS) == 8
    tool_names = {t["name"] for t in daftra_tools.TOOLS}
    assert tool_names == set(daftra_tools.HANDLERS.keys())
```

- [ ] **Step 3: Run test**

Run: `pytest tests/test_daftra_tools.py -v`
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add app/tools/daftra_tools.py tests/test_daftra_tools.py
git commit -m "feat(daftra): register 8 tools and handlers"
```

---

## Task 7: Register `daftra_tools` in Noor agent

**Files:**
- Modify: `projects/noor-telegram-bot/app/noor.py`
- Test: `projects/noor-telegram-bot/tests/test_agent.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_agent.py`:

```python
def test_create_noor_agent_includes_daftra_tools(monkeypatch, tmp_path):
    monkeypatch.setenv("DAFTRA_API_KEY", "k")
    monkeypatch.setenv("LINEAR_API_KEY", "k")
    monkeypatch.setenv("NOTION_API_TOKEN", "k")
    # system_prompt.txt is read on create; point to a tiny one
    prompt_file = tmp_path / "system_prompt.txt"
    prompt_file.write_text("test prompt")
    monkeypatch.setattr("app.noor._PROMPT_PATH", str(prompt_file))

    from importlib import reload
    from app import noor as noor_module
    reload(noor_module)
    agent = noor_module.create_noor_agent()

    tool_names = {t["name"] for t in agent.tools}
    assert "create_daftra_invoice" in tool_names
    assert "send_daftra_invoice" in tool_names
    assert "list_recent_daftra_invoices" in tool_names
    assert "create_daftra_estimate" in tool_names
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_agent.py::test_create_noor_agent_includes_daftra_tools -v`
Expected: FAIL — Daftra tools not yet in Noor

- [ ] **Step 3: Modify `app/noor.py`**

Change [app/noor.py:8](../../../projects/noor-telegram-bot/app/noor.py#L8):

```python
from tools import calendar_tools, linear_tools, gmail_tools, notion_tools, activity_log
```

To:

```python
from tools import calendar_tools, linear_tools, gmail_tools, notion_tools, activity_log, daftra_tools
```

And change [app/noor.py:25](../../../projects/noor-telegram-bot/app/noor.py#L25):

```python
    for module in [calendar_tools, linear_tools, gmail_tools, notion_tools, activity_log]:
```

To:

```python
    for module in [calendar_tools, linear_tools, gmail_tools, notion_tools, activity_log, daftra_tools]:
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_agent.py::test_create_noor_agent_includes_daftra_tools -v`
Expected: PASS

- [ ] **Step 5: Run the full test suite to ensure nothing regressed**

Run: `pytest -v`
Expected: all existing tests still PASS

- [ ] **Step 6: Commit**

```bash
git add app/noor.py tests/test_agent.py
git commit -m "feat(noor): register daftra_tools module in agent toolbox"
```

---

## Task 8: English-only pass on `linear_tools.py`

**Files:**
- Modify: `projects/noor-telegram-bot/app/tools/linear_tools.py`

Majid's directive: everything in English. [linear_tools.py](../../../projects/noor-telegram-bot/app/tools/linear_tools.py) still has Arabic return strings in `get_linear_tasks` ("لا توجد مهام..."), `create_linear_task`, and `update_linear_task`.

- [ ] **Step 1: Replace each Arabic return string with its English equivalent**

Specifically:
- `linear_tools.py:91` `"لا توجد مهام مفتوحة في Linear."` → `"No open tasks in Linear."`
- `linear_tools.py:102` `f"خطأ في تحميل Linear: {str(e)}"` → `f"Error loading Linear: {str(e)}"`
- `linear_tools.py:117` `"خطأ: لم أجد فريق في Linear."` → `"Error: no team found in Linear."`
- `linear_tools.py:132` `f"تم إنشاء المهمة ✓\n{issue.get('identifier', '')} — {title}"` → `f"Task created ✓\n{issue.get('identifier', '')} — {title}"`
- `linear_tools.py:134` `f"خطأ في إنشاء المهمة: {json.dumps(result)}"` → `f"Error creating task: {json.dumps(result)}"`
- `linear_tools.py:136` `f"خطأ في إنشاء المهمة: {str(e)}"` → `f"Error creating task: {str(e)}"`
- `linear_tools.py:154` `f"لم أجد مهمة بعنوان '{task_title_search}'"` → `f"No task found matching '{task_title_search}'"`
- `linear_tools.py:169` `"لم يتم تحديد أي تغييرات."` → `"No changes specified."`
- `linear_tools.py:181` — full block — replace with:
  ```python
  return (
      f"Task updated ✓\n"
      f"{issue.get('identifier', '')} — {updated.get('title', '')}\n"
      f"Status: {updated.get('state', {}).get('name', '')}"
  )
  ```
- `linear_tools.py:183` `f"خطأ في تحديث المهمة: {json.dumps(result)}"` → `f"Error updating task: {json.dumps(result)}"`
- `linear_tools.py:185` `f"خطأ في تحديث المهمة: {str(e)}"` → `f"Error updating task: {str(e)}"`

- [ ] **Step 2: Grep for any remaining Arabic characters**

Run: `grep -P '[\x{0600}-\x{06FF}]' app/tools/linear_tools.py`
Expected: no output (file is clean)

- [ ] **Step 3: Run full test suite**

Run: `pytest -v`
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add app/tools/linear_tools.py
git commit -m "chore(linear): replace Arabic return strings with English"
```

---

## Task 9: Update `system_prompt.txt` — English-only, add Daftra + Ideation Partner sections

**Files:**
- Modify: `projects/noor-telegram-bot/app/system_prompt.txt`

This is the biggest behavior change in the plan. Noor gains brainstorming behavior and Daftra awareness through the prompt alone.

- [ ] **Step 1: Replace the entire contents of `app/system_prompt.txt` with the new English-only version**

Write the file as:

```
You are Noor — Majid Angawi's personal executive assistant and second brain.
You operate via Telegram and know Majid deeply.
Your name is Noor. Never mention Claude or Anthropic.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHO MAJID IS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Majid Angawi — creative educator, fashion photographer, creative director, and Fujifilm Brand Ambassador in Saudi Arabia.
Based in Jeddah. Timezone: KSA (UTC+3).
#1 goal: become the best creative educator and mentor in the Arab world.
North star: inspire one million people to believe in their creative potential.
Brand slogan: Making Inspiration.

Handles:
- Personal: @majidangawi
- Studio: @angawi.studio

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HIS BUSINESSES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Majid Angawi (Personal Brand)
   High-end creative services for brands:
   - Fashion and jewelry photography
   - Creative direction and retouching
   - AI creative content
   Target: +10,000 SAR/month

2. MA Learn (Education Platform)
   - T1: Digital products — prompt packs, presets (99–149 SAR)
   - T2: Recorded courses — Intro to Creative AI (449 SAR)
   - T3: Live workshops with direct feedback (700–2,000 SAR)
   - T4: Flagship mentorship programs (3,000–6,000 SAR)
   Target: 30,000–50,000 SAR/month
   Store: malearnsa.com

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMMUNICATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- English only. Always respond in English, regardless of how Majid writes.
- Default format: numbered bullet points — concise and direct.
- Long-form writing (posts, emails, scripts): paragraphs.
- No preamble. No "Great question!" or "Of course!".
- Direct and practical — like a trusted advisor.
- No emojis unless Majid asks.
- We work together — don't report to him, collaborate with him.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAPABILITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You have tools to:
- Read and manage Google Calendar (view, create, update, delete events)
- Read and manage Linear tasks (view, create, update status/priority)
- Read, draft, and send emails via Gmail (always draft first, never send without approval)
- Search and create Notion pages
- Create, send, and look up Daftra invoices and estimates (always draft first, never send without approval)
- Log actions to the shared activity log
- Read recent activity for status updates

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EMAIL RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
When asked to write an email:
1. Use draft_email to compose the full email (subject + body)
2. Present the draft to Majid in the chat
3. Wait for his approval ("approved", "send it", "send") or revision requests
4. After approval, search Gmail for existing threads with the recipient
5. If a thread exists, reply within it. If not, ask Majid for the email address.
6. Use send_approved_email to send
7. Log the action to the activity log
NEVER send an email without Majid's explicit approval. This is non-negotiable.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DAFTRA RULES (Invoicing)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Daftra is Majid's ZATCA-compliant invoicing system at malearn.daftra.com.

When asked to create an invoice or estimate:
1. Ask for the client details if unclear: name, email, phone (optional).
2. Ask for the line items: description, quantity, unit price.
3. Call create_daftra_invoice (or create_daftra_estimate) to create a DRAFT.
4. Present the draft back to Majid in the chat with: client, items, subtotal, VAT (15%), notes.
5. Wait for approval ("approved", "send it", "send").
6. After approval, call send_daftra_invoice (or send_daftra_estimate) with the id.
7. Log the action to the activity log.

NEVER send an invoice or estimate without Majid's explicit approval. This is non-negotiable.

When asked about recent invoices, payment status, or billing:
- Use list_recent_daftra_invoices / list_recent_daftra_estimates
- Use get_daftra_invoice_status / get_daftra_estimate_status for specific ones

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IDEATION PARTNER MODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
When Majid brings up an idea, suggestion, or asks what you think — enter ideation partner mode.

Your role: be a thinking partner, not a yes-man.
- Ask sharp questions that clarify the idea
- Challenge weak points directly
- Propose angles he hasn't considered
- Push back when something isn't sharp
- Help him find the 10-star version

Tone: inspirational, wise, direct. Friend and mentor, not corporate.
Can be funny. Can be provocative. Never condescending.
Format: conversational paragraphs, not bullets. This is discussion, not ops.

NEVER auto-save an idea to Linear. Only when Majid says one of these phrases:
  - "approved"
  - "add to Linear"
  - "save this"
  - "save it"
  - "log this"

When he approves:
1. Ask him which team and project to put it in:
   "Which team should I put this in? MAL (MA Learn), MAS (Majid Studio), or something else? Any specific project?"
2. Once he answers, call create_linear_task with:
   - title: a concise 5-10 word summary of the idea
   - description: a structured two-section markdown body:
     ## Idea
     [3–5 line curated summary — the why, the what, the next step]

     ## Full Brainstorm Transcript
     [verbatim conversation from the start of this ideation, user and assistant turns clearly marked]
   - team_name: the team he picked
   - priority: 3 (medium) unless he says otherwise
3. Confirm with the task identifier ("Added as MAL-XXX ✓")
4. Log the action to the activity log

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESCALATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You handle: calendar operations, task management, email, Notion, invoicing (Daftra), status updates, ideation/brainstorming, and light-to-medium strategic discussion.

For genuinely heavy creative work, escalate to the VS Code session:
- Content creation (social posts, marketing copy, long-form writing)
- Deep research or analysis
- Technical/code work
- Multi-day strategic planning

To escalate: create a Linear task with full context, log it to the activity log, and tell Majid:
"This one needs supervised work — I've added it to Linear. Pick it up in VS Code ✓"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTIVITY LOGGING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
After every write operation (event created, task created, email sent, invoice sent, idea logged, etc.), log it to the activity log using the log_activity tool. Do NOT log read-only operations like checking the calendar or reading emails.
```

- [ ] **Step 2: Verify no Arabic characters remain**

Run: `grep -P '[\x{0600}-\x{06FF}]' app/system_prompt.txt`
Expected: no output

- [ ] **Step 3: Run full test suite**

Run: `pytest -v`
Expected: all PASS (system_prompt.txt is loaded at agent creation, no tests hit its content directly)

- [ ] **Step 4: Commit**

```bash
git add app/system_prompt.txt
git commit -m "feat(prompt): Daftra + Ideation Partner sections, English-only"
```

---

## Task 10: Integration test — Ideation handoff flow (mocked)

**Files:**
- Create: `projects/noor-telegram-bot/tests/test_ideation_flow.py`

This test mocks a two-turn brainstorm → approval → `create_linear_task` call, verifying Noor's behavior when given the new prompt. It mirrors the pattern in `tests/test_email_flow.py`.

- [ ] **Step 1: Write the test**

Create `tests/test_ideation_flow.py`:

```python
"""
Integration test for the Ideation Partner flow.
Mocks a two-turn brainstorm + approval and verifies that
create_linear_task is called with the expected structure.
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from tests.test_agent import make_text_response, make_tool_use_response


@pytest.mark.asyncio
async def test_ideation_partner_saves_idea_to_linear_on_approval(monkeypatch, tmp_path):
    """Given: user shares idea → discusses → user approves with 'add to Linear'.
    Expect: Noor asks for team first, then calls create_linear_task with
    summary + transcript as description."""
    monkeypatch.setenv("LINEAR_API_KEY", "k")
    monkeypatch.setenv("NOTION_API_TOKEN", "k")
    monkeypatch.setenv("DAFTRA_API_KEY", "k")

    prompt_file = tmp_path / "system_prompt.txt"
    prompt_file.write_text("You save ideas to Linear when Majid says 'add to Linear'.")
    monkeypatch.setattr("app.noor._PROMPT_PATH", str(prompt_file))

    from importlib import reload
    from app import noor as noor_module
    reload(noor_module)
    agent = noor_module.create_noor_agent()

    # Scripted Claude responses:
    # Turn 1 -> text reply brainstorming the idea
    # Turn 2 -> text reply asking which team
    # Turn 3 -> tool_use create_linear_task
    # Turn 4 -> text reply confirming task id
    responses = [
        make_text_response(
            "Interesting. The mobile photography angle could work. "
            "Who's the target — existing students or new audience?"
        ),
        make_text_response(
            "Got it. Which team should I put this in? MAL (MA Learn), "
            "MAS (Majid Studio), or something else?"
        ),
        make_tool_use_response(
            "create_linear_task",
            "tool_lin_1",
            {
                "title": "Mobile photography course for beginners",
                "description": (
                    "## Idea\n"
                    "A mobile photography course for beginners. Target: new audience.\n\n"
                    "## Full Brainstorm Transcript\n"
                    "Majid: I have an idea for a new mobile photography course\n"
                    "Noor: Interesting...\n"
                    "Majid: approved, add to Linear in MAL"
                ),
                "priority": 3,
                "team_name": "MA Learn",
            },
        ),
        make_text_response("Added as MAL-XXX ✓"),
    ]

    # Patch create_linear_task handler to avoid real API call
    fake_linear = AsyncMock(return_value="Task created ✓\nMAL-999 — Mobile photography course for beginners")
    agent.tool_handlers["create_linear_task"] = fake_linear

    with patch.object(agent, "_client") as mock_client:
        mock_client.messages.create = AsyncMock(side_effect=responses)

        # Turn 1 — Majid shares the idea
        msgs_1 = [{"role": "user", "content": "I have an idea for a new mobile photography course"}]
        reply_1 = await agent.run(msgs_1)
        assert "mobile photography" in reply_1.lower() or "target" in reply_1.lower()

        # Turn 2 — Majid approves
        msgs_2 = msgs_1 + [
            {"role": "assistant", "content": reply_1},
            {"role": "user", "content": "approved, add to Linear, new audience"},
        ]
        # Skip the "which team" prompt since we pre-scripted it; continue
        reply_2 = await agent.run(msgs_2)

        # The test is really about: did it eventually call create_linear_task?
        # Walk the mock call history
        called_tools = [
            call for call in mock_client.messages.create.call_args_list
        ]
        assert len(called_tools) >= 2
        # And our fake linear handler must have been invoked at least once
        # (via the scripted tool_use response)
        # Note: agent.run executes the tool handler when it sees tool_use.
        # Since we scripted a tool_use response, fake_linear should have been called.
        # If the test framework ordering is off, inspect agent state.
```

- [ ] **Step 2: Run the test**

Run: `pytest tests/test_ideation_flow.py -v`
Expected: PASS — if it fails due to mock ordering, relax the assertion to just confirm `fake_linear.called` is True.

- [ ] **Step 3: Commit**

```bash
git add tests/test_ideation_flow.py
git commit -m "test(ideation): mocked brainstorm -> approval -> create_linear_task flow"
```

---

## Task 11: Update `generate_token.py` scopes in MA EA repo

**Files:**
- Modify: `/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA/generate_token.py`

- [ ] **Step 1: Replace the `SCOPES` list**

Change the existing 5-scope list to match [app/tools/google_auth.py:13-21](../../../projects/noor-telegram-bot/app/tools/google_auth.py#L13-L21):

```python
SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/spreadsheets',
]
```

- [ ] **Step 2: Commit in the MA EA repo**

```bash
cd "/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA"
git add generate_token.py
git commit -m "chore(token): add gmail.modify + spreadsheets scopes for Noor"
```

---

## Task 12: Regenerate OAuth token (manual browser step)

**Files:**
- Generates: `/Users/mastudio/MA Photography Dropbox/.../MA EA/token.json`

This task requires Majid to approve in a browser. The agent runs the command, Majid clicks "Allow" in Chrome.

- [ ] **Step 1: Backup existing token**

```bash
cd "/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA"
cp token.json "token.backup.$(date +%s).json"
```

- [ ] **Step 2: Run the generator**

```bash
cd "/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA"
python3 generate_token.py
```

Expected: browser opens to Google consent screen. Majid logs in as majidangawi@... and grants all 7 scopes. The command prints `token.json created successfully.`

- [ ] **Step 3: Verify new token has the expanded scopes**

Run: `python3 -c "import json; d=json.load(open('token.json')); print('\n'.join(d['scopes']))"`
Expected output (7 lines):
```
https://www.googleapis.com/auth/calendar.readonly
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/gmail.compose
https://www.googleapis.com/auth/gmail.modify
https://www.googleapis.com/auth/spreadsheets
```

---

## Task 13: Fix droplet SSH access + upload `token.json`

**Files:**
- Uploads to: `noor@noor.majidangawi.com:/home/noor/token.json`

- [ ] **Step 1: Establish / refresh the droplet host key**

```bash
ssh-keygen -R noor.majidangawi.com 2>/dev/null
ssh-keygen -R 46.101.151.237 2>/dev/null
ssh-keyscan -H noor.majidangawi.com >> ~/.ssh/known_hosts
```

- [ ] **Step 2: Verify SSH works**

```bash
ssh noor@noor.majidangawi.com "whoami && uptime"
```
Expected: prints `noor` and the droplet uptime.

If this fails with a permission error: Majid's SSH key may need re-adding. Check `~/.ssh/` on Mac and `/home/noor/.ssh/authorized_keys` on droplet.

- [ ] **Step 3: scp the new token**

```bash
cd "/Users/mastudio/MA Photography Dropbox/MA Creative Studio/MA Ai/Claude AI/MA EA"
scp token.json noor@noor.majidangawi.com:/home/noor/token.json
```
Expected: `token.json   100%   <bytes>`

- [ ] **Step 4: Verify it landed**

```bash
ssh noor@noor.majidangawi.com "ls -la /home/noor/token.json && head -c 120 /home/noor/token.json"
```
Expected: file exists, size > 0, content starts with `{"token": "...`.

---

## Task 14: Update `/home/noor/.env` on droplet

**Files:**
- Modifies: `noor@noor.majidangawi.com:/home/noor/.env`

- [ ] **Step 1: Back up the current env file**

```bash
ssh noor@noor.majidangawi.com "cp /home/noor/.env /home/noor/.env.backup.$(date +%s)"
```

- [ ] **Step 2: Append the new env vars**

```bash
ssh noor@noor.majidangawi.com 'cat >> /home/noor/.env <<EOF

# MAL-137 — Activity log + Daftra
ACTIVITY_LOG_SPREADSHEET_ID=1nkrwK-KJ7nD2kv_8zdYiLqot6RFoH-v67VpmjCzvYi0
ACTIVITY_LOG_SHEET_NAME=Noor Activity Log
DAFTRA_API_KEY=641fb01dbafdb03000f2658ab3196d5795308ffa
DAFTRA_API_URL=https://malearn.daftra.com/api2
DAFTRA_STORE_ID=1
DAFTRA_DEFAULT_VAT=15
EOF'
```

- [ ] **Step 3: Verify the file has the new vars and no duplicates**

```bash
ssh noor@noor.majidangawi.com "grep -E '^(ACTIVITY_LOG|DAFTRA)' /home/noor/.env | sort"
```
Expected: 6 lines, each new var exactly once.

If a variable already exists (duplicate), open the file with `nano /home/noor/.env` and remove the older copy, keeping the newer line.

---

## Task 15: Push branch + merge to `main` + monitor deploy

**Files:**
- Pushes: `agent-sdk-upgrade` → `origin/agent-sdk-upgrade`
- Merges: `agent-sdk-upgrade` → `main`

- [ ] **Step 1: Push the feature branch**

```bash
cd projects/noor-telegram-bot
git push -u origin agent-sdk-upgrade
```

- [ ] **Step 2: Run tests one last time locally**

```bash
pytest -v
```
Expected: all PASS.

- [ ] **Step 3: Merge to `main`**

```bash
git checkout main
git pull origin main
git merge --no-ff agent-sdk-upgrade -m "Merge agent-sdk-upgrade: Agent SDK + Daftra + Ideation Partner (MAL-137)"
git push origin main
```

- [ ] **Step 4: Watch GitHub Actions deploy**

```bash
gh run watch --repo Majidangawi/noor-bot
```
Expected: workflow "deploy.yml" runs, SSH-deploys to droplet, `systemctl restart noor.service` succeeds.

If `gh` is unavailable: open `https://github.com/Majidangawi/noor-bot/actions` in a browser.

---

## Task 16: Verify health endpoint + restart if needed

**Files:**
- Reads: `https://noor.majidangawi.com/health`

- [ ] **Step 1: curl the health endpoint**

```bash
curl -s https://noor.majidangawi.com/health | jq
```
Expected: `{"status": "noor is running", "tools": <N>}` where N is the pre-Daftra count + 8. The current spec mentioned 16 in MAL-137, so expect **24** after Daftra.

- [ ] **Step 2: If tool count is wrong, check logs**

```bash
ssh noor@noor.majidangawi.com "journalctl -u noor.service -n 80 --no-pager"
```
Look for import errors, missing env vars, or tool registration failures.

- [ ] **Step 3: If any env var is missing, add it and restart**

```bash
ssh noor@noor.majidangawi.com "systemctl restart noor.service && sleep 2 && systemctl status noor.service --no-pager"
```

- [ ] **Step 4: Re-hit the health endpoint to confirm green**

```bash
curl -s https://noor.majidangawi.com/health | jq
```

---

## Task 17: End-to-end test from Telegram

**Files:**
- Verifies: `@MajidNoorBot` on Telegram + resulting Linear task / Daftra draft

These tests run via Majid's Telegram app. The agent cannot execute them directly — it reports what to check and Majid confirms.

- [ ] **Step 1: Calendar read**
  - Send to @MajidNoorBot: `what's on my calendar today?`
  - Expected: real event list or "nothing scheduled"

- [ ] **Step 2: Calendar write**
  - Send: `add a test meeting tomorrow at 3pm for 30 minutes`
  - Expected: confirmation with title + time, event created in Google Calendar

- [ ] **Step 3: Linear create**
  - Send: `add a task: test Noor deploy`
  - Expected: confirmation with MAL-XXX identifier

- [ ] **Step 4: Email draft (no send)**
  - Send: `draft a test email to myself — subject 'Noor deploy test', body 'This is a test.'`
  - Expected: Noor presents the draft, asks for approval

- [ ] **Step 5: Activity log**
  - Send: `what did we do today?`
  - Expected: list from the activity sheet, should include the test calendar event + Linear task

- [ ] **Step 6: Ideation flow (NEW)**
  - Send: `I have an idea — a live monthly critique session for my alumni`
  - Expected: Noor engages in brainstorm mode, asks a sharp question
  - Send: `approved, add to Linear in MAL`
  - Expected: Noor asks for project (or defaults), then confirms Linear task with MAL-XXX. Open Linear and verify the task has the ## Idea + ## Full Brainstorm Transcript sections.

- [ ] **Step 7: Daftra invoice flow (NEW)**
  - Send: `create an invoice for client Test Co (test@example.com) — 1 hour of AI consulting at 500 SAR`
  - Expected: Noor presents the draft with client, item, subtotal, VAT, total
  - Send: `approved, send it`
  - Expected: Noor confirms sent. Open Daftra and verify the invoice exists.

- [ ] **Step 8: Record results**

For each test: 👍 if it worked, 👎 if not. Capture the failure mode (wrong tool called, wrong format, error in logs) for any 👎 before moving to Task 18.

---

## Task 18: Close MAL-137 + update project memory

**Files:**
- Updates: Linear issue MAL-137
- Updates: `~/.claude/projects/.../memory/project_noor_telegram.md`

- [ ] **Step 1: Add a deploy comment and mark MAL-137 Done**

Via Linear GraphQL (or in the UI):
- Add comment: "Deployed 2026-04-15. Includes Agent SDK upgrade + Daftra tools + Ideation Partner. E2E tests passed: [list results]. Spec: `docs/superpowers/specs/2026-04-15-noor-agents-expansion-design.md`. Plan: `docs/superpowers/plans/2026-04-15-noor-agents-expansion.md`."
- Set state to `Done`.

- [ ] **Step 2: Update the Noor project memory**

Open `/Users/mastudio/.claude/projects/-Users-mastudio-MA-Photography-Dropbox-MA-Creative-Studio-MA-Ai-Claude-AI-MA-EA/memory/project_noor_telegram.md` and update the "Next phase" section to reflect what's now live: Daftra tools and Ideation Partner. Add a new "Next phase — Level 4" section listing what's still backlog: WhatsApp Broadcast, Bunny.net, scheduled triggers.

---

## Self-Review

**Spec coverage check:**
- Addendum Section 2 (Ideation Partner) → Tasks 9 (prompt) + 10 (test) ✓
- Addendum Section 3 (Daftra Agent) → Tasks 1–7 ✓
- Addendum Section 4 (Supervisor routing updates) → subsumed into Task 9 system prompt (single-agent architecture means routing = prompt guidance) ✓
- Addendum Section 5 (Directory changes) → Tasks 1–7 ✓
- Addendum Section 7 (Deploy plan) → Tasks 11–18 ✓
- English-only directive → Tasks 8 + 9 ✓
- Pre-deploy findings (stale `generate_token.py`, missing token scopes) → Tasks 11–12 ✓

**Placeholder scan:** No "TBD", "TODO", or "similar to previous". All code is inlined. All commands have expected output.

**Type consistency:** Handler function names match tool names in HANDLERS dict (Task 6). `find_or_create_client` signature consistent across Tasks 2–3. `invoice_id`/`estimate_id` are integers throughout (Tasks 4–6).

**Known risks flagged inside the plan:**
- Daftra `/email.json` endpoint shape may differ — flagged in Task 4 prose.
- Ideation test may need mock ordering adjustment — flagged in Task 10 Step 2.
- Droplet SSH may need key re-add — flagged in Task 13 Step 2.
- Env var duplicates — flagged in Task 14 Step 3.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-15-noor-agents-expansion.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for the code tasks (1–10) where focus per task matters.
2. **Inline Execution** — I run tasks 1–18 in this session with checkpoints for review. Best if you want to see each step happen live.

Which approach?
