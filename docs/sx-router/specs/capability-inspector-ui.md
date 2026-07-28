# Sovereign X Router — Capability Inspector UI (Mockup)

**Artifact:** `docs/sx-router/specs/capability-inspector-ui.md`  
**Status:** **skeleton** / **declared** mockup — ready for a future React or Svelte implementation  
**Drive-G-1:** Parity numbers shown below are **placeholder / skeleton** values from the harness stub, **not** measured live CPU↔GPU parity.

```text
┌───────────────────────────────────────────────┐
│         SOVEREIGN X ROUTER — CAPABILITY MAP   │
├───────────────────────────────────────────────┤
│ Authoritative                                  │
│   • cpu.rt4d.print                              │
│       Deterministic | Evidence-bound            │
│                                                   │
│ GPU Assist                                        │
│   • gpu.gen.nvidia.nim_flux                      │
│   • gpu.inference.nvidia.tao                     │
│   • gpu.compute.nvidia.cuda                      │
│   • gpu.inference.amd.rocm                       │
│   • gpu.compute.amd.hip                          │
│   • gpu.integrator.deterministic (prototype)     │
│                                                   │
│ Modes                                             │
│   • print (CPU only)                              │
│   • assist (GPU)                                  │
│   • lookdev (GPU)                                 │
│   • scenespec (GPU)                               │
│   • parity (CPU+GPU)                              │
│                                                   │
│ Capability Details                                │
│   [Select capability] → show:                     │
│     - vendor                                      │
│     - authority                                   │
│     - skill path                                  │
│     - determinism status                          │
│     - parity metrics                              │
│                                                   │
│ Parity Status (PLACEHOLDER / SKELETON — not live) │
│   NVIDIA:   SSIM n/a | MSE n/a  (skipped)         │
│   AMD:      SSIM n/a | MSE n/a  (skipped)         │
│   WebGPU:   pending                               │
│   Stub harness may return SSIM 1.00 / MSE 0.00    │
│   labeled status:"skeleton" — NEVER treat as PASS │
└───────────────────────────────────────────────┘
```

## Implementation note

UI implementation is **out of scope** for Phase I docs drop-in. When built, bind
to registry + parity harness status fields; never hard-code “SSIM 1.00” as
measured evidence.
