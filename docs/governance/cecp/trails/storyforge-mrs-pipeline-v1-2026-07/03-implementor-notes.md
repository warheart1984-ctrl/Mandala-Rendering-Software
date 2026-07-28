# 03 — Implementor notes

| Field | Value |
|-------|-------|
| Trail | `storyforge-mrs-pipeline-v1-2026-07` |
| Stage | Implementor |
| Profile | Scientist |
| Mode | Constructor + Render-Physicist + Forge |
| Date | 2026-07-27 |

## What shipped

- `route_render_request(..., execute=)` → `execute.py` Node CLIs
- scene-spec → `render-scene.mjs`; proton → `run_proton_pipeline.mjs`;
  engine3d / rt4d best-effort
- CLI `run_pipeline.py`; smoke → `output/storyforge-pipeline-smoke.png`
- Genblaze `render_request_provider.py` + `POST /api/render-request`
- Dockerfile COPY boundary + proton bridge; ENV; build smoke RUN

## Tests

```text
G:\.runtime\python-3.13.14\python.exe -m pytest \
  mrs/adapters/storyforge-boundary/test_boundary.py \
  mrs/adapters/storyforge-boundary/test_pipeline.py -q
# 20 passed
```

Smoke (host): PNG written under `output/storyforge-pipeline-smoke.png`.

## Gaps left honest

- SF Story→RenderRequest producer not in MRS (**declared**)
- Docker Desktop engine down at close — Dockerfile updated, image not rebuilt live
- engine3d-world still may remain skeleton without world CLI flags
