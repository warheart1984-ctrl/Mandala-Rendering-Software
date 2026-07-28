# Multi-Vendor NIM Capability Charter

**Artifact:** `docs/genblaze/capabilities/nim-capability-charter.md`  
**Status:** Constitutional · Multi‑Vendor

## Article I — Purpose

Define the constitutional rules governing NIM model usage within Genblaze across vendors (NVIDIA, Black Forest Labs via NIM, custom NIM providers).

## Article II — Capability Definition

A NIM capability is any model accessible via:

```
Authorization: Bearer <key>
X-NVIDIA-API-Key: <key>
```

and invoked through Genblaze’s assist-only pipeline (or Sovereign X `gpu.gen.nvidia.nim_flux` assist route).

## Article III — Vendor Neutrality

Genblaze must treat NIM vendors equally under constitution:

- NVIDIA
- Black Forest Labs (via NIM)
- Custom / local NIM instances

No vendor may override constitutional boundaries.

## Article IV — Assist-Only Domain

All NIM capabilities are:

- Non-deterministic (creative)
- Assist-only
- Barred from print SoT
- Barred from Digital Printer evidence chain as beauty SoT

## Article V — Model Override Rules

1. Users may override model ID per request.
2. Overrides remain local-only / request-scoped.
3. Overrides must never be persisted server-side as BYOK state.

## Article VI — Constitutional Routing

NIM capabilities may route to:

- FLUX / stills generation
- SceneSpec extraction (hints)
- CharacterSpec generation (hints)
- Lookdev / face-creation assist

NIM capabilities may not route to:

- `cpu.rt4d.print` as SoT replacement
- Digital Printer beauty SoT
- Evidence SoT as authoritative print
