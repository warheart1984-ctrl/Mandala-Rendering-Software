# Scene presets (declared format)

JSON files mirror `createScene(options)` fields from
`mrs/packages/renderer-core/src/pipeline/scene.js`.

**Status:** declared preset format — there is no separate runtime scene-file
loader claimed. Use by reading JSON and passing into `createScene`, or by
translating keys to CLI flags (`--surface`, `--profile`, `--mode`, …).

| File | Surface | Mode |
| --- | --- | --- |
| `tesseract-technical.json` | tesseract | wireframe |
| `clifford-cinematic.json` | clifford-torus | solid |
| `hopf-both.json` | hopf-surface | both |
| `world-document-v1-example.json` | WorldDocument v1 (**declared**) | validate: `npm run validate:world-document` |

World Format / PLP: [`docs/4d-engine/v1/`](../../docs/4d-engine/v1/README.md).  
`world-document-v1-example.json` is **not** a `createScene()` preset — it validates against WorldDocument.v1 schema.
