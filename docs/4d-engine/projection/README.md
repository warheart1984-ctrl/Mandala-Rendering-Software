# 4D → 3D projection docs

Index for projection continuity, structure-lane plates, and reference-model verification.

| Doc | Role | Status |
| --- | --- | --- |
| [`ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md`](./ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md) | Anime structure plate projector contract | **declared / partial** |
| [`W_AS_STORY_VS_FLAT_AXIS.md`](./W_AS_STORY_VS_FLAT_AXIS.md) | Design note: Projector4D vs drop_w | **declared** |
| [`USER_4D_TO_3D_MATH_VERIFY.md`](./USER_4D_TO_3D_MATH_VERIFY.md) | User math ↔ repo SoT mapping | **declared** |
| [`PROJECTION_CONTINUITY_CONTRACT.md`](./PROJECTION_CONTINUITY_CONTRACT.md) | ProjCC observation aperture | **partial** |
| [`PROJECTION_CONTINUITY_DIAGRAM.md`](./PROJECTION_CONTINUITY_DIAGRAM.md) | Continuity diagram | **declared** |
| [`INTEGRATION_NOTES.md`](./INTEGRATION_NOTES.md) | ProjCC wiring notes | **partial→enforced** (suite) |

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

**Evaluation lock:** no universal winner — Projector4D for 4D story / explanation; drop_w for literal debug. Print SoT / Digital Printer untouched. Pattern: **experiment → provenance → contract → promotion** (contract §6; promotion remains **declared**).
