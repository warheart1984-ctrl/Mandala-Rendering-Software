# Human face assets (Engine3D)

| File | Role | Status |
|------|------|--------|
| `HumanFaceNeutral.glb` | Neutral face mesh | **Fixture** in-repo (low tris) |
| `HumanFaceRigged.glb` | Bones + blendshapes | **Fixture** in-repo |

## Operator override (preferred)

Engine3D prefers operator drop-ins over these fixtures at runtime:

1. `${OPERATOR_ASSETS_ROOT}/human/HumanFaceRigged.glb` (default root: `./operator-assets` at **repo root**)
2. Fallback: this directory (`mrs/assets/human/`)

```bash
# From repo root — copies into operator-assets/human/ and validates rigged GLBs
npm run operator:face-install -- path/to/HumanFaceRigged.glb
npm run operator:face-install -- path/to/HumanFaceNeutral.glb
```

When an operator file is present, structure stills report `face_asset: "operator"`. Fixtures remain the canonical CI baseline. Do not commit production GLBs (`operator-assets/**/*.glb` is gitignored).

Full workflow: [ENGINE3D_FACERIG_OPERATOR_GUIDE_v1.0](../../../docs/4d-engine/engine3d/ENGINE3D_FACERIG_OPERATOR_GUIDE_v1.0.md) · [topology checklist](../../../docs/4d-engine/engine3d/ENGINE3D_FACE_TOPOLOGY_CHECKLIST_v1.0.md) · [Blender export preset](../../../docs/4d-engine/engine3d/ENGINE3D_FACE_BLENDER_EXPORT_PRESET_v1.0.md)

Validate a rigged GLB:

```bash
cd mrs/packages/engine3d-core
npm run validate:face-glb -- ../../assets/human/HumanFaceRigged.glb
```

## Constitutional

See [ENGINE3D_FACE_STRUCTURE_SPEC_v1.0](../../../docs/4d-engine/engine3d/ENGINE3D_FACE_STRUCTURE_SPEC_v1.0.md).

- Engine3D owns face geometry.
- In-repo GLBs are **fixtures** for CI/demos — not a 20k–40k production sculpt.
- Operators drop licensed production assets under `operator-assets/human/` (same filenames) without API changes.

## Regenerate fixtures

```bash
cd mrs/packages/engine3d-core
node scripts/build-face-fixture-glb.mjs
```

## Required bones / blendshapes

Bones: Head, Jaw, LeftEye, RightEye, LeftBrow, RightBrow, UpperLip, LowerLip  

Blendshapes: Smile, Frown, BlinkLeft, BlinkRight, Squint, WideEyes, MouthOpen, MouthNarrow
