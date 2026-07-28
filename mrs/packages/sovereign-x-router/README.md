# @mrs/sovereign-x-router

Sovereign X multi-vendor capability registry + **GPU assist** dispatch stubs.

**Status:** **partial** — registry load, vendor dispatch, and GpuDispatchContract
rules are covered by unit tests; vendor runtimes are **not** invoked; Digital
Printer beauty SoT is never allowed.

**Version:** 0.2.0

## What this is

- Machine-readable NVIDIA/AMD capability IDs → skills → `upstream` /
  `forbidden_for_print`
- Canonical classes (user SoT §A) + alias `gpu.gen.nvidia.nim_flux` ↔
  `ai.gen.nvidia.flux`
- `GpuAssistModule`: `routeLookDev`, `routeSceneSpecAssist`, `routeEmbeddings`
- `GpuDispatchContract`: validate + bind (determinism→CPU; auto→NVIDIA→AMD→CPU)
- `SovereignLookDevEngine` planner skeleton (Steps 1–4; final print CPU RT4D)

## What this is not

- Not a CUDA/HIP/ROCm print backend
- Not Digital Printer SoT (see
  [`CONTRACT_DIGITAL_PRINT.md`](../../adapters/storyforge-boundary/CONTRACT_DIGITAL_PRINT.md))
- Not a claim that AMD backends exist in-repo (AMD is **host-capability driven**)

## Usage

```js
import {
  dispatchVendorCapability,
  routeLookDev,
  validateGpuDispatchContract,
  planLookDevPipeline,
} from "@mrs/sovereign-x-router";

dispatchVendorCapability("gpu.gen.nvidia.nim_flux", { intentLane: "lookdev" });
// ok — alias of ai.gen.nvidia.flux

routeLookDev({
  intentId: "i1",
  modality: "image",
  determinismRequired: false,
  vendorPreference: "auto",
});
// assistProvenance only; never printProvenance

routeLookDev({
  intentId: "i2",
  modality: "image",
  determinismRequired: false,
  vendorPreference: "auto",
  route: "/printer/beauty",
});
// rejected — PRINTER_ROUTE_BANNED
```

## Tests

```bash
npm test --prefix mrs/packages/sovereign-x-router
```

## Trails

- `docs/governance/cecp/trails/sovereign-x-gpu-assist-2026-07/` (this blueprint)
- `docs/governance/cecp/trails/sovereign-x-vendor-router-2026-07/` (prior registration)

## Related

- `docs/governance/GPU_ASSISTED_COMPUTE_INTEGRATION_CHARTER.md`
- `docs/superpowers/specs/2026-07-28-sovereign-lookdev-engine-plan.md`
- `docs/superpowers/specs/2026-07-28-vendor-skills-install-note.md`
