# Mandala Rosetta Kernel (MRK) Specification — v0

**Status:** enforced for Axiom X (first promoted MRK); other kernels follow the same pipeline.
**Canonical source:** `sovereign-x/docs/governance/cecp/specs/` — this file, `m-cbmc-v0.md`, `mrk-parity-harness-v0.md`, `mrk-rosetta-ledger.md`.

## 1. Purpose

Define how a Mandala kernel expresses a single mathematical intent across heterogeneous execution substrates (GPU, CPU, JS, temporal replay engines) while preserving semantic invariance, determinism, and glyph-field coherence.

## 2. Mandala Rosetta Kernel (MRK) Definition

An MRK is a kernel whose mathematical behavior is invariant across all Mandala substrates. It is not an ISA translator; it is a semantic harmonizer that ensures:

- One mathematical definition
- Multiple backend implementations
- One canonical output
- Temporal stability across 4D sampling loops
- Glyph-field coherence across shader engines

## 3. MRK Components

| Component | Meaning | Status |
|-----------|---------|--------|
| **Intent Definition (ID)** | The kernel's mathematical meaning expressed in Mandala's math-glyph language. Example: "mulberry32 deterministic sampler with 32-bit state evolution." | enforced — `sx.kernel.axiom.x.sample` registry entry |
| **Substrate Implementations (SI)** | GPU/OpenCL; CPU/C reference; JS `cpu.rt4d.print` mirror; any future Mandala substrate (Glyph Shader Engine, Temporal Replay Engine, etc.) | enforced — 3 substrates live; future substrates **declared** |
| **Semantic Invariance Contract (SIC)** | All SI must produce byte-exact outputs for identical inputs | enforced — see `m-cbmc-v0.md` |
| **Parity Harness (PH)** | Cross-backend equivalence oracle that enforces SIC | enforced — see `mrk-parity-harness-v0.md` |
| **Rosetta Ledger Entry (RLE)** | A record containing: kernel name, substrate list, sha256 outputs, test configurations, parity status | enforced — see `mrk-rosetta-ledger.md` |

## 4. MRK Promotion Criteria

A kernel becomes an MRK when:

1. All substrates pass parity — **PASS (Axiom X)**
2. All sha256 outputs match — **PASS (Axiom X)**
3. Odd-dimension tests pass — **PASS (37x53) (Axiom X)**
4. Temporal replay stability is confirmed — **PASS — 5 replay loops byte-identical, 2026-08-13 (Axiom X, kernel-level; engine-level timeline replay **declared**)**
5. RLE is published — **PASS — `mrk-rosetta-ledger.md`**

**Axiom X meets all criteria** and is the first promoted MRK. Promotion is per-kernel; a kernel is not an MRK until its own RLE is published.

## 5. Future Mandala substrates (declared)

- Glyph Shader Engine (glyph-field coherence)
- Temporal Replay Engine (engine-level `ReplayService` parity — kernel-level stability is confirmed; engine-loop parity is not yet wired)
- CPU/C reference already canonical (Clause 3 anchor)