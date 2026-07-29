# Cycle 5 — ESFR pass (gap closure under freeze)

**Date:** 2026-07-28  
**Trail:** `idac-stack-2026-07`  
**ESFR:** **PROMOTE_WITH_GAPS**  
**Certified reference runtime:** **NO** (`IDAC_CERTIFICATION_CHECKLIST.md`)

## vs Cycle 4 (strategic freeze)

| Gap | Cycle 4 | Cycle 5 |
|-----|---------|---------|
| Performance Evidence | Harness skeleton | **Recorded samples** (11-cycle5) |
| L1 live dispatch | Manual E2E only | **`IDAC_LIVE_GENBLAZE=1` test** |
| PlanViolation coverage | Partial | **+3 router tests** |
| Learning | In-memory | **JSONL file store** (no policy mutation) |
| Validation | partial skeleton | **+run_id / plan_ref checks** |
| Tile-faithful | — | **Formal waiver W-TILE-FAITHFUL** |
| Certification | — | **Checklist filled — not certified** |

## Evidence produced (by class)

| Class | Cycle 5 artifact |
|-------|------------------|
| Implementation | `learning.py` JSONL store; waivers + certification docs |
| Verification | 54 passed (+ PlanViolation, learning file test); live test optional |
| Operational | Route gate OK; live dispatch test with `IDAC_LIVE_GENBLAZE=1` |
| Performance | `11-cycle5-performance-evidence.md` + JSONL samples |
| Conformance | Waivers table enforced; certification checklist C-09/C-11/C-12 |

## Live smoke (canonical)

- `:8787` Genblaze up · `:8791` Director up  
- Route gate: warmup/atcm/idac **non-404**  
- Perf harness run recorded wall-clock (see doc 11)

## Pytest (default CI)

```text
54 passed, 3 skipped, 2 xfailed
```

Skipped: L2, perf harness (no `IDAC_PERF_RECORD`), live (no `IDAC_LIVE_GENBLAZE`).

With live + perf env: **+3** tests execute (2 perf + 1 live).

## Remaining (honest)

- Benchmark suite / p95 bar for Performance promotion  
- CKL charter (W-CKL-CHARTER)  
- Per-tile Genblaze (W-TILE-FAITHFUL)  
- Full certification — **blocked** per checklist

## Crew

Architect: freeze held. Implementor: P0–P2 delivered; P3 waiver. Inspector: pytest green. ESFR: PROMOTE_WITH_GAPS.
