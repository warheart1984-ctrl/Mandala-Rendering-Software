# 4D → 3D projection docs

Index for projection continuity, structure-lane plates, reference-model verification, and the Anime-Structure promotion package (PR #95).

## Core contracts & design

| Doc | Role | Status |
| --- | --- | --- |
| [`ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md`](./ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md) | Anime structure plate projector contract | **declared / partial** |
| [`W_AS_STORY_VS_FLAT_AXIS.md`](./W_AS_STORY_VS_FLAT_AXIS.md) | Design note: Projector4D vs drop_w | **declared** |
| [`USER_4D_TO_3D_MATH_VERIFY.md`](./USER_4D_TO_3D_MATH_VERIFY.md) | User math ↔ repo SoT mapping | **declared** |
| [`PROJECTION_CONTINUITY_CONTRACT.md`](./PROJECTION_CONTINUITY_CONTRACT.md) | ProjCC observation aperture | **partial** |
| [`PROJECTION_CONTINUITY_DIAGRAM.md`](./PROJECTION_CONTINUITY_DIAGRAM.md) | Continuity diagram | **declared** |
| [`INTEGRATION_NOTES.md`](./INTEGRATION_NOTES.md) | ProjCC wiring notes | **partial→enforced** (suite) |

## Promotion package (v1)

| Doc | Role | Status |
| --- | --- | --- |
| [`PROMOTION_GATE.v1.md`](./PROMOTION_GATE.v1.md) | Promotion criteria + ink-cel rubric | **Not ready** |
| [`PROMOTION_READINESS_CHECKLIST.md`](./PROMOTION_READINESS_CHECKLIST.md) | A–E checklist (~70%) | **declared / partial** |
| [`PROMOTION_DECISION_MATRIX.v1.md`](./PROMOTION_DECISION_MATRIX.v1.md) | Decision matrix | **declared** |
| [`POLE_STRESS_MITIGATION.md`](./POLE_STRESS_MITIGATION.md) | Options A–D; Option C thresholds | **partial** |
| [`PROJCC_INTEGRATION_BRIEF.md`](./PROJCC_INTEGRATION_BRIEF.md) | ProjCC hooks | **declared** |
| [`INK_CEL_PROJECTION_TEST_PLAN.md`](./INK_CEL_PROJECTION_TEST_PLAN.md) | Full ink-cel plan | **declared** |
| [`RELEASE_NOTE_ANIME_STRUCTURE_PLATE_PROJECTOR_V1.md`](./RELEASE_NOTE_ANIME_STRUCTURE_PLATE_PROJECTOR_V1.md) | Release note | **declared** |
| [`DIAGRAM_4D_TO_3D_LANES.v1.md`](./DIAGRAM_4D_TO_3D_LANES.v1.md) | Lane ASCII diagram | **declared** |
| [`DIAGRAM_POLE_STRESS.v1.md`](./DIAGRAM_POLE_STRESS.v1.md) | Pole-stress ASCII | **declared** |
| [`DIAGRAM_HYBRID_POLE_BLEND.v1.md`](./DIAGRAM_HYBRID_POLE_BLEND.v1.md) | Option D hybrid (future) | **declared / future** |
| [`BUNDLE_v1/README.md`](./BUNDLE_v1/README.md) | Bundle pointer index | **declared** |

## Governance (ProjCC)

| Doc | Path | Status |
| --- | --- | --- |
| ProjCC review | [`../../governance/projcc/PROJCC_REVIEW_PROJECTOR4D.v1.md`](../../governance/projcc/PROJCC_REVIEW_PROJECTOR4D.v1.md) | **draft** |
| CSE/CCC sign-off | [`../../governance/projcc/CSE_CCC_SIGNOFF_CHECKLIST.v1.md`](../../governance/projcc/CSE_CCC_SIGNOFF_CHECKLIST.v1.md) | **draft** (eligibility ≠ promotion) |
| Binding diff | [`../../governance/projcc/PROJCC_BINDING_DIFF.v1.md`](../../governance/projcc/PROJCC_BINDING_DIFF.v1.md) | **declared** |

## Releases / Devpost

| Doc | Path |
| --- | --- |
| Lane announcement | [`../../releases/ANIME_STRUCTURE_PROJECTOR_LANE_ANNOUNCEMENT.md`](../../releases/ANIME_STRUCTURE_PROJECTOR_LANE_ANNOUNCEMENT.md) |
| Devpost blurb | [`../../ops/DEVPOST_ANIME_STRUCTURE_PROJECTOR.md`](../../ops/DEVPOST_ANIME_STRUCTURE_PROJECTOR.md) |

## Experiment

| Artifact | Path |
| --- | --- |
| Runner | `mrs/packages/renderer-core/scripts/rt4d-project-compare.mjs` |
| Evidence (tmp) | `tmp/rt4d-project-compare/` |
| Provenance schema | `schemas/4d-engine/v1/StructurePlateProjectionProvenance.v1.schema.json` |

```bash
node mrs/packages/renderer-core/scripts/rt4d-project-compare.mjs
node mrs/packages/renderer-core/scripts/rt4d-project-compare.mjs --pole-stress
node mrs/packages/renderer-core/scripts/rt4d-project-compare.mjs --scene rich
```

| Experiment | Evidence | Status |
| --- | --- | --- |
| Sparse hits | ~90 hits → `tmp/rt4d-project-compare/` | **PASS** (prior runs) |
| Scene-rich | ~194 hits → `scene-rich/` | **PASS** (scaffold; ≠ full ink-cel) |
| Pole-stress | `pole-stress/` + Option C fallbacks | **partial** |

**Evaluation lock:** no universal winner — Projector4D for 4D story / explanation; drop_w for literal debug. Print SoT / Digital Printer untouched. Pattern: **experiment → provenance → contract → promotion** (contract §6; [`PROMOTION_GATE.v1.md`](./PROMOTION_GATE.v1.md); promotion remains **declared / not ready**).
