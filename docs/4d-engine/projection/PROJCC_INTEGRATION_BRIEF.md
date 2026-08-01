# ProjCC Integration Brief — Anime-Structure Plate Projector

| Field | Value |
| --- | --- |
| Status | **declared** — until ProjCC code hooks exist; do **not** claim enforced |
| Related | [`PROJECTION_CONTINUITY_CONTRACT.md`](./PROJECTION_CONTINUITY_CONTRACT.md), [`INTEGRATION_NOTES.md`](./INTEGRATION_NOTES.md) |
| Governance review | [`docs/governance/projcc/PROJCC_REVIEW_PROJECTOR4D.v1.md`](../../governance/projcc/PROJCC_REVIEW_PROJECTOR4D.v1.md) |
| Binding diff | [`docs/governance/projcc/PROJCC_BINDING_DIFF.v1.md`](../../governance/projcc/PROJCC_BINDING_DIFF.v1.md) |

## Objective

Integrate the Anime-Structure Plate Projector into the Projection Continuity Contract (ProjCC) so that 4D→3D projection becomes a governed, replayable, evidence-bound transformation — **without** mutating Print SoT / Digital Printer.

## Required ProjCC Hooks

### Intent → Projection Binding

- `projection_method`: `projector4d-sot` \| `drop_w`
- `lane`: `anime-structure` \| `literal-xyz`

### Evidence Chain

Provenance fields:

- `projector_id`
- `reference_model`
- `alpha` or `d4`
- `print_sot_touched`
- `asset_sha256`

### Replay Contract

- Projection must be deterministic
- Runner must emit replay hash
- CI must validate provenance schema (**missing**)

### Promotion Gate

- ProjCC must declare `projector4d-sot` as **eligible** for lane promotion
- Promotion requires: pole-stress thresholds, ink-cel comprehension evidence, shading-space alignment

### Structure Plate Definition

- Anime-Structure plate = 4D story lane
- Literal-XYZ plate = debug lane
- Both must be selectable via ProjCC

## Outcome (aspirational — **declared**)

ProjCC becomes the constitutional authority for 4D→3D **observation / structure-lane binding**, ensuring reproducibility, evidence, and multi-lane rendering. Charter CKL row remains **declared**.
