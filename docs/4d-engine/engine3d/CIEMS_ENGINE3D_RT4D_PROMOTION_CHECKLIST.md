# CIEMS — Engine3D → RT4D Promotion Checklist

> **Status: checklist / not yet all green.**  
> Drive-G-1: this is a tracking artifact, not evidence of promotion.
> Do not claim “Constitutional Render Substrate v1.0” until rows are green
> with linked tests.

**Date:** 2026-07-26  
**Contract:** [CRC-ENGINE3D-RT4D-1.0](./CONSTITUTIONAL_RENDER_CONTRACT_CRC-ENGINE3D-RT4D-1.0.md)

## Checklist

| # | Item | Status |
|---|------|--------|
| 1 | SceneBridge capture API on real `World3D` / `Body` / `WorldMesh` | **partial** — green tests in `engine3d-core` |
| 2 | Deterministic scene + evidence hashes (same inputs) | **enforced** (unit) |
| 3 | Capture does not mutate world | **enforced** (unit) |
| 4 | Evidence required fields present | **enforced** (unit) |
| 5 | Headless frame receipt deterministic | **partial** — null-headless enforced; PNG optional/absent |
| 6 | Sphere/body approximation documented | **partial** |
| 7 | Triangle mesh → RT4D path-trace | **declared** / **red** |
| 8 | PathTracer4D still from bridge scene (gated, non-default) | **declared** / **red** |
| 9 | Genblaze archetype still remains default | **enforced** (unchanged path; no hijack) |
| 10 | INV1–4 all enforced with tests | **partial** — INV4 declared only |
| 11 | Cluster RenderCoordinator multi-node | **declared** / **red** (docs only) |
| 12 | WebGPU constitutional renderer promotion | **declared** / **red** |
| 13 | MandalaMapping “full” visualizer service | **declared** / **red** (mapping helper remains partial) |
| 14 | Human CRC review + Drive-G-1 doc pass | **red** until review |

## Remaining reds (summary)

- Full mesh path-trace mapping
- Gated PathTracer still from Engine3D frames
- Cluster / WebGPU / Mandala “full” promotions
- Formal human promotion sign-off

## Linked evidence (code)

- `mrs/packages/engine3d-core/src/scene/`
- `mrs/packages/engine3d-core/test/scene/scene-bridge.test.ts`
- `mrs/packages/renderer-core/src/render/rt4d/bridge/engine3dBridgeScene.js`
