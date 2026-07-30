# Drift Test Protocol (operator)

**Maturity: partial** — automated hash fidelity is **enforced** in
`tests/test_acceptance.py::TestDriftAcceptance`. Multi-day semantic drift
across real Cursor chats is **declared** as an operator protocol below
(not fully automated in one session).

## Goal

Ensure multi-day conversations do not slowly distort an original **decision**.
Conversations are transient; the Continuity Ledger row is the SoT.

## Day 0 — baseline

1. Start the service: `.\scripts\start-memoryboard.ps1`
2. POST a verified decision with stable `subject` and evidence links:

```powershell
$body = @{
  content = "YOUR EXACT DECISION TEXT"
  source_agent = "operator"
  session_id = "day-0"
  type = "decision"
  status = "verified"
  confidence = 1.0
  subject = "your-subject-key"
  evidence = @(@{ kind = "doc"; ref = "path/or/url"; note = "accepted design" })
} | ConvertTo-Json -Depth 5

Invoke-RestMethod http://127.0.0.1:8001/api/jarvis/memory -Method POST -Body $body -ContentType "application/json"
```

3. Record `id` and `content_sha256` from the response into an operator log
   (or keep `tests/fixtures/drift_baseline.json` pattern).

## Day N — fidelity check

1. `GET /api/jarvis/memory/{id}`
2. Compare `content_sha256` to Day 0.
3. If mismatch → **drift detected**. Do **not** silently rewrite history.
   Resolve with a new record:
   - `supersedes=<old_id>`
   - `status=verified`
   - evidence explaining why the decision changed
4. Optionally archive the old row (`status=archived`) after supersession is posted.

## Automated partial check

```powershell
cd jarvis-memoryboard
python -m pytest tests/test_acceptance.py::TestDriftAcceptance -q
```

This proves hash fidelity and mutation detection against the fixture.
It does **not** prove multi-day Cursor chat semantic stability by itself.
