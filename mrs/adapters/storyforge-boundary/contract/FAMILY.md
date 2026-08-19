# StoryForge ↔ Mandala contract family

**schemaVersion:** `storyforge-mandala-contract/1.0`  
**Status:** **partial** for schema + identity compare; **declared** for Beatbox, Speakers, and final film assembly.  
**Owner of narrative organs:** Project Infinity (`warheart1984-ctrl/infinity`, `external/story_forge`). Mandala does **not** host a second Story Bible engine.

## One artifact flow

```text
Infinity BackendBuildArtifact / cinematic plan / world pack
        ↓ adapter map (this package)
StoryForgeProductionArtifact
        ↓
MandalaProductionRequest
        ↓ per shot (structure, rig, evidence — not a movie studio)
MandalaShotArtifact
        ↓ declared handoff
Infinity Narrative Trust Pack (lineage to narrative intent)
```

Crossing pixels still use existing `schemas/RenderRequest.schema.json` when a shot is actually rendered. This family is the **production** contract, not a replacement renderer.

## Honest limits

- Identity compare can **detect** lock-field mutation across shots.
- It **cannot** guarantee diffusion/sampler obedience.
- Audio (Beatbox / Speakers) and assembler MP4 are **declared** until exercised against Infinity lanes.

## Infinity map (vendor-docs, not a forked studio)

| Infinity | This contract |
|----------|----------------|
| `BackendBuildArtifact` (`backend_full_build.py`) | `StoryForgeProductionArtifact.productionId` ← `build_id` |
| `NarrativeState` + characters | `characters[]` + `narrativeId` |
| `worldpacks/` | `worldPack` |
| `TemporalShotList` / `CinematicPlan.shots` | `shots[]` / `timeline` |
| `ContinuityReport` | `continuityConstraints` |
| `movie_audio_pipeline` | `audioPlan` (**declared**) |
| `schemas/narrative_trust_pack.v1.json` | `NarrativeTrustPackHandoff` (**declared**) |

## Warrior vertical slice

Fixture: `fixtures/warrior-courtyard-8shot.production.json`  
Run: `python mrs/adapters/storyforge-boundary/contract/run_warrior_slice.py`  
Success: Shot 1 `characterStateHash` == Shot 8 `characterStateHash` with evolving pose.
