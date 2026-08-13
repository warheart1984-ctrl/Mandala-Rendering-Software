# Photoreal Contract v1.0

> **Status:** `declared` — design-only deliverable from the Axiom-X Architect. Becomes **partial** when Builder lands file manifest, **enforced** when `npm run test:photoreal` passes.
> **Contract version:** 1.0.0 · **Owner:** Axiom-X Architect · **Consumer:** Builder / Implementor
> **Constitutional posture:** Appearance Contract (hot-swappable with anime.v1, technical.v1, vision.v1)

---

## Intent

A **photorealistic appearance contract** that consumes RT4D Geometric Truth (projected geometry, normals, depth, visibility, 4D worldline data) and produces physically-based rendering with global illumination, environment lighting, and physically-based materials.

Reference slice (mandatory vertical slice): **10-second "Golden Hour Architecture"** — 300 frames @ 30 fps, 1920×1080, path-traced, deterministic `manifest.json` with per-frame hashes, provenance HUD.

**Required topology:**

```
         RT4D Geometric Truth
                   │
                   ▼
      Photoreal Appearance Contract
                   │
         ┌─────────┼─────────┐
         ▼         ▼         ▼
    Materials   Lighting   Camera
    (PBR)       (IBL/GI)   (DoF/Motion)
         │         │         │
         └─────────┼─────────┘
                   ▼
           Path Integrator
                   │
                   ▼
           Denoiser / Compositor
                   │
                   ▼
           Presentation (PNG/EXR/MP4)
```

---

## 1. Layer Contracts

### 1.1 Material System (PBR)

**Responsibility.** Own physically-based material definitions and evaluation. Consumes Geometric Truth (normals, tangents, UVs) and Appearance Truth (lighting environment) to produce BSDF evaluations.

**Inputs.** 
- Geometric Truth: `normal`, `tangent`, `bitangent`, `uv`, `position_3d`, `depth`, `visibility`
- Appearance: `lighting_environment`, `camera`, `temporal_history`
- Material definitions: `material_id` → `MaterialDefinition`

**Outputs.** 
- `bsdf_eval`: `f(wi, wo)` for direct lighting
- `bsdf_pdf`: probability density for importance sampling
- `bsdf_sample`: `wo` sampled from BSDF
- `material_id` per hit

**Reuses:** `src/render/rt4d/material/` (GGX, Lambertian, Disney, Glass, Conductor, Subsurface, ThinFilm, Layered)

**Creates:** `src/render/photoreal/material/`

```js
// src/render/photoreal/material/PBRMaterial.js
export class PBRMaterial {
  constructor(definition) { /* albedo, roughness, metallic, specular, clearcoat, ... */ }
  evaluate(wi, wo, normal, tangent, uv) { /* → { f, pdf } */ }
  sample(wo, normal, tangent, uv, rng) { /* → { wi, f, pdf } */ }
  pdf(wi, wo, normal, tangent, uv) { /* → number */ }
}

export function createMaterial(definition) { /* factory */ }
export function evaluateMaterial(materialId, wi, wo, geom) { /* → { f, pdf } */ }
export function sampleMaterial(materialId, wo, geom, rng) { /* → { wi, f, pdf } */ }
export function materialPdf(materialId, wi, wo, geom) { /* → number */ }
```

**Material Definition Schema:**
```json
{
  "material_id": "gold",
  "type": "conductor",
  "albedo": [1.0, 0.766, 0.336],
  "roughness": 0.1,
  "anisotropy": 0.0,
  "ior": [1.0, 1.0, 1.0],
  "extinction": [1.0, 1.0, 1.0]
}
```

### 1.2 Lighting Environment (IBL + Analytic)

**Responsibility.** Own all lighting: environment maps (HDR), analytic lights (sun, area, point, spot), sky models, emissive geometry.

**Inputs.** 
- Geometric Truth: `position_3d`, `normal`, `visibility`
- Scene: `light_list`, `sky_model`, `env_map`, `emissive_materials`
- 4D: `worldline_time`, `sun_worldline` (from Geometric Truth)

**Outputs.**
- `direct_lighting`: `L_direct(wi)` per light
- `environment_lighting`: `L_env(wi)` from IBL
- `sky_radiance`: `L_sky(wi)` from sky model
- `emissive_radiance`: `L_emissive(wi)` from emissive surfaces

**Creates:** `src/render/photoreal/lighting/`

```js
// src/render/photoreal/lighting/EnvironmentLighting.js
export class EnvironmentLighting {
  constructor(config) { /* hdr_path, sky_model, sun_worldline, ... */ }
  evaluateDirect(wi, geom) { /* → { radiance, pdf, light_id } */ }
  evaluateEnv(wi) { /* → radiance */ }
  evaluateSky(wi) { /* → radiance */ }
  evaluateEmissive(wi, geom) { /* → radiance */ }
  sampleDirect(geom, rng) { /* → { wi, radiance, pdf, light_id } */ }
  sampleEnv(rng) { /* → { wi, radiance, pdf } */ }
}
```

### 1.3 Camera & Lens (DoF + Motion Blur)

**Responsibility.** Pure 3D camera with physically-based lens simulation.

**Inputs.** 
- Pure 3D: `eye`, `target`, `fov`, `aperture`, `focal_length`, `sensor_size`, `shutter_angle`, `shutter_offset`
- 4D (optional): `temporal_coordinate` for motion blur

**Outputs.**
- `ray_origin`, `ray_direction` per pixel
- `depth_of_field` parameters
- `motion_blur` parameters

**Creates:** `src/render/photoreal/camera/`

```js
// src/render/photoreal/camera/PhysicalCamera.js
export class PhysicalCamera {
  constructor(config) { /* fov, aperture, focal_length, sensor, shutter... */ }
  generateRay(x, y, rng) { /* → { origin, direction, weight } */ }
  depthOfField(depth) { /* → { coc_radius, focus_distance } */ }
  motionBlur(t0, t1) { /* → { velocity, weight } */ }
  static cinematic(N, FRAMES, W, H) { /* pure 3D, no 4D input */ }
}
```

### 1.4 Path Integrator

**Responsibility.** Monte Carlo path integration combining all above.

**Inputs.** 
- `scene`: geometry, materials, lights, camera
- `integrator_config`: `max_depth`, `rr_depth`, `spp`, `strategy`

**Outputs.**
- `radiance` per pixel per sample
- `aovs`: `albedo`, `normal`, `depth`, `motion`, `material_id`, `light_id`, `object_id`, `direct`, `indirect`, `emission`

**Creates:** `src/render/photoreal/integrator/`

```js
// src/render/photoreal/integrator/PathIntegrator.js
export class PathIntegrator {
  constructor(config) { /* max_depth, rr_depth, spp, strategy, ... */ }
  integrate(scene, camera, rng) { /* → { radiance, aovs } per pixel */ }
  trace(ray, depth, throughput, rng) { /* → { radiance, aovs } */ }
  directLighting(ray, hit, rng) { /* → { radiance, aovs } */ }
  indirectLighting(ray, hit, depth, rng) { /* → { radiance, aovs } */ }
}
```

### 1.5 Denoiser / Compositor

**Responsibility.** Temporal + spatial denoising, compositing, color management.

**Inputs.** 
- `radiance` + `aovs` per frame
- `temporal_history`: previous frames' radiance + motion vectors

**Outputs.**
- `denoised_radiance`
- `composited_frame` (color + AOV overlays if HUD)

**Creates:** `src/render/photoreal/denoiser/`, `src/render/photoreal/compositor/`

```js
// src/render/photoreal/denoiser/TemporalDenoiser.js
export class TemporalDenoiser {
  constructor(config) { /* history_length, sigma_color, sigma_spatial, ... */ }
  denoise(current_frame, history) { /* → denoised_radiance */ }
}
```

---

## 2. Constitutional Boundary

Every photoreal element maps to Appearance Truth layer; Geometric Truth unchanged.

| Element | Appearance Truth Input | Kernels (Appearance) | Evidence |
|---------|------------------------|----------------------|----------|
| **Materials** | `normal`, `tangent`, `uv`, `material_id` | `bsdf_eval`, `bsdf_pdf`, `bsdf_sample` | `material_id`, `bsdf_f`, `bsdf_pdf` per hit |
| **Lighting** | `position_3d`, `normal`, `visibility`, `worldline_time` | `direct_eval`, `env_eval`, `sky_eval`, `emissive_eval` | `light_id`, `radiance`, `pdf` per sample |
| **Camera** | `eye`, `target`, `aperture`, `focal`, `sensor`, `shutter` | `generate_ray`, `dof`, `motion_blur` | `ray_origin`, `ray_dir`, `dof_params`, `mb_params` |
| **Integrator** | all above + `max_depth`, `rr_depth` | `trace`, `direct`, `indirect` | `radiance`, `aovs`, `spp` per pixel |
| **Denoiser** | `radiance`, `aovs`, `motion_vectors`, `history` | `temporal_filter`, `spatial_filter` | `denoised_radiance`, `variance_estimate` |

**Determinism note:** Reference CPU path tracer is BIT_EXACT. GPU paths are NUMERIC_EQUIVALENT (bounded FP difference). AI denoiser = NON_AUTHORITATIVE.

---

## 3. Determinism Contract

### Canonical Constants

| Constant | Value |
|---|---|
| `CONTRACT_VERSION` | `"1.0.0"` |
| `CANONICAL_SEED` | `0x5EED4D00` |
| `WIDTH` / `HEIGHT` | `1920` / `1080` |
| `FRAMES` | `300` |
| `FPS` | `30` |
| `SPP` | `64` |
| `MAX_DEPTH` | `16` |
| `RR_DEPTH` | `4` |
| `INTEGRATOR_STRATEGY` | `"path"` |
| `DENOISER_HISTORY` | `8` |
| `CAMERA_APERTURE` | `2.8` |
| `CAMERA_FOCAL` | `35mm` |
| `CAMERA_SENSOR` | `36x24mm` |
| `SUN_WORLDLINE` | from Geometric Truth (Golden Hour) |
| `SKY_MODEL` | `"hosek_wilkie"` |
| `ENV_MAP` | `"golden_hour_4k.hdr"` |

### Forbidden in Render Path
`Date.now()`, `Math.random()`, `performance.now()`, `process.hrtime()`. Only seeded `mulberry32` / `pcg32` allowed.

### Runtime Fingerprint
```
runtimeFingerprint = sha256(JSON.stringify({
  contractVersion: "1.0.0",
  seed: "0x5EED4D00",
  frames: 300, fps: 30, width: 1920, height: 1080,
  spp: 64, maxDepth: 16, rrDepth: 4,
  camera: { aperture: 2.8, focal: 35, sensor: [36,24] },
  integrator: { strategy: "path", maxDepth: 16, rrDepth: 4 },
  denoiser: { history: 8 },
  sunWorldline: "from_geometric_truth",
  skyModel: "hosek_wilkie",
  envMap: "golden_hour_4k.hdr"
})).slice(0, 32)
```

### Per-Frame Hash
```
canonicalFrameRecord(N) = {
  frame: N, timeSeconds: N/30, t: N*0.03333, replayToken,
  camera: { eye, target, focal, aperture, dof_params },
  integrator: { spp, maxDepth, strategy },
  denoiser: { history_length, sigma_color, sigma_spatial },
  aovs: { radiance, albedo, normal, depth, motion, material_id }
}
frameHash(N) = sha256(JSON.stringify(canonicalFrameRecord(N))).slice(0, 32)
```

### Manifest Schema
```json
{
  "engine": "mrs-renderer-core/constitutional",
  "kind": "cinematic-4d-photoreal",
  "contractVersion": "1.0.0",
  "seed": "0x5EED4D00",
  "width": 1920, "height": 1080, "frames": 300, "fps": 30,
  "runtimeFingerprint": "<sha256 32hex>",
  "worldId": "world-photoreal-golden-hour-001",
  "timelineId": "timeline-photoreal-golden-hour-v1",
  "intentId": "render-4d-photoreal-golden-hour",
  "physics": { "metric": "Minkowski", "signature": [-1,1,1,1], "c": 1, "dtau": 0.03, "steps": 300 },
  "integrator": { "spp": 64, "maxDepth": 16, "rrDepth": 4, "strategy": "path" },
  "camera": { "aperture": 2.8, "focal": 35, "sensor": [36,24], "shutter": 180 },
  "denoiser": { "history": 8, "temporal": true },
  "conformance": { "allPass": true, "checks": 16 },
  "evidence": { "recorder": "PhotorealEvidenceRecorder", "frameRecords": 300, "frameHashAlg": "sha256" },
  "frames": [ { "frame": 0, "timeSeconds": 0.0, "replayToken": "<hex>", "frameHash": "<hex>" } ],
  "stills": { "000": "still_000.exr", "150": "still_150.exr", "299": "still_299.exr" },
  "video": { "file": "golden_hour_photoreal.mp4", "bytes": 0, "sha256": "<hex>" },
  "note": "Deterministic photorealistic 4D path tracing. Not AI."
}
```

---

## 4. File Manifest

All paths under `mrs/packages/renderer-core/` unless noted. No protected paths touched.

| Path | Action | Owner |
|---|---|---|
| `docs/contracts/mrs-4d-photoreal/README.md` | Create — this contract | Architect |
| `src/render/photoreal/material/PBRMaterial.js` | Create | Builder |
| `src/render/photoreal/material/DisneyMaterial.js` | Create | Builder |
| `src/render/photoreal/material/ConductorMaterial.js` | Create | Builder |
| `src/render/photoreal/material/GlassMaterial.js` | Create | Builder |
| `src/render/photoreal/material/SubsurfaceMaterial.js` | Create | Builder |
| `src/render/photoreal/material/ThinFilmMaterial.js` | Create | Builder |
| `src/render/photoreal/material/LayeredMaterial.js` | Create | Builder |
| `src/render/photoreal/material/index.js` | Create — export | Builder |
| `src/render/photoreal/lighting/EnvironmentLighting.js` | Create | Builder |
| `src/render/photoreal/lighting/SkyModel.js` | Create | Builder |
| `src/render/photoreal/lighting/AnalyticLight.js` | Create | Builder |
| `src/render/photoreal/lighting/index.js` | Create — export | Builder |
| `src/render/photoreal/camera/PhysicalCamera.js` | Create | Builder |
| `src/render/photoreal/camera/index.js` | Create — export | Builder |
| `src/render/photoreal/integrator/PathIntegrator.js` | Create | Builder |
| `src/render/photoreal/integrator/BDPTIntegrator.js` | Create | Builder |
| `src/render/photoreal/integrator/VolumetricIntegrator.js` | Create | Builder |
| `src/render/photoreal/integrator/index.js` | Create — export | Builder |
| `src/render/photoreal/denoiser/TemporalDenoiser.js` | Create | Builder |
| `src/render/photoreal/denoiser/OIDNDenoiser.js` | Create | Builder |
| `src/render/photoreal/denoiser/index.js` | Create — export | Builder |
| `src/render/photoreal/compositor/PhotorealCompositor.js` | Create | Builder |
| `src/render/photoreal/compositor/index.js` | Create — export | Builder |
| `src/render/photoreal/evidence/PhotorealEvidenceRecorder.js` | Create | Builder |
| `src/render/photoreal/evidence/index.js` | Create — export | Builder |
| `src/render/photoreal/PhotorealEnvironment.js` | Create — orchestrates all | Builder |
| `src/render/photoreal/index.js` | Create — export | Builder |
| `src/render/photoreal/constitutional/test/photoreal.test.js` | Create — acceptance tests | Builder |
| `schemas/photoreal_golden_hour.timeline.json` | Create — default timeline | Builder |
| `schemas/photoreal_golden_hour.edl` | Create — EDL | Builder |
| `mrs/packages/renderer-core/scripts/render-photoreal-golden-hour.mjs` | Create — CLI | Builder |
| `mrs/packages/renderer-core/package.json` | Modify — add scripts | Builder |

---

## 5. Acceptance Criteria (Executable)

Single test file: `src/render/photoreal/constitutional/test/photoreal.test.js` (`node:test` + `node:assert/strict`)

### Materials
- [ ] **M1** BSDF energy conservation: `∫ f(wi, wo) cosθ dω ≤ 1` for all materials
- [ ] **M2** Reciprocity: `f(wi, wo) = f(wo, wi)` for all materials
- [ ] **M3** Disney material: matches reference implementation (albedo=0.8, rough=0.3, metal=0.0)
- [ ] **M4** Conductor: matches measured gold/silver/copper (spectral or RGB)
- [ ] **M5** Glass: `f + f_trans = 1` (energy conservation), correct IOR
- [ ] **M6** Subsurface: diffusion profile matches dipole approximation

### Lighting
- [ ] **L1** Environment map: `L_env(wi)` matches reference HDR
- [ ] **L2** Sky model: Hosek-Wilkie matches reference for sun elevation [-90°, 90°]
- [ ] **L3** Analytic lights: inverse square falloff, correct angular falloff
- [ ] **L4** Emissive: `L_emissive = emission * visibility`

### Camera
- [ ] **C1** DoF: CoC radius matches thin-lens formula
- [ ] **C2** Motion blur: shutter open/close matches shutter angle
- [ ] **C3** Pure 3D: no 4D input in `src/render/photoreal/camera/**`

### Integrator
- [ ] **I1** Path tracing: unbiased (white furnace test → 1.0)
- [ ] **I2** Russian roulette: unbiased at `rr_depth`
- [ ] **I3** Direct lighting: MIS weights sum to 1
- [ ] **I4** Indirect: multiple bounces correct (cornell box)

### Denoiser
- [ ] **D1** Temporal stability: no flicker in static scene
- [ ] **D2** Detail preservation: high-frequency detail > threshold
- [ ] **D3** No ghosting: moving objects clean

### Evidence
- [ ] **V1** Recorder lifecycle: begin/record/finalize
- [ ] **V2** Frame fields: intentId, timelineId, worldId, timeSeconds, parameters
- [ ] **V3** Bundle fields: id, worldId, timelineId
- [ ] **V4** Per-frame hash determinism across runs

### Determinism
- [ ] **DET1** BIT_EXACT reference: two runs → byte-identical EXR/MP4
- [ ] **DET2** Forbidden API scan: no `Date.now|Math.random|performance.now`
- [ ] **DET3** Fingerprint matches §3 canonical constants

### Commands
`npm run test:photoreal` · `npm test` · `npm run demo:photoreal` · `npm run demo:photoreal-full`

---

## 6. Performance Budget

Target: **≤ 5 min/frame** at 1920×1080×64 spp on reference CPU (AMD Ryzen 9 class; no GPU required for reference).

| Stage | Budget/frame |
|---|---|
| Scene traversal | 500 ms |
| Path tracing (64 spp) | 200 s |
| Denoising (temporal) | 2 s |
| Compositing | 500 ms |
| **Total** | **≈ 203 s** → 300 frames ≈ 17 hours + ffmpeg |

---

## 7. Handoff Order

1. **Architect** → finalize contract, timeline, EDL
2. **Builder** → land §4 file manifest (materials, lighting, camera, integrator, denoiser, compositor, evidence, CLI, test, package.json)
3. **Implementor** → wire PBR materials, IBL, path integrator, denoiser; get `npm run test:photoreal` green
4. **Reviewer** → verify no protected-path edits, no new deps, no forbidden APIs, MIT-compatible
5. **Inspector** → run `npm test` + `npm run test:conformance`; confirm 16/16 + no regressions
6. **ESFR** → run `--verify` (byte-identical EXR/MP4), cross-host data-determinism spot check

---

> **Key invariant:** Photoreal Contract may change appearance semantics, but it may not silently redefine World Truth or Geometric Truth. The 4D worldline, projection mathematics, and physics remain sovereign.