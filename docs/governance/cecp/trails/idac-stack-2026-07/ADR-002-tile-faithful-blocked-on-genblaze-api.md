# ADR-002 — Tile-faithful execution blocked on Genblaze API

**Status:** accepted (Cycle 7)  
**Trail:** `idac-stack-2026-07`

## Context

IDAC conformance expects tile-faithful replay when ATCM emits a tile grid. Genblaze Engine3D still path renders **full frames** only.

## Investigation (Conformance Evidence)

| Surface | Finding |
|---------|---------|
| `mrs/apps/genblaze-media/app/engine3d_still_provider.py` | No `crop_region`, tile index, or ROI parameters |
| `mrs/apps/genblaze-media/app/main.py` | No per-tile render route |
| Automated inventory | `tests/test_genblaze_tile_api_inventory.py` |

## Decision

1. **Do not** simulate per-tile Genblaze dispatch (Drive-G-1).
2. Director **`execution_mode: full_frame_with_tile_evidence`** attaches **StagedTileExecutionEvidence** (sequential tile metadata; each tile `dispatch.status: skipped`).
3. **W-TILE-FAITHFUL** waiver renamed to **blocked-on-downstream-API** — **not cleared** for certification.

## Minimum downstream change

Add to Genblaze (either):

- `POST /api/engine3d-still` body field `crop_region: { x, y, w, h }`, or
- `POST /api/engine3d-tile-still` accepting tile bounds + shared scene hash.

Director then loops staged tiles with real dispatch and collects `tile_timings`.

## Consequences

- Certification **cannot** claim tile-faithful Conformance until API + tests land.
- Planning + Verification evidence for tile grids remains valid at **partial** maturity.
