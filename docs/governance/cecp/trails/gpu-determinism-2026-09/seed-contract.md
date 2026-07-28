# Seed Contract — mulberry32 / stratified (DECLARED)

**Trail:** `gpu-determinism-2026-09`  
**Status:** **declared** (not enforced as print SoT; not a live GPU receipt)  
**Namespace:** `sx.contract.gpu.seed.mulberry32_stratified`  
**Prototype implementation:**  
`sovereign-x/router/modules/gpu/integrator/deterministicGpuIntegrator.js`

## PRNG — mulberry32

- 32-bit seed (`seed >>> 0`)
- Output: uniform float in `[0, 1)`
- Property: identical seed → identical sequence (unit-tested in parity suite)

## Sampling — stratified

For sample index `i` of `n`:

```text
stratifiedIndex(i, n, rng) = min(n - 1, floor(((i + u) / n) * n))
where u ~ mulberry32(seed)
```

Status: **declared** contract sketch for assist harness — not claimed as
PathTracer4D sample SoT.

## Authority

| Use | Allowed? |
|-----|----------|
| Assist harness / parity scaffolding | Yes (assistOnly) |
| Digital Printer / print Provenance | **No** |
| Authoritative render seed SoT | **No** (CPU RT4D owns print) |

## Future enforcement path

See Steps 1–5. Enforcement requires receipts + Inspector PASS — not this file alone.
