# Scene presets (declared format)

JSON files mirror `createScene(options)` fields from
`4d-renderer/src/pipeline/scene.js`.

**Status:** declared preset format — there is no separate runtime scene-file
loader claimed. Use by reading JSON and passing into `createScene`, or by
translating keys to CLI flags (`--surface`, `--profile`, `--mode`, …).

| File | Surface | Mode |
| --- | --- | --- |
| `tesseract-technical.json` | tesseract | wireframe |
| `clifford-cinematic.json` | clifford-torus | solid |
| `hopf-both.json` | hopf-surface | both |
