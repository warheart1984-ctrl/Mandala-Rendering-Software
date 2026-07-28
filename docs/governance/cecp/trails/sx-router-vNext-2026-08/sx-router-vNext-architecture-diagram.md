# Sovereign X Router vNext — Architecture Diagram (textual)

**Trail:** `sx-router-vNext-2026-08`  
**Status:** **declared** placement map (not a runtime gate)  
**Drive-G-1:** diagram ≠ enforced live GPU

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                         CONSTITUTION / CECP                              │
│  Charter · Policies · Evidence · PROMOTE_WITH_GAPS (Phase 1 only)       │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────────┐
│                    Sovereign X Router (sovereign-x/)                      │
│  resolveCapability / route · gpuDispatchContract · gpuSkillsRegistry     │
└───────┬─────────────────────────────┬───────────────────────┬───────────┘
        │                             │                       │
   ┌────▼─────┐                 ┌─────▼──────┐          ┌─────▼──────────┐
   │ CPU SoT  │                 │ GPU Assist │          │ Deterministic  │
   │cpu.rt4d  │                 │ NVIDIA/AMD │          │ Integrator     │
   │.print    │                 │ skills*    │          │ (prototype)    │
   │authorit. │                 │ assistOnly │          │ assistOnly     │
   └────┬─────┘                 └─────┬──────┘          └─────┬──────────┘
        │                             │                       │
        │                             │  lookDev / SceneSpec  │ seed:
        │                             │  embeddings / denoise │ mulberry32
        │                             │                       │ stratified
        ▼                             ▼                       ▼
   Digital Printer              Human curation ◄────── assistProvenance
   evidence chain               (non-authoritative)
        │
        ▼
   Print plates (CPU PathTracer4D only)

* Vendor skills: ~/.agents/skills/nvidia-gpu-assist | amd-gpu-assist
  Consulted for honesty; live invoke Phase 3 Draft — not claimed.
```

## Phase map

| Phase | Layer | Status |
|-------|-------|--------|
| 1 | Registry + assist stubs + contracts | Done / PROMOTE_WITH_GAPS |
| 2 | Deterministic integrator harness | Draft / declared (this drop) |
| 3 | Live assist invoke + non-print plates | Draft / declared |
| 4 | Determinism receipts promotion | Draft → `gpu-determinism-2026-09` |

## Ban edge

Any path marked `gpu.*` → **cannot** enter Digital Printer SoT.
