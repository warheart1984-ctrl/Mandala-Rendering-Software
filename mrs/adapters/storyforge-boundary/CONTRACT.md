# StoryForge Boundary Adapter — Contract (v1.0 MRS crossing)

> **Status:** **partial** — MRS executes from `RenderRequest` when
> `MRS_RENDER_REQUEST_EXECUTE=1` / `--execute`. StoryForge upstream stages
> (Story→…→RenderRequest) remain **declared** (SF-owned). Full SF→MRS
> product E2E is **not** claimed enforced.

## Purpose

Validate MRS intake `RenderRequest` JSON, route to MRS render paths, and return
`RenderResult` with provenance ids and artifact SHA-256 hashes when deep
execute runs. Does **not** implement StoryForge PromptComposer, IModelBackend,
or RenderIntentBuilder.

Authoritative ownership: `BOUNDARY.md`.

## Enforced vs declared (honest v1.0)

| Concern | Tag | Evidence |
|---------|-----|----------|
| RenderRequest schema + validate (intent/world/route; smuggle refuse) | **enforced** | `test_boundary.py` |
| Ownership ban (no SF imports in adapter; no `storyforge` in Genblaze `app/`) | **enforced** | unit tests |
| CLI `run_pipeline.py` / smoke PNG path (host Node) | **partial** | `smoke_pipeline.py` |
| scene-spec → `render-scene.mjs` PNG + hashes | **partial** | execute + smoke |
| proton-raster → `run_proton_pipeline.mjs` | **partial** | execute (mocked in unit tests) |
| engine3d-world still | **skeleton** / **partial** | best-effort; may retain world JSON only |
| rt4d worldDocument | **skeleton** / **partial** | fallback to scene-spec when present |
| Story → PromptSpec → RenderRequest (SF) | **declared** | owner StoryForge — not in MRS |
| Genblaze HTTP `/api/render-request` | **partial** | optional host wire |
| CHEA / CCR / CDGF | **declared** | layer stack |

## RenderRequest (**partial** → validate **enforced**)

See `schemas/RenderRequest.schema.json`.

Required: `schemaVersion` (`1.0`), `requestId`, `intentId`, `worldId`,
`payload.route`, `payload.render`.

Banned on intake (validator): top-level or payload keys that smuggle mutable
SF-owned bodies (`promptSpec`, `renderIntent`, `promptComposer`, `modelBackend`).
Opaque hashes under `provenance` are allowed.

## RenderResult (**partial**)

See `schemas/RenderResult.schema.json`.

`status`: `ok` | `error` | `refused`. Provenance echoes intake ids. Artifacts
carry `sha256` when a PNG/JSON is written. `mapping.hashes` may include
`requestSha256`, `pngSha256`, and opaque SF hashes echoed from intake.

## Routes

| `payload.route` | Non-execute | Execute (`MRS_RENDER_REQUEST_EXECUTE=1`) | Tag |
|-----------------|-------------|------------------------------------------|-----|
| `scene-spec` | Echo `sceneSpecification` | `render-scene.mjs` → PNG | **partial** |
| `engine3d-world` | Echo world doc | Write world + optional engine3d still | **skeleton**/**partial** |
| `proton-raster` | Skeleton note | `run_proton_pipeline.mjs` | **partial** |
| `rt4d` | Skeleton note | worlddocument CLI or scene-spec fallback | **partial** |

## Ban

- No StoryForge package imports in this adapter’s runtime path for Genblaze app.
- Genblaze `app/*.py` string ban unchanged (existing tests) — HTTP surface uses
  names without `storyforge` tokens (e.g. `render_request_provider`).

## How to run (host)

```text
python mrs/adapters/storyforge-boundary/run_pipeline.py \
  -r mrs/adapters/storyforge-boundary/fixtures/sample-render-request-executable.json \
  --execute --out-dir output --json

python mrs/adapters/storyforge-boundary/smoke_pipeline.py
# → output/storyforge-pipeline-smoke.png
```

## Docker

Repo-root `Dockerfile` COPYs `storyforge-boundary` + `prompt-scene-bridge` +
proton bridge scripts. If Docker Desktop is unavailable, image build/smoke is
blocked on the operator machine; Dockerfile and `.env.example` remain the
declared ship surface.
