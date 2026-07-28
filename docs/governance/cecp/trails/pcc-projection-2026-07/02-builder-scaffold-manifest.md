# 02 — Builder scaffold manifest

| Field | Value |
| --- | --- |
| `softwareCreationMode` | Blueprint + Modularist |
| Status | **partial** (scaffolds filled by Implementor) |

## Scaffold created

```text
docs/4d-engine/projection/
  PROJECTION_CONTINUITY_CONTRACT.md
  PROJECTION_CONTINUITY_DIAGRAM.md
  INTEGRATION_NOTES.md

mrs/packages/renderer-core/src/render/rt4d/projection/
  ProjectionState.js
  continuityMath.js
  ProjectionKernel.js
  pccInvariants.js
  ObservationModePresets.js
  ApertureFrame3D.js
  HyperCausticLensVerifier.js
  pathTracerHooks.js
  index.js

mrs/packages/renderer-core/src/render/rt4d/test/
  projection.continuity.test.js
  projection.invariants.test.js
  projection.lens.northstar.test.js
```

## Package export

- `package.json` → `./rt4d/projection`
- `rt4d/index.js` re-exports
- script `test:projection`

## Handoff to Implementor

Fill continuous math aligned with `projector.js`; wire verifier to
`createHyperCausticLens`; keep status tags honest.
