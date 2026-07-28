# CECP Trail — Engine3D WorldDocument Expand

| Field | Value |
|-------|-------|
| `trailId` | `engine3d-expand-2026-07` |
| `feature` | Prompt→Scene generator stub → full Engine3DWorldDocument expand (Node OOP) |
| `started` | 2026-07-27 |
| `lineage` | Architecture → Build → Implementation → Review → Inspection → Acceptance |
| `overallStatus` | **enforced** (expand path; unexpanded stub remains **partial**) |
| `protocol` | `docs/governance/CECP_OMEGA_PROTOCOL.md` |
| `predecessor` | `prompt-scene-adapter-2026-07` (PASS_WITH_GAPS on empty world arrays / identity expand) |

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

- MRS execution side only; Infinity / StoryForge remain out-of-process (no `story_forge` in Genblaze `app/*.py`).
- Expand uses `engine3d-core` `createWorldGenerator` + `generateWorldFromGenerator` via Node subprocess.
