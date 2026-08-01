# Devpost — MRS Genblaze Concept Media

Evidence-bound copy for the Backblaze Generative AI Media Hackathon. Paste only what the live App URL actually does.

## Judge-facing pitch (2026-08)

- **B2 + provenance:** every demo frame lands under `genblaze-media/demo-cache/{shot}/fNNNN/` with SHA-256 sidecars (`intentId` / `worldId` / `timelineId` / provider / hash).
- **Multi-provider failover:** GenBlaze cascade **GMI Cloud (SDK fan-out) → fal → NVIDIA → hfspace (free fallback)** — disclosed on `/health.provider_cascade`.
- **Cached demo resilience:** pre-render across a 24h window with GMI credits; live UI serves `source: b2-cache` while still probing failover legs. Cache miss + painter fail → `structure-only` (no silent fake live anime).
- **Ops doc:** [`HACKATHON_DEMO_CACHE_B2.md`](./HACKATHON_DEMO_CACHE_B2.md) · deploy [`RENDER_DASHBOARD_DEPLOY_GENBLAZE.md`](./RENDER_DASHBOARD_DEPLOY_GENBLAZE.md).

## Providers and models

| Role | Provider | Model |
| --- | --- | --- |
| Image generation (live) | MRS RT4D deterministic 4D path tracer (`genblaze-rt4d`) | procedural SceneSpec (seed-varied; not text-to-image) |
| Image generation (armed fallback) | NVIDIA NIM (`genblaze-nvidia`) | `black-forest-labs/flux.1-schnell` |
| Hackathon fan-out (credits) | GMI Cloud via GenBlaze SDK (`genblaze-gmicloud`) | `seedream-5.0-lite` (configurable) |
| Free fallback polish | HF Space (`hfspace-flux-klein`) | `FLUX.2-Klein-9B` |
| Prompt embeddings / semantic search | NVIDIA Integrate API | `nvidia/nv-embedcode-7b-v1` |
| Orchestration + provenance | Backblaze Genblaze | `genblaze-core` + `genblaze-s3` |
| Durable object storage | Backblaze B2 (S3-compatible) | Bucket `Mandala-Rendering-System` (`us-east-005`) |

**GMI Cloud:** eligible Devpost participants get free credits — wire `GMI_API_KEY`; do not claim live GMI in CI without keys.

## B2 and Genblaze usage

**Genblaze** runs the media pipeline: image step (deterministic RT4D stills by default, NVIDIA NIM FLUX as armed fallback) → SHA-256 provenance manifest → upload via `genblaze-s3` `S3StorageBackend.for_backblaze`. The thin FastAPI UI (`mrs/apps/genblaze-media`) takes a prompt, returns asset/manifest keys and a short-lived **presigned** preview (private bucket).

**B2** stores generated concept stills and manifests under prefix `genblaze-media/`. After generate, prompts are optionally embedded with **nv-embedcode** and indexed locally so judges can semantic-search recent assets (`POST /api/search`).

This is **concept media for MRS / 4D scene authoring** — Genblaze does **not** render 4D; MRS remains the 4D renderer.

**Look lane (2026-07-31):** Prefer `GENBLAZE_STYLE=anime` or API `"style":"anime"` for stylized FLUX/Lemonade/polish stills (**partial** — prompt steer, not Full Photoreal). Cycles photoreal (`external-pbr`) stays optional.

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
- Durable upload confirmed in-bucket: `genblaze-media/rt4d/334b24d9-4354-47fe-997e-18c6f840ed14/render.png` (72,351 bytes) + `manifest.json` (2,754 bytes) with `asset_sha256: b565e0200cab75a51f841327b0d8305ce3fa75520866fc7d66956a3d76183785`, seed 3476402779, scene `tesseract-lattice`. 19 runs persisted.
- `rt4d.available:true` — deterministic RT4D stills; `POST /api/generate` returned `run_id 334b24d9-…` and the preview was a real `image/png` (72,351 bytes).
- NVIDIA NIM (`flux.1-schnell`) is **armed but currently unavailable** — key is valid (direct calls pass auth; only schema-validation 422s for non-supported sizes), but the model returns gateway **504 after 300 s** on direct calls (warmup probe same). The deploy pins `GENBLAZE_IMAGE_BACKEND=rt4d` so stills are served by the deterministic 4D path tracer, with NVIDIA fallback armed. Do not claim a live FLUX NIM image until the 504 clears.

Local: `http://127.0.0.1:8787/` · Health: `/health`

## Demo video outline (~3 min)

1. Open App URL → show `/health` (`b2_configured`, `provider_cascade`, `demo_cache`, `gmi`).
2. With `GENBLAZE_DEMO_CACHE=1`, generate → show `source: b2-cache` + SHA-256 / B2 keys (honest label).
3. Point at cascade: GMI primary / hfspace free fallback (failover story).
4. Optional: semantic search + B2 console list under `genblaze-media/demo-cache/`.

## GitHub

Public repo with setup in `mrs/apps/genblaze-media/README.md`. Never commit `.env`.
