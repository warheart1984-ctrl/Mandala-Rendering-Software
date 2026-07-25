"""CMM-Seedance-v1.0 — Cloud Seedance 2.0 text-to-video (opt-in).

Status labels (Drive-G-1):

| Claim | Status |
|-------|--------|
| Seedance 2.0 is a ByteDance SEED video model | **documented** (seed.bytedance.com) |
| Public developer API via fal.ai / Cloudflare AI / VolcEngine mirrors | **documented** (gateway docs) |
| Genblaze Media can call fal text-to-video when keyed | **partial** (provider + pipeline branch) |
| Free / no-watermark / always-1080p for API | **not proven** — see honesty section |
| CKL / constitutional runtime gate | **not enforced** here |
| 4D temporal-layer ingestion | **declared** only — see `SEEDANCE_TEMPORAL_LAYERS.md` |

## What Seedance 2.0 is

- **Product:** Seedance 2.0 — ByteDance SEED Lab multimodal video generation
  (text / image / video / audio → video, often with native audio).
- **Official page:** https://seed.bytedance.com/en/seedance2_0
- **Consumer UIs (not this adapter):** Dreamina (global), Jimeng/即梦 (China), CapCut — free
  daily credits on those products are **not** the same as a developer API key.
- **Developer gateways used by this app (default):** fal.ai
  `bytedance/seedance-2.0/text-to-video` with `Authorization: Key $FAL_KEY`.
  Also documented on Cloudflare Workers AI as `bytedance/seedance-2.0`.

## Honesty check (free / watermark / 1080p)

| User claim | Evidence |
|------------|----------|
| "Best free cloud generator" | Consumer free credits exist on Dreamina/Jimeng with quotas; **fal API is paid** (published per-second rates on fal model page). Do not treat API as free. |
| "No watermark" | Cloudflare schema exposes `watermark` (default false). fal commercial API docs emphasize paid inference; **consumer free tiers often watermark**. C2PA provenance metadata may still be present even when visible watermark is off. |
| "1080p" | Cloudflare lists 480p/720p/1080p/4k. fal text-to-video input schema commonly lists **480p/720p**; UI/pricing also mention 1080p — **gateway-dependent**. Default in MRS is **720p**. |
| "No GPU required" | **True for the operator machine** — generation runs on the cloud gateway. |

## MRS integration

- Provider: `app/seedance_provider.py` + `app/seedance_client.py`
- Pipeline branch: `app/pipeline_video.py` when `GENBLAZE_VIDEO_BACKEND=seedance`
- Gate: `GENBLAZE_VIDEO_ENABLED=1` (stills-first default remains off)
- Auth: `FAL_KEY` or `SEEDANCE_API_KEY` (no secrets in git)
- Evidence fields: model id, prompt sha256, provider request id, asset sha256, run_id, B2 keys when configured
- Replay class: **provider-contract** only (not bit-identical)

## Enable

See `env.seedance.example` (additive; merge conflicts may still hold `.env.example`).

```bash
GENBLAZE_VIDEO_ENABLED=1
GENBLAZE_VIDEO_BACKEND=seedance
FAL_KEY=...
SEEDANCE_MODEL=bytedance/seedance-2.0/text-to-video
SEEDANCE_RESOLUTION=720p
SEEDANCE_DURATION=5
```

Dry-run (no live paid call):

```bash
GENBLAZE_VIDEO_ENABLED=1
GENBLAZE_VIDEO_BACKEND=seedance
GENBLAZE_DRY_RUN=1
```
