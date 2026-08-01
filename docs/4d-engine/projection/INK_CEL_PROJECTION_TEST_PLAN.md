# Full Ink-Cel Projection Test Plan (v1)

| Field | Value |
| --- | --- |
| Status | **declared** until Engine3D ink-cel available |
| Rubric | also in [`PROMOTION_GATE.v1.md`](./PROMOTION_GATE.v1.md) |
| Soft-raster today | **partial** fallback plates only |

## Goal

Validate `projector4d-sot` and `drop_w` under full ink-cel rendering, not just soft-raster fallback.

## Test Inputs

- Scene-rich hit set (≥200 hits)
- Mixed \(w\)-spread (positive, negative, near-pole)
- Multiple camera depths (\(d_4 \in \{2, 4, 8\}\))

## Test Outputs

Ink-cel plates:

- `projector4d-sot`
- `drop_w`
- hybrid (optional — Option D future)

Provenance:

- `projector_id`
- `reference_model`
- \(d_4\)
- `lane`
- `asset_sha256`

## Evaluation Criteria

See Promotion Gate ink-cel rubric:

1. Silhouette coherence
2. Foreshortening readability
3. Depth cue stability
4. Stroke behavior
5. Viewer comprehension
6. Replay determinism

## Stress Conditions

- near-pole hits
- high-variance \(w\)
- mixed geometry (curves, surfaces, clusters)

## Promotion Gate

Ink-cel test must **PASS** before `projector4d-sot` can be promoted as default anime-structure projector.
