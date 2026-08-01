# Anime Lane Promotion Proposal (v1)

| Field | Value |
| --- | --- |
| Status | **Proposal** · lane **declared** · **not promoted** |
| Target | Default stylization lane for cross-engine anime rendering (after gates) |
| Author | Jon Halstead (warheart1984-ctrl) |
| Contract | [`ANIME_LANE_CROSS_ENGINE_CONTRACT.v1.md`](./ANIME_LANE_CROSS_ENGINE_CONTRACT.v1.md) |

Drive-G-1: claims below use **Declared / Partial / Verified** — do not read “Proposal” as “Promoted.”

## 1. Motivation

The Anime Lane is **declared** and **partially scaffolded** across:

| Area | Maturity | Notes |
| --- | --- | --- |
| Genblaze/MRS backend (`POST /api/anime`) | **partial** | Thin handoff; forces `style=anime`; provenance block |
| Unreal Engine AnimeStylizer plugin | **skeleton/partial** | File tree + BP API + shader sketches; RDG not hooked; compile **unknown** |
| Structure-plate integration | **declared/partial** | Load/config + projector contract; UE blend skeleton |
| Provenance chain | **declared/partial** | Schema + Genblaze fields; not CKL-enforced |
| Replay determinism | **declared** | Frame-hash demo path; ReplayService not anime-gated |
| Multi-pass stylization pipeline | **skeleton/partial** | UE passes registered as stubs |

It is **eligible for consideration** as a default governed anime rendering lane once promotion gates clear — **not** ready to promote today.

## 2. Evidence Summary

### Backend

| Claim | Status | Evidence |
| --- | --- | --- |
| `/api/anime` forces style | **partial** | Response `style` / `anime_lane.style_forced` |
| Health disclosure | **partial** | `/health.anime_lane` aligned to health schema |
| Plugin OpenAPI | **partial** | Advertised when ChatGPT plugin surface present |
| Unit tests | **partial** | Run `pytest mrs/apps/genblaze-media/tests/test_anime_ue_handoff.py` — cite live count in commit notes (do not claim “19 passed” unless verified) |

### UE AnimeStylizer

| Claim | Status | Evidence |
| --- | --- | --- |
| Outline → Cel → Grade → TAA | **skeleton/partial** | Pass shells + `.usf` sketches |
| Structure-plate blending | **skeleton** | Config + `LoadStructurePlate`; no RDG blend |
| Blueprint API | **partial** | Library surface; Apply stores config |
| LUT generation | **partial** | `GeneratePaletteLUTs.py` + 6 PNGs |
| Runs on mid-tier GPUs (R9 380) | **declared** | Not measured / not verified in this repo |

### Cross-Engine

| Claim | Status | Evidence |
| --- | --- | --- |
| Structure plates from Engine3D/RT4D | **declared/partial** | Projector contract + optional Genblaze structure render |
| Provenance preserved end-to-end | **declared/partial** | Handoff + demo `provenance.json` |
| PNG → ffmpeg export | **partial** | `scripts/hackathon-governed-anime-demo.py` when ffmpeg on PATH |

## 3. Promotion Gate Requirements

### Completed (scaffold / declaration)

- Lane declaration
- Contract v1
- Health schema document
- Plugin integration (**partial**)
- Structure-plate compatibility (**declared/partial** contract binding)

### Pending

- Ink-cel evaluation
- Pole-stress thresholds
- CI provenance validator
- Shading-space alignment
- CSE/CCC sign-off
- Verified UE compile + RDG stylize
- Replay determinism as **Verified** (not only declared hashes)

## 4. Recommendation

**Do not promote** Anime Lane to the default governed anime stylization lane until all pending gate items are completed. Keep the reliable demo path as Genblaze/structure → ffmpeg (UE optional).

See also: [`../ops/CAPABILITY_CANVAS_GOVERNED_ANIME_PIPELINE.md`](../ops/CAPABILITY_CANVAS_GOVERNED_ANIME_PIPELINE.md) · [`../../unreal/AnimeStylizer/HACKATHON_READINESS.md`](../../unreal/AnimeStylizer/HACKATHON_READINESS.md).
