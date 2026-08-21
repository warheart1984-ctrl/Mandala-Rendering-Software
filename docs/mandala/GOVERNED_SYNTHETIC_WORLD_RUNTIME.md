# Mandala as a governed 4D synthetic-world runtime

**Status:** **partial** (first prototype under `mandala/proto/`; Engine organs under `mandala/engine/` — not v1.0 release).
**Product identity:** **The Mandala Engine** — a constitutional 4D simulation and rendering platform (governed synthetic-world runtime). Not a game engine with better graphics.

This note captures the architectural principle the proto exists to prove. Direction SoT (versions, 10 foundations): [`MANDALA_ENGINE_ROADMAP.md`](./MANDALA_ENGINE_ROADMAP.md). Independence 4-phase track (aspirational 11 weeks, honest tags): [`INDEPENDENCE_ROADMAP.md`](./INDEPENDENCE_ROADMAP.md). Implementation evidence: `mandala/proto/`, `mandala/engine/`, tests in `mandala/proto/test/four-proofs.test.js` and `mandala/engine/test/scenegraph.test.js`.

---

## 1. Certified state vs renderer

The loop this repo is replacing:

```
game loop → physics → animation → renderer → next frame
```

The loop Mandala is:

```
Constitutional Laws → Certified 4D State S(x,y,z,t,...)
  → organs propose transitions
  → Constitutional Gate (invariants / contracts)
  → pass: New Certified State
  → 4D Projection (Mandala) + Movie Lane (observer path)
```

**The renderer does not decide what reality is.** Mandala receives a *frozen certified snapshot* and answers: what does this state look like from this observation manifold?

Proof 4: project from a copy; the certified hash is unchanged after render. Mutating the snapshot cannot touch certified buffers.

---

## 2. Governance preserves laws, not equilibrium

The invariant is not “no subsystem can break equilibrium.”

The invariant is: **no subsystem may commit a state transition that violates constitutional invariants.**

Explosions, fracture, turbulence, and growth are allowed if they are lawful. The proto enforces one law: scalar-mass conservation. An illegal mass-injection proposal is rejected and does not mutate certified state.

Physical invariants vs creative laws: authors may redefine the constitution (“gravity points toward memory”). That instantiates a *different* constitution. It is not answered as “invalid physics.” See `MEMORY_GRAVITY_CONSTITUTION_DECLARED` in `mandala/proto/constitution.mjs` (**declared**, not executed).

---

## 3. Movie Lane does not own time

Simulation Chamber owns temporal evolution (`t → t+1` proposals).

Movie Lane chooses how an observer travels through already-certified spacetime. It may reconstruct slice `t = k` from the temporal cache without re-simulating from 0. It must not call the integrator to “play” the movie.

Cinematic `scripts/simulation-chamber.mjs` remains pose interpolation (`notGradV`). Do not overwrite that honesty. The proto Chamber is a separate module on a 32³ lattice.

---

## 4. Vulkan sits above the contract, not as physics

Axiom-X lesson: the **mathematical contract is above backends**.

CPU reference (`cpu-reference.mjs`) is source of truth for this prototype (**enforced**).

Vulkan is the preferred high-performance path. It is not the definition of truth. The proto’s live GPU work is one compute kernel (`∇φ`) compared to CPU within `maxAbsError ≤ 1e-4`. If dispatch cannot run, the SPIR-V source remains **declared** and tests skip with blocked-with-evidence.

OpenCL / CUDA / HIP / WebGPU: **declared**, not required now.

---

## 5. Procedural-FIRST, not procedural-only

Intent (Story Forge) + procedural fields (η, lattice) + simulation (Chamber transport) + artist constraints (constitution, material albedo, observer path). None of these is the whole product.

---

## 6. RHFD (Claim A only)

Claim A — computationally useful analogue — is in-scope.
Claim B — describes physical vacuum — is **not** claimed. Mandala does not need B.

This proto **extends** `mandala/substrate/` (hex dual-lattice, parity, clean-plate). It does not fork a second RHFD theory.

| RHFD | Proto |
|------|--------|
| η | `hashNoise4` perturbation, zero-mean |
| ∇V | vector field, defect walk on −∇φ |
| defects | `local_rupture` worldline |
| lattice | 32³ domain (cartesian analogue; hex Möbius stays 2D substrate) |

---

## 7. World-compiler (declared, long-term)

```
  Intent + constitution + GLB/procedural/sim constraints
                         │
                         ▼
              ┌─────────────────────┐
              │   World compiler    │  ← declared
              │  (not this proto)   │
              └─────────┬───────────┘
                        │
          certified spacetime program S(x,y,z,t,…)
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
   Chamber evolve    AAIS gate      Movie Lane path
        │               │                │
        └───────────────┴────────────────┘
                        ▼
              Mandala projection (observation)
```

The proto *is* a hand-compiled tiny universe, not a compiler.

---

## 8. Independence path (**partial** / still not a DCC)

| # | Item | Now |
|---|------|-----|
| 1 | Vulkan backend | one ∇φ kernel if live + engine async queue CPU fallback; full backend **declared** |
| 2 | GLB → lattice compiler | **declared** (do not pretend `char_rigged.glb` is consumed here) |
| 3 | 4D scene graph | **skeleton** (v0.1: `mandala/engine/scenegraph.mjs`) |
| 4 | Mandala IDE | **partial** CLI/HTML editor — not Unreal Editor |
| 5 | SDK | **partial** (`mandala/engine/sdk/`) |

---

## 9. Organ map (do not invent organs)

| Organ | Constitutional responsibility | Now |
|-------|------------------------------|--------|
| Story Forge | Intent, narrative constraints, world law declarations | **partial** (constitution + seed) |
| Simulation Chamber | Evolves certified spacetime state | **partial** (tiny lattice; cinematic actors still pose-interp; `--solver mandala-proto` additive) |
| Mandala | Geometry, fields, visibility and projection | **partial** (orthographic slice + layered BSDF) |
| AI Painter | Appearance synthesis under state constraints | **partial** (CPU tint; SD may be blocked-with-evidence) |
| Mythar | Acoustic field and speech realization | **partial** (sound lattice; edge-tts if present) |
| AAIS | Invariant enforcement, provenance, arbitration | **working** organ ABI v1 freeze; mass + causality; full arbitration **partial** |
| Movie Lane | Observation path, editing and temporal projection | **partial** (does not own time) |

---

## 10. State representation (proto)

```
4D State
├── Dense tiny grid          32³ × 64   (sparse/hierarchical is conceptual)
├── Temporal BVH / DAG       skeleton   (linear certified t→t+1)
├── Event surfaces           skeleton
├── Persistent topology      skeleton   (one defect worldline)
├── Field tensors            scalar + vector
└── Temporal cache           64 slices
```

Do not allocate dense 512⁴.

---

## See also

- `docs/mandala/MANDALA_ENGINE_ROADMAP.md` — Engine identity, 10-need gap table, v0.1–v1.0
- `mandala/engine/` — organs + Organ ABI v1 (`ABI.md`); e2e `run-e2e.mjs`
- `mandala/proto/README.md` — run commands
- `mandala/substrate/` — RHFD mapping SoT
- `docs/4drs/substrate/RHFD_MANDALA_ARCHITECTURE.md` — broader spec; prefer substrate status tags
