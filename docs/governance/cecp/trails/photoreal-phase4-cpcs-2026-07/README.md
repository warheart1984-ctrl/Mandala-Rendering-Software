# Trail: photoreal-phase4-cpcs-2026-07

| Field | Value |
|-------|-------|
| `trailId` | `photoreal-phase4-cpcs-2026-07` |
| `feature` | Phase 4 CPCS / RCS / PGDS photoreal certification suite |
| `started` | 2026-07-30 |
| `overallStatus` | **partial** (specs declared; evaluator/suite/dashboard partial; **not** Phase 4 Full Photoreal certified) |
| `protocol` | `docs/governance/CECP_OMEGA_PROTOCOL.md` |
| `lens` | Sage + Warrior (honesty + ship gate) |
| `prior` | `photoreal-phase3-fpec-2026-07` · `photoreal-promotion-2026-07-30` |

## Decision (evidence-bound)

- CPCS wired into promote after FPEC + CAT; writes `cpcs.json`.
- Run `587f836fc789a003`: expect **`certified: false`**, `certificationLevel: NONE`.
- Do **not** claim `PHASE_4_FULL_PHOTOREAL` until all CPCS gates pass.

## Stage files

- [01-architect-adr.md](./01-architect-adr.md)
- [05-inspector-acceptance.md](./05-inspector-acceptance.md)

## Related

- Specs: `docs/4d-engine/evidence/CPCS_v1.md`, `RCS_v1.md`, `PGDS_v1.md`
- Schema: `schemas/ciems/cpcs-v1.json`
- Code: `evaluateCertification.js`, `conformanceSuite.js`, `dashboardServer.js`
- CLI: `mrs:photoreal-certify`, `mrs:photoreal-rcs`, `mrs:photoreal-dashboard`
