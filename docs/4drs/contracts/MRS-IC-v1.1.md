# MRS Inspector Contract (MRS-IC) v1.1

**Canonical location:** this file under `docs/4drs/contracts/`.  
**Mirror / redirect:** [`../substrate/MRS-IC-v1.1.md`](../substrate/MRS-IC-v1.1.md) points here.  
**Status (Drive-G-1):** **declared** contract prose. Runtime fill is **skeleton** via `4d-renderer/src/inspector/` (JS SoT) and Unity Editor stubs.  
**Math:** [`../substrate/INSPECTOR_MATH.md`](../substrate/INSPECTOR_MATH.md) · **CRC:** [`../substrate/MRS-CRC-v1.0.md`](../substrate/MRS-CRC-v1.0.md) · **Index:** [`../inspector/README.md`](../inspector/README.md)  
**Successor:** [`MRS-IC-v1.2.md`](./MRS-IC-v1.2.md) (lineage + invariants)

> **Evidence bound:** Absolute “SHALL” language below is **normative intent** for implementations that claim MRS-IC conformance. Present JS/Unity code **prepares** many fields, **stubs** curvature (\(k_1=k_2=0\) with `curvatureStub: true`), and does **not** yet enforce bit-identical multi-host replay or full BVH-path parity with a GPU core.

## Preamble

The MRS 4D Inspector is a constitutional subsystem of the Mandala Rendering System (MRS).

Its purpose is to provide deterministic, evidence-bound, mathematically grounded diagnostics for any inspected point within a 4D manifold.

Version 1.1 introduces diagrammatic constitutional structure, clarifying the Inspector’s role within the governed rendering substrate.

## Diagram A — Constitutional Position of the Inspector

```
+-----------------------------------------------------------+
|                 Sovereign X OS Constitution               |
+-----------------------------------------------------------+
                              |
                              v
+-----------------------------------------------------------+
|            MRS Rendering Constitution (MRS-RC)            |
+-----------------------------------------------------------+
                              |
                              v
+-----------------------------------------------------------+
|         MRS Inspector Contract v1.1 (MRS-IC v1.1)         |
+-----------------------------------------------------------+
                              |
                              v
+-----------------------------------------------------------+
|     Inspector API / Unity Inspector Client / Evidence     |
+-----------------------------------------------------------+
```

## Article I — Jurisdiction of Inspection

### Clause 1.1 — Domain

Conforming inspections **SHALL** operate over the 4D spatial manifold:

\[
p \in \mathbb{R}^{4}
\]

### Clause 1.2 — Acquisition

The Inspector **SHALL** support (and the skeleton API **declares**):

- Screen-space inspection → 4D ray unprojection  
- World-space inspection → explicit 4D ray  
- Primitive-space inspection → primitive ID + local parameters  

### Clause 1.3 — Deterministic Intersection

Conforming Inspectors **SHALL** use the same BVH traversal and primitive intersection routines as the MRS core when those routines are available.

**Present status:** JS path uses `MeshPicker4D` / mesh face pick; full GPU BVH path parity is **skeleton** / optional.

## Diagram B — Inspection Flow

```
Screen Click / Ray Input
            |
            v
    4D Ray Construction
            |
            v
    4D BVH Traversal
            |
            v
    Primitive Intersection
            |
            v
    Differential Geometry (normal, tangents, curvature)
            |
            v
    Projection / Rotation / Hyperplane Analysis
            |
            v
    Topology Extraction
            |
            v
    Inspector4DResult (Evidence Bundle)
```

## Article II — Mandatory Diagnostic Fields

| Clause | Field | Present evidence |
| --- | --- | --- |
| 2.1 | Position \((x,y,z,w)\) | skeleton fill |
| 2.2 | Surface normal \(\hat n_{4}\) | skeleton (edge-based) |
| 2.3 | Tangent basis \(\{t_{1},t_{2}\}\) | skeleton (Gram–Schmidt) |
| 2.4 | Principal curvatures \(\kappa_{1},\kappa_{2}\) | **stub** \(=0\); `curvatureStub: true` |
| 2.5 | Jacobian \(J\in\mathbb{R}^{4\times 2}\) | skeleton from edges |
| 2.6 | Projection matrix \(P:\mathbb{R}^{4}\to\mathbb{R}^{3}\) | declared / host-supplied |
| 2.7 | Hyperplane intersections | skeleton |
| 2.8 | Rotation planes | skeleton / host-supplied |
| 2.9 | Local topology | skeleton (face adjacency) |

### Clause 2.4 note — Stub curvature

Until second fundamental forms exist, implementations **SHALL** set \(\kappa_{1}=\kappa_{2}=0\) and mark the stub explicitly (see MRS-IC v1.2 Invariant 3.5). JS SoT: `principalCurvatureStub` + `curvatureStub: true`.

## Diagram C — Inspector4DResult Structure

```
Inspector4DResult
├── Position (x,y,z,w)
├── Normal4D
├── TangentBasis
│     ├── t1
│     └── t2
├── Curvature
│     ├── k1
│     ├── k2
│     └── curvatureStub (bool)   ← evidence marker
├── Jacobian (4x2)
├── ProjectionMatrix (4x4)
├── HyperplaneIntersections[]
├── RotationPlanes[]
└── Topology
      ├── IncidentCells[]
      ├── NeighborCells[]
      └── BoundaryFlag
```

## Article III — Determinism and Evidence

### Clause 3.1 — Deterministic Output

Conforming Inspectors **SHALL** produce identical results under identical state, projection, and inputs (within the documented numeric model).

**Present status:** intent **declared**; bit-identity across hosts **not** claimed enforced.

### Clause 3.2 — Provenance

Conforming results **SHALL** include: primitive ID, BVH node path (when recorded), projection chain, transform chain.

**Present status:** primitive/face id + optional `bvhPath[]` prepared; full transform/projection chain recording is **partial** / **skeleton**.

### Clause 3.3 — Replay Compatibility

Inspector outputs **SHALL** be valid under deterministic replay. See [`../substrate/INSPECTOR_EVIDENCE_BUNDLE.md`](../substrate/INSPECTOR_EVIDENCE_BUNDLE.md).

## Article IV — Interoperability

### Clause 4.1 — API Surface

Declared endpoints:

- `inspectAtScreenPoint(sx, sy)`  
- `inspectAtRay(origin4D, dir4D)`  
- `inspectPrimitive(id, params)`  

**SoT:** `4d-renderer/src/inspector/` (`MRSInspector4D`). C++ headers in integration guides are **declared** host API sketches, not a shipped native library.

### Clause 4.2 — Serialization

JSON (+ binary **planned**). Evidence bundles: see evidence-bundle docs.

### Clause 4.3 — Versioning

Schema versioned (`schemaVersion: "1.1"`). Constitutional evolution continues in MRS-IC v1.2+.

## Shader debug extension (optional)

`shaderDebug`: node values at \(p\), final color, material params — **declared / future** (evolution v1.4). Not required for v1.1 mandatory fields. See [`../substrate/shader-debugging.md`](../substrate/shader-debugging.md).
