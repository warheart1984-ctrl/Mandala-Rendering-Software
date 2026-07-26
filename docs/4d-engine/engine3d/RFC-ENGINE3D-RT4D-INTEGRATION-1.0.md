# RFC: Engine3D ↔ RT4D Integration 1.0

> **Status: DECLARED** — architecture and roadmap.  
> Partial code exists in `@mrs/engine3d-core` (`src/scene/`) and
> `@mrs/renderer-core` (`src/render/rt4d/bridge/engine3dBridgeScene.js`).  
> Not a multi-node cluster; not a WebGPU constitutional renderer promotion.

**Date:** 2026-07-26

## 1. Goals

1. Capture Engine3D frames into a stable intermediate scene document.
2. Feed optional RT4D / headless adapters without inventing fake runtimes.
3. Preserve Genblaze prompt→archetype stills as the default still path.

## 2. Architecture (declared + partial)

```
DefaultEngineHost / World3D
        │  read-only
        ▼
Engine3DSceneBridge.capture(...)
        │
        ├─ Engine3DBridgeScene (JSON)
        └─ SceneBridgeEvidence (hashes)
                │
        ┌───────┴────────┐
        ▼                ▼
renderEngine3dFrame   renderer-core bridge adapter
(null-headless)       (hypersphere descriptors)
        │                │
        └──── CI / optional future PathTracer4D ────┘
```

### Explicit non-goals (this RFC)

- Standing up Channels A/B/C or RenderCoordinator services
- Replacing `render-still.mjs` archetype selection
- Claiming MandalaMapping is “full”
- Dynamic WebGPU constitutional renderer promotion

## 3. Pipeline

1. Operator or test builds `World3D` (+ optional `VisualMod` / `MandalaLattice`).
2. `captureEngine3DScene({ world, frameIndex, seed, ... })`.
3. Tests assert determinism + non-mutation.
4. Optional: `renderEngine3dFrame` → receipt hash for CI.
5. Optional (future): construct `Scene4D` Hyperspheres from descriptors and path-trace behind `ENGINE3D_FRAME=1`.

## 4. Security / sovereignty

- No secrets in bridge documents.
- Hashes are FNV-1a / truncated digests for determinism — not auth signatures.
- Wire protocol signatures remain under the cluster SPEC (**declared**).

## 5. Future extensions (declared)

- Bounded PathTracer4D still from sphere-only bridge scenes
- Camera type owned by Engine3D (today: bridge camera descriptor defaults)
- Provenance attachment aligned with RT4D still provenance JSON
- Cluster job handoff (Channels) — docs only until implemented

## 6. References

- [ENGINE3D_SCENE_BRIDGE_SPEC_v1.0.md](./ENGINE3D_SCENE_BRIDGE_SPEC_v1.0.md)
- [CONSTITUTIONAL_RENDER_CONTRACT_CRC-ENGINE3D-RT4D-1.0.md](./CONSTITUTIONAL_RENDER_CONTRACT_CRC-ENGINE3D-RT4D-1.0.md)
- [ENGINE3D_CLUSTER_AND_WIRE_PROTOCOL_SPEC_v1.0.md](./ENGINE3D_CLUSTER_AND_WIRE_PROTOCOL_SPEC_v1.0.md)
- [CIEMS_ENGINE3D_RT4D_PROMOTION_CHECKLIST.md](./CIEMS_ENGINE3D_RT4D_PROMOTION_CHECKLIST.md)
