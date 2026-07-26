# ENGINE3D Scene Bridge Specification v1.0

> **Status of this document: DECLARED** (normative intent).  
> Implementation under `@mrs/engine3d-core` `src/scene/` is **partial** — see §6.  
> Drive-G-1: do not treat this as a promoted “Constitutional Render Substrate” or full system.

**Date:** 2026-07-26  
**Package:** `mrs/packages/engine3d-core`  
**Related:** [CRC-ENGINE3D-RT4D-1.0](./CONSTITUTIONAL_RENDER_CONTRACT_CRC-ENGINE3D-RT4D-1.0.md),
[RFC-ENGINE3D-RT4D-INTEGRATION-1.0](./RFC-ENGINE3D-RT4D-INTEGRATION-1.0.md)

## 1. Purpose

Define a **read-only** capture path from Engine3D world state (`World3D`, `Body`,
`WorldMesh`, optional `VisualMod` / `MandalaLattice`) into a typed intermediate
**bridge scene document** that RT4D adapters may consume.

This bridge does **not** replace Genblaze prompt→archetype stills
(`renderer-core/scripts/render-still.mjs`).

## 2. Constitutional requirements (CR)

| ID | Requirement | Status |
|----|-------------|--------|
| CR1 | Capture MUST NOT mutate bodies/world | **enforced** (test: no position/velocity change) |
| CR2 | Same world + seed + frameIndex MUST yield identical scene + evidence hashes | **enforced** |
| CR3 | Evidence MUST carry frameIndex, seed, worldHash, primitiveCount, cameraHash, latticeHash, sceneHash | **enforced** |

## 3. Functional requirements (FR)

| ID | Requirement | Status |
|----|-------------|--------|
| FR1 | Map each `Body` to a hypersphere at body position; radius from mass | **partial** (sphere approx; **enforced** in tests) |
| FR2 | Optionally sample `WorldMesh` vertices as capped point hyperspheres | **partial** (capped samples; triangle mesh **declared**) |
| FR3 | Emit lattice descriptor from `VisualMod.shaderParams` (+ optional Mandala nodes) | **partial** |
| FR4 | Optional headless frame receipt (`renderEngine3dFrame`) for CI | **partial** (null-headless; no PNG by default) |

## 4. Output format

Schema id: `engine3d-bridge-scene/1.0`

```json
{
  "schemaVersion": "engine3d-bridge-scene/1.0",
  "frameIndex": 0,
  "seed": 12345,
  "primitives": [
    {
      "kind": "hypersphere",
      "id": "body:a",
      "center": [0, 0.1, 0, 0],
      "radius": 0.35,
      "source": "body",
      "sourceId": "a",
      "materialHint": "surf"
    }
  ],
  "camera": {
    "eye": [0, 1.6, 4.5, 0],
    "lookAt": [0, 0.2, 0, 0],
    "up": [0, 1, 0, 0],
    "fovY": 0.9
  },
  "lattice": {
    "nodeCount": 0,
    "glyphIntensity": 0,
    "glyphCount": 0,
    "shaderParams": {}
  },
  "mappingNotes": {
    "polyMeshTriangles": "declared",
    "bodyApproximation": "sphere_from_mass",
    "meshVertices": "point_hypersphere_samples_capped",
    "lattice": "visualMod_and_optional_mandala_nodes"
  }
}
```

### Hash algorithm (evidence)

FNV-1a 32-bit over UTF-16 code units of **canonical JSON** (object keys sorted).
Documented in `src/scene/hash.ts`. Not cryptographic SHA-256 of files.

## 5. Real Engine3D APIs (not invented)

Capture consumes:

- `World3D` / `DefaultWorld3D`
- `Body` / `DefaultBody`
- `WorldMesh` / `DefaultWorldMesh`
- `VisualMod` (optional)
- `MandalaLattice` (optional)

There is no `Engine3DWorld`, `Engine3DBody.getMeshes()`, or `Rt4dRenderer` in this package.

## 6. What RT4D can render from Engine3D today

| Input | RT4D path | Status |
|-------|-----------|--------|
| Body spheres (approx) | Hypersphere descriptors / future still adapter | **partial** |
| Mesh vertex point samples | Same (capped) | **partial** |
| Arbitrary triangle meshes | Not supported by RT4D still primitives | **declared** |
| Genblaze prompt archetypes | Unchanged default still path | **enforced** (separate) |
| Cluster RenderCoordinator | Multi-node services | **declared** (docs only) |

## 7. Promotion

See [CIEMS_ENGINE3D_RT4D_PROMOTION_CHECKLIST.md](./CIEMS_ENGINE3D_RT4D_PROMOTION_CHECKLIST.md).
This SPEC is **not** promoted.
