# 01 — Architect ADR: StoryForge→MRS pipeline v1.0

| Field | Value |
|-------|-------|
| Trail | `storyforge-mrs-pipeline-v1-2026-07` |
| Stage | Architect |
| Profile | Systems Architect |
| Mode | Pipeline-Conductor + Boundary-Guardian |
| Date | 2026-07-27 |
| Status | **partial** |

## Intent

Ship a clear MRS v1.0 path: **RenderRequest JSON → route → SceneSpec and/or
WorldDocument → proton and/or Engine3D/RT4D still → RenderResult** with
provenance hashes. StoryForge upstream stages remain SF-owned (**declared**).

## ADR decision

1. Extend `mrs/adapters/storyforge-boundary/` with `execute.py`, `paths.py`,
   `run_pipeline.py`, `smoke_pipeline.py` — deep execute opt-in.
2. Honest CONTRACT table: enforced validate vs partial execute vs declared SF.
3. Docker COPY adapters + ENV; Genblaze `POST /api/render-request` without
   banned tokens in `app/*.py`.
4. Do **not** implement Story→PromptSpec inside MRS. No charter edits.

## Acceptance

- CLI `--execute` writes PNG + sha256 artifact
- Unit tests (mocked) + smoke script
- ESFR may `PASS_WITH_GAPS` if SF side incomplete

## Handoff to Builder

Scaffold execute/paths/CLI/smoke/fixtures/tests; wire Dockerfile ENV.
