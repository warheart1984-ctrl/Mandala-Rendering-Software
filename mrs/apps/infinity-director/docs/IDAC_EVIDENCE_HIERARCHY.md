# IDAC Evidence Hierarchy

**Status:** **enforced** (agent/process norm in Infinity Director) · **partial** (not all gates automated)

Maturity for IDAC is judged by **evidence class**, not by new spec prose or concept count. Drive-G-1 applies: a claim must cite the strongest evidence class that actually supports it.

## Five evidence kinds

| Class | What counts | What does **not** count |
|-------|-------------|-------------------------|
| **Implementation Evidence** | Code paths, JSON schemas, wire types, interfaces with matching shapes in repo | README-only APIs; `NotImplementedError`; undeployed stubs |
| **Verification Evidence** | Automated unit/integration tests that exercise the claimed behavior (pytest, schema checks) | Manual “it worked once”; tests that only assert constants |
| **Operational Evidence** | Route gates, health probes, live E2E on canonical ports, deploy smoke | TestClient-only paths labeled as production-ready |
| **Performance Evidence** | Measured wall-clock, throughput, resource use, **reproducible** benchmarks with environment recorded | `estimate_not_measured`; work-unit models; marketing speedup ratios |
| **Conformance Evidence** | Contract/spec rows satisfied with linked tests or CI rows; plan-faithful execution proofs | Policy JSON without runtime gate; “aligns with spec” without test id |

## Precedence (for maturity claims)

When classes conflict, the **weakest** class bounds the claim:

```text
Implementation < Verification < Operational < Conformance < Performance
```

(Performance does not override missing Conformance for “certified runtime”; certification requires Conformance + agreed Performance bar.)

## IDAC-specific rules

- **ATCM `work_model.label = estimate_not_measured`** → may support **Implementation** (planner exists) and **Verification** (plan shape tests) only — **not** Performance Evidence.
- **`IdacRouter` on `/api/direct`** → **Operational Evidence** when route gate + live E2E pass on `:8791` (see trail cycles).
- **Validation/Learning `status: partial|skeleton`** → **Implementation Evidence** only until Verification rows cover authoritative verdict semantics.
- **CKL / charter load** → requires **Conformance Evidence** (runtime loads + deny test), not constitution markdown alone.

## Agent / crew citation

Every maturity or “ready” statement must name:

1. Evidence class(es) cited  
2. Artifact paths (code, test, command, trail row)  
3. Status tag: `declared` | `partial` | `enforced`

During **IDAC Core freeze** (v0.1): prefer **implement + verify** over new articles. Amendments → `docs/IDAC_CORE_FREEZE.md`.

## Related

- `docs/IDAC_CORE_FREEZE.md`
- `docs/IDAC_IMPLEMENTATION_ROADMAP.md`
- `docs/IDAC_CONFORMANCE_SUITE.md`
- `docs/governance/cecp/trails/idac-stack-2026-07/`
