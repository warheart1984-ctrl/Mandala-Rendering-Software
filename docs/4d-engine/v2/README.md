# FourDRenderer v2.0 — documentation index

> **Drive-G-1 / Drive-G-2:** This tree is an architecture and RFC suite.  
> Status tags: **draft** · **declared** · **partial** · **skeleton** · **roadmap**.  
> It does **not** claim production Unreal RHI mods, Nanite/Lumen 4D paths, or SO(4) BSDF enforcement on GPU unless an Evidence row says otherwise.

**Product name:** FourDRenderer v2.0  
**Scope:** higher-dimensional render contracts over \(\mathbb{R}^{4}\), projection into host-consumable 3D, Observation Modes, and a declared blend interface toward Unreal’s 3D domain.  
**Upstream authority:** FourDRenderer / PLP / WorldDocument — hosts (including `FourDAdapter`) remain **consumers** of Scene3D + lineage (hybrid-first).

## Document map

| Document | Role | Status |
| --- | --- | --- |
| [FOURD_RENDERER_V2_ARCHITECTURE.md](./FOURD_RENDERER_V2_ARCHITECTURE.md) | Unified core architecture | **draft / declared** |
| [FOURD_RENDERER_V2_WHITEPAPER.md](./FOURD_RENDERER_V2_WHITEPAPER.md) | Technical overview (softened claims) | **draft / declared** |
| [bvh-projection/BVH_AND_PROJECTION_RFC.md](./bvh-projection/BVH_AND_PROJECTION_RFC.md) | 4D BVH + projection stage | **declared** (docs) |
| [shading-transport/SHADING_AND_TRANSPORT_RFC.md](./shading-transport/SHADING_AND_TRANSPORT_RFC.md) | SO(4) BSDF / path transport / blend | **declared** (docs) |
| [observation/OBSERVATION_MODE_RFC.md](./observation/OBSERVATION_MODE_RFC.md) | View / routing / blend contracts | **declared** (docs) |
| [render-graph/RENDER_GRAPH_SPEC.md](./render-graph/RENDER_GRAPH_SPEC.md) | Pass graph & barriers | **declared** |
| [shader-abi/SHADER_ABI.md](./shader-abi/SHADER_ABI.md) | GPU buffer / intrinsic ABI | **declared** |
| [materials/MATERIAL_SYSTEM_RFC.md](./materials/MATERIAL_SYSTEM_RFC.md) | Material flags & hybrid shading | **declared** |
| [roadmap/ENGINE_INTEGRATION_ROADMAP.md](./roadmap/ENGINE_INTEGRATION_ROADMAP.md) | Phases 1–6 | Phase 1 **docs complete**; GPU/Unreal **roadmap** |
| [samples/SAMPLE_SCENE_SPEC.md](./samples/SAMPLE_SCENE_SPEC.md) | Scenes S1–S4 | **declared** |
| [validation/TEST_SUITE_AND_VALIDATION.md](./validation/TEST_SUITE_AND_VALIDATION.md) | Test categories T1–T5 | **declared** |
| [performance/PERFORMANCE_MODEL_AND_GPU_BUDGET.md](./performance/PERFORMANCE_MODEL_AND_GPU_BUDGET.md) | Cost model & design targets | **declared budget** (not measured) |
| Scorecard | [`docs/scorecards/fourd-renderer-v2.md`](../../scorecards/fourd-renderer-v2.md) | Drive-G-2 five dimensions |
| [comms/](./comms/) | Positioning drafts (not capability evidence) | **Strategic / aspirational messaging drafts** — Drive-G-1 redlined; do **not** copy into README capability tables |

## Maturity (Drive-G-2 — five dimensions)

Do not collapse to a single “ready / not ready” verdict. Full scorecard: [`docs/scorecards/fourd-renderer-v2.md`](../../scorecards/fourd-renderer-v2.md).

| Dimension | Rating | Audience | Notes |
| --- | --- | --- | --- |
| Constitutional model | **Declared** (early) | Architects | v2 RFCs + v1 constitution / PLP |
| Governance methodology | **Declared** | Operators | Observation Mode / lineage contracts; not machine-enforced as v2 GPU gates |
| Reference implementation | **Partial** (MRS) / **skeleton** (v2 GPU) | Developers | RT4D / BVH4D / Canvas exist; v2 GPU kernels **not** claimed complete |
| Platform engineering | **Skeleton / roadmap** | Operators | FourDAdapter hybrid-first; RHI / Nanite / Lumen deep integration **roadmap** |
| Commercial operations | **Roadmap** | Business | No self-serve claimed |

Operator readiness (browser / MRS paths): **partial**.  
Operator readiness (v2 Unreal RHI 4D domain): **not claimed**.  
User / commercial readiness: **not claimed**.

## Evidence map — what MRS already has vs what v2.0 extends

| Capability | Existing evidence (MRS / 4DRS / Engine v1) | FourDRenderer v2.0 |
| --- | --- | --- |
| \(\mathbb{R}^{4}\) math / SO(4) rotation checks | **partial** — `mrs/packages/renderer-core` conformance, RT4D math | Extends contracts; does not re-prove GPU SO(4) BSDF |
| Parametric surfaces + Canvas / WebGPU draw | **partial / present** — `@mrs/renderer-core`, web demo | Orthogonal path; v2 targets structured BVH + path domain |
| RT4D path engine + Hyper-Caustic Lens | **partial** — `src/render/rt4d/`, HCL factory | v2 **extends** with Observation Mode routing + host blend contracts |
| BVH4D CPU + GPU skeleton | **partial** CPU · **skeleton** GPU — `BVH4D`, `accel/gpu/`, `docs/4drs/substrate/BVH4D_GPU.md`, `native/cuda/rt4d/` | v2 RFC freezes hyper-box / SAH-4D / slab / projection-policy IDs |
| Inspector (MRS-IC) | **skeleton** — inspector package + Unity window | Remains debug surface; not v2 SoT |
| PLP `projectWorld` | **skeleton** — `@mrs/renderer-core` `/plp` · [`docs/4d-engine/v1/plp/PLP_V1.md`](../v1/plp/PLP_V1.md) | v2 projection stage **aligns with** PLP; host adapters still hybrid-first |
| World Format / ObservationMode schemas | **declared** — [`docs/4d-engine/v1/`](../v1/) | v2 Observation Mode RFC **extends** mode routing / blend |
| Unreal / Unity FourDAdapter | **skeleton** — Scene3D + lineage consumers | **Not** v2 RHI; deep Unreal RHI = **roadmap** |
| Unreal RHI 4D buffers / compute | — | **declared / roadmap** |
| Nanite W-aware clusters / Lumen W-GI | — | **roadmap** |
| Phase 1 GPU kernels complete | — | **Not claimed** — Phase 1 = **documentation** complete |

## Relationship to Engine v1 and adapters

```
WorldDocument / Observation (Engine v1)
        │
        ▼
   PLP projectWorld  ──► Scene3D + LineageBundle
        │                         │
        │                         ▼
        │              FourDAdapter (Unity / Unreal)  ← hybrid-first consumer
        │
        ▼
FourDRenderer v2.0 (this suite)  ← upstream authority for 4D BVH / SO(4) / path / project
        │
        └── roadmap: Unreal RHI 4D domain → GBuffer / PT / Lumen blend
```

- **FourDRenderer** is the declared authority for 4D intersection, shading, and projection contracts.  
- **FourDAdapter** remains a host adapter: imports Scene3D + lineage; does **not** compute 4D.  
- v2 Unreal RHI deep integration is **out of scope** for FourDAdapter v1.1 — see [roadmap](./roadmap/ENGINE_INTEGRATION_ROADMAP.md) and [`../v1/adapters/UNREAL_ADAPTER_V1.md`](../v1/adapters/UNREAL_ADAPTER_V1.md).

## Cross-links

| Topic | Path |
| --- | --- |
| Engine v1 index | [`docs/4d-engine/v1/README.md`](../v1/README.md) |
| Unreal adapter index | [`docs/4d-engine/v1/adapters/UNREAL_ADAPTER_V1.md`](../v1/adapters/UNREAL_ADAPTER_V1.md) |
| PLP | [`docs/4d-engine/v1/plp/PLP_V1.md`](../v1/plp/PLP_V1.md) |
| BVH4D GPU substrate | [`docs/4drs/substrate/BVH4D_GPU.md`](../../4drs/substrate/BVH4D_GPU.md) |
| RT4D architecture | [`docs/4drs/ARCHITECTURE.md`](../../4drs/ARCHITECTURE.md) |
| Renderer core | [`mrs/packages/renderer-core/README.md`](../../../mrs/packages/renderer-core/README.md) |
| Charter evidence | [`constitution/CHARTER.md`](../../../constitution/CHARTER.md) |
| Root capability snapshot | [`README.md`](../../../README.md) |

## Non-claims (explicit)

- Not “the world’s first” 4D renderer or architecture.  
- Not production Unreal RHI modifications.  
- Not Nanite / Lumen 4D working paths.  
- Not SO(4) BSDF **enforcement** on GPU unless tests/code prove it.  
- Not Phase 1 GPU complete — Phase 1 means **RFC / architecture docs declared**.
