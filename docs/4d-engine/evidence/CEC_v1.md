# Constitutional Evidence Contract (CEC) v1.0

| Field | Value |
|-------|-------|
| **Artifact** | ConstitutionalEvidenceContract |
| **Status** | Spec **declared** · Emitter **partial** |
| **Schema** | `schemas/ciems/cec-v1.json` |
| **Emitter** | `mrs/packages/renderer-core/src/evidence/photoreal/emitCec.js` |

## Purpose

CEC binds PEP + SPR + Replay Determinism Record + audit hooks + governance trail. No photoreal claim may be elevated to Full without a valid CEC (declared constitutional rule).

## Structure

- **bindings** — pep id, spr id, RDC hash, ESFR/Inspector pointers, trail path
- **invariants** — five boolean constitutional flags
- **verification** — pep/spr completeness, determinismVerification, auditReadiness, promotionEligibility
- **fullPhotorealEligible** — Phase 2 emitters **always false** (no auto Full Photoreal)

## Promotion honesty

| Score band | Typical eligibility |
|------------|---------------------|
| Low / no beauty pixels | `HOLD` |
| Beauty pixels or mid completeness | `PROMOTE_WITH_GAPS` |
| ≥0.95 both + manual forceFull | `PROMOTE` (not auto) |

## Supporting lean contracts

| ID | Schema | Role |
|----|--------|------|
| RDC | `schemas/ciems/rdc-v1.json` | Replay determinism (also PEP section) |
| MFP-C | `schemas/ciems/mfp-c-v1.json` | Material fidelity entries |
| LJC | `schemas/ciems/ljc-v1.json` | Lighting justification entries |
