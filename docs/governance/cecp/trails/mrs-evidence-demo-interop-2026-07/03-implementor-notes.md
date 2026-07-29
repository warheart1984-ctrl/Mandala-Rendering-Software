# 03 — Implementor notes

**Date:** 2026-07-29  
**Status:** **partial** (demo **enforced**; multihost **partial**)

## Changes (this trail)

- Added `scripts/demo-evidence-pipeline.mjs` — full Node operator loop.
- Added `engine/governance/test/orchestrator.test.js` — CKL→GK→ExecutionOrchestrator→CSE.
- Added `npm run demo:evidence-pipeline`.
- Trail docs: DEMO, INTEROP_MATRIX, GAP_SCOREBOARD, ESFR.

## Related working-tree (bundled in commit)

- `engine-governance-audit-2026-07` trail + inventory
- `mrs-whole-gap-scan-2026-07` trail
- CSSV ledger split (`ledgerNode.js`, `ledgerPaths.js`, browser test)
- CKL H4 evalModifier / policies base URL tests
- ISL canonical fixtures + parity test
- injectable logger module + test
- transform.invariants.test.js

## Tests run (fill on commit)

```text
npm run demo:evidence-pipeline          → exit 0
node --test engine/governance/test/*.test.js → 174 pass
npm run test:conformance                → 16/16 COMPLIANT
```

## Gaps left

- GK does not invoke CSE inside `evaluateIntent` (by design freeze).
- C# ExecutionOrchestrator untested in CI.
- IDAC certification unchanged **false**.
