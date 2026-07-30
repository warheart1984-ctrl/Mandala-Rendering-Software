# Artifact catalog — verification cycle 2026-07-30

Honesty: no photoreal claims. Status vocabulary: **soft-raster** | **opencl-beauty-probe** | **checkerboard** | **deferred**.

---

## Produced this cycle

| Path | Kind | Res / duration | Provider / renderer | Status | Size |
|------|------|----------------|---------------------|--------|------|
| `tmp/book-movie-ch1/verification-cycle-2026-07-30/stills/engine3d-02-dim-room-cinematic-v2.png` | still | 960×540 | Engine3D HeadlessGLStillRenderer cinematic-v2 + Amendment VII | soft-raster dim-room (blocky fixture chairs, emissive monitor, DOF/grain) | 154099 B |
| `tmp/book-movie-ch1/verification-cycle-2026-07-30/clip-2s/archive-of-consent-ch1-first-10s.mp4` | video | 2.0s · 1920×1080 upscale · 12fps H.264+AAC | same Engine3D cinematic-v2 + VII (render 960×540) | soft-raster title push-in proof clip | 1.15 MB |
| `tmp/book-movie-ch1/verification-cycle-2026-07-30/opencl-tonga-still.png` | still | 512×512 | SX legacy-efficient `opencl-legacy` (R9 380) | opencl-beauty-probe (radial coral→plum glow; not scene) | 68253 B |
| `docs/4d-engine/proofs/legacy-efficient/opencl-tonga-still.png` | still (canonical) | 512×512 | same | opencl-beauty-probe | 68253 B |
| `docs/4d-engine/proofs/ccc-image-gen/provider-probe.json` | probe JSON | — | CCC-ImageGen (`--try-generate` last write) | deferred — `pixelsProduced: false`, `blockedOnGpu: false` | — |
| `tmp/book-movie-ch1/verification-cycle-2026-07-30/sx-legacy-auto-proof.json` | proof JSON | — | SX `gpu.compute.amd.legacy_efficient` | partial; `stillProvider: opencl-legacy` | — |
| `tmp/book-movie-ch1/verification-cycle-2026-07-30/ccc-provider-probe-try-generate.json` | probe copy | — | CCC try-generate | deferred stub cascade | — |

### Probe evidence (this cycle)

| Command | Key result |
|---------|------------|
| `npm run sx:image-gen-probe -- --write` | `fallbackUsed: true`, `blockedOnGpu: false`, `pixelsProduced: false` |
| `npm run sx:image-gen-probe -- --force-gpu-down --write` | selects `local.cpu`; same honesty; not architecture-blocked |
| `npm run sx:image-gen-probe -- --try-generate --write` | Lemonade attempt → **no pixels**; degraded/partial |
| `npm run sx:legacy-efficient -- --still --provider auto …` | `stillProvider: opencl-legacy`, `lemonadeOk: false`, `openclOk: true` |
| `node …/render_ch1_cinematic.mjs --proof --cinematic-v2 --amendment-vii …` | proof still written (~2.2s) |
| `node …/render_ch1_cinematic.mjs --cinematic-v2 --amendment-vii --max-seconds 2 --fps 12 …` | 24 frames, 2s MP4 |

---

## Prior showcase files still valid

### showcase-cinematic-v2 (best film package)

| Path | Kind | Res / duration | Renderer | Status | Size |
|------|------|----------------|----------|--------|------|
| `…/showcase-cinematic-v2/archive-of-consent-ch1-showcase-30s.mp4` | video | **30s** · 1920×1080 · **24fps** | Engine3D cinematic-v2 | soft-raster remaster | 22.0 MB |
| `…/showcase-cinematic-v2/archive-of-consent-ch1-first-10s.mp4` | video | **10s** · 1920×1080 · **24fps** | Engine3D cinematic-v2 | soft-raster | 7.84 MB |
| `…/showcase-cinematic-v2/stills/engine3d-02-dim-room-cinematic-v2.png` | still | 960×540 | Engine3D cinematic-v2 | soft-raster | 164765 B |
| `…/showcase-cinematic-v2/stills/before-after-02-dim-room.png` | still | compare | Engine3D | soft-raster before/after | 0.208 MB |
| `…/showcase-cinematic-v2/plates/sx-demo-simulated-checkerboard.png` | plate | 256×256 | SX_DEMO_MODE simulate | **checkerboard** — not beauty | 1461 B |

### showcase-cinematic-v2-vii-rerun

| Path | Kind | Res / duration | Renderer | Status | Size |
|------|------|----------------|----------|--------|------|
| `…/showcase-cinematic-v2-vii-rerun/archive-of-consent-ch1-first-10s.mp4` | video | **2s** · 1920×1080 · 12fps | Engine3D cinematic-v2 + VII | soft-raster proof | 1.15 MB |
| `…/showcase-cinematic-v2-vii-rerun/stills/engine3d-02-dim-room-cinematic-v2.png` | still | 960×540 | Engine3D + VII | soft-raster | 154099 B |

### showcase-30s (older 12fps upgrade path)

| Path | Kind | Res / duration | Renderer | Status | Size |
|------|------|----------------|----------|--------|------|
| `…/showcase-30s/archive-of-consent-ch1-showcase-30s.mp4` | video | **30s** · 1920×1080 · **12fps** | Engine3D upgrade | soft-raster | 8.11 MB |
| `…/showcase-30s/stills/engine3d-02-dim-room-upgrade.png` | still | — | Engine3D upgrade | soft-raster | 0.047 MB |
| `…/showcase-30s/stills/sx-opencl-tonga-still.png` | still | — | OpenCL | opencl-beauty-probe | 0.024 MB |

### amendment-vii-before-after

| Path | Kind | Res | Status |
|------|------|-----|--------|
| `…/amendment-vii-before-after/amendment-vii-before.png` | still | 640×400 | soft-raster / CKL VII evidence |
| `…/amendment-vii-before-after/amendment-vii-after.png` | still | 640×400 | soft-raster / CKL VII evidence |

---

## Lemonade / CCC summary

| Attempt | Pixels? | Notes |
|---------|---------|-------|
| CCC probe (default) | **No** | Cascade degraded; `local.cpu` stub |
| CCC `--force-gpu-down` | **No** | Proves architecture not GPU-blocked |
| CCC `--try-generate` | **No** | Live Lemonade SD path deferred on this host |
| SX `--provider auto` | **Yes (OpenCL)** | Lemonade failed; OpenCL still produced |

`cinematic-plates/test-sdxl.png` remains a near-empty prior probe (0 MB class) — not a usable beauty plate.
