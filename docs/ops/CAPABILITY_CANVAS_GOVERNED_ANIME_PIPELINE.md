# Capability Canvas — Governed Creative Anime Pipeline

| Field | Value |
| --- | --- |
| Status | **partial** (scaffold now; promote after hackathon evidence accumulates) |
| Audience | Operators / judges / post-hackathon implementors |
| Related story | [`DEVPOST_GOVERNED_ANIME_PIPELINE.md`](./DEVPOST_GOVERNED_ANIME_PIPELINE.md) |
| Evidence | [`hackathon-evidence/governed-anime-pipeline/`](./hackathon-evidence/governed-anime-pipeline/) |

Maturity vocabulary: **Declared** → **Partial** → **Verified** → **Promoted**.

---

## Mission

Ship a **governed creative pipeline** where every stylized artifact is attributable to an intent, an AnimeWorldProfile, a projection method, and a replayable hash trail — without claiming Full Photoreal or a shipping Unreal product.

## Capabilities

| Capability | Maturity | Evidence |
| --- | --- | --- |
| `POST /api/anime` handoff JSON | **Partial** | `mrs/apps/genblaze-media/app/anime_ue_handoff.py` + tests |
| AnimeWorldProfile load/validate | **Partial** | `schemas/anime/` + `anime_world_profile.py` |
| Structure/cel plate offline demo | **Partial** | `scripts/hackathon-governed-anime-demo.py` |
| Projection provenance schema | **Declared** | `StructurePlateProjectionProvenance.v1.schema.json` |
| Projection contract | **Declared / Partial** | `ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md` |
| ffmpeg H.264 export | **Partial** (when binary present) | Demo script; not CI-gated |
| UE AnimeStylizer scaffold | **Skeleton / Partial** | `unreal/AnimeStylizer/` |
| UE 5.3+ compile | **Declared** (unknown in practice) | No UE project build in CI |
| RDG stylize chain | **Skeleton** | Pass shells; Apply stores config only |
| ReplayService enforcement | **Declared** | MRS conformance checks exist; anime demo not wired |
| CKL anime provenance gate | **Declared** | Not runtime-enforced |

## Architecture

```
┌─────────┐    POST /api/anime     ┌──────────────────┐
│ Intent  │ ─────────────────────► │ Genblaze Media   │
└─────────┘                        │ (partial)        │
                                   └────────┬─────────┘
                                            │ structure plate +
                                            │ AnimeWorldProfile +
                                            │ projection_method
                     ┌──────────────────────┼──────────────────────┐
                     ▼                      ▼                      ▼
            ┌────────────────┐    ┌─────────────────┐    ┌──────────────┐
            │ ffmpeg encode  │    │ Evidence pack   │    │ UE AnimeStyl. │
            │ (partial)      │    │ hashes/replay   │    │ (optional /   │
            └────────────────┘    └─────────────────┘    │  skeleton)    │
                                                         └──────────────┘
```

Print SoT / Digital Printer remain **untouched**. Structure lane ≠ print lane.

## Evidence

- Clean-checkout assembler: `python scripts/hackathon-governed-anime-demo.py`
- Sidecars: `docs/ops/hackathon-evidence/governed-anime-pipeline/`
- UE honesty matrix: `unreal/AnimeStylizer/HACKATHON_READINESS.md`
- Unit tests: `mrs/apps/genblaze-media/tests/test_anime_ue_handoff.py`

## Known gaps

1. No CI Unreal compile of AnimeStylizer
2. RDG post-process chain not hooked into engine view extensions
3. Replay is hash recording, not CKL-gated `play_timeline`
4. Live Engine3D beauty structure remains env/operator dependent; offline demo uses deterministic plates
5. Named “6 stylization presets” as full `FAnimeStylizerConfig` packs are **not** present — 6 LUT palettes are

## Next milestones (after hackathon)

| Milestone | Target maturity |
| --- | --- |
| Wire `/api/anime` `render_structure` to Engine3D when CLI present | Partial → Verified (structure) |
| UE PP material asset + smoke apply | Skeleton → Partial |
| RDG outline→cel→LUT insertion | Skeleton → Partial |
| ffmpeg artifact hashed in CI smoke (optional job) | Partial → Verified |
| Promotion of projector default (still declared until richer evidence) | see projection promotion package |
