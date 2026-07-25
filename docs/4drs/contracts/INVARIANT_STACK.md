# 4DRS Invariant Stack (contracts index)

**Status (Drive-G-1):** package modules are **tested** / **declared** / **skeleton** per catalog. Soft CKL acceptance is **accepted** when used; opt-in enforce for required PI-* is **enforced** behind `enforcePhysicalInvariantConformance` — default renders are not denied.

**Implementation SoT:** [`mrs/packages/renderer-core/src/render/rt4d/invariants/`](../../../mrs/packages/renderer-core/src/render/rt4d/invariants/)
**Stack document:** [`STACK.md`](../../../mrs/packages/renderer-core/src/render/rt4d/invariants/STACK.md)

## Purpose

Formal layer between mathematical theory and 4DRS runtime:

```
Mathematical Theory → PI-* Constitutional Contracts
  → Runtime Guarantees → Native Evidence → Normalized Claims
  → ConformanceReport → CKL Acceptance (soft | opt-in enforce)
```

Math stays independent of host implementation. Different runtimes prove conformance against the **same PI IDs**; evidence schemas may differ. Cross-runtime: [`crossRuntime/CROSS_RUNTIME.md`](../../../mrs/packages/renderer-core/src/render/rt4d/invariants/crossRuntime/CROSS_RUNTIME.md). Contracts: [`CONSTITUTIONAL_CONTRACTS.md`](../../../mrs/packages/renderer-core/src/render/rt4d/invariants/crossRuntime/CONSTITUTIONAL_CONTRACTS.md).

## Distinction

| Lineage | IDs | Package |
|---------|-----|---------|
| 4DRS / RT4D math stack | PI-*, EI-*, M-* | `@mrs/renderer-core` `rt4d/invariants` |
| MRS Inspector Contract | MRS-IC 3.1–3.7 | `docs/4drs/contracts/MRS-IC-v1.2.md` |
| CROS creative render | CI-001..006 | `mrs/packages/cros/` |

Do **not** merge these into one compliance blob. Cross-reference only.

## Honest claim bound

- Foundational PI predicates: **tested** (unit tests).
- Selected engine predicates (projection fidelity, radiometric anchors, orthogonal length): **tested**.
- Replay determinism (full): **declared**; tiny CPU-ref hash is supporting only.
- Topology / BVH containment: **skeleton**.
- Cross-runtime PI-* (math host + Sovereign X host): **tested** (suite ConformanceReport).
- Soft CKL acceptance (`acceptConformanceReport`): **accepted** when used (attaches evidence; no deny).
- Opt-in enforce (`enforcePhysicalInvariantConformance`): **enforced** for required PI-* set only.
- EI-* CKL gating / deny-all default renders: **not claimed**.

Import:

```js
import {
  runInvariantConformanceSuite,
  listInvariantCatalog,
} from "@mrs/renderer-core/rt4d/invariants";
```
