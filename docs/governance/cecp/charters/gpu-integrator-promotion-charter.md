# Charter: GPU Integrator Promotion (2026-08)

**Artifact:** `docs/governance/cecp/charters/gpu-integrator-promotion-charter.md`  
**Domain:** Sovereign X Router — Compute Layer  
**Status:** **Draft** (future charter) — **not** enacted; does **not** reclassify any registry capability today  
**Drive-G-1 / Drive-G-2:** Article IV describes a **future** authority transfer only after CECP vote + evidence. Until then, `cpu.rt4d.print` remains sole authoritative print SoT and all `gpu.*` remain assist.

---

## Article I — Purpose

Define constitutional requirements for promoting a GPU integrator from
assist-only to authoritative within Sovereign X Router.

## Article II — Eligibility Requirements

A GPU integrator may be considered for promotion only if:

### Seed Contract Compliance

- Deterministic PRNG (mulberry32)
- Stratified jitter
- Seed propagation across kernels

### Replay Receipt Compliance

- `seed`
- `frameHash`
- `replayHash`
- `deviceInfo`
- `driverVersion`

### Parity Compliance

- SSIM ≥ 0.98
- MSE ≤ 0.002
- ΔLuma ≤ 0.5%
- ΔChroma ≤ 0.5%

*(Thresholds are **declared** eligibility criteria. Live measured parity is
**pending** — skeleton stub SSIM 1.00 is not evidence.)*

### Multi-Host Reproducibility

- NVIDIA
- AMD
- WebGPU/Vulkan

## Article III — Governance

- GPU integrators remain assist-only until promoted.
- Promotion requires a CECP vote.
- Promotion requires a CIEMS lineage update.
- Promotion requires a Router capability reclassification.

## Article IV — Authority Transfer (**future draft only**)

**Status tag:** **declared** / future — **NOT** active.

Upon a future successful promotion (not today):

- GPU integrator **may** become authoritative for print.
- Router **may** route deterministic intents to GPU.
- GPU integrator **may** enter the Digital Printer evidence chain.

**Current law (unchanged):** Do **not** reclassify registry rows to
`authority: "authoritative"` under this draft. Print SoT remains
`cpu.rt4d.print`.

## Article V — Revocation

Promotion may be revoked if:

- Parity drift occurs
- Driver nondeterminism detected
- Seed contract violated
- Replay receipts fail
