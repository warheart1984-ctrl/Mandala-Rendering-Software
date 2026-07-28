# 04 — Reviewer conformance

**Trail:** `vendor-skills-fixup-2026-07`  
**Role:** Reviewer (Boundary-Guardian + Runtime-Sage)  
**Verdict:** **PASS_WITH_GAPS**

## Claim ↔ evidence

| Claim | Tag | Evidence |
|-------|-----|----------|
| NIM empty-504 classification + hints | **enforced** | `test_is_empty_nvidia_gateway_504_variants` |
| Warmup classifies gateway 504 as unavailable | **enforced** | `test_warmup_probe_classifies_empty_504_unavailable` |
| `/health` exposes `nim_ops_checklist` | **enforced** | `test_health_includes_empty_504_policy` |
| Help when key+warmup unavailable | **enforced** | `test_health_surfaces_nim_unavailable_help` |
| Vendor honesty map (cuda/hip absent, cutile na) | **enforced** | `cpu-gpu-comparison.test.js` |
| NVIDIA host check script | **partial** | `scripts/check-nvidia-gpu-host.mjs` (check-only) |
| GPU backend detect | **partial** | `scripts/detect-gpu-backend.py` |
| CUDA/HIP print SoT | **absent** | honesty fields + inventory |
| Live WebGPU Node print | **partial** | unchanged gap |
| RAG / Dynamo / TAO microservices | **na** | inventory |

## Constitutional / protected paths

No edits to `constitution/`, `engine/constitution/`, `AGENTS.md`, or `default.policies.json`.

## Drive-G-1

Scripts and docs use **partial** / **absent** / **na** / **assist** correctly. NIM remains assist ≠ printer beauty SoT.

## Gaps (honest)

1. Live WebGPU execute on Node  
2. Host `nvidia-smi` may need elevation on this Windows operator box  
3. No HIP print implementation (correct)

## Handoff to Inspector

Re-run targeted tests; confirm scripts produce honest reports.
