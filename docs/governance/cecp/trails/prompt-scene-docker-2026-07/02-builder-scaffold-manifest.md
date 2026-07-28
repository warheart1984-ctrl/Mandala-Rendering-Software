# 02 — Builder: Scaffold Manifest

**Trail:** `prompt-scene-docker-2026-07`  
**Stage:** Builder  
**Predecessor:** Architect (`01-architect-adr.md`)

---

## 1. Intent

Scaffold repo-root Genblaze Docker image wiring for `mrs/adapters/prompt-scene-bridge` under flattened `/app/prompt-scene-bridge`, matching RT4D / engine3d-core ENV patterns. No dual-layout Python, no docs prose, no `.env.example` / `render.yaml` in this stage.

**Why:** Architect ADR §2–§5 — without COPY + `/app` ENV, `/api/prompt-to-scene` reports unavailable in the production image.

---

## 2. Scaffold inventory

| Path | Action | Status at scaffold |
|------|--------|--------------------|
| `Dockerfile` ENV: `PROMPT_SCENE_BRIDGE_SCRIPT` | added | **partial** (image contract; health needs dual-layout Implementor) |
| `Dockerfile` ENV: `ENGINE3D_EXPAND_SCRIPT` | added | **partial** (belt-and-suspenders for flattened bridge) |
| `Dockerfile` ENV: `PROMPT_SCENE_EXPAND_WORLD=0` | added + comment | **declared** opt-in (default off) |
| `Dockerfile` COPY → `/app/prompt-scene-bridge/` | `run_bridge.py`, `mrs_map.py`, `schemas/` | **partial** (bundled; dual-layout resolve TBD) |
| `Dockerfile` RUN bridge smoke | `python …/run_bridge.py --prompt "docker bridge smoke" --json` | **partial** (stub lane; expand smoke left for Implementor) |
| `mrs/apps/genblaze-media/app/prompt_scene_provider.py` | untouched | Implementor: dual-layout default |
| `mrs/adapters/prompt-scene-bridge/mrs_map.py` | untouched (COPY only) | Implementor: sibling expand default |
| `.env.example`, `render.yaml`, bridge/Genblaze READMEs | untouched | Implementor |

---

## 3. Dependency graph

```text
repo root Dockerfile (build context)
        │
        ├─ COPY engine3d-core → /app/engine3d-core (existing)
        │         └─ scripts/expand-world-document.mjs
        │
        ├─ COPY prompt-scene-bridge → /app/prompt-scene-bridge  [Builder scaffold]
        │         ├─ run_bridge.py
        │         ├─ mrs_map.py
        │         └─ schemas/
        │
        ├─ ENV PROMPT_SCENE_BRIDGE_SCRIPT=/app/prompt-scene-bridge/run_bridge.py
        ├─ ENV ENGINE3D_EXPAND_SCRIPT=/app/engine3d-core/scripts/expand-world-document.mjs
        └─ ENV PROMPT_SCENE_EXPAND_WORLD=0  (opt-in)
                │
                ▼
        Genblaze app (uvicorn) ──► PROMPT_SCENE_BRIDGE_SCRIPT
                │                    [Implementor: dual-layout if unset]
                ▼
        run_bridge.py (OOP) ──► mrs_map ──► optional expand via ENGINE3D_EXPAND_SCRIPT
                │
                ▼
        GET /health → prompt_scene.available  [enforced after image rebuild + health]
```

---

## 4. What Builder did not do

- Dual-layout path resolve in `prompt_scene_provider.py` / `mrs_map.py`
- Docs / `.env.example` / `render.yaml` honesty tags
- Infinity / `story_forge` install in image
- Expand-on-by-default or expand smoke with `PROMPT_SCENE_EXPAND_WORLD=1`
- Commits, rebase, or staging unrelated dirty files

---

## 5. Handoff to Implementor

1. Dual-layout defaults (Architect §2 decision 3): Genblaze monorepo path then `APP_DIR/prompt-scene-bridge/run_bridge.py`; `mrs_map` expand: `ENGINE3D_EXPAND_SCRIPT` → monorepo → sibling `../engine3d-core/scripts/...`.
2. Optional Dockerfile expand smoke when `PROMPT_SCENE_EXPAND_WORLD=1` → non-empty `objects`.
3. Update `.env.example`, `render.yaml`, CONTRACT/README status tags (**Prepared** / **partial** / **declared** per ADR).
4. Targeted tests: path/settings ACs in `test_prompt_to_scene.py` and expand path AC in `test_mrs_map.py`.
5. Rebuild image; verify `/health.prompt_scene.available: true` locally; do not claim live Render until Manual Deploy evidence.
6. Git: stage **only** allowlisted trail paths; rebase onto origin without force-push/push.
