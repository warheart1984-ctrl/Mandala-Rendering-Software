# Cycle 6 — Performance Evidence (multi-sample)

**Evidence class:** **Performance** (n=5 per operation; p50/p95 reported)  
**Date:** 2026-07-28  
**Environment:** Director `http://127.0.0.1:8791`, Genblaze `http://127.0.0.1:8787`, Python 3.13.14, Windows 10  

## Commands

```text
cd mrs/apps/infinity-director
G:\.runtime\python-3.13.14\python.exe scripts/idac_route_gate.py
set IDAC_PERF_SAMPLES=5
set IDAC_PERF_OUT=..\..\..\docs\governance\cecp\trails\idac-stack-2026-07\cycle6-performance-samples.jsonl
G:\.runtime\python-3.13.14\python.exe scripts/idac_perf_record.py
```

Pytest equivalent: `IDAC_PERF_RECORD=1` + `IDAC_PERF_SAMPLES=5` → `tests/test_idac_performance_harness.py`

## Summary (wall-clock seconds)

| Operation | n | min | median | p50 | p95 | max |
|-----------|---|-----|--------|-----|-----|-----|
| `POST /api/atcm/plan` | 5 | 0.0088 | 0.0278 | 0.0278 | 0.0826 | 0.0826 |
| `POST /api/direct` atcm | 5 | 4.2567 | 4.7937 | 4.7937 | 6.7166 | 6.7166 |

Raw JSONL: `cycle6-performance-samples.jsonl` (includes per-sample rows + `run_meta` / `run_summary`).

## Honesty

- **Not** certification; local single-host samples.
- **Not** ATCM work-unit speedup or 2× claims.
- Direct(atcm) includes full-frame Genblaze render time.
- W-TILE-FAITHFUL waiver unchanged.
