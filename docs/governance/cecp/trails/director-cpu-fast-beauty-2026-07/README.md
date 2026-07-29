# CECP trail — Director CPU Fast/Beauty profiles

**Trail id:** `director-cpu-fast-beauty-2026-07`  
**ESFR:** PROMOTE_WITH_GAPS  
**Date:** 2026-07-28

## Intent
Make CPU still generation feel fast via Director speed profiles without inventing Genblaze flags that do not exist.

## Delivered
- `app/render_profiles.py` — fast/beauty/auto (evidence-bound)
- UI Fast/Beauty/Auto toggle + warmup + run-id reuse
- `GET /api/speed-profiles`, `POST /api/warmup`
- Docs: `CPU_FAST_PATH.md`, `RENDER_CONSTITUTION.md` (declared)

## Gaps (honest)
- ESRGAN / AO-GI env flags (unsupported on Genblaze still APIs)
- Path-trace Engine3D remains 501
- Constitutional render contract is **declared**, not CKL-enforced
- Follow-on ATCM planner: `director-atcm-2026-07` (tile plan + estimate; still full-frame dispatch)
- Math-driven acceleration map: `mrs/apps/infinity-director/docs/MATH_DRIVEN_RENDER_ACCEL.md`

## Modes / pack
MRS crew + Mandala pack lenses applied as documentation/governance checklist; implementation stays in infinity-director.
