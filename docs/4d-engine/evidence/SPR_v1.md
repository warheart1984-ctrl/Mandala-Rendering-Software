# Scene Provenance Record (SPR) v1.0

| Field | Value |
|-------|-------|
| **Artifact class** | CPE-SCN-PRV |
| **Status** | Spec **declared** · Emitter **partial** |
| **Schema** | `schemas/ciems/spr-v1.json` |
| **Emitter** | `mrs/packages/renderer-core/src/evidence/photoreal/emitSpr.js` |

## Purpose

SPR establishes origin, lineage, and integrity of every scene element so photoreal claims are not fabricated at render time. Required for Full Photoreal and Full Promotion (declared gate — not auto-enforced in Phase 2).

## Sections

| Code | Section |
|------|---------|
| SIB | Scene Identity Block (UUID, GLB hash, provenance chain) |
| APL | Asset Provenance Ledger |
| GP | Geometry Provenance |
| MP | Material Provenance |
| LP | Lighting Provenance |
| CP | Camera Provenance |
| EP | Environment Provenance |
| CH | Constitutional Hooks + completeness score |

## Invariants

1. No photoreal claim without scene provenance.
2. Scene provenance must be complete (aspirational Full; Partial until textures/HDRI/topology filled).
3. Scene provenance must be hash-verifiable (GLB SHA-256).
4. Scene provenance must be audit-ready (trail pointers).

## Integration

Emitted from `external-pbr/scene.glb` + `glb-provenance.json` (+ optional SceneSpecification) after governed external-PBR export. Written as `spr.json` in the run directory.
