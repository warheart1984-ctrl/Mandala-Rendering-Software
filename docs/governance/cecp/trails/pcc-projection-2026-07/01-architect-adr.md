# 01 — Architect ADR (Sage + Navigator + Architect-Kernel)

| Field | Value |
| --- | --- |
| `mode` | sage |
| `actorMode` | Navigator |
| `softwareCreationMode` | Architect-Kernel |
| `cognitive-profile` | Scientist |
| Status | **declared** design; implementation promoted to **partial** by tests |

## Intent

Deliver Projection Continuity Contract (ProjCC) for intentional 4D observation
parameters \(P(\theta,\varphi,\tau,\kappa)\) **extending** existing `Projector4D` SoT —
not a parallel Python/print kernel.

## ADR decision

**Context:** Observation Modes and projector formulas exist; continuity contract
and aperture API were missing as a first-class package.

**Decision:** Place kernel under `mrs/packages/renderer-core/src/render/rt4d/projection/`,
delegate closed-form \(4\mathrm{D}\rightarrow 3\mathrm{D}\rightarrow 2\mathrm{D}\) to
`output/projector.js`, document under `docs/4d-engine/projection/`.

**Rejected:** New `mrs/core/projection_kernel.py` as SoT; claiming **enforced**
observation engine; folding aperture into print SoT.

## Interface specification

- Inputs: \(\theta,\varphi,\tau,\kappa\), projector opts, observation mode id
- Outputs: `ProjectionState`, projected screen samples, `ApertureFrame3D`, verifier results
- Bans: no secrets; no charter/AGENTS edits; no print-SoT replacement

## Constitutional boundary

| In | Out |
| --- | --- |
| RT4D projection continuity | Protected charter files |
| CECP trail + PCC docs | Vendor GPU as print SoT |
| Hyper-Caustic verifier hooks | Full path-tracer rewrite |

## File manifest

| Path | Action | Owner |
| --- | --- | --- |
| `docs/4d-engine/projection/*.md` | create | Architect→Implementor |
| `rt4d/projection/*` | create | Builder→Implementor |
| `rt4d/test/projection.*.test.js` | create | Implementor |
| `docs/governance/cecp/trails/pcc-projection-2026-07/` | create | Crew |

## Acceptance criteria

- [x] Zero-param fidelity to Projector4D
- [x] Continuity finite-difference tests
- [x] Lens verifier soft-skip without dataset
- [x] Path-tracer hooks tagged **declared**
- [x] No **enforced** self-claims

## Anti-overclaim

Must NOT claim: complete 4D observation engine, FULL_PASS lens north-star without
hashes, CKL enforcement, GPU print acceleration.

## Sage counsel

Prove fidelity + continuity first; leave path-tracer bind and visual north-star
as **declared**/soft-skip until datasets and integrator wiring exist.

## Handoff to Builder

Scaffold `projection/` package + docs stubs per manifest; no math invention beyond
wrapping Projector4D.
