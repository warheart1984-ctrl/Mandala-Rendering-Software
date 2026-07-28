# Prompt → Scene bridge (MRS adapter)

Out-of-process adapter that turns a natural-language prompt into:

1. **SceneSpecification** (MRS `render-scene.mjs` / Genblaze `/api/render-scene`)
2. **Engine3DWorldDocument** request (star / mandala generator stub for Engine3D),
   optionally **expanded** to a full world via engine3d-core Node

## Why out-of-process

Genblaze `app/*.py` must not import or mention the Infinity narrative package
(string ban in CI). This worker runs as a subprocess; Genblaze only knows
`PROMPT_SCENE_BRIDGE_SCRIPT`.

## Run

```bash
# Optional: enable full Infinity lane
set PYTHONPATH=G:\Project-Infinity-main\Project-Infinity-main\external\story_forge\src
# or
set INFINITY_STORY_SRC=.../external/story_forge/src

python run_bridge.py --prompt "a gothic altar under a blood moon" --json

# Expand Engine3D stub → full world (requires: cd mrs/packages/engine3d-core && npm run build)
python run_bridge.py --prompt "a 4d star mandala" --json --expand
# or
set PROMPT_SCENE_EXPAND_WORLD=1
```

Standalone expand:

```bash
cd mrs/packages/engine3d-core
npm run build
node scripts/expand-world-document.mjs --in stub.json
```

Without Infinity on `PYTHONPATH`, the worker uses a deterministic keyword fallback
and still emits valid MRS JSON.

## Genblaze

Set (wired by `get_settings()` → `Settings`):

- `PROMPT_SCENE_BRIDGE_ENABLED=1` (default on; set `0` to disable)
- `PROMPT_SCENE_BRIDGE_SCRIPT=<repo>/mrs/adapters/prompt-scene-bridge/run_bridge.py` (optional override)
- `PROMPT_SCENE_BRIDGE_PYTHON` (optional interpreter)
- `PROMPT_SCENE_BRIDGE_TIMEOUT` (optional; default 90s)
- `PROMPT_SCENE_EXPAND_WORLD=1` (optional; expand generator stubs via Node)
- `INFINITY_STORY_SRC` or `PROMPT_SCENE_INFINITY_SRC` (optional Infinity lane on worker PYTHONPATH)

Then:

- `GET /health` → `prompt_scene` + `prompt_scene_note` (includes `expand_world` flag)
- `POST /api/prompt-to-scene` with `{ "prompt": "..." }` (optional `render`, `quality`, `width`, `height`, `samples`, `max_depth`)

Structured SceneSpecification mapping is **enforced**. Unexpanded world arrays stay empty (**partial**). Expand path is **enforced** when opted in and engine3d-core `dist/` exists.

## Docker `/app` layout

Repo-root image (not app-local Dockerfile) copies this adapter to `/app/prompt-scene-bridge/` beside `/app/engine3d-core/`.

| Item | Tag |
|------|-----|
| Bundled `run_bridge.py` + `mrs_map.py` + `schemas/` | **partial** (image contract) |
| `PROMPT_SCENE_BRIDGE_SCRIPT=/app/prompt-scene-bridge/run_bridge.py` | **partial** |
| `ENGINE3D_EXPAND_SCRIPT=/app/engine3d-core/scripts/expand-world-document.mjs` | **partial** |
| `PROMPT_SCENE_EXPAND_WORLD=0` | **declared** (opt-in; default off) |
| Dual-layout path resolve without ENV | **enforced** (unit tests) |
| Live Render `/health.prompt_scene.available` | **declared** until Manual Deploy |

Infinity / narrative packages are **not** in the image. Operator maturity remains **Prepared**.
