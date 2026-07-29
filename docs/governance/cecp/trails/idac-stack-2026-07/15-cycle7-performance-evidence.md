# Cycle 7 — Performance Evidence (provisional bar)

**Date:** 2026-07-28  
**Trail:** `idac-stack-2026-07`

## Provisional SLO (local reference — not marketing)

| Operation | Metric | Bar |
|-----------|--------|-----|
| `POST /api/atcm/plan` | p95 wall-clock | &lt; 1.0 s |
| `POST /api/direct` `speed_profile=atcm` | p95 wall-clock | &lt; 30.0 s |

Enforcement: pytest `TestPerformanceProvisionalSLO` when `IDAC_PERF_SLO=1` (optional CI; flaky on cold spin-up).

## Collection

```powershell
$env:IDAC_PERF_RECORD="1"
$env:IDAC_PERF_SAMPLES="5"
$env:IDAC_PERF_CYCLE="7"
$env:IDAC_PERF_OUT="docs/governance/cecp/trails/idac-stack-2026-07/cycle7-performance-samples.jsonl"
python -m pytest tests/test_idac_performance_harness.py -k multi_sample -v
```

## Samples (recorded Cycle 7, n=5)

| Operation | p50 (s) | p95 (s) | vs provisional bar |
|-----------|---------|---------|---------------------|
| `POST /api/atcm/plan` | 0.3885 | 1.4073 | p95 **above** 1.0 s (cold/warm mix — bar is soft) |
| `POST /api/direct` atcm | 6.2619 | 13.9008 | **within** 30.0 s |

Artifact: `cycle7-performance-samples.jsonl`
