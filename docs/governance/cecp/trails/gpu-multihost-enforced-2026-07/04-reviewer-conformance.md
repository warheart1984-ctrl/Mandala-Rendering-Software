# 04 — Reviewer conformance

**Trail:** `gpu-multihost-enforced-2026-07`  
**Role:** Reviewer (Conformance · Sentinel)  
**Date:** 2026-07-28

## Claim ↔ evidence

| Claim | Tag | Evidence |
|-------|-----|----------|
| GPU never print SoT | **enforced** | `gpu-constitution.test.js`, `gpuPrintSafeguard` |
| Mock bloomCombine / shadow / env BGL | **enforced** | `gpu-core.test.js` |
| Live WebGPU | **partial** | `gpu-live-webgpu.test.js` skip without adapter |
| MultiHost JS routing | **enforced** | `multihost-constitution.test.js` |
| Unity/Unreal product | **skeleton** | Thin stubs only |
| Conformance 16/16 | **enforced** (browser profile) | Unchanged probe set |

## Drive-G-1

No replacement of real GPU modules with toy stubs. Vendor nvidia/amd skills assist-only.
