# IDAC Operations (Infinity Director)

**Status:** partial — ops scripts; not Render deploy SoT.

## Canonical ports

- Genblaze: `http://127.0.0.1:8787`
- Director: `http://127.0.0.1:8791` with `DIRECTOR_GENBLAZE_BASE_URL=http://127.0.0.1:8787`

## Route gate (Operational Evidence)

From `mrs/apps/infinity-director`:

```bash
G:\.runtime\python-3.13.14\python.exe scripts/idac_route_gate.py
```

Exit **0** when `POST /api/warmup`, `/api/atcm/plan`, `/api/idac/intent` are **non-404**. Exit **1** on 404 (stale Director).

## Performance Evidence (multi-sample)

```bash
set IDAC_PERF_SAMPLES=5
set IDAC_PERF_OUT=..\..\docs\governance\cecp\trails\idac-stack-2026-07\cycle6-performance-samples.jsonl
G:\.runtime\python-3.13.14\python.exe scripts/idac_perf_record.py
```

Or pytest with `IDAC_PERF_RECORD=1` and `IDAC_PERF_SAMPLES=5`.

## Pytest flags

| Env | Purpose |
|-----|---------|
| `IDAC_LIVE_GENBLAZE=1` | Live dispatch Operational test |
| `IDAC_LIVE_AUTO=1` | Live test when `:8787`/`:8791` up |
| `IDAC_PERF_RECORD=1` | Performance harness tests |

Default CI: `test_idac_route_gate_ci.py` (Verification — routes registered).
