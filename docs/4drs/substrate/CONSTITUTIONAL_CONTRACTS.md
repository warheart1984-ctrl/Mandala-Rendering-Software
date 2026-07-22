# Constitutional Specification Layer — Substrate Contracts

**Document role:** Elevate the mathematical substrate into CIEMS / Sovereign X constitutional contracts.  
**Status:** **declared** — articles are normative *intent*. They are **not** runtime-enforced unless charter evidence says **enforced** / **partial**.  
**Math SoT:** [`MATHEMATICAL_FOUNDATIONS.md`](./MATHEMATICAL_FOUNDATIONS.md)  
**Charter:** [`../../constitution/CHARTER.md`](../../constitution/CHARTER.md)

---

## Contract index

| ID | Name | Domain |
| --- | --- | --- |
| **4D-PCC** | 4D Physics Constitutional Contract | Dynamics on \(\mathbb{R}^{4}\times\mathbb{R}\) |
| **LEL-C** | Live Engine Link Constitutional Contract | Synchronous morphisms \(L_{ij}\) |
| **SG-C** | Shader Graph Constitutional Contract | Pure DAG shading over 4D inputs |
| **AE-C** | Asset Export Constitutional Contract | Explicit \(\Pi\) + provenance |
| **DR-C** | Deterministic Replay Constitutional Contract | \(S_{n}=T^{(n)}(S_{0},\{u_{k}\})\) |
| **MRS-CRC** | Constitutional Rendering Contract v1.0 | [`MRS-CRC-v1.0.md`](./MRS-CRC-v1.0.md) |
| **MRS-IC** | Inspector Contract v1.1 / v1.2 | [`../contracts/MRS-IC-v1.1.md`](../contracts/MRS-IC-v1.1.md), [`../contracts/MRS-IC-v1.2.md`](../contracts/MRS-IC-v1.2.md) |

See also: [`BVH4D_GPU.md`](./BVH4D_GPU.md), [`UNITY_LIVE_LINK.md`](./UNITY_LIVE_LINK.md), [`DETERMINISTIC_REPLAY.md`](./DETERMINISTIC_REPLAY.md), [`INSPECTOR_MATH.md`](./INSPECTOR_MATH.md), [`../inspector/README.md`](../inspector/README.md).

---

## 1. 4D Physics Constitutional Contract (4D-PCC)

### Article I — Domain

All physical entities **SHALL** be modeled in \(\mathbb{R}^{4} \times \mathbb{R}\) (space × time), with state in a declared space \(S\).

### Article II — Dynamics

The engine **SHALL** evolve state according to an explicit law of the form

\[
\frac{\partial\Phi}{\partial t}
=
F\bigl(\Phi,\nabla_{4}\Phi,x,t\bigr)
\]

or an equivalent discrete particle / constraint scheme documented for the integrator in use (e.g. Newtonian + XPBD in \(\mathbb{R}^{4}\)).

### Article III — Determinism

All physical updates **SHALL** be deterministic under fixed inputs \((S_{0},\{u_{n}\},\Delta t,\text{seed})\).

### Article IV — Evidence

Every physical step **SHALL** be able to produce:

- state delta  
- constraint-resolution evidence (when constraints apply)  
- temporal provenance  

**Implementation status:** **declared**. Skeleton: `4d-renderer/src/physics/`. No CKL policy currently binds 4D-PCC articles.

---

## 2. Live Engine Link Constitutional Contract (LEL-C)

### Article I — Morphisms

Subsystems **SHALL** expose typed state spaces \(E_{k} = \{\Phi_{k}(x,t)\}\).

### Article II — Links

Links **SHALL** be synchronous morphisms

\[
L_{ij} \colon E_{i} \to E_{j}
\]

with a declared schedule (typically per frame / per tick).

### Article III — Continuity

No subsystem **MAY** diverge from its linked counterpart without constitutional justification (recorded intent + evidence).

**Implementation status:** **declared**. Experimental coupling exists via shared-frame / native preview paths; no formal \(L_{ij}\) registry.

---

## 3. Shader Graph Constitutional Contract (SG-C)

### Article I — Node semantics

Each node **SHALL** be a pure function

\[
n_{k} \colon \mathbb{R}^{4} \times P_{k} \to V_{k}
\]

(no hidden mutable globals inside node evaluation).

### Article II — Graph integrity

Graphs **SHALL** be DAGs (no cycles).

### Article III — Dimensional awareness

Shading that claims 4D awareness **SHALL** incorporate 4D geometry inputs (including \(w\)), normals \(N_{4}\), and/or manifold structure as documented for the graph.

**Implementation status:** **declared**. Skeleton graph/WGSL path: `4d-renderer/src/shader-graph/`.

---

## 4. Asset Export Constitutional Contract (AE-C)

### Article I — Projection

Export **SHALL** use explicit projection operators \(\Pi\) (slice, perspective, orthographic, or documented composition).

### Article II — Provenance

Exports **SHALL** include, when claiming constitutional export:

- projection evidence (which \(\Pi\), parameters)  
- dimensional-loss record (what was discarded)  
- serialization manifest (schema + asset ids)

**Implementation status:** **declared**. Partial mesh/movie export exists without full AE-C manifests.

---

## 5. Deterministic Replay Constitutional Contract (DR-C)

### Article I — Replay function

Replay **SHALL** be defined as

\[
S_{n}
=
T^{(n)}\bigl(S_{0},\{u_{k}\}_{k=0}^{n-1}\bigr)
\]

### Article II — Temporal integrity

Replay **SHALL** reconstruct identical state trajectories under identical inputs (within the documented numeric model).

### Article III — Constitutional evidence

Replay **SHALL** be able to produce:

- temporal lineage  
- input chain  
- state-evolution proof (or equivalent CSR / CSSV / provenance artifacts)

**Implementation status:** **partial** for browser param/timeline + provenance/CSSV; **declared** for bit-identical multi-host full-engine \(T\).

---

## Enactment path (roadmap — not present capability)

1. Machine-readable schemas for each contract under `schemas/`.  
2. CKL policies that refuse steps lacking required evidence articles.  
3. Conformance probes per host (browser / Unity / Unreal).  
4. Charter promotion: **declared** → **partial** → **enforced** only with tests.

Until then, treat this file as **constitutional specification prose**, not a runtime gate.
