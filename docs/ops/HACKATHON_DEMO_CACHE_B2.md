# Hackathon demo path: pre-render → B2 → live pipeline + GenBlaze multi-provider failover

| Field | Value |
|-------|-------|
| Status | **partial** |
| Audience | Backblaze Generative Media Hackathon judges / operators |
| App | `mrs/apps/genblaze-media` |
| Trail | `docs/governance/cecp/trails/hackathon-demo-cache-b2-2026-08/` |

## Intent

1. **Pre-render** beauty frames ahead of time (spread gens across a 24h window).
2. **Store** PNG + SHA-256 provenance sidecars on **Backblaze B2**.
3. **Demo the live pipeline** against cached frames (`source: b2-cache`) while still disclosing provider failover readiness.
4. Use **GMI Cloud credits** via the **GenBlaze SDK** (`genblaze-gmicloud`) for real fan-out.
5. Keep **hfspace** as the **free fallback** polish/generate leg.

Constitutional Anime remains the governed story lane; this slice is the **media demo architecture**: cache + provenance + multi-provider.

## Architecture

```text
┌─────────────────┐   GMI (GenBlaze SDK)    ┌──────────────────┐
│ pre_render CLI  │ ──────────────────────► │ B2 demo-cache/   │
│ 24h sleep/batch │   (+ provenance JSON)   │ shot/fNNNN/…     │
└─────────────────┘                         └────────┬─────────┘
                                                     │
┌─────────────────┐   GENBLAZE_DEMO_CACHE=1          │
│ Live FastAPI    │ ◄──── fetch labeled b2-cache ────┘
│ /api/generate   │
│ /health         │ ── provider_cascade probe (gmi→fal→nvidia→hfspace)
└─────────────────┘
         │ cache miss
         ▼
   live-generate → else structure-only (fail-closed)
```

### B2 object layout

Under `GENBLAZE_STORAGE_PREFIX` (default `genblaze-media`):

```text
{prefix}/demo-cache/{shot_id}/f{frame:04d}/render.png
{prefix}/demo-cache/{shot_id}/f{frame:04d}/manifest.json
```

Manifest fields (minimum): `intent_id`, `world_id`, `timeline_id`, `parameters`,
`anime_world_profile_id` (optional), `provider`, `sha256` / `asset_sha256`,
`source` (`live-generate` at write time; served as `b2-cache`).

### Source labels (mandatory)

| `source` | Meaning |
|----------|---------|
| `b2-cache` | Served from pre-rendered B2 object — **not** live beauty |
| `live-generate` | Produced by a live provider call this request |
| `structure-only` | Cache miss **and** painters failed / unavailable |

## Provider order + env vars

Cascade (health + docs): **gmi → fal → nvidia → hfspace**

| Leg | Role | Env | Notes |
|-----|------|-----|-------|
| GMI Cloud | Primary fan-out (hackathon credits) | `GMI_API_KEY`, optional `GMI_BASE_URL`, `GENBLAZE_GMI_IMAGE_MODEL` | `pip install genblaze-gmicloud` (extra `[gmi]`) |
| fal.ai | Optional polish / video | `FAL_KEY` | Billed |
| NVIDIA NIM | Armed FLUX | `NVIDIA_API_KEY` | May 504 on cold |
| hfspace | Free fallback | `GENBLAZE_HFSPACE_URL` (default Space URL) | Keyless, quota-capped |
| B2 | Durable cache + provenance | `B2_KEY_ID`, `B2_APPLICATION_KEY` / `B2_APP_KEY`, `B2_BUCKET`, `B2_REGION` | Never commit secrets |

Demo cache flags:

- `GENBLAZE_DEMO_CACHE=1`
- `GENBLAZE_DEMO_CACHE_SHOT=mandala-open`
- `GENBLAZE_DEMO_CACHE_FRAME=0`
- Request body: `"demo_cache": true, "shot_id": "…", "frame": 0`

## How to pre-render (24h spread)

On a machine with GMI credits (not required to be the AMD host):

```bash
cd mrs/apps/genblaze-media
# optional: pip install -e ".[gmi]"
export GMI_API_KEY=…   # hackathon credits
# B2_* from repo-root .env

# Schedule hint only (no spend):
python -m app.pre_render --plan plans/demo-shot-plan.example.json --schedule-hint-only

# Spread 24 frames across 24h (~3600s sleep) + upload:
python -m app.pre_render \
  --shot-id mandala-open \
  --frames 0-23 \
  --prompt "cel-shaded mandala oracle mask, anime look" \
  --window-hours 24 \
  --upload-b2 \
  --out-dir ../../../tmp/genblaze-demo-cache
```

`--allow-placeholder` writes tiny PNGs for layout tests only (not judge beauty).

### AMD host / skip local SD (runbook)

This workstation may lack Lemonade `sd-server` / ROCm image gen. Do **not** burn demo time waiting on local SD.

| Host role | What to run |
|-----------|-------------|
| **AMD / local (no SD)** | Set `GENBLAZE_SKIP_LOCAL_SD=1`. Serve demo with `GENBLAZE_DEMO_CACHE=1` + B2 credentials. Optional: `GENBLAZE_IMAGE_BACKEND=rt4d` for structure stills. |
| **Cloud / GMI-credit machine** | Run `python -m app.pre_render … --upload-b2` (install `[gmi]` / `requirements-gmi.txt`). Upload once; AMD host only reads cache. |

```bash
# On the AMD machine — no local SD, no live GMI spend required for cache serve:
export GENBLAZE_SKIP_LOCAL_SD=1
export GENBLAZE_DEMO_CACHE=1
export GENBLAZE_DEMO_CACHE_SHOT=mandala-open
# B2_* from .env — never commit keys
npm run genblaze:media
```

```bash
# On a GMI-capable host — pre-render then upload (credits spend here):
cd mrs/apps/genblaze-media
pip install -r requirements-gmi.txt   # or: pip install -e ".[gmi]"
export GMI_API_KEY=…                  # dashboard / console only
python -m app.pre_render --plan plans/demo-shot-plan.example.json \
  --upload-b2 --out-dir ../../../tmp/genblaze-demo-cache
```

CLI flag (documents intent; this CLI already uses GMI, not Lemonade):

```bash
python -m app.pre_render --plan plans/demo-shot-plan.example.json \
  --schedule-hint-only --skip-local-sd
```

### CI / local verify without keys

No secrets in GitHub Actions. Green path:

```bash
cd mrs/apps/genblaze-media
export GENBLAZE_DRY_RUN=1 GENBLAZE_SKIP_LOCAL_SD=1
pip install -r requirements.txt   # do not require requirements-gmi.txt
python -m pytest tests/test_demo_cache.py -q
python -m app.pre_render --plan plans/demo-shot-plan.example.json --schedule-hint-only
# or: npm run genblaze:pre-render
```

Live GMI/fal/NIM gens are **out of CI** (credits + keys are operator/Render dashboard only).

## How to run live demo against cache

```bash
export GENBLAZE_DEMO_CACHE=1
export GENBLAZE_DEMO_CACHE_SHOT=mandala-open
npm run genblaze:media
# GET /health → demo_cache.enabled + provider_cascade
curl -s -X POST http://127.0.0.1:8787/api/generate \
  -H "content-type: application/json" \
  -d '{"prompt":"demo","demo_cache":true,"shot_id":"mandala-open","frame":0}'
# Expect source: "b2-cache" when object exists
```

## Docker SoT

| Image | Context | Notes |
|-------|---------|-------|
| **Repo-root `Dockerfile`** | Repo root | **Render SoT** (`render.yaml`). Bundles RT4D + Engine3D. Installs `requirements-docker.txt` then optional `requirements-gmi.txt` (non-fatal if package missing). |
| `mrs/apps/genblaze-media/Dockerfile` | App dir | NVIDIA-only; no RT4D. Same optional GMI install. |

`GMI_API_KEY` is **never** baked into the image — set on the Render dashboard (`render.yaml` lists `sync: false`).

## Anti-overclaim

- Cached frames are **not** live anime generate.
- GMI SDK path is **partial** until `genblaze-gmicloud` is installed + credits used.
- AMD host: set `GENBLAZE_SKIP_LOCAL_SD=1`; pre-render on a cloud/credit machine.
- Do not claim CI billed live GMI/fal/NIM in default unit tests.

## Related

- Devpost copy: [`DEVPOST_GENBLAZE.md`](./DEVPOST_GENBLAZE.md)
- Deploy: [`RENDER_DASHBOARD_DEPLOY_GENBLAZE.md`](./RENDER_DASHBOARD_DEPLOY_GENBLAZE.md)
- B2 ops: [`BACKBLAZE_B2_S3.md`](./BACKBLAZE_B2_S3.md)
