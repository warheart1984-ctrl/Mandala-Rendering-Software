# RHFD → Mandala → Möbius substrate mapping

**Law (user-authored):** Mandala is a cinematic renderer of RHFD vacuum physics. Simulation Chamber is the motion organ. Do not invent a competing organ.

**Status of this document:** **partial** — contract + CPU hex lattice + tests + tiny clean plate + discrete lattice Hamiltonian (`hamiltonian.mjs`, Claim A). Not the RHFD continuum Hamiltonian. Not a “living lattice.”

**SoT:** this file + `contract.json`. Existing cousins (not duplicates):

| Cousin | What it actually is | Do not confuse with |
|--------|---------------------|---------------------|
| `mrs/apps/rt4d-chatgpt-plugin/server/src/moebius-substrate.ts` | Hex→torus wire mesh + same parity/twist formulas | RHFD vacuum solver |
| `mrs/packages/renderer-core/src/gpu/shaders/moebius-substrate.wgsl` | Real WGSL functions (source). **Not** a wired GPU pass in the CPU RT4D path | Enforced GPU substrate |
| `mrs/packages/renderer-core/src/lattice/lattice4d.js` | 4D density voxels / marching cubes | Dual-lattice Hamiltonian |
| `docs/4d-engine/engine3d/MANDALA_NEURAL_LATTICE_SPEC_MNL-1.0.md` | Engine3D replay visualizer | This vacuum mapping |
| `docs/4drs/substrate/RHFD_MANDALA_ARCHITECTURE.md` | Broader spec; several rows over-tag **enforced** | Prefer status tags *here* |

---

## Organ Map (this work)

| Organ | Role here |
|-------|-----------|
| **Mandala** | Pixels — substrate grid, η visualization, clean plate, B_L naming |
| **Simulation Chamber** | Motion — actors/props as defects; intended driver ∇V |
| Story Forge | Law — out of scope |
| AI Painter | Emotion — **declared** (gradient modulation not wired) |
| Mythar | Breath — **declared** (sound lattice not wired) |
| AAIS | Contracts — **declared** (topological consistency not enforced at runtime) |
| Movie Lane | Assemble — out of scope (do not overwrite `output/simulation/salt-atlas/`) |

---

## Mapping table

| # | RHFD | Mandala | Möbius Flower | Status | Code |
|---|------|---------|---------------|--------|------|
| 1 | Dual lattice at ground state; nodes + links; ⟨ηη⟩ balanced with ∇V; no net drift | World grid = dual lattice analogue. Node = sample point. Link = neighbor channel. **Empty scene is equilibrated substrate, not nothing.** | Each hex cell = local equilibrium loop (petal). Node = petal center. Link = hex edge. Dual edge / stochastic flow = twist line. Torus = global topology (**declared** embedding). | **partial** | `dual-lattice.mjs`, `moebius.mjs`; plugin `generateMoebiusSubstrate` |
| 2 | η(t) stochastic field; ground: symmetric, no net force, latent only | Noise analogue on the grid (hashed, zero-mean). Perlin/simplex in `lattice/noise.js` is reusable, **not** wired as η(t). | Local parity: `f(x,y)=(x+y) mod 2`. Edge-orientation noise. | **partial** | `moebiusParity`; WGSL `moebius_parity` |
| 3 | ∇V = ∇(cost/energy). Zero → equilibrium. Non-zero → flow / attractors | Chamber **should** drive particles/cloth/actors with ∇V. Ground: ∇V≈0 → no motion. | Global twist gradient (torus curvature): `twist = normalize(gradientField(x,y))`. | **partial** | Finite-diff ∇V on V; Chamber still **pose-interpolates** |
| 4 | Local defects = things | Characters, props, effects = ruptures (geometry + materials + forces). Capsules / `character/` GLBs are defects in **this** lattice, not a second universe. | Petal ruptures / topological knots. Persistent twist → defect. | **partial** | `addDefect`, `flipEdgeParity`; Chamber capsules |
| 5 | UV–IR gap; B_L = block average | Pipeline **is** the named operator: UV samples/grid → B_L (spp mean, box downsample) → IR (resolution, tonemap). | Toroidal coarse-graining (**named**; implementation is box/spp, not a torus FFT). | **partial** | `block-average.mjs`; RT4D `samplesPerPixel` |
| 6 | Vacuum = perfect equilibrium | Clean plate: atmosphere, light, substrate only. | Every petal loop consistent → torus “invisible.” | **partial** | `clean-plate.mjs`; hex-loop test |
| 7 | Direct mapping table | This file + `contract.json` | Same table, Möbius column | **partial** | — |

---

## 1. Dual lattice ↔ Flower of Life

CPU hex lattice (`createHexLattice`): axial `(q,r)` cells, 6-neighbor links, petal centers in Cartesian `(x,y)`.

Ground state: `V = 0`, zero-mean `eta`, **edge parities = 0** so every hex 6-cycle XOR is 0. Vertex checkerboard ` (q+r) mod 2 ` is stored as the **latent Möbius map** and is **not** coupled into `V` (otherwise checkerboard forward-differences would fake a force field).

Square grid (`createSquareLattice`) is the voxel-field analogue only.

**Gap:** no periodic torus identification in the CPU tests; plugin `hexToTorus4d` is visualization. `lattice4d.js` is a different 4D density grid.

## 2. η(t) and ∇V ↔ parity and twist

Real functions (JS and WGSL, same formula):

```
parity = (x + y) mod 2
twist  = normalize(gradientField(x, y))
```

`gradientField` is the discrete forward-difference of parity, curled into 4D — the **orientation** field. Vacuum **energy** gradient is `gradV` of scalar `V` on the hex (force = −∇V).

**Honest split:** checkerboard `|gradientField| > 0` always. That is **not** vacuum. Vacuum tests use `V`.

## 3. UV–IR ↔ toroidal coarse-graining

| Stage | Here |
|-------|------|
| UV | Hex cells / optional higher `uvWidth`; RT4D spp before the mean |
| B_L | `sppMean` + `boxDownsample` |
| IR | Output `width×height`, Reinhard+γ in `render-still.mjs` |

**No TAA. No denoise. No motion blur** on this CPU path.

## 4. Matter ↔ petal ruptures

- Gaussian well in `V` = potential-well defect (local |∇V| ≠ 0).
- `flipEdgeParity` = topological defect (odd hex-loop XOR).
- Chamber `actors[]` and `character/` meshes = the same class of defect in the cinematic world.
- `character/sim` cloth/hair = CPU stand-in, **not** RHFD.

## 5. Emptiness ↔ clean plate

`node mandala/substrate/clean-plate.mjs` → `output/simulation/rhfd-vacuum/` (sibling of salt-atlas, not an overwrite):

- `clean-plate.png` — RT4D empty scene (miss-path sky), 64×64 / 1 spp
- `hex-ground.png` / `eta-field.png` — hex diagnostic
- `clean-plate-receipt.json`

## Commands

```bash
node --test mandala/substrate/test/ground-state.test.js
node mandala/substrate/clean-plate.mjs
```

## Gaps (do not overclaim)

| Gap | Tag |
|-----|-----|
| Chamber motion = beat lerp + `poseForBeat`, not ∇V integration | **partial** |
| RT4D still traces 15-part capsules; `char_rigged.glb` consume is a hook | **partial** |
| TAA / temporal accumulation / denoise | **absent** (not declared as present) |
| WGSL Möbius file exists; not dispatched in Chamber/RT4D CPU | **declared** (shader source) |
| Cloth/hair RHFD | **not claimed** |
| AI Painter / Mythar / AAIS wiring | **declared** (proto AAIS gate is **partial**, one invariant) |
| Plugin architecture spec “enforced” rows | **prefer this file** |

## First proto (governed runtime)

Tiny certified universe: `mandala/proto/` (32³ × 64). Extends this mapping (Claim A). Does not fork a second RHFD theory. Cinematic Chamber remains pose interpolation.

```bash
node --test mandala/proto/test/four-proofs.test.js
```

Architecture: [`docs/mandala/GOVERNED_SYNTHETIC_WORLD_RUNTIME.md`](../../docs/mandala/GOVERNED_SYNTHETIC_WORLD_RUNTIME.md).

