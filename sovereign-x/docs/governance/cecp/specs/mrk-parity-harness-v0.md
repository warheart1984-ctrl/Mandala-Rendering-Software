# Mandala Parity Harness — Design Note v0

**Status:** enforced (Axiom X promoted through it, 2026-08-13).
**Related:** `mrk-spec-v0.md` (SIC), `m-cbmc-v0.md` (Clause 4/5).

## Purpose

Describe the architecture and behavior of Mandala's parity harness — the system that enforces cross-backend mathematical invariance.

## Design Principles

| Principle | Meaning |
|-----------|---------|
| Backend-Neutral | The harness does not assume GPU or CPU correctness; it compares all substrates equally. |
| Semantic Anchoring | The C reference defines canonical output. |
| Byte-Exact Comparison | All outputs must match exactly, not "approximately." |
| sha256 Ledgering | Every output is hashed and stored in the Rosetta Ledger. |

## Harness Components

| Component | File | Role |
|-----------|------|------|
| GPU Dump Tool | `uals/tests/parity/dump_axiomx.c` | Produces raw GPU output for comparison |
| JS Reference Implementation | `mrs/packages/renderer-core/src/render/rt4d/print/AxiomXSampler.js` | Mirrors the math for `cpu.rt4d.print` |
| Parity Checker | `uals/tests/parity/check_parity.mjs` | Byte comparison, sha256 hashing, multi-resolution tests, odd-dimension tests |
| Live Bridge | `axiom-native/node-bindings/test.js` | In-process parity + determinism + provenance + temporal replay stability |
| Gate Harness | `uals/tests/run_gates.exe` (G1-G7) | ABI, dispatch, determinism, provenance, registry, C parity |

## Failure Behavior

If any substrate diverges: harness reports FAIL; ledger entry is blocked; kernel cannot be promoted; implementor must correct the divergence.

## Success Behavior

If all substrates converge: harness reports PASS; sha256 hashes match; kernel becomes eligible for MRK promotion; ledger entry is published.

## Axiom X Outcome

Harness caught a real divergence (missing XOR in the JS mirror). After correction, all substrates converged. Harness validated promotion — recorded in `mrk-axiomx-promotion-record.md`.