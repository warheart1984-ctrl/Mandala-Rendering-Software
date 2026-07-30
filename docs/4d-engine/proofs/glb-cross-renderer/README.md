# Proof: GLB cross-renderer reproducibility

| Field | Value |
|-------|-------|
| **Status** | **partial** (export **Held**; Cycles beauty **complete** with pixels on verified host) |
| **Date** | 2026-07-30 |
| **Working artifacts** | `tmp/glb-repro/` (full GLB + dual Cycles + hashes) |
| **Strategy** | `docs/4d-engine/PHOTOREAL_PROVIDER_STRATEGY.md` |

## Architecture statement

Constitutional pipeline owns **scene generation + provenance** → deterministic GLB.  
Blender/Cycles (or any other GLB consumer) owns **photoreal execution**.  
Same GLB + provenance = compatible execution target for any GLB-capable renderer.

```text
SceneSpecification + seed
        │
        ▼
  render-glb.mjs / glbExporter.js   ← constitutional (Held when verified)
        │
        ├── scene.glb          (byte-stable)
        └── provenance.json    (specHash, seed, counts, world id)
        │
        ▼
  Cycles / Godot / three.js / …   ← execution backends (pluggable)
```

## Evidence (2026-07-30 host)

| Item | Value |
|------|-------|
| `BLENDER_PATH` | `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe` |
| GLB SHA-256 | `3ebe5d8fc4ac41d7cdba80bb65994d8e2d164ae6defae2bf4bfd1ede7fefbf1e` |
| GLB bytes | `12622660` |
| Dual GLB | **byte-identical** |
| Provenance | structural match; timestamps differ |
| Cycles PNG **file** SHA | not bit-identical |
| Cycles **pixel** SHA | **identical** `8b5b3e3b…fc45` |
| Governed-render trail | `exportStatus: held`, `cyclesStatus: complete`, `pixelsProduced: true` |

See `hashes.json` in this folder and `tmp/glb-repro/hashes.json`.

Mirrored plates: `cycles-a.png`, `cycles-b.png`, `provenance.json` (GLB binary kept under `tmp/glb-repro/scene.glb` to avoid a second ~12 MB doc copy).

## How to add a second renderer

1. Load `tmp/glb-repro/scene.glb` (do not regenerate geometry unless re-proving export).
2. Render with documented fixed settings; write `renderer-a.png` / `renderer-b.png`.
3. Record file SHA-256 and decoded RGBA pixel SHA-256 in `hashes.json`.
4. Prefer pixel identity / RMSE over PNG container hashes.

Candidates (later, not claimed here): Godot glTF import, three.js / glTF-Transform viewers, other path tracers.
