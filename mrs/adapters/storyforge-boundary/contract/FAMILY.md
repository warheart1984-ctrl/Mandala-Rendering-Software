# StoryForge ↔ Mandala contract family

**schemaVersion:** `storyforge-mandala-contract/1.1`  
**Status:** **partial** for schema + identity compare + `audioPlan` cue mapping; **declared** for live Beatbox invoke, Speakers mix, and final film assembly.  
**Owner of narrative organs:** Project Infinity (`warheart1984-ctrl/infinity`, `external/story_forge`). Mandala does **not** host a second Story Bible engine or DAW.

1.0 → 1.1 is a **required-field** revision (adaptive cues on `audioPlan`, `audioCueId` / `scoreIdentity` on shot artifacts). Not a silent 1.0 additive.

## One artifact flow

```text
Infinity BackendBuildArtifact / cinematic plan / world pack
        ↓ adapter map (this package)
StoryForgeProductionArtifact  (+ audioPlan cues)
        ↓
MandalaProductionRequest
        ↓ per shot (structure, rig, evidence — not a movie studio)
MandalaShotArtifact  (+ audioCueId / timing / scoreIdentity)
        ↓ declared handoff
Infinity Beatbox ScoreRequest / Speakers mix / Narrative Trust Pack
```

Crossing pixels still use existing `schemas/RenderRequest.schema.json` when a shot is actually rendered. RT4D does **not** generate music.

## Honest limits

- Identity compare can **detect** lock-field mutation across shots.
- It **cannot** guarantee diffusion/sampler obedience.
- `audioPlan` mapping is **partial** (cues + `scoreIdentity` tested).
- Live Beatbox scoring is **declared**: Jarvis HTTP is `GET /api/jarvis/beatbox-lane/status` only. Scoring is `BeatboxLane.score(ScoreRequest)` inside Infinity (`external/beatbox_speakers`). Mandala does not import or call it.
- Speakers mix / real stems / MP4 assembly remain **declared**.
- Local click playlist fallback is **partial** and must not be claimed as an original score.

## Infinity map (vendor-docs, not a forked studio)

| Infinity | This contract |
|----------|----------------|
| `BackendBuildArtifact` (`backend_full_build.py`) | `StoryForgeProductionArtifact.productionId` ← `build_id` |
| `NarrativeState` + characters | `characters[]` + `narrativeId` |
| `worldpacks/` | `worldPack` |
| `TemporalShotList` / `CinematicPlan.shots` | `shots[]` / `timeline` |
| `ContinuityReport` | `continuityConstraints` |
| `ScoreRequest` / `MusicCue` / `BeatboxLane.score` | `audioPlan.cues[]` + shot `audioCueId` (**declared** invoke) |
| `AudioPlan.json` tempo/mood maps | `audioPlan` intensity + playback (**partial** mapping) |
| Speakers `DuckingRule` | `audioPlan.forbiddenDucking` (**declared** mix) |
| `schemas/narrative_trust_pack.v1.json` | `NarrativeTrustPackHandoff` (**declared**) |

## `audioPlan` fields (1.1)

| Field | Meaning |
|-------|---------|
| `statusTag` | `declared` — Beatbox live path |
| `mappingStatusTag` | `partial` — cue table tested |
| `scoreIdentity` | Theme id; S01 must equal S08 |
| `stems[]` | `id`, `role` (theme/layer/sting), `playback`, `carriesScoreIdentity` |
| `cues[]` | Per `shotId`: `audioCueId`, `cue`, `intensity` 0..1, `playback` loop\|one-shot, timing, `layers` |
| `forbiddenDucking[]` | Stems Speakers must not duck (identity bed) |
| `beatbox` | Invoke recipe (status GET vs `BeatboxLane.score`) |

## Warrior vertical slice

Fixture: `fixtures/infinity-backend-build-warrior-courtyard.json`  
Run: `python mrs/adapters/storyforge-boundary/contract/run_warrior_slice.py`  
Success: Shot 1 `characterStateHash` == Shot 8; Shot 1 `scoreIdentity` == Shot 8 while `audioCueId` / intensity evolve (enter courtyard → look at gate).
