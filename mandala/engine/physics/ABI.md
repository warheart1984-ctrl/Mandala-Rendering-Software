# Physics Core ABI (roadmap v0.2)

**Status:** **partial** — tiny CPU organ API over proto `cpu-reference.mjs`. Not Unreal cloth. Not production rank.

**ABI id:** `mandala-engine-physics.v0.2`  
**Organ:** `SimulationChamber` (only organ that may propose physics deltas; AAIS commits).

| Symbol | Role | Implementation |
|--------|------|----------------|
| `TemporalIntegrator.step(certified, dt)` | Propose `t → t+1` | `temporal-integrator.mjs` → proto η + lattice Hamiltonian (−∇H) + −∇φ |
| `GradientFlowSolver.evaluate(φ)` | spatial ∇φ | proto `computeGradientInto` (named organ API) |
| `LatticeHamiltonian` | H = ΣU + ΣJW; `dσ/dt = −∂H/∂σ` | `mandala/substrate/hamiltonian.mjs` |
| `ConstraintSolver` | (1) scalar-mass conservation (proto) (2) no superluminal defect step | `constraint-solver.mjs` |
| `CollisionManifold` | Defect vs domain AABB; hard occupancy bounce | `collision-manifold.mjs` |

Cinematic `scripts/simulation-chamber.mjs` defaults to `--solver mandala-proto` (certified −∇φ defect walk drives actor world positions). `--solver pose` restores `pose_interpolation` / `notGradV`.
