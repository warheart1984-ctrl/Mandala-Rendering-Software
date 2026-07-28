# 03 — Implementor: Production Notes

**Trail:** `prompt-scene-docker-2026-07`  
**Stage:** Implementor  
**Predecessor:** Builder (`02-builder-scaffold-manifest.md`)  
**Contract SoT:** `mrs/adapters/prompt-scene-bridge/CONTRACT.md`

---

## 1. Intent fulfilled

Dual-layout path resolve for Genblaze bridge script and Engine3D expand CLI under
flattened `/app` Docker layout; optional expand smoke in repo-root Dockerfile;
honest **Prepared** / **partial** / **declared** docs and ENV wiring. No claim of
live Render `/health.prompt_scene.available` without Manual Deploy evidence.

## 2. Files touched

| Path | Purpose |
|------|---------|
| `mrs/apps/genblaze-media/app/prompt_scene_provider.py` | Dual-layout default + Docker help text |
| `mrs/adapters/prompt-scene-bridge/mrs_map.py` | Safe repo-root guess + sibling expand default |
| `Dockerfile` | Expand smoke after bridge smoke (`--expand`, assert `objects` > 0) |
| `mrs/apps/genblaze-media/README.md` | Prompt→Scene status + ENV honesty |
| `mrs/adapters/prompt-scene-bridge/CONTRACT.md` | Docker `/app` section + tags |
| `mrs/adapters/prompt-scene-bridge/README.md` | Docker `/app` layout tags |
| `.env.example` | Commented Prompt→Scene / expand ENV |
| `render.yaml` | Optional ENV matching Docker defaults |
| `mrs/apps/genblaze-media/tests/test_prompt_to_scene.py` | Docker-layout default AC |
| `mrs/adapters/prompt-scene-bridge/test_mrs_map.py` | ENV override + sibling layout ACs |
| `docs/governance/cecp/trails/prompt-scene-docker-2026-07/03-implementor-notes.md` | This artifact |

## 3. Unit / integration test inventory

### `test_mrs_map.py`

| Test | Enforces |
|------|----------|
| `test_default_expand_script_env_override` | `ENGINE3D_EXPAND_SCRIPT` wins |
| `test_default_expand_script_sibling_docker_layout` | Sibling `/app/engine3d-core/scripts/...` when monorepo missing |

### `test_prompt_to_scene.py`

| Test | Enforces |
|------|----------|
| `test_prompt_scene_bridge_default_script_docker_layout` | `APP_DIR/prompt-scene-bridge` when monorepo missing; help mentions Docker |
| `test_ban_note_app_must_not_import_narrative_lane` | No `story_forge` / `storyforge` under `app/*.py` |

### Ban

| Test | Enforces |
|------|----------|
| `test_api.py::test_no_story_forge_imports` | App string ban |

## 4. Commands run + results

```text
pytest mrs/adapters/prompt-scene-bridge/test_mrs_map.py -q --tb=line
→ 19 passed

pytest mrs/apps/genblaze-media/tests/test_prompt_to_scene.py -q --tb=line
→ 10 passed

pytest mrs/apps/genblaze-media/tests/test_api.py::test_no_story_forge_imports \
      mrs/apps/genblaze-media/tests/test_prompt_to_scene.py::test_ban_note_app_must_not_import_narrative_lane -q --tb=line
→ 2 passed
```

Local expand CLI smoke (pre-image): `--expand` → `objects` length 15 in ~0.5–4s
(under 30s budget). Full Docker image rebuild not run in this stage.

## 5. Status tag updates

| Claim | Tag |
|-------|-----|
| Dual-layout Genblaze / `mrs_map` defaults | **enforced** (unit tests) |
| Repo-root Docker COPY + ENV + stub/expand smoke | **partial** (image contract; rebuild not verified here) |
| Operator Prompt→Scene product readiness | **Prepared** |
| Live Render `/health.prompt_scene.available: true` | **declared** until Manual Deploy |
| Default expand on / live Render expand | **not claimed** (`PROMPT_SCENE_EXPAND_WORLD=0`) |
| Unexpanded world stub arrays | **partial** (unchanged) |

## 6. Remaining gaps

1. Full `docker build` + local container `/health.prompt_scene.available: true` not
   re-verified in this Implementor pass (Builder smoke + dual-layout logic only).
2. Live Render Manual Deploy evidence still missing → keep **declared**.
3. App-local Dockerfile under `mrs/apps/genblaze-media` still cannot reach adapters
   (same RT4D limitation) — do not claim otherwise.
4. Infinity / `story_forge` remain out of image by design.

## 7. Handoff to Reviewer

Review allowlisted diffs only; confirm Drive-G-1 tags match evidence; do not stage
unrelated dirty tree (~946 files). Git commit/rebase/push left to operator request.
