# ENGINE3D_FACE_RIG_SCHEMA_v1.0

Face rig configuration and per-frame pose contracts.

| Field | Value |
|-------|--------|
| Version | 1.0 |
| Status | **Declared**; TypeScript types + HumanRig adapter **prepared** |
| Package | `@mrs/engine3d-core` `src/face/` |
| Related | [ENGINE3D_FACE_STRUCTURE_SPEC_v1.0](./ENGINE3D_FACE_STRUCTURE_SPEC_v1.0.md) |

## Required bones (minimum)

`Head`, `Jaw`, `LeftEye`, `RightEye`, `LeftBrow`, `RightBrow`, `UpperLip`, `LowerLip`

## Required blendshapes (minimum)

`Smile`, `Frown`, `BlinkLeft`, `BlinkRight`, `Squint`, `WideEyes`, `MouthOpen`, `MouthNarrow`

## FaceRigConfig

```ts
interface FaceRigConfig {
  meshPath: string;       // e.g. mrs/assets/human/HumanFaceRigged.glb
  armatureName: string;   // e.g. "Armature"
  blendshapes: string[];
  requiredBones?: string[];
  strict?: boolean;       // reject missing bone/blendshape names
}
```

## FacePoseFrame

```ts
interface FaceExpression {
  name: string;
  weight: number; // 0.0–1.0
}

interface FacePoseFrame {
  time: number;
  bones: Record<string, number[]>; // bone local transform (16 floats mat4 or translation)
  expressions: FaceExpression[];
}
```

## Structure record evidence (still path)

When a face GLB is used for `renderEngine3dStill`, the structure record keeps boolean `face_rig` / `face_asset` and may include optional nested evidence (**prepared**):

```ts
face_rig_detail?: {
  mesh_path: string;
  armature_name: string;
  bones: string[];
  blendshapes: string[];
  asset_kind?: "fixture" | "operator";
}
face_pose?: {
  time: number;
  bones: Record<string, number[]>;
  expressions: { name: string; weight: number }[];
}
```

For stills without a timeline pose, `face_pose` is typically neutral (`time: 0`, empty bones/expressions). See [ENGINE3D_FACERIG_OPERATOR_GUIDE_v1.0](./ENGINE3D_FACERIG_OPERATOR_GUIDE_v1.0.md).

## Validate GLB

```bash
cd mrs/packages/engine3d-core
npm run validate:face-glb -- <path/to/HumanFaceRigged.glb>
```

Uses `loadFaceRig` / `validateFaceRig` against real GLB bytes (no `.meta.json` sidecar).

## Invariants

- No topology changes at runtime (indices immutable).
- Morph targets apply as position deltas only.
- Bone motion uses HumanRig skinning (`deformHumanRig`).
- Materials `face_skin` / `eye` / `mouth` map to soft-raster baseColor roles; full PBR maps are **declared**.
