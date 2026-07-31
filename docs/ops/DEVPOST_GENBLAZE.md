# Devpost — MRS Genblaze Concept Media

Evidence-bound copy for the Backblaze Generative AI Media Hackathon. Paste only what the live App URL actually does.

## Providers and models

| Role | Provider | Model |
| --- | --- | --- |
| Image generation (live) | MRS RT4D deterministic 4D path tracer (`genblaze-rt4d`) | procedural SceneSpec (seed-varied; not text-to-image) |
| Image generation (armed fallback) | NVIDIA NIM (`genblaze-nvidia`) | `black-forest-labs/flux.1-schnell` |
| Prompt embeddings / semantic search | NVIDIA Integrate API | `nvidia/nv-embedcode-7b-v1` |
| Orchestration + provenance | Backblaze Genblaze | `genblaze-core` + `genblaze-s3` |
| Durable object storage | Backblaze B2 (S3-compatible) | Bucket `Mandala-Rendering-System` (`us-east-005`) |

**Not used in this MVP:** GMI Cloud paid image/video, Lawful Nova / AI organism stacks.

## B2 and Genblaze usage

**Genblaze** runs the media pipeline: image step (deterministic RT4D stills by default, NVIDIA NIM FLUX as armed fallback) → SHA-256 provenance manifest → upload via `genblaze-s3` `S3StorageBackend.for_backblaze`. The thin FastAPI UI (`mrs/apps/genblaze-media`) takes a prompt, returns asset/manifest keys and a short-lived **presigned** preview (private bucket).

**B2** stores generated concept stills and manifests under prefix `genblaze-media/`. After generate, prompts are optionally embedded with **nv-embedcode** and indexed locally so judges can semantic-search recent assets (`POST /api/search`).

This is **concept media for MRS / 4D scene authoring** — Genblaze does **not** render 4D; MRS remains the 4D renderer.

v2 ops themes (durable search, authoring bridge, CI): [`GENBLAZE_MEDIA_V2_ROADMAP.md`](./GENBLAZE_MEDIA_V2_ROADMAP.md) — **planned**, distinct from RT4D GPU v2.

### Hook to the 4D stack (honest)

1. Judge/operator generates a still via this app — RT4D deterministic stills by default (`GENBLAZE_IMAGE_BACKEND=rt4d`), NVIDIA NIM FLUX as armed fallback.
2. Asset + manifest land on **B2** under `genblaze-media/` with SHA-256 provenance.
3. MRS / `examples/web-demo.html` (and Inspector live-link) consume those URLs as **reference / texture / moodboard** inputs for scene authoring — not as a 4D simulation step.

That bridge is the product story: generative media pipeline → durable B2 → constitutional 4D tooling.

## App URL

**Live (Render, free tier, repo-root Dockerfile):** `https://mandala-rendering-system-mrs.onrender.com/`

Health: `GET /health` (live `status:ok`).

Verified live (2026-07-31):
- `b2_configured:true` — B2 bucket `Mandala-Rendering-System`, region `us-east-005`.
- `rt4d.available:true` — deterministic RT4D stills; `POST /api/generate` returned `run_id 334b24d9-…` and the preview was a real `image/png` (72,351 bytes).
- NVIDIA NIM (`flux.1-schnell`) is **armed but currently unavailable** (gateway 504, warmup probe same); the deploy pins `GENBLAZE_IMAGE_BACKEND=rt4d` so stills are served by the deterministic 4D path tracer, with NVIDIA fallback armed. Do not claim a live FLUX NIM image until the 504 clears.

Local: `http://127.0.0.1:8787/` · Health: `/health`

## Demo video outline (~3 min)

1. Open App URL → show `/health` (NVIDIA + B2 flags).
2. Generate a short mandala/4D-concept prompt → show preview + SHA-256 / B2 keys.
3. Semantic search with a related query → show ranked results.
4. Optional: B2 console list under `genblaze-media/`.

## GitHub

Public repo with setup in `mrs/apps/genblaze-media/README.md`. Never commit `.env`.
