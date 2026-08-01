# Devpost — Governed Creative Anime Pipeline

Evidence-bound pitch for the hackathon submission. **Hero claim: governed creative pipeline** — not “another anime renderer.”

| Field | Value |
| --- | --- |
| Status | **partial** (reliable Genblaze/structure/ffmpeg path; UE optional skeleton) |
| Evidence pack | [`hackathon-evidence/governed-anime-pipeline/`](./hackathon-evidence/governed-anime-pipeline/) |
| Capability canvas | [`CAPABILITY_CANVAS_GOVERNED_ANIME_PIPELINE.md`](./CAPABILITY_CANVAS_GOVERNED_ANIME_PIPELINE.md) |
| UE readiness | [`unreal/AnimeStylizer/HACKATHON_READINESS.md`](../../unreal/AnimeStylizer/HACKATHON_READINESS.md) |
| Projection contract | [`ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md`](../4d-engine/projection/ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md) |

## One-liner

**Intent → Genblaze `/api/anime` → structure plate + AnimeWorldProfile provenance → (optional UE) → ffmpeg → Evidence → Replay.**

## Why this matters

Most AI media demos are one-shot generators. This submission shows a **reusable governance loop**:

1. **Profiles** — `AnimeWorldProfile` (`anime.mandala-cel.v1`) binds palette, shadow bands, outline rules, continuity invariants.
2. **Provenance** — every plate carries `projection_method`, profile id, SHA-256, and Print SoT untouched flags.
3. **Replayable execution** — frame hashes + declared ReplayService path (MRS conformance); operators can re-run the clean-checkout script.
4. **Honest maturity** — structure/ffmpeg path is runnable; Unreal AnimeStylizer is scaffolded, not claimed compiled.

## What judges can run (clean checkout)

```bash
python scripts/hackathon-governed-anime-demo.py
```

Optional live handoff probe:

```bash
# with Genblaze up on :8787
curl -sX POST http://127.0.0.1:8787/api/anime \
  -H "Content-Type: application/json" \
  -d "{\"dry_run\":true,\"projection_method\":\"projector4d-sot\",\"prompt\":\"governed mandala\"}"
```

Artifacts: `tmp/hackathon-governed-anime-demo/` (+ synced JSON under `docs/ops/hackathon-evidence/governed-anime-pipeline/`).

## What we are **not** claiming

- Not Full Photoreal / Digital Printer SoT
- Not a verified Unreal 5.3+ plugin compile in CI
- Not CKL-enforced anime provenance (schema **declared**)
- Not measured “1.1 ms on R9 380” (design budget only)
- Not TV anime / hand-drawn line art

## Relationship to other Devpost notes

- Genblaze B2 / provider cascade: [`DEVPOST_GENBLAZE.md`](./DEVPOST_GENBLAZE.md)
- Anime-structure projector lane (projection math): [`DEVPOST_ANIME_STRUCTURE_PROJECTOR.md`](./DEVPOST_ANIME_STRUCTURE_PROJECTOR.md)

## Suggested demo video (~2–3 min)

1. Open evidence README → show pipeline diagram and capability tags.
2. Run `python scripts/hackathon-governed-anime-demo.py` → show `structure_plate.png` + `provenance.json`.
3. If ffmpeg present → play `anime_demo.mp4`; else show declared skip in `manifest.json`.
4. Show `POST /api/anime` dry_run JSON (profile id + `projection_method`).
5. Point at `unreal/AnimeStylizer/` as **optional** consumer scaffold — do not claim live UE stylize.
