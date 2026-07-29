# CECP trail — Director ATCM (Adaptive Tile Complexity Minimization)

**Trail id:** `director-atcm-2026-07`  
**ESFR:** PROMOTE_WITH_GAPS  
**Date:** 2026-07-28  
**Parent:** `director-cpu-fast-beauty-2026-07`

## Intent

Wire the ATCM program idea into Infinity Director as an evidence-bound CPU planner:
tile the frame, score complexity, classify cheap vs full, estimate work reduction,
parallelize planning — without claiming measured 2× FPS or per-tile Genblaze shading.

## “100% faster” claim boundary (Drive-G-1)

| Phrase | Meaning here |
|--------|----------------|
| ~100% faster / ~2× | Work-unit model: `WORK_CHEAP=0.25`, `WORK_FULL=1.0`; label `estimate_not_measured` |
| Not claimed | Wall-clock FPS doubling on Genblaze stills |

## Delivered

- `mrs/apps/infinity-director/app/atcm.py` — tile grid, prompt/PNG prepass, ThreadPool plan
- `POST /api/atcm/plan` — plan-only
- `speed_profile=atcm` / `atcm=true` on `POST /api/direct` — remaps to suggested fast/beauty
- UI ATCM toggle + docs in `CPU_FAST_PATH.md`
- Tests: `tests/test_atcm.py`

## Gaps (honest)

- Genblaze/Engine3D stills remain **full-frame**; per-tile shade modes are evidence only
- PNG prepass only when `source_run_id` preview is fetchable
- No CKL policy for ATCM; `print_sot: false`
- RenderAccelContract Draft v0.1: schemas + partial Director enforcement — see `ADR-001-render-accel-contract.md`
- AcceleratedRenderer Draft v0.1: governed pipeline facade — `mrs/apps/infinity-director/docs/ACCELERATED_RENDERER.md`, `app/accelerated_renderer.py`

## Artifacts

- `mrs/apps/infinity-director/docs/RENDER_ACCEL_CONTRACT.md`
- `mrs/apps/infinity-director/docs/ACCELERATED_RENDERER.md`
- `mrs/apps/infinity-director/docs/MATH_DRIVEN_RENDER_ACCEL.md`
- `mrs/apps/infinity-director/docs/MATH_DRIVEN_RENDER_ACCEL.md` — institutional five-part math program (declared; bound to `C_i`)
- `mrs/apps/infinity-director/schemas/` (RenderPlan, ComplexityEvidence, ReplayRecord, RenderViolation)
- `03-implementor-notes.md`, `ADR-001-render-accel-contract.md`
