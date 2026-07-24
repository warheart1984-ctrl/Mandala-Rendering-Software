# MRS Genblaze Media (Backblaze hackathon MVP)

Thin **FastAPI** service: user prompt → **Genblaze** (`genblaze-nvidia` + `genblaze-s3`) → **Backblaze B2** assets + SHA-256 provenance manifest → simple UI with presigned previews.

| Dimension | Status (Drive-G-1) |
| --- | --- |
| Product story | **Declared:** provenanced *concept* stills for MRS / 4D scene authoring |
| Genblaze 4D render | **Not claimed** — Genblaze generates 2D (NIM FLUX); MRS remains the 4D renderer |
| Operator deploy | **Prepared** — Dockerfile + `render.yaml` (Render free web) |
| Live NIM generate | **Requires** `NVIDIA_API_KEY` at runtime |
| B2 persistence | **Tests** path via `genblaze-s3` / dual-exported `B2_APP_KEY` |

## Product story (honest)

Operators type a prompt for a generative concept image. The service calls NVIDIA NIM through Genblaze (`black-forest-labs/flux.1-schnell` by default), uploads the image and a Genblaze provenance manifest to a private B2 bucket, and returns object keys plus a **presigned GET** preview URL. This does **not** mean MRS already had Genblaze, and it does **not** mean Genblaze renders 4D scenes.

## Setup

Python **≥ 3.11**. From this directory:

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Unix:
# source .venv/bin/activate

pip install -r requirements.txt
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
| `GENBLAZE_STORAGE_PREFIX` | optional; default `genblaze-media` |
| `GENBLAZE_DRY_RUN` | `1` only for unit tests / offline mocks — **not** live demos |

Get a free NIM key: [build.nvidia.com](https://build.nvidia.com/).

## Run locally

```bash
# from mrs/apps/genblaze-media with venv active
uvicorn app.main:app --host 0.0.0.0 --port 8787 --reload
```

Or from repo root (after venv + deps):

```bash
npm run genblaze:media
```

- UI: http://127.0.0.1:8787/
- Health: http://127.0.0.1:8787/health
- `POST /api/generate` body: `{"prompt":"…"}`
- `GET /api/assets` — recent entries from local JSON index

If `NVIDIA_API_KEY` is missing, `/health` still boots and reports setup help; `POST /api/generate` returns **503** with instructions (unless `GENBLAZE_DRY_RUN=1`).

## Deploy (App URL)

### Render (preferred free path)

1. Push this repo (or connect the Git remote) to Render.
2. New **Web Service** → Docker → set **Root Directory** to `mrs/apps/genblaze-media` (or use the Blueprint `render.yaml` from that folder).
3. Set env vars (names above; values only in the dashboard — never commit).
4. Deploy. Service binds `0.0.0.0:$PORT` via the Dockerfile `CMD`.
5. Open the public `https://….onrender.com/` URL for judges; hit `/health` first.

Free tiers may cold-start; first generate can take longer than subsequent ones.

### Railway / Fly

Same Docker image: set the env vars, expose `$PORT`, health path `/health`.

## Verify

```bash
pip install -r requirements.txt
pytest -q
# live process
uvicorn app.main:app --host 127.0.0.1 --port 8787
curl -s http://127.0.0.1:8787/health
```

With **valid** B2 keys (no NVIDIA): health `b2_probe` should list under the storage prefix. With NVIDIA + B2: one `POST /api/generate`, then `npm run b2:list -- genblaze-media` from repo root (Node scripts need B2_* exported or loaded into the shell).

### Known operator pitfalls (evidence-bound)

| Issue | What we observed / expect |
| --- | --- |
| `InvalidAccessKeyId` on ListObjects | B2 key ID / application key in `.env` rejected by the S3 API — refresh a **non-master** bucket-scoped key |
| Genblaze `HeadBucket` 403 | Common with bucket-scoped keys; this app skips that preflight when `B2_REGION` is set |
| NIM generate timeout | Was: sync POST read timeout (`The read operation timed out`). Fix: `NVCF-POLL-SECONDS` + longer httpx read (defaults 90 / 600) so cold starts return 202 then poll |
| `GENBLAZE_DRY_RUN=1` | Offline unit-test path only — not for Devpost live demos |
## API sketch

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | Boots always; reports NVIDIA/B2 flags + optional B2 list probe |
| POST | `/api/generate` | Live Genblaze→B2 or 503 if no NVIDIA key |
| GET | `/api/assets` | Local recent index (capped) |
| GET | `/` | Single-page UI |

## Cross-links

- Operator B2 notes: [`docs/ops/BACKBLAZE_B2_S3.md`](../../../docs/ops/BACKBLAZE_B2_S3.md)
- Node B2 scaffold: [`mrs/packages/storage-b2`](../../packages/storage-b2)
- Genblaze upstream: https://github.com/backblaze-labs/genblaze
- Local shallow clone (reference only, gitignored): `vendor/genblaze` — see `examples/b2_storage_pipeline.py`

## Operator portals (Nova Cortex / Gates of Wonder / RSL)

Removed from the judge-facing UI (separate Lawful Nova stack — not part of this MVP).

## NVIDIA embeddings

Live generates optionally call `nvidia/nv-embedcode-7b-v1` (`POST /v1/embeddings`) so prompts can be semantic-searched via `POST /api/search`. This is an **embedding** model, not a chat LLM and not FLUX.

## License

Same as the parent repository (MIT) for this app’s own files; Genblaze packages are MIT per upstream.
