# FourDRenderer v2.0 — Performance Model & GPU Budget

| Field | Value |
| --- | --- |
| Status | **Declared budget** — design targets, **not measured SLAs** |
| Related | [`docs/4drs/substrate/performance/inspector-gpu-budget.md`](../../../4drs/substrate/performance/inspector-gpu-budget.md) |

## 1. Purpose

Define a cost model and GPU budget for planning: expected cost per pass, target frame times, scaling, and host-integration constraints.

## 2. Cost model

| Pass | Scaling (declared) |
| --- | --- |
| Trace4D (BVH) | \(\propto\) rays \(\times \log(\mathrm{nodeCount})\) |
| Shade / PathTrace | \(\propto\) rays \(\times\) bounces \(\times\) BSDF complexity |
| Projection | \(\propto\) rays (linear; relatively cheap) |

## 3. Target budgets (4D domain, per frame)

| Mode | Design target |
| --- | --- |
| Real-time preview | 4D passes ≤ **4–6 ms** on a future target GPU |
| Offline / film | Unconstrained; quality-first |

These are **planning numbers**, not measured SLAs. Do not cite them as achieved performance.

## 4. Integration constraints

- 4D compute must not starve host 3D passes.  
- Prefer async compute for the 4D domain when available.  
- Clear scheduling boundaries between 4D and 3D work ([render graph](../render-graph/RENDER_GRAPH_SPEC.md)).

## 5. Scaling notes

Stress scene S4 is the intended characterization vehicle once Phase 2+ exists. Until then, treat Canvas / RT4D / HCL timings as **separate** evidence for existing paths — not v2 GPU budget fulfillment.

## 6. Evidence

| Claim | Status |
| --- | --- |
| This model | **declared budget** |
| Measured 4–6 ms on device | **not claimed** |
| Existing Canvas/WebGPU frame times | Orthogonal **partial** evidence |
