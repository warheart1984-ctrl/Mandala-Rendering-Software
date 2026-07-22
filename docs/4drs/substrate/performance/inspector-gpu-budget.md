# Inspector performance budget + GPU cost model

**Status:** **declared budget / design target** — **not** a measured SLA and **not** enforced by the engine.  
Drive-G-1: do not promote these numbers to “production-ready” or “guaranteed” without profiling evidence.

## 1. Performance budget overview (design target)

Inspector **SHOULD NOT** degrade interactive rendering when profiling shows budgets are exceeded; hosts may defer inspection to async/idle paths (**declared** guidance).

| Stage | Budget (target) |
| --- | --- |
| 4D BVH traversal | ≤ 20 µs |
| Primitive intersection | ≤ 10 µs |
| Differential geometry | ≤ 15 µs |
| Projection + rotation | ≤ 5 µs |
| Hyperplane evaluation | ≤ 5 µs |
| Topology extraction | ≤ 10 µs |
| **Total** | **≤ 65 µs per inspection** |

These figures are **design targets**, not CI-verified timings.

## 2. GPU / compute cost model (declared)

### BVH traversal

Cost: \(O(\log N)\) with \(N\) = number of 4D primitives.

Expected (sketch):

- 20–40 node visits  
- 4D slab intersection per node  
- low warp divergence if rays are coherent  

### Primitive intersection

Hyper-triangles or hyper-faces: \(O(1)\), dominated by dot products, barycentric solve, gradient evaluation.

### Differential geometry

- Normal \(\nabla S(p)\): ~4 partials (or edge-based substitute in skeleton)  
- Tangent basis: Gram–Schmidt (2–3 dots + normalize)  
- Curvature (**stub**): constant cost  

### Jacobian

\(4\times 2\) matrix: ~8 partials / stores (or edge columns in skeleton).

### Hyperplane intersections

Cost \(O(H)\), \(H\) = debug hyperplanes (usually 1–4).

### Rotation planes

~1 lookup + angle extraction.

### Topology extraction

Cost \(O(k)\), \(k\) = incident simplices (usually small).

## 3. Unity round-trip cost (design target)

| Step | Target |
| --- | --- |
| JSON serialization | ≤ 1 ms |
| WebSocket transfer (local) | ≤ 0.5 ms |
| Unity UI update | ≤ 0.5 ms |
| **Total Unity overhead** | **≤ 2 ms** |

**Present evidence:** Editor window is a **skeleton**; round-trip timings are **not** measured in CI.

## Related

- Inspector index: [`../../inspector/README.md`](../../inspector/README.md)  
- MRS-IC v1.2: [`../../contracts/MRS-IC-v1.2.md`](../../contracts/MRS-IC-v1.2.md)  
