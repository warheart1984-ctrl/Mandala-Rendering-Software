# GPU-Assisted Compute Integration Charter

> **CECP Status:** Draft → Review → **PROMOTE_WITH_GAPS**  
> **Author:** Jon Halstead  
> **Constitutional Domain:** Sovereign X Router  
> **Namespace:** `sx.charter.gpu.assisted-compute`  
> **Doc status:** **declared** (does not amend `engine/constitution/` without auth).

## Article A1 — Scope

GPU backends (NVIDIA, AMD) are assistive only until deterministic parity and evidence are proven for print.

## Article A2 — Evidence

GPU outputs must emit `assistProvenance` records.  
Only `cpu.rt4d.print` emits `printEvidence` and participates in the Digital Printer evidence chain.

## Article A3 — Determinism

No GPU path may be labeled deterministic without:

- a seed contract,
- replay receipts,
- parity metrics against `cpu.rt4d`.

## Article A4 — Authority

Sovereign X Router is the sole authority binding intents to GPU capabilities under this charter.

## Article A5 — Vendor Neutrality

The router must support multi-vendor dispatch.  
No hard vendor lock-in is permitted at the protocol level.  
`VendorPreference` is advisory; sovereignty may override.
