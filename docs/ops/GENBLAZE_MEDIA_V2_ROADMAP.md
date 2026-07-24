# Genblaze Media v2 — Ops / product roadmap

> **Status:** **planned / roadmap** (Drive-G-1).  
> Distinct from **RT4D Evolution v2.0** (GPU path core). Do not name this track “RT4D v2.”  
> v1 MVP: [`mrs/apps/genblaze-media/`](../../mrs/apps/genblaze-media/) · Hackathon copy: [`DEVPOST_GENBLAZE.md`](./DEVPOST_GENBLAZE.md)  
> Umbrella: [`docs/4drs/roadmap/MRS_V2_ARCHITECTURAL_ROADMAP.md`](../4drs/roadmap/MRS_V2_ARCHITECTURAL_ROADMAP.md) § V  
> Scorecard: [`docs/scorecards/genblaze-media.md`](../scorecards/genblaze-media.md)

## v1 baseline (evidence)

| Capability | Status |
| --- | --- |
| Prompt → Genblaze NVIDIA FLUX → B2 + SHA-256 manifest | **partial** (needs runtime keys) |
| Presigned preview, blank-still 422, B2 cleanup on reject | **shipped in code** |
| NIM timeouts / NVCF poll | **shipped in code** |
| Embeddings + local `POST /api/search` | **partial** (ephemeral local index) |
| Docker / Render blueprint | **prepared** |
| Genblaze renders 4D | **not claimed** |

## Planned themes (v2)

| ID | Theme | Size | Intent |
| --- | --- | --- | --- |
| A | **4D authoring bridge** | M–L | B2 stills as first-class reference/texture inputs for web-demo / Inspector / scene schema — with tests |
| B | **Media quality** | S–M | Stronger blank/refusal UX, prompt tips, optional alt models — do not claim FLUX “fixed” for people |
| C | **Durable search & ops** | M | Persist embeddings/index to B2; multi-instance-safe asset list; health/SLO notes |
| D | **CI** | S | pytest in CI, Docker smoke, secretless dry-run gates |
| E | **Commercial follow-on** | S docs / L product | Fill live App URL in Devpost when evidenced; operator vs self-serve scorecard honesty |

## Explicit non-goals (until evidence)

- 4D cinematic export / NIM “curvature estimation” as **enforced** world truth  
- Replacing MRS / RT4D as the 4D renderer  
- Claiming live Render URL in docs without a verified HTTPS endpoint in-repo

## Cross-links

- B2 ops: [`BACKBLAZE_B2_S3.md`](./BACKBLAZE_B2_S3.md)  
- Platform perf (adjacent): [`PLATFORM_PERF_ROADMAP.md`](./PLATFORM_PERF_ROADMAP.md)  
