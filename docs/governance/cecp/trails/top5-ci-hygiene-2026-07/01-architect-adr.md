# 01 — Architect ADR: Top-5 CI Hygiene

**Trail:** `top5-ci-hygiene-2026-07`  
**Role:** Architect  
**Date:** 2026-07-28  
**actorMode:** Navigator  
**mode:** Warrior  
**softwareCreationMode:** Pipeline-Conductor  
**Status:** **declared** plan → **partial** as gates land

## 1. Intent

Close five operator-blocking hygiene items without charter stomps or commits:

1. Unlock pre-existing test failures (engine3d build-before-test, conformance stubFetch, 4d-renderer path honesty, Scene4D `addTriangleMesh`).
2. Canonicalize overlapping tooling (lint / agent roots / drift-radar) under `mandala-agent-pack/`.
3. Ensure CI compiles TypeScript before engine3d tests.
4. Stop tracking `.cursor/`; pack remains shared SoT for agents/skills.
5. Document release versioning + `npm run release:check` (mismatch fails; charter sync explicit).

## 2. ADR decision

### Context

Sibling trails (`p0-ci-unblock-2026-07`, `e2e-close-gaps-2026-07`, `protected-promote-2026-07`) already landed parts of (1). This trail verifies and finishes remaining hygiene without reverting sibling README/charter honesty edits.

### Decision

| # | Decision |
|---|----------|
| 1 | Treat `@mrs/renderer-core` as math/render SoT; keep `4d-renderer/` as re-export shim (no fake package). |
| 2 | `Scene4D.addTriangleMesh` lives in `mrs/packages/renderer-core/src/render/rt4d/scene/Scene4D.js`. |
| 3 | Conformance stubFetch uses `fileURLToPath(new URL(href))` (P0) — verify 16/16. |
| 4 | engine3d: `npm run build` (`tsc`) before `node --test dist/...` in package scripts + CI. |
| 5 | Tooling SoT = `mandala-agent-pack/{lint,drift-radar,auto-fix}`; delete or thin-wrap legacy `scripts/mandala-lint` + `mandala-agent/`. |
| 6 | `.gitignore` already ignores `.cursor/`; keep index untracked (`git rm --cached`); document regenerate-from-pack. |
| 7 | `release.json` is product version SoT for bump scripts; `release:check` compares package.json + release.json + charter version and **fails on mismatch**; charter edits only via explicit `--sync-charter` (never silent). |

### Alternatives rejected

| Option | Why rejected |
|--------|--------------|
| Invent stub `4d-renderer` source tree | Dishonest; shim already re-exports core |
| Auto-edit `charter.js` on every bump without flag | Protected path; needs care |
| Keep dual drift-radar roots | Drift / CI confusion |
| Commit `.cursor/` exceptions | User prefers local IDE config untracked |

## 3. Interface specification

- Inputs: Node 20+/22 CI; existing npm scripts; pack tooling.
- Outputs: green targeted suites; CI YAML with TS build; `docs/governance/RELEASE_VERSIONING.md`; `npm run release:check`.
- Bans: no commit/push; no unprotected revert of sibling README/charter; no secret material.

## 4. Constitutional boundary

- In-scope: scripts, workflows, pack docs, renderer-core Scene4D (if gap), CECP trail, release check.
- Out-of-scope: protected charter/policy edits (sibling-owned unless mismatch check only reads).
- Protected paths: **read-only** this trail.

## 5. File manifest

| Path | Action | Owner |
|------|--------|-------|
| `.github/workflows/ci.yml` | verify/modify build-before-test | Implementor |
| `.github/workflows/mandala-agent-ci.yml` | pack paths + engine3d build if needed | Implementor |
| `mandala-agent-pack/ci/mandala-agent-ci.yml` | align to pack paths | Implementor |
| `mandala-agent-pack/README.md` | SoT paths + `.cursor` regenerate | Implementor |
| `docs/governance/cecp/MANDALA_SIX_AGENTS.md` | update tool paths | Implementor |
| `scripts/release-check.mjs` | create | Implementor |
| `scripts/release-version.mjs` | sanitize (no auto-commit; optional charter) | Implementor |
| `docs/governance/RELEASE_VERSIONING.md` | create | Implementor |
| `package.json` | `release:check` script | Implementor |
| `README.md` | surgical `.cursor` / pack SoT note | Implementor |
| `docs/governance/cecp/trails/top5-ci-hygiene-2026-07/*` | trail | Foreman |

## 6. Acceptance criteria

1. `npm run test:conformance` → 16/16.
2. engine3d tests run only after `tsc` (script + CI).
3. GLB importer / bridge suites green (`addTriangleMesh` path).
4. `npm run test:4d-renderer` (shim) green.
5. Single lint/radar SoT under pack; refs updated.
6. `.cursor/` ignored + not re-added to index.
7. `npm run release:check` exits 0 when versions align; fails on deliberate mismatch.
8. No commit/push from this agent.

## 7. Handoff to Builder

Scaffold: release-check script shape; pack README sections; thin deprecated wrappers optional; CI step order Forge-mode.
