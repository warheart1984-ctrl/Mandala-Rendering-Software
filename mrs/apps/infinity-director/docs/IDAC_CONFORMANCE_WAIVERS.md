# IDAC Conformance Waivers (frozen Core v0.1)

**Status:** **enforced** (process) — waivers are explicit; they do **not** upgrade evidence class.

| Waiver ID | Feature | Evidence blocked | Reason | Revisit |
|-----------|---------|------------------|--------|---------|
| `W-TILE-FAITHFUL` | Per-tile Genblaze shading | **Performance** (tile speedup bar only) | Operational conformance **cleared** 2026-07-29: Genblaze `crop_region` + `/api/engine3d-tile-still`; Director `dispatch_tile_faithful` HTTP loop + FinalFrame merge (`test_tile_faithful_dispatch.py`) | Measured wall-clock harness; no 2× fiction |
| `W-CKL-CHARTER-MRS` | MRS engine CKL loads IDAC charter | Conformance (platform constitutional gate) | MRS `GovernanceKernel` / CKL SoT out of Director scope | MRS CKL integration trail |
| `W-BIT-IDENTICAL` | Bit-identical replay | Conformance (replay) | No tile timing stream from Genblaze | Replay service + timings |
| `W-L2-MULTI` | ai/compile domains in one session | Conformance L2 | Declared stubs only | Domain implementation |
| `W-WORK-UNIT-SPEEDUP` | ATCM estimated_speedup as Performance | Performance | `estimate_not_measured` work model | Replace with harness wall-clock only |

## W-CKL-CHARTER — Cycle 7 (IDAC-local **cleared**)

**Decision:** **IDAC-local charter gate** loads `docs/IDAC_CONSTITUTION.md` + `app/idac/data/idac-invariants.json`, evaluates Intent→Plan→Evidence before dispatch (`app/idac/core/charter_gate.py`). Tests: `test_idac_charter_gate.py`.

**Note:** This does **not** bind MRS engine CKL. Residual waiver: **`W-CKL-CHARTER-MRS`** (platform scope).

## Tile-faithful execution (2026-07-29)

**Decision:** **W-TILE-FAITHFUL narrowed** — **operational conformance cleared**; waiver applies only to **Performance Evidence** (no measured speedup bar).

Director `RenderExecutor` + AcceleratedRenderer call `dispatch_tile_faithful` when `execution_mode=full_frame_with_tile_evidence`, lane `engine3d_still`, and ATCM tiles exist. StagedTileExecutionEvidence moves to **`status: enforced`** after dispatch.

**ADR (historical):** `docs/governance/cecp/trails/idac-stack-2026-07/ADR-002-tile-faithful-blocked-on-genblaze-api.md` — superseded for conformance by blockers-clear 2026-07-29.

## Agent rule

Waivers may appear in test markers (`xfail`, `skip`) and this table — never as passing Conformance rows.
