# CECP Trail — Prompt→Scene Docker Wiring

| Field | Value |
|-------|-------|
| `trailId` | `prompt-scene-docker-2026-07` |
| `feature` | Bundle prompt-scene-bridge into Genblaze repo-root Docker `/app` layout |
| `started` | 2026-07-27 |
| `lineage` | Architecture → Build → Implementation → Review → Inspection → Acceptance |
| `overallStatus` | **pass_with_gaps** (unit/ban green after lattice fix; Docker daemon / live Render gaps) |
| `protocol` | `docs/governance/CECP_OMEGA_PROTOCOL.md` |
| `predecessor` | `engine3d-expand-2026-07` (expand CLI + Genblaze opt-in; Docker gap for bridge) |

## Stages

| # | File | Role |
|---|------|------|
| 01 | `01-architect-adr.md` | Architect |
| 02 | `02-builder-scaffold-manifest.md` | Builder |
| 03 | `03-implementor-notes.md` | Implementor |
| 04 | `04-reviewer-conformance.md` | Reviewer |
| 05 | `05-inspector-acceptance.md` | Inspector |
| — | `lineage.json` | Machine-readable summary |

## Boundary

- Repo-root `Dockerfile` only (app-local Genblaze Dockerfile cannot reach adapters).
- No Infinity / `story_forge` in Genblaze `app/*.py`.
- No protected governance edits. Expand remains opt-in (`PROMPT_SCENE_EXPAND_WORLD` default off).
- Rebase onto origin; no force-push; no push in this trail.
- Leave unrelated dirty working-tree files out of commits.
