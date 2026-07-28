# 05 — Inspector acceptance

**InspectorVerdict:** PASS_WITH_GAPS

Commands (expected):

```bash
npm test --prefix mrs/packages/sovereign-x-router
node --test sovereign-x/tests/gpuParitySuite.test.js
node sovereign-x/cli/sx-capabilities.js list
```

Boundary: GPU `asPrintSoT` denied; determinism → `cpu.rt4d.print`.
