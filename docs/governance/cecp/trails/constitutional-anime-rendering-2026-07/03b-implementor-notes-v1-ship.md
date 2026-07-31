# 03b — Implementor Notes (v1.0 ship)

| Field | Value |
|-------|-------|
| `trailId` | `constitutional-anime-rendering-2026-07` |
| `role` | Implementor |
| `lens` | Constructor + Pipeline-Conductor |
| `status` | **partial** |

## Intent

Ship AnimeWorldProfile v1.0 contract hardening, Render Constitution + lane lock,
formal pipeline CLI, painter fail-closed labeling, first demo under
`tmp/constitutional-anime-render-v1/`.

## Files touched

- `app/anime_world_profile.py` — validation → **partial** (hex, fps, nesting)
- `app/constitutional_anime_render.py` — new pipeline CLI
- `tests/test_anime_world_profile.py`, `test_style_steer.py`, `test_constitutional_anime_render.py`
- Schema/example status bump; trail docs; genblaze README; root npm script

## Verification

```bash
cd mrs/apps/genblaze-media
python -m pytest tests/test_anime_world_profile.py tests/test_style_steer.py tests/test_constitutional_anime_render.py -q
# → 17 passed
python -m app.constitutional_anime_render --probe-only
python -m app.constitutional_anime_render --out-dir ../../../tmp/constitutional-anime-render-v1 --painter auto
```

## Painter evidence (this host)

| Backend | Probe | Generate |
|---------|-------|----------|
| fal | missing key | n/a |
| Lemonade | `/models` HTTP 200 | **blocked** — `SD-Turbo` `sd-server failed to start` → structure-only when `--painter lemonade --no-cel-proxy` |
| NVIDIA | missing key | n/a |
| cel-proxy | always | **partial** anime claim; dual-apply replay enforced |

## Gaps

- True img2img beauty still blocked without FAL_KEY + polish enable, or Lemonade sd-server
- RT4D lattice character bind not used this demo (Engine3D proxies)
- Continuity plate already cel-banded → cel-proxy delta subtle visually
