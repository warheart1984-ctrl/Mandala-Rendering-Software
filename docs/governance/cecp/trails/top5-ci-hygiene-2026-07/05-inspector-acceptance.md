# 05 — Inspector acceptance

**Trail:** `top5-ci-hygiene-2026-07`  
**Role:** Inspector  
**softwareCreationMode:** Testwright  
**Status:** **partial** (targeted gates green)

## Before (measured inventory)

| Suite | Exit | Pass | Fail |
|-------|------|------|------|
| conformance | 0 | 16/16 | 0 |
| governance | 0 | 166 | 0 |
| runtime-provenance | 0 | 28 | 0 |
| glb-importer | 0 | 34 | 0 |
| triangle-mesh | 0 | 15 | 0 |
| gpu-core | 0 | 68 | 0 |
| 4d-renderer smoke | 0 | ok | 0 |
| package-types | 0 | ok | 0 |
| engine3d-core | **1** | 62 | **7** (+ TS build errors) |

Node-test subtotal then: **383** tests counted across suites with `ℹ tests`, of which **7** failing in engine3d (+ build blocked).

Note: cited “~68 failures” matches **gpu-core’s 68 tests** (all passing) more than a failure count; engine3d was the remaining fail cluster.

## After

| Suite | Exit | Pass | Fail |
|-------|------|------|------|
| conformance | 0 | **16/16** | 0 |
| release:check | 0 | aligned | 0 |
| engine3d-core | **0** | **68** | **0** (3 skipped) |
| glb / triangle / gpu (spot) | 0 | unchanged green | 0 |

## Acceptance checklist

1. [x] conformance 16/16  
2. [x] engine3d build-before-test green  
3. [x] GLB / addTriangleMesh path green  
4. [x] 4d-renderer shim smoke green  
5. [x] tooling SoT under pack  
6. [x] `.cursor/` ignored / untracked  
7. [x] `npm run release:check`  
8. [x] no commit/push  

**Inspector verdict:** **PASS_WITH_GAPS** — gaps = no single 968 aggregator script; optional full smoke wall-clock.
