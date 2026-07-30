# 01 — Architect ADR

| Field | Value |
|-------|-------|
| status | **declared** (specs) / **partial** (emit path) |
| cognitive-profile | Integrator |
| lens | Sage |

## Intent

Land Phase 2 constitutional photoreal evidence artifacts (PEP, SPR, CEC + lean RDC/MFP-C/LJC) so external-PBR beauty claims have an auditable evidence chain without overclaiming Full Photoreal.

## ADR

**Context:** Governed-render can produce Cycles beauty PNGs + GLB provenance, but lacked CIEMS evidence packets for promotion gates.

**Decision:** Adopt user draft JSON-LD shapes under `schemas/ciems/`; emit Partial packets post-render; bind via CEC with `fullPhotorealEligible: false`.

**Consequences:** Operators get `spr.json`/`pep.json`/`cec.json`; Full Photoreal remains a human/ESFR elevation, not an auto flag.

## Interface

| Input | Output |
|-------|--------|
| GLB + glb-provenance + Cycles params + beauty hash + trail | SPR, PEP, CEC |
| Schemas | JSON Schema draft 2020-12 (lean smoke validation) |

## Boundary

- In scope: schemas, docs, emitters, governed-render hook, T-01..T-08 checklist
- Out of scope: charter.js / AGENTS.md / default.policies.json edits; Full Photoreal certification
- Protected paths: not modified

## Acceptance

1. Schemas validate emitted docs (smoke)
2. Emit from known blender-10s or glb-repro run
3. Completeness Partial; `fullPhotorealEligible === false`
