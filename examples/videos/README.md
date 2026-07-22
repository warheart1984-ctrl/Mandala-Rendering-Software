# Video demonstrations (scaffold)

No binary videos are committed in this repository.

## Generate with the existing movie pipeline

From repo root (Node `canvas` + optional FFmpeg on `PATH`):

```bash
npm run render:4d -- --surface tesseract --frames 60 --fps 30 --mode wireframe --width 960 --height 540 --output output/videos/tesseract
npm run render:4d -- --surface clifford-torus --frames 90 --fps 30 --mode solid --profile cinematic --width 960 --height 540 --output output/videos/clifford
```

- PNG sequence is always produced when the CLI render succeeds.
- MP4 encoding runs **only if FFmpeg is available**; otherwise the pipeline
  reports a non-fatal encode skip (see `4d-renderer` README).

## Browser WebM

Governed host `js/export.js` records WebM via `MediaRecorder` when you press
**Make movie** on `http://localhost:8080/` (`npm start`). That path is separate
from this scaffold folder.

## Status

| Claim | Status |
| --- | --- |
| Committed MP4/WebM under `examples/videos/` | **Not present** |
| Operator can generate via CLI | **Documented** |
| Live hosted video URL | **Not claimed** |
