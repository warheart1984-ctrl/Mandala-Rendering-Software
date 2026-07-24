# WorldDocument v2 — Constitutional World Format

> **Status:** **declared / Phase C** (Drive-G-1). Schema exists; full runtime loaders not claimed.  
> Machine schema: [`schemas/world-document-v2.json`](../../../schemas/world-document-v2.json)  
> PLP: [`PLP-v2.md`](./PLP-v2.md) · Math: [`../rt4d/RT4D_V2_MATH_NOTES.md`](../rt4d/RT4D_V2_MATH_NOTES.md)

## Top-level structure (declared)

```json
{
  "version": "2.0",
  "metadata": {},
  "lineage": {},
  "geometry": {},
  "materials": {},
  "curvature": {},
  "physics": {},
  "wave": {},
  "render": {},
  "rhi": {}
}
```

### `wave` (optional)

| Field | Intent |
| --- | --- |
| `enabled` | When true, PLP wave rules apply |
| `gridSize` | `{ nx, ny, nz }` positive integers |
| `c`, `dt` | Wave speed / time step (> 0) |
| `beta`, `gamma` | Curvature / force coupling |
| `waveDir` | `{ x, y, z }` non-zero when enabled |
| `initialState` | Optional seed ψ |

**Local CPU/GPU sketch only — not B2.** Demo day should not burn Class C traffic to “show” waves.

Required schema fields: `version`, `metadata`, `lineage`, `geometry`, `materials`, `render`.

## Non-claims

- [ ] Full PLP enforcement beyond minimal PlpValidator skeleton  
- [ ] Multi-GPU wave tiling implemented  
- [ ] Wave fields via B2  
