# Lane Lock — Structure vs Beauty (Constitutional Anime)

| Field | Value |
|-------|-------|
| `trailId` | `constitutional-anime-rendering-2026-07` |
| `status` | **partial** (documented + pipeline-labeled; CKL **declared**) |
| `date` | 2026-07-31 |

## Lock statement

MRS Constitutional Anime Rendering uses **two locked lanes**. Claims in health
payloads, generate responses, and demo manifests MUST match the lane that
actually produced pixels.

### Structure lane (backbone)

| Item | Value |
|------|-------|
| Role | Geometry + continuity + 4D motifs |
| Engines | Engine3D soft-raster · RT4D lattice/tesseract · 4D transforms |
| Outputs | Structure plate PNG + depth/normal AOVs + frozen params |
| Anime claim | **Forbidden** unless local `cel-proxy` applied (**partial**) or beauty succeeded |
| `path_kind` / `lane` | `structure` |

### Beauty lane (anime painter)

| Item | Value |
|------|-------|
| Role | Pluggable cel shaders over structure plates |
| Backends | fal FLUX img2img · Lemonade SD (when `pixelsProduced`) · NVIDIA NIM (best-effort) · local `cel-proxy` |
| Constraint | Must load / honor `AnimeWorldProfile` prompt + palette steer |
| Anime claim | Allowed only when polish succeeds |
| `path_kind` / `lane` | `beauty` |

### Structure-only fallback

| Item | Value |
|------|-------|
| Trigger | Painter missing key, HTTP failure, timeout, or `pixelsProduced: false` |
| Label | `lane: structure-only` · `polish_backend: none` · `anime_claim: false` |
| Ban | Silent anime / diffusion success wording |

## Wiring map

| Surface | How claims match path |
|---------|----------------------|
| Pipeline CLI `constitutional_anime_render` | Writes `render-manifest.json` with `lane`, `polish_backend`, hashes |
| Genblaze `/health` style fragment | `entry_point` + profile validation; does not invent beauty pixels |
| Continuity 5-shot | Structure + cel-proxy; `lemonadeSd: blocked-unused` when unused |
| Digital Printer | Unchanged — anime GenAI ≠ print beauty SoT |

## Goal

Any structure plate MAY be anime-polished under `AnimeWorldProfile` when a
beauty backend is healthy. Until then, demos ship **honest structure-only** or
**partial cel-proxy** plates — never fake FLUX success.
