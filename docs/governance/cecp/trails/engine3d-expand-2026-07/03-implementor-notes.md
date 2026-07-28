# 03 — Implementor: Production Notes

**Trail:** `engine3d-expand-2026-07`  
**Stage:** Implementor  
**Predecessor:** Builder (`02-builder-scaffold-manifest.md`)  
**Contract SoT:** `mrs/adapters/prompt-scene-bridge/CONTRACT.md`

---

## 1. Intent fulfilled

Real Engine3D WorldDocument expand: generator stub → full world via out-of-process
Node `expand-world-document.mjs` (`createWorldGenerator` + `generateWorldFromGenerator`).
Bridge `--expand` / `PROMPT_SCENE_EXPAND_WORLD` and Genblaze settings wire opt-in expand.
Unexpanded stub path preserved (**partial**).

## 2. Files touched

| Path | Purpose |
|------|---------|
| `mrs/packages/engine3d-core/scripts/expand-world-document.mjs` | Node expand CLI |
| `mrs/packages/engine3d-core/package.json` | `expand:world` script |
| `mrs/adapters/prompt-scene-bridge/mrs_map.py` | `expand_world_request` + `WorldExpandError` |
| `mrs/adapters/prompt-scene-bridge/run_bridge.py` | `--expand` / env opt-in |
| `mrs/adapters/prompt-scene-bridge/test_mrs_map.py` | star/mandala/determinism expand tests |
| `mrs/adapters/prompt-scene-bridge/CONTRACT.md` | Status tags |
| `mrs/adapters/prompt-scene-bridge/README.md` | Runbook |
| `mrs/apps/genblaze-media/app/config.py` | `prompt_scene_expand_world` |
| `mrs/apps/genblaze-media/app/prompt_scene_provider.py` | Pass `--expand` + env |
| `mrs/apps/genblaze-media/tests/test_prompt_to_scene.py` | Settings expand wiring |

## 3. Unit / integration test inventory

### `test_mrs_map.py`

| Test | Enforces |
|------|----------|
| `test_world_stub_empty_object_arrays` | Stub remains empty without expand |
| `test_expand_world_request_star_and_mandala` | `objects.length > 0` for star + mandala |
| `test_expand_world_request_deterministic_same_seed` | Same seed → identical object ids/JSON |
| `test_expand_world_request_passthrough_when_populated` | Idempotent when already filled |
| `test_expand_world_request_if_enabled_default_off` | Opt-in default off |
| `test_expand_missing_script_raises` | Clear error when script missing |

### `test_prompt_to_scene.py`

| Test | Enforces |
|------|----------|
| `test_settings_prompt_scene_bridge_wiring` | `PROMPT_SCENE_EXPAND_WORLD` → Settings + availability |

## 4. Commands run + results

```text
pytest mrs/adapters/prompt-scene-bridge/test_mrs_map.py -q
→ 17 passed

pytest mrs/apps/genblaze-media/tests/test_prompt_to_scene.py -q
→ 9 passed
```

(Expand cases ran; Node + engine3d-core `dist/` present on operator machine.)

## 5. Status tag updates

| Claim | Tag |
|-------|-----|
| SceneSpecification mapping + Genblaze HTTP | **enforced** (unchanged) |
| Unexpanded world stub arrays | **partial** |
| `expand_world_request` Node OOP | **enforced** |
| Default bridge stdout expanded | **not claimed** (opt-in only) |
| Schema CI validation | **partial** (unchanged gap) |

## 6. Remaining gaps

1. Expand requires Node + `npm run build` in engine3d-core; CI hosts without dist skip expand tests via `skipif`.
2. JSON schemas still not CI-validated.
3. Keyword `mandala` currently routes to **star** generator (pre-existing mapper rule); pure mandala expand uses non-star keywords / empty keyword path.
4. Predecessor trail `prompt-scene-adapter-2026-07` still documents historical PASS_WITH_GAPS — cross-ref this trail.

## 7. Handoff to Reviewer

Audit: no `story_forge` in `app/*.py`; expand is OOP Node; status tags honest; no protected charter edits.
