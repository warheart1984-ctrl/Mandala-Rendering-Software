# Engine SDK Documentation — FourDRenderer v2.0  
## Declared API Sketch (Not an Implemented SDK)

| Field | Value |
| --- | --- |
| Status | **Declared API sketch** — developer-facing overlay on RFCs |
| Canonical detail | [`API_REFERENCE_MANUAL.md`](./API_REFERENCE_MANUAL.md) · [`../shader-abi/SHADER_ABI.md`](../shader-abi/SHADER_ABI.md) |
| Drive-G-1 | Does **not** claim packaged bindings, versioned NuGet/npm/crates, or Unreal plugin exports today |

> Prefer this file as the **SDK narrative**; prefer `API_REFERENCE_MANUAL.md` for type/pass tables; prefer Shader ABI for layouts.

## 1. What “SDK” means here

Until packages exist, “SDK documentation” means:

- Conceptual modules (accel, shade, project, observe, host)  
- Contract IDs for render-graph passes  
- Data shapes developers should expect when kernels land  
- Clear **non-claims** about host plugins

It does **not** mean a downloadable SDK that builds against Unreal/Unity today.

## 2. Module map (declared)

```
fourd.render.accel     — BVH4D / Trace4D contracts
fourd.render.shade     — ShadingFrame4D / BSDF4D Sample·Evaluate
fourd.render.path      — PathTrace4D loop (RR)
fourd.render.project   — Project4DTo3D → ShadingOutput3D
fourd.render.observe   — ObservationRoute / mode policy
fourd.host.adapter     — Scene3D + lineage consumer (FourDAdapter skeleton)
fourd.host.rhi         — Deep RHI inject (ROADMAP)
```

Names are **organizational**, not published package IDs.

## 3. Quickstart (conceptual)

1. Read architecture: [`../FOURD_RENDERER_V2_ARCHITECTURE.md`](../FOURD_RENDERER_V2_ARCHITECTURE.md)  
2. Read ABI: [`../shader-abi/SHADER_ABI.md`](../shader-abi/SHADER_ABI.md)  
3. Sketch CPU types from [`API_REFERENCE_MANUAL.md`](./API_REFERENCE_MANUAL.md)  
4. For host land-in, follow [`STUDIO_INTEGRATION_GUIDE.md`](./STUDIO_INTEGRATION_GUIDE.md) — adapter **consumes**, does not compute 4D  
5. Treat performance numbers as **targets** only

## 4. Pass entry points (status)

| Pass | Role | Status |
| --- | --- | --- |
| `RayGen4D` | Primary / secondary rays | GPU **roadmap** |
| `Trace4D` | BVH traverse → hits | **Declared**; CPU **partial**; GPU **skeleton** |
| `Shade4D` | SO(4)-aware shading contracts | **Declared**; GPU enforcement **not claimed** |
| `PathTrace4D` | Bounce loop | **Declared**; RT4D **partial** prior art |
| `Project4DTo3D` | Host-visible 3D | **Declared**; PLP-aligned |
| `ObservationRoute` | Mode routing | **Declared** |

## 5. Host SDK boundary

```
[ FourDRenderer contracts / future kernels ]
            │ ShadingOutput3D + lineage
            ▼
[ FourDAdapter ]  ← hybrid-first Scene3D consumer (SKELETON)
            │
            ├─ deferred / PT consume (declared intent)
            └─ Nanite / Lumen W paths (ROADMAP — not claimed)
```

## 6. Versioning & stability

- RFCs are source of truth; this sketch lags them intentionally.  
- No semver SDK until packages exist.  
- Breaking contract changes belong in RFCs first.

## 7. FAQ pointer

Honest Q&A: [`TECHNICAL_FAQ.md`](./TECHNICAL_FAQ.md) (especially Q6 / Q8).
