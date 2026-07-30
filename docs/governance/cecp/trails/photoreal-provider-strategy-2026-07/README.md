# Photoreal provider strategy — CECP note (2026-07)

| Field | Value |
|-------|-------|
| `trailId` | `photoreal-provider-strategy-2026-07` |
| `feature` | Honest photoreal paths + CCC / governed-render beauty footing |
| `started` | 2026-07-30 |
| `updated` | 2026-07-30 (Blender Cycles complete + GLB cross-renderer proof) |
| `overallStatus` | **partial** |
| `protocol` | `docs/governance/CECP_OMEGA_PROTOCOL.md` |
| `strategy` | `docs/4d-engine/PHOTOREAL_PROVIDER_STRATEGY.md` |
| `ccc` | `docs/4d-engine/CCC_IMAGE_GEN.md` · `ccc-image-gen.json` |
| `qualityLog` | `docs/4d-engine/QUALITY_PROGRESS_LOG.md` |
| `proof` | `docs/4d-engine/proofs/glb-cross-renderer/` · `tmp/glb-repro/` |

## Decision (evidence-bound)

True *diffusion* photoreal on R9 380 **will not land locally**. Three paths:

1. **Hybrid** — Engine3D/CL-Gen layout → `photoreal.remote.diffusion` beauty (**declared**/stub without URL)
2. **Hardware** — Lemonade on capable GPU (`pixelsProduced: true`) under one-command (**held**)
3. **External PBR** — `photoreal.external.pbr`: SceneSpecification → GLB (**Held**) → Blender Cycles beauty when Blender available (**complete** on verified host)

### Verification 2026-07-30 (this host — post Blender install)

| Gate | Result |
|------|--------|
| Files exist (`glbExporter.js`, `render-glb.mjs`, Cycles scripts) | **pass** |
| Valid GLB import in Blender 5.2 | **pass** |
| Dual export same seed → identical GLB SHA-256 | **pass** — `3ebe5d8fc4ac41d7cdba80bb65994d8e2d164ae6defae2bf4bfd1ede7fefbf1e` (12 622 660 bytes) |
| `BLENDER_PATH` | **pass** — `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe` |
| Dual Cycles same settings | PNG **file** hashes differ; **pixel** SHA identical |
| `photoreal.external.pbr` + `--beauty external-pbr` | **pass** — trail `exportStatus: held`, `cyclesStatus: complete`, `pixelsProduced: true` |
| Governed run | `tmp/governed-render-external-pbr-cycles/9de3536aacc4f922/` |

## Honesty

- Layout pixels remain `engine3d.soft` / `opencl.gen`
- Lemonade **held**
- GLB export **Held**; Cycles **complete** with verified PNG when Blender present
- `photorealClaim: true` only when Cycles (or verified remote beauty) writes real PNG bytes
- Overall status remains **partial** (not production-certified; second renderer not yet proved)

## Related

- Parent MVP: `docs/governance/cecp/trails/governed-render-one-command-2026-07/`
- One-command: `npm run mrs:governed-render -- --prompt "…" --beauty external-pbr`
- Cross-renderer proof: `docs/4d-engine/proofs/glb-cross-renderer/`
