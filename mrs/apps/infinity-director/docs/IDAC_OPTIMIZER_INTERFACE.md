# IDAC Optimizer Interface

**Status:** **partial** — `app/idac/core/optimizer.py`

## Signature

```python
request_plan(
    intent: IntentContract,
    *,
    policy: dict | None,
    constitution: dict | None,
    environment: dict | None,
    settings: Settings,
    prepass_png: bytes | None = None,
) -> ExecutionPlan
```

## ExecutionPlan sub-plans

| Field | Content |
|-------|---------|
| `domain_plan` | DomainPlan — render: `render_plan`, `normalized_plan`, ATCM summary |
| `resource_plan` | ResourcePlan — Genblaze dispatch endpoint + payload |
| `risk_plan` | RiskPlan — PlanViolation, no silent fallback |
| `evidence_plan` | EvidencePlan — replay_record, dispatch_result |
| `plan_id` | Stable plan identifier |
| `environment_spec` | Non-secret environment keys |

## Optimizer rules

- **Must not execute** (`optimizer.must_not_execute == true`)
- Deterministic under identical inputs (**partial** — planner LLM path may vary)
- No plan without intent, policy trace, and evidence strategy declaration

## Rendering DomainPlan producer

`app/idac/domains/rendering/adapters.py` → `RenderOptimizerAdapter`

- Wraps **ATCM** (`plan_atcm`) and **RenderAccelContract** (`build_atcm_contract_bundle`, `derive_math_strategies`)
- Maps AcceleratedRenderer.request semantics to tile `RenderPlan` (metadata; full-frame dispatch)

## Non-render domains

`ai`, `compile` → **declared** stub ExecutionPlan (`enforcement: declared`).
