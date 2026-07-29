# Cycle 7 — ESFR full-impact pass

**Date:** 2026-07-28  
**Trail:** `idac-stack-2026-07`  
**ESFR:** **PROMOTE_WITH_GAPS** (certification criteria not met)

## vs Cycle 6

| Area | Cycle 6 | Cycle 7 |
|------|---------|---------|
| W-TILE-FAITHFUL | waiver only | **inventory + ADR-002**; `full_frame_with_tile_evidence` + staged metadata; **not cleared** |
| W-CKL-CHARTER | open | **IDAC-local cleared** (`charter_gate.py`); **W-CKL-CHARTER-MRS** residual |
| C-10 | n≥5 record only | **provisional SLO** + `IDAC_PERF_SLO=1` soft gate |
| C-13 | — | **IDAC-local charter** checklist row **enforced** |
| Certification | false | **false** (tile + partial rows) |

## Blocker clearance

| Blocker | Cleared? | Evidence |
|---------|----------|----------|
| W-TILE-FAITHFUL | **NO** | `test_genblaze_tile_api_inventory.py`, ADR-002, `execution_mode` + StagedTileExecutionEvidence |
| W-CKL-CHARTER (IDAC-local) | **YES** | `app/idac/core/charter_gate.py`, `test_idac_charter_gate.py`, C-13 |
| W-CKL-CHARTER-MRS | **NO** (renamed waiver) | MRS CKL SoT untouched by design |
| C-10 | **partial** | provisional bar documented; optional SLO pytest |

## Evidence produced

| Class | Artifact |
|-------|----------|
| Implementation | `charter_gate.py`, `tile_evidence.py`, `idac-invariants.json` |
| Verification | `test_idac_charter_gate.py`, `test_genblaze_tile_api_inventory.py` |
| Operational | Route gate + live matrix (unchanged C-08b) |
| Performance | `15-cycle7-performance-evidence.md`, optional JSONL |
| Conformance | ADR-002, waivers + checklist Cycle 7 |

## Crew matrix

| Role | Verdict |
|------|---------|
| Architect | Freeze held; tile blocked on Genblaze API |
| Builder | ADR + checklist/waiver updates |
| Implementor | Charter gate + tile evidence mode |
| Reviewer | No fake tile-faithful clear |
| Inspector | Default pytest + optional live/perf/SLO |
| ESFR | **PROMOTE_WITH_GAPS** |

## Certification

| Field | Value |
|-------|-------|
| **certified** | **false** |
| **Remaining** | W-TILE-FAITHFUL; C-08b default CI; C-01–C-07 partial; C-10 provisional only |

## Minimum Genblaze change (tile clear)

Extend `POST /api/engine3d-still` with `crop_region: {x,y,w,h}` or add `/api/engine3d-tile-still`; Director staged loop + `tile_timings` in replay record.

## Full-impact pytest

Default matrix: **66 passed**, 3 skipped, 2 xfailed.  
Optional: `IDAC_LIVE_AUTO=1`, `IDAC_PERF_RECORD=1`, `IDAC_PERF_SLO=1`.
