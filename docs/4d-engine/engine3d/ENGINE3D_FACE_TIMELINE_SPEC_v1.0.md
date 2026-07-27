# ENGINE3D_FACE_TIMELINE_SPEC_v1.0

Timeline tracks for face bones and blendshapes.

| Field | Value |
|-------|--------|
| Version | 1.0 |
| Status | **Declared**; track targets **prepared** in engine3d-core timeline |
| Related | [ENGINE3D_CINEMATIC_FOUNDATION_v1.0](./ENGINE3D_CINEMATIC_FOUNDATION_v1.0.md), [ENGINE3D_FACE_RIG_SCHEMA_v1.0](./ENGINE3D_FACE_RIG_SCHEMA_v1.0.md) |

## Track targets

| `target` | `property` | Value |
|----------|------------|-------|
| `face_bone` | bone name (`Head`, `Jaw`, …) | vec3 translation or quat4 / mat4-compatible |
| `face_blendshape` | morph name (`Smile`, `BlinkLeft`, …) | float weight 0–1 |

## Interpolation

- Blendshape weights: `step` / `linear` / `cubic` (deterministic).
- Bone rotations: prefer `spherical` when quat4; else linear on components.
- Evaluation at time `t` MUST be replayable given identical timeline.

## Example

```
t=0.0  Smile=0, Squint=0
t=0.5  Smile=0.35
t=1.0  Smile=0.7, Squint=0.4
```

Sampled into `FacePoseFrame` then applied via `applyFacePose` before soft-raster.
