# Screenshot gallery

Operator-generated PNG stills from the **CanvasRenderer** path.

## Generate

From repo root (requires `4d-renderer` native `canvas` install):

```bash
node examples/gallery/generate.mjs
```

Writes:

- `images/<surface>-wireframe.png`
- `images/<surface>-solid.png`
- `captions.json` — captions matching what was actually rendered

Surfaces: `tesseract`, `clifford-torus`, `hopf-surface`, `torus-3d`, `trefoil-4d`.

## Captions rule (Drive-G-1)

Only describe files present under `images/` after a successful generate run.
Do not invent hero screenshots or claim WebGPU / bloom / shadows for these stills.

## Optional object storage (declared)

Gallery PNGs can be uploaded to operator-configured Backblaze B2 via `@mrs/storage-b2`
(`uploadArtifactIfConfigured`). Not wired into `generate.mjs` by default.
See [`docs/ops/BACKBLAZE_B2_S3.md`](../../docs/ops/BACKBLAZE_B2_S3.md).

## Related

- Interactive: [`../web-demo.html`](../web-demo.html)
- CLI movies: `npm run render:4d -- --surface clifford-torus --frames 60`
