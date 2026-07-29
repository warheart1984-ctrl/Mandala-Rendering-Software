# Cycle 3 — canonical ports + ops fix

**Date:** 2026-07-28  
**Trail:** `idac-stack-2026-07`  
**ESFR:** PROMOTE_WITH_GAPS

## vs Cycle 2

| Item | Cycle 2 | Cycle 3 |
|------|---------|---------|
| `:8791` Director | Stale (404 on new routes) | **Killed + fresh start** from workspace |
| Live E2E | Needed `:8792` workaround | **Full pass on `:8791`** |
| Route gate | Documented | **Executed** before E2E claim |
| UI | IDAC panel | **IDAC verdict badge** (pass/fail) |
| README | — | **Stale-process restart** note |
| Pytest | 51 passed | **51 passed**, 1 skipped |

## Ops (Cycle 3)

1. `taskkill` PID on `:8791` (stale uvicorn).
2. Start from `mrs/apps/infinity-director`:
   - `DIRECTOR_GENBLAZE_BASE_URL=http://127.0.0.1:8787`
   - `DIRECTOR_PLANNER_MODE=heuristic`
   - `G:\.runtime\python-3.13.14\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8791`
3. **Route gate (non-404):** `POST /api/warmup` → 200, `POST /api/atcm/plan` (valid body) → 200, `POST /api/idac/intent` (valid IntentContract) → 200.

## Live E2E evidence (`8791` + `8787`)

| Step | HTTP | Notes |
|------|------|-------|
| `GET /health` | 200 | `planner_mode=heuristic`, Genblaze reachable |
| `POST /api/warmup` | 200 | `status=ok` |
| `POST /api/atcm/plan` | 200 | `estimate_not_measured`, `math_strategies` present |
| `POST /api/direct` atcm | 200 | `idac.validation.verdict=pass`, preview run_id set |

## Crew (short)

- **Architect:** Canonical port map enforced; stale process root cause = old uvicorn cwd/code.
- **Builder:** Route gate checklist in README + this file.
- **Implementor:** UI verdict badge; no API contract change.
- **Reviewer:** Vendor BYOK/assist boundaries unchanged; no AO/GI fiction.
- **Inspector:** 51 pytest + live gate passed.
- **ESFR:** PROMOTE_WITH_GAPS — per-tile/CKL gaps remain.

## Vendor / platform

- Render: bind `0.0.0.0:$PORT` in deploy; local dev uses loopback.
- Genblaze BYOK: NIM assist ≠ print SoT; Director CPU-first IDAC honesty preserved.

## Gaps

- Per-tile execution, CKL IDAC charter, durable learning store
- Operators must repeat kill+restart when `:8791` lags git pull
