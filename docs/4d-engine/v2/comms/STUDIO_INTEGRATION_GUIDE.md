# Studio Integration Guide — FourDRenderer v2.0  
## Declared / Planned Steps (Evidence-Bound)

| Field | Value |
| --- | --- |
| Status | **Declared / planned** integration outline — not a certified onboarding runbook |
| Audience | Studio graphics / engine teams evaluating partnership |
| Redline | [`CLAIMS_REDLINE.md`](./CLAIMS_REDLINE.md) |

> Every step below is labeled. **Declared** = contract exists. **Planned / roadmap** = not present capability. **Skeleton** = early path only.

## Prerequisites (honest)

| Need | Status |
| --- | --- |
| v2 RFC index | **Declared** — [`../README.md`](../README.md) |
| PLP (projection + lineage) | **Declared** (+ schemas; thin stub) — [`../v1/plp/PLP_V1.md`](../../v1/plp/PLP_V1.md) |
| FourDAdapter Unreal | **Skeleton** · v1.1 **declared** · v1.2 **planned** — [`unreal/FourDAdapter/README.md`](../../../../unreal/FourDAdapter/README.md), [`../v1/adapters/UNREAL_ADAPTER_V1.md`](../../v1/adapters/UNREAL_ADAPTER_V1.md) |
| FourDAdapter Unity | **Skeleton** — `unity/.../FourDAdapter/` |
| Deep Unreal RHI 4D domain | **Roadmap** — not FourDAdapter v1.1 scope |
| Measured 4–6 ms preview | **Not claimed** |

## Integration steps (labeled)

### Step 1 — Align on authority (declared)

Agree that FourDRenderer owns 4D intersection / shading / projection **contracts**; the host adapter **consumes** Scene3D + lineage.

- Architecture: [`../FOURD_RENDERER_V2_ARCHITECTURE.md`](../FOURD_RENDERER_V2_ARCHITECTURE.md)  
- Studio pitch companion: [`STUDIO_PITCH.md`](./STUDIO_PITCH.md)

### Step 2 — Projection & lineage via PLP (declared / partial enforcement)

Plan ingest against PLP `projectWorld` → Scene3D + LineageBundle.

- PLP: [`../v1/plp/PLP_V1.md`](../../v1/plp/PLP_V1.md)  
- v2 projection stage **aligns with** PLP (host adapters still hybrid-first).

### Step 3 — Stand up FourDAdapter consumer (skeleton)

Wire Unreal / Unity adapter to import projected buffers + lineage. Do **not** treat this as 4D compute inside the host.

- Unreal skeleton: `unreal/FourDAdapter/`  
- Adapter index: [`../v1/adapters/UNREAL_ADAPTER_V1.md`](../../v1/adapters/UNREAL_ADAPTER_V1.md)

### Step 4 — Observation Mode policy (declared)

Map studio “how W is seen” requirements to Observation Mode ids / blend policy — Engine v1 modes extended by v2 routing contracts.

### Step 5 — Host blend interface (declared intent · Phase 3 roadmap)

Feed `ShadingOutput3D` toward GBuffer / path / GI only when Phase 3 work exists. Nanite W-awareness / Lumen W-GI remain **roadmap** — not working paths.

- Roadmap: [`../roadmap/ENGINE_INTEGRATION_ROADMAP.md`](../roadmap/ENGINE_INTEGRATION_ROADMAP.md)

### Step 6 — Validation categories (declared)

Use T1–T5 as a **planned** validation map, not as green CI proof for v2 GPU.

### Step 7 — Tooling (Phase 4 roadmap)

Material nodes, Sequencer track, 4D debugger: **planned**. Some v1 skeletons only.

### Step 8 — Performance envelopes (targets)

Treat ≤ 4–6 ms as **design target** for future preview budgets on a named future GPU — **not measured**.

## Recommended reading order

1. [`../README.md`](../README.md)  
2. [`../FOURD_RENDERER_V2_ARCHITECTURE.md`](../FOURD_RENDERER_V2_ARCHITECTURE.md)  
3. [`../v1/plp/PLP_V1.md`](../../v1/plp/PLP_V1.md)  
4. [`../v1/adapters/UNREAL_ADAPTER_V1.md`](../../v1/adapters/UNREAL_ADAPTER_V1.md)  
5. [`../shader-abi/SHADER_ABI.md`](../shader-abi/SHADER_ABI.md)  
6. [`ENGINE_SDK_DOCUMENTATION.md`](./ENGINE_SDK_DOCUMENTATION.md)  
7. Scorecard: [`docs/scorecards/fourd-renderer-v2.md`](../../../scorecards/fourd-renderer-v2.md)

## Explicit non-goals for this guide

- Certified production Unreal RHI onboarding  
- Guaranteed frame-time SLAs  
- Self-serve commercial signup  

Contact for partnership discussion: **TBD**
