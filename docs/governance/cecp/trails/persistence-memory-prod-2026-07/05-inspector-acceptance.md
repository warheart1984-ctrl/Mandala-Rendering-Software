# 05 — Inspector acceptance

| Field | Value |
|-------|-------|
| `trailId` | `persistence-memory-prod-2026-07` |
| `mode` | Testwright / Sage |
| `InspectorVerdict` | **PASS_WITH_GAPS** |

## Commands run

```text
cd G:\persistence-memory
python -m pip install -e ".[dev]"
python -m pytest -q --tb=short
```

**Result:** `51 passed in 2.36s` (exit 0)

## Acceptance criteria (Architect)

| Criterion | Result |
|-----------|--------|
| Continuity / Replay / Conflict / Drift hash tests | PASS |
| Legacy migration tests | PASS |
| Optional API key tests | PASS |
| README + scorecard Drive-G-2 | PASS (files present) |
| Docker build on this host | GAP — not executed locally; CI defines job |
| Live smoke against running server | GAP — not required for unit acceptance |

## Claim ↔ evidence

| Claim | Status tag | Evidence |
|-------|------------|----------|
| Continuity | enforced | TestContinuityAcceptance |
| Replay | enforced | TestReplayAcceptance |
| Conflict | enforced | TestConflictAcceptance |
| Drift | partial | TestDriftAcceptance + docs/DRIFT_PROTOCOL.md |
| API key | enforced | test_auth.py |
| CCS | declared | docs only |

## Gaps

1. Docker image not built on this Windows host this run
2. Mandala workspace package may diverge until manual sync
3. Commercial / HA / TLS out of scope

## Handoff to ESFR

InspectorVerdict `PASS_WITH_GAPS` — proceed to stage 06.
