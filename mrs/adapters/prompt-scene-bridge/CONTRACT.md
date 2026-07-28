# Prompt → Scene Bridge Contract

> **Status:** Adapter mapping + Genblaze HTTP path are **enforced** by unit tests
> (`test_mrs_map.py`, `test_prompt_to_scene.py`). Engine3D world geometry arrays on
> the **unexpanded** stub remain **partial**. `expand_world_request` (Node OOP via
> engine3d-core) is **enforced** for star + mandala when Node/`dist` are present.
> Drive-G-1: do not claim default bridge stdout is always expanded; expand is opt-in.

## Purpose

Out-of-process worker turns a natural-language prompt into:

1. MRS `SceneSpecification` (RT4D / Genblaze scene-spec path)
2. `Engine3DWorldDocument` generator request (world stub), optionally expanded

Genblaze `app/*.py` must not import Infinity narrative packages; the bridge runs as a subprocess.

## Request (**enforced**)

| Field | Type | Notes |
|-------|------|--------|
| `prompt` | string | Required, 1..2000 chars |
| `width` / `height` | int | Optional render/spec dimensions |
| `samples` / `max_depth` | int | Optional RT4D quality knobs (API uses snake_case) |
| `render` | bool | Genblaze API only — optional RT4D still after bridge (default false) |
| `quality` | string | When `render=true`: draft/fast (default) or final/high |

CLI: `run_bridge.py --prompt … --json` (existing). Add `--expand` to expand world stub.

HTTP (**enforced**): `POST /api/prompt-to-scene` — health key `prompt_scene` / `prompt_scene_note`.

Error mapping (**enforced**): `ValueError` → 400; disabled/missing script (`RuntimeError`) → 503; `PromptSceneBridgeError` → 502; `GenerationQualityError` → 422.

## Response (**enforced** structure; world stub **partial** unless expand)

Worker stdout JSON (see `schemas/bridge-output.schema.json`):

| Field | Status | Notes |
|-------|--------|--------|
| `ok` | **enforced** | `true` on success; error object when false |
| `prompt` | **enforced** | Echo of input |
| `sceneSpecification` | **enforced** | Mapped MRS SceneSpecification 1.0 (tests) |
| `engine3dWorldDocument` | **partial** without expand; **enforced** non-empty `objects` when expand succeeds | Generator stub by default; expand via Node |
| `infinityScene` | **partial** | Lane or fallback narrative fields (worker-local) |
| `laneMeta` | **partial** | Provider/lane notes |

Engine3D expand path (**enforced**): `expand_world_request` shells to
`mrs/packages/engine3d-core/scripts/expand-world-document.mjs`, which calls
`createWorldGenerator` + `generateWorldFromGenerator`. Requires Node ≥20 and
built `engine3d-core` `dist/`. Opt-in via `--expand` / `PROMPT_SCENE_EXPAND_WORLD=1`.

## Surface allowlist (**enforced**)

Scene entity `geometry.surfaceId` values must stay within renderer-core `RT4D_SURFACE_IDS`
(`mrs/packages/renderer-core/src/scene-spec/validate.js`):

`tesseract`, `clifford-torus`, `central-orb`, `lattice-grid`, `torus-ring`, `orbital-cluster`, `hopf-surface`, `trefoil-4d`, `torus-3d` (plus underscore aliases where defined).

Mapper allowlist membership: **enforced** by `test_mrs_map.py`.

## Environment (**enforced** via `get_settings()`)

| Variable | Role |
|----------|------|
| `PROMPT_SCENE_BRIDGE_ENABLED` | Enable Genblaze provider (default on) |
| `PROMPT_SCENE_BRIDGE_SCRIPT` | Path to `run_bridge.py` |
| `PROMPT_SCENE_BRIDGE_PYTHON` | Optional interpreter |
| `PROMPT_SCENE_BRIDGE_TIMEOUT` | Subprocess timeout seconds |
| `PROMPT_SCENE_EXPAND_WORLD` | Opt-in expand stub → full world (`0` default; `1` enables) |
| `ENGINE3D_EXPAND_SCRIPT` | Optional override path to expand-world-document.mjs |
| `ENGINE3D_EXPAND_NODE` / `NODE_BIN` | Optional Node binary |
| `INFINITY_STORY_SRC` / `PROMPT_SCENE_INFINITY_SRC` | Optional Infinity lane source on worker `PYTHONPATH` |

## Docker `/app` layout (**partial** until Manual Deploy health)

Repo-root Dockerfile (not the app-local one) flattens the adapter beside engine3d-core:

| Path / ENV | Status |
|------------|--------|
| `COPY` → `/app/prompt-scene-bridge/` (`run_bridge.py`, `mrs_map.py`, `schemas/`) | **partial** (bundled in image contract) |
| `PROMPT_SCENE_BRIDGE_SCRIPT=/app/prompt-scene-bridge/run_bridge.py` | **partial** (belt-and-suspenders) |
| `ENGINE3D_EXPAND_SCRIPT=/app/engine3d-core/scripts/expand-world-document.mjs` | **partial** (sibling expand for flattened bridge) |
| `PROMPT_SCENE_EXPAND_WORLD=0` | **declared** opt-in (default off; build may still `--expand` smoke) |
| Dual-layout defaults (monorepo → `/app/...`) in Genblaze + `mrs_map` | **enforced** by unit tests |
| Live Render `/health.prompt_scene.available: true` | **declared** until Manual Deploy evidence |

Infinity / `story_forge` are **not** installed in the image.

## Ban (**enforced** by `test_no_story_forge_imports` for `story_forge` + `test_ban_note_app_must_not_import_narrative_lane` for `story_forge`/`storyforge`)

- Banned narrative-package strings / imports must not appear under Genblaze `app/*.py`.
- Bridge worker may use Infinity only out-of-process; Genblaze talks to the script path only.

## Status tags summary

| Artifact | Tag |
|----------|-----|
| This CONTRACT.md | **enforced** (mapping + HTTP + health + expand path; stub-without-expand remains partial) |
| `schemas/*.schema.json` | **partial** (shapes match live request/response; not CI-validated) |
| `mrs_map.py` surface → SceneSpecification | **enforced** |
| Engine3D world stub (`objects: []` etc.) | **partial** (default / no expand) |
| `expand_world_request` Node OOP | **enforced** (star + mandala tests when dist present) |
| Genblaze `/api/prompt-to-scene` + health key | **enforced** |
| Repo-root Docker bridge bundling | **partial** / operator **Prepared**; live Render availability **declared** |

## Schemas

- `schemas/prompt-to-scene-request.schema.json` — Genblaze / bridge request shape
- `schemas/bridge-output.schema.json` — worker stdout shape

## CECP

Docker bundling trail: `docs/governance/cecp/trails/prompt-scene-docker-2026-07/`.
Expand gap closure trail: `docs/governance/cecp/trails/engine3d-expand-2026-07/`.
Predecessor: `docs/governance/cecp/trails/prompt-scene-adapter-2026-07/`.
