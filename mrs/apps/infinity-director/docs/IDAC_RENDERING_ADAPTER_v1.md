# Domain Adapter Spec — Rendering v1.0

**Status:** **partial**

## Adapters

| Adapter | Module | Role |
|---------|--------|------|
| RenderIntent | `RenderIntentAdapter` | constraints from DirectRequest |
| RenderOptimizer | `RenderOptimizerAdapter` | ATCM + RenderPlan DomainPlan |
| RenderExecution | `RenderExecutor` | plan-faithful dispatch |
| RenderEvidence | `RenderEvidenceAdapter` | artifacts + ReplayRecord |
| RenderValidation | `RenderValidationAdapter` | complexity evidence check |

## Rendering invariants (spec vs Director)

| Invariant | Director |
|-----------|----------|
| No tile without complexity evidence | **partial** (ATCM path only) |
| No render without validated plan | **partial** |
| No plan deviation | **partial** (drift check) |
| No partial frames on violation | **declared** (HTTP error; no frame buffer) |
| Replayable | **partial** (skeleton ReplayRecord) |

## ATCM + math accelerators

Optimizer adapter calls:

- `validate_atcm_prerequisites`
- `plan_atcm`
- `build_atcm_contract_bundle`
- `derive_math_strategies` (metadata only — not per-tile Genblaze)

Work model label remains `estimate_not_measured` — no measured 2× claims.

## Integration map

| RenderAccel | IDAC |
|-------------|------|
| RenderPlan | `domain_plan.render_plan` |
| ComplexityEvidence | preview + post-run replay binding |
| ReplayRecord | `artifacts.replay_record` |
| RenderViolation | parallel HTTP detail; IDAC uses PlanViolation |
