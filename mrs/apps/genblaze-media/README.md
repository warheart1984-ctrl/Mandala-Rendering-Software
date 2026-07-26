# MRS Genblaze Media (Backblaze hackathon MVP)

Thin **FastAPI** service: user prompt → **Genblaze** (`genblaze-nvidia` + `genblaze-s3`) → **Backblaze B2** assets + SHA-256 provenance manifest → simple UI with presigned previews.

| Dimension | Status (Drive-G-1) |
| --- | --- |
| Product story | **Declared:** provenanced *concept* stills for MRS / 4D scene authoring |
| Genblaze 4D render | **Not claimed** — Genblaze's NVIDIA path generates 2D (NIM FLUX); MRS remains the 4D renderer |
| RT4D image backend | **Prepared** — `GENBLAZE_IMAGE_BACKEND=rt4d` shells out to renderer-core `render-still.mjs` for deterministic procedural 4D stills (NOT text-to-image). Requires Node; the **repo-root** Dockerfile bundles it, the app-local one cannot. Render deploy **not yet verified** — check `/health.rt4d.available` |
| Operator deploy | **Prepared** — Dockerfile + `render.yaml` (Render free web) |
| Live NIM generate | **Requires** `NVIDIA_API_KEY` at runtime (default backend) |
| NIM Cosmos video (CMM-NIM-Cosmos) | **Prepared** — defaults **on** when `NVIDIA_API_KEY` is set and `GENBLAZE_VIDEO_ENABLED` is unset; pin `0` for stills-only (Render blueprint does). Cosmos catalog access is key-dependent; docs **declared** not enforced |
| Seedance 2.0 video (fal) | **Prepared** opt-in path (`GENBLAZE_VIDEO_BACKEND=seedance` + `FAL_KEY`); **fal API is billed** — not Dreamina/Jimeng free credits; default `720p`; watermark/1080p **not guaranteed**; temporal layers **declared** only |
| CROS (`/cros` page) | **Docs only** — static reference UI; this app does **not** implement or import CROS |
| B2 persistence | **Tests** path via `genblaze-s3` / dual-exported `B2_APP_KEY` |

## Product story (honest)

Operators type a prompt for a concept image. The **default** service calls NVIDIA NIM through Genblaze (`black-forest-labs/flux.1-schnell`), uploads the image and a Genblaze provenance manifest to a private B2 bucket, and returns object keys plus a **presigned GET** preview URL.

Optionally, set `GENBLAZE_IMAGE_BACKEND=rt4d` to skip NVIDIA entirely and produce a **deterministic procedural 4D still** via the MRS `renderer-core` RT4D path tracer (keyword → scene archetype + palette; seed → camera/placement). That path is **not** text-to-image and does **not** claim photorealism or semantic image synthesis. Same prompt (same seed) → byte-identical PNG. It cannot 504 on an upstream generative API because there is none.

This does **not** mean Genblaze's NVIDIA path renders 4D scenes.

## Setup

Python **≥ 3.11**. From this directory:

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Unix:
# source .venv/bin/activate

pip install --use-deprecated=legacy-resolver -r requirements.txt
```

Copy secrets into the **repo-root** `.env` (preferred) or `mrs/apps/genblaze-media/.env`:

| Variable | Role |
| --- | --- |
| `NVIDIA_API_KEY` | NVIDIA NIM / build.nvidia.com key (`nvapi-…`) |
| `B2_KEY_ID` | B2 application key ID |
| `B2_APPLICATION_KEY` or `B2_APP_KEY` | B2 application key (app dual-exports both names) |
| `B2_BUCKET` | Bucket name (private OK) |
| `B2_REGION` | e.g. `us-east-005` |
| `B2_ENDPOINT` | optional; defaults to `https://s3.<region>.backblazeb2.com` |
| `GENBLAZE_IMAGE_MODEL` | optional; default `black-forest-labs/flux.1-schnell` |
| `GENBLAZE_VIDEO_BACKEND` | optional; `nvidia` (default) or `seedance` |
| `GENBLAZE_VIDEO_MODEL` | optional; default `nvidia/cosmos-1.0-7b-diffusion-text2world`; fallback `nvidia/cosmos-1.0-12b-diffusion-text2world` when available on the key |
| `GENBLAZE_VIDEO_ENABLED` | unset → **on** when `NVIDIA_API_KEY` present, else off; explicit `0`/`1` overrides. Render blueprint pins `0` for stills-only judge demo |
| `FAL_KEY` / `SEEDANCE_API_KEY` | fal.ai credential required only when `GENBLAZE_VIDEO_BACKEND=seedance`; **fal API usage is billed** (Dreamina/Jimeng consumer free credits are a separate product surface) |
| `SEEDANCE_MODEL` | optional; default `bytedance/seedance-2.0/text-to-video` |
| `SEEDANCE_RESOLUTION` / `SEEDANCE_DURATION` / `SEEDANCE_ASPECT_RATIO` | Seedance request settings; defaults `720p` / `5` / `16:9` (`1080p` not claimed) |
| `SEEDANCE_GENERATE_AUDIO` / `SEEDANCE_WATERMARK` | optional; defaults `1` / `0` — watermark outcome is gateway/account-dependent and **not guaranteed** |
| `GENBLAZE_VIDEO_HTTP_TIMEOUT` / `GENBLAZE_VIDEO_NVCF_TIMEOUT` / `GENBLAZE_VIDEO_PIPELINE_TIMEOUT` / `GENBLAZE_VIDEO_NVCF_POLL_SECONDS` | Cosmos video timeouts (defaults 900 / 900 / 1200 / 120) |
| `GENBLAZE_HTTP_TIMEOUT` / `GENBLAZE_NVCF_TIMEOUT` / `GENBLAZE_PIPELINE_TIMEOUT` / `GENBLAZE_NVCF_POLL_SECONDS` | FLUX stills timeouts (defaults **600 / 600 / 720 / 180**). Render blueprint uses poll **300** (NVIDIA max) |
| `GENBLAZE_EMPTY_504_RETRY` | default **off** — set `1` for one delayed server retry after an empty NVIDIA gateway 504 only (may bill a second NIM call; prefer manual wait+retry) |
| `GENBLAZE_EMPTY_504_RETRY_DELAY` | seconds to wait before that opt-in retry (default **45**, clamped 5–180) |
| `GENBLAZE_NVIDIA_WARMUP_ON_STARTUP` | default **off** — set `1` to run one invalid-payload genai probe at process start (cheap when NIM rejects `{}`; it can itself return 504 when the gateway is unavailable) |
| `GENBLAZE_STORAGE_PREFIX` | optional; default `genblaze-media` |
| `GENBLAZE_DRY_RUN` | `1` only for unit tests / offline mocks — **not** live demos |
| `B2_PROBE_ON_HEALTH` | default **off** — when `1`, `/health` runs a ListObjects probe (B2 **Class C**). Keep `0` on Render/demo day |
| `GENBLAZE_IMAGE_BACKEND` | default `nvidia`; set `rt4d` (aliases: `renderer`, `mrs`) for the deterministic RT4D renderer backend |
| `GENBLAZE_IMAGE_FALLBACK_TO_RT4D` | default **off** — set `1` so a blank/504 NVIDIA still falls back to one RT4D render instead of surfacing the failure |
| `RT4D_NODE_PATH` | optional; default `node` |
| `RT4D_SCRIPT_PATH` | optional; default `<repo>/mrs/packages/renderer-core/scripts/render-still.mjs` |
| `RT4D_RENDER_WIDTH` / `RT4D_RENDER_HEIGHT` | optional; default `448` / `448` (clamped 16–1024) |
| `RT4D_SAMPLES` / `RT4D_MAX_DEPTH` | optional; default `20` / `5` |
| `RT4D_TIMEOUT` | optional; default `180` seconds (clamped 10–600) |

Seedance-only knobs are also listed in [`env.seedance.example`](./env.seedance.example) (not auto-loaded — copy into your real `.env`).

Get a free NIM key: [build.nvidia.com](https://build.nvidia.com/).

## RT4D renderer backend (deterministic procedural 4D stills)

| Concern | Honest status |
| --- | --- |
| What it **is** | Prompt → keyword scene selection → seeded RT4D CPU path trace → PNG + SHA-256 manifest (B2 or local preview cache) |
| What it **is not** | Text-to-image, diffusion, photoreal generation, or semantic image synthesis |
| External paid API | **None** — cannot empty-504 on NVIDIA |
| Provenance | Seed, scene id, palette, camera, samples, max depth, PNG sha256, cheap PI-GEO-LENGTH invariant evidence |
| Local enable | `GENBLAZE_IMAGE_BACKEND=rt4d` + Node 18+ on PATH + monorepo `renderer-core` checkout |
| Docker | The **repo-root** Dockerfile bundles Node 22 + `renderer-core` sources (build-time render smoke test). The **app-local** Dockerfile does not — its context cannot reach `mrs/packages/renderer-core` |
| Deployed Render service | Declared, **not yet verified on Render**. Treat `/health.rt4d.available` on the live URL as the only evidence; a service on an older image still reports `false` until redeployed |

### Enable locally

```bash
# from mrs/apps/genblaze-media with venv active + Node 18+ on PATH
set GENBLAZE_IMAGE_BACKEND=rt4d          # Windows PowerShell: $env:GENBLAZE_IMAGE_BACKEND="rt4d"
# optional size for faster iteration:
set RT4D_RENDER_WIDTH=320
set RT4D_RENDER_HEIGHT=240
set RT4D_SAMPLES=12
uvicorn app.main:app --host 127.0.0.1 --port 8787
curl -s http://127.0.0.1:8787/health | findstr /i rt4d
curl -s -X POST http://127.0.0.1:8787/api/generate -H "content-type: application/json" -d "{\"prompt\":\"cyan tesseract lattice\",\"embed\":false}"
```

Or keep NVIDIA as primary and opt into fallback:

```bash
set GENBLAZE_IMAGE_FALLBACK_TO_RT4D=1
```

### Docker / Render

RT4D needs two things inside the container: a `node` binary and the
`renderer-core` sources. The repo-root `Dockerfile` provides both:

- `COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node` —
  the binary only. `npm install` is deliberately skipped: `render-still.mjs`
  imports node builtins plus `src/render/rt4d/**`, so nothing in the render path
  resolves to a package in `node_modules`. `package.json` is still copied
  because its `"type": "module"` is what makes the `.js` sources load as ESM.
- `COPY mrs/packages/renderer-core/{package.json,src,scripts} ./renderer-core/`
  and `RT4D_SCRIPT_PATH=/app/renderer-core/scripts/render-still.mjs`.
- A 64×64/1-sample render runs at build time, so a broken Node layer or a
  missing import fails the build instead of surfacing as a runtime 502.

**Build context must be the repo root.** `mrs/packages/renderer-core` sits
outside `mrs/apps/genblaze-media`, so the app-local Dockerfile cannot copy it.
On Render that means: Root Directory empty, Dockerfile Path `./Dockerfile`.

Verify a build locally before deploying:

```bash
# from the repo root
docker build -t genblaze-rt4d .
docker run --rm -e GENBLAZE_IMAGE_BACKEND=rt4d -p 8000:8000 genblaze-rt4d
curl -s localhost:8000/health | python -m json.tool   # expect rt4d.available true
curl -s -X POST localhost:8000/api/generate \
  -H 'content-type: application/json' \
  -d '{"prompt":"cyan tesseract lattice","embed":false}'
```

Sizing: the render is a single-threaded CPU path trace, and Render's free plan
is a shared 0.1 CPU, so a render there is far slower than on a dev machine and
must still finish inside the platform request timeout. `render.yaml` therefore
pins `RT4D_RENDER_WIDTH/HEIGHT=256` and `RT4D_SAMPLES=8`. Those numbers are a
conservative starting point, not a measured budget — time a render on the
target plan before raising them.
### Docker / Render follow-up (Node not yet in the image)

The root / app Dockerfiles install Python only. To make `rt4d` work on Render you must add Node to the image (example, not applied in this change):

```dockerfile
# Example follow-up — do NOT claim this is already deployed:
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm \
 && rm -rf /var/lib/apt/lists/*
# Also COPY mrs/packages/renderer-core into the image (or a multi-stage build)
# and set RT4D_SCRIPT_PATH accordingly.
```

Until that lands, `/health.rt4d.available` will be `false` on the deployed image even when `GENBLAZE_IMAGE_BACKEND=rt4d` is set. Local monorepo runs work today.

## Run locally

```bash
# from mrs/apps/genblaze-media with venv active
uvicorn app.main:app --host 0.0.0.0 --port 8787 --reload
```

Or from repo root (after venv + deps):

```bash
npm run genblaze:media
```

- UI: http://127.0.0.1:8787/ (stills `#stills`; video `#nim-cosmos` when video enabled)
- Health: http://127.0.0.1:8787/health
- `POST /api/generate` body: `{"prompt":"…"}` (FLUX stills — **judge demo path**)
- `POST /api/generate-video` body: `{"prompt":"…"}` (selected Cosmos or Seedance backend — **503 when video disabled**)
- `POST /api/image/ingest` — multipart `file` or JSON `{ "image_base64", "filename?", "mime?" }` → stores under `data/ingested/`
- `POST /api/image/analyze` — `{ "id" }` or `{ "image_base64" }` → **heuristic** 4D surface/color suggestion (not RT4D reconstruction)
- `GET /api/image/ingested` — list ingested photos; `GET /api/image/ingested/{id}/file` serves bytes
- `GET /media/nim-cosmos` → 302 `/#nim-cosmos` when enabled, else `/#stills`
- `GET /api/assets` — recent entries from local JSON index (`?modality=video` optional)

**Image ingest honesty:** stores operator photos locally and returns palette/aspect heuristics for Copilot. It does **not** perform true 4D scene reconstruction and does **not** integrate Midjourney/Kling/etc.

If `NVIDIA_API_KEY` is missing, `/health` still boots and reports setup help; `POST /api/generate` returns **503** with instructions (unless `GENBLAZE_DRY_RUN=1`).

**Judge demo:** pin `GENBLAZE_VIDEO_ENABLED=0` (Render blueprint already does). Demo FLUX stills → B2 only. With a local NVIDIA key and the flag unset, the Cosmos video section defaults **on** per CMM-NIM-Cosmos — disable explicitly for stills-only.

## Deploy (App URL)

### Render (preferred free path)

1. Push this repo (or connect the Git remote) to Render.
2. New **Web Service** → Docker → set **Root Directory** to `mrs/apps/genblaze-media` (or use the Blueprint `render.yaml` from that folder).
3. Set env vars (names above; values only in the dashboard — never commit).
4. Deploy. Service binds `0.0.0.0:$PORT` via the Dockerfile `CMD`.
5. Open the public `https://….onrender.com/` URL for judges; hit `/health` first (ensure `B2_PROBE_ON_HEALTH=0` so health checks do not ListObjects).

**Redeploy required:** code fixes do **not** apply live until you redeploy. After redeploy, confirm `/health` shows `nvidia_timeouts.nvcf_poll_seconds: 300`, `image_ingest_routes: true`, and inspect `nvidia_nim_status` / `nvidia_warmup`.

#### Empty NVIDIA 504 operator playbook

Live evidence on 2026-07-25: startup warmup itself returned `http_status: 504`,
and generate returned empty 504 after roughly 153–245 seconds. This points
primarily to NVIDIA gateway/NIM availability. Longer polling can reduce a
cold-start race, but cannot force an unavailable NIM to respond.

Try these in order:

1. Set `GENBLAZE_NVCF_POLL_SECONDS=300`; keep HTTP/NVCF timeout at `600` and
   pipeline timeout at `720`.
2. Keep Render warm with an external cron `GET /health` every 10–14 minutes,
   avoiding Render sleep on top of NIM cold start.
3. After a 504, wait 60 seconds and retry once manually.
4. Optionally set `GENBLAZE_EMPTY_504_RETRY=1` and
   `GENBLAZE_EMPTY_504_RETRY_DELAY=60`. This may double-bill if the first
   invocation eventually completed.
5. Verify the same key can invoke
   [FLUX.1-schnell on build.nvidia.com](https://build.nvidia.com/black-forest-labs/flux_1-schnell).
6. `GENBLAZE_DRY_RUN=1` proves the app/B2 path while NIM is down, but is not a
   live generation demo.

The app has no `prefer_async` switch. Genblaze polls NVCF only after NVIDIA
returns `202 + NVCF-REQID`. The existing fal/Seedance integration is
video-only; no secondary fal image backend is currently wired. For a
**local, no-API** still path that cannot empty-504, set
`GENBLAZE_IMAGE_BACKEND=rt4d` (requires Node + renderer-core; see RT4D
section above). Optional `GENBLAZE_IMAGE_FALLBACK_TO_RT4D=1` falls back from
NVIDIA failures to that same deterministic renderer.

**Recommended Render env (dashboard → Environment):**

| Variable | Suggested | Notes |
| --- | --- | --- |
| `GENBLAZE_NVCF_POLL_SECONDS` | `300` | NVIDIA maximum; longer sync hold gives NVCF more time to return 202 |
| `GENBLAZE_HTTP_TIMEOUT` | `600` | Must stay ≥ poll + 30 (app floors this) |
| `GENBLAZE_NVCF_TIMEOUT` | `600` | NVCF poll wait after 202 |
| `GENBLAZE_PIPELINE_TIMEOUT` | `720` | Genblaze pipeline ceiling |
| `GENBLAZE_EMPTY_504_RETRY` | leave unset / `0` | Opt in `1` only if you accept a possible second NIM charge after empty 504 |
| `GENBLAZE_EMPTY_504_RETRY_DELAY` | `45`–`60` | Used only when empty-504 retry is on |
| `GENBLAZE_NVIDIA_WARMUP_ON_STARTUP` | `1` | If warmup also returns 504, treat NIM as unavailable |
| `B2_PROBE_ON_HEALTH` | `0` | Keep off so Render health checks do not ListObjects |

Production image installs from `requirements-docker.txt`, then overlays `Pillow==12.3.0` with `pip install --no-deps` so the CVE pin is not blocked by `genblaze-core==0.3.7`’s declared `pillow<12` (modern pip cannot satisfy both in one resolve). Redeploy after merge for the pin to take effect on Render.

Free tiers may cold-start; first generate can take longer than subsequent ones. An empty NVIDIA `504` with `{"_raw":""}` is an **upstream gateway** failure — credentials and B2 can still be fine. **Do not claim live Render generate is fixed until redeploy + a successful `POST /api/generate`.**

### Railway / Fly

Same Docker image: set the env vars, expose `$PORT`, health path `/health`.

## Verify

```bash
pip install --use-deprecated=legacy-resolver -r requirements.txt
pytest -q
# live process
uvicorn app.main:app --host 127.0.0.1 --port 8787
curl -s http://127.0.0.1:8787/health
```

With **valid** B2 keys (no NVIDIA): `/health` reports `b2_configured` without listing by default. To list under the storage prefix once, set `B2_PROBE_ON_HEALTH=1` briefly, then turn it off. With NVIDIA + B2: one `POST /api/generate`, then prefer a local download / saved presigned URL over repeated `npm run b2:list` (lists burn Class C).

### Known operator pitfalls (evidence-bound)

| Issue | What we observed / expect |
| --- | --- |
| `InvalidAccessKeyId` on ListObjects | B2 key ID / application key in `.env` rejected by the S3 API — refresh a **non-master** bucket-scoped key |
| Genblaze `HeadBucket` 403 | Common with bucket-scoped keys; this app skips that preflight when `B2_REGION` is set |
| NIM generate timeout | `NVCF-POLL-SECONDS` + longer HTTP read (defaults **180 / 600**; Render **300 / 600**) allow cold starts to return 202 and then poll |
| `NVIDIA image generate failed (504): {"_raw": ""}` | Upstream gateway returned no diagnostic body. If warmup also returns 504, `/health.nvidia_nim_status` reports unavailable. Raise poll to 300, wait and retry once, or opt into delayed retry with double-bill risk. No fal image fallback is wired. |
| `asset transfer(s) failed; manifest was not uploaded` | NVIDIA FLUX returns base64; Genblaze writes `file://` under CWD (`/app` in Docker). `AssetTransfer` only allowlists system temp — transfer fails and SinkError omits the cause. Fix: write NVIDIA payloads under `tempfile` + surface underlying transfer exception in the API detail |
| Solid black / empty JPEG after “success” | Observed: valid ~6 KiB 1024² JPEG, mean luminance 0, one color — common when FLUX.1-schnell NIM blanks photoreal-people prompts. Pipeline rejects near-black stills with HTTP **422**, strips trailing meta-commentary, optionally retries once with an abstract geometry rewrite (`GENBLAZE_ABSTRACT_RETRY`, default on), and best-effort deletes the rejected B2 asset/manifest |
| Broken image icon / preview errors after successful generate | Metadata + B2 keys exist, but browser GET of the private presigned URL returns **AccessDenied: Transaction cap exceeded** (B2 free-tier daily caps). Fix: serve UI from same-origin `/api/preview/{run_id}` local cache after generate; wait for Caps & Alerts reset (~00:00 GMT) before more B2 traffic |
| Cosmos 2.0 model-not-found | Operator catalog probe reported `nvidia/cosmos-2.0-diffusion-text2world` as `DEAD`; it is not available in the probed upstream NVCF catalog. Use `nvidia/cosmos-1.0-7b-diffusion-text2world`, or the `nvidia/cosmos-1.0-12b-diffusion-text2world` fallback when available on the key. The live path refreshes model validation before generation. |
| `GENBLAZE_DRY_RUN=1` | Offline unit-test path only — not for Devpost live demos |
## API sketch

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | Boots always; NVIDIA/B2/RT4D flags; ListObjects probe only if `B2_PROBE_ON_HEALTH=1` |
| POST | `/api/generate` | Live Genblaze FLUX→B2 (default), or RT4D when `GENBLAZE_IMAGE_BACKEND=rt4d`; 503 if the selected backend is not configured |
| POST | `/api/generate-video` | Selected Cosmos or Seedance backend → B2; 503 if disabled or its credential is missing |
| GET | `/api/assets` | Local recent index (capped); optional `?modality=image\|video` |
| GET | `/media/stills` · `/media/nvidia` · `/media/nim-cosmos` | 302 into SPA hash anchors |
| GET | `/` | Single-page UI (stills; Cosmos section hidden unless video enabled) |
| GET | `/cros` | Static CROS reference page (CI-001…006, lineage, replay profiles). **Docs only** — no `cros` import, no validation |

## CROS reference page (`/cros`)

Read-only page describing [`mrs/packages/cros`](../../packages/cros) — the six constitutional
invariants, the seven-artifact lineage chain, and the two conformance profiles
(`cros.dcc-offline` **declared** / `cros.gen-ai-nim` **skeleton**).

| Concern | Honest status |
| --- | --- |
| What it is | Hand-maintained static mirror of the CROS package status tables, served by this host |
| CROS runtime | **Absent** — `runtimeStatus: absent`; all six invariants are at most **partial** (caller-invoked validators) |
| This app implementing CROS | **Not claimed.** `app/` does not import `cros`; CI-006 bans coupling in both directions |
| Story Forge | **None.** `story_forge` / `storyforge` imports are banned and scanned in CROS |
| Source of truth | The package files, not this page — verify against `mrs/packages/cros/constitution/invariants.json` |

## NIM Cosmos Video Path (CMM-NIM-Cosmos)

Parallel Genblaze/NIM text-to-video path (`app/pipeline_video.py`) on the same site as FLUX stills. **No Story Forge lineage.** When `GENBLAZE_VIDEO_ENABLED` is unset, video defaults **on** if `NVIDIA_API_KEY` is present (plan default). Pin `0` for stills-only. Constitutional docs under `docs/constitutional/` are **declared**, not runtime-enforced (JCR/CEL/Arena/Sovereign IDE are not hosted here).

| Concern | Honest status |
| --- | --- |
| Default | Unset + NVIDIA key → video **on**; unset + no key → **off**; explicit `0`/`1` overrides |
| Live generate | Requires video enabled, `NVIDIA_API_KEY`, **and** Cosmos model access on that key (probe may be DEAD) |
| Default model | `nvidia/cosmos-1.0-7b-diffusion-text2world`; optional fallback `nvidia/cosmos-1.0-12b-diffusion-text2world` when the upstream probe confirms access |
| Timeouts | Video defaults are higher than FLUX (see `.env.example`); first hit after Render/NIM idle can still feel slow |
| NVCF cold-start | Cosmos is often **slower than FLUX** on cold start even with 600s+ timeouts — expect longer first-request latency; keep the browser tab open |
| B2 cost | Larger mp4 objects burn more **Class C** (list/download) traffic than stills |
| Render | Blueprint sets `GENBLAZE_VIDEO_ENABLED=0`; ephemeral disk + cold starts apply |
| Optional meta | `duration_seconds` / `resolution` only when the provider payload reports them (never invented) |
| Docs | `docs/constitutional/CMM-NIM-Cosmos-v1.0.md`, `CH-GNMD-v1.0.md`, `ACP-NIM-Cosmos-v1.0.md` (ACP stages = roadmap only) |

## Seedance 2.0 cloud video path

Set `GENBLAZE_VIDEO_BACKEND=seedance`, `GENBLAZE_VIDEO_ENABLED=1`, and
`FAL_KEY` to use ByteDance Seedance 2.0 through the fal.ai gateway. This is an
operator opt-in cloud path: no local GPU is required, but **fal API usage is
billed**. Do **not** treat this as Dreamina / Jimeng / CapCut consumer free
credits — those are separate product surfaces (see
[`docs/constitutional/CMM-Seedance-v1.0.md`](./docs/constitutional/CMM-Seedance-v1.0.md)).

| Concern | Honest status |
| --- | --- |
| Default resolution | `720p` |
| Free fal access | **Not claimed** |
| Watermark / 1080p | Gateway/account-dependent — **not guaranteed** |
| Temporal layers → 4DRS | **Declared** only — [`docs/SEEDANCE_TEMPORAL_LAYERS.md`](./docs/SEEDANCE_TEMPORAL_LAYERS.md) |
| CROS adapter | Live HTTP lives here; `mrs/packages/cros` `adapters/seedance.py` is **skeleton** only |

The path emits model ID, prompt hash, provider request ID, asset SHA-256, and
provider-contract replay metadata before persisting the clip and manifest to B2.

## Cross-links

- Operator B2 notes: [`docs/ops/BACKBLAZE_B2_S3.md`](../../../docs/ops/BACKBLAZE_B2_S3.md)
- **Free-tier / Class C demo day:** [`docs/ops/B2_FREE_TIER_DEMO_PLAYBOOK.md`](../../../docs/ops/B2_FREE_TIER_DEMO_PLAYBOOK.md)
- Genblaze media v2 (**ops roadmap**): [`docs/ops/GENBLAZE_MEDIA_V2_ROADMAP.md`](../../../docs/ops/GENBLAZE_MEDIA_V2_ROADMAP.md)
- Scorecard: [`docs/scorecards/genblaze-media.md`](../../../docs/scorecards/genblaze-media.md)
- Seedance constitution (**declared**): [`docs/constitutional/CMM-Seedance-v1.0.md`](./docs/constitutional/CMM-Seedance-v1.0.md)
- Seedance env fragment: [`env.seedance.example`](./env.seedance.example)
- CROS package (separate; not implemented by this app): [`mrs/packages/cros`](../../packages/cros)
- Node B2 scaffold: [`mrs/packages/storage-b2`](../../packages/storage-b2)
- Genblaze upstream: https://github.com/backblaze-labs/genblaze
- Local shallow clone (reference only, gitignored): `vendor/genblaze` — see `examples/b2_storage_pipeline.py`

## Operator portals (Nova Cortex / Gates of Wonder / RSL)

Removed from the judge-facing UI (separate Lawful Nova stack — not part of this MVP).

## NVIDIA embeddings

Live generates optionally call `nvidia/nv-embedcode-7b-v1` (`POST /v1/embeddings`) so prompts can be semantic-searched via `POST /api/search`. This is an **embedding** model, not a chat LLM and not FLUX.

## License

Same as the parent repository (MIT) for this app’s own files; Genblaze packages are MIT per upstream.
