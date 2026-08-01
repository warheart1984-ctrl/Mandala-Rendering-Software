# ProjCC Constitutional Review Draft — Projector4D (v1)

| Field | Value |
| --- | --- |
| Status | **declared / draft** — eligibility review, not promotion |
| Subject | Anime-Structure Plate Projector (`projector4d-sot`) |
| Related | [`docs/4d-engine/projection/PROJCC_INTEGRATION_BRIEF.md`](../../4d-engine/projection/PROJCC_INTEGRATION_BRIEF.md) |

## Objective

Evaluate Projector4D against the Projection Continuity Contract (ProjCC) to determine eligibility for lane promotion.

## Review Criteria

### 1. Intent → Projection Binding

Projector4D must declare:

- `projection_method`: `projector4d-sot`
- `lane`: `anime-structure`
- `reference_model`: `d4/(d4+w)`

Status: **Declared**.

### 2. Evidence Chain

ProjCC requires: deterministic replay, provenance fields, asset hashing, reference model disclosure.

Status: All **declared**; CI validator **missing**.

### 3. Constitutional Separation

ProjCC requires separation of intent, evidence, authority, projection, replay.

Status: Runner + provenance satisfy separation; promotion requires validator.

### 4. Multi-Lane Governance

ProjCC prohibits universal winners. Projector4D must coexist with `drop_w` (debug) and optional hybrid lanes.

Status: **Compliant**.

### 5. Promotion Eligibility

Requires: pole-stress thresholds, ink-cel comprehension evidence, shading-space alignment, constitutional review sign-off.

Status: **Pending**.

## Conclusion

Projector4D is constitutionally **eligible** but **not yet promotable** under ProjCC v1.
