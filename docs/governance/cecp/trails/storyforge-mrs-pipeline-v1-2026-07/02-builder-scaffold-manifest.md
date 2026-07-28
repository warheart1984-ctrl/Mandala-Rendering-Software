# 02 — Builder scaffold manifest

| Field | Value |
|-------|-------|
| Trail | `storyforge-mrs-pipeline-v1-2026-07` |
| Stage | Builder |
| Profile | Integrator (Profile) |
| Mode | Blueprint |
| Date | 2026-07-27 |

## Scaffold manifest

| Path | Action | Tag |
|------|--------|-----|
| `mrs/adapters/storyforge-boundary/paths.py` | create | **partial** |
| `mrs/adapters/storyforge-boundary/execute.py` | create | **partial** |
| `mrs/adapters/storyforge-boundary/run_pipeline.py` | create | **partial** |
| `mrs/adapters/storyforge-boundary/smoke_pipeline.py` | create | **partial** |
| `mrs/adapters/storyforge-boundary/fixtures/sample-render-request-executable.json` | create | **partial** |
| `mrs/adapters/storyforge-boundary/test_pipeline.py` | create | **partial** |
| `mrs/apps/genblaze-media/app/render_request_provider.py` | create | **partial** |
| Dockerfile / `.env.example` / CONTRACT | update | **partial** |

## Handoff to Implementor

Fill execute routes; Genblaze discover-by-schema; Docker smoke RUN.
