# AnimeStylizer — Hackathon Readiness Matrix

Evidence-bound (Drive-G-1). User aspirational claims are treated as a **verification checklist**, not as proven capability.

| Field | Value |
| --- | --- |
| Branch / PR | `feat/anime-stylizer-ue-plugin` · PR #98 |
| Plugin status | **skeleton / partial** |
| Reliable demo (no UE) | `python scripts/hackathon-governed-anime-demo.py` |
| Story | [`docs/ops/DEVPOST_GOVERNED_ANIME_PIPELINE.md`](../../docs/ops/DEVPOST_GOVERNED_ANIME_PIPELINE.md) |
| Contract | [`ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md`](../../docs/4d-engine/projection/ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md) |

## Honesty matrix

| Claim / area | Ready? | Maturity | Evidence |
| --- | --- | --- | --- |
| Scaffold files (`.uplugin`, Source, Shaders, Content, Config, README) | **yes** | skeleton/partial | `unreal/AnimeStylizer/` tree |
| Documented install → export guide | **yes** (operator recipe) | partial | `README.md` |
| Compiles in UE 5.3+ | **unknown** | declared | No UE project build / CI log in this repo |
| Post-process material applies without errors | **unknown** | skeleton | `Content/Materials/AnimeStylizerMaterialNodes.txt` (node notes, not `.uasset`) |
| LUTs generate | **yes** | partial | `GeneratePaletteLUTs.py` + 6 PNGs under `Content/LUTs/` |
| LUT import settings correct in UE | **unknown** | declared | Operator-side import flags documented |
| Blueprint nodes expose all config | **partial** | partial | `FAnimeStylizerConfig` + library; Apply is skeleton (stores config) |
| 6 LUT palettes | **yes** | partial | Morning/Noon/Night/Sunset/Cyberpunk/Monochrome |
| 6 named stylization presets (full config packs) | **no** | gap | Only LUT palettes + default config fields — no preset table/enum |
| Structure plate blend with Engine3D/RT4D | **no** (API only) | skeleton | `LoadStructurePlate` + config; blend not in RDG |
| ffmpeg clean H.264 | **partial** / **unknown** | declared→partial | Recipe in README; demo script encodes when ffmpeg present — no invented artifact |
| Genblaze `POST /api/anime` | **yes** (thin) | partial | `mrs/apps/genblaze-media/app/anime_ue_handoff.py` |
| Cross-engine full pipe + provenance → `anime_demo.mp4` | **partial** (no UE) | partial | Offline/Genblaze→ffmpeg demo; UE leg optional |
| “You’re set to render” (full UE) | **no** | — | See below |
| “You’re set to render” (Genblaze/structure/ffmpeg) | **yes** | partial | Demo script + evidence pack |

## Verification checklist (pass / fail / unknown)

| # | Check | Result | Notes |
| --- | --- | --- | --- |
| 1 | Plugin tree present | **pass** | uplugin, Source, Shaders, Content, Config |
| 2 | README honesty tags | **pass** | skeleton/partial; 1.1 ms declared |
| 3 | LUT Python + 6 PNGs | **pass** | `Content/LUTs/` |
| 4 | Types expose outline/cel/LUT/grade/TAA/structure | **pass** | `AnimeStylizerTypes.h` |
| 5 | Named 6 stylization presets | **fail** | LUT-only |
| 6 | UE compile green | **unknown** | Not built here |
| 7 | PP material asset applies | **unknown** | Text notes only |
| 8 | RDG Apply stylizes pixels | **fail** | Returns SourceRT; config stored |
| 9 | `/api/anime` exists | **pass** | dry_run handoff + optional structure |
| 10 | Structure plate provenance fields | **pass** | profile id + projection_method |
| 11 | ffmpeg demo artifact | **unknown→pass if run** | Re-run demo script with ffmpeg |
| 12 | CKL-enforced provenance | **fail** | declared schema only |

## Set to render?

| Path | Answer |
| --- | --- |
| Genblaze `/api/anime` → structure → ffmpeg → evidence | **Yes** — run `python scripts/hackathon-governed-anime-demo.py` |
| Full UE AnimeStylizer stylize + export | **No** — scaffold / unknown compile / RDG not wired |

## Remaining before Devpost (real items)

1. Run the demo script on the submission machine; attach `anime_demo.mp4` (if ffmpeg) + `provenance.json` hashes to the Devpost media section.
2. Keep UE claims as **optional scaffold** in the pitch — do not imply a shipping Unreal stylizer.
3. Point judges at [`DEVPOST_GOVERNED_ANIME_PIPELINE.md`](../../docs/ops/DEVPOST_GOVERNED_ANIME_PIPELINE.md) (governed pipeline story), not “anime renderer.”
