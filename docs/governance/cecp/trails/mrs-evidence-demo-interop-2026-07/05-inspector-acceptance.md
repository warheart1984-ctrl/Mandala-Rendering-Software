# 05 — Inspector acceptance

**Date:** 2026-07-29  
**Verdict:** **ACCEPT_WITH_GAPS**

| Claim | Evidence | Result |
|-------|----------|--------|
| Demo script exists | `scripts/demo-evidence-pipeline.mjs` | PASS |
| Orchestrator CKL→CSE | `engine/governance/test/orchestrator.test.js` | PASS |
| 16/16 conformance | `npm run test:conformance` → COMPLIANT | PASS |
| IDAC certified | `IDAC_CERTIFICATION_CHECKLIST.md` | **NOT CLAIMED** |
| GPU print SoT | demo uses cpu.rt4d only | PASS |

Probes:

```bash
npm run demo:evidence-pipeline
npm run test:governance
npm run test:conformance
```

Artifact: `artifacts/sample-evidence-package.json` must contain `sanitized: true` and no secrets.
