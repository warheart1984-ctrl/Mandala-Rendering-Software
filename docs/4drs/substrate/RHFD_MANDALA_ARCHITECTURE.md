# RHFD → Mandala → Möbius Canonical Architecture Spec

**Document role:** Mapping sketch between RHFD substrate physics, Möbius Flower topology, and Mandala.
**Status:** **partial** (several rows below historically over-tagged **enforced**).
**Contract SoT (prefer this):** [`mandala/substrate/MAPPING.md`](../../../mandala/substrate/MAPPING.md) · `mandala/substrate/contract.json`.
CPU hex lattice + tests live under `mandala/substrate/`. WGSL parity/twist exist as **source**, not a wired RT4D GPU pass. Chamber ∇V remains pose interpolation.
**Related:** [`MATHEMATICAL_FOUNDATIONS.md`](./MATHEMATICAL_FOUNDATIONS.md) · [`CONSTITUTIONAL_CONTRACTS.md`](./CONSTITUTIONAL_CONTRACTS.md) · `renderer-core/src/render/rt4d/physics/`

---

## 0. Triple Unification

Mandala is a cinematic renderer of RHFD vacuum physics expressed through Möbius Flower topology. Every frame is a block-average observation of the equilibrated dual lattice, locally distorted by defects (characters, props, events), driven by ∇V force fields, textured by η(t) noise fields, and topologically constrained by the Möbius twist assignment.

| Framework | Role | Core Object |
|---|---|---|
| RHFD | Physics substrate | Dual lattice at equilibrium |
| Möbius Flower | Topology | Hexagonal cells on torus with twist parity |
| Mandala | Renderer | WireMesh4D → projection → raster → PNG |

---

## 1. Direct Mapping Table

| RHFD Concept | Möbius Mapping | Mandala Implementation | Source Module | Status |
|---|---|---|---|---|
| Dual lattice | Torus hexagonal lattice | World grid / substrate grid | `wire-mesh-4d.ts` | **enforced** |
| Nodes (degrees of freedom) | Petal centers | Vertices (`Vec4[]`) | `wire-mesh-4d.ts` `WireMesh4D` | **enforced** |
| Links (interaction channels) | Hex edges | Edges (`[i,j]`) | `wire-mesh-4d.ts` `WireMesh4D` | **enforced** |
| Dual edges (stochastic flow) | Möbius twist lines | Noise field / particle stream | `SubstrateNoiseField` | **enforced** |
| η(t) (stochastic noise) | Local parity (edge orientation noise) | Perlin/fBm/curl noise | `lattice/noise.js` + `SubstrateNoiseField` | **enforced** |
| ∇V (potential gradient) | Global twist gradient (torus curvature) | Force fields / motion drivers | `SubstrateForceField` (∇V driver) | **partial** |
| Local defects | Petal ruptures / topological knots | Characters, props, effects | `character-pipeline.ts` rig binding | **enforced** |
| B_L (block average) | Toroidal coarse-graining | Render pipeline (AA, denoise, TAA) | `stage-raster.ts` + `rasterEnergyWireMesh` | **partial** |
| Vacuum (equilibrium) | Perfect lattice consistency | Clean plate / base atmosphere | `render_stage("energy")` ground state | **enforced** |
| Twist assignment f(x,y) | `mod(x+y, 2)` parity | Shader parity function | `moebius-substrate.wgsl` | **partial** |

---

## 2. Dual Lattice → Mandala Substrate Grid

### RHFD

The dual lattice is a discrete representation of the vacuum state. Nodes sample the field at discrete points; links encode neighbor interactions. At ground state, all fields are uniform — no net drift, no steep gradients.

### Möbius Flower Mapping

The dual lattice is realized as a **hexagonal lattice on a torus** with twist assignments:

| RHFD Concept | Möbius Mapping | Mandala Implementation |
|---|---|---|
| Node (degree of freedom) | Petal center | Hex cell center → `Vec4` vertex |
| Link (interaction channel) | Hex edge | Edge between neighboring hex cells |
| Dual edge (stochastic flow) | Möbius twist line | Noise field / particle stream |
| Twist assignment f(x,y) | `mod(x + y, 2)` parity | `moebiusParity()` → `w`-coordinate |
| Twist gradient | ∇V = torus curvature | `moebiusTwistGradient()` → force field |

**Ground state:** Every hex cell loop is consistent → `⟨η(t)η(t)⟩ = ∇V = 0`. The torus is invisible.

### Mandala Implementation

The substrate grid is the `WireMesh4D` produced by `buildEnergyWireMesh4d()`:

```
WireMesh4D {
  vertices: Vec4Tuple[]    // positions in R^4
  edges: [number, number][] // neighbor relations
  vertexCount: number
  edgeCount: number
  meshSha256: string        // deterministic hash over {vertices, edges}
  includesRigPolylines: boolean
}
```

**Construction layers (topology = "tesseract" | "moebius"):**

**Tesseract topology (default):**
1. **Structural lattice (tesseract):** 16 vertices at `(±1,±1,±1,±1)`, 32 edges connecting vertices differing in exactly one bit.
2. **Energy lattice (great-circle filaments):** 6 great circles on each coordinate 2-plane, 12 samples each, radius modulated by hash.
3. **Rig polylines (optional defect layer):** Bone hierarchy as `Vec4` vertices where `w` is a hash-derived offset.

**Möbius Flower topology (`topology: "moebius"`):**
1. **Hexagonal lattice on torus:** `generateMoebiusSubstrate()` places hex cells on a torus surface. Major radius R=1.5, minor radius r=1.0. Each cell's `w`-coordinate encodes the twist parity.
2. **Twist assignments:** `moebiusParity(q,r) = (q+r) mod 2`. Cells with parity 0 get `w ≈ -0.15`, parity 1 get `w ≈ +0.15`. This is the discrete η(t).
3. **Twist gradient field:** `moebiusTwistGradient()` computes the discrete curl of the parity field → 4D vector representing local torus curvature (∇V).
4. **Rig polylines (optional):** Same as tesseract — bone hierarchy appended as defect layer.

### Ground State

When no forces, no noise modulation, and no rig are applied, the substrate grid renders as the lattice at rest — the **equilibrated vacuum**. This is `render_stage("energy")` with default parameters.

For Möbius topology: all hex cells have consistent parity, twist gradient is zero everywhere, torus is invisible → perfect vacuum.

---

## 3. η(t) → Mandala Stochastic Noise Fields

### RHFD

η(t) is balanced stochastic noise. It doesn't create net drift — it provides latent structure that can be activated by ∇V.

### Mandala

Noise fields are implemented as the `SubstrateNoiseField` class wrapping the existing `lattice/noise.js` suite:

```typescript
interface NoiseFieldConfig {
  type: "perlin" | "fbm" | "ridged" | "curl"
  frequency: number        // spatial frequency (default 1.0)
  amplitude: number        // displacement amplitude (default 0.1)
  octaves: number          // fBm octaves (default 4)
  lacunarity: number       // frequency multiplier per octave (default 2.0)
  gain: number             // amplitude multiplier per octave (default 0.5)
  timeScale: number        // temporal evolution rate (default 0.0 = frozen)
  seed: string             // deterministic seed from scene SHA-256
}
```

**Ground state behavior:** When `timeScale = 0.0`, noise is frozen — it exists as latent spatial structure but doesn't evolve. This is the RHFD equilibrium: noise is symmetrically distributed, no net force.

**Active state:** When `timeScale > 0.0`, noise evolves via `η(x, t) = noise4d(x, t * timeScale, seed)`. This activates latent structure into visible turbulence, clouds, fog variation.

### Integration Points

- `buildEnergyWireMesh4d()` — noise displaces filament vertices before hashing
- `rasterEnergyWireMesh()` — noise modulates line brightness/thickness
- Future: GPU compute for per-pixel noise in beauty stage

---

## 4. ∇V → Mandala Force Fields (Simulation Chamber)

### RHFD

∇V is the gradient of the potential energy. When zero → equilibrium. When non-zero → flow, attractors, defects.

### Mandala

Force fields are implemented as the `SubstrateForceField` class:

```typescript
interface ForceFieldConfig {
  type: "uniform" | "attractor" | "vortex" | "curl_noise" | "drag"
  // Uniform: constant vector field
  direction?: Vec4Tuple     // [x,y,z,w] force direction
  magnitude?: number        // force strength
  // Attractor: point attractor/repulsor
  position?: Vec4Tuple      // attractor position in R^4
  strength?: number         // positive = attract, negative = repel
  radius?: number           // influence radius
  // Vortex: rotational force around axis
  center?: Vec4Tuple        // vortex center
  axis?: Vec4Tuple          // rotation axis (normalized)
  angularVelocity?: number  // rotation speed
  // Curl noise: divergence-free turbulence
  noiseConfig?: NoiseFieldConfig  // reference noise field
  curlScale?: number        // curl operator scale
  // Drag: velocity damping
  damping?: number          // damping coefficient [0,1]
}
```

### Force Field Stacking

Multiple force fields compose additively:

```
F_total(x, t) = Σ_i F_i(x, t)
```

The simulation chamber applies `F_total` to the substrate grid vertices:

```
v'(t+Δt) = v(t) + Δt * F_total(x(t), t) / m
x'(t+Δt) = x(t) + Δt * v'(t+Δt)
```

### Ground State

When no force fields are configured, `F_total = 0` — the substrate grid remains at rest. This is the RHFD vacuum: ∇V = 0, no motion, no drift.

---

## 5. Local Defects → Mandala "Things"

### RHFD

Matter/energy is a local rupture in equilibrium — potential wells, topological twists, attractors in the field.

### Mandala

Characters, props, and effects are **local defects** in the substrate grid:

- A character standing in fog: substrate = equilibrated fog field, character = local defect, lighting/shadows/motion = gradients around that defect.
- A prop on a table: substrate = table surface field, prop = defect distorting the surface.
- An effect (fire, particle burst): substrate = air field, effect = high-gradient defect region.

### Rig Binding as Defect Injection

`bind_character_rig()` injects a defect by:
1. Selecting a rig schema (human/fox/anthro) with bone hierarchy
2. Computing bone world positions from bind transforms
3. Appending rig polylines to the substrate grid (vertices + edges along bone chain)
4. Recomputing `meshSha256` — the defect changes the substrate hash

This is exactly the RHFD picture: the defect is a local distortion of the equilibrated lattice.

---

## 6. B_L → Mandala Render Pipeline

### RHFD

The block average operator B_L turns the raw UV lattice into a smooth IR observation. Dense microscale → smooth macroscale.

### Mandala

The render pipeline implements B_L:

| UV Scale (internal) | IR Scale (output) | Operator |
|---|---|---|
| 4D simulation resolution | Final frame resolution | `projectWireMeshTo3d()` perspective projection |
| High-res grids, substeps, micro-noise | 512×512 PNG | `rasterEnergyWireMesh()` line rasterization |
| Perlin/fBm octaves | Smooth gradients | Implicit via raster averaging |
| Multi-sample anti-aliasing | Clean edges | `encodeRgbaPng()` |

### Future: Full B_L Pipeline

```
UV lattice (WireMesh4D)
  → ∇V simulation step (SubstrateForceField)
  → η(t) noise modulation (SubstrateNoiseField)
  → 4D→3D projection (projectWireMeshTo3d)
  → Line/dot rasterization (rasterEnergyWireMesh)
  → Anti-aliasing + denoising (B_L block average)
  → Tone mapping + gamma (ACES)
  → PNG output (IR frame)
```

---

## 7. Vacuum → Mandala Clean Plate

### RHFD

The vacuum state is perfect equilibrium: no defects, no gradients, no attractors. The dual lattice at rest.

### Mandala

The clean plate is `render_stage("energy")` with default parameters and no rig bound:

- No characters (no defects)
- No forces (∇V = 0)
- Frozen noise (η(t) at t=0)
- Just atmosphere, light, substrate

This renders the equilibrated dual lattice: tesseract wireframe + great-circle filaments + uniform fog/light. Nothing "snags" the eye — the visual RHFD vacuum.

---

## 8. Implementation Status

### Enforced (verified in tests)

- [x] Dual lattice construction (tesseract + filaments)
- [x] Möbius Flower hexagonal lattice on torus with twist assignments
- [x] Twist parity function f(x,y) = (x+y) mod 2
- [x] Twist gradient field (discrete curl of parity)
- [x] Deterministic hashing (P4 replayable)
- [x] 4D→3D perspective projection
- [x] Line/dot rasterization → PNG
- [x] Rig binding as defect injection
- [x] 3-stage pipeline (energy → clay_rig → beauty)
- [x] Provenance hashing at every stage
- [x] Force field layers (uniform, attractor, vortex, curl_noise, drag)
- [x] Twist gradient force field (∇V driver)

### Partial (implemented but gaps)

- [x] `SubstrateNoiseField` — Perlin/fBm/ridged with time-dependence
- [x] `SubstrateForceField` — full layer stacking with ∇V driver
- [x] Möbius substrate topology option in `buildEnergyWireMesh4d()`
- [x] Shader parity/twist functions (WGSL + GLSL)
- [ ] GPU wave dispatch (WGSL kernel exists, pipeline not wired)
- [ ] Per-particle N-body integration
- [ ] GPU noise compute for beauty stage
- [ ] Temporal accumulation / TAA (B_L full operator)

### Declared (designed, not implemented)

- [ ] Full B_L pipeline (AA + denoise + TAA + tone map)
- [ ] 4D dynamics (w-axis forces)
- [ ] XPBD constraints in R^4
- [ ] Geodesic integrator via Christoffel symbols

---

## 9. Replayability Contract (P4)

All substrate operations must be deterministic and replayable:

- **Noise:** Seeded via `sha256(prompt + mode + rotations + projection)` → `sceneSeedHex`. Same seed → same noise.
- **Forces:** Configured per-scene, hashed into `meshSha256`. Same config → same displacement.
- **Defects:** Rig binding hashed via `rigSha256`. Same rig → same defect.
- **Projection:** `distance4d` + `distance3d` + `rotationPlanes` hashed. Same params → same frame.

Every `render_stage` call produces a PNG whose `sha256` is recorded in `shotEvidence.outputHash`. Replay of identical inputs must produce byte-identical PNGs.

---

> "Mandala is a cinematic renderer of RHFD vacuum physics. Every frame is a block-average observation of the equilibrated dual lattice, locally distorted by defects (characters, props, events), driven by ∇V force fields, and textured by η(t) noise fields."
