# MRS Genblaze Media (Backblaze hackathon MVP)

Thin **FastAPI** service: user prompt → **Genblaze** (`genblaze-nvidia` + `genblaze-s3`) → **Backblaze B2** assets + SHA-256 provenance manifest → simple UI with presigned previews.

| Dimension | Status (Drive-G-1) |
| --- | --- |
| Product story | **Declared:** provenanced *concept* stills for MRS / 4D scene authoring |
| Genblaze 4D render | **Not claimed** — Genblaze's NVIDIA path generates 2D (NIM FLUX); MRS remains the 4D renderer |
| RT4D image backend | **Prepared** — `GENBLAZE_IMAGE_BACKEND=rt4d` shells out to renderer-core `render-still.mjs` for deterministic procedural 4D stills (NOT text-to-image). Requires Node; the **repo-root** Dockerfile bundles Node 22 + renderer-core; the app-local one cannot. Live Render RT4D is only verified after Manual Deploy + `/health.rt4d.available: true` |
| Image → SceneSpecification | **Prepared** — `POST /api/image-to-scene` interprets a still (NIM vision or heuristic) into SceneSpecification, then MRS path-traces a full frame. **Not** geometric reconstruction / photogrammetry |
| Engine3D structure → polish | **Prepared** — `POST /api/engine3d-still` soft-rasters Engine3D triangles (beauty + depth/normal), optional RT4D background composite, optional fal FLUX img2img polish. Faces/skin = polish, not RT4D sphere-bridge |
| Media look lane (`style=anime`) | **Partial** — preferred **Constitutional Anime Rendering** entry point (`GENBLAZE_STYLE=anime` / API `"style":"anime"` steers FLUX / Lemonade / polish). `AnimeWorldProfile` v1.0 validator is **partial**; shot CKL enforcement **declared**. Pipeline CLI: `python -m app.constitutional_anime_render` / `npm run render:constitutional-anime`. Lane lock: structure vs beauty (`LANE_LOCK.md`). Not Full Photoreal. Trail: `docs/governance/cecp/trails/constitutional-anime-rendering-2026-07/` |
| Hackathon demo cache (B2) | **Partial** — pre-render CLI `python -m app.pre_render` → B2 `{prefix}/demo-cache/{shot}/fNNNN/`; live `GENBLAZE_DEMO_CACHE=1` / `demo_cache=true` serves `source:b2-cache` with fail-closed `structure-only` on miss. Provider cascade: GMI → fal → nvidia → hfspace. Ops: `docs/ops/HACKATHON_DEMO_CACHE_B2.md`. Trail: `docs/governance/cecp/trails/hackathon-demo-cache-b2-2026-08/` |
| Engine3D short cinematic sequence | **Prepared** — `POST /api/engine3d-sequence` soft-rasters a short orbit clip (structure AOVs). NOT 8K farm; NOT per-frame polish. See `docs/4d-engine/engine3d/ENGINE3D_CINEMATIC_FOUNDATION_v1.0.md` |
| Prompt → SceneSpecification | **Prepared** — `POST /api/prompt-to-scene` shells out to prompt-scene-bridge for SceneSpecification + Engine3D world stub. Repo-root Docker **Prepared**/bundling **partial**: COPY → `/app/prompt-scene-bridge/` + `PROMPT_SCENE_BRIDGE_SCRIPT` / `ENGINE3D_EXPAND_SCRIPT` / `PROMPT_SCENE_EXPAND_WORLD=0` until Manual Deploy proves `/health.prompt_scene.available: true`. Optional `render=true` uses SceneSpecification → RT4D (**partial** when Node/script missing; do **not** claim live Render enforced). Infinity narrative lane is **out-of-process only** (banned under `app/*.py`). World geometry arrays remain a stub until expand (`PROMPT_SCENE_EXPAND_WORLD=1` opt-in) |
| ChatGPT / Custom GPT plugin | **Prepared** — `/.well-known/ai-plugin.json` + scoped `/plugin/openapi.json` for Engine3D stills. Classic Plugins storefront is **sunset**; use **Custom GPT Actions**. Optional `CHATGPT_PLUGIN_KEY` bearer |
| RT4D → NVIDIA vision | **Prepared** — `POST /api/rt4d-to-nvidia` sends a prior `run_id` PNG to NIM vision (`require_nvidia`). When the prior still's RT4D archetype is known (e.g. `tesseract-lattice`), the path biases `surfaceId` toward lattice/tesseract and expands `tesseract`/`lattice-grid` with beams+rings (not bare vertex/orbital blobs). **Not** img2img; fails clearly when key missing or NIM 5xx/504 |
| Operator deploy | **Prepared** — Dockerfile + `render.yaml` (Render free web) |
| Live NIM generate | **Requires** `NVIDIA_API_KEY` at runtime (default backend) |
| NIM Cosmos video (CMM-NIM-Cosmos) | **Prepared but off by default** (stills-only demo) — unset `GENBLAZE_VIDEO_ENABLED` defaults OFF (key or not); set `1` to re-enable UI + API. Cosmos catalog access is key-dependent; docs **declared** not enforced |
| Seedance 2.0 video (fal) | **Prepared** opt-in path (`GENBLAZE_VIDEO_BACKEND=seedance` + `FAL_KEY`); **fal API is billed** — not Dreamina/Jimeng free credits; default `720p`; watermark/1080p **not guaranteed**; temporal layers **declared** only |
| CROS (`/cros` page) | **Docs only** — static reference UI; this app does **not** implement or import CROS |
| B2 persistence | **Tests** path via `genblaze-s3` / dual-exported `B2_APP_KEY` |

## Product story (honest)

Operators type a prompt for a concept image. The **default** service calls NVIDIA NIM through Genblaze (`black-forest-labs/flux.1-schnell`), uploads the image and a Genblaze provenance manifest to a private B2 bucket, and returns object keys plus a **presigned GET** preview URL.

### Anime look lane (Constitutional Anime Rendering — preferred entry point)

Product thesis: hardware limits become design decisions; the engine produces
**governed stylization** (same character, palette, lighting, line, continuity).
Photoreal Cycles is an **optional** side path, not the apology baseline.
Profile contract: `schemas/anime/AnimeWorldProfile.v1.schema.json` (**partial** v1.0).
Render Constitution: `docs/governance/RENDER_CONSTITUTION_ANIME.md`.
Pipeline: `python -m app.constitutional_anime_render` (structure → painter|structure-only → provenance).

| Invoke | How |
| --- | --- |
| Env | `GENBLAZE_STYLE=anime` |
| API | `POST /api/generate` with `"style": "anime"` (also polish / engine3d-still) |
| CLI | `npm run render:constitutional-anime` or `python -m app.constitutional_anime_render` |
| Health | `GET /health` → `media_style.anime_status: "partial"` |

```bash
curl -s -X POST http://127.0.0.1:8787/api/generate \
  -H "content-type: application/json" \
  -d '{"prompt":"oracle mask grown from metallic mandala petals","style":"anime"}'
```

Status tag: **partial** (prompt + pipeline steering). Does **not** claim Full Photoreal. Digital Printer beauty SoT stays RT4D/Engine3D plates — NIM/FLUX anime stills remain creative assist.

Optionally, set `GENBLAZE_IMAGE_BACKEND=rt4d` to skip NVIDIA entirely and produce a **deterministic procedural 4D still** via the MRS `renderer-core` RT4D path tracer (keyword → scene archetype + palette; seed → camera/placement). That path is **not** text-to-image and does **not** claim photorealism or semantic image synthesis. Same prompt (same seed) → byte-identical PNG. It cannot 504 on an upstream generative API because there is none.

For **local AMD / Lemonade diffusion** (on-device concept stills, no NVIDIA bill), set `GENBLAZE_IMAGE_BACKEND=lemonade`. Genblaze calls Lemonade Server at `http://127.0.0.1:13305/api/v1` (override with `LEMONADE_BASE_URL`) using `SD-Turbo` by default. Receipts label the provider as `lemonade-local`. Install Lemonade from https://lemonade-server.ai , run `lemonade serve`, then `lemonade pull SD-Turbo` on first use.

This does **not** mean Genblaze's NVIDIA path renders 4D scenes.

### Digital Printer vs NIM (assist ≠ SoT)

`/printer/*` is the **Digital Printer** path: deterministic RT4D / scene-spec /
engine3d / proton plates under a normalized `PrintRequest` (CPU SoT). See
`mrs/adapters/storyforge-boundary/CONTRACT_DIGITAL_PRINT.md` and
`docs/governance/cecp/PRINTER_SERVICE_API.md`.

| Asset | Role | May be print beauty SoT? |
|-------|------|--------------------------|
| NIM FLUX / Cosmos / fal polish PNG | Creative assist / look-dev | **No** |
| NIM vision → SceneSpecification | Draft assist (human-validate) | **No** until declared SceneSpec + RT4D print |
| `/printer/print` beauty.png | Governed print plate | **Yes** (evidence + hashes) |

**Invariant:** no code path copies FLUX (or other GenAI) bytes into printer
`beauty.png` SoT. Sovereignty rejects smuggled `promptSpec` / `modelBackend`
bodies on print intake. Design:
`docs/superpowers/specs/2026-07-28-digital-printer-gpu-quality-speed-design.md`.

### Image → MRS scene (hackathon D path)

`POST /api/image-to-scene` accepts an uploaded still (`image_base64`), an ingest `id`, or a prior generate `run_id`, emits a **SceneSpecification** (NVIDIA NIM multimodal when `NVIDIA_API_KEY` is set; otherwise or on failure a **heuristic** builder), validates via Node SoT (`validate-scene-spec.mjs`), and by default path-traces a **full MRS frame** under `{prefix}/image-to-scene/{run_id}/`.

**Render quality (hackathon default = draft):** scene-spec / image-to-scene stills
default to `quality=draft` (aliases: `fast`) — typically **256×256**, **4 samples**,
**maxDepth 3**. Draft stills are intentionally **smaller and noisier** so judges
usually get a frame in tens of seconds on CPU instead of waiting minutes on the
old 448/20/5 path. Pass `quality=final` (alias: `high`) — or set
`GENBLAZE_RENDER_QUALITY_DEFAULT=final` — for the `RT4D_*` profile (code/default
and `render.yaml` pin **256×256 / 6–8 samples / depth 5**; raise only after
measuring). `/api/generate` also applies a **deploy-safe CPU budget clamp**
(≤256 / ≤8 spp; dense `tesseract-lattice` ≤6 spp) unless `RT4D_ALLOW_HEAVY=1`,
so an unsynced Render env cannot silently request 448/20. Draft mode **caps**
larger `spec.output` values before the subprocess so NIM/heuristic specs cannot
force a multi-minute render on the default path. This does **not** claim GPU
acceleration, photorealism, or sub-second renders.

Honest copy: **scene interpretation + path-traced full frame**. Responses include `analysis_mode` / `note` stating this is **not** geometric reconstruction. Phase 3 depth/mesh/pose recovery is **declared roadmap only** (see `docs/4d-engine/v2/scene-spec/IMAGE_TO_SCENE_RFC.md`).

Pass `"require_nvidia": true` on `/api/image-to-scene` to forbid the silent heuristic fallback (missing key → **503**, NIM 5xx/504 → **502** with `nvidia_unavailable: true`; the source still is unchanged).

#### Structure still → AI polish (img2img diffusion cleanup)

`POST /api/polish-still` applies **diffusion img2img** (fal.ai FLUX by default) to a prior
generate/RT4D `run_id`. The structure pass stays as the MRS RT4D path trace; the AI model
refines materials, contrast, and noise. This is **not** geometric reconstruction and does
**not** claim MRS rendered the final pixel values.

```bash
curl -s -X POST http://127.0.0.1:8787/api/polish-still \
  -H "content-type: application/json" \
  -d '{"run_id":"<prior-uuid>","prompt":"enhance materials, add dramatic lighting","strength":0.45}'
```

**Two distinct actions:** operators have three separate tools:
- **Generate RT4D** — structure still
- **Polish** — same pixels, diffusion cleanup (img2img)
- **NIM interpret** — new SceneSpec + MRS still (vision, not img2img)

**Recommended strength:** 0.35–0.55 for abstract/lattice scenes so the geometry stays
readable. Higher strength may erase the lattice structure. Server-side caps are applied
when the source scene is `tesseract-lattice`.

**Config:** set `GENBLAZE_POLISH_ENABLED=1` and `FAL_KEY` (fal.ai, also used for Seedance
video). The provider is fal.ai FLUX image-to-image; NVIDIA NIM is attempted first when
`GENBLAZE_POLISH_BACKEND=auto` (default) or `=nvidia`, but NIM FLUX may be T2I-only on
your key.

**Billing:** each polish call consumes a separate fal.ai API invocation (or NVIDIA NIM
call). Documented in the response `manifest.polish_provider` field.

**One-shot generate:** pass `"then_polish": true` on `POST /api/generate` to produce both
the structure still and a polished version in one call. Optional `polish_prompt` and
`polish_strength` control the polish step independently.

### Engine3D structure → polish (+ optional RT4D background)

`POST /api/engine3d-still` soft-rasters Engine3D triangles (demo portrait meshes or
optional HumanRig GLB) into a beauty PNG with optional depth/normal AOVs. Pass
`rt4d_background_run_id` to composite the subject over a prior RT4D lattice/mandala
still. Pass `polish: true` + `prompt` to run the existing fal FLUX img2img polish path.

```bash
# Build engine3d-core once:
#   cd mrs/packages/engine3d-core && npm run build

curl -s -X POST http://127.0.0.1:8787/api/engine3d-still \
  -H "content-type: application/json" \
  -d '{"width":256,"height":256,"polish":true,"prompt":"cinematic portrait, detailed skin","polish_strength":0.45}'
```

Honest scope: Engine3D owns subject **geometry**; polish owns skin/hair realism;
RT4D owns mandala/lattice **backgrounds** only. Do not route head meshes through
the SceneBridge hypersphere path for portraits. See
`docs/4d-engine/engine3d/ENGINE3D_CONSTITUTIONAL_SUITE_v1.0.md`.

Requires Node + built `engine3d-core` (`/health.engine3d_still.available`).
Docker (repo-root Dockerfile) builds and smokes this path.

### Engine3D short cinematic sequence

`POST /api/engine3d-sequence` evaluates a short orbit timeline and soft-rasters
structure frames. Preview is the first `*_final.png`. Not an 8K render farm;
per-frame polish is intentionally out of scope here (use still + polish).

```bash
curl -s -X POST http://127.0.0.1:8787/api/engine3d-sequence \
  -H "content-type: application/json" \
  -d '{"width":64,"height":48,"duration":0.5,"fps":4}'
```

See `docs/4d-engine/engine3d/ENGINE3D_CINEMATIC_FOUNDATION_v1.0.md`.

### ChatGPT / Custom GPT Actions (Engine3D plugin)

ChatGPT no longer installs third-party **Plugins** from a storefront. The same
manifest + OpenAPI pattern still works for **Custom GPT → Actions**:

1. Expose Genblaze over HTTPS (Render or `ngrok http 8787`).
2. Optionally set `GENBLAZE_PUBLIC_BASE_URL=https://<host>` and
   `CHATGPT_PLUGIN_KEY=<long-random>` (bearer on Engine3D routes).
3. Set `GENBLAZE_CORS_ALLOW_ALL=1` if Actions need browser CORS (explicit;
   `CHATGPT_PLUGIN_KEY` does **not** auto-enable CORS).
4. In Custom GPT Actions, import:
   `https://<host>/plugin/openapi.json`
5. Discovery (optional): `https://<host>/.well-known/ai-plugin.json`

Honest limits in the tool description: soft-raster max **1024px**, RT4D is
**background-only**, polish needs `GENBLAZE_POLISH_ENABLED` + `FAL_KEY`. Response
shape is `{ structure, polish?, composite?, note }` with `preview_url` — not a
flat map of filesystem paths.

### RT4D still → NVIDIA (NIM vision)

`POST /api/rt4d-to-nvidia` takes a prior generate `run_id` (local preview or B2), sends that PNG to **NVIDIA NIM vision** (`GENBLAZE_IMAGE_TO_SCENE_MODEL`, default `meta/llama-3.2-11b-vision-instruct` at `GENBLAZE_IMAGE_TO_SCENE_CHAT_URL`), and optionally re-renders an MRS frame. This reuses the image→scene path with `require_nvidia=true`.

**Honest scope:** NIM **vision → SceneSpecification**, not FLUX img2img enhancement. No img2img endpoint is wired in this app (`/health.rt4d_to_nvidia.img2img_wired: false`). Keep `GENBLAZE_IMAGE_BACKEND=rt4d` as the base renderer; NVIDIA is an **additional** interpret step.

Requires `NVIDIA_API_KEY`. When the key is missing or NIM returns 5xx/504, the API reports NVIDIA unavailable and the RT4D still remains usable.

Dual FLUX + MRS: set `GENBLAZE_FLUX_THEN_SCENE=1` or pass `"then_scene": true` on `POST /api/generate`. The FLUX concept still is **kept**; the MRS frame is returned alongside under `then_scene` with separate modality/provider labels (draft quality by default).

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
| `GENBLAZE_VIDEO_ENABLED` | unset → **off** (stills-only demo default, even with `NVIDIA_API_KEY` set); set `1` to re-enable video UI + API. Render blueprint also pins `0` |
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
| `GENBLAZE_IMAGE_BACKEND` | default `nvidia`; set `rt4d` (aliases: `renderer`, `mrs`) for the deterministic RT4D renderer backend; set `lemonade` (aliases: `local`, `amd`) for local Lemonade Server diffusion |
| `LEMONADE_BASE_URL` | optional; default `http://127.0.0.1:13305/api/v1` |
| `GENBLAZE_LEMONADE_MODEL` | optional; default `SD-Turbo` when backend is lemonade |
| `GENBLAZE_LEMONADE_SIZE` / `GENBLAZE_LEMONADE_STEPS` / `GENBLAZE_LEMONADE_TIMEOUT` | optional; defaults `512x512` / `4` / `600` |
| `LEMONADE_API_KEY` | optional; only if the local Lemonade server requires auth |
| `GENBLAZE_IMAGE_FALLBACK_TO_RT4D` | default **off** — set `1` so a blank/504 NVIDIA still falls back to one RT4D render instead of surfacing the failure |
| `RT4D_NODE_PATH` | optional; default `node` |
| `RT4D_SCRIPT_PATH` | optional; default `<repo>/mrs/packages/renderer-core/scripts/render-still.mjs` |
| `RT4D_RENDER_WIDTH` / `RT4D_RENDER_HEIGHT` | optional; default `256` / `256` (clamped 16–1024) — used as the **final** quality profile |
| `RT4D_SAMPLES` / `RT4D_MAX_DEPTH` | optional; default `8` / `5` — **final** quality profile (Render blueprint pins `6`) |
| `RT4D_TIMEOUT` | optional; default `180` seconds (clamped 10–600) |
| `RT4D_ALLOW_HEAVY` | default **off** — set `1` to skip the deploy-safe / dense-scene sample ceilings on `/api/generate` |
| `GENBLAZE_RENDER_QUALITY_DEFAULT` | optional; default `draft` (aliases: `fast`). Set `final` / `high` to default to the RT4D_* profile |
| `RT4D_DRAFT_WIDTH` / `RT4D_DRAFT_HEIGHT` | optional; default `256` / `256` — draft quality caps |
| `RT4D_DRAFT_SAMPLES` / `RT4D_DRAFT_MAX_DEPTH` | optional; default `4` / `3` — draft quality caps |
| `GENBLAZE_IMAGE_TO_SCENE_MODEL` | optional; default `meta/llama-3.2-11b-vision-instruct` (NIM vision-capable slug) |
| `GENBLAZE_IMAGE_TO_SCENE_CHAT_URL` | optional; default `https://integrate.api.nvidia.com/v1/chat/completions` |
| `GENBLAZE_IMAGE_TO_SCENE_TIMEOUT` | optional; default `120` seconds |
| `GENBLAZE_FLUX_THEN_SCENE` | default **off** — set `1` so successful `/api/generate` stills also run image→scene→MRS (returns both assets) |
| `GENBLAZE_POLISH_ENABLED` | default **off** — set `1` to enable `/api/polish-still` diffusion img2img path |
| `GENBLAZE_POLISH_MODEL` | optional; default `fal-ai/flux/dev/image-to-image` (fal.ai). For NVIDIA NIM: `black-forest-labs/flux.1-schnell` |
| `GENBLAZE_POLISH_DEFAULT_STRENGTH` | optional; default `0.45` (clamped 0.0–1.0). Lower for structure preservation |
| `GENBLAZE_POLISH_BACKEND` | optional; `auto` (default — try NVIDIA then fal), `fal`, or `nvidia` |
| `FAL_KEY` | fal.ai API key for img2img polish (also used for Seedance video). Required when `GENBLAZE_POLISH_BACKEND=fal` or `auto` |
| `ENGINE3D_STILL_ENABLED` | default **on** — set `0` to disable `/api/engine3d-still` |
| `ENGINE3D_STILL_SCRIPT_PATH` | optional; default `…/engine3d-core/scripts/render-engine3d-still.mjs` |
| `ENGINE3D_STILL_TIMEOUT` | optional; default `120` seconds |
| `PROMPT_SCENE_BRIDGE_ENABLED` | default **on** — set `0` to disable `/api/prompt-to-scene` |
| `PROMPT_SCENE_BRIDGE_SCRIPT` | optional; default monorepo `…/prompt-scene-bridge/run_bridge.py`, then Docker `/app/prompt-scene-bridge/run_bridge.py` |
| `PROMPT_SCENE_BRIDGE_PYTHON` | optional interpreter for the bridge subprocess |
| `PROMPT_SCENE_BRIDGE_TIMEOUT` | optional; default `90` seconds (clamped 10–300) |
| `PROMPT_SCENE_EXPAND_WORLD` | default **off** (`0`) — set `1` to expand Engine3D generator stubs via Node (opt-in; image ENV pins `0`) |
| `ENGINE3D_EXPAND_SCRIPT` | optional; default monorepo expand CLI, then Docker `/app/engine3d-core/scripts/expand-world-document.mjs` |
| `INFINITY_STORY_SRC` / `PROMPT_SCENE_INFINITY_SRC` | optional Infinity lane source on bridge worker `PYTHONPATH` (never imported under `app/`) |
| `SCENE_SPEC_SCRIPT_PATH` | optional; default resolves `<repo>/mrs/packages/renderer-core/scripts/render-scene.mjs`, then the Docker layout `/app/renderer-core/scripts/render-scene.mjs` |
| `VALIDATE_SCENE_SPEC_SCRIPT_PATH` | optional; default resolves `<repo>/mrs/packages/renderer-core/scripts/validate-scene-spec.mjs`, then the Docker layout `/app/renderer-core/scripts/validate-scene-spec.mjs` |
| `SCENE_SPEC_SCRIPT_PATH` | optional; default `…/render-scene.mjs` |
| `VALIDATE_SCENE_SPEC_SCRIPT_PATH` | optional; default `…/validate-scene-spec.mjs` |

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
| Deployed Render service | Treat live `/health.rt4d.available: true` (after Manual Deploy from the repo-root Dockerfile) as the only evidence. Older / app-local images report `false` even with env set |
| HTTP errors (RT4D) | Missing Node/script → **503** (setup). CLI crash / timeout / empty PNG → `RT4DRenderError` → **502** (generation). Covered by `tests/test_rt4d.py` (PR #40) |
| Prompts starting with `--` | Accepted — value is passed as `--prompt`'s argument (not re-parsed as flags) |

### What changed (operator pointer)

| Landed | Notes |
| --- | --- |
| **Merged** (#39) | Repo-root Docker image bundles Node + `renderer-core`; do **not** expect RT4D from the app-local Dockerfile |
| **PR #40** (open on this branch) | 502 vs 503 split for RT4D failures; prompts whose text starts with `--` |
| Health `rt4d_note` | Describes the procedural path; **`rt4d.available`** is authoritative for whether this running image has Node + script (not a “Node missing from Docker” claim — root Dockerfile includes it) |

Monorepo summary: [`mrs/README.md`](../../README.md) → Operator changelog.
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

### Image → MRS scene (curl)

```bash
# Heuristic interpret + MRS full-frame render (no NIM vision required)
curl -s -X POST http://127.0.0.1:8787/api/image-to-scene -H "content-type: application/json" -d "{\"image_base64\":\"<base64 or data-url>\",\"render\":true,\"force_heuristic\":true}"

# Prior RT4D/generate still → NVIDIA NIM vision (requires NVIDIA_API_KEY; no heuristic fallback)
curl -s -X POST http://127.0.0.1:8787/api/rt4d-to-nvidia -H "content-type: application/json" -d "{\"run_id\":\"<uuid>\",\"render\":true,\"quality\":\"draft\"}"

# Dual FLUX concept + MRS frame (keeps both)
curl -s -X POST http://127.0.0.1:8787/api/generate -H "content-type: application/json" -d "{\"prompt\":\"neon lattice\",\"embed\":false,\"then_scene\":true}"
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
  — the whole `scripts` and `src` trees, so `render-still.mjs`,
  `render-scene.mjs`, `validate-scene-spec.mjs`, and `src/scene-spec/**` all
  land in the image.
- ENV pins the three CLIs to the copied layout:
  `RT4D_SCRIPT_PATH=/app/renderer-core/scripts/render-still.mjs`,
  `SCENE_SPEC_SCRIPT_PATH=/app/renderer-core/scripts/render-scene.mjs`,
  `VALIDATE_SCENE_SPEC_SCRIPT_PATH=/app/renderer-core/scripts/validate-scene-spec.mjs`.
  These are belt-and-suspenders: `config.py` already resolves the Docker layout
  (`/app/renderer-core/scripts/<name>`) when the monorepo path is absent, so
  scene-spec / image-to-scene work in the repo-root image without operators
  setting any override.
- Two build-time smokes run: a 64×64/1-sample `render-still` render **and** a
  32×32/1-sample `render-scene` render (from a minimal SceneSpecification), so a
  broken Node layer or a missing scene-spec import fails the build instead of
  surfacing as a runtime 503/502.
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
must still finish inside `RT4D_TIMEOUT`. `render.yaml` therefore pins
`RT4D_RENDER_WIDTH/HEIGHT=256`, `RT4D_SAMPLES=6`, and `RT4D_TIMEOUT=180` (dense
`tesseract-lattice` ≈ 540 objects). **After merging env changes, sync the
Render blueprint / dashboard env and Manual Deploy** — a code-only redeploy
leaves stale `RT4D_*` values. Code also hard-clamps Generate stills unless
`RT4D_ALLOW_HEAVY=1`. Time a lattice prompt on the target plan before raising
samples.

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
curl -s localhost:8000/health | python -m json.tool   # expect rt4d.available AND scene_spec.available true
curl -s localhost:8000/health | python -m json.tool   # expect rt4d.available true
curl -s -X POST localhost:8000/api/generate \
  -H 'content-type: application/json' \
  -d '{"prompt":"cyan tesseract lattice","embed":false}'
```

Sizing: the render is a single-threaded CPU path trace, and Render's free plan
is a shared 0.1 CPU, so a render there is far slower than on a dev machine and
must still finish inside `RT4D_TIMEOUT`. `render.yaml` therefore pins
`RT4D_RENDER_WIDTH/HEIGHT=256`, `RT4D_SAMPLES=6`, and `RT4D_TIMEOUT=180`.
**Sync the Render blueprint/env after merge.** Code hard-clamps Generate stills
unless `RT4D_ALLOW_HEAVY=1`. Time a lattice prompt on the target plan before
raising samples.

A live Render service still reports `/health.rt4d.available=false` until it is
**Manually Deployed** from the **repo-root** Dockerfile (older images and the
app-local image have no Node). Do not treat dashboard env alone as proof —
confirm `rt4d.available: true` on the live URL before claiming RT4D works.

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

**Judge demo:** stills-only is the **default** — video is off when `GENBLAZE_VIDEO_ENABLED` is unset, even with an NVIDIA key. Demo FLUX stills → B2 only. The video API/pipeline stays in place; set `GENBLAZE_VIDEO_ENABLED=1` to bring the Cosmos video UI + API back later.

## Deploy (App URL)

### Render (preferred free path)

1. Push this repo (or connect the Git remote) to Render.
2. New **Web Service** → Docker:
   - **NVIDIA stills only:** Root Directory `mrs/apps/genblaze-media` (app-local Dockerfile; no RT4D).
   - **RT4D / Node bundled:** Root Directory **empty**, Dockerfile Path `./Dockerfile` (repo root). The app-local context cannot reach `mrs/packages/renderer-core`.
3. Set env vars (names above; values only in the dashboard — never commit). For RT4D set `GENBLAZE_IMAGE_BACKEND=rt4d`.
4. Deploy. Service binds `0.0.0.0:$PORT` via the Dockerfile `CMD`.
5. Open the public `https://….onrender.com/` URL for judges; hit `/health` first (ensure `B2_PROBE_ON_HEALTH=0` so health checks do not ListObjects). For RT4D, require `rt4d.available: true` before claiming it works.

**Redeploy required:** code fixes do **not** apply live until you redeploy. After redeploy, confirm `/health` shows `nvidia_timeouts.nvcf_poll_seconds: 300`, `image_ingest_routes: true`, and inspect `nvidia_nim_status` / `nvidia_warmup`.

#### Empty NVIDIA 504 operator playbook

Live evidence on 2026-07-25: startup warmup itself returned `http_status: 504`,
and generate returned empty 504 after roughly 153–245 seconds. This points
primarily to NVIDIA gateway/NIM availability. Longer polling can reduce a
cold-start race, but cannot force an unavailable NIM to respond.

**Top-down check order** (skill-inspired: collect evidence before changing
knobs — mirrors layered troubleshoot discipline; this is **Genblaze NIM**, not
Dynamo/K8s):

1. `/health` → `nvidia_configured`, `nvidia_nim_status`, `nvidia_timeouts`,
   `nvidia_warmup` (do not claim NIM live without these).
2. Env: `NVIDIA_API_KEY` present; `GENBLAZE_DRY_RUN` off for real generates.
3. Timeouts / NVCF poll (below) before retry storms.
4. Gateway availability (empty 504) vs app bug — prefer wait+manual retry over
   silent double-bill (`GENBLAZE_EMPTY_504_RETRY` default **off**).
5. Only then consider abstract-retry / model slug changes.

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

Production image installs from `requirements-docker.txt`, then overlays `Pillow==12.3.0` with `pip install --no-deps` so the CVE pin is not blocked by `genblaze-core==0.3.8`’s declared `pillow<12` (modern pip cannot satisfy both in one resolve). The current split-package upgrade target is `genblaze-core==0.3.8`, `genblaze-s3==0.3.6`, and `genblaze-nvidia==0.3.3`; redeploy after merge for those pins to take effect on Render.

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
| RT4D `503` (setup) | `node` or `render-still.mjs` missing on this image — use repo-root Dockerfile + Manual Deploy, or local Node 18+ + monorepo checkout |
| RT4D `502` (generation) | Node/script present but CLI crashed, timed out, or wrote empty/missing PNG (`RT4DRenderError`) — inspect detail; not fixed by env alone |
| RT4D prompt starts with `--` | Supported; string is the prompt value, not extra CLI flags |
| Broken image icon / preview errors after successful generate | Metadata + B2 keys exist, but browser GET of the private presigned URL returns **AccessDenied: Transaction cap exceeded** (B2 free-tier daily caps). Fix: serve UI from same-origin `/api/preview/{run_id}` local cache after generate; wait for Caps & Alerts reset (~00:00 GMT) before more B2 traffic |
| Cosmos 2.0 model-not-found | Operator catalog probe reported `nvidia/cosmos-2.0-diffusion-text2world` as `DEAD`; it is not available in the probed upstream NVCF catalog. Use `nvidia/cosmos-1.0-7b-diffusion-text2world`, or the `nvidia/cosmos-1.0-12b-diffusion-text2world` fallback when available on the key. The live path refreshes model validation before generation. |
| `GENBLAZE_DRY_RUN=1` | Offline unit-test path only — not for Devpost live demos |
## API sketch

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | Boots always; NVIDIA/B2/RT4D flags; `image_to_scene` probe; ListObjects probe only if `B2_PROBE_ON_HEALTH=1` |
| POST | `/api/generate` | Live Genblaze FLUX→B2 (default), or RT4D when `GENBLAZE_IMAGE_BACKEND=rt4d`; optional `then_scene` / `GENBLAZE_FLUX_THEN_SCENE` dual MRS frame; **503** if setup missing; RT4D CLI failure → **502** |
| POST | `/api/generate-video` | Selected Cosmos or Seedance backend → B2; 503 if disabled or its credential is missing |
| POST | `/api/image-to-scene` | Image → SceneSpecification → optional MRS full-frame path trace (`render` default **true**, `quality` default **draft**; optional `require_nvidia`). Scene interpretation — **not** reconstruction |
| POST | `/api/rt4d-to-nvidia` | Prior still `run_id` → NIM vision → optional MRS re-render (`require_nvidia`); **503** missing key, **502** NIM 5xx/504; **not** img2img |
| POST | `/api/polish-still` | Prior still `run_id` → diffusion img2img polish (fal.ai FLUX); **503** polish disabled/missing key, **502** upstream failure; structure still unchanged |
| GET | `/.well-known/ai-plugin.json` | ChatGPT-style plugin manifest (absolute URLs; auth none or bearer) |
| GET | `/plugin/openapi.json` | Scoped OpenAPI for Engine3D still Actions (full app schema remains `/openapi.json`) |
| POST | `/api/engine3d-still` | Engine3D soft-raster structure (beauty+AOVs); optional `rt4d_background_run_id` composite; optional `polish`; **not** RT4D sphere-bridge for faces |
| POST | `/api/engine3d-sequence` | Short Engine3D soft-raster orbit sequence (structure); first-frame preview; **not** 8K farm / per-frame polish |
| POST | `/api/prompt-to-scene` | Prompt → SceneSpecification + Engine3D world stub via out-of-process bridge; optional `render=true` RT4D still; **503** disabled/missing script, **502** bridge failure |
| POST | `/api/render-scene` | SceneSpecification JSON → RT4D still (`quality` default **draft**; pass `final` for RT4D_* profile) |
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

Parallel Genblaze/NIM text-to-video path (`app/pipeline_video.py`) on the same site as FLUX stills. **No Story Forge lineage.** Video is **off by default** — when `GENBLAZE_VIDEO_ENABLED` is unset the path is disabled even with `NVIDIA_API_KEY` set (stills-only demo default). Set `GENBLAZE_VIDEO_ENABLED=1` to re-enable. Constitutional docs under `docs/constitutional/` are **declared**, not runtime-enforced (JCR/CEL/Arena/Sovereign IDE are not hosted here).

| Concern | Honest status |
| --- | --- |
| Default | Unset → **off** (regardless of NVIDIA key); explicit `1` enables, `0` disables |
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
