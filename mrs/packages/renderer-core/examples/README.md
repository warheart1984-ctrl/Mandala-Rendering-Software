# FrameLoop example (Phase C skeleton)

> **Status:** **skeleton** (Drive-G-1). Browser-oriented; not a production demo.

```bash
cd mrs/packages/renderer-core
node examples/frame-loop-boot.js
```

- `sample-world.json` has `wave.enabled: false` by default.  
- `FrameLoop.start()` no-ops in Node (no `requestAnimationFrame`). Call `tick()` manually.  
- Wave fields are **local CPU sketches** — do not demo via B2.
