# Sovereign X Router — GPU Capability Map

> **CECP Status:** Draft → Review → **PROMOTE_WITH_GAPS**  
> **Author:** Jon Halstead  
> **Constitutional Domain:** Sovereign X Router  
> **Namespace:** `sx.capability.gpu.*`  
> **Drive-G-1:** capability registration **declared**/**partial**; live GPU **not** claimed.

## Capability Classes

- `gpu.gen.nvidia.nim_flux`
- `gpu.inference.nvidia.tao`
- `gpu.compute.nvidia.cuda`
- `gpu.inference.amd.rocm`
- `gpu.compute.amd.hip`
- `gpu.integrator.deterministic` (**declared** / prototype assist; never print SoT)
- `cpu.rt4d.print` (authoritative print SoT)

## Router View

Inputs:

- `intentId`
- `modality` (text | image | video | scene)
- `determinismRequired` (true | false)
- `vendorPreference` (nvidia | amd | neutral)

Outputs:

- `backend`: cpu | nvidia | amd
- `capabilityClass`: gen | inference | compute | print
- `authority`: assist | authoritative

## Core Rule

- Any `gpu.*` capability is assist-only.
- Only `cpu.rt4d.print` may be authoritative for print.
