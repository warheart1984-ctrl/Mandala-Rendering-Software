# 01 — Architect ADR — Evolution Law Phase-2A

| Field | Value |
|-------|-------|
| `trailId` | `rt4d-evolution-law-2a-2026-08` |
| `role` | Architect Sage |
| `mode` | `sage` |
| `lens` | Physicist + Theorist + Sentinel |
| `softwareCreationMode` | Protocol + Schema-Artist + Testwright + Boundary-Guardian |
| `status` | **partial** |
| `parentTrail` | `rt4d-governed-spacetime-lab-2026-08` |

## Intent

Ship Layer-5 **toy** evolution: deterministic inertial motion with lawHash, fixed Δt stepping, state/trajectory hashes, replay verification, and temporal evidence envelope binding — so Phase-2B CKL gates have something concrete to govern.

## Scope

### In
- Canonical law spec `inertial-motion-v1` (`classification: toy_model`)
- `lawHash`, fixed-step `Sₙ → Sₙ₊₁`, initial/final/per-step hashes, `trajectoryRoot`
- Fail-closed: missing law, non-finite state
- Envelope fields: `evolutionLaw`, `initialStateHash`, `finalStateHash`, `trajectoryRoot`, `stepCount`, `replayStatus`
- Tests AC-E1…AC-E8

### Out
- CKL policy registration (2B)
- Light-cone viz (2C)
- Forces, fields, GR, non-inertial laws
- Physical prediction claims beyond `toy_model`
- Charter / policy edits

## ADR decision

**Sₙ + law L + fixed Δt → Sₙ₊₁** with:

```
position += velocity * Δt
velocity unchanged
```

Natural units; 3D position/velocity + scalar `t`. Default Δt = 1/60.

Reject paths: embedding evolution inside Minkowski metric; skipping lawHash; soft-fail missing law.

## File manifest

| Path | Action |
|------|--------|
| `…/rt4d/evolution/hash.js` | create |
| `…/rt4d/evolution/InertialMotionLaw.js` | create |
| `…/rt4d/evolution/evolve.js` | create |
| `…/rt4d/evolution/index.js` | create |
| `…/rt4d/temporal/TemporalEvidenceEnvelope.js` | extend |
| `…/schemas/rt4d/temporal-evidence-envelope.schema.json` | extend |
| `…/rt4d/test/evolution.inertial.test.js` | create |
| `docs/4d-engine/rt4d/RT4D_EVOLUTION_LAW_PHASE2A.md` | create |
| package.json `test:spacetime-lab` | include new test |
| `…/rt4d/index.js` | export |

## Acceptance

AC-E1…AC-E8 as operator-specified. Claims tagged `toy_model` / `substrate_verified` only.

## Anti-overclaim

Not physics engine. Not relativity dynamics. Not CKL-enforced. Not production simulation.

## Handoff

Builder/Implementor: evolution package first, then envelope, then tests.
