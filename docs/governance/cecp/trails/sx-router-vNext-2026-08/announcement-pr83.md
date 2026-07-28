# Constitutional Announcement — PR #83 (Sovereign X Router / Vendor GPU)

**Status:** **declared** announcement (documentation)  
**PR:** [#83](https://github.com/warheart1984-ctrl/Mandala-Rendering-System-MRS-/pull/83)  
**Date:** 2026-07-28  
**Domain:** Sovereign X Router — Compute / Capability Layer  
**Trail:** `sx-router-vNext-2026-08` · Phase 1 evidence: `vendor-gpu-integration-2026-07`

## What landed (honest)

PR #83 accepts **governed, assist-only** GPU capability registration into the
Sovereign X Router layout under `sovereign-x/`, with CPU PathTracer4D
(`cpu.rt4d.print`) remaining the **sole authoritative print source-of-truth**.

ESFR for Phase 1: **PASS_WITH_GAPS** / **PROMOTE_WITH_GAPS**.

## What this is not

- Not live CUDA, HIP, NIM, ROCm, or TAO runtime enforcement.
- Not GPU Digital Printer SoT.
- Not enforced CPU↔GPU print parity (parity suite remains **skeleton**; SSIM cases skipped).
- Not commercial “production ready” (Drive-G-2: specify dimension before that claim).

## Guarantees retained

1. `gpu.*` → `assistOnly` / `nonAuthoritative`.
2. `determinismRequired=true` → `cpu.rt4d.print`.
3. Vendor neutrality at the protocol/registry layer (NVIDIA + AMD slots).
4. Evidence chains for print remain CPU-bound.

## Roadmap (vNext)

| Phase | Status |
|-------|--------|
| 1 Vendor GPU assist SoT | **Done** (this PR / linked trail) |
| 2 Deterministic assist harness | **Draft** / **declared** |
| 3 Live assist + non-print plates | **Draft** / **declared** |
| 4 Determinism promotion | **Draft** → `gpu-determinism-2026-09` |

## CIEMS / CECP pointers

- Promotion packet: `../vendor-gpu-integration-2026-07/09-promotion-packet.md`
- Lineage tree: `../vendor-gpu-integration-2026-07/ciems-lineage-tree-vendor-gpu.md`
- Review packet: `./ciems-review-packet-vendor-gpu.md`
- Architecture: `./sx-router-vNext-architecture-diagram.md`

> “No action without evidence. No claim without proof. No system without governance.”
