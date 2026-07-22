# Inspector evidence bundle

**Status:** **declared**. Used for replay / research artifacts. Helper: `buildInspectorEvidenceBundle` in `4d-renderer/src/inspector/serialize.js`.  
**Alias:** [`evidence-bundle.md`](./evidence-bundle.md) redirects here.

## Bundle structure

```
InspectorEvidenceBundle
├── schemaVersion: "1.1"
├── frameIndex
├── rayInput (origin, dir) | screenInput (sx, sy)
├── bvhPath[]
├── primitiveId
├── Inspector4DResult
│     ├── Position
│     ├── Normal4D
│     ├── TangentBasis
│     ├── Curvature (+ curvatureStub)
│     ├── Jacobian
│     ├── ProjectionMatrix
│     ├── HyperplaneIntersections[]
│     ├── RotationPlanes[]
│     └── Topology
└── hash (portable fingerprint of canonical JSON body without hash)
```

Present JS hash is `fnv1a64:…` (portable skeleton fingerprint) — **not** claimed as cryptographic SHA-256 enforcement.

## Replay validation rule

**Intent (MRS-IC Invariant 3.3):** given identical:

- initial state  
- input sequence  
- RNG seed  

the `InspectorEvidenceBundle` **SHOULD** match under the documented numeric model.

**Drive-G-1:** Bit-for-bit identity across hosts is **not** claimed enforced in v1.1/v1.2. Prefer weaker wording until CI proves it.

## Stub curvature marker

Results and nested `Inspector4DResult` **MUST** carry `curvatureStub: true` while \(\kappa_1=\kappa_2=0\) (Invariant 3.5). See [`../contracts/MRS-IC-v1.2.md`](../contracts/MRS-IC-v1.2.md).
