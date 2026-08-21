# Mandala Engine — identity, gap analysis, roadmap

**Status of this document:** **partial** (v0.9 organs wired; v1.0 **not** released). Direction SoT for the engine. Not a claim of Unreal parity.
**Product identity:** **The Mandala Engine — a constitutional 4D simulation and rendering platform.**
**Product category:** governed synthetic-world runtime.

This note **extends** [`GOVERNED_SYNTHETIC_WORLD_RUNTIME.md`](./GOVERNED_SYNTHETIC_WORLD_RUNTIME.md) and `mandala/proto/`. It does not fork a competing manifesto. It does not claim the Engine can beat Unreal this week.

---

## Identity

You are not building “a renderer.” Mandala is an organ. The Engine is the platform that keeps organs lawful:

```
Constitutional Laws → Certified 4D State S(x,y,z,t,…)
  → organs propose transitions
  → Constitutional Gate (invariants / contracts)
  → pass: New Certified State
  → Mandala (observation / pixels) + Movie Lane (observer path)
```

The renderer does not decide what reality is. Governance preserves **laws**, not equilibrium. Physical invariants vs creative laws: authors may instantiate a different constitution (`MEMORY_GRAVITY_CONSTITUTION_DECLARED`). That is a new world-law, not “invalid physics.”

### Organ Map (do not invent organs)

| Organ | Owns | Does not own |
|-------|------|----------------|
| **Story Forge** | Intent, narrative constraints, world-law declarations | Pixels, time integration |
| **Mandala** | Geometry, fields, visibility, projection | Certified truth |
| **Simulation Chamber** | Temporal evolution `t → t+1` | Observer playback |
| **AI Painter** | Appearance / emotion under state constraints | Reality |
| **Mythar** | Breath, acoustic field, speech realization | Time |
| **AAIS** | Contracts, invariant enforcement, provenance, arbitration | Creative authorship |
| **Movie Lane** | Observer path, editing, assembly | Time (must not call the integrator to “play”) |

---

## The 10 foundations — repo reality

Tags: **enforced** (tests hold) · **partial** (real code, incomplete) · **skeleton** (types/log/stub) · **declared** (designed, not built) · **blocked-with-evidence**.

| # | Need | Status now | Evidence (paths) | Honest gap |
|---|------|------------|------------------|------------|
| 1 | **GPU substrate** | **partial** (one kernel + async queue) | `mandala/proto/cpu-reference.mjs` (**enforced** truth); `mandala/proto/backend/gpu-contract.mjs`; `mandala/engine/gpu/async-queue.mjs` (CPU fallback); `mandala/substrate/`; `native-preview/src/VulkanComputeEngine.cpp` | Not a mature substrate. Queue does **not** schedule certified evolution. No temporal memory pools, no SPIR-V modular world linking. |
| 2 | **4D scene graph** | **skeleton** (v0.1) | `mandala/engine/scenegraph.mjs`, `mandala/engine/test/scenegraph.test.js`; proto certified state `mandala/proto/certified-state.mjs` | Temporal nodes + organ tags + domain wrap exist. Unreal/Unity/Blender-class graphs, depsgraph, live mutation, full topology surgery: **declared**. |
| 3 | **Physics core** | **partial** | Named organ API `mandala/engine/physics/` (integrator, ∇φ, causality, AABB/occupancy) over proto `cpu-reference.mjs`. Cinematic default `--solver mandala-proto` maps −∇φ onto actors; `--solver pose` is `pose_interpolation` / `notGradV`. | Not production rank. Not Unreal cloth. Tiny 32³ CPU lattice. |
| 4 | **Material system** | **partial** math, **primitive** look | Engine layered BSDF `mandala/engine/materials/` (substrate + defect, `3ρ/(4π)`, η, \|∇φ\| emission). RT4D `bsdf4d.js` (R5). | Not film PBR. Look is still primitive. |
| 5 | **Toolchain** | **partial** interchange / IDE **declared** | GLB export **working**: `character/tools/`; FBX **skeleton**; `mandala-app/` is Electron, **not** the Mandala IDE | No Mandala IDE, shader debugger, sim profiler, or timeline editor. GLB→lattice compiler **declared**. |
| 6 | **Runtime editor** | **partial** (CLI + HTML) | `mandala/engine/editor/cli.mjs`, `editor/index.html` — list/scrub/hash/`--organ`; cannot edit physics without a proposal | Not Unreal Editor. Live shader reload **blocked-with-evidence** (`--organ` stub). |
| 7 | **Stable ABI** | **working** freeze `mandala-engine-organ.v1` (**no AAIS-UL v20**) | [`../../mandala/engine/ABI.md`](../../mandala/engine/ABI.md) + `mandala/engine/aais/schema/`. Physics `mandala-engine-physics.v0.2`. Axiom/UALS cousins unchanged. | Do **not** invent AAIS-UL v20. Full arbitration still **partial**. Constitution files untouched. |
| 8 | **Renderer rewrite** | **declared** / tiny **partial** extra | RT4D CPU path tracer. Proto slice `mandala-project.mjs`. Engine layered project + 2-sample observer accumulation `mandala/engine/project.mjs`. Proof 4 holds. | Mesh shaders / bindless / GPU-driven / TAA: **not started**. Renderer cannot mutate certified state. |
| 9 | **Vision** | **partial** (proto + organs + this roadmap) | This file + `GOVERNED_SYNTHETIC_WORLD_RUNTIME.md` + `mandala/proto/` + `mandala/engine/` | Organs have callable implementations. Not a shipped product. Movie Lane must not own time. |
| 10 | **Roadmap** | **partial** (this SoT) | Versions below | v1.0 exit criteria are **not** all met. |

---

## Versioned roadmap (v0.1–v1.0)

v0.2–v0.9 are **partial** or **working** at tiny CPU scale. v1.0 stays **partial** until exit criteria below are truly met. Do not mark the product “done.”

### v0.1 — substrate + scene graph

| | |
|--|--|
| **Goal** | Named 4D scene graph over existing lattice substrate + proto certified state. Organ tags. Topological-event log skeleton. GPU substrate stays honest (one kernel, not a rewrite). |
| **Depends on** | `mandala/substrate/`, `mandala/proto/` four proofs |
| **Reuse** | Dual lattice, proto certified hash, organ map, CPU-above-GPU contract |
| **Exit criteria** | Scene graph module exists; graph construction is deterministic; adding a Mandala projection node does not change certified state hash; **proto four proofs still pass** |
| **Status** | **partial** (this slice). GPU substrate itself remains **partial**/`declared`. |

### v0.2 — physics core

| | |
|--|--|
| **Goal** | Temporal integrator + gradient-flow + constraint/collision *interfaces* with one real tiny solver hook (not Unreal cloth). |
| **Depends on** | v0.1 graph domain nodes |
| **Reuse** | `cpu-reference.mjs`, Chamber proto transport, `chamber-hook.mjs` honesty tags, `character/sim/` as **stand-in** not the core |
| **Exit criteria** | Documented Physics Core ABI; at least one integrator that is not pose-lerp; cinematic `--solver pose` still tagged `notGradV` |
| **Status** | **partial** — `mandala/engine/physics/` named organ API; cinematic default is proto transport |

### v0.3 — material system

| | |
|--|--|
| **Goal** | Temporal material records on graph nodes; layered BSDF contract; procedural noise wired as η-cousin, not a second theory. |
| **Depends on** | v0.1 graph; RT4D BSDF math |
| **Reuse** | `bsdf4d.js` / normalization tests; `character/shaders/` JSON contracts |
| **Exit criteria** | Material id on domain/projection nodes; look may still be primitive; no claim of film PBR |
| **Status** | **partial** — layered BSDF + η + grad-phi emission; look still primitive |

### v0.4 — simulation chamber (real solver hook)

| | |
|--|--|
| **Goal** | Chamber consumes graph domains; proto transport remains lawful; cinematic path either hooks the solver or stays explicitly `notGradV`. |
| **Depends on** | v0.2 |
| **Reuse** | `mandala/proto/simulation-chamber.mjs`, `scripts/simulation-chamber.mjs` (do not overwrite honesty) |
| **Exit criteria** | One Chamber entry that advances certified `t` via the physics interface; Movie Lane still does not own time |
| **Status** | **partial** — default `--solver mandala-proto` drives actor world positions from certified defect walk; `--solver pose` remains beat lerp |

### v0.5 — painter integration

| | |
|--|--|
| **Goal** | AI Painter organ proposes appearance under certified constraints; cannot commit illegal state. |
| **Depends on** | v0.3 materials, v0.1 graph `AIPainter` tags |
| **Reuse** | Proto albedo modulation; Lemonade local image path if needed (not cloud by default) |
| **Exit criteria** | Painter node on graph; gated proposal; still not a trained production look |
| **Status** | **partial** — CPU field-tint working; free path SD-Turbo 64×64/4-step via Lemonade `:13307` / sd-server `:13306`; **pro uncensored** Anything-V5 gated by dual env key (`docs/mandala/AI_PAINTER_PRO_TIER.md`) |

### v0.6 — mythar audio

| | |
|--|--|
| **Goal** | Mythar breath/speech as organ output from certified / observer time, not as a second clock. |
| **Depends on** | v0.1 `Mythar` tags; Movie Lane observer `t` |
| **Reuse** | `mrs/narrative/sre/mythar/` voice contract (**declared**); Lemonade TTS backend |
| **Exit criteria** | Acoustic node references certified `t`; valid WAV ≠ perceptual proof |
| **Status** | **partial** — sound lattice WAV; edge-tts caption if present |

### v0.7 — AAIS governance (ABI freeze)

| | |
|--|--|
| **Goal** | Freeze **Mandala Engine Organ ABI v1** (not a fictional AAIS-UL v20). Organ boundaries + artifact schemas + gate rules. |
| **Depends on** | v0.1–v0.4 contracts in use |
| **Reuse** | `mandala/proto/aais-gate.mjs`, StoryForge schemas, Axiom/UALS as *compute* cousins — do not collapse into one ABI |
| **Exit criteria** | Versioned schema + tests; constitution/CHARTER.md untouched unless authorized |
| **Status** | **working** freeze (`mandala-engine-organ.v1`); full arbitration still **partial** |

### v0.8 — editor

| | |
|--|--|
| **Goal** | Runtime editor: live graph inspect, sim scrub of certified cache, organ switching. Not a DCC clone. |
| **Depends on** | v0.1 graph, v0.4 Chamber, v0.7 ABI |
| **Reuse** | `mandala-app/` only as a host candidate — do not pretend it is the IDE today |
| **Exit criteria** | Scrub `t` from cache without re-sim from 0 (proto proof 3) from an editor surface |
| **Status** | **partial** — CLI + HTML; live shader reload blocked-with-evidence |

### v0.9 — SDK

| | |
|--|--|
| **Goal** | Embeddable Engine SDK (graph + certify + project) with provenance. |
| **Depends on** | v0.7 freeze |
| **Reuse** | `sdk/js/`, proto `index.mjs`, engine `index.mjs` |
| **Exit criteria** | Versioned package; examples use frozen snapshots for render |
| **Status** | **partial** — `mandala/engine/sdk/` ESM (`createUniverse`, `propose`, `project`, `observe`, `paint`, `speak`) |

### v1.0 — full engine release

| | |
|--|--|
| **Goal** | Governed synthetic-world runtime you can ship as **Mandala Engine**, with organs, contracts, lattice substrate, temporal physics, painter, breath, assembly lane. |
| **Depends on** | v0.1–v0.9 |
| **Reuse** | Entire `mandala/` tree + RT4D math + Axiom-X backend contract |
| **Exit criteria** | Honest status tags; renderer still cannot mutate certified state; GPU substrate may still be incomplete — do not require mesh shaders / bindless / TAA for the 1.0 *identity* |
| **Status** | **partial** — identity exists; **not** a full engine release |

---

## Independence track (4 phases)

Aspirational Unreal/Unity/Blender independence schedule (11 weeks — **not** achieved). Durable merge of `/tmp` plans with repo reality:

- SoT: [`INDEPENDENCE_ROADMAP.md`](./INDEPENDENCE_ROADMAP.md)
- Ingested plans: [`phases/`](./phases/)

| Phase | Status after latest pass |
|-------|--------------------------|
| 1 Character shader → RT4D | **partial** (registry + shade stand-ins + 64² proof) |
| 2 Certified state store | **partial** (proto) / rt4d twin **skeleton** |
| 3 Post-processing chain | **skeleton** (CPU stubs; no GPU TAA) |
| 4 Constitutional runtime loop | **partial** (proto e2e) / rt4d class **skeleton** |

## Hardware note (this workstation)

15 GB RAM, FX-8350, RX 580 Vulkan (RADV). Keep tests tiny. Proto universe is 32³ × 64 (~32 MiB), not dense 4D voxels. Do not OOM sd-server with 1024² SD requests.

---

## Commands

```bash
node --test mandala/engine/test/scenegraph.test.js
node --test mandala/proto/test/four-proofs.test.js
node --test mandala/substrate/test/ground-state.test.js
node --test mandala/engine/test/*.test.js
node mandala/engine/run-e2e.mjs
# or
node scripts/test-mandala-engine.mjs
npm run test:mandala-proto
npm run test:mandala-engine
```
