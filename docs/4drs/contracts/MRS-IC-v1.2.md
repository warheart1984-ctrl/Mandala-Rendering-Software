# MRS Inspector Contract (MRS-IC) v1.2

**Canonical location:** this file under `docs/4drs/contracts/`.  
**Also indexed:** [`../inspector/MRS-IC-v1.2.md`](../inspector/MRS-IC-v1.2.md) (redirect).  
**Prior:** [`MRS-IC-v1.1.md`](./MRS-IC-v1.1.md)  
**Status (Drive-G-1):** **declared** — invariants are normative *intent* for conforming implementations. Present JS/Unity code is **skeleton** and does **not** runtime-enforce all invariants (especially bit-identical replay, full provenance chains, projection consistency checks).

> Soften absolute enforcement claims: curvature remains a **stub**; shader debug and GPU budgets are **declared / future**.

## Constitutional Lineage Diagram

```
Sovereign X OS Constitution
        |
        v
CIEMS Constitutional Stack
        |
        v
MRS Rendering Constitution (MRS-RC)
        |
        v
MRS Inspector Contract v1.2 (MRS-IC v1.2)
        |
        v
Inspector API / Unity Inspector / Evidence Bundles
```

## Preamble

The MRS Inspector is a governed subsystem of the Mandala Rendering System.

Its purpose is to provide deterministic, mathematically grounded, and evidence-preserving diagnostics for any inspected point in a 4D manifold.

Version 1.2 introduces constitutional invariants that **MUST** hold across conforming implementations, integrations, and replay scenarios. Until code and tests prove an invariant, charter status remains **declared** / **skeleton**.

## Article I — Jurisdiction

### Clause 1.1 — Domain

Conforming inspections **SHALL** operate over:

\[
p \in \mathbb{R}^{4}
\]

### Clause 1.2 — Acquisition

Inspector **SHALL** support:

- screen-space inspection  
- world-space inspection  
- primitive-space inspection  

### Clause 1.3 — Deterministic Intersection

Inspector **SHALL** use the same BVH + primitive intersection pipeline as the renderer when that pipeline is available.

**Present:** mesh pick / optional BVH path recording — **skeleton**.

## Article II — Mandatory Diagnostic Fields

Inspector **SHALL** return:

| Field | Notes |
| --- | --- |
| Position \((x,y,z,w)\) | required |
| Surface normal (4D) | required |
| Tangent basis \((t_1,t_2)\) | required |
| Principal curvature \((k_1,k_2)\) | **stub invariant** (3.5) |
| Jacobian \((4\times 2)\) | required |
| Projection matrix (4×4 or 3×4) | required |
| Hyperplane intersections | required (may be empty) |
| Rotation planes | required (may be empty / host defaults) |
| Local topology | required |

## Article III — Constitutional Invariants

### Invariant 3.1 — Deterministic Output

Inspector results **MUST** be identical under identical:

- engine state  
- projection configuration  
- ray input  
- RNG seed  

**Evidence today:** intent **declared**; portable FNV-style evidence hash in JS — **not** a multi-host SLA.

### Invariant 3.2 — Provenance Preservation

Inspector results **MUST** include:

- primitive ID  
- BVH node path  
- projection chain  
- transform chain  

**Present:** primitive/face id + `bvhPath[]` **prepared**; full chains **skeleton**.

### Invariant 3.3 — Replay Compatibility

Inspector **MUST** produce identical evidence bundles under deterministic replay (documented numeric model).

See [`../substrate/INSPECTOR_EVIDENCE_BUNDLE.md`](../substrate/INSPECTOR_EVIDENCE_BUNDLE.md). Bit-for-bit cross-host identity is an **intent**, not a measured guarantee in v1.2.

### Invariant 3.4 — Mathematical Integrity

All differential quantities **MUST** be computed from gradients, Jacobians, and first/second fundamental forms **when available**.

**Present:** normals/tangents/Jacobian from triangle edges; second forms absent.

### Invariant 3.5 — Stub Curvature

Until second fundamental forms exist:

\[
\kappa_1 = \kappa_2 = 0
\]

This **MUST** be explicitly marked as a stub in results and evidence bundles (`curvatureStub: true` / equivalent).

**Evidence:** `mrs/packages/renderer-core/src/inspector/types.js`, `differential.js` (`principalCurvatureStub`).

### Invariant 3.6 — Projection Consistency

Projection matrix **MUST** match the active rendering projection at the moment of inspection.

**Present:** host-supplied matrix on inspector instance — **no** runtime cross-check against the renderer gate.

### Invariant 3.7 — Topology Integrity

Topology **MUST** reflect the actual mesh connectivity at the inspected point.

**Present:** face incidence / neighbor heuristic — **skeleton**.

## Article IV — Interoperability

Inspector **SHALL** expose:

- `inspectAtScreenPoint`  
- `inspectAtRay`  
- `inspectPrimitive`  

Inspector **SHALL** serialize to:

- JSON (present)  
- binary (**planned**)  
- evidence bundles (present helper)

**SoT:** `mrs/packages/renderer-core/src/inspector/` (`@mrs/renderer-core`). Unity: `unity/GovernedUnityProject/Assets/Engine/Inspector/`.

## Article V — Constitutional Evolution

| Version | Scope | Status |
| --- | --- | --- |
| v1.0 | initial skeleton | historical / superseded |
| v1.1 | diagrams + structure | **declared** ([MRS-IC-v1.1](./MRS-IC-v1.1.md)) |
| v1.2 | invariants + lineage | **declared** (this doc) |
| v1.3 | curvature upgrade | **roadmap / future** |
| v1.4 | shader graph debugging | **roadmap / future** |

## Cross-links

- Inspector index: [`../inspector/README.md`](../inspector/README.md)  
- Substrate README: [`../substrate/README.md`](../substrate/README.md)  
- Charter VII.c: [`../../../constitution/CHARTER.md`](../../../constitution/CHARTER.md)  
- Contracts index: [`../substrate/CONSTITUTIONAL_CONTRACTS.md`](../substrate/CONSTITUTIONAL_CONTRACTS.md)  
