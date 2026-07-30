# Photoreal Evidence Packet (PEP) v1.0

| Field | Value |
|-------|-------|
| **Artifact class** | CPE-PHR-EVD |
| **Status** | Spec **declared** · Emitter **partial** |
| **Schema** | `schemas/ciems/pep-v1.json` |
| **Emitter** | `mrs/packages/renderer-core/src/evidence/photoreal/emitPep.js` |
| **Drive-G-1** | Completeness scores stay Partial until fields filled; **never** auto-promote Full Photoreal |

## Purpose

PEP is the constitutional evidence object that binds renderer output to scene provenance, material fidelity, lighting justification, physical plausibility, replay determinism, and audit verifiability. ESFR / Inspector / Replay / Audit consume it.

Elevation from Partial → Full Photoreal requires a valid PEP **and** CEC with complete scores — not pixel presence alone.

## Sections

| Code | Section |
|------|---------|
| AR | Authority Record |
| MFP | Material Fidelity Proof (`schemas/ciems/mfp-c-v1.json`) |
| LJR / LJC | Lighting Justification (`schemas/ciems/ljc-v1.json`) |
| GTE | Geometry & Topology Evidence |
| CEE | Camera & Exposure Evidence |
| PPL | Physical Plausibility Ledger |
| RDR / RDC | Replay Determinism (`schemas/ciems/rdc-v1.json`) |
| AH | Audit Hooks + completeness score |

## Invariants

1. No photoreal claim without photoreal evidence.
2. Evidence must be replayable.
3. Evidence must be auditable.
4. Evidence must be deterministic (seed + params hashable).
5. Evidence must be provenance-complete (via SPR binding).

## Integration

Post-render on `mrs:governed-render --beauty external-pbr`:

1. Cycles beauty PNG (when present) + GLB hashes
2. Emit `pep.json` under the run directory
3. Bind via `cec.json`

See `README.md` in this folder and CECP trail `photoreal-evidence-pep-spr-2026-07`.
