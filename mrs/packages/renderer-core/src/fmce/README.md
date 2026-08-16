# FMCE — Federated Mandala Constitutional Engine

The canonical, green constitutional engine for the Mandala Rendering System.
Pure ES modules under `src/fmce/`, no runtime dependencies beyond Node ≥ 20.

**Status:** canonical — 14 test suites / 131 tests green via
`npm run test:fmce` (root) or `npx jest --config jest.config.cjs`.

## What it does

Every intent, artifact, and render decision is routed through the constitutional
chain before anything is produced:

```
PILOT → CPP → ConstitutionalCore → V12 → EvidenceChain → ReplayEngine → RT4D → MandalaLattice → PILOT
```

The loop closes: `MandalaLattice` hands control back to `PILOT`, preserving the
invariant surface, determinism class, and evidence bundle at every turn.

## Module map

| Module | Dir | Role |
|--------|-----|------|
| Core | `core/` | `FMCE`, `FMCEValidator`, `FMCEState`, canonical `hash.js` (`sha256Hex`, `sha256Prefixed`, `stableStringify`, `canonicalHash`) |
| PILOT | `pilot/` | Intent parsing / dispatch |
| CPP | `cpp/` | CommandProposalProtocol: authority, capability, policy, evidence validation |
| Constitutional | `constitutional/` | Authority → Validation → Decision chain; no decision without evidence |
| V12 | `v12/` | 12-stage proof trace; `finalDeterminismClass` (D0–D4) + `finalStatus` |
| Evidence | `evidence/` | `EvidenceChain` — append-only bundles, replay equivalence |
| Replay | `replay/` | `ReplayEngine` — invariant re-validation, determinism reconciliation |
| RT4D | `rt4d/` | 4D rendering determinism + invariant enforcement |
| Mandala | `mandala/` | `MandalaLattice` — invariant surface, 4D spatial continuity, loop closure |
| Navigation | `navigation/` | Constitutional grammar + illegal command rejection |
| Anomaly | `anomaly/` | Drift detection → classification → constitutional escalation |
| Explanation | `explanation/` | Cause / evidence / invariant surface per decision |
| Cross-layer | `test/` | Cross-layer equivalence (CPU/GPU/Axiom-X) within precision contract |
| Demo | `demo/` | Deterministic SME e2e demo (GEN → VIS → TXT → AUD) under governance |

## Determinism classes

Frozen contract (D0 immutable → D4 statistical). V12 classifies every trace:
- **D2_NUMERICAL** — bit-reproducible given seed (the demo pipeline is D2)
- **D3_SEMANTIC**, **D4_STATISTICAL** — broader, drift-tolerant classes

`ReplayEngine` re-runs invariant validators and reconciles class on replay;
drift detected by `anomaly/` escalates to `EvidenceChain`.

## Protected paths

`/constitution`, `/engine/constitution`, `/policies`, and `AGENTS.md` are
`PROTECTED_PATHS`. FMCE rejects any proposal attempting to mutate them —
proposals must target governed, non-protected paths (e.g. `/sme/<stage>`).

## Run it

```bash
# full FMCE suite (14 suites / 131 tests)
npm run test:fmce

# deterministic SME e2e demo under FMCE governance
npm run demo
```

## Deterministic SME e2e demo (`demo/`)

A CPU-only, seed-reproducible multimodal pipeline that exercises the real FMCE:

```
authority → gen_image → vis_encode → txt_reason → aud_transcribe
```

- `gen.js` — procedural 32×32 image + PCM audio (seeded, no diffusion/ML)
- `vis.js` — 512-dim embedding + feature/region evidence
- `txt.js` — 768-dim reasoning embedding + decision record
- `aud.js` — 256-dim embedding + transcript timecodes from real frame RMS
- `fuse.js` — concat/truncate/normalize → 768-dim fused context
- `govern.js` — every artifact routed through `FMCE.validate()`; no modality
  without governance
- `trace.js` — full constitutional trace, Appendix C shape
- `orchestrator.js` — runs the chain twice, compares checksums → replay verify
- `run-demo.js` — CLI (`npm run demo`)
- `test/demo.test.js` — 10 tests: stage order, authorization, determinism,
  dims per SME-SPEC (512/768/256/768), timecodes, CIEMS trace shape

Replay verification: the deterministic chain is run twice with the same seed;
matching pipeline signatures prove bit-exact replay (fixed timestamp
`1970-01-01T00:00:00.000Z`, seeded mulberry32, no `Date.now`/`Math.random`).

## Item 5 — FaceIdentityModeler

Governing law for human faces lives in `@mrs/engine3d-core`:
`src/face/FaceIdentityModeler.ts` (+ `FixtureFaceRegistry`, `FaceRig`, biometric
inheritance, Amendment VII render apply). Procedural + fixture-based only — **no
diffusion/ML claims**. Run its suite with `npm run test:face-identity`
(`dist/test/face/face-identity-modeler.test.js`).

## Governance

See `../../../SME-SPEC.md` (SME contract shapes, Appendix C trace, CPU-bound
constraints) and `AGENTS.md` (binding lawbook). The demo deliberately labels
its modules *deterministic simulations* — no model files, no GPU, no I/O.
