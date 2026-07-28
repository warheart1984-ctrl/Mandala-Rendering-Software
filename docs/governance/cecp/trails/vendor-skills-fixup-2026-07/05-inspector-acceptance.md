# 05 — Inspector acceptance

**Trail:** `vendor-skills-fixup-2026-07`  
**Role:** Inspector (Testwright)  
**InspectorVerdict:** **PASS_WITH_GAPS**  
**Date:** 2026-07-28

## Acceptance criteria (Architect) ↔ result

| Criterion | Result |
|-----------|--------|
| `/health` exposes ordered `nim_ops_checklist` | **PASS** |
| warmup unavailable ⇒ non-null `nvidia_help` with key present | **PASS** |
| Unit tests for help + checklist | **PASS** (5 targeted) |
| GPU host / detect scripts check-only + no print SoT claim | **PASS** |
| `probeVendorGpuHonesty` cuda/hip absent, cutile na | **PASS** |
| Trail 01–06 present | **PASS** (this stage) |
| No protected path edits | **PASS** |

## Fresh commands

```text
cd mrs/apps/genblaze-media
.\.venv\Scripts\python.exe -m pytest \
  tests/test_api.py::test_health_includes_empty_504_policy \
  tests/test_api.py::test_resolve_nvidia_help_and_checklist \
  tests/test_api.py::test_health_surfaces_nim_unavailable_help \
  tests/test_api.py::test_is_empty_nvidia_gateway_504_variants \
  tests/test_api.py::test_warmup_probe_classifies_empty_504_unavailable -q
→ 5 passed

node --test mrs/packages/renderer-core/scripts/test/cpu-gpu-comparison.test.js
→ 23 pass / 0 fail (includes vendor honesty test)

node scripts/check-nvidia-gpu-host.mjs --json
→ nvidiaSmi ok:false (permissions/absent); nvenc partial (ffmpeg); honesty intact

python scripts/detect-gpu-backend.py --json
→ primary_backend: cpu; hip_print_path/cuda_print_path: absent
```

## Residual gaps

- Live WebGPU Node print execute  
- Elevated nvidia-smi on this host when permissions block  
- No live Render NIM E2E in this trail  

## Handoff to ESFR

PASS_WITH_GAPS — promote with gaps only.
