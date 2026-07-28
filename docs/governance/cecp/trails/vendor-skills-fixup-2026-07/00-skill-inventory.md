# 00 — Vendor skill inventory (this repo)

**Trail:** `vendor-skills-fixup-2026-07`  
**Date:** 2026-07-28  
**Drive-G-1:** skills ≠ implementation. Status tags below are for *applicability*, not product enforcement.

| Skill | Applicable to MRS? | What it can fix here | Skipped / why |
|-------|--------------------|----------------------|---------------|
| `rag-blueprint` | **weak** | Ops discipline for health/deps ordering only | Not an NVIDIA RAG Blueprint checkout; no RAG compose/Helm deploy in this repo |
| `tilegym-cutile-python` | **N/A** | — | No CUDA kernel candidate for Digital Printer beauty SoT; documenting N/A only |
| `dynamo-troubleshoot` | **pattern** | Ordered top-down NIM debug layers on `/health` (`nim_ops_checklist`) | No DynamoGraphDeployment / K8s Dynamo cluster |
| `tao-setup-nvidia-gpu-host` | **yes (check-only)** | `scripts/check-nvidia-gpu-host.mjs` — nvidia-smi / NVENC / docker nvidia runtime probe | `--install` not run (Windows host; requires explicit user auth on Linux) |
| `tao-run-inference-service` | **pattern** | Warmup/readiness + timeout honesty already in Genblaze; reinforced via health help | No TAO `{arch}-inference-microservice` containers |
| `nvidia-skill-finder` | **router** | Catalog routing — confirmed no dedicated `nim`/`nvcf` skill slug | — |
| `rocm-setup` | **scaffold** | `scripts/detect-gpu-backend.py` multi-backend detect | No ROCm install; HIP print **absent** |
| `hip-rocm` | **reference** | Honesty notes only | No HIPIFY / hipcc printer kernels |
| `rocm-doctor` (amd-skills) | **scaffold** | Same detect script + absent HIP print tags | No broken AMD print stack to repair (path absent) |
| `local-ai-use` (amd-skills) | **partial** | Lemonade Genblaze backend already present; env.example documents vars | Not claiming Lemonade = RT4D print |
| `magpie-kernel-evaluator` | **skipped** | — | No MRS HIP/CUDA kernels to evaluate |

## Repo surfaces touched by inventory

| Surface | Tag | Evidence |
|---------|-----|----------|
| Genblaze NIM empty-504 / warmup / timeouts | **enforced** (unit tests) | `nvidia_errors.py`, `nvidia_http.py`, `tests/test_api.py` |
| `/health` NIM ops checklist + unavailable help | **enforced** (unit tests) | this trail |
| NVENCEncoder | **partial** | ffmpeg probe; video assist ≠ print SoT |
| WebGPU print parity | **partial** | `printParity.js` — skip ≠ pass |
| CUDA print path | **absent** | check script honesty |
| HIP/ROCm print path | **absent** | detect script honesty |
| cuTile printer kernels | **na** | no candidate |
