# 03 Implementor notes

## Delivered

- `demo_cache.py`, `provider_cascade.py`, `gmi_provider.py`, `pre_render.py`
- Config/env: `GENBLAZE_DEMO_CACHE*`, `GMI_*`
- `POST /api/generate` demo_cache path + source labels
- `/health`: `gmi`, `provider_cascade`, `demo_cache`
- Docs: `HACKATHON_DEMO_CACHE_B2.md`, deploy, Devpost pitch
- Tests: `tests/test_demo_cache.py`

## Status tags

| Piece | Tag |
|-------|-----|
| Cache keying + labels | **enforced** (unit tests) |
| Live GMI generate | **partial** (needs SDK + key) |
| Demo cache B2 I/O | **partial** (needs credentials) |
| hfspace fallback | **partial** (existing polish path) |

## Gaps (follow-up slice)

| Gap | Status after follow-up |
|-----|------------------------|
| Docker `genblaze-gmicloud` | **Addressed** — `requirements-gmi.txt` + optional pip in repo-root + app Dockerfiles (non-fatal) |
| CI without keys | **Addressed** — `genblaze-demo-cache` job in `ci.yml` + Mandala Agent CI: `test_demo_cache.py` + `--schedule-hint-only` under `GENBLAZE_DRY_RUN=1` |
| AMD skip local SD | **Addressed** — `GENBLAZE_SKIP_LOCAL_SD` / `--skip-local-sd` + ops runbook |
| Live GMI credits | **Still blocked** — operator/Render dashboard only; not solvable in CI |

## Intent (follow-up)

Wire optional GMI SDK into Render SoT image, keep CI green without secrets, clarify AMD pre-render host split.
