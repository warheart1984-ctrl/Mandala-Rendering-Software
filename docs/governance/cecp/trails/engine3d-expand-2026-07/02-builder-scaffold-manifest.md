# 02 — Builder: Scaffold Manifest

**Trail:** `engine3d-expand-2026-07`  
**Stage:** Builder  
**Predecessor:** Architect (`01-architect-adr.md`)

---

## 1. Intent

Scaffold out-of-process expand surfaces from Architect ADR §5: Node CLI shell, Python expand wiring points, test placeholders. No deep generator logic in this stage (Implementor fills).

## 2. Scaffold manifest

| Path | Status at scaffold |
|------|--------------------|
| `mrs/packages/engine3d-core/scripts/expand-world-document.mjs` | **skeleton** CLI (Implementor wires API) |
| `mrs/adapters/prompt-scene-bridge/mrs_map.py` | existing; expand remains identity until Implementor |
| `mrs/adapters/prompt-scene-bridge/run_bridge.py` | existing; `--expand` reserved for Implementor |
| `mrs/apps/genblaze-media/app/config.py` | existing; expand settings reserved |
| `mrs/apps/genblaze-media/app/prompt_scene_provider.py` | existing; expand call reserved |
| `mrs/adapters/prompt-scene-bridge/test_mrs_map.py` | existing; expand identity tests → replace |

## 3. Dependency graph

```text
prompt / Infinity lane (OOP)
        │
        ▼
run_bridge.py ──► mrs_map.map_* (stub world)
        │
        │  [optional PROMPT_SCENE_EXPAND_WORLD / --expand]
        ▼
expand_world_request (Python)
        │  subprocess
        ▼
expand-world-document.mjs (Node)
        │  import dist
        ▼
createWorldGenerator + generateWorldFromGenerator
        │
        ▼
Engine3DWorldDocument (objects.length > 0)
        │
        ▼
Genblaze prompt_to_scene / Engine3D still consumers
```

## 4. Build artifacts inventory

| Artifact | Tag |
|----------|-----|
| Node expand script (pre-Implementor) | **skeleton** |
| Python identity expand (pre-Implementor) | **skeleton** |
| Generator stub arrays | **partial** |
| SceneSpecification mapping | **enforced** (unchanged) |

## 5. Test placeholders

- Replace `test_expand_world_request_identity` with star/mandala expand + determinism cases.
- Keep `test_world_stub_empty_object_arrays` (stub without expand).
- Extend Genblaze settings test for expand env flag.

## 6. Handoff to Implementor

Fill Node script with engine3d-core dist imports; wire Python subprocess; opt-in bridge/Genblaze; green tests; update CONTRACT tags.
