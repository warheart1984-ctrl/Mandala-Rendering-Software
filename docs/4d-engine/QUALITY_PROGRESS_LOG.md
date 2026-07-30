# Quality Progress Log

Evidence-bound cycle log for Mandala / MRS visual quality.
Drive-G-1: soft-raster ≠ photoreal; Lemonade held until `pixelsProduced: true` consistently.

Every cycle answers:

1. What visibly improved?
2. What still looks artificial?
3. What was measured?
4. What is the next bottleneck?

---

## 2026-07-30 — Full status media standings (MRS crew)

| Field | Value |
|-------|-------|
| Trail | `docs/governance/cecp/trails/full-status-media-2026-07-30/` |
| ESFR | **PASS_WITH_GAPS** / **PROMOTE_WITH_GAPS** |
| Blender | 5.2.0 LTS present |

1. **Improved / happened:** Fresh governed rerun with Blender-enabled Cycles beauty (`91aa9be8f7a2215b`, `beauty-cycles.png`, `cyclesStatus: complete`). Restored `mrs:photoreal-promote` + `mrs:photoreal-certify` wiring (pipeline + exports + scripts) and emitted live `fpec.json` / `rdc.json` / `cat-phr.json` / `cpcs.json`. Tests: ImageGen **21/21**, Amendment VII **12/12**, raster-upgrade **13/13**, photoreal-evidence **4/4**.
2. **Artificial / gaps:** Engine3D remains soft-raster fixture film; OpenCL still is radial probe not scene; Lemonade **held**; CPCS still `certified:false` because Phase-4 gates are not met (`fpecFullEligible`, completeness thresholds, checklist-all-pass, replayVerified, CAT PASS).
3. **Measured:** Live run `91aa...` pep/spr **0.6061/0.65**, FPEC eligibility **0.6281**, checklist **4 pass / 9 partial / 0 fail**, CPCS level `NONE`.
4. **Next bottleneck:** Raise evidence completeness toward CPCS thresholds, produce pixel replay verification, and close CAT/checklist partials while keeping Lemonade held until real `pixelsProduced:true`.

---

## 2026-07-30 — Phase 2 CIEMS photoreal evidence (PEP / SPR / CEC)

| Field | Value |
|-------|-------|
| Trail | `docs/governance/cecp/trails/photoreal-evidence-pep-spr-2026-07/` |
| Specs | `docs/4d-engine/evidence/` (**declared**) |
| Schemas | `schemas/ciems/pep-v1.json` · `spr-v1.json` · `cec-v1.json` (+ RDC/MFP-C/LJC) |
| Emitters | `mrs/packages/renderer-core/src/evidence/photoreal/` (**partial**) |
| Hook | `mrs:governed-render --beauty external-pbr` → `spr.json` / `pep.json` / `cec.json` |

1. **Improved / happened:** Constitutional evidence chain artifacts landed and wire into post-render external-PBR. Completeness scores are honest Partial; `fullPhotorealEligible` forced false (no auto Full Photoreal).
2. **Artificial / gaps:** MFP energyConservation, LJC shadow/GI scores, topology/UV integrity, HDRI environment lineage still undeclared; dual-run replay byte identity not re-proven in checklist.
3. **Measured:** Schema smoke + emit-from-run + T-01..T-08 on `tmp/blender-10s-test/governed-render/587f836fc789a003/`: pep completeness **0.6061**, spr **0.65**, `fullPhotorealEligible: false`, checklist **2 pass / 6 partial / 0 fail**.
4. **Next bottleneck:** Fill material/lighting justification fields from richer SceneSpecification / Cycles metadata; optional dual-run RDC proof.

---

## 2026-07-30 — Blender ~10s Cycles smoke (crew cycle)

| Field | Value |
|-------|-------|
| Trail | `docs/governance/cecp/trails/blender-10s-cycles-2026-07-30/` |
| Blender | `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe` (5.2.0 LTS) |
| GLB | `tmp/glb-repro/scene.glb` (Held; SHA `3ebe5d8f…bf1e`) |
| Status | **Partial** — smoke path **Held** export + Cycles PNG complete |

1. **Improved / happened:** Short Cycles beauty confirmed. Fast plate **64² / 8 samples** wrote PNG in **~7.05s** wall (`tmp/blender-10s-test/cycles-beauty-64x64-s8.png`). Mid plate 128²/16 samples **~25.2s**. Governed-render `--beauty external-pbr` (`runId` `587f836fc789a003`) wrote `beauty-cycles.png` with `cyclesStatus: complete`, `pixelsProduced: true`, `photorealClaim: true`; full pipeline wall **~34.4s** (soft-raster + GLB export + Cycles).
2. **Artificial / gaps:** CPU-only (OptiX/HIP unavailable); smoke resolution only; layout still Engine3D soft-raster; Lemonade held; OpenCL assist failed (non-blocking).
3. **Measured:** CLI 64²/8 → 7051 ms, 6371 B PNG; CLI 128²/16 → 25207 ms, 20715 B; governed beauty SHA `a370cd58…`; ESFR **PASS_WITH_GAPS** / **PROMOTE_WITH_GAPS**.
4. **Next bottleneck:** GPU Cycles device enablement; raise samples/resolution only after timing budget allows.

---

## 2026-07-30 — Blender Cycles Held + GLB cross-renderer proof

| Field | Value |
|-------|-------|
| Strategy | `docs/4d-engine/PHOTOREAL_PROVIDER_STRATEGY.md` |
| Proof | `tmp/glb-repro/` · `docs/4d-engine/proofs/glb-cross-renderer/` |
| Trail run | `tmp/governed-render-external-pbr-cycles/9de3536aacc4f922/` |
| Blender | `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe` |

1. **Improved:** Fixed GLB exporter (header length, JSON pad `0x20`, absolute bufferViews, finite min/max, VEC3 translations) so Blender 5.2 imports. Cycles script sets active camera + fixed `seed=0`. Dual Cycles renders + governed-render `--beauty external-pbr` write real beauty PNGs.
2. **Artificial / gaps:** Layout still Engine3D soft-raster; Cycles ran CPU (HIP/OptiX unavailable); overall photoreal still **partial** (not production-certified). Second renderer (Godot/three) not yet run.
3. **Measured:** GLB SHA-256 `3ebe5d8f…bf1e` (12 622 660 bytes), dual-export byte-identical; provenance structural match; Cycles PNG **file** hashes differ, **pixel** SHA identical `8b5b3e3b…fc45`; trail `exportStatus: held`, `cyclesStatus: complete`, `pixelsProduced: true`, `photorealClaim: true`.
4. **Next bottleneck:** Add second GLB consumer plate to the proof pack; optional remote diffusion beauty URL.

---

## 2026-07-30 — external PBR (GLB→Cycles) wired to governed-render

| Field | Value |
|-------|-------|
| Strategy | `docs/4d-engine/PHOTOREAL_PROVIDER_STRATEGY.md` |
| Trail | `docs/governance/cecp/trails/photoreal-provider-strategy-2026-07/` |
| Implementation | `externalPbrBeauty.js` · `photoreal.external.pbr` · `--beauty external-pbr` |

1. **Improved:** Verified SceneSpecification→GLB pipeline (`render-glb.mjs` / `glbExporter.js`); wired as constitutional `photoreal.external.pbr` (not URL-only stub). Fixed Windows Cycles launcher to use `render-glb-cycles.py`. Governed-render `--beauty external-pbr` exports GLB under `<run>/external-pbr/`.
2. **Artificial / deferred (superseded same day):** Earlier host check had no Blender → Cycles Blocked. Later same day: Blender 5.2 installed → see cycle above.
3. **Measured (pre-Blender):** Prior invalid/oversized GLB header era recorded ~12.04 MB; post-fix Held GLB is `12622660` bytes with Blender-valid structure.
4. **Next bottleneck:** Was Blender install — **done** (see Cycles Held cycle).

---

## 2026-07-30 — photoreal provider strategy (constitutional footing)

| Field | Value |
|-------|-------|
| Strategy | `docs/4d-engine/PHOTOREAL_PROVIDER_STRATEGY.md` |
| Trail | `docs/governance/cecp/trails/photoreal-provider-strategy-2026-07/` |
| CCC | `sovereign-x/governance/ccc-image-gen.json` v1.1.0 |

1. **Improved:** Codified three honest paths (hybrid remote beauty, hardware Lemonade, external PBR). Wired `photoreal.remote.diffusion` / `photoreal.external.pbr` + `--beauty remote|external-pbr` on `mrs:governed-render` (no fake beauty PNG).
2. **Artificial:** Layout still Engine3D soft-raster; Cycles beauty deferred without Blender; remote diffusion stub without URL.
3. **Measured:** Unit tests for beauty select + CCC provider list; R9 380 honesty bound documented (no local diffusion photoreal claim).
4. **Next bottleneck:** Blender on PATH for Cycles pixels, or remote diffusion URL with verified bytes.

---

## 2026-07-30 — governed-render one-command MVP

| Field | Value |
|-------|-------|
| Trail | `docs/governance/cecp/trails/governed-render-one-command-2026-07/` |
| Command | `npm run mrs:governed-render -- --prompt "…"` |
| Artifact root | `tmp/governed-render/<runId>/` |

1. **Improved:** One clone→command path writes still + verification trail (intent, VII/VIII soft wrap, CCC honesty select, Engine3D soft pixels, hashes). Reproducible `runId` from prompt+seed+size+provider. Proof: `tmp/governed-render/fc03ea56fbc2f394/` (`beautySha256=80487831…`, provider `engine3d.soft`).
2. **Artificial:** Soft-raster boxes + fixture face; cinematic grade/SSAO/DOF are proxies — not film plates or SDXL.
3. **Measured:** `beautySha256` stable across rerun; Lemonade explicitly `held` / `pixelsProduced: false`.
4. **Next bottleneck:** Scene richness / materials vs probe look; CL-Gen soft-raster OpenCL still partial and must not block this MVP.

---

## 2026-07-30 — verification-cycle-media

| Field | Value |
|-------|-------|
| Trail | `docs/governance/cecp/trails/verification-cycle-media-2026-07-30/` |
| Best still | Engine3D dim-room cinematic-v2 |
| SX OpenCL | radial coral probe (not scene plate) |

1. **Improved:** Cataloged best video/still/clip; CCC-ImageGen + SX auto still + Engine3D VII path re-verified; ESFR `PASS_WITH_GAPS` / `PROMOTE_WITH_GAPS`.
2. **Artificial:** OpenCL Tonga still = soft radial glow; Engine3D = fixture soft-raster; Lemonade no pixels.
3. **Measured:** Artifact catalog sizes; SX `lemonadeOk: false` with OpenCL fallback; Inspector/ESFR tables.
4. **Next bottleneck:** One-command governed render + honest provider prefer (this turn).

---

## 2026-07-30 — CCC-ImageGen

| Field | Value |
|-------|-------|
| Trail | `docs/governance/cecp/trails/ccc-image-gen-2026-07/` |
| Contract | `sovereign-x/governance/ccc-image-gen.json` |

1. **Improved:** Image gen is provider-capable (not GPU-hard-block); fallback logging; `opencl.gen` added to priority after `local.gpu`.
2. **Artificial:** Deferred CPU/remote stubs; Lemonade often no pixels on R9 380 / FX-8350.
3. **Measured:** Unit tests for selection + fallbackUsed; probe CLI.
4. **Next bottleneck:** Real pixels without fake PNG — Engine3D soft as proof renderer; Lemonade hold.

---

## 2026-07 — Amendment VII soft gates (world-engine / cinematic)

| Field | Value |
|-------|-------|
| Related | `world-engine-probe-2026-07`, amendment-vii before/after proofs |

1. **Improved:** Soft biometric scale + organic asymmetry on fixture face; CKL HALT authority preserved for deny paths.
2. **Artificial:** Still soft-raster geometry; world-profile architecture is stub-rich, not scanned rooms.
3. **Measured:** Before/after PNGs under `docs/4d-engine/proofs/world-engine/`; gate reports in JSON.
4. **Next bottleneck:** Material/light realism within soft-raster ceiling.

---

## 2026-07 — cinematic-quality-v2

| Field | Value |
|-------|-------|
| Trail | `docs/governance/cecp/trails/cinematic-quality-v2-2026-07/` |
| Artifacts | `tmp/book-movie-ch1/showcase-cinematic-v2/` |

1. **Improved:** First-10s + 30s @24fps; DOF/MB/dust/grade/dramatic lights on Engine3D path.
2. **Artificial:** Abstract/fixture humans & rooms; not photoreal film.
3. **Measured:** Showcase durations/resolutions in trail README; soft-raster upgrade flags.
4. **Next bottleneck:** Photoreal needs capable beauty provider (Lemonade held) or richer Engine3D assets.

---

## 2026-07 — showcase-30s (pre-v2)

| Field | Value |
|-------|-------|
| Artifacts | `tmp/book-movie-ch1/showcase-30s/` |

1. **Improved:** Short camera-motion reel + SX OpenCL still proof beside Engine3D plates.
2. **Artificial:** Soft-raster ceiling obvious; OpenCL probe not Mandala scene.
3. **Measured:** Still file sizes; SX route proof JSON.
4. **Next bottleneck:** Cinematic-v2 lighting/SSAO upgrade (landed next).

---

## Standing holds

| Item | Status |
|------|--------|
| Lemonade SD pixels | **held** until consistent `pixelsProduced: true` |
| Photoreal / SDXL claims | **false** on current R9 380 soft-raster path |
| Photoreal remote / external PBR | **declared** stubs — configure URL + verify pixels before claim |
| CL-Gen OpenCL soft-raster | **partial** — continue; do not block governed-render MVP |
| ESFR framing | Prefer `PASS_WITH_GAPS` / `PROMOTE_WITH_GAPS` when evidence partial |
