# Human face assets (Engine3D)

| File | Role | Status |
|------|------|--------|
| `HumanFaceNeutral.glb` | Neutral face mesh | **Fixture** in-repo (low tris) |
| `HumanFaceRigged.glb` | Bones + blendshapes | **Fixture** in-repo (CI baseline) |
| `HumanFaceRiggedProd.glb` | Higher-detail fixture (ellipsoid head, eye spheres, mouth, FACS) | **Fixture** in-repo (~752 KB, ~10k tris) — Genblaze face pipeline **default**; **not** Full Photoreal |
| `biometric-profiles.json` | Lawful proportion / scale-class ranges | **partial** |
| `schemas/biometric-profile.schema.json` | JSON Schema for profiles | **partial** |

## Biometric profiles (Gap-3 patch)

Profiles declare limb-ratio, curvature, and mass-distribution **ranges** plus
scale classes (`human-sized`, `canine-scale`, `toy-scale`, …). Engine3D loads
them via `loadBiometricCatalog()` / `inheritMetricsFromContext()`.

Drive-G-1: this is **not** full constitutional biometric enforcement and not
PKI. Face-only fixtures cannot supply true limb metrics — validators skip or
explicitly report `limb-metrics-unavailable`.

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
node scripts/build-prod-face-fixture.mjs   # → HumanFaceRiggedProd.glb
npm run validate:face-glb -- ../../assets/human/HumanFaceRiggedProd.glb
```

## Required bones / blendshapes

Bones: Head, Jaw, LeftEye, RightEye, LeftBrow, RightBrow, UpperLip, LowerLip  

Blendshapes: Smile, Frown, BlinkLeft, BlinkRight, Squint, WideEyes, MouthOpen, MouthNarrow

## Production GLB Pipeline (partial)

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `scripts/build-prod-face-fixture.mjs` | In-repo higher-detail face fixture | (procedural) | `HumanFaceRiggedProd.glb` |
| `scripts/blender_face_rig_setup.py` | Build full rig in Blender | `.blend` with sculpt | `HumanFaceRigged.glb` (bones, blendshapes, skin, UVs, materials) |
| `scripts/validate-face-glb.mjs` | Validate against spec | `*.glb` | JSON report (bones, blendshapes, skin, materials, UVs) |

**Usage (Blender):**
```bash
# Inside Blender Python env (run from Blender):
blender -b character.blend -P mrs/packages/engine3d-core/scripts/blender_face_rig_setup.py -- --output HumanFaceRigged.glb
```

**Usage (Validator):**
```bash
cd mrs/packages/engine3d-core
node scripts/validate-face-glb.mjs HumanFaceRigged.glb
```

The validator checks:
- 9 required bones (Head, Jaw, Left/Right Eye/Brow, Upper/Lower Lip)
- 8 required blendshapes (Smile, Frown, Blink L/R, Squint, WideEyes, MouthOpen/Narrow)
- Skin (joints, weights, inverse bind matrices)
- Materials (face_skin, eyes, mouth)
- UVs (TEXCOORD_0)
- Skinning attributes (JOINTS_0, WEIGHTS_0)
