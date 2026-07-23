# FourDRenderer v2.0 — Observation Mode RFC  
## Module: View Contracts, 4D/3D Transition, Path Routing

| Field | Value |
| --- | --- |
| Status | **Declared** |
| Aligns with | Engine v1 `ObservationMode` / PLP · schemas under `docs/4d-engine/v1/schemas/` |
| Drive-G-1 | Extends v1 modes; does not claim Sequencer/LiveLink enforcement of v2 routing |

## 1. Purpose

Observation Modes are first-class contracts that decide:

1. How a 4D world is seen (projection and filtering).  
2. When paths stay in 4D vs project to 3D.  
3. How multiple views of the same world coexist and are selected.

They sit above BVH / shading / projection, and below UI / Sequencer / editor.

## 2. Concept

```cpp
struct ObservationModeId { uint64 Value; };
```

Each mode defines:

- Projection policy (4D→3D mapping)  
- Path routing policy (4D vs 3D bounces)  
- Visibility filters  
- Blend policy with host lighting  

Modes are immutable contracts at runtime; changing mode means switching contracts.

## 3. Descriptor

```cpp
struct ObservationModeDesc {
    ObservationModeId Id;
    uint32 ProjectionPolicyId;
    uint32 PathRoutingPolicyId;
    uint32 VisibilityPolicyId;
    uint32 BlendPolicyId;
    float  WSliceMin;
    float  WSliceMax;
};
```

### Semantics

| Field | Role |
| --- | --- |
| ProjectionPolicyId | Selects Project4DTo3D kernel / PLP mapping |
| PathRoutingPolicyId | Per-bounce stay-4D vs handoff-3D |
| VisibilityPolicyId | Mask geometry/materials by W, tags, lineage |
| BlendPolicyId | How \(L_{4D}\) mixes with host lighting |
| WSliceMin/Max | Optional hard slice band |

### Relation to Engine v1

v1 PLP modes (`drop_w`, `perspective_w`, `scale_by_w`, `offset_y_by_w`, `slice_hyperplane`) remain valid **projection** vocabulary. v2 **extends** with explicit path-routing and blend policy IDs — [`../../v1/plp/PLP_V1.md`](../../v1/plp/PLP_V1.md).

## 4. Path routing

| Policy | Behavior |
| --- | --- |
| `FULL_4D` | All bounces in 4D; project at path end |
| `HYBRID_4D_3D` | Mix bounces by material / W / bounce index |
| `3D_ONLY` | Project geometry only; lighting entirely host |

```cpp
enum class PathRoutingDecision : uint8 {
    Stay4D,
    ProjectTo3DAndContinue3D,
    ProjectTo3DAndTerminate
};

PathRoutingDecision DecideRouting(const PathRoutingContext& ctx);
```

## 5. Projection policy

Binds to [BVH & Projection RFC](../bvh-projection/BVH_AND_PROJECTION_RFC.md):

- `PERSPECTIVE_4D_TO_3D`  
- `SLICE_W_CONSTANT`  
- `STEREOGRAPHIC_4D_TO_3D`  
- Custom observation-defined projections  

## 6. Visibility policy

```cpp
bool IsVisible(const VisibilityContext4D& ctx);
```

Examples: W in `[WSliceMin, WSliceMax]`; materials with `Use4DShading`; exclude lineage branches.

## 7. Blend policy

```cpp
float3 BlendLighting(const BlendContext& ctx);
```

`REPLACE` · `ADDITIVE` · `WEIGHTED` · `MASKED` — see Shading & Transport RFC.

## 8. External interface (**declared**)

```cpp
ObservationModeId SetObservationMode(const ObservationModeDesc& desc);
void ActivateObservationMode(ObservationModeId id);
ObservationModeDesc GetObservationMode(ObservationModeId id);
```

Unreal Sequencer / editor / Live Link may keyframe or request `observationModeId` — Sequencer track for modes is **roadmap** relative to FourDAdapter v1.1 skeleton.

Named examples (non-normative UI labels): “4D Cinematic Slice”, “4D Ghost Volume”, “4D Path Traced View”.

## 9. Coherence guarantees (**declared**)

| ID | Guarantee |
| --- | --- |
| OM-1 | Deterministic: same mode + world + time → same view |
| OM-2 | Stable IDs/semantics within a render session |
| OM-3 | Lineage preserved through visibility / projection |
| OM-4 | Multiple modes may coexist (editor vs runtime) without ambiguity |

## 10. Triad

| RFC | Role |
| --- | --- |
| BVH & Projection | How 4D is intersected and mapped |
| Shading & Transport | How light moves in 4D |
| Observation Modes | How a viewer chooses to see that world |

## 11. Evidence

| Claim | Status |
| --- | --- |
| This RFC | **declared** |
| ObservationMode v1 schema | **declared** |
| PLP `projectWorld` stub | **skeleton** |
| v2 routing / blend runtime | **roadmap** |
