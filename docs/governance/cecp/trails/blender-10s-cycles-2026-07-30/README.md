# Blender ~10s Cycles smoke (2026-07-30)

| Field | Value |
|-------|-------|
| `trailId` | `blender-10s-cycles-2026-07-30` |
| `feature` | Short-budget Blender Cycles beauty smoke via CLI + governed-render external-pbr |
| `requestedBy` | User (MRS crew cycle) |
| `started` | 2026-07-30 |
| `overallStatus` | **partial** |
| `mode` / `lens` | Pipeline-Conductor + Artisan (smoke foreman) |
| `protocol` | `docs/governance/CECP_OMEGA_PROTOCOL.md` |

**Related:** `photoreal-provider-strategy-2026-07`, Quality Log Cycles Held entry same day.

## Headline artifacts

| Kind | Path | Notes |
|------|------|-------|
| Fast Cycles PNG | `tmp/blender-10s-test/cycles-beauty-64x64-s8.png` | 64² / 8 samples / **~7.05s** wall |
| Mid Cycles PNG | `tmp/blender-10s-test/cycles-beauty-128x128-s16.png` | 128² / 16 samples / **~25.2s** wall |
| Governed beauty | `tmp/blender-10s-test/governed-render/587f836fc789a003/beauty-cycles.png` | full pipeline **~34.4s** wall |
| Layout still | `…/587f836fc789a003/still.png` | engine3d.soft (not photoreal) |
| GLB (reuse) | `tmp/glb-repro/scene.glb` | Held export; same SHA as prior proof |

## Stages

- [x] `01-architect-adr.md`
- [x] `02-builder-scaffold-manifest.md`
- [x] `03-implementor-notes.md`
- [x] `04-reviewer-conformance.md`
- [x] `05-inspector-acceptance.md`
- [x] `06-engineer-standards.md`

## Crew ESFR (headline)

| Gate | Verdict |
|------|---------|
| Inspector | **PASS_WITH_GAPS** |
| ESFR | **PASS_WITH_GAPS** |
| PromotionEligibility | **PROMOTE_WITH_GAPS** |

Gaps: CPU-only Cycles (OptiX/HIP unavailable); smoke resolution only; photoreal quality remains **partial**; Lemonade held; OpenCL assist failed (non-blocking).
