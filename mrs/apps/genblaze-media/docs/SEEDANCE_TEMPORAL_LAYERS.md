# Seedance → 4D temporal layers (declared)

**Status: declared / roadmap — not implemented.**

Goal (operator intent): feed Seedance-generated video sequences into the Mandala
Rendering System 4D engine as **temporal layers**.

## What exists today

1. Genblaze Media can generate (or dry-run) an MP4 + SHA-256 manifest and store
   it under the B2 prefix (`asset_key` / `manifest_key` / `run_id`).
2. CROS defines a `provider-contract` replay class for generative media
   (`cros.gen-ai-nim` profile). A Seedance-shaped adapter skeleton may live
   under `mrs/packages/cros` without being imported by genblaze-media.

## What does **not** exist yet

- No `TemporalLayer` type or video-clip binding in `renderer-core` / rt4d
  that ingests Genblaze asset URLs into a governed timeline play.
- No automatic wiring from `/api/generate-video` → 4D world/timeline clips.
- No claim that Seedance output is a 4D render.

## Intended bridge (future)

```
CreativeIntent → RenderIntent (cros.gen-ai-*) → Seedance execute
  → RenderResult { assetSha256, url, duration }
  → (future) Timeline clip binding: modality=video, temporalLayerId, worldId
  → 4D player treats clip as image-plane / texture over [t0, t1]
```

Until that binding ships, treat Genblaze Seedance output as **concept media
assets** only. Do not mark temporal-layer ingestion as enforced or complete.
