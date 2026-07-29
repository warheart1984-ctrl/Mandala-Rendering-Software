# IDAC Conformance Test Suite Specification

**Implementation:** `tests/test_idac_conformance.py`, `tests/test_idac_performance_harness.py`  
**Evidence map:** `IDAC_EVIDENCE_HIERARCHY.md`

## Levels × evidence class

| Level | Scope | Primary evidence | Director today |
|-------|-------|------------------|----------------|
| **L0** | Invariants & contract shapes | Implementation + Verification | **partial** |
| **L1** | intent→plan→execute→validate (+ HTTP) | Verification + Operational | **partial** |
| **L2** | Multi-domain ai/compile | Conformance (waived stubs) | **declared** |
| **L3** | Performance bar (optional) | Performance | **declared** (harness skeleton) |

## Test class → evidence class

| Class | Tests | Implementation | Verification | Operational | Conformance | Performance |
|-------|-------|----------------|--------------|-------------|-------------|-------------|
| Intent L0 | schema, invariants, reject | ✓ | ✓ | — | partial | — |
| Optimizer L0 | must_not_execute, render plan | ✓ | ✓ | — | partial | — |
| Router L1 | handle_intent, HTTP direct | ✓ | ✓ | partial | partial | — |
| Execution L0 | plan drift | ✓ | ✓ | — | partial | — |
| Evidence L0 | replay skeleton | ✓ | ✓ | — | partial | — |
| Validation L0 | verdict checks | ✓ | ✓ | — | partial | — |
| Learning L0 | record rules | ✓ | ✓ | — | declared | — |
| Render runtime | declared facades | ✓ | ✓ | — | declared | — |
| Performance L3 | wall-clock harness | ✓ | optional | optional | — | declared |

## Explicit gaps (honest)

| Gap | Evidence blocked | Test marker |
|-----|------------------|-------------|
| Bit-identical replay | Conformance (replay) | skipped / xfail |
| Tile-faithful ShadingEngine | Conformance + Performance | xfail declared |
| CKL charter load | Conformance | xfail declared |
| Measured 2× / FPS claims | Performance | **forbidden** |
| Full L2 multi-domain | Conformance | skip L2 |

## Route integration

`POST /api/direct` (ATCM/IDAC) → `IdacRouter` — **L1 Operational** when live `:8791` gate passes (see trail cycles 3–4).

## Run

```bash
cd mrs/apps/infinity-director
python -m pytest tests/test_idac_conformance.py tests/test_idac_performance_harness.py -q
```

Performance harness (optional):

```bash
set IDAC_PERF_RECORD=1
python -m pytest tests/test_idac_performance_harness.py -q
```
