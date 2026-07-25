# Cross-Runtime Conformance

**Package path:** `mrs/packages/renderer-core/src/render/rt4d/invariants/crossRuntime/`
**Parent stack:** [`../STACK.md`](../STACK.md)
**Contracts:** [`CONSTITUTIONAL_CONTRACTS.md`](./CONSTITUTIONAL_CONTRACTS.md)

## Contract vs evidence vs acceptance

| Layer | Role |
|-------|------|
| **PI-* Constitutional Contracts** | Shared IDs (`PI-GEO-LENGTH`, `PI-CALC-ENERGY`, `PI-TRIG-RADIAL` required) |
| **Runtime Guarantee** | How a host satisfies a contract |
| **Per-runtime evidence** | Native schemas stay different |
| **Normalized Claim** | Maps any supported evidence → shared verdict |
| **Conformance Report** | Independent verification vs PI-* contracts |
| **Acceptance Decision** | CKL soft attach / opt-in enforce |

```
Mathematical Theory
        → PI-* Constitutional Contracts
                → Runtime Guarantees
                        → Native Evidence
                                → Normalized Claims
                                        → ConformanceReport
                                                → CKL Acceptance
```

```
Invariant ID (Constitutional Contract)
        │
        ├── rt4d-math host  → 4drs.invariant.evidence.v1
        │                              │
        └── sovereignx host → sovereignx.physical-invariant.evidence.v1
                                       │
                                       ▼
                         normalize → ConformanceClaim
                         (4drs.cross-runtime.claim.v1)
                                       │
                                       ▼
                         ConformanceReport
                         (4drs.cross-runtime.conformance.v1)
                                       │
                                       ▼
                         acceptConformanceReport({ enforce? })
```

## Evidence schemas (not unified)

| Runtime | Native schema | Gate |
|---------|---------------|------|
| Math / 4DRS | `4drs.invariant.evidence.v1` | none |
| Sovereign X | `sovereignx.physical-invariant.evidence.v1` | `gate: false` unless accept path |

Do **not** claim a single evidence schema is enforced everywhere. The suite proves **shared IDs** through **normalized claims**.

## Host protocol

```js
{
  runtimeId: string,
  capabilities?: string[],          // invariant IDs this host can speak
  supports?(invariantId): boolean,
  provideEvidence(invariantId, measurements?) → native evidence | null
  // evaluate(invariantId, measurements?) is accepted as an alias
}
```

Missing capability → `unevaluated` (honest), not fail.

## Usage

```js
import {
  createMathHost,
  createSovereignXHost,
  runCrossRuntimeConformance,
  acceptConformanceReport,
} from "./index.js";

const report = runCrossRuntimeConformance({
  hosts: [createMathHost(), createSovereignXHost()],
});
// report.kind === "ConformanceReport"
// report.allRequiredPassed === true under known-good defaults

const soft = acceptConformanceReport(report); // attach, status accepted
const hard = acceptConformanceReport(report, {
  enforcePhysicalInvariantConformance: true,
}); // deny if required PI-* incomplete/failing
```

## Modules

| File | Role |
|------|------|
| `contract.js` | PI-* ConstitutionalContract catalog + required ID set |
| `evidenceNormalize.js` | Map native evidence → `ConformanceClaim` |
| `suite.js` | `runCrossRuntimeConformance` → `ConformanceReport` |
| `acceptance.js` | CKL-backed soft/enforce `acceptConformanceReport` |
| `policies/piConformancePolicies.js` | Additive PI policies (not default.policies.json) |
| `hosts/mathHost.js` | 4DRS predicate + evidence path |
| `hosts/sovereignXHost.js` | Sovereign X registration / evaluate path |
| `CONSTITUTIONAL_CONTRACTS.md` | Contract / guarantee / evidence / report / accept |
| `index.js` | Public exports |

## Tests

- `../test/crossRuntime.conformance.test.js`
- `../test/cklAcceptance.test.js`

## Status honesty

| Claim | Status |
|-------|--------|
| Shared PI-* IDs across math + Sovereign X | **tested** |
| Cross-runtime suite emits ConformanceReport + normalized claims | **tested** |
| Native schemas remain distinct | **tested** |
| Soft CKL acceptance attaches evidence | **accepted** (when `acceptConformanceReport` used) |
| Opt-in enforce deny on required PI-* fail | **enforced** (flag only) |
| EI-* / unified evidence schema / default deny-all renders | **not claimed** |

## Distinct from

- CROS CI-001..006 (`mrs/packages/cros/`) — separate lineage; do not merge compliance claims
- In-process `runInvariantConformanceSuite` — single-runtime 4DRS suite; this package is multi-host
