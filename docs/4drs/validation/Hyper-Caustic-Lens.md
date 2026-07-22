# Hyper-Caustic Lens — official validation scene (v1.0)

**Status:** official / frozen baseline for **4D Rendering System v1.0**  
**Factory:** `createHyperCausticLens` in `4d-renderer/src/render/rt4d/scene/TestHyperCausticLens.js`  
**Baseline manifest:** [`baseline.json`](./baseline.json)  
**Rendered artifacts:** [`artifacts/`](./artifacts/)

## Scene contents (as implemented)

1. Refractive **hypersphere** lens (GGX material `hyperlens_inner`) at origin  
2. Lambertian **hyperplane** back wall  
3. Emissive **hypersphere** area light offset in \(w\)  
4. **ExponentialFog** volume with HG phase  
5. **Camera4D** looking at origin with multi-axis FOV  

## Frozen baseline settings

See `baseline.json`. Do not change factory defaults or baseline render options without bumping the validation scene version and regenerating hashes.

## How to regenerate

```bash
node scripts/render-hyper-caustic-baseline.mjs
```

Writes PNG/PPM under `docs/4drs/validation/artifacts/` and refreshes checksums in `baseline.json` when `--write-hashes` is passed.

## Cross-links

- Spec: [`../SPEC-v1.0.md`](../SPEC-v1.0.md)  
- Architecture: [`../ARCHITECTURE.md`](../ARCHITECTURE.md)  
- Technical note: [`../First-4D-Renderer.md`](../First-4D-Renderer.md)  
- API freeze: [`../api/rt4d-v1.0-freeze.md`](../api/rt4d-v1.0-freeze.md)  
- Code: `4d-renderer/src/render/rt4d/`  
