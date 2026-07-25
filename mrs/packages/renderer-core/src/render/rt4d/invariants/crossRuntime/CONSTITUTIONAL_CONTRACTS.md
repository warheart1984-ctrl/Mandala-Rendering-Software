# Constitutional Contracts (PI-*)

**Package path:** `mrs/packages/renderer-core/src/render/rt4d/invariants/crossRuntime/`
**Parent stack:** [`../STACK.md`](../STACK.md)
**Related:** [`CROSS_RUNTIME.md`](./CROSS_RUNTIME.md)

## Distinction

| Layer | Meaning |
|-------|---------|
| **PI-*** | **Constitutional Contract** — implementation-independent; hosts do not redefine IDs |
| **Runtime Guarantee** | How a specific host satisfies a PI-* contract |
| **Evidence Record** | Host-native proof that the guarantee was met |
| **Normalized Claim** | Common envelope (`4drs.cross-runtime.claim.v1`) after normalize |
| **Conformance Report** | Independent verification that claims satisfy cited PI-* contracts |
| **Acceptance Decision** | CKL soft attach / opt-in enforce over a ConformanceReport |

## Chain

```
Mathematical Theory
  → PI-* Constitutional Contracts
    → Runtime Guarantees
      → Native Evidence
        → Normalized Claims
          → Cross-Runtime Conformance (ConformanceReport)
            → CKL Acceptance (soft | enforce)
```

## Required contractual set

Only these IDs are in the acceptance gate’s required set:

- `PI-GEO-LENGTH`
- `PI-CALC-ENERGY`
- `PI-TRIG-RADIAL`

**EI-*** remain optional / host-advertised. This gate does **not** claim EI-* enforcement.

## Soft vs enforce

| Mode | Flag | Behavior | Status tag |
|------|------|----------|------------|
| Soft (default) | omit / `false` | Verify report; **attach** acceptance evidence; never deny | **accepted** |
| Enforce | `enforcePhysicalInvariantConformance: true` | **Deny** if any required PI-* claim ≠ `pass` | **enforced** (opt-in) |

Suite-only normalize (no acceptance call) remains **tested**.

## API

```js
import {
  createMathHost,
  createSovereignXHost,
  runCrossRuntimeConformance,
  acceptConformanceReport,
  attachAcceptanceToDecision,
} from "./index.js";

const report = runCrossRuntimeConformance({
  hosts: [createMathHost(), createSovereignXHost()],
});
// report.kind === "ConformanceReport"
// report.independentVerification.verifiedContractIds …

const soft = acceptConformanceReport(report);
// soft.ok === true, soft.verdict === "attach", soft.status === "accepted"

const hard = acceptConformanceReport(report, {
  enforcePhysicalInvariantConformance: true,
});
// hard.status === "enforced" when ok; deny if required PI-* incomplete/failing
```

Sovereign X route (opt-in, least blast radius):

```js
await routeSovereignXRenderer({
  …,
  acceptPhysicalInvariantConformance: true, // soft attach
  // enforcePhysicalInvariantConformance: true, // deny on fail
  // conformanceReport, // or supply a prebuilt report
});
```

## CKL wiring

- Package-local policies: `policies/piConformancePolicies.js` (additive; **not** in `default.policies.json` by default).
- Engine `resolveDecision` understands `physical_invariant_conformance_report` when those policies are merged.
- `acceptConformanceReport({ resolveDecision, ckl, kernel })` hooks CKL / GovernanceKernel without overnight deny on every render.

## Honest limits

- Soft path does not block demos.
- Enforce is opt-in only.
- Does not unify native evidence schemas.
- Does not enforce EI-* or CROS CI-*.
- `Date` / wall-clock not used in acceptance IDs (P4).
