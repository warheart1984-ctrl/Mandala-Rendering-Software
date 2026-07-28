# 01 — Architect ADR: Prompt → Scene Adapter

**Trail:** `prompt-scene-adapter-2026-07`  
**Stage:** Architect  
**Predecessor:** null  
**Status of this ADR as living contract:** superseded in detail by shipped
`mrs/adapters/prompt-scene-bridge/CONTRACT.md` (authoritative for current tags).

---

## 1. Intent

Provide a governed path from a natural-language prompt to:

1. MRS `SceneSpecification` (RT4D / Genblaze scene-spec path)
2. An `Engine3DWorldDocument` **generator request** (stub geometry arrays)

without importing Infinity / narrative packages into Genblaze `app/*.py`
(constitutional / CI string ban).

## 2. ADR

### Context

- Genblaze must not contain banned narrative-package tokens (`story_forge` /
  `storyforge`) under `app/*.py`.
- Scene mapping and optional RT4D still belong in MRS / Genblaze orchestration.
- Infinity narrative lane is optional and must stay **out-of-process**.

### Decision

Ship an **out-of-process** worker (`run_bridge.py`) invoked by Genblaze via
subprocess (`prompt_scene_provider.py`). Genblaze talks only to a script path
and env knobs; mapping lives in `mrs_map.py`.

### Consequences

- **Positive:** Ban preserved; MRS SceneSpecification path testable; health and
  HTTP surface discoverable.
- **Tradeoff:** Engine3D world documents remain generator stubs until a real
  expander exists; `expand_world_request` is identity (**skeleton**).
- **Non-decision:** Full Infinity in-process import; auto-amend of charter;
  cross-org CECP adoption.

## 3. Interface specification

Authoritative tables: `mrs/adapters/prompt-scene-bridge/CONTRACT.md`.

| Surface | Shape | Tag |
|---------|-------|-----|
| Request | `prompt` required; optional `width`/`height`/`samples`/`max_depth`/`render`/`quality` | **enforced** (API + tests) |
| CLI | `run_bridge.py --prompt … --json` | **enforced** path exists |
| HTTP | `POST /api/prompt-to-scene`; health `prompt_scene` / `prompt_scene_note` | **enforced** |
| Response | `ok`, `prompt`, `sceneSpecification`, `engine3dWorldDocument`, … | structure **enforced**; world arrays **partial** |
| Schemas | `schemas/prompt-to-scene-request.schema.json`, `schemas/bridge-output.schema.json` | **partial** (shapes match; not claimed CI-schema-validated) |
| Env | `PROMPT_SCENE_BRIDGE_*`, optional Infinity src | **enforced** via `get_settings()` |
| Ban | No narrative tokens in Genblaze `app/*.py` | **enforced** by tests |

Surface allowlist: renderer-core `RT4D_SURFACE_IDS` (see CONTRACT).

## 4. Constitutional boundary analysis

| Boundary | Rule |
|----------|------|
| **In scope** | Adapter under `mrs/adapters/prompt-scene-bridge/`; Genblaze provider + config + route + tests |
| **Out of scope** | Full Engine3D geometry expansion; in-process Infinity; charter / `AGENTS.md` / policy JSON edits |
| **Protected paths** | Do not modify `constitution/`, `engine/constitution/`, `engine/governance/policies/`, `AGENTS.md` |
| **P1–P5** | Intent declared; evidence via tests; scope limited to adapter+Genblaze; deterministic seeds/fallback; no new vendor lock-in required for the stub path |
| **Process isolation** | Narrative lane only on worker `PYTHONPATH` — Genblaze remains clean |

**Reviewer expectation:** Boundary OK if Genblaze never imports narrative packages and
world-expand claims stay **skeleton** / **partial**.

## 5. File manifest (as designed → as shipped)

| Path | Action | Owner |
|------|--------|-------|
| `mrs/adapters/prompt-scene-bridge/CONTRACT.md` | Create | Architect → Implementor maintain |
| `mrs/adapters/prompt-scene-bridge/README.md` | Create | Builder/Implementor |
| `mrs/adapters/prompt-scene-bridge/mrs_map.py` | Create | Implementor |
| `mrs/adapters/prompt-scene-bridge/run_bridge.py` | Create | Implementor |
| `mrs/adapters/prompt-scene-bridge/schemas/*.schema.json` | Create | Builder/Implementor |
| `mrs/adapters/prompt-scene-bridge/test_mrs_map.py` | Create | Implementor |
| `mrs/apps/genblaze-media/app/prompt_scene_provider.py` | Create | Implementor |
| `mrs/apps/genblaze-media/app/config.py` | Wire settings | Implementor |
| `mrs/apps/genblaze-media/app/main.py` | Health + route | Implementor |
| `mrs/apps/genblaze-media/tests/test_prompt_to_scene.py` | Create | Implementor |

## 6. Acceptance criteria (testable)

- [ ] Theme/keyword → `surfaceId` mapping within RT4D allowlist
- [ ] SceneSpecification required fields present
- [ ] World stub keeps empty `objects`/`materials`/`lights`/`cameras`
- [ ] `expand_world_request` identity (explicit skeleton behavior)
- [ ] Deterministic seeds for same payload / fallback
- [ ] Genblaze health exposes `prompt_scene`
- [ ] POST `/api/prompt-to-scene` returns structured JSON (mocked bridge OK)
- [ ] Error mapping: ValueError→400, bridge error→502, disabled→503
- [ ] Settings env wiring
- [ ] Ban: no `story_forge` / `storyforge` in `app/*.py`

## 7. Handoff to Builder

Scaffold adapter package + Genblaze provider shell + failing/empty tests naming the
ACs above. Label Engine3D expand as **skeleton**. Do not put narrative imports in
`app/*.py`.
