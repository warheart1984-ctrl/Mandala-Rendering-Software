# 03 — Implementor notes

**Trail:** `printer-gpu-quality-speed-2026-07`  
**Stage:** Implementor  
**Status:** **partial** — Tasks 1–6 complete after design APPROVED 2026-07-28

## What was done

| Task | Deliverable | Status |
|------|-------------|--------|
| 1 | `qualityPerSample.js` + ladder test + CONTRACT ops note | **enforced** |
| 2 | `PRINTER_SERVICE_API.md` quality-then-speed | docs |
| 3 | `backend=cpu` default; ungated GPU → PrintError | **enforced** |
| 4 | `printParity.js` + cpu-gpu-comparison print tests | **partial** (skip≠pass) |
| 5 | `parity_gate.py` + MRS_PRINT_WEBGPU + evidence.backend | **partial** |
| 6 | Genblaze README NIM assist≠SoT | docs |

## Still deferred / gaps

| Item | Tag |
|------|-----|
| Live WebGPU print execute in Node | **partial** |
| CUDA / HIP backends | **absent** |
| NIM → beauty.png SoT | **rejected** (by design) |

## 2026-07-28 vendor skills pass

- Installed NVIDIA + AMD skills (see vendor-skills-install-note).
- Fixed legacy `RT4DGPURenderer` FrameParams: removed `Date.now()` seed; aligned
  width/height/maxDepth/seed layout with `shaders.js` (**partial** GPU honesty).
- Genblaze NIM empty-504 playbook: top-down health order.
- No FLUX→beauty SoT; no CUDA/HIP stubs claiming support.

## Regressions preserved

- v2.0 profiles, denoise, soft penumbra, sovereignty — tests green (21 passed)
