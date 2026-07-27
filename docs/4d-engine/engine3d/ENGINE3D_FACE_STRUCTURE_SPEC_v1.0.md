# ENGINE3D_FACE_STRUCTURE_SPEC_v1.0

Governed face geometry for Engine3D portraits.

| Field | Value |
|-------|--------|
| Version | 1.0 |
| Status | **Declared** (normative). Fixture GLB + HumanRig deform path **prepared** |
| Domain | CIEMS → Engine3D Face Structure Layer |
| Related | [ENGINE3D_FACE_RIG_SCHEMA_v1.0](./ENGINE3D_FACE_RIG_SCHEMA_v1.0.md), [ENGINE3D_FACE_TIMELINE_SPEC_v1.0](./ENGINE3D_FACE_TIMELINE_SPEC_v1.0.md), [ENGINE3D_FACERIG_OPERATOR_GUIDE_v1.0](./ENGINE3D_FACERIG_OPERATOR_GUIDE_v1.0.md), [ENGINE3D_CONSTITUTIONAL_SUITE_v1.0](./ENGINE3D_CONSTITUTIONAL_SUITE_v1.0.md) |

## Constitutional laws

1. **Engine3D is the only source of face geometry.** Soft-raster / HumanRig mesh owns subject face topology.
2. **Face renders REQUIRE a face mesh or face rig** (operator GLB or in-repo fixture). Demo sphere-head is not a governed face.
3. **Polish may refine but MUST NOT rebuild faces.** Diffusion cleans texture/lighting over structure AOVs; it does not invent anatomy.
4. **RT4D MUST NEVER generate faces or anatomy.** RT4D remains background / lattice / mandala only.
5. **Expressions MUST be driven by rig + timeline** (bones / blendshapes), not by polish prompt alone.

## Pipeline

```
Face rig GLB (HumanFaceRigged.glb or fixture)
        │
        ▼
HumanRigLoader → deform (bones + morphs)
        │
        ▼
Engine3D soft-raster beauty / depth / normal
        │
        ├─ optional RT4D background (non-face)
        └─ optional polish (realism over structure)
```

## Asset paths

| Path | Role |
|------|------|
| `mrs/assets/human/HumanFaceNeutral.glb` | Neutral mesh (fixture or operator) |
| `mrs/assets/human/HumanFaceRigged.glb` | Rigged mesh + blendshapes (fixture or operator) |

In-repo GLBs are **fixtures** (low tris) unless replaced by operator production assets. See `mrs/assets/human/README.md` and [ENGINE3D_FACERIG_OPERATOR_GUIDE_v1.0](./ENGINE3D_FACERIG_OPERATOR_GUIDE_v1.0.md).

## Drive-G-1

Do not claim photoreal skin from soft-raster alone. Do not claim silhouette locking from polish prompts. Production 20k–40k topology is operator-supplied.
