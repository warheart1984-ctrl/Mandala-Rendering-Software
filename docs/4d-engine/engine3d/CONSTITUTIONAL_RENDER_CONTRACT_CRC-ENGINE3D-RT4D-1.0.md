# Constitutional Render Contract — CRC-ENGINE3D-RT4D-1.0

> **Status: DECLARED checklist / contract text — not a promoted substrate.**  
> Drive-G-1: INV items below are requirements. Only rows marked with matching tests
> are structurally or partially enforced. Do **not** claim “Constitutional Render
> Substrate v1.0” or “full system” from this document alone.

**Date:** 2026-07-26  
**Companion SPEC:** [ENGINE3D_SCENE_BRIDGE_SPEC_v1.0.md](./ENGINE3D_SCENE_BRIDGE_SPEC_v1.0.md)

## 1. Authority chain (declared)

```
Operator intent
  → Engine3D tick / World3D snapshot (read-only capture)
    → Engine3DBridgeScene + SceneBridgeEvidence
      → optional RT4D adapter / headless receipt
        → (future) governed still / replay provenance
```

Cluster Channels A/B/C and RenderCoordinator remain **declared** in
[ENGINE3D_CLUSTER_AND_WIRE_PROTOCOL_SPEC_v1.0.md](./ENGINE3D_CLUSTER_AND_WIRE_PROTOCOL_SPEC_v1.0.md)
— not stood up as multi-node services by this CRC.

## 2. Invariants

| ID | Invariant | Enforcement today |
|----|-----------|-------------------|
| INV1 | No capture without explicit frameIndex + seed | **partial** — API requires fields; tested |
| INV2 | Capture is read-only (no body mutation) | **enforced** — unit test |
| INV3 | Evidence hashes are deterministic for identical inputs | **enforced** — unit test |
| INV4 | Triangle mesh → RT4D path-trace only when supported | **declared** — mappingNotes.polyMeshTriangles = declared; no mesh path-trace |

## 3. Evidence requirements

Minimum evidence object:

- `frameIndex`, `seed`
- `worldHash`, `cameraHash`, `latticeHash`, `sceneHash`
- `primitiveCount`
- optional `pngChecksum` when an image render completes (not required for headless)

## 4. Promotion requirements (checklist — not claimed complete)

Promotion to any stronger status (“enforced substrate”, production still path)
REQUIRES all of:

1. [ ] INV1–INV4 each have green tests with honest labels
2. [ ] Optional path-trace adapter for sphere scenes is tested for byte-stable PNG (or explicit waiver)
3. [ ] Genblaze default archetype still path remains default without `ENGINE3D_FRAME`
4. [ ] Cluster RenderCoordinator remains out of scope or separately evidenced
5. [ ] Docs updated under Drive-G-1 (no claim ahead of tests)
6. [ ] Human review of CRC + SPEC

Until then, status remains **declared / partial**.
