# math4d — 4D math / camera / slice / BSDF / animation

Clean API surface over existing renderer-core SoT. **Do not invent a parallel math stack.**

Import: `@mrs/renderer-core/math4d`

## Status (honest tags)

| Spec item | SoT / facade | Status |
|-----------|--------------|--------|
| Vec4 | `src/math/vec4.js` | **enforced** |
| Mat4x4 / SO(4) | `src/math/so4.js` | **enforced** |
| Rot4 (6 planes) | `math4d/rot4.js` → `buildSO4` | **enforced** |
| Quat4 (left+right) | `math4d/quat4.js` | **partial** (apply/toMat; factorization declared) |
| Quat exp / log / SLERP | `quatExp` / `quatLog` / `quatSlerp` | **enforced** |
| Quat4 pair SLERP | `quat4Slerp` / `quat4SlerpMat` | **partial** |
| Bivec6 packing exp/log | `bivecExp` / `bivecLog` | **partial** (documented packing, not Cartan) |
| SO(4) `slerpSO4` | `so4.js` skew+Taylor | **partial** (prefer Quat4 when available) |
| Hyperplane + signedDistance | `src/math/hyperplane.js` | **enforced** |
| intersectSegment | `hyperplane.js` | **enforced** |
| clipTriangle (0–2 tris) | `src/math/clip.js` | **enforced** |
| Projection → basis (e1,e2,e3) | `math4d/projection.js` | **enforced** |
| Camera4D fused project | `src/camera/Camera4D.js` | **enforced** / FOV map **partial** |
| Pipeline 1 World \(x\in\mathbb{R}^4\) | vec4 / Rot4 | **enforced** |
| Pipeline 2 Camera \(x_c=R(x-C)\) | `toCameraSpace` | **enforced** |
| Pipeline 3 Hyperplane slice | `sliceTo3D` + `clipTriangle` | **enforced** |
| Pipeline 4 Clip \(p=P_{3D}\cdot x_{3D}\) | `toClipSpace` / `perspectiveP3D` | **enforced** |
| Pipeline 5 NDC \(\div w\) | `clipToNdc` | **enforced** |
| Pipeline 6 Screen | `ndcToScreen` viewport; raster/shade/post | **partial** / raster **declared** |
| Math-first contract \(I=\mathcal{R}(\Pi_{3\to2}[\Pi_{4\to3}(R_4 X)])\) | `contract.js` / `evaluateMathContract` | **enforced** (JS/CPU); \(\mathcal{R}\) **declared** |
| Rosetta (shared chamber state; not Π identity) | `rosetta.js` / chamber `rosetta.mjs` | **partial** |
| Layer 1 mathematical | composition + SO(4) + slice + clip/NDC | **enforced** |
| Layer 2 numerical | Float64 JS/CPU; no backend parity suite | **partial** |
| Layer 3 physical | projection ≠ validated 4D physics | **declared** |
| Holographic ρ / h_ij recorder | not this package | **declared** |
| Slice modes static/orbit/slide | `math4d/slice.js` + Camera4D | **enforced** |
| BSDF (Lambert/GGX) | `rt4d/material/bsdf4d.js`, `ggx4d.js` | **enforced** (BRDF `3ρ/(4π)`, pdf `3cosθ/(4π)`) |
| Phase color f(xw) | `phaseAlbedo` / `phaseAlbedoFromPosition` | **partial** (albedo only) |
| 4D anisotropy hint | `anisotropy4dHint` | **partial** (tangent stub) |
| Hyper-volume density | `hyperVolumeDensity` | **declared** |
| Track4 keyframes | `math4d/track4.js` | **partial** (Quat4 SLERP when `qL`/`qR` set) |
| Temporal extrusion | `temporal-extrusion.js` | **partial** (`extrudeBetween` + `sliceExtrudedAtW`) |
| Temporal remeshing | `TEMPORAL_REMESHING_STATUS` | **declared** |
| Debug visualizer | `tools/math4d-debug/index.html` | **partial** |
| Pipeline diagram | repo `docs/math4d/PIPELINE.md` | **enforced** (docs) |

## Tests

```bash
cd mrs/packages/renderer-core
npm run test:math4d
node src/render/rt4d/test/normalization.test.js
```

## Related

- Pipeline diagram (canonical): [`../../../../../docs/math4d/PIPELINE.md`](../../../../../docs/math4d/PIPELINE.md)
- Math-first contract: [`../../../../../docs/math4d/CONTRACT.md`](../../../../../docs/math4d/CONTRACT.md)
- Compose / compiler / Rosetta: [`../../../../../docs/math4d/ROSETTA.md`](../../../../../docs/math4d/ROSETTA.md)
- Package copy: [`docs/math4d/PIPELINE.md`](../../docs/math4d/PIPELINE.md)
- Infographic: [`../../../../../docs/assets/math4d-4d-holographic-rendering-pipeline.png`](../../../../../docs/assets/math4d-4d-holographic-rendering-pipeline.png)
- Debug viewer: [`tools/math4d-debug/index.html`](../../tools/math4d-debug/index.html)
