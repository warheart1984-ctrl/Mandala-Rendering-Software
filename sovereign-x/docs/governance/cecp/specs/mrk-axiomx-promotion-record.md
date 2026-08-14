# Axiom X — Mandala Promotion Record

**Status:** **PROMOTED** — first Mandala Rosetta Kernel (2026-08-13).

## Kernel Name

Axiom X — Deterministic Mulberry32 Sampler (`sx.kernel.axiom.x.sample`, ABI v0).

## Intent Definition

A deterministic 32-bit mulberry32 sampler used for:

- glyph evolution
- temporal sampling
- 4D integrator loops
- shader-driven stochastic fields

Output is a pure function of `(seed, x, y, spp)` — no atomics, no reductions.

## Substrate Implementations

| Substrate | Location | Status |
|-----------|----------|--------|
| GPU/OpenCL | `sx.kernel.axiom.x.sample` (kernel `axiom_x_sample`) | enforced |
| C Reference | G6 canonical implementation (`uals/tests/gate_parity.c`) | enforced |
| JS Mirror | `mrs/packages/renderer-core/src/render/rt4d/print/AxiomXSampler.js` (`cpu.rt4d.print`) | enforced |

## Parity Evidence

Test configurations: 64x64 spp=4 · 128x128 spp=8 · 37x53 spp=16 (odd dims)

| Check | Result |
|-------|--------|
| GPU output dump | PASS |
| C reference | PASS |
| JS mirror | PASS after correction |
| sha256 equivalence | PASS (`849a3bdc…cbfd`, `5fe1468d…a34633`, `7d629221…837b71`) |
| byte-exact parity | PASS |
| Temporal replay stability | PASS — 5 replay loops byte-identical (kernel-level) |

## Detected Divergence

JS implementation missing final XOR in `t ^= t + ...`. Caught by parity harness. Corrected. Re-verified byte-exact.

## Promotion Decision

**PROMOTED** — Axiom X is now a Mandala Rosetta Kernel.

## Rosetta Ledger Entry

See `mrk-rosetta-ledger.md` — entry `AXIOM-X-001`.

**Notes:** First Mandala kernel promoted through the full Rosetta pipeline.

## Scope boundaries (declared)

- Engine-level temporal replay (`engine/replay/ReplayService`) parity not yet wired — kernel-level replay stability is confirmed; engine-loop parity is the declared next substrate.
- Glyph Shader Engine substrate is **declared**, not implemented.