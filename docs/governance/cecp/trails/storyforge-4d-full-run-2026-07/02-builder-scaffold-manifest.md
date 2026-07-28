# 02 — Builder scaffold manifest

| Field | Value |
|-------|-------|
| Trail | `storyforge-4d-full-run-2026-07` |
| Stage | Builder |
| Mode | Blueprint + Forge (SC) |
| Date | 2026-07-28 |

## Manifest

| Path | Action | Status after Implementor |
|------|--------|--------------------------|
| `fixtures/sample-render-request-cinematic-proton.json` | create | **enforced** (valid RR) |
| `fixtures/sample-render-request-cinematic-scene.json` | create | **enforced** |
| `fixtures/sample-render-request-cinematic-engine3d.json` | create | **enforced** |
| `demo_full_run.py` | create | **enforced** |
| `scripts/demo-storyforge-to-4d.mjs` | create | **enforced** |
| `paths.py` → `proton_splat_script()` | extend | **enforced** |
| `execute.py` HQ + abs paths | extend | **enforced** |
| `test_pipeline.py` HQ mock | extend | **enforced** |
| `README.md` | update | **enforced** |

## Notes

No new packages. Reuses `render-proton-splat.mjs`, `render-scene.mjs`,
`render-engine3d-still.mjs`. Docker layout unchanged (already COPY'd in prior trail).

## Handoff to Implementor

Fill HQ branch in `execute_proton_raster`, absolute `.resolve()` on out dirs,
demo orchestration + Genblaze TestClient smoke flag.
