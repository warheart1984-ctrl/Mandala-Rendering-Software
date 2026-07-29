# IDAC.RenderRuntime v0.1

**Status:** **partial** — `app/idac/domains/rendering/runtime.py`

## Components

| Component | Status | Today |
|-----------|--------|-------|
| RenderExecutor | partial | `dispatch_render` |
| TileScheduler | partial | ATCM tile grid metadata only |
| ShadingEngine | **partial** | full_frame_dispatch + full_frame_with_tile_evidence; per_tile blocked (W-TILE-FAITHFUL). Mode validation, waiver cross-ref, tile evidence tracking — 9 verification tests. |
| PostFXEngine | declared | math_strategies upscale metadata |
| EvidenceEmitter | partial | EvidenceContract builder |
| ViolationEmitter | partial | PlanViolation JSON |

## Honesty

Genblaze/Engine3D stills are **full-frame**. Tile-faithful per-tile execution is **declared** future work; conformance tests document the gap.

## Conformance hooks

Runtime meta attached under `execution_trace.runtime` for suite assertions without claiming tile dispatch.
