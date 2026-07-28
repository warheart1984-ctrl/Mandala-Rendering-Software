# 03 — Implementor: Production Notes

**Trail:** `prompt-scene-adapter-2026-07`  
**Stage:** Implementor  
**Predecessor:** Builder (`02-builder-scaffold-manifest.md`)  
**Contract SoT:** `mrs/adapters/prompt-scene-bridge/CONTRACT.md`

---

## 1. Intent fulfilled

Out-of-process Prompt→Scene bridge produces MRS `SceneSpecification` and an
Engine3D world **generator stub**; Genblaze exposes health + HTTP without
narrative-package imports in `app/*.py`.

## 2. Files touched (shipped evidence)

| Path | Purpose |
|------|---------|
| `mrs/adapters/prompt-scene-bridge/mrs_map.py` | Theme/keyword → surface; world stub; `expand_world_request` identity |
| `mrs/adapters/prompt-scene-bridge/run_bridge.py` | CLI worker; fallback Infinity scene; JSON stdout |
| `mrs/adapters/prompt-scene-bridge/CONTRACT.md` | Enforced/partial/skeleton tags |
| `mrs/adapters/prompt-scene-bridge/README.md` | Runbook |
| `mrs/adapters/prompt-scene-bridge/schemas/prompt-to-scene-request.schema.json` | Request schema |
| `mrs/adapters/prompt-scene-bridge/schemas/bridge-output.schema.json` | Output schema |
| `mrs/adapters/prompt-scene-bridge/test_mrs_map.py` | Mapper unit tests |
| `mrs/apps/genblaze-media/app/prompt_scene_provider.py` | Subprocess runner + availability |
| `mrs/apps/genblaze-media/app/config.py` | `prompt_scene_bridge_*` + env wiring in `get_settings()` |
| `mrs/apps/genblaze-media/app/main.py` | Health keys; `POST /api/prompt-to-scene` |
| `mrs/apps/genblaze-media/tests/test_prompt_to_scene.py` | API / settings / ban tests |

Related ban coverage also appears in `mrs/apps/genblaze-media/tests/test_api.py`
(`test_no_story_forge_imports`) — not Prompt→Scene-specific but reinforces the boundary.

## 3. Unit / integration test inventory

Do not invent totals beyond named functions below.

### `mrs/adapters/prompt-scene-bridge/test_mrs_map.py`

| Test | Enforces |
|------|----------|
| `test_surface_mapping_theme_and_keywords` (parametrized cases) | Theme/keyword → `surfaceId` |
| `test_rt4d_surface_allowlist` | Mapped ids ⊆ RT4D allowlist |
| `test_scene_specification_schema_fields` | Required SceneSpecification fields |
| `test_world_stub_empty_object_arrays` | Empty geometry arrays + generator type |
| `test_expand_world_request_identity` | Expand is identity (**skeleton**) |
| `test_deterministic_seeds_same_infinity_payload` | Deterministic seeds / fallback digest |

### `mrs/apps/genblaze-media/tests/test_prompt_to_scene.py`

| Test | Enforces |
|------|----------|
| `test_health_exposes_prompt_scene_bridge` | `/health` `prompt_scene` + note |
| `test_post_prompt_to_scene_mocked` | POST returns structured scene JSON |
| `test_prompt_to_scene_render_true` | `render=true` attaches render meta |
| `test_prompt_to_scene_render_false` | Default no still required |
| `test_prompt_to_scene_400_bad_request` | ValueError / validation → 400/422 |
| `test_prompt_to_scene_502_bridge_failure` | Bridge error → 502 |
| `test_prompt_to_scene_503_unavailable` | Disabled → 503 |
| `test_settings_prompt_scene_bridge_wiring` | Env → Settings / availability |
| `test_ban_note_app_must_not_import_narrative_lane` | No `story_forge`/`storyforge` in `app/*.py` |

## 4. Commands (canonical probes)

```text
pytest mrs/adapters/prompt-scene-bridge/test_mrs_map.py
pytest mrs/apps/genblaze-media/tests/test_prompt_to_scene.py
```

(Results at formalization time: trail cites **test presence and CONTRACT tags**;
re-run for live exit codes during Inspector stage.)

## 5. Status tag updates (aligned with CONTRACT)

| Claim | Tag |
|-------|-----|
| Mapper + Genblaze HTTP + health + error mapping | **enforced** |
| Engine3D world geometry arrays empty | **partial** |
| `expand_world_request` | **skeleton** |
| JSON schemas CI-validated | **partial** (not claimed enforced) |
| Full world expansion / in-process Infinity | **declared** / out of scope |

## 6. Remaining gaps

1. Engine3D generator stub: `objects`/`materials`/`lights`/`cameras` remain `[]`.
2. `expand_world_request` is identity passthrough only (`mrs_map.py`).
3. Schemas not asserted as CI JSON-Schema validation gates.
4. Optional Infinity lane requires operator `PYTHONPATH` / env — fallback path is
   deterministic keyword mapping only.

## 7. Handoff to Reviewer

Audit process boundary (Genblaze ban), status-tag honesty, and that no protected
governance paths were required for this feature.
