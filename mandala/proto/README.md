# Mandala proto — governed 4D synthetic-world runtime

**Status:** **partial**. This is the first prototype. It proves an architectural principle. It is not the platform.

Product identity: a **governed synthetic-world runtime**, not a game engine with better graphics.

## Principle

```
Constitutional Laws → Certified 4D State S(x,y,z,t,...)
  → organs propose transitions
  → Constitutional Gate (invariants / contracts)
  → pass: New Certified State
  → 4D Projection (Mandala) + Movie Lane (observer path)
```

The renderer does not decide what reality is. It receives a certified state and answers: *what does this state look like from this observation manifold?*

Governance preserves **laws**, not equilibrium. No subsystem may commit a state transition that violates constitutional invariants. Explosions, fracture, turbulence, and growth are allowed if they are lawful.

## Tiny universe

| Item | This proto |
|------|------------|
| Domain | 32³ cells × 64 temporal slices (~32 MiB, not 512⁴) |
| Scalar | 1 (`φ`, potential + η) |
| Vector | 1 (`∇φ`) |
| Defect | 1 type (`local_rupture`, same kind as `mandala/substrate`) |
| Material | 1 (`proto-dielectric`, skeleton albedo) |
| Observer | 1 (Movie Lane path) |
| Invariant | `proto.scalar-mass-conservation` (**enforced**) |
| CPU | **enforced** source of truth |
| GPU | Vulkan ∇φ kernel if RADV is live; else **declared** SPIR-V + blocked-with-evidence |

RHFD mapping (Claim A only — computationally useful. Claim B / physical vacuum is **not** claimed):

- η → deterministic stochastic perturbation on the scalar (`hashNoise4` from substrate)
- ∇V → vector field / defect walk
- defects → persistent worldline
- lattice → 32³ cartesian analogue (hex Möbius remains the 2D substrate)

Cinematic `scripts/simulation-chamber.mjs` still **pose-interpolates**. This proto Chamber is a different module and actually transports on the tiny grid.

## Run

```bash
node --test mandala/proto/test/four-proofs.test.js
# or
node scripts/test-mandala-proto.mjs

node mandala/proto/run.mjs
# or
node scripts/mandala-proto.mjs
```

Outputs land in `output/mandala-proto/` (not `output/simulation/salt-atlas/`).

## Four proofs

1. Same seed + same constitution → same certified hashes
2. CPU vs Vulkan ∇φ within `maxAbsError ≤ 1e-4` (or skip with `gpu-evidence.json`)
3. Slice `t=k` reconstructs from the temporal cache without re-sim from 0
4. Projection uses a frozen copy; certified hash unchanged after render

Plus: an illegal mass-injection proposal is **rejected** and does not mutate certified state.

## Honest gaps vs the vision

| Piece | Tag |
|-------|-----|
| Temporal BVH / event surfaces / full topology surgery | **skeleton** |
| AI Painter / Mythar | **declared** |
| OpenCL / CUDA / HIP / WebGPU | **declared** |
| Vulkan as full world backend | **declared** (one kernel **partial** when live) |
| 4D scene graph | **skeleton** (v0.1 wrap in `mandala/engine/`; not a DCC graph) |
| Mandala IDE, SDK, GLB→lattice compiler | **declared** (independence path) |
| Dynamic production topology | **not this proto** |

Architecture: [`docs/mandala/GOVERNED_SYNTHETIC_WORLD_RUNTIME.md`](../../docs/mandala/GOVERNED_SYNTHETIC_WORLD_RUNTIME.md)
