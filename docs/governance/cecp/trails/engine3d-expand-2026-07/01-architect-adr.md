# 01 — Architect: ADR + Boundary

**Trail:** `engine3d-expand-2026-07`  
**Stage:** Architect  
**Predecessor:** `prompt-scene-adapter-2026-07` Inspector gaps (empty Engine3D arrays; `expand_world_request` identity)

---

## 1. Intent

**What:** Close the Engine3D WorldDocument expand gap so MRS can run generator stubs end-to-end: `generator.type` `star` | `mandala` with empty `objects`/`materials`/`lights`/`cameras` expands to a full deterministic `Engine3DWorldDocument`.

**Why:** Inspector trail `prompt-scene-adapter-2026-07` recorded PASS_WITH_GAPS; operators cannot feed Genblaze/Engine3D stills without geometry. User requires MRS-side expand running, not documentation-only.

## 2. ADR decision

### Context

- `map_infinity_scene_to_world_document` emits a **partial** stub (generator present, arrays empty).
- Geometry generation SoT lives in `@mrs/engine3d-core` TypeScript (`createWorldGenerator`, `generateWorldFromGenerator`).
- Python must not reimplement 4D/star/mandala math; sovereignty prefers platform-agnostic Node OOP.

### Decision

1. Add out-of-process Node CLI under `mrs/packages/engine3d-core/scripts/expand-world-document.mjs` that:
   - Reads WorldDocument JSON (stdin or `--in`)
   - If `objects.length > 0`, echo document (idempotent)
   - Else normalize `generator` via `createWorldGenerator(type, seed, params)` and call `generateWorldFromGenerator`
   - Preserve `promptBridge` (and original `id` when present) on output
2. Replace Python `expand_world_request` identity with subprocess call to that script (sovereign, deterministic for same seed).
3. Optional expand on produce/consume via env / CLI:
   - Bridge: `--expand` or `PROMPT_SCENE_EXPAND_WORLD=1`
   - Genblaze: `PROMPT_SCENE_EXPAND_WORLD` → Settings → expand after bridge payload
4. Keep unexpanded stub path for callers that do not request expand (**partial** stub remains honest).

### Consequences

- Requires Node ≥20 + built `engine3d-core` `dist/` for expand path.
- Expand path status → **enforced** when tests prove `objects.length > 0` for star + mandala and determinism.
- Stub-without-expand remains **partial**; do not claim default bridge stdout is always expanded.

## 3. Interface specification

| Surface | Spec |
|---------|------|
| Input | `Engine3DWorldDocument` stub with `generator: { id, type, seed, params }` |
| Output | Full document: `objects.length > 0`, materials/lights/cameras populated |
| Node CLI | `node expand-world-document.mjs [--in path\|stdin] [--out path\|stdout]` |
| Python | `expand_world_request(world) -> world`; raises on expand failure when expand attempted |
| Env | `PROMPT_SCENE_EXPAND_WORLD=0\|1` (default **0** — opt-in); optional `ENGINE3D_EXPAND_SCRIPT`, `ENGINE3D_EXPAND_NODE` |
| Ban | No `story_forge` / `storyforge` under Genblaze `app/*.py` |

## 4. Constitutional boundary

| In scope | Out of scope |
|----------|--------------|
| MRS adapter expand; engine3d-core script; Genblaze opt-in wire; tests; CONTRACT tags; this CECP trail | Infinity in-process; charter / `AGENTS.md` / `default.policies.json` edits; claiming schemas CI-enforced; RT4D still render of expanded world |

Protected paths: do not modify without auth.

## 5. File manifest

| Path | Action | Owner |
|------|--------|-------|
| `mrs/packages/engine3d-core/scripts/expand-world-document.mjs` | create | Builder→Implementor |
| `mrs/packages/engine3d-core/package.json` | add npm script | Implementor |
| `mrs/adapters/prompt-scene-bridge/mrs_map.py` | real expand | Implementor |
| `mrs/adapters/prompt-scene-bridge/run_bridge.py` | `--expand` / env | Implementor |
| `mrs/adapters/prompt-scene-bridge/CONTRACT.md` / `README.md` | status tags | Implementor |
| `mrs/adapters/prompt-scene-bridge/test_mrs_map.py` | expand ACs | Implementor |
| `mrs/apps/genblaze-media/app/config.py` | settings + env | Implementor |
| `mrs/apps/genblaze-media/app/prompt_scene_provider.py` | optional expand | Implementor |
| `mrs/apps/genblaze-media/tests/test_prompt_to_scene.py` | settings wiring | Implementor |
| `docs/governance/cecp/trails/engine3d-expand-2026-07/*` | trail | Crew |
| `docs/governance/cecp/trails/prompt-scene-adapter-2026-07/05-…` | append cross-ref | Inspector/foreman |

## 6. Acceptance criteria

- [ ] Expand star stub → `len(objects) > 0`
- [ ] Expand mandala stub → `len(objects) > 0`
- [ ] Same seed → identical JSON-serializable geometry ids / object counts (deterministic)
- [ ] Expand without generator / already filled → passthrough (no crash)
- [ ] Opt-in only: default bridge without expand still empty arrays
- [ ] No narrative imports in `app/*.py`
- [ ] CONTRACT tags honest: expand **enforced**; stub **partial**

## 7. Handoff to Builder

Scaffold Node script shell + Python expand helper stub + test placeholders; do not implement generator math in Python.
