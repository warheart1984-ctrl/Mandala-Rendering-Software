# Cycle 5 — Performance Evidence samples

**Evidence class:** **Performance** (single-run samples — not a benchmark suite)  
**Date:** 2026-07-28  
**Environment:** Director `http://127.0.0.1:8791`, Genblaze `http://127.0.0.1:8787`, heuristic planner  
**Command:**

```text
set IDAC_PERF_RECORD=1
set IDAC_PERF_OUT=docs/governance/cecp/trails/idac-stack-2026-07/cycle5-performance-samples.jsonl
cd mrs/apps/infinity-director
G:\.runtime\python-3.13.14\python.exe -m pytest tests/test_idac_performance_harness.py -q -s
```

## Samples (JSONL)

| Operation | wall_clock_seconds | Notes |
|-----------|-------------------|--------|
| `POST /api/atcm/plan` | **0.0092** | Plan-only; no Genblaze render |
| `POST /api/direct` atcm | **5.8538** | Includes full-frame Genblaze dispatch; `idac_verdict=pass` |

Raw lines: `cycle5-performance-samples.jsonl` (same directory).

## Honesty

- **Not** Performance Evidence for ATCM work-unit `estimated_speedup` (`estimate_not_measured`).
- **Not** certification; two samples only — no p50/p95 bar.
- Tile-faithful execution waived: `IDAC_CONFORMANCE_WAIVERS.md` **W-TILE-FAITHFUL**.
