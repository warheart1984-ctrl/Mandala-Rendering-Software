# Inspector acceptance — Phase 4 CPCS

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | CPCS schema + evaluator exist | PASS | `schemas/ciems/cpcs-v1.json`, `evaluateCertification.js` |
| 2 | Promote writes `cpcs.json` | PASS | pipeline layer 8.5 |
| 3 | Certify CLI | PASS | `npm run mrs:photoreal-certify` |
| 4 | Known run not certified | PASS (expected) | `587f836fc789a003` → `certified: false` |
| 5 | No false PHASE_4 claim | PASS | `certificationLevel: NONE` when not certified |
| 6 | RCS summary honest PARTIAL | PASS | stubs + real run |
| 7 | PGDS `/api/runs` | PASS | `dashboardServer.js` Node http |
| 8 | Tests cover evaluateCertification | PASS | `photorealEvidence.test.js` |
