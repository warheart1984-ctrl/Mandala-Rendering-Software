# MRS Inspector Contract (MRS-IC) v1.1

**Status:** **declared** (Drive-G-1). Runtime fill is **skeleton** via `4d-renderer/src/inspector/`.  
**Math:** [`INSPECTOR_MATH.md`](./INSPECTOR_MATH.md) · **CRC:** [`MRS-CRC-v1.0.md`](./MRS-CRC-v1.0.md)

## Preamble

The MRS Inspector produces deterministic, mathematically grounded, provenance-preserving diagnostics for a point on a 4D rendered manifold. Outputs may serve as constitutional evidence for debugging and replay validation when persisted.

## Diagram 1 — Position in stack

```
Sovereign X OS Constitution
        │
        ▼
MRS Constitutional Rendering Layer (MRS-CRC)
        │
        ▼
MRS Inspector Contract v1.1
        │
        ▼
Inspector API / Unity Inspector Client
```

## Diagram 2 — Inspection flow

```
Screen click / ray / primitive params
        │
        ▼
4D ray construction
        │
        ▼
4D BVH / mesh intersection
        │
        ▼
Local differential geometry
        │
        ▼
Projection / rotation / hyperplane analysis
        │
        ▼
Topology extraction
        │
        ▼
Inspector4DResult (+ optional evidence bundle)
```

## Article I — Jurisdiction

**1.1 Domain.** Inspections operate at \(p\in\mathbb{R}^{4}\).  
**1.2 Acquisition.** Screen-space, world-space ray, and primitive+params.  
**1.3 Deterministic intersection.** Prefer the same BVH/primitive path as the core (when available).

## Article II — Mandatory diagnostic fields

| Clause | Field |
| --- | --- |
| 2.1 | Position \((x,y,z,w)\) |
| 2.2 | Surface normal \(\hat n_{4}\) |
| 2.3 | Tangent basis \(\{t_{1},t_{2}\}\) |
| 2.4 | Principal curvatures \(\kappa_{1},\kappa_{2}\) (+ dirs when available) |
| 2.5 | Jacobian \(J\in\mathbb{R}^{4\times 2}\) |
| 2.6 | Projection matrix \(P\) |
| 2.7 | Hyperplane intersections |
| 2.8 | Rotation planes |
| 2.9 | Local topology |

**Diagram 3 — Result tree:** see `Inspector4DResult` in engine + Unity DTOs.

## Article III — Determinism and evidence

**3.1** Identical state + projection + inputs → identical results (documented numeric model).  
**3.2** Provenance: primitive id, BVH path (when recorded), projection/transform chain.  
**3.3** Replay-compatible; see [`INSPECTOR_EVIDENCE_BUNDLE.md`](./INSPECTOR_EVIDENCE_BUNDLE.md).

## Article IV — Interoperability

**4.1 API:** `inspectAtScreenPoint`, `inspectAtRay`, `inspectPrimitive`.  
**4.2** JSON (+ binary planned).  
**4.3** Schema versioned (`schemaVersion: "1.1"`).

## Shader debug extension (optional)

`shaderDebug`: node values at \(p\), final color, material params — **declared**; not required for v1.1 mandatory fields.
