# GPU Dispatch Contract

> **CECP Status:** Draft → Review → **PROMOTE_WITH_GAPS**  
> **Author:** Jon Halstead  
> **Constitutional Domain:** Sovereign X Router  
> **Namespace:** `sx.router.contract.gpu.dispatch`  
> **Implementation status:** **partial** — `validate()` enforced in unit tests.

## Fields

- `intentId`: unique identifier
- `modality`: text | image | video | scene
- `determinismRequired`: true | false
- `vendorPreference`: nvidia | amd | neutral
- `capabilityClass`: gen | inference | compute | print

## Rules

1. Deterministic intents:
   - If `determinismRequired = true`:
     - `capabilityClass` must be `print`.
     - `backend` must be `cpu.rt4d.print`.
2. GPU intents:
   - If `backend` starts with `gpu.`:
     - `capabilityClass` ∈ {gen, inference, compute}.
     - `authority = assist`.
3. Vendor preference:
   - Router may override `vendorPreference` if backend missing.
   - Overrides must be recorded in provenance.

## Outcome

The contract ensures GPU is assist-only until parity and evidence are proven, and CPU RT4D remains the print SoT.
