# 01 — Architect: ADR + Boundary

**Trail:** `prompt-scene-docker-2026-07`  
**Stage:** Architect  
**Predecessor:** `engine3d-expand-2026-07` (expand CLI + Genblaze opt-in); Docker gap for bridge package  
**Branch context (verified):** `feat/engine3d-genblaze-cinematic-plugin` — ahead 1, behind 9 vs `origin/feat/engine3d-genblaze-cinematic-plugin`

---

## 1. Intent

**What:** Bundle `mrs/adapters/prompt-scene-bridge` into the repo-root Genblaze Docker image under a flattened `/app` layout (same pattern as `renderer-core` / `engine3d-core`), set `PROMPT_SCENE_BRIDGE_SCRIPT` and `ENGINE3D_EXPAND_SCRIPT` (and document optional `PROMPT_SCENE_EXPAND_WORLD`) for that layout, and update `.env.example`, `render.yaml`, and Genblaze/bridge docs with honest **Prepared** / **enforced** / **partial** / **declared** tags.

**Why:** Without COPY + `/app` ENV, `/api/prompt-to-scene` reports unavailable in the production image even though the Python provider and expand path exist in the monorepo. Operators need a rebuildable image contract, not monorepo-only defaults.

**Who:** Foreman / CECP crew (Architect stage).

---

## 2. ADR decision

### Context (evidence)

- Root `Dockerfile` already:
  - Builds `engine3d-core` and copies `package.json`, `dist/`, `scripts/`, `src/` → `/app/engine3d-core`
  - Copies `renderer-core` → `/app/renderer-core`
  - Sets `RT4D_*`, `SCENE_SPEC_*`, `ENGINE3D_STILL_*`, `ENGINE3D_SEQUENCE_*` to `/app/...`
  - Does **not** `COPY mrs/adapters/prompt-scene-bridge`
- Genblaze `prompt_scene_bridge_default_script_path()` = `REPO_ROOT/mrs/adapters/prompt-scene-bridge/run_bridge.py`
- Docker `resolve_repo_root()` returns `APP_DIR` (`/app`) when monorepo parents are absent → default script path would be `/app/mrs/adapters/...` (missing)
- Bridge `mrs_map.default_expand_script_path()` uses monorepo path from `_BRIDGE_DIR.parents[2]/mrs/packages/engine3d-core/scripts/expand-world-document.mjs`, with override `ENGINE3D_EXPAND_SCRIPT`
- Flattening bridge to `/app/prompt-scene-bridge` makes `parents[2]` = `/`, so override (or sibling dual-layout) is required for expand
- Expand script already ships in image via existing `engine3d-core/scripts` COPY; `dist/` already present for expand Node OOP
- Status language today: Genblaze README Prompt→Scene row is **Prepared**; expand contract is **enforced** when opted in; stub without expand remains **partial** (`CONTRACT.md`)

### Decision

1. **COPY** adapter runtime files to `/app/prompt-scene-bridge` (at minimum `run_bridge.py`, `mrs_map.py`; include `schemas/` if present). Do not install Infinity / `story_forge` into the image.
2. **ENV** in Dockerfile (belt-and-suspenders, RT4D pattern):
   - `PROMPT_SCENE_BRIDGE_SCRIPT=/app/prompt-scene-bridge/run_bridge.py`
   - `ENGINE3D_EXPAND_SCRIPT=/app/engine3d-core/scripts/expand-world-document.mjs`
   - Leave `PROMPT_SCENE_EXPAND_WORLD` unset or `0` (opt-in remains honest)
3. **Dual-layout resolve (recommended):** mirror `engine3d_still_default_script_path` / `_resolve_renderer_core_script`:
   - Genblaze: monorepo path, then `APP_DIR/prompt-scene-bridge/run_bridge.py`
   - `mrs_map`: `ENGINE3D_EXPAND_SCRIPT` → monorepo default → sibling `../engine3d-core/scripts/expand-world-document.mjs`
4. **Docs / env / blueprint:** document `/app` paths; keep operator maturity as **Prepared**; Docker bundling **partial** until build smoke + local health; live Render availability **declared** until Manual Deploy evidence (`/health.prompt_scene.available: true`).
5. **Git hygiene:** only allowlisted paths in commits; ~946 unrelated dirty files stay unstaged; rebase onto origin with no force-push and no push in this trail.

### Consequences

- Prompt→scene becomes available inside the repo-root image without a full monorepo tree (**enforced** after smoke + health on that image).
- Expand still requires explicit opt-in; default stdout world arrays stay **partial**.
- App-local Dockerfile under `mrs/apps/genblaze-media` remains unable to reach adapters/packages (same limitation as RT4D) — do not claim otherwise.

---

## 3. Interface specification

| Surface | Spec |
|---------|------|
| Bridge CLI | `python /app/prompt-scene-bridge/run_bridge.py --prompt … --json` |
| Expand CLI | `node /app/engine3d-core/scripts/expand-world-document.mjs` (stdin/file JSON) |
| Genblaze ENV | `PROMPT_SCENE_BRIDGE_ENABLED` (default on), `PROMPT_SCENE_BRIDGE_SCRIPT`, `PROMPT_SCENE_BRIDGE_PYTHON`, `PROMPT_SCENE_BRIDGE_TIMEOUT`, `PROMPT_SCENE_EXPAND_WORLD` (default 0), `PROMPT_SCENE_INFINITY_SRC` / `INFINITY_STORY_SRC` (optional mount) |
| Expand ENV | `ENGINE3D_EXPAND_SCRIPT`, optional `ENGINE3D_EXPAND_NODE` / `NODE_BIN` |
| Health | `GET /health` → `prompt_scene.available` when enabled + script file exists |
| Ban | No `story_forge` / `storyforge` strings under Genblaze `app/*.py` |

---

## 4. Constitutional boundary

| In scope | Out of scope |
|----------|--------------|
| Dockerfile COPY/ENV/smoke; dual-layout path defaults; env/docs/blueprint honesty; CECP trail; rebase plan; targeted tests | Infinity in-image; charter / `AGENTS.md` / policies; claiming live Render without evidence; default-on expand; committing unrelated dirty files; force-push |

Protected paths: do not modify without explicit user authorization.

---

## 5. File manifest

| Path | Action | Owner |
|------|--------|-------|
| `Dockerfile` | COPY + ENV + smoke | Builder→Implementor |
| `mrs/apps/genblaze-media/app/prompt_scene_provider.py` | Dual-layout default + help text | Implementor |
| `mrs/adapters/prompt-scene-bridge/mrs_map.py` | Dual-layout expand default | Implementor |
| `mrs/adapters/prompt-scene-bridge/CONTRACT.md` / `README.md` | Docker + tags | Implementor |
| `mrs/apps/genblaze-media/README.md` | Status + env honesty | Implementor |
| `.env.example` | Commented Prompt→Scene / expand ENV | Implementor |
| `render.yaml` | Optional Prompt→Scene ENV keys | Implementor |
| `mrs/apps/genblaze-media/tests/test_prompt_to_scene.py` | Path/settings ACs | Implementor |
| `mrs/adapters/prompt-scene-bridge/test_mrs_map.py` | Expand path AC | Implementor |
| `docs/governance/cecp/trails/prompt-scene-docker-2026-07/*` | Trail artifacts | Crew |

---

## 6. Acceptance criteria

- [ ] Bridge present at `/app/prompt-scene-bridge/run_bridge.py` in image
- [ ] ENV paths point at `/app` layout
- [ ] Build smoke: bridge `--json` succeeds
- [ ] Optional: expand with `PROMPT_SCENE_EXPAND_WORLD=1` → non-empty `objects`
- [ ] Local image `/health.prompt_scene.available: true` (**enforced** for that image)
- [ ] Default expand off preserves empty world arrays (**partial**)
- [ ] No narrative imports/strings under `app/*.py`
- [ ] Docs do not overclaim live deploy (**declared** until Manual Deploy)
- [ ] Allowlisted commits only; rebase onto origin without force-push/push

---

## 7. Rebase plan (operator / Implementor after code)

1. Stage **only** allowlisted paths for this trail (never `git add -A` while dirty tree exists).
2. Commit with CECP evidence (intent, file manifest, tests).
3. `git fetch origin`
4. `git rebase origin/feat/engine3d-genblaze-cinematic-plugin`
5. Resolve conflicts in allowlisted files only; do not “clean up” unrelated dirt
6. Verify status: feature commits replayed; dirty unrelated files remain unstaged
7. **Do not** `--force` push; **do not** push unless user explicitly requests

---

## 8. Handoff to Builder

Scaffold Dockerfile COPY/ENV comments + trail `02-builder-scaffold-manifest.md`. Do not implement dual-layout logic or docs prose in Builder stage.
