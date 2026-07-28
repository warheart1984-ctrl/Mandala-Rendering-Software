# 03 — Implementor notes

**Trail:** `top5-ci-hygiene-2026-07`  
**Role:** Implementor  
**softwareCreationMode:** Constructor + Forge + Debugger  
**Status:** **partial** → gates verified locally

## Intent

Land Top-5 hygiene without protected-path stomps or commits.

## Changes landed

| Area | Evidence |
|------|----------|
| Conformance stubFetch | Already P0-fixed; re-verified **16/16** |
| `Scene4D.addTriangleMesh` | Present in renderer-core; GLB importer **34/34** |
| `4d-renderer/` | Compatibility shim re-exports `@mrs/renderer-core` (honest) |
| engine3d TS build | `npm run test:engine3d` includes `tsc`; CI uses same |
| engine3d API gaps | `addLatticeMaterials`, UV sphere `uvs`, mandala lattice world, `oriented_capsule` adapter, texture bind in soft-raster |
| Tooling SoT | Pack lint/radar/auto-fix; thin `scripts/mandala-lint/run.mjs` redirect |
| `.cursor/` | Already gitignored; index already untracked; pack docs for regenerate |
| Versioning | `scripts/release-check.mjs`, sanitized `release-version.mjs`, `RELEASE_VERSIONING.md` |
| CI | `ci.yml` + `mandala-agent-ci.yml` build-before-test + `release:check` |

## Tests run

See inventory / after counts in `05-inspector-acceptance.md`.

## Protected paths

Not edited this trail (sibling trails own charter honesty).
