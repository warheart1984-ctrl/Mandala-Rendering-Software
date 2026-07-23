# Engine Diagrams — FourDRenderer v2.0 (ASCII)

> Technical diagrams for RFCs / blogs / decks.  
> Status overlays use Drive-G vocabulary. These diagrams do **not** prove GPU enforcement.

## 1. Authority & host boundary

```
┌──────────────────────────────────────────────┐
│  WorldDocument / Observation (Engine v1)     │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  FourDRenderer v2.0 contracts (DECLARED)     │
│  BVH4D · SO(4) BSDF · Path · Project · OM    │
└───────┬──────────────────────────┬───────────┘
        │                          │
        │ Project4DTo3D / PLP      │ roadmap: RHI 4D domain
        ▼                          ▼
┌─────────────────────┐   ┌────────────────────┐
│ Scene3D + Lineage   │   │ Unreal RHI kernels │
└─────────┬───────────┘   │ (ROADMAP)          │
          │               └────────────────────┘
          ▼
┌─────────────────────┐
│ FourDAdapter        │
│ hybrid-first        │
│ consumer (SKELETON) │
└─────────────────────┘
```

## 2. Declared render-graph spine

```
RayGen4D
   │
   ▼
Trace4D  ──► Hit4D buffer
   │
   ▼
Shade4D / PathTrace4D  ──► throughput / radiance (4D domain)
   │
   ▼
Project4DTo3D  ──► ShadingOutput3D
   │
   ▼
ObservationRoute  ──► host blend policy
   │
   ▼
Host 3D path (GBuffer / PT / GI)   [integration ROADMAP]
```

## 3. Performance framing (targets only)

```
Per-frame wall (FUTURE preview config — NOT MEASURED)
├── Host 3D passes ........ (engine-owned)
└── 4D domain budget ...... design target ≤ 4–6 ms
      ├── Trace4D
      ├── Shade / Path
      └── Project (relatively cheap, declared)
```

## 4. Maturity overlay (Drive-G-2 reminder)

```
Constitutional ........ DECLARED (early)
Governance ............ DECLARED
Reference impl ........ PARTIAL (MRS) / SKELETON (v2 GPU)
Platform engineering .. SKELETON / ROADMAP
Commercial ............ ROADMAP
```
