# FourDRenderer v2.0 — Test Suite & Validation Protocol

| Field | Value |
| --- | --- |
| Status | **Declared** (protocol). v2 GPU CI gates **roadmap** |
| Drive-G-1 | Existing MRS tests remain authoritative for current code |

## 1. Purpose

Ensure correctness of 4D BVH, shading, and transport; determinism; visual/physical plausibility; stable host integration — as those layers are implemented.

## 2. Categories

| Id | Focus |
| --- | --- |
| T1 | BVH correctness — ray/prim intersections; grazing; W-only separation; overlapping bounds |
| T2 | BSDF & shading — Lambert4D / GGX4D / hybrid; energy checks over \(S^{3}\) |
| T3 | Path tracing — analytic 4D Cornell-like; convergence vs reference |
| T4 | Projection & Observation Modes — mapping consistency; deterministic mode/world/time |
| T5 | Unreal / host integration — GBuffer population; PT blend; Lumen sampling (**roadmap**) |

## 3. Protocol (**declared**)

1. Unit tests T1–T3 on headless builds.  
2. Render S1–S4 with fixed seeds.  
3. Compare against golden images / metrics when assets exist.  
4. Host integration T5 with scripted cameras.  
5. Record performance vs [GPU budget](../performance/PERFORMANCE_MODEL_AND_GPU_BUDGET.md) (design targets until measured).

## 4. Existing evidence (do not regress)

| Suite | Path / command | Role |
| --- | --- | --- |
| Renderer-core conformance (incl. SO(4)) | `mrs/packages/renderer-core/scripts/test/conformance.test.ts` | **partial** math / camera |
| Inspector | `npm run test:inspector4d` | **skeleton** |
| BVH packed traverse | `scripts/test-bvh4d-gpu.mjs` (when present) | **skeleton** |
| HCL baseline | `npm run render:hcl-baseline` | **partial** |
| WorldDocument validate | `npm run validate:world-document` | **partial** schema |

v2 suite **extends** these; it does not claim they already cover T1–T5 GPU ABI.

## 5. Evidence

| Claim | Status |
| --- | --- |
| This protocol | **declared** |
| Full T1–T5 CI for v2 GPU | **roadmap** |
| Current MRS tests | **partial** / **skeleton** as above |
