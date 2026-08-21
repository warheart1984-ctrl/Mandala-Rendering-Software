# Mandala Engine ABI — honest versioning

**Status:** **working** freeze of Organ ABI **v1** (`mandala-engine-organ.v1`). Schema + validator are used by the engine gate (`mandala/engine/aais/`). Full AAIS arbitration remains **partial**.
**Does not edit** `constitution/CHARTER.md`, `engine/constitution/`, `engine/governance/policies/`, or `AGENTS.md`.

This is the Engine’s organ / scene-graph / artifact contract. Compute backends stay under Axiom-X / UALS. Do not collapse them.

---

## AAIS-UL v20 — not in this repository

Repo search (docs, `mandala/`, `engine/`, `aiki/`, `mrs/`, `scripts/`, `constitution/`): **no** `AAIS-UL`, `AAIS_UL`, or `AAISUL` artifact, and **no** ABI labeled v20.

The user-facing name “AAIS‑UL v20” is therefore **not adopted here**. Inventing v20 would be a false SoT.

Existing versioned cousins (align, do not overwrite):

| ABI / contract | Version in repo | Role | Path |
|----------------|-----------------|------|------|
| Mandala proto universe | `0.1.0` | Tiny certified world | `mandala/proto/contract.json` |
| RHFD substrate | `0.2.0` | Lattice mapping | `mandala/substrate/contract.json` |
| Mandala Engine Organ ABI | **v1 working** (supersedes v0) | Graph + organs + gate + receipts | this file + `aais/schema/` |
| Physics core | `mandala-engine-physics.v0.2` | Integrator / ∇φ / constraints / collision | `physics/ABI.md` |
| Axiom Compute ABI | `0.1.0` (TS/Python) | Capability-first compute | `axiom-x/abi/axiomComputeABI.ts` |
| Axiom native ABI | `1.0` (`axiom_abi_version`) | C ABI | `sovereign-x/axiom-native/ABI_SPEC.md` |
| UALS | ABI **v0** | Sovereign-X compute abstraction | `sovereign-x/docs/governance/cecp/specs/uals-abi-v0.md` |
| Axiom Memory ABI | `0.1` | Memory backends | `axiom-x/memory/` |
| World ABI | `4d-world.v1` | Yggdrasil → RT4D geometry | `mrs/packages/renderer-core/src/singularity-tree/abi/WorldABI.js` |
| FourDRenderer Shader ABI | v2.0 **declared** | GPU buffer/bindings | `docs/4d-engine/v2/shader-abi/SHADER_ABI.md` |
| StoryForge ↔ Mandala | `storyforge-mandala-contract/1.1` | Production intake schema | `mrs/adapters/storyforge-boundary/contract/schemas/` |
| AAISWorker default | `1.0.0` | Generic worker wrapper, **not** UL | `scripts/workers/AAISWorker.mjs` |

`mandala-engine-organ.v1` **supersedes** `mandala-engine-organ.v0`. Still do not mint AAIS-UL v20 unless an authorized external spec lands in-repo.

---

## Organ ABI v1 (working freeze)

Closed organ set (same keys as `mandala/proto/organs.mjs`):

`StoryForge` · `SimulationChamber` · `Mandala` · `AIPainter` · `Mythar` · `AAIS` · `MovieLane`

Aliases in prose only: Chamber = `SimulationChamber`, Painter = `AIPainter`.

JSON schemas (used by the gate, not markdown-only):

- `aais/schema/organ-abi.v1.json`
- `aais/schema/proposal.schema.json`
- `aais/schema/artifact-receipt.schema.json`

### Invariants (already proto-enforced; Engine must not weaken)

1. Certified state is the source of world truth. Hash = SHA-256 of constitution id, seed, `t`, scalar, vector, defect.
2. Renderer / projection nodes observe a **frozen copy**. Mutating the copy or adding graph nodes must not change the certified hash.
3. Movie Lane does not own time.
4. Mathematical contracts sit **above** GPU. Vulkan is preferred backend, not physics.
5. AAIS may reject a proposal; rejected proposals do not mutate certified buffers.
6. **Only `SimulationChamber` may propose physics deltas.** Mandala, AIPainter, Mythar, and MovieLane cannot mutate the certified physics hash.

### Scene-graph records (v0.1 skeleton)

See `scenegraph.mjs`. Payload must be JSON-serializable. **Do not** embed 32³ `Float32Array` buffers in the graph — store `certifiedHash` + `domainId`.

### Physics core (v0.2 — partial, named organ API)

- `TemporalIntegrator.step(certified, dt) → Proposal` — proto η + Laplacian + −∇φ, not pose-lerp
- `GradientFlowSolver.evaluate(φ) → ∇φ` — CPU reference
- `ConstraintSolver` — scalar-mass conservation + no superluminal defect step
- `CollisionManifold` — defect vs domain AABB + hard occupancy bounce

Cinematic Chamber defaults to `--solver mandala-proto`: certified −∇φ defect walk drives actor world positions. `--solver pose` restores `pose_interpolation` / `notGradV`. Beat clock drives Movie Lane.

---

## Governance vs Engine ABI

Repo constitutional engine (`engine/constitution/`, policies, 16 conformance checks) is a **different** ABI surface. This file does not replace it. Organ freeze cites those policies; it does not silently edit them.
