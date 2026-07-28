# CIEMS v2.0 — Constitutional Integration Diagram (GPU-Assisted Router)

> **Trail:** `cecp.trail.vendor-gpu-integration-2026-07`  
> **Author:** Jon Halstead  
> **Status:** **declared** diagram (placement map; not a runtime gate)

## Stack

Constitution  
→ Specification  
→ Conformance  
→ Implementation  
→ Deployment  
→ Stewardship

## Placement

- **Constitution:** GPU-Assisted Compute Integration Charter  
- **Specification:** GPU Capability Map, Dispatch Contract, LookDev Engine spec  
- **Conformance:** Router contracts (`gpuDispatchContract.js`) and capability registry  
- **Implementation:** `gpuAssistModule.js`, `lookDevEngine.js`, NVIDIA/AMD skills  
- **Deployment:** Sovereign X Router runtime with vendor skills installed  
- **Stewardship:** CECP trails (`vendor-gpu-integration-2026-07`), parity test suite, capability inspector CLI

## Flows

Intent → Sovereign X Router →  

- If `determinismRequired=true` → `cpu.rt4d.print` → Digital Printer evidence.  
- Else → GPU assist (NVIDIA/AMD) → look-dev / SceneSpec hints → human curation → `cpu.rt4d.print`.
