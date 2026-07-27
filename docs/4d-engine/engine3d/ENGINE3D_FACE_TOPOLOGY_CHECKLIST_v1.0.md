# ENGINE3D_FACE_TOPOLOGY_CHECKLIST_v1.0

Operator checklist for production face topology destined for `HumanFaceNeutral.glb` / `HumanFaceRigged.glb`.

| Field | Value |
|-------|--------|
| Version | 1.0 |
| Status | **Declared** (guidance). Not enforced by CI — fixtures remain low-tris |
| Related | [ENGINE3D_FACERIG_OPERATOR_GUIDE_v1.0](./ENGINE3D_FACERIG_OPERATOR_GUIDE_v1.0.md) · [ENGINE3D_FACE_STRUCTURE_SPEC_v1.0](./ENGINE3D_FACE_STRUCTURE_SPEC_v1.0.md) |

> In-repo fixtures do **not** meet this budget. Polygon count is never a test failure criterion.

## Polygon Budget

- Target: 20,000–40,000 triangles.
- Even distribution across the face; no dense spikes.

## Edge Flow

Clean loops around:

- Eyes (upper/lower lids).
- Mouth (lips).
- Nose bridge and nostrils.
- Jawline and chin.

No random poles in high-deformation areas.

## Deformation Zones

| Zone | Expectation |
|------|-------------|
| Eyelids | Enough loops for blinking / squinting |
| Mouth | Loops for smile, frown, open/close |
| Cheeks | Support subtle micro-expressions |
| Brow | Support frown / surprise |

## UVs

- Single, non-overlapping UV island for the face (preferred for skin maps).
- Sufficient texel density for pores and skin detail when materials are authored.

## Rig Compatibility

- Neutral pose (no expression baked into rest mesh).
- Symmetric topology.
- No non-manifold geometry.
- Bone and blendshape names match [ENGINE3D_FACE_RIG_SCHEMA_v1.0](./ENGINE3D_FACE_RIG_SCHEMA_v1.0.md).
