# 02 — Builder Scaffold Manifest

| Field | Value |
|-------|-------|
| `trailId` | `rt4d-governed-spacetime-lab-2026-08` |
| `role` | Builder Sage |
| `mode` | `sage` |
| `lens` | Blueprint + Modularist + Monk + Inventor |
| `actorMode` | Catalyst + Frontier |
| `softwareCreationMode` | Blueprint + Forge + Sandbox + Versioneer + Dependency-Monk |
| `status` | **partial** (scaffolds filled by Implementor same run) |

## Scaffold created

| Path | Kind | Stub honesty |
|------|------|--------------|
| `…/rt4d/metric/*` | modules | Euclidean/Minkowski filled; `CurvedMetricField` skeleton throws |
| `…/rt4d/modes/*` | modules | enum + meta |
| `…/rt4d/temporal/*` | modules | ops + envelope + lineage |
| `…/rt4d/semantics/*` | modules | thin Event/Worldline |
| `…/schemas/rt4d/temporal-evidence-envelope.schema.json` | schema | Phase-1 |
| `…/rt4d/test/{metric.minkowski,lorentz.boost,temporal.envelope}.test.js` | tests | acceptance-named |
| package exports + `test:spacetime-lab` | wiring | additive |

## Dependency graph note

- Depends on existing `vec4` + `Transform4D` (read-only reuse)
- No new npm deps
- Does not import Genblaze / CIEMS

## Handoff

Implementor filled logic in-session; curved metric remains skeleton.
