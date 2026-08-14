# Mandala Cross-Backend Math Contract (M-CBMC) — v0

**Status:** enforced (all 6 clauses verified for Axiom X, 2026-08-13).
**Domain:** MRK semantic invariance (`mrk-spec-v0.md`).

## Purpose

Define the rules that ensure Mandala's math kernels behave identically across all execution substrates.

## Contract Overview

The M-CBMC guarantees that a kernel's mathematical intent is preserved across:

- GPU execution
- CPU reference
- JS debug mirrors
- Temporal replay loops
- Glyph shader engines

## Contract Clauses

### Clause 1 — Deterministic Evolution
All kernels must evolve their internal state deterministically for identical inputs.
*Evidence: G4 — two runs same seed byte-identical; seed+1 diverges; test.js determinism assertions.*

### Clause 2 — Substrate Fidelity
Each substrate must implement the kernel's math exactly, including: bitwise operations, integer overflow semantics, XOR chains, shift patterns, rounding behavior.
*Evidence: G6 (C reference bit-exact); test.js live JS parity. Integer semantics are uint32-mod-2^32 in C/OpenCL, `Math.imul`/`>>> 0` in JS.*

### Clause 3 — Canonical Output
The kernel's output is defined by the reference implementation (usually C). All other substrates must match it byte-exactly.
*Evidence: C reference is the anchor; OpenCL and JS mirror both byte-exact vs it.*

### Clause 4 — Parity Enforcement
Parity harness must verify: byte-exact output, sha256 equivalence, multi-resolution tests, odd-dimension tests, temporal replay consistency.
*Evidence: 64x64 spp=4, 128x128 spp=8, 37x53 spp=16; sha256 matches; 5 replay loops stable.*

### Clause 5 — Drift Detection
Any divergence (e.g., missing XOR) must be caught by the parity harness and corrected before promotion.
*Evidence: JS mirror's missing final XOR in `t ^= t + ...` was caught by the harness, corrected, re-verified. Recorded in `mrk-axiomx-promotion-record.md`.*

### Clause 6 — Rosetta Ledger Publication
All parity results must be published in the Mandala Rosetta Ledger.
*Evidence: `mrk-rosetta-ledger.md`, entry AXIOM-X-001.*