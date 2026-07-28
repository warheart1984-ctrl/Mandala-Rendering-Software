# GPU Determinism Readiness Report

**Artifact:** `docs/governance/cecp/trails/vendor-gpu-integration-2026-07/readiness-report.md`  
**Trail:** `vendor-gpu-integration-2026-07`  
**Assessment author:** user / operator (Jon Halstead)  
**Status:** Operator readiness assessment — **declared**; metrics implementation **pending**

> Drive-G-1: Keep the user’s “42%” and “Ready for parity trials” wording as an
> assessment, but do **not** treat stub SSIM 1.00 / MSE 0.00 as real measured
> parity. Thresholds are defined; live implementation is pending.

## 1. Seed Contract Readiness

| Item | Status |
|------|--------|
| mulberry32 PRNG | ✔ (unit-tested harness) |
| deterministic jitter | ✔ (stratified index — declared) |
| seed propagation | ✔ (prototype assist path) |
| GPU integrator prototype | ✔ (`deterministicGpuIntegrator.js`) |

**Status:** Ready for parity trials.  
*(Trials = non-print assist harness exercises; not GPU print SoT.)*

## 2. Replay Receipt Readiness

Receipt fields (declared / prototype):

```text
seed: u32
frameHash: sha256
replayHash: sha256
deviceInfo: vendor/model/driver
```

**Status:** Prototype complete (**declared** — not live multi-host receipts).

## 3. Parity Metric Readiness

Thresholds (**declared** eligibility):

| Metric | Threshold |
|--------|-----------|
| SSIM | ≥ 0.98 |
| MSE | ≤ 0.002 |
| ΔLuma | ≤ 0.5% |
| ΔChroma | ≤ 0.5% |

**Status:** Metrics defined; implementation **pending**.  
Skeleton harness may return placeholder SSIM 1.00 / MSE 0.00 with
`status: "skeleton"` — **never** treat as PASS evidence.

## 4. Multi-host Reproducibility Readiness

Targets: NVIDIA · AMD · WebGPU/Vulkan  

**Status:** Not yet tested.

## 5. Constitutional Readiness

| Artifact | Status |
|----------|--------|
| GPU Integration Charter | ✔ |
| Dispatch Contract | ✔ |
| Capability Map | ✔ |
| Crew Manifest | ✔ |
| Promotion Packet | ✔ |
| Integrator Promotion Charter | ✔ (**Draft** / future — Article IV not enacted) |

**Status:** Constitutionally ready for parity promotion **trials** (assist
layer). Not ready for GPU print SoT.

## Overall Readiness

**GPU Determinism Readiness: 42%** (operator assessment)

Assist layer complete, parity layer partially implemented, deterministic
integrator prototyped. Metrics implementation **pending**; no claim of
measured SSIM 1.00 parity.
