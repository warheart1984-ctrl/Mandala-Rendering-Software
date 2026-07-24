# Devpost — MRS Genblaze Concept Media

Evidence-bound copy for the Backblaze Generative AI Media Hackathon. Paste only what the live App URL actually does.

## Providers and models

| Role | Provider | Model |
| --- | --- | --- |
| Image generation | NVIDIA NIM (`genblaze-nvidia`) | `black-forest-labs/flux.1-schnell` |
| Prompt embeddings / semantic search | NVIDIA Integrate API | `nvidia/nv-embedcode-7b-v1` |
| Orchestration + provenance | Backblaze Genblaze | `genblaze-core` + `genblaze-s3` |
| Durable object storage | Backblaze B2 (S3-compatible) | Bucket `Mandala-Rendering-System` (`us-east-005`) |

**Not used in this MVP:** GMI Cloud paid image/video, Lawful Nova / AI organism stacks.

## B2 and Genblaze usage

**Genblaze** runs the media pipeline: NVIDIA FLUX image step → SHA-256 provenance manifest → upload via `genblaze-s3` `S3StorageBackend.for_backblaze`. The thin FastAPI UI (`mrs/apps/genblaze-media`) takes a prompt, returns asset/manifest keys and a short-lived **presigned** preview (private bucket).

**B2** stores generated concept stills and manifests under prefix `genblaze-media/`. After generate, prompts are optionally embedded with **nv-embedcode** and indexed locally so judges can semantic-search recent assets (`POST /api/search`).

This is **concept media for MRS / 4D scene authoring** — Genblaze does **not** render 4D; MRS remains the 4D renderer.

### Hook to the 4D stack (honest)

1. Judge/operator generates a FLUX still via this app (NIM GenAI `flux.1-schnell`).
2. Asset + manifest land on **B2** under `genblaze-media/` with SHA-256 provenance.
3. MRS / `examples/web-demo.html` (and Inspector live-link) consume those URLs as **reference / texture / moodboard** inputs for scene authoring — not as a 4D simulation step.

That bridge is the product story: generative media pipeline → durable B2 → constitutional 4D tooling.

## App URL

Deploy `mrs/apps/genblaze-media` (Docker / `render.yaml`) and paste the public HTTPS URL here after Render/Railway is live.

Local: `http://127.0.0.1:8787/` · Health: `/health`

## Demo video outline (~3 min)

1. Open App URL → show `/health` (NVIDIA + B2 flags).
2. Generate a short mandala/4D-concept prompt → show preview + SHA-256 / B2 keys.
3. Semantic search with a related query → show ranked results.
4. Optional: B2 console list under `genblaze-media/`.

## GitHub

Public repo with setup in `mrs/apps/genblaze-media/README.md`. Never commit `.env`.
