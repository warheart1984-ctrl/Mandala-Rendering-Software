# Hackathon Evidence — Governed Creative Anime Pipeline

| Field | Value |
| --- | --- |
| Status | **partial** |
| Story lead | Governed reusable profiles + provenance + replayable execution — **not** “another anime renderer” |
| Reliable demo | Genblaze `/api/anime` → structure/cel plate → ffmpeg (**no UE required**) |
| Optional leg | `unreal/AnimeStylizer/` — **skeleton / partial** (compile **unknown**) |
| Contract | [`ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md`](../../../4d-engine/projection/ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md) |

## Pipeline (judge story)

```
Intent → Genblaze POST /api/anime → structure plate + provenance
      → (optional) UE AnimeStylizer
      → ffmpeg → Evidence → Replay (declared)
```

## Clean-checkout demo (minimal steps)

From repo root:

```bash
python scripts/hackathon-governed-anime-demo.py
```

Optional live API probe (Genblaze running locally):

```bash
python scripts/hackathon-governed-anime-demo.py --call-api http://127.0.0.1:8787
```

Produces runtime artifacts under `tmp/hackathon-governed-anime-demo/` (gitignored) and syncs small JSON sidecars here.

| Artifact | Role |
| --- | --- |
| `structure_plate.png` | Structure/cel plate for UE `LoadStructurePlate` or ffmpeg |
| `frames/frame_NNNN.png` | Deterministic sequence |
| `anime_demo.mp4` | H.264 when `ffmpeg` on PATH (**partial** if present; skipped if not) |
| `provenance.json` | AnimeWorldProfile id + `projection_method` + hashes |
| `replay_metadata.json` | Frame hashes for operator replay (**declared** CKL) |
| `api_anime_handoff.json` | Same shape as `POST /api/anime` dry_run |
| `RUN_RECEIPT.md` | Human-readable receipt: timing, hashes, capability status, re-run command |
| `governed-anime-demo-evidence.zip` | Compact judge-facing bundle, excluding raw frame sequence |

## Committed sidecars (this folder)

| File | Notes |
| --- | --- |
| `LAST_RUN_MANIFEST.json` | Last assembler run summary (hashes / timing / set_to_render) |
| `provenance.example.json` | Example provenance |
| `replay_metadata.example.json` | Example replay metadata |
| `api_anime_handoff.example.json` | Example `/api/anime` handoff |
| `RUN_RECEIPT.example.md` | Operator receipt (hashes + capability tags) |
| `RUN_RECEIPT.example.md` | Example judge/operator run receipt |

Re-run the script after clone to refresh hashes and (if ffmpeg present) the mp4.

## Capability tags

| Capability | Tag |
| --- | --- |
| `POST /api/anime` handoff | **partial** |
| Offline structure/cel plates | **partial** |
| AnimeWorldProfile binding | **partial** (`anime.mandala-cel.v1`) |
| Projection provenance | **declared** (schema + contract) |
| ffmpeg export | **partial** when binary present / **declared** if skipped |
| UE AnimeStylizer | **skeleton / partial** |
| UE compile UE 5.3+ | **unknown** |
| ReplayService enforcement | **declared** |

## Set to render?

| Path | Answer |
| --- | --- |
| Genblaze / offline structure → ffmpeg | **Yes** (this script) |
| Full UE AnimeStylizer RDG stylize | **No** — scaffold only; see [`unreal/AnimeStylizer/HACKATHON_READINESS.md`](../../../../unreal/AnimeStylizer/HACKATHON_READINESS.md) |

## Related docs

- Story: [`DEVPOST_GOVERNED_ANIME_PIPELINE.md`](../../DEVPOST_GOVERNED_ANIME_PIPELINE.md)
- Canvas: [`CAPABILITY_CANVAS_GOVERNED_ANIME_PIPELINE.md`](../../CAPABILITY_CANVAS_GOVERNED_ANIME_PIPELINE.md)
- Genblaze Devpost: [`DEVPOST_GENBLAZE.md`](../../DEVPOST_GENBLAZE.md)
