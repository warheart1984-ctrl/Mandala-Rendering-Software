# 02 — Builder: Scaffold Manifest

**Trail:** `prompt-scene-adapter-2026-07`  
**Stage:** Builder  
**Predecessor:** Architect (`01-architect-adr.md`)  
**Evidence base:** Shipped tree under `mrs/adapters/prompt-scene-bridge/` and
Genblaze provider modules (reconstructed scaffold inventory from reference impl).

---

## 1. Intent

Materialize Architect file manifest as importable layout, JSON schemas, CLI/API
shells, and test modules — without claiming full Engine3D expansion.

## 2. Scaffold manifest (created / present)

### Adapter package

| Path | Role in scaffold |
|------|------------------|
| `mrs/adapters/prompt-scene-bridge/CONTRACT.md` | Contract + status tags |
| `mrs/adapters/prompt-scene-bridge/README.md` | Operator notes |
| `mrs/adapters/prompt-scene-bridge/mrs_map.py` | Mapping module (filled by Implementor) |
| `mrs/adapters/prompt-scene-bridge/run_bridge.py` | CLI worker entry |
| `mrs/adapters/prompt-scene-bridge/schemas/prompt-to-scene-request.schema.json` | Request shape |
| `mrs/adapters/prompt-scene-bridge/schemas/bridge-output.schema.json` | Worker stdout shape |
| `mrs/adapters/prompt-scene-bridge/test_mrs_map.py` | Unit tests |

### Genblaze host wiring

| Path | Role in scaffold |
|------|------------------|
| `mrs/apps/genblaze-media/app/prompt_scene_provider.py` | Subprocess provider |
| `mrs/apps/genblaze-media/app/config.py` | `prompt_scene_bridge_*` settings |
| `mrs/apps/genblaze-media/app/main.py` | `/health` keys + `POST /api/prompt-to-scene` |
| `mrs/apps/genblaze-media/tests/test_prompt_to_scene.py` | API / ban / settings tests |

## 3. Dependency graph

```text
[User / client]
    │  POST /api/prompt-to-scene
    ▼
Genblaze main.py
    │  prompt_to_scene()
    ▼
prompt_scene_provider.py  ──subprocess──►  run_bridge.py
                                              │
                                              ├─ optional Infinity lane (worker PYTHONPATH only)
                                              └─ mrs_map.py
                                                    ├─ SceneSpecification  → RT4D / render-scene
                                                    └─ Engine3DWorldDocument generator stub
                                                          └─ expand_world_request (identity skeleton)
```

**Hard edge:** Genblaze `app/*.py` must not depend on narrative packages.
**Soft edge:** Schemas document shapes; CONTRACT marks them **partial** for CI schema validation.

## 4. Build artifacts inventory (status honesty)

| Artifact | Scaffold label |
|----------|----------------|
| Surface → SceneSpecification mapper | Target **enforced** (Implementor + tests) |
| Engine3D `objects`/`materials`/`lights`/`cameras` empty arrays | **partial** stub |
| `expand_world_request` | **skeleton** identity |
| JSON schemas | **partial** |
| HTTP + health + env | Target **enforced** |

## 5. Test placeholders → shipped tests

Builder expectation: tests named to Architect ACs. Shipped modules:

- `test_mrs_map.py` — mapping, allowlist, stub emptiness, expand identity, seeds
- `test_prompt_to_scene.py` — health, POST, render flags, 400/502/503, settings, ban note

(Exact test function inventory: see Implementor notes.)

## 6. Handoff to Implementor

Fill `mrs_map.py` / `run_bridge.py` / provider error mapping; wire `config.py` +
`main.py`; make listed tests pass; keep world expand labeled **skeleton**.
