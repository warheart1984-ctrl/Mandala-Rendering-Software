# Implementor notes — RenderAccelContract hookup

**Trail:** `director-atcm-2026-07`  
**Mode:** crew (Architect → Builder → Implementor → Inspector)

## Files touched

- `mrs/apps/infinity-director/app/render_accel.py` — artifact builders + violation type
- `mrs/apps/infinity-director/app/main.py` — attach artifacts; violation HTTP 422
- `mrs/apps/infinity-director/schemas/*.schema.json`
- `mrs/apps/infinity-director/docs/RENDER_ACCEL_CONTRACT.md`
- `mrs/apps/infinity-director/docs/RENDER_CONSTITUTION.md` (Articles VI–X)
- `tests/test_render_accel_contract.py`

## Verified behavior

- Explicit ATCM only (`speed_profile=atcm` or `atcm=true`)
- `print_sot: false` on plans; `execution_mode: full_frame_dispatch`
- ReplayRecord skeleton with `verdict: unverified`, `tile_timings: null`

## Gaps (ESFR PROMOTE_WITH_GAPS)

- No per-tile Engine3D/Genblaze execution
- No measured 2× wall-clock benchmarks
- Replay not deterministic / no tile timing stream
- SceneGraph hash is prompt/scene_spec proxy
- No CKL policy binding RenderViolation

## Test command

```bash
cd mrs/apps/infinity-director
py -3 -m pytest tests/test_atcm.py tests/test_render_accel_contract.py tests/test_direct_api.py -q
```
