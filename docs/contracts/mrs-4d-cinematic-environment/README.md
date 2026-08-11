# MRS 4D Cinematic Environment Contract

> **Status: `declared`** — design-only deliverable from the MRS Architect. The layers below become **partial** as the Builder lands the file manifest (§4) and **enforced** when `npm run test:cinematic` passes (§5).
> **Contract version:** 1.1.0 · **Owner:** MRS Architect · **Consumer:** Builder / Implementor
> **Constitutional posture:** CECP (partial) · ESFR (partial skill/protocol) · CHEA / CCR / CDGF (declared). Nothing here is enforced governance; this is a build contract.
>
> **Changelog — v1.1.0 (2026-08-11):** Added 3D objects (buildings, foliage, props) and environment layers (clouds, fog) per A+B scope. New layers: CloudField (certified 4D wind vector), FogField (certified 4D density scalar). Scene3D extended with 6 buildings, tree clusters, grass strips, props. Compositor draw order updated: clouds → fog → stars. New acceptance: E8/E9 (clouds/fog), S5 (3D objects), C4 (draw order), V10 (evidence).

## Intent

Product-owner brief (binding): a cinematic **4D→3D animation pipeline** where the **4D worldline drives the ENVIRONMENT** — sun, ocean waves, and sky are generated from genuine 4D math (a 4D geodesic, 4D null wave vectors, a 4D Minkowski angle), each element flowing through `Projector4DTo3D` → `CertifiedProjection` — and **3D makes everything else** (buildings, hero figure, ground, and the CAMERA are ordinary 3D). The camera MUST be a pure 3D cinematic camera; 4D→3D projection MUST NOT feed the camera path. The audience experiences a 3D film whose environment has a genuinely 4D certified origin.

Reference slice (mandatory vertical slice, must be implementable without further decisions): **10-second sunrise** — 300 frames @ 30 fps, 1280×720, node-canvas soft-raster, ffmpeg MP4, deterministic `manifest.json` with per-frame hashes, provenance HUD.

Required topology (preserve exactly):

```
              ┌───────────────┐
              │ 4D Worldline  │
              └───────┬───────┘
                      ▼
             Certified Environment
                      ▼
                4D → 3D
                      ▼
               Environment (3D)
                      │
3D World (buildings/hero/ground) ──┤
                      ▼
               3D Cinematic Camera
                      ▼
                 Composite
```

---

## 1. Layer Contracts

Layer responsibilities, inputs, outputs, and concrete interfaces. Interfaces name the real constitutional classes; builders wire directly. Existing files are reused as-is; nothing under protected paths (§4) is touched.

### 1.1 4D Environment (CertifiedSun + CertifiedEnvironment)

**Responsibility.** Own the single canonical 4D worldline: the sun is a timelike geodesic in Minkowski spacetime, advanced by the existing `ConstitutionalRuntime`, and projected 4D→3D by the existing `Projector4DTo3D` with per-step `CertifiedProjection`. The layer exposes pure per-frame environment records to the compositor. No RNG, no wall-clock, no keyframing: the sun's position is *derived* every frame.

**Inputs.** Canonical constants (§3): metric signature `[-1,1,1,1]`, `c=1`, `dtau=0.03`, `d4=4`, `frames=300`, sun initial position/velocity, `intentId`/`worldId`/`timelineId`.

**Outputs.** `EnvironmentFrameRecord` (shape below) per frame; `runtimeFingerprint`; manifest fragment; replay verification.

**Reuses:** `src/render/rt4d/constitutional/runtime/ConstitutionalRuntime.js` (`createInitializedRuntime`, `step()`, `verifyReplay()`, `getProvenanceChain()`), `arena/MetricTensor.js` (`MetricTensor.minkowski()`), `tensor/index.js` (`FourVector`), `kinematics/index.js` (`FourVelocity`), `projection/index.js` (`ProjectionPolicy.perspective`, `Camera4D`, `CertifiedProjector`), `governance/index.js` (`certifyTensor`, `AUTHORITIES`), `governance/MathValidity.js` (`computeErrorBound`).

**Creates:** `src/render/rt4d/environment/CertifiedSun.js`, `SkyField.js`, `OceanField.js`, `EnvironmentEvidence.js`, `CertifiedEnvironment.js`, `index.js`.

```js
// src/render/rt4d/environment/CertifiedSun.js
export class CertifiedSun {
  /**
   * config: {
   *   metricSignature?: number[], c?: number, dtau?: number, frames?: number,
   *   d4?: number, initialPosition?: number[4], initialVelocity?: number[4],
   *   governance?: object  // strictMode:false, requireReplay:false, requireAudit:false (as in existing scripts)
   * }
   */
  constructor(config = {});
  /** Advance the worldline `frames` steps; store step records. Deterministic. */
  async advance();                 // -> Promise<SunStepRecord[]>
  /** Certified sun state at step N. Pure once advanced. */
  stepRecord(N);                   // -> SunStepRecord
  /** The underlying ConstitutionalRuntime (for verifyReplay / provenance chain). */
  getRuntime();                    // -> ConstitutionalRuntime
  getProvenanceChain();            // -> runtime.getProvenanceChain()
}

// SunStepRecord = {
//   step: number,              // N
//   position4: number[4],      // slots (ct, s1, s2, s3)
//   velocity4: number[4],
//   p3: { x: number, y: number, z: number },   // Projector4DTo3D.project() output
//   projection: object,        // raw projection result (mode, parameters, point4D, degenerate, rejected)
//   provenance: {              // === runtime.provenance from step()
//     positionCert:  { certificationId, errorBound: { max, sources }, ... },
//     velocityCert:  { certificationId, errorBound: { max, sources }, ... },
//     momentumCert:  { certificationId, errorBound: { max, sources }, ... },
//     projection:    { projectionId, errorBound: { finite, roundtripResidual, conditionEstimate, withinTolerance }, ... },
//     replayToken: string
//   },
// }
```

### 1.2 Sky Field (SkyField)

**Responsibility.** Sky dome color field generated from 4D inputs: one certified 4D zenith control direction (projected once) plus the certified sun projection per frame. The *dawn tint* is a pure function of the certified sun elevation; the *glow bias* is a genuine Minkowski quantity — the rapidity of the sun's 4-velocity relative to the rest-frame time axis.

**Inputs.** `sunDir(N)` and `dawnFactor(N)` from the environment record; canonical seed; fixed zenith 4-vector `(0,1,0,0)` (slots `(ct=0, s1=1, s2=0, s3=0)` — slot 1 is world-y, so this is the true up/zenith control).

**Outputs.** Coarse RGBA color grid (`96×64`) per frame; zenith `CertifiedProjection` (once); dawn palette.

**Creates:** `src/render/rt4d/environment/SkyField.js`.

```js
// src/render/rt4d/environment/SkyField.js
export function skyDawnFactor(sunDirY, opts = { horizon: -0.25, span: 0.85 });
  // -> clamp((sunDirY + horizon) / span, 0, 1)

export function minkowskiRapidity(fourVelocity4, reference4 = [1,0,0,0], metric);
  // -> acosh(max(1, -g(u, r)))  // 4D dawn bias; g = Minkowski inner product

export class SkyDome {
  constructor(config);            // { gridW = 96, gridH = 64, zenith4 = [0,1,0,0], seed }
  /** Certified once: CertifiedProjector.projectCertified(zenith4, policy, camera4d, opts) */
  certifyZenith(certifiedProjector, policy, camera4d, opts);  // -> CertifiedProjection
  /** Pure per-frame color grid. data is RGBA floats, rows-major. */
  colorGrid({ dawn, sunDir });    // -> { data: Float32Array(gridW*gridH*4), gridW, gridH }
  static dawnPalette(dawn);       // -> { top:[r,g,b], horizon:[r,g,b], glow:[r,g,b] }
}
```

### 1.3 Ocean Field (OceanField)

**Responsibility.** Ocean waves generated from genuine 4D math: a bank of **null 4D wave vectors** `k^μ` (lightlike: `g(k,k)=0`), each certified once via `certifyTensor(..., AUTHORITIES.FIELD_ENGINE, [{ name: "null_wave_vector", residual: |g(k,k)|, tolerance: 1e-9 }])`. The heightfield `h(x,z,τ)` is a sum of sines in the spatial part of those 4D wave vectors, with time base `τ = N·dtau` — the certified worldline proper time. A small set of **ocean anchors** (4D points on the wave surface) is certified per frame through `CertifiedProjector.projectCertified`, giving the ocean element its per-frame `errorBound`.

**Inputs.** Canonical wave specs (§3), ocean grid bounds, per-frame `tau`.

**Outputs.** Certified wave vectors; per-frame heightfield `Float32Array` (rows-major, `96×40`); per-frame certified anchors.

**Creates:** `src/render/rt4d/environment/OceanField.js`.

```js
// src/render/rt4d/environment/OceanField.js
export const CANONICAL_WAVES = [
  { omega: 0.90, dir: [ 0.12, 0.99], amplitude: 0.090 },  // swell
  { omega: 1.70, dir: [ 0.82, 0.57], amplitude: 0.055 },
  { omega: 2.30, dir: [-0.45, 0.89], amplitude: 0.035 },
  { omega: 3.10, dir: [ 0.98,-0.20], amplitude: 0.020 },  // foreground chop
];
export function buildWaveVectors(waveSpecs);
  // -> [{ k: number[4], A, omega, dir, phase0 }]   // k = (omega, omega*dx, 0, omega*dz) — null by construction
export function certifyWaveVectors(waves, metric); // -> CertifiedTensor[]  (null check, tol 1e-9)
export function oceanHeight(x, z, tau, waves);     // -> number  (pure)
  // h = Σ A_i sin(kx_i*x + kz_i*z - omega_i*tau + phase0_i)
export function buildOceanHeightfield({ xMin, xMax, zMin, zMax, cols, rows, waves, tau });
  // -> Float32Array(cols*rows), rows-major (row = z, col = x)
export function projectOceanAnchors(anchors, projector, policy, camera, opts);
  // anchors: [{ x, z }]  — canonical anchors (§3)
  // p4(x,z) = FourVector(0, x, oceanHeight(x,z,tau), z, metric)
  // -> [{ anchor, p4, projection, errorBound, cert }]   // CertifiedProjector.projectCertified per anchor
```

### 1.4 Cloud Field (CloudField)

**Responsibility.** Procedural cloud layer on the sky dome. A single certified 4D **wind vector** `w^μ` (spacelike: `g(w,w) > 0`) is certified once and advects a 2D noise cloud grid over certified proper time `τ = N·dtau`. Cloud opacity modulated by dawn factor (fade at night).

**Inputs.** Canonical constants (§3): certified wind vector `w^μ`, cloud grid size `96×64`, cloud seed, per-frame `tau`.

**Outputs.** Certified wind vector; per-frame cloud opacity grid `Float32Array(96×64)`; per-frame wind advection displacement.

**Creates:** `src/render/rt4d/environment/CloudField.js`.

```js
// src/render/rt4d/environment/CloudField.js
export const CLOUD_GRID = { cols: 96, rows: 64 };
export const CLOUD_SEED = 0x5EED4D00 ^ 0xC10UD5;

export function buildWindVector(metric);
  // -> number[4] (spacelike: g(w,w) = 1)
export function certifyWindVector(wind, metric); // -> CertifiedTensor (spacelike check, tol 1e-9)
export function buildCloudNoise(gridW, gridH, seed); // -> Float32Array(gridW*gridH)
export function advectClouds(noise, windSpatial, tau, gridW, gridH); // -> Float32Array(gridW*gridH)
export function cloudOpacity(advectedNoise, dawn); // -> Float32Array(gridW*gridH) [0,1]
```

### 1.5 Fog Field (FogField)

**Responsibility.** Exponential fog from a certified 4D **density scalar** `ρ`. Fog factor `1 - exp(-ρ * depth)` applied in compositor as screen-space radial gradient.

**Inputs.** Canonical density `ρ` (certified scalar), per-frame camera depth range.

**Outputs.** Certified density `ρ`; per-frame fog factor function.

**Creates:** `src/render/rt4d/environment/FogField.js`.

```js
// src/render/rt4d/environment/FogField.js
export const FOG_DENSITY = 0.0015; // world units^-1
export const FOG_SEED = 0x5EED4D00 ^ 0xF06D3N5;

export function certifyFogDensity(rho, metric); // -> CertifiedTensor (scalar)
export function fogFactor(depth, rho); // -> 1 - exp(-rho * depth)
```

**Responsibility.** Everything "3D makes": pier, beach strip, **ten buildings** (towers, domes, walls, arches), **hero figure**, **two lamps**, **tree clusters**, **grass strips**, **shrubs**, **props** (crates, barrels, benches, lanterns, debris). Static in world space; no keyframing; no 4D input. Reuses `drawSolid` from `src/render/solid.js` (painter's-algorithm flat fill) for all geometry.

**Inputs.** `seed` (for deterministic window-light/foliage/prop placement only), static geometry tables (§3).

**Outputs.** Pure, cached scene graph + draw function.

**Creates:** `src/cine3d/Scene3D.js`.

```js
// src/cine3d/Scene3D.js
export function buildScene3D(seed);   // pure + cached
  // -> { pier, beach, buildings: Box4[], foliage: Foliage[], props: Prop[], hero: HeroFigure, lamps: Lamp[] }
export function drawScene3D(ctx, scene, cam, light, opts);
  // uses drawSolid(ctx, projected, faces, vertices4d, { ambient, diffuse, specular, ... })
```

Scene tables (exact, world units, y-up, camera looks toward −z at the sea):

| Object | Geometry | Position | Size | Tint |
|---|---|---|---|---|
| Pier deck | quad | center (0, 0, 2.1) | x∈[−3.2,3.2], z∈[1.2,3.0] | `#3a2f2b` |
| Beach strip | quad | center (0, 0, 5.5) | x∈[−40,40], z∈[3.0,8.0] | `#4a4238` |
| B1 | box (12 tris) | (−15, 0, 4.5) | 4 × 9 × 4 | `#2b3a55` |
| B2 | box | (−6, 0, 6.0) | 3 × 6 × 3 | `#3a4a66` |
| B3 | box | (7, 0, 5.5) | 3.4 × 7.5 × 3.4 | `#333f5c` |
| B4 | box | (14, 0, 4.0) | 4.5 × 11 × 4.5 | `#243248` |
| B5 | cylinder (16 sides) | (−20, 0, 3.0) | r=2.5, h=12 | `#2a3a4a` |
| B6 | dome (ico subdiv) | (20, 0, 3.5) | r=3.5, h=8 | `#3a3a55` |
| B7 | wall (box) | (−30, 0, 2.0) | 12 × 6 × 1.5 | `#3a2a2a` |
| B8 | arch (box+cut) | (25, 0, 4.0) | 6 × 8 × 2 | `#4a3a3a` |
| B9 | tower (box) | (−10, 0, −5.0) | 3 × 15 × 3 | `#2a2a3a` |
| B10 | spire (pyramid) | (18, 0, −8.0) | 4 × 20 × 4 | `#3a2a4a` |
| Hero | head circle + torso/limbs | (0.35, 0, 1.7) | h≈1.75 | silhouette `#10131c`, rim warm |
| Lamps | 2 poles + glow | (−1.6, 0, 2.1), (2.2, 0, 2.3) | h≈2.6 | `#ffcf9a` glow |
| Tree clusters | trunk box + canopy ico | 12 clusters, beach/pier edge | trunk 0.3×2×0.3, canopy r=2.5 | trunk `#3a2f2b`, canopy `#2a3a2a` |
| Grass strips | quads | 8 strips, beach/transition | 2×0.5×varies | `#3a4a2a` |
| Shrubs | ico low-subdiv | 20 shrubs, scattered | r=0.6–1.2 | `#2a3a1a` |
| Props | crates/barrels/benches/lanterns/debris | 30 items, pier/beach | var | muted tones |

Foliage/prop placement: `mulberry32(CANONICAL_SEED ^ 0xF0F0F0F0)` deterministic.

### 1.5 Cinema / Camera (Camera3D)

**Responsibility.** The movie camera. **Pure 3D.** Its parameters are a pure function of `(N, FRAMES, W, H)` only — never of any 4D→3D output. (Conformance: `binding.*` — the environment→world bindings are separate; the camera has zero bindings to the 4D layer.)

**Creates:** `src/cine3d/Camera3D.js`.

```js
// src/cine3d/Camera3D.js
export class Camera3D {
  constructor({ eye, target, focal });   // focal in pixels
  view();                               // -> { eye, forward, right, up } (normalized, orthonormal)
  project(p);                           // -> { X, Y, z } | null  (near plane 0.08; pure perspective divide)
  static cinematic(N, FRAMES, W, H);    // pure; NO environment input
}
// Canonical move (deterministic function of frame index only):
//   t = N / FRAMES
//   eye    = ( 0.40*sin(2π*0.11*t), 1.30 + 0.06*sin(2π*0.07*t), 2.60 )
//   target = ( 1.80*sin(2π*0.05*t), 0.55, -8.00 )
//   focal  = 0.9 * H
```

### 1.6 Lighting / Materials (Lighting)

**Responsibility.** Single directional sun light whose **direction comes from the certified sun world position** and whose **color shifts with the certified 4D dawn factor** (`dawnFactor` is a function of the certified projection — the dawn shift is therefore 4D-certified). Flat materials via `drawSolid` options.

**Creates:** `src/cine3d/Lighting.js`.

```js
// src/cine3d/Lighting.js
export function sunLight({ dawn, sunWorld, camEye });
  // -> { dir: {x,y,z}, color: [r,g,b], intensity }
  // color = lerp([127,168,217], [255,179,107], dawn)   // cool pre-dawn → warm gold
export function ambientByDawn(dawn);   // -> 0.22 + 0.10*dawn
```

### 1.7 Compositor

**Responsibility.** Fixed draw order (below); applies the deterministic timeline `set_param` clips (`dawnTintBias`, `vignetteStrength`); attaches the frame's provenance record to every rendered frame; writes the HUD.

**Creates:** `src/cine3d/Compositor.js`; CLI orchestrator `scripts/movie-4d-cinematic-sunrise.mjs`.

```js
// src/cine3d/Compositor.js
export function compositeFrame(ctx, { envRecord, scene, cam, light, options });
// Fixed draw order: sky grid (upscaled) → **clouds → fog** → stars (dawn<0.35) → ocean bands →
// sun glow sprite → pier → beach → buildings → foliage → props → lamps → hero → vignette → HUD.
export function drawHud(ctx, envRecord, meta);   // monospace provenance HUD (pattern: existing scripts)
```

---

## 2. Constitutional Boundary

Every 4D-environment element maps to the exact MRS constitutional objects; `errorBound`/provenance attaches per frame as shown. All values are the *existing* APIs — the contract extends, never breaks, `ConstitutionalRuntime`.

| Environment element | 4D origin | Flows through (existing objects) | Where errorBound / provenance attaches (per frame) |
|---|---|---|---|
| **Sun** | Timelike geodesic worldline (initial position/velocity §3) | `ConstitutionalRuntime.step()` → `Projector4DTo3D.project(point, policy, camera)` → `CertifiedProjection.create(result, {...})` → `runtime.provenance.projection` | `frame.sun.errorBound = provenance.projection.errorBound` = `{ finite, roundtripResidual, conditionEstimate, withinTolerance }`; `frame.sun.sourceCertificationId = provenance.projection.sourceCertificationId`; plus `positionCert/velocityCert/momentumCert.errorBound.max` per step |
| **Sky** | Certified 4D zenith control `(0,1,0,0)` + certified sun direction + Minkowski rapidity | `CertifiedProjector.projectCertified(zenith4, policy, camera, opts)` once → `CertifiedProjection`; sun dir derived from the certified sun projection each frame | `frame.sky.errorBound = max(sun projection errorBound.max, zenith errorBound.max)`; `frame.sky.zenithCertId`; `dawnFactor` is a pure function of the certified `sunDir` |
| **Ocean** | Four certified null 4D wave vectors `k^μ` (lightlike, `g(k,k)=0`) + worldline proper time `τ = N·dtau` | `certifyTensor(k, AUTHORITIES.FIELD_ENGINE, [{ name:"null_wave_vector", residual: |g(k,k)|, tolerance: 1e-9 }])` once; per-frame anchors (4D points on the wave surface) via `CertifiedProjector.projectCertified` | `frame.ocean.waveCerts[i].validation.errorBound.max < 1e-9`; `frame.ocean.anchors[i].errorBound = { finite, roundtripResidual, withinTolerance }`; `frame.ocean.tau` |
| **Clouds** | Certified 4D spacelike wind vector `w^μ` (`g(w,w)=1`) + certified cloud noise seed | `certifyTensor(w, AUTHORITIES.FIELD_ENGINE, [{name:"spacelike_wind", residual: g(w,w)-1, tolerance:1e-9}])` once; per-frame advection `displacement = w_spatial * tau`; cloud opacity from noise grid | `frame.cloud.windCert.validation.errorBound.max < 1e-9`; `frame.cloud.opacityGrid = Float32Array(96×64)`; `frame.cloud.tau` |
| **Fog** | Certified 4D density scalar `ρ` | `certifyTensor(rho, AUTHORITIES.FIELD_ENGINE)` once; per-frame `fogFactor = 1 - exp(-rho * depth)` | `frame.fog.densityCert.validation.passed === true`; `frame.fog.factor(depth)` matches analytic |
| **Frame evidence** | All of the above | `EnvironmentEvidenceRecorder` wraps the runtime provenance chain | `frame.replayToken` (runtime sha256 token, deterministic); `frameHash` over the canonical subset (§3) |

**Determinism note (honest):** the existing `CertifiedTensor`/`CertifiedProjection`/`Camera4D` classes stamp non-deterministic audit fields by default (`Date.now()` in `timestamp`/`certificationId`; `Math.random()` in `projectionId`/`cameraId`). This contract does **not** patch those classes — instead the canonical frame record and `frameHash` exclude those fields (see §3), and replay verification uses the deterministic `replayToken` via `runtime.verifyReplay(...)`, which is unchanged.

---

## 3. Determinism Contract

### Canonical constants (the one and only configuration)

| Constant | Value |
|---|---|
| `CONTRACT_VERSION` | `"1.1.0"` |
| `CANONICAL_SEED` | `0x5EED4D00` (decimal `1592610048`) |
| `METRIC_SIGNATURE` | `[-1, 1, 1, 1]` (Minkowski) |
| `C` | `1` |
| `DTAU` | `0.03` |
| `FRAMES` | `300` |
| `FPS` | `30` |
| `WIDTH` / `HEIGHT` | `1280` / `720` |
| `D4` (perspective focal) | `4` — `ProjectionPolicy.perspective(4)` |
| `SUN_INITIAL_POSITION` | slots `(ct, s1, s2, s3) = (0, −0.40, 0, 0)` → `FourVector(0, −0.40, 0, 0, metric)` — slot 1 is world-y, so the sun starts 0.40 below the horizon |
| `SUN_INITIAL_VELOCITY` | slots `(ct, s1, s2, s3) = (√2.9459, 1.35, 0.35, 0.03)` (√2.9459 ≈ 1.7163622; 32-bit-safe decimal `1.71636`) → `FourVelocity.fromProperVelocity(0, −0.40, 0, 0, 1.71636, 1.35, 0.35, 0.03, metric)`; runtime `normalize(c)` re-certifies the mass shell |
| `R_SUN` (sky-dome radius) | `90` world units |
| `DAWN_HORIZON` / `DAWN_SPAN` | `−0.25` / `0.85` |
| `OCEAN_GRID` | `x∈[−40,40]`, `z∈[−120,−6]`, `cols=96`, `rows=40` |
| `OCEAN_ANCHORS` | `(−32,−10)`, `(32,−10)`, `(−32,−60)`, `(32,−60)` |
| `STARS` | `90` stars, `mulberry32(CANONICAL_SEED ^ 0xA5A5A5A5)`, drawn only while `dawnFactor < 0.35` |
| `CLOUD_GRID` | `cols=96`, `rows=64` |
| `CLOUD_SEED` | `CANONICAL_SEED ^ 0xC10UD5` |
| `WIND_VECTOR` | spacelike `w^μ` with `g(w,w)=1`, slots `(0, 0.02, 0, 0.01)` (certified once) |
| `FOG_DENSITY` | `0.0015` world units⁻¹ |
| `FOG_SEED` | `CANONICAL_SEED ^ 0xF06D3N5` |
| `FOLIAGE_SEED` | `CANONICAL_SEED ^ 0xF0F0F0F0` |
| IDs | `worldId = "world-cinematic-sunrise-001"`, `timelineId = "timeline-sunrise-v1"`, `intentId = "render-4d-cinematic-sunrise"` |

**Slot convention (binding):** `FourVector` slots are `(ct, s1, s2, s3)`. Slot 0 is the time-like coordinate (negative in the interval `−ct² + s1² + s2² + s3²`); slot 1 maps through `Projector4DTo3D._perspectiveCoords` (slots `(x=ct, y=s1, z=s2, w=s3)`) to `p3.y` — the **world-y elevation axis**, so the sun below/above-horizon arc is driven by slot 1; slot 3 is the perspective depth `w` (denominator `d − w`). With the v1.0.1 constants slot 1 starts at −0.40 (`sunDir(0).y ≈ −0.989`, dawn ≈ 0.00) and its velocity component 1.35 lifts the sun above the horizon by frame 299 (`sunDir(299).y ≈ 0.598`, dawn ≈ 0.997); depth stays `w(τ) ≤ 0.27 << d = 4` (slot 3 starts at 0, `u_w = 0.03`, `τ_max = 8.97`), so the projection never degenerates.

### Derived quantities (all pure functions of step records)

```js
sunDir(N)      = normalize({ p3.x, p3.y, −p3.z })     // envToWorld without radius
sunWorld(N)    = sunDir(N) · R_SUN                    // on the sky dome
dawnFactor(N)  = clamp((sunDir(N).y + 0.25) / 0.85, 0, 1)
minkowskiRapidity(N) = acosh(max(1, −g(u(N), [1,0,0,0])))   // glow bias; 4D dawn
oceanTau(N)    = N · DTAU                              // certified worldline clock
```

**Forbidden in any render-path function:** `Date.now()`, `Math.random()`, `performance.now()`, `process.hrtime`, wall-clock reads, network, filesystem watches. Every random-looking input (stars, building window lights, sky dither, optional grain tile) MUST be seeded from `CANONICAL_SEED` via `mulberry32` (pattern: `scripts/animate-4d-flight.mjs`).

### Runtime fingerprint

```
runtimeFingerprint = sha256(JSON.stringify({
  contractVersion: "1.1.0",
  metricSignature: [-1,1,1,1], c: 1, dtau: 0.03, d4: 4,
  projection: { mode: "perspective", parameters: { d: 4 } },
  seed: "0x5EED4D00", frames: 300, fps: 30, width: 1280, height: 720,
  sunInitialPosition: [0,-0.40,0,0],
  sunInitialVelocity: [1.71636,1.35,0.35,0.03],
  waves: CANONICAL_WAVES, domeRadius: 90,
  cloudGrid: { cols: 96, rows: 64 }, cloudSeed: "0x5EED4D00 ^ 0xC10UD5",
  windVector: [0, 0.02, 0, 0.01], fogDensity: 0.0015, fogSeed: "0x5EED4D00 ^ 0xF06D3N5",
  foliageSeed: "0x5EED4D00 ^ 0xF0F0F0F0"
})).slice(0, 32)
```

### Per-frame hash

```
canonicalFrameRecord(N) = {
  frame: N, timeSeconds: N/30, t: N*0.03, replayToken,
  sun:   { p3, sunDir, sunWorld, dawnFactor, errorBound, sourceCertificationId },
  sky:   { dawnFactor, zenithErrorBound },
  ocean: { tau, anchorBounds: [{x,z,errorBound}...] },
  cloud: { opacityGrid, tau, windDisplacement },
  fog:   { density, factorAtDepth },
  camera:{ eye, target, focal },           // pure-3D camera — never 4D-derived
  light: { dir, color }                    // color is a function of certified dawnFactor
}
frameHash(N) = sha256(JSON.stringify(canonicalFrameRecord(N))).slice(0, 32)
```

**Excluded from the canonical record and hash (existing classes stamp these non-deterministically):** `timestamp`, `certificationId`, `projectionId`, `stateId`, `cameraId`, `audit.*`. They remain in the emitted audit provenance, but never enter determinism checks.

### `manifest.json` schema (exact; reproducible across two identical runs on the same host)

```json
{
  "engine": "mrs-renderer-core/constitutional",
  "kind": "cinematic-4d-environment-sunrise",
  "contractVersion": "1.1.0",
  "seed": "0x5EED4D00",
  "width": 1280, "height": 720, "frames": 300, "fps": 30, "durationSeconds": 10,
  "runtimeFingerprint": "<sha256 32hex>",
  "worldId": "world-cinematic-sunrise-001",
  "timelineId": "timeline-sunrise-v1",
  "intentId": "render-4d-cinematic-sunrise",
  "physics": { "metric": "Minkowski", "signature": [-1,1,1,1], "c": 1, "dtau": 0.03, "steps": 300, "d4": 4 },
  "projection": { "mode": "perspective", "parameters": { "d": 4 } },
  "environment": {
    "domeRadius": 90,
    "sunInitialPosition": [0, -0.4, 0, 0],
    "sunInitialVelocity": [1.71636, 1.35, 0.35, 0.03],
    "waves": [ { "omega": 0.9, "dir": [0.12, 0.99], "amplitude": 0.09 },
               { "omega": 1.7, "dir": [0.82, 0.57], "amplitude": 0.055 },
               { "omega": 2.3, "dir": [-0.45, 0.89], "amplitude": 0.035 },
               { "omega": 3.1, "dir": [0.98, -0.2], "amplitude": 0.02 } ],
    "oceanGrid": { "xMin": -40, "xMax": 40, "zMin": -120, "zMax": -6, "cols": 96, "rows": 40 },
    "cloudGrid": { "cols": 96, "rows": 64 },
    "cloudSeed": "0x5EED4D00 ^ 0xC10UD5",
    "windVector": [0, 0.02, 0, 0.01],
    "fogDensity": 0.0015,
    "fogSeed": "0x5EED4D00 ^ 0xF06D3N5"
  },
  "camera": { "kind": "pure-3d-cinematic", "focalScale": 0.9 },
  "conformance": { "allPass": true, "checks": 16 },
  "evidence": { "recorder": "EnvironmentEvidenceRecorder", "frameRecords": 300, "frameHashAlg": "sha256" },
  "frames": [
    { "frame": 0, "timeSeconds": 0.0, "replayToken": "<hex>", "sunErrorBoundMax": 0.0, "projFinite": true, "frameHash": "<sha256 32hex>" }
  ],
  "stills": { "000": "still_000.png", "150": "still_150.png", "299": "still_299.png" },
  "video": { "file": "cinematic-sunrise.mp4", "bytes": 0, "sha256": "<hex>" },
  "note": "Deterministic certified 4D environment behind a pure-3D cinematic camera. Not text-to-image."
}
```

Reproducibility definition: two runs with identical CLI args on the same host produce **byte-identical** `manifest.json` (including `frames[].frameHash` and `video.sha256`). Cross-host, data-level determinism (all manifest fields except `video.sha256`/PNG bytes) holds; PNG byte equality is guaranteed only same-host because node-canvas font rasterization can differ across OSes — the HUD font stack is `"Consolas, 'Courier New', monospace"` and this caveat is documented, not hidden.

---

## 4. File Manifest

All paths under `mrs/packages/renderer-core/` unless noted. **No protected paths touched** (`constitution/`, `engine/constitution/`, `engine/governance/policies/`, `engine/conformance/default.conformance-profile.json`, `AGENTS.md`, `CITATION.cff`, `.zenodo.json`). No new npm dependencies; only existing `canvas`, `commander`; `ffmpeg` external.

| Path | Action | Owner role |
|---|---|---|
| `docs/contracts/mrs-4d-cinematic-environment/README.md` | **Create** — this contract | Architect |
| `mrs/packages/renderer-core/src/render/rt4d/environment/CertifiedSun.js` | Create | Builder |
| `mrs/packages/renderer-core/src/render/rt4d/environment/SkyField.js` | Create | Builder |
| `mrs/packages/renderer-core/src/render/rt4d/environment/OceanField.js` | Create | Builder |
| `mrs/packages/renderer-core/src/render/rt4d/environment/EnvironmentEvidence.js` | Create | Builder |
| `mrs/packages/renderer-core/src/render/rt4d/environment/CertifiedEnvironment.js` | Create | Builder |
| `mrs/packages/renderer-core/src/render/rt4d/environment/CloudField.js` | Create | Builder |
| `mrs/packages/renderer-core/src/render/rt4d/environment/FogField.js` | Create | Builder |
| `mrs/packages/renderer-core/src/render/rt4d/environment/index.js` | Create — export surface | Builder |
| `mrs/packages/renderer-core/src/cine3d/Camera3D.js` | Create — pure 3D camera | Builder |
| `mrs/packages/renderer-core/src/cine3d/Scene3D.js` | Create — pier/beach/buildings/hero/lamps/foliage/props | Builder |
| `mrs/packages/renderer-core/src/cine3d/Lighting.js` | Create | Builder |
| `mrs/packages/renderer-core/src/cine3d/Compositor.js` | Create | Builder |
| `mrs/packages/renderer-core/src/cine3d/index.js` | Create — export surface | Builder |
| `mrs/packages/renderer-core/scripts/movie-4d-cinematic-sunrise.mjs` | Create — CLI vertical slice | Builder |
| `mrs/packages/renderer-core/schemas/cinematic-sunrise.timeline.json` | Create — default timeline (set_param clips, worldId) | Builder |
| `mrs/packages/renderer-core/src/render/rt4d/constitutional/test/cinematic.environment.test.js` | Create — acceptance tests (§5) | Builder |
| `mrs/packages/renderer-core/package.json` | Modify — add `"test:cinematic"` and `"demo:cinematic"` scripts | Builder |

**Deliberately NOT reused:** `src/engine3d/` (stub only — `World3D.addBody`/`Renderer3DStub` are not buildable-as-is), `src/render/canvas-renderer.js` (its `cinematicRotation` + `project4Dto2D` path bypasses the certified `Projector4DTo3D` pipeline and would break the error-bound requirement).

CLI contract for the vertical slice:

```
node scripts/movie-4d-cinematic-sunrise.mjs [--frames 300] [--fps 30]
     [--width 1280] [--height 720] [--seed 0x5EED4D00]
     [--world world-cinematic-sunrise-001]
     [--timeline schemas/cinematic-sunrise.timeline.json]
     [--verify] [--no-encode]
```

Flow: parse CLI → load timeline (assert `worldId` present, else exit 3 — `timeline.world-required`) → `env = new CertifiedEnvironment(canonical + ids)` → `await env.advance()` → recorder `begin()` → for `N = 0..299`: `rec = env.frame(N)`, `cam = Camera3D.cinematic(N, FRAMES, W, H)`, `light = sunLight(rec)`, `compositeFrame(...)`, write PNG, `recorder.record(rec)` → `finalize()` → ffmpeg encode → write `manifest.json` → if `--verify`: rerun the whole pipeline and assert byte-identical `manifest.json`, exit 0/1.

---

## 5. Acceptance Criteria — EXECUTABLE

Single new test file: `mrs/packages/renderer-core/src/render/rt4d/constitutional/test/cinematic.environment.test.js` (`node:test` + `node:assert/strict`, matching existing `constitutional.test.js` / `error-bounds.test.js` style). The Builder encodes these assertions verbatim; the thresholds are binding.

**4D environment**
- [ ] E1 For `N` in `0..299`: `provenance.positionCert.errorBound.max < 1e-6`, `provenance.velocityCert.errorBound.max < 1e-9`, `provenance.momentumCert.errorBound.max < 1e-9`, and `conformance.passed === 16 && conformance.success === true`.
- [ ] E2 Sun never degenerate: for all `N`, `provenance.projection.errorBound.finite === true`, `.withinTolerance === true`, `.roundtripResidual < 1e-9`.
- [ ] E3 No keyframing: for all `N`, `sunWorld(N)` from `env.frame(N)` deep-equals `normalize(envToWorld(runtime.step(N).projection))·R_SUN` recomputed from a **fresh** runtime with identical config (bitwise equality), and `sunScreen(N) = Camera3D.project(sunWorld(N))` is bitwise identical across two computations.
- [ ] E4 Actual sunrise: `sunDir(0).y < 0`, `sunDir(299).y > 0.3`, `dawnFactor(0) < 0.05`, `dawnFactor(299) > 0.9`.
- [ ] E5 Ocean null waves: for each wave cert, `validation.passed === true` and residual `|g(k,k)| < 1e-9`.
- [ ] E6 Ocean anchors: for all `N` and each anchor, `errorBound.finite === true` and `errorBound.withinTolerance === true`.
- [ ] E7 Sky: zenith cert `validation.passed === true`; per-frame `frame(N).sky.errorBound.max === max(sunProjBound.max, zenithBound.max)` within `1e-12`.
- [ ] E8 Clouds: cloud grid 96×64, certified wind vector spacelike (`g(w,w) = 1 ± 1e-9`), advection correct over 300 frames (`displacement = w_spatial * tau`).
- [ ] E9 Fog: certified density scalar `ρ`; `fogFactor(depth) = 1 - exp(-ρ * depth)` matches analytic within 1e-12 per frame.

**3D scene**
- [ ] S1 Camera purity: `Camera3D.cinematic(N, 300, 1280, 720)` returns identical `(eye, target, focal)` when called twice, and is unchanged when called with a different environment object (same inputs → same outputs).
- [ ] S2 Camera isolation: source scan of `src/cine3d/**` finds no `rt4d` import — the camera has no 4D input path.
- [ ] S3 Static scene: `buildScene3D(seed)` deep-equals itself across calls; geometry arrays are not mutated across frames.
- [ ] S4 Hero smoke: `drawScene3D` with `scene.hero` does not throw for frames 0..299.
- [ ] S5 3D objects: `buildScene3D` returns all buildings (B1–B10), foliage (trees, grass, shrubs), props; `drawScene3D` renders without throw; geometry arrays not mutated.

**Compositing**
- [ ] C1 Draw order: compositor plan returns exactly `["sky","clouds","fog","stars","ocean","sun","pier","beach","buildings","foliage","props","lamps","hero","vignette","hud"]`.
- [ ] C2 Canvas fixed: `compositeFrame` never resizes the canvas; `W=1280`, `H=720` invariant.
- [ ] C3 Pixel determinism: PNG buffers for frames 0, 150, 299 are byte-identical across two runs on the same host.
- [ ] C4 Draw order verified: clouds render before fog, fog before stars; sun after ocean.

**Evidence**
- [ ] V1 Recorder lifecycle: no records before `begin()`; exactly 300 after `finalize()`; `record()` outside the window throws.
- [ ] V2 Frame fields: every record has `intentId === "render-4d-cinematic-sunrise"`, `timelineId`, `worldId`, `timeSeconds === frame/30`, and a `parameters` object.
- [ ] V3 Bundle fields: every evidence bundle has `{ id, worldId, timelineId }`.
- [ ] V4 Dual require: compositing a sun record with missing `sourceCertificationId` OR `projectionError.finite === false` throws.
- [ ] V5 Deny without intent: `env.frame(N)` with `intentId` undefined throws.
- [ ] V6 Policy load (read-only): `engine/governance/policies/default.policies.json` parses; `policy-no-render-without-provenance.severity === "high"`.
- [ ] V7 Replay: `runtime.verifyReplay(runA.getProvenanceChain(), runB.getProvenanceChain())` returns `{ match: true, steps: 300 }`.
- [ ] V8 Hash determinism: `frameHash(N)` and `manifestFragment()` deep-equal across two runs.
- [ ] V9 Hash exclusion: `canonicalFrameRecord(N)` keys exclude `timestamp|certificationId|projectionId|cameraId|stateId|audit`.
- [ ] V10 Cloud/Fog evidence: cloud/fog records have `certificationId`, `errorBound`, `validation.passed`.

**Determinism**
- [ ] D1 Forbidden-API scan: source scan of `src/cine3d/**` + `src/render/rt4d/environment/**` finds no `Date.now|Math.random|performance.now|process.hrtime|hrtime` (only seeded `mulberry32` allowed).
- [ ] D2 `--verify` integration: two full script runs produce byte-identical `manifest.json` (manifest sha256 equal).
- [ ] D3 Source-of-truth fingerprint: `env.fingerprint()` equals the §3 `runtimeFingerprint` recomputed in the test from the canonical constants JSON.

**Commands:** `npm run test:cinematic` · `npm test` · `npm run test:conformance` (16/16 required) · `npm run demo:cinematic`.

**Conformance checks exercised (16/16, from AGENTS.md §IV):** `provenance.recorder-exists` (V1) · `provenance.frame-fields` (V2) · `provenance.frame-recorded-during-play` (V1 begin/finalize window) · `replay.service-exists` (V7) · `replay.deterministic-params` (D2) · `binding.resolver-exists` (S3 + envToWorld resolver asserted for all three elements) · `binding.all-tracks-resolved` (E3) · `timeline.loader-exists` (script parses `cinematic-sunrise.timeline.json`) · `timeline.clip-application` (`dawnTintBias`/`vignetteStrength` applied to the compositor) · `timeline.world-required` (script exits 3 without `--world`) · `evidence.bundle-fields` (V3) · `evidence.dual-require` (V4) · `ckl.policy-load` (V6) · `ckl.deny-without-intent` (V5) · `ckl.modify-param` (dawnFactor modifies light color — assert light `color` differs frame 0 vs 299) · `ckl.attach-provenance` (every composited frame carries `envRecord.provenance`).

**New criteria mapping:** `provenance.recorder-exists` (V1 + V10 cloud/fog) · `provenance.frame-fields` (V2 + cloud/fog fields) · `evidence.dual-require` (V4 + V10 cloud/fog certs) · `ckl.attach-provenance` (cloud/fog provenance per frame).

---

## 6. Performance Budget

Target: **≤ 600 ms wall-clock per frame** and **peak RSS < 600 MB** at 1280×720×300 in node-canvas soft-raster on the reference host (AMD R9 380-class CPU path; no GPU used). Measured against `scripts/animate-4d-flight.mjs`-class workloads.

| Stage | Cost driver | Budget/frame |
|---|---|---|
| Physics (amortized) | 300 steps once: geodesic + 3 certs + projection + error bound | ~3 ms/frame amortized (≈1 s total) |
| Sky | 96×64 RGBA grid (≈6k samples) + one `drawImage` upscale | 8–15 ms |
| Clouds | 96×64 noise grid + advection (1x per frame) | 5–10 ms |
| Fog | Screen-space radial gradient + exp | 2–5 ms |
| Ocean | 96×40 heightfield (≈3.8k samples × 4 waves ≈ 31k trig ops) + ≈40–60 scan bands | 12–22 ms |
| Sun glow + stars | 1 radial gradient + 2 arcs (+90 arcs while dawn < 0.35) | 2–7 ms |
| 3D scene | `drawSolid`: ~200 tris (buildings/foliage/props) + pier/beach + hero + lamps | 15–35 ms |
| Vignette + HUD | 1 gradient + ~6 text draws | 5–8 ms |
| PNG encode (dominant) | `canvas.toBuffer("image/png")` 1280×720 | 150–300 ms |
| **Total** | | **≈ 220–420 ms (cap 600 ms)** → 300 frames ≈ 2–3 min + ffmpeg |

**Precompute / caching strategy (required to meet budget):**
1. **Phase split:** run the worldline once (`env.advance()`, ~1 s) into a 300-record array; per-frame rendering is then a pure function of step records — never re-advances physics.
2. **Coarse-then-upscale:** sky grid 96×64, cloud grid 96×64, ocean field 96×40 are the only per-frame field computations; the compositor upscales with a single `drawImage` (smoothing on). **No per-pixel JS work** — all canvas fills are vector ops or `drawImage`.
3. **Once-only caches:** stars, scene meshes, wave-vector certs, sky zenith cert, cloud noise base, wind/fog/density certs, foliage/prop placement built once from `CANONICAL_SEED`; reused across all frames.
4. **Single canvas + GC discipline:** one reused `canvas` instance; PNG buffers written and released per frame; keep only the current frame buffer plus precomputed arrays in RAM; frames streamed to disk (`output/cinematic-sunrise/_frames/`), removed after encode like `movie-constitutional-physics.mjs`.
5. **Ocean draw:** render as horizontal scan bands from the coarse heightfield, plus a horizon glow band — never per-pixel.
6. **Cloud advection:** single texture shift via `drawImage` with offset — no per-pixel noise regeneration.

---

## Handoff order

1. **Builder** → land §4 file manifest (src modules, script, timeline fixture, test, `package.json` scripts). No protected paths.
2. **Implementor** → wire script CLI + ffmpeg + manifest writer; get `npm run test:cinematic` green.
3. **Reviewer** → verify no protected-path edits, no new deps, no `Date.now()/Math.random()` in render paths, MIT-compatible.
4. **Inspector** → run `npm test` + `npm run test:conformance`; confirm 16/16 and no regressions in existing constitutional tests.
5. **ESFR** → run `--verify` (byte-identical manifest across two runs) and a cross-host data-determinism spot check.
