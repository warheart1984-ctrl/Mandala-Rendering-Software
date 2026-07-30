# Artifact catalog — full status media 2026-07-30

Honesty vocabulary: **soft-raster** | **opencl-beauty-probe** | **cycles-smoke** | **held** | **partial** | **certified:false**

---

## Produced / refreshed this cycle

| Path | Kind | Notes | Size |
|------|------|-------|------|
| `tmp/governed-render/e209bafe0844226d/still.png` | still | Governed layout — prompt `status test dim room` · engine3d.soft | 47940 B |
| `tmp/governed-render/e209bafe0844226d/verification-trail.json` | trail | lemonadeHeld; photorealClaim false | — |
| `tmp/governed-render/01d7230e569e0c04/still.png` | still | Layout plate beside Cycles (64×64) | 4761 B |
| `tmp/governed-render/01d7230e569e0c04/beauty-cycles.png` | still | **Fresh Cycles smoke** · cyclesStatus complete · photorealClaim true (plate) | 6314 B |
| `tmp/governed-render/01d7230e569e0c04/external-pbr/scene.glb` | glb | exportStatus held | — |
| `tmp/governed-render/01d7230e569e0c04/{pep,spr,cec}.json` | evidence | Phase-2 emit · pep 0.6061 · spr 0.65 | — |
| `tmp/governed-render/91aa9be8f7a2215b/{still.png,beauty-cycles.png}` | stills | Governed rerun with Blender-enabled Cycles beauty | layout 4761 B / beauty 6314 B |
| `tmp/governed-render/91aa9be8f7a2215b/{pep,spr,cec}.json` | evidence | Phase-2 emit · pep 0.6061 · spr 0.65 | — |
| `tmp/governed-render/91aa9be8f7a2215b/{fpec,rdc,cat-phr,cpcs}.json` | promotion/certification | Promote+certify chain restored; CPCS honest partial (`certified:false`) | — |
| `tmp/governed-render/91aa9be8f7a2215b/photoreal-checklist-t01-t13.json` | checklist | T-01..T-13 summary: 4 pass / 9 partial / 0 fail | — |
| `tmp/rcs-runs-2026-07-30/rcs-summary.json` | RCS | Conformance level `PARTIAL` (real scene + declared stubs) | — |
| `tmp/blender-10s-test/governed-render/587f836fc789a003/{pep,spr,cec,photoreal-checklist-t01-t08}.json` | evidence | Re-emitted this cycle (Phase-2 scores) | — |
| `tmp/blender-10s-test/governed-render/587f836fc789a003/cpcs.json` | CPCS | **Prior snapshot** · certified false · FPEC 0.8889 · pep 0.8788 · spr 1.0 | 956 B |

---

## Videos (`tmp/book-movie-ch1/`)

| Path | Duration / notes | Renderer | Status | Size |
|------|------------------|----------|--------|------|
| `showcase-cinematic-v2/archive-of-consent-ch1-showcase-30s.mp4` | **30s** · 1920×1080 · 24fps | Engine3D cinematic-v2 | soft-raster | 22.04 MB |
| `showcase-cinematic-v2/archive-of-consent-ch1-first-10s.mp4` | **10s** · 1920×1080 · 24fps | Engine3D cinematic-v2 | soft-raster | 7.84 MB |
| `verification-cycle-2026-07-30/clip-2s/archive-of-consent-ch1-first-10s.mp4` | **2s** proof @12fps | Engine3D + VII | soft-raster | 1.15 MB |
| `showcase-cinematic-v2-vii-rerun/archive-of-consent-ch1-first-10s.mp4` | 2s VII rerun | Engine3D + VII | soft-raster | 1.15 MB |
| `showcase-30s/archive-of-consent-ch1-showcase-30s.mp4` | 30s @12fps (older) | Engine3D upgrade | soft-raster | 8.11 MB |
| `archive-of-consent-ch1-3d-motion.mp4` | motion package | Engine3D | soft-raster | 6.08 MB |
| `clips/clip-01.mp4` … `clip-08.mp4` | short verification clips | slides/motion | soft-raster | 0.22–0.59 MB |

---

## Key stills

| Path | Provider | Status | Size |
|------|----------|--------|------|
| `showcase-cinematic-v2/stills/engine3d-02-dim-room-cinematic-v2.png` | Engine3D cinematic-v2 | soft-raster **best film still** | 160.9 KB |
| `showcase-cinematic-v2/stills/before-after-02-dim-room.png` | Engine3D compare | soft-raster | 212.8 KB |
| `verification-cycle-2026-07-30/stills/engine3d-02-dim-room-cinematic-v2.png` | Engine3D + VII | soft-raster | 150.5 KB |
| `verification-cycle-2026-07-30/opencl-tonga-still.png` | SX opencl-legacy | opencl-beauty-probe | 66.7 KB |
| `docs/4d-engine/proofs/legacy-efficient/opencl-tonga-still.png` | canonical OpenCL | opencl-beauty-probe | 66.7 KB |
| `amendment-vii-before-after/amendment-vii-before.png` | Engine3D VII | soft-raster CKL evidence | 49.4 KB |
| `amendment-vii-before-after/amendment-vii-after.png` | Engine3D VII | soft-raster CKL evidence | 43.1 KB |
| `tmp/glb-repro/cycles-a.png` / `cycles-b.png` | Cycles dual | cycles-smoke | 72.8 KB |
| `tmp/blender-10s-test/governed-render/587f836fc789a003/beauty-cycles.png` | Cycles prior | cycles-smoke | 6371 B |
| `showcase-cinematic-v2/plates/sx-demo-simulated-checkerboard.png` | SX_DEMO simulate | **checkerboard** — not beauty | 1.4 KB |

---

## Lemonade / CCC

| Attempt | Pixels? | Tag |
|---------|---------|-----|
| This cycle governed-render | No | **held** (`lemonadeHeld: true`) |
| Prior verification CCC `--try-generate` | No | deferred / degraded |

---

## Photoreal evidence standing

| Run | pep | spr | promotionEligibility | CPCS certified |
|-----|-----|-----|----------------------|----------------|
| Live promote/cert `91aa…` | 0.6061 | 0.65 | PROMOTE_WITH_GAPS | **false** / NONE |
| Live emit `587f…` / `01d7…` | 0.6061 | 0.65 | PROMOTE_WITH_GAPS | n/a (no live CPCS write) |
| Prior `cpcs.json` on `587f…` | 0.8788 | 1.0 | (FPEC eligibility 0.8889) | **false** / NONE |
