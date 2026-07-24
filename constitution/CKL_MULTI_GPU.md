# CKL — Multi-GPU (declared)

> **Status:** **declared** (Drive-G-1). Not machine-enforced until CSSV writers + host probes exist.  
> Contract: [`docs/4d-engine/rt4d/RT4D_V4_MULTI_GPU_CONTRACT.md`](../docs/4d-engine/rt4d/RT4D_V4_MULTI_GPU_CONTRACT.md)

## Policy intent

Multi-GPU rendering for RT4D **may** be enabled only when all of the following hold:

1. At least two devices are eligible (`supportsRayTracing` or a documented compute substitute on the active RHI).  
2. Per-frame CSSV multi-GPU evidence is written (schema under `cssv/multi-gpu/`).  
3. Strategy is explicitly one of: `single`, `tiles`, `split-frame`.

## Planned violation response

Fall back to `single` device and append a CSSV fallback event. Do not silently continue as multi-GPU without evidence.

## Non-claim

This markdown is **not** a runtime CKL gate.
