# 03 — Implementor notes

| Field | Value |
|-------|-------|
| Trail | `storyforge-4d-full-run-2026-07` |
| Stage | Implementor |
| Profiles | Scientist (determinism) |
| Modes | Constructor + Render-Physicist + Artisan + Forge (SC) |
| Date | 2026-07-28 |

## What changed

1. **HQ proton:** `quality in {high,final}` → `render-proton-splat.mjs --star-demo --quality high --lighting-punch` with beauty/depth/normal artifacts; `statusTag=enforced`.
2. **Path hygiene:** all `out_dir` / artifact paths `.resolve()` so Node `cwd=script.parent` cannot write relative into the wrong tree.
3. **Engine3D:** pass `--world` + collect AOV PNGs; larger dims when HQ.
4. **Demo:** `demo_full_run.py` + Node wrapper; `--genblaze-smoke` hits `POST /api/render-request`.
5. **Schema:** quality enum adds `high`.

## Tests run

```text
G:/.runtime/python-3.13.14/python.exe -m pytest mrs/adapters/storyforge-boundary/test_boundary.py mrs/adapters/storyforge-boundary/test_pipeline.py -q
# 21 passed

G:/.runtime/python-3.13.14/python.exe mrs/adapters/storyforge-boundary/demo_full_run.py --out-dir output/cecp-full-run --genblaze-smoke
# exit 0; 7 PNGs; genblaze ok=True
```

## Status tags

| Claim | Tag |
|-------|-----|
| RenderRequest validate + route | **enforced** |
| Proton HQ star-demo → PNG+AOVs | **enforced** |
| Scene-spec → RT4D still PNG | **enforced** |
| Engine3D still PNG | **enforced** (demo run) |
| Genblaze `/api/render-request` | **enforced** (TestClient smoke) |
| SF Story→RenderRequest producer | **declared** |

## Regressions preserved

Draft smoke path (`smoke_pipeline.py`, draft clamp) unchanged in spirit;
mocked pipeline tests updated for `statusTag=enforced` + HQ mock.
