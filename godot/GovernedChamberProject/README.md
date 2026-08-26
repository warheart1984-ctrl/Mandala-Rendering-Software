# GovernedChamberProject — Simulation Chamber (Godot 4)

**Status: skeleton** (Phase 1 host scaffold — verify in Godot 4.3+ before
claiming enforced end-to-end runs).

Phase 1 milestone: **one room, two human actors, scripted beats, LLM-ready dialogue,
camera rail, JSON recording.**

## Run

1. Open this folder in **Godot 4.3+** (it is the project root).
2. Press F5 (main scene is `scenes/simulation_chamber.tscn`).

Live console controls:

| Key | Action |
|-----|--------|
| SPACE | pause / resume (time scale 0) |
| 1 / 2 / 3 | time scale 25% / 50% / 100% (slow-mo) |
| R | restart scene |

The Director plays `scripts/ep_001.json`: A and B enter, talk, A gets happy,
`say_prompt` exercises the dialogue brain, B waves, camera rails, both exit,
SYSTEM fades out/in. When every actor settles, the Recorder writes
`user://recordings/<scene_id>_<ms>.json` and prints the path.

## Video export

Godot's built-in Movie Maker mode (deterministic, fixed timestep):

```sh
godot --path . --write-movie out.avi --fixed-fps 30 scenes/simulation_chamber.tscn
```

Add `--quality 0.9` for MJPEG quality, or use `.png` instead of `.avi` for a
PNG sequence. The JSON log from the Recorder is the "simulation log" half of
the export pair.

## Module map

| Original module | Where |
|---|---|
| ChamberCore | `simulation_chamber.gd` (root wiring, room/env build), time control via `Engine.time_scale` |
| CreatureRig | `actors/actor.gd`, `actors/animal_actor.gd`, `actors/state_machine.gd`, `scenes/actors/*.tscn` |
| ActorBrain | `actors/emotion.gd`, `actors/brain.gd`, `actors/dialogue_provider.gd`, `actors/llm_dialogue_provider.gd` |
| DirectorConsole | `director/director.gd` (beat engine + episode loader), keyboard console above; editor dock in `addons/holodeck_plugin/` |
| Recorder | `recording/recorder.gd` (event + frame logs), `recording/camera_rig.gd` (rail/cut cameras); video via Movie Maker |

## Unified Actor API

Both humans (`CharacterBody3D`) and animals (`Node3D` + `NavigationAgent3D`)
implement the same surface:

```
actor_name, actor_type
move_to(pos)      face(target)          # target = Vector3 or actor name
say(line)         say_prompt(prompt)    # prompt -> DialogueProvider
set_emotion(name, intensity)           # neutral/happy/sad/angry/afraid
gesture(name)     perform(action,data)  # generic beat dispatcher
```

## Script format

Episode JSON → scenes → beats (see `scripts/ep_001.json`):

```json
{"time": 4.0, "actor": "A", "action": "say", "data": {"line": "Hello."}}
```

Special actors: `SYSTEM` handles `transition` (fade_out/fade_in);
`CAMERA_MAIN` handles `rail` / `cut` / `stop`. Beat data uses plain arrays for
vectors (`[x, y, z]`) — the Director converts to `Vector3` before dispatch.

Dialogue providers: default is a deterministic stub.
Set `CHAMBER_DIALOGUE_PROVIDER=llm` and optionally:

| Env | Purpose |
|-----|---------|
| `CHAMBER_LLM_API_KEY` | Bearer token (required for LLM path) |
| `CHAMBER_LLM_BASE_URL` | OpenAI-compatible base (default `https://api.openai.com/v1`; local Lemonade: `http://localhost:13305/api/v1`) |
| `CHAMBER_LLM_MODEL` | Model id (default `gpt-4o-mini`) |

Falls back to the scripted line on any error. No keys are stored in the repo.

## Editor plugin

`addons/holodeck_plugin/` registers a right-side dock (**enabled by default**
via `project.godot`): load episode JSON, browse scenes/beats, push beats into
the live Director node, and list actors with type + emotion.

## Status tags (per repo lawbook R4)

- Host project + Phase 1 scene graph / Director beats / Recorder JSON schema: **skeleton** until Godot 4.3+ PIE verified on this machine
- Skeletal rigs / AnimationTree blends / facial capture: **skeleton** (nodes exist, guards fall back to procedural motion)
- LLM dialogue: **partial** (OpenAI-compatible client; untested without key / local endpoint)
- EpisodeRunner multi-scene chaining: **skeleton** (loads/plays single scene; chaining lands in Phase 3)
- Animals: **skeleton** (AnimalActor scene + API; not in `ep_001` cast)

## Repo lawbook alignment

- P4 replayable reality: beats are data-driven JSON, blocking movement is
  deterministic at fixed speed, recorder timestamps use sim-time not wall-clock.
- R8: no secrets — API key comes from environment only.
- No protected paths touched; this host follows the `unity/`, `unreal/` convention.
- Related MRS chamber contracts (JS): `scripts/simulation-chamber.mjs`,
  `mrs/.../holort4d/SimulationChamber.js` — this Godot host is a parallel host,
  not a replacement for those runtimes.
