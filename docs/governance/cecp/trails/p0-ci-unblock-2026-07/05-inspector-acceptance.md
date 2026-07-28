# 05 — Inspector Acceptance

**Trail:** `p0-ci-unblock-2026-07`  
**Role:** Inspector  
**Date:** 2026-07-28  
**mode:** Sentinel  
**softwareCreationMode:** Testwright · Librarian  
**InspectorVerdict:** PASS_WITH_GAPS

## Acceptance matrix

| Criterion | Evidence | Result |
|-----------|----------|--------|
| Conformance 16/16 | `npm run test:conformance` | PASS |
| Package-types exit 0 | `node scripts/check-package-types.mjs` | PASS |
| Bloom BGL 0–3 | gpu-core bloomCombine test | PASS |
| Preview ESM dirname | construct smoke test | PASS |
| Governance suite | `npm run test:governance` 163/163 | PASS |
| Mandala linter | 0 errors | PASS |
| Drift radar | exit 0, fidelity partial | PASS (partial) |
| Security audit | exit 0; XSS skip honest | PASS_WITH_GAPS |

## Gaps

- Live WebGPU device validation of bloomCombine not run.
- Non-combine PostProcessor sampleType debt remains.
- Drift radar / mandala-lint are **partial** heuristics (Drive-G-1).

## Corpus / crew coverage note

Fourteen corpus agents exercised as lenses over these diffs (mapped through six operational roles). See scorecard in operator deliverable / `08-esfr-verdict.json`.
