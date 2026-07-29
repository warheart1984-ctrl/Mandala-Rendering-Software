# Cycle 6 — ESFR full-impact pass

**Date:** 2026-07-28  
**Trail:** `idac-stack-2026-07`  
**ESFR:** **PROMOTE_WITH_GAPS** (certification criteria not met)

## vs Cycle 5

| Area | Cycle 5 | Cycle 6 |
|------|---------|---------|
| Performance | 2 single samples | **n=5**, p50/p95, script + pytest |
| C-08 | optional live only | **C-08a enforced** in default CI; ops `idac_route_gate.py` |
| Validation | partial | **+dispatch_result / trace error checks** |
| Learning | JSONL write | **GET /api/idac/learning/status** |
| Live test | `IDAC_LIVE_GENBLAZE=1` | **+`IDAC_LIVE_AUTO=1`** when services up |
| Default pytest | 54 passed | **56 passed**, 4 skipped, 2 xfailed |
| Certification | checklist | **C-08 split**, C-05 enforced, C-10 partial multi-sample |

## Evidence produced

| Class | Artifact |
|-------|----------|
| Implementation | `ops_gate.py`, scripts, learning status endpoint |
| Verification | `test_idac_route_gate_ci.py` (default CI) |
| Operational | Route gate pass; live dispatch with `IDAC_LIVE_AUTO=1` |
| Performance | `13-cycle6-performance-evidence.md` + JSONL |
| Conformance | Checklist updated; waivers unchanged |

## Crew matrix

| Role | Verdict |
|------|---------|
| Architect | Freeze held; maturity = evidence |
| Builder | `IDAC_OPS.md`, scripts documented |
| Implementor | P0–P2 delivered; P3 waiver maintained |
| Reviewer | No certification overclaim |
| Inspector | 56 + live/perf passes when env set |
| ESFR | **PROMOTE_WITH_GAPS** |

## Blockers (certification)

- W-TILE-FAITHFUL, W-CKL-CHARTER  
- C-10: no CI performance gate / multi-env benchmark bar  
- C-08b: live dispatch not in default CI (by design — flaky without Genblaze)

## Full-impact pytest

Default matrix: **56 passed**, 4 skipped, 2 xfailed.  
With `IDAC_LIVE_AUTO=1` + `IDAC_PERF_RECORD=1`: +3 operational/performance tests.
