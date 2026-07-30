# Where we stand — 2026-07-30

ESFR: **PASS_WITH_GAPS** · PromotionEligibility: **PROMOTE_WITH_GAPS**  
Drive-G-1: no Full Photoreal / Phase 4 certified claims.

## Tier table

| Tier | What works | Best picture | Best movie | Status tags |
|------|------------|--------------|------------|-------------|
| **Engine3D soft-raster** | Cinematic-v2 DOF/MB/dust/grade; Amendment VII apply; governed layout one-command; raster-upgrade **13/13** | `tmp/book-movie-ch1/showcase-cinematic-v2/stills/engine3d-02-dim-room-cinematic-v2.png` | `tmp/book-movie-ch1/showcase-cinematic-v2/archive-of-consent-ch1-showcase-30s.mp4` | **enforced** (host path) · soft-raster · not photoreal |
| **OpenCL / CL-Gen** | ImageGen cascade prefers opencl.gen when Lemonade down (**21/21** tests); Tonga still probe | `tmp/book-movie-ch1/verification-cycle-2026-07-30/opencl-tonga-still.png` | — (no OpenCL movie) | **partial** · opencl-beauty-probe · not scene plate |
| **Cycles / GLB external-PBR** | Held GLB export + Blender 5.2 Cycles beauty; fresh rerun `91aa9be8f7a2215b` | `tmp/governed-render/91aa9be8f7a2215b/beauty-cycles.png` | — (stills only this cycle) | **partial** · cycles-smoke · photorealClaim plate-true · not Full |
| **Lemonade** | Server/model path deferred on host | — | — | **held** |
| **Photoreal evidence Phase 2–4** | Phase 2 emit PEP/SPR/CEC + **T-01..T-13**; promote/certify CLI restored; CPCS remains partial (honest) | evidence JSONs under run dirs | — | pep **0.6061** (live) · spr **0.65** (live) · FPEC eligibility **0.6281** (live) · **certified: false** |

## Top opens (operator)

1. Pic — Engine3D: `G:\Mandala Rendering Software\tmp\book-movie-ch1\showcase-cinematic-v2\stills\engine3d-02-dim-room-cinematic-v2.png`
2. Pic — Cycles: `G:\Mandala Rendering Software\tmp\governed-render\01d7230e569e0c04\beauty-cycles.png`
3. Pic — OpenCL: `G:\Mandala Rendering Software\tmp\book-movie-ch1\verification-cycle-2026-07-30\opencl-tonga-still.png`
4. Movie — 30s: `G:\Mandala Rendering Software\tmp\book-movie-ch1\showcase-cinematic-v2\archive-of-consent-ch1-showcase-30s.mp4`
5. Movie — 10s: `G:\Mandala Rendering Software\tmp\book-movie-ch1\showcase-cinematic-v2\archive-of-consent-ch1-first-10s.mp4`

## Test summary

| Suite | Pass |
|-------|------|
| photoreal-evidence | 4/4 (`T-01..T-13` checklist assertions) |
| ImageGenProvider | 21/21 |
| Amendment VII | 12/12 |
| engine3d raster-upgrade | 13/13 |

## Certification standing

| Gate | Value |
|------|-------|
| Live Phase-2/3 (`91aa9be8f7a2215b`) | pep 0.6061 · spr 0.65 · `PROMOTE_WITH_GAPS` · `fullPhotorealEligible: false` |
| Prior CPCS (`587f836fc789a003`) | eligibilityScore **0.8889** · pep 0.8788 · spr 1.0 · auditVerdict PASS_WITH_GAPS (historical snapshot) |
| `certified` | **false** |
| `certificationLevel` | **NONE** |
| Phase-4 claim | **forbidden** until CPCS certified true |
| Promote CLI | **restored** (`scripts/photoreal-promote.mjs` + `promotionPipeline.js`) |
| Certify CLI | **restored** (`evaluateCertification` export + `mrs:photoreal-certify`) |
