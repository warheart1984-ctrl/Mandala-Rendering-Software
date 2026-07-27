# ENGINE3D_FACE_BLENDER_EXPORT_PRESET_v1.0

Blender export guidance for `HumanFaceRigged.glb` and `HumanFaceNeutral.glb`.

| Field | Value |
|-------|--------|
| Version | 1.0 |
| Status | **Declared** (operator guidance). Not a checked-in `.blend` preset file |
| Related | [ENGINE3D_FACERIG_OPERATOR_GUIDE_v1.0](./ENGINE3D_FACERIG_OPERATOR_GUIDE_v1.0.md) · [ENGINE3D_FACE_RIG_SCHEMA_v1.0](./ENGINE3D_FACE_RIG_SCHEMA_v1.0.md) |

## Scene

- Apply scale (1.0).
- Face mesh named: `HumanFace`.
- Armature named: `Armature`.

## GLB Export Settings

- Format: glTF Binary (`.glb`)
- Include:
  - Selected Objects: Face mesh + Armature (rigged); mesh only for neutral.
  - Apply Modifiers: Enabled.
  - Shape Keys: Enabled (blendshapes).
  - Skinning: Enabled (bones) for the rigged export.
- Transform: `+Y Up` (glTF default). Match Engine3D / HumanRigLoader expectations; do not invent a second axis convention without updating loaders.
- Materials: Export materials and textures when authored (PBR maps remain **declared** in Engine3D face materials).

## Naming

Bones (required minimum):

`Head`, `Jaw`, `LeftEye`, `RightEye`, `LeftBrow`, `RightBrow`, `UpperLip`, `LowerLip`

Shape keys / blendshapes (required minimum):

`Smile`, `Frown`, `BlinkLeft`, `BlinkRight`, `Squint`, `WideEyes`, `MouthOpen`, `MouthNarrow`

## Export targets

| File | Contents |
|------|----------|
| `mrs/assets/human/HumanFaceRigged.glb` | Mesh + armature + shape keys |
| `mrs/assets/human/HumanFaceNeutral.glb` | Mesh only (neutral rest) |

## Validate after export

```bash
cd mrs/packages/engine3d-core
npm run build
npm run validate:face-glb -- ../../assets/human/HumanFaceRigged.glb
```

Exit 0 only when required bone and blendshape names are present. Triangle count is reported but does not fail validation.
