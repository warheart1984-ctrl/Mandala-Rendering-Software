# 4D Engine v1 — Constitutional Architecture

> **Status:** **constitutional / declared**  
> **Drive-G-1:** No claim may exceed implementation evidence.  
> **Drive-G-2:** Rate dimensions independently; never one “production ready” adjective.  
> **Companion:** [4D_ENGINE_V1_SPEC.md](./4D_ENGINE_V1_SPEC.md) · index: [../README.md](../README.md)

This constitution defines the **architecture and law** of 4D Engine v1. It does **not** assert that the repository “is the Unity of 4D,” that a full editor ships, that physics is product-complete, or that host adapters fully enforce these articles. Where code exists, claims are tagged **partial** or **skeleton** with paths. Where only prose/schema exists, claims are **declared**. Product and go-to-market language appears only as **strategic positioning (declared)**.

---

## Drive-G-2 maturity dimensions

| Dimension | Rating | Evidence / note |
| --- | --- | --- |
| 1. Constitutional model | **Declared → early partial** | This document + World Format / PLP schemas; CHARTER still governs CIEMS browser host |
| 2. Governance methodology | **Partial** (CIEMS) / **declared** (4D Engine) | CKL/CSE/ISL for browser host; 4D Engine articles not machine-enforced |
| 3. Reference implementation | **Partial** | `@mrs/renderer-core` surfaces, projection, RT4D; ChatGPT App; scene-schema DTOs |
| 4. Platform engineering | **Early / skeleton** | Unity LiveLink + FourDAdapter stubs; Unreal `FourDAdapter` plugin **skeleton** |
| 5. Commercial operations | **Roadmap / strategic positioning (declared)** | No self-serve billing, marketplace, or operator runbooks claimed |

**Operator readiness:** deploy & run browser host + MRS packages — **partial** (see root `README.md` / CHARTER).  
**User / commercial readiness:** signup & self-serve — **not claimed**.

Framing: *the engine surfaces may exist; the factory and product shell are early.*

---

## Article I — Dimensional model

**Status:** **constitutional / declared** (math helpers **partial**)

1. Native space is \(\mathbb{R}^4\) with coordinates \((x,y,z,w)\).
2. Orientation uses rotations in the six planes \(XY,XZ,XW,YZ,YW,ZW\) (SO(4) generators). Evidence: `mrs/packages/renderer-core/src/math/mat4.js`, `so4.js`.
3. A **3D image is an observation**, not the world. Projection \(\Pi: \mathbb{R}^4 \to \mathbb{R}^3\) (and onward to screen) is an observation operator under PLP.
4. Evidence for projection helpers (not full PLP enforcement): `math/project.js` (`project4Dto3D`, `project4Dto2D`, …).
5. **Not claimed:** a single closed-form “true” 4D→Unity pipeline; adapters consume projected `Scene3D` + lineage.

---

## Article II — Scene graph & World Format

**Status:** **declared** (schemas + example); runtime loaders **not enforced** for WorldDocument v1

1. Authoritative authored state is a **WorldDocument** (World Format v1). See [WORLD_FORMAT_V1.md](../world-format/WORLD_FORMAT_V1.md).
2. Entities carry 4D transforms, optional geometry refs, materials, and metadata.
3. **Parallel / related formats (do not conflate):**
   | Format | Role | Status |
   | --- | --- | --- |
   | WorldDocument v1 | Multi-entity 4D world SoT (declared) | **declared** |
   | `Scene4DDTO` | ChatGPT / tool single-surface widget contract | **partial** — `@mrs/scene-schema` |
   | `GovernedWorld` (`World.schema.json`) | CIEMS constitutional host world | **partial** |
   | `Scene4D.schema.json` (SDF tree) | CLI / SDF render scene | **partial** |
4. Mapping WorldDocument ↔ Scene4DDTO is **declared** (lossy / view extraction), not runtime-enforced. See SPEC Part II.

---

## Article III — Observation (Projection & Lineage Protocol)

**Status:** **declared** (+ thin `projectWorld` stub **skeleton**)

1. Observation is governed by **PLP v1**: [PLP_V1.md](../plp/PLP_V1.md).
2. `projectWorld(world, observationMode) → { scene3D, lineageBundle }` is the constitutional API surface.
3. Invariants **PL-1…PL-5** (lineage completeness, non-destructive world, mode identity, etc.) are **declared**; only partially exercised by the stub.
4. Existing projection math may feed Scene3D-shaped output for mesh surfaces (**skeleton** path in `@mrs/renderer-core` PLP stub).

---

## Article IV — Physics

**Status:** **deferred / skeleton** (roadmap for product physics)

1. Product-grade 4D dynamics, constraint solvers, and continuous collision are **not** constitutional requirements for Engine v1 minimal core.
2. In-repo `RigidBody4D` / `Collider4D` / `PhysicsWorld4D` are **skeleton** experiments — not claimed as Engine v1 physics.
3. Worlds MAY omit physics; adapters MUST NOT invent 4D forces when only Scene3D is supplied.

---

## Article V — Editor & authoring

**Status:** **skeleton** / **partial** (paths differ by host)

1. Authoring targets WorldDocument (+ observation modes), not hand-edited projected meshes as SoT.
2. Evidence today:
   - Unity 4D Inspector Editor window — **skeleton** (`Assets/Engine/Inspector/`)
   - MRS-IC contracts — **declared** (`docs/4drs/contracts/`)
   - ChatGPT App scene tools — **partial** (`mrs/apps/chatgpt-mrs/`)
   - FourDImporterWindow — **skeleton** (`Assets/Engine/FourDAdapter/Editor/`)
3. A full “4D Unity Editor” product is **roadmap**, not present capability.

---

## Article VI — Staged strategy

**Status:** **strategic positioning (declared)**

Staged path (intent, not schedule commitment):

| Stage | Intent | Evidence today |
| --- | --- | --- |
| 1 | Constitutional docs + World Format + PLP schemas | **this tree** |
| 2 | Projection pipeline + lineage stubs | **skeleton** `projectWorld` |
| 3 | Host adapters consume Scene3D + lineage | Unity + Unreal FourDAdapter **skeleton**; LiveLink **skeleton** |
| 4 | Conversational / tool entry (ChatGPT App) | **partial** `mrs/apps/chatgpt-mrs/` |
| 5 | Broader editor & content tools | **roadmap** |

---

## Article VII — Strategic positioning (declared)

**Status:** **strategic positioning (declared)** — not a commercial claim

Positioning statements below are **aspirational framing** for architecture conversations. They are **not** evidence of market presence, pricing, users, or competitive replacement of Unity/Unreal/Godot.

- 4D Engine v1 aims to be a **dimensional compute & observation layer** that projects into existing 3D hosts.
- Host engines remain the **presentation and interaction substrates**; this constitution does not claim to replace them.
- Differentiation (declared): authored 4D world + lineage-preserving projection, rather than treating 3D meshes as the sole SoT.

---

## Article VIII — Economic model (declared / softened)

**Status:** **strategic positioning (declared)** — **not enforced**, not productized

Economic language is limited to architecture-compatible intent:

1. Value may accrue around **formats** (WorldDocument), **protocols** (PLP), and **adapters** — when implemented and licensed separately.
2. No revenue model, marketplace, royalty, or token scheme is specified or claimed here.
3. Any monetization design is **roadmap** and must not be read as present capability.

---

## Article IX — Product thesis (declared)

**Status:** **strategic positioning (declared)**

**Thesis (declared):** Creators author in 4D; observers consume 3D projections with lineage; hosts (browser, Unity, Unreal, ChatGPT widgets) remain interchangeable presentation layers.

**Evidence-bound today:** parametric surfaces + projection + RT4D + ChatGPT Scene4DDTO path are **partial**; WorldDocument/PLP/adapters are **declared/skeleton**.

---

## Article X — Minimal core

**Status:** checklist — mix of **declared**, **partial**, **skeleton**

For Engine v1 “constitutional minimal core,” the following MUST be **documented**; only some are code-backed:

| # | Core element | Status |
| --- | --- | --- |
| 1 | Dimensional model + observation language | **declared** (this Art. I–III) |
| 2 | World Format schema + example | **declared** |
| 3 | PLP schemas + invariants | **declared** |
| 4 | Projection helpers usable for mesh surfaces | **partial** (`project.js`, surfaces) |
| 5 | Thin `projectWorld` returning Scene3D-shaped + lineage stub | **skeleton** |
| 6 | TypeScript WorldDocument DTOs (parallel to Scene4DDTO) | **declared** DTOs |
| 7 | Unity adapter consuming scene3D+lineage (no 4D compute) | **skeleton** |
| 8 | Unreal adapter | **skeleton** (`unreal/FourDAdapter/`) |
| 9 | Physics | **deferred** |
| 10 | Full editor / commercial ops | **roadmap** |

---

## Evidence map (selected)

| Topic | Path |
| --- | --- |
| Renderer surfaces / draw | `mrs/packages/renderer-core/src/` |
| Projection | `mrs/packages/renderer-core/src/math/project.js` |
| Scene4DDTO | `mrs/packages/scene-schema/src/scene4d.ts` |
| WorldDocument DTO | `mrs/packages/scene-schema/src/world-document.ts` |
| PLP stub | `mrs/packages/renderer-core/src/plp/` |
| ChatGPT App | `mrs/apps/chatgpt-mrs/` |
| Unity LiveLink | `unity/GovernedUnityProject/Assets/Engine/LiveLink/` |
| Unity FourDAdapter | `unity/GovernedUnityProject/Assets/Engine/FourDAdapter/` |
| Unreal FourDAdapter | `unreal/FourDAdapter/` · `docs/4d-engine/v1/adapters/UNREAL_ADAPTER_V1.md` |
| Inspector | `unity/.../Inspector/`, `docs/4drs/inspector/` |
| CIEMS CHARTER | `constitution/CHARTER.md` |
| 4DRS | `docs/4drs/` |

---

## Remediation (Drive-G-1)

If marketing copy or READMEs claim “implements / enforces / complete” for Engine v1 beyond this scorecard: **downgrade wording**, refresh evidence, or move text to a labeled roadmap.
