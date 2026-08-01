# Governed Anime Demo — Run Receipt

| Field | Value |
| --- | --- |
| Status | **partial** |
| Story | Intent → Genblaze /api/anime → structure plate → (optional UE) → ffmpeg → Evidence → Replay |
| Created at | 2026-08-01T19:01:08.164700Z |
| End-to-end time | 37.831 seconds |
| Frames | 24 @ 12 fps |
| AnimeWorldProfile | `anime.mandala-cel.v1` |
| Projection method | `projector4d-sot` |
| Structure plate SHA-256 | `3cbcbbdfee2abd08b26c273d5a9e7216de29f503a0505abcfe1b8399b82c0b84` |
| MP4 SHA-256 | `768941f7c606ae597448c215e7249adcc3795fae6ca0435c454b683b8e75b732` |

## Pipeline

```text
Intent → Genblaze /api/anime handoff → deterministic structure/cel plates
      → ffmpeg H.264 export → provenance → replay metadata
```

## Honest capability status

| Capability | Status |
| --- | --- |
| Genblaze `/api/anime` handoff | partial |
| Offline deterministic structure/cel plate | partial |
| ffmpeg H.264 export | partial / ok |
| UE AnimeStylizer | skeleton / partial; optional consumer leg |
| UE compile | unknown unless operator runs UE 5.3+ locally |
| CKL replay enforcement | declared; this folder records replay hashes |

## Re-run

```bash
python scripts/hackathon-governed-anime-demo.py --frames 24 --fps 12 --out tmp/hackathon-governed-anime-demo
```

## Key files

- `anime_demo.mp4` — generated video when ffmpeg is present
- `structure_plate.png` — first deterministic structure/cel plate
- `api_anime_handoff.json` — Genblaze → UE handoff shape
- `provenance.json` — profile/projection/hash provenance
- `replay_metadata.json` — frame hashes for replay comparison
- `manifest.json` — full machine-readable run summary
