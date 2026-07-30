# Governed render — one-command MVP (2026-07)

| Field | Value |
|-------|-------|
| `trailId` | `governed-render-one-command-2026-07` |
| `feature` | One prompt → governed Engine3D soft still + verification trail |
| `started` | 2026-07-30 |
| `overallStatus` | **partial** |
| `protocol` | `docs/governance/CECP_OMEGA_PROTOCOL.md` |
| `qualityLog` | `docs/4d-engine/QUALITY_PROGRESS_LOG.md` |

## Invoke

```bash
npm run mrs:governed-render -- --prompt "dim room soft light, human at table"
npm run mrs:governed-render -- --prompt "dim room soft light" --beauty remote
npm run mrs:governed-render -- --prompt "dim room soft light" --beauty external-pbr
```

| Artifact | Path |
|----------|------|
| Still | `tmp/governed-render/fc03ea56fbc2f394/still.png` |
| Trail | `tmp/governed-render/fc03ea56fbc2f394/verification-trail.json` |
| beautySha256 | `80487831ec44cebcbb474a5affad2c54cf315f80b671dd0f42270b5234024ae8` |
| Provider | `engine3d.soft` |
| Rerun | same `runId` + same hash (verified 2026-07-30) |

## Honesty

- Pixels: **Engine3D soft-raster** (not photoreal, not SDXL)
- Lemonade: **held** (`pixelsProduced: false` as production claim)
- CL-Gen / `opencl.gen`: optional assist; does not block this MVP
- Optional beauty: `--beauty remote` → `photoreal.remote.diffusion` (deferred stub if URL unset)
- Optional beauty: `--beauty external-pbr` → `photoreal.external.pbr` (GLB export Held; Cycles deferred without Blender — no fake beauty PNG)
- Strategy: `docs/4d-engine/PHOTOREAL_PROVIDER_STRATEGY.md`
- ESFR framing: **PASS_WITH_GAPS**

## Stages

- [x] `01-architect-adr.md`
- [x] `02-builder-scaffold-manifest.md`
- [x] `03-implementor-notes.md`
- [x] `04-reviewer-conformance.md`
- [x] `05-inspector-acceptance.md`
- [x] `06-engineer-standards.md`
