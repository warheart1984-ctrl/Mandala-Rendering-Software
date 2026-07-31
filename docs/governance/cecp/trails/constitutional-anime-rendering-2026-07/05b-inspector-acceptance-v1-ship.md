# 05b — Inspector Acceptance (v1.0 ship)

| Field | Value |
|-------|-------|
| `trailId` | `constitutional-anime-rendering-2026-07` |
| `role` | Inspector |
| `lens` | Testwright + Librarian |
| `verdict` | **PASS_WITH_GAPS** |

## Evidence commands

```text
pytest tests/test_anime_world_profile.py tests/test_style_steer.py tests/test_constitutional_anime_render.py -q
→ 17 passed

python -m app.constitutional_anime_render --probe-only
→ profile valid; fal/nvidia keys absent; lemonade models 200

python -m app.constitutional_anime_render --out-dir tmp/constitutional-anime-render-v1 --painter auto
→ lane=beauty polish_backend=cel-proxy anime_claim=true continuity_ok=true

python -m app.constitutional_anime_render --painter lemonade --no-cel-proxy
→ lane=structure-only anime_claim=false (sd-server model_load_error)
```

## Acceptance matrix

| Criterion | Result |
|-----------|--------|
| Profile v1.0 validates; status partial | PASS |
| Structure-only labeling when painter none/fails | PASS |
| Pipeline stages 0–3 logged | PASS |
| Cel-proxy replay hash | PASS (enforced) |
| Demo README presents product quotes | PASS |
| Visual plate honest (not fake diffusion) | PASS_WITH_GAPS |
| Diffusion painter online | FAIL / blocked (documented) |

## Visual plate critique

Engine3D soft-raster 4D-portal continuity plate with cel banding/ink: readable
silhouettes, flat palette, aliasing. Entry-point governed stylization — **not**
a finished anime still. Cel-proxy on already-banded plate is subtle.

## InspectorVerdict

`PASS_WITH_GAPS`
