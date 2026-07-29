# IDAC Router Specification (Sovereign X Router)

**Status:** **partial** — `app/idac/core/router.py` (`IdacRouter`, `handle_intent`).

## Authorization

Only the Router may **initiate** governed execution in the IDAC model.

## Responsibilities

1. Intent validation (`mission_ref`, `policy_ref`, goal justification)
2. Policy binding (trace object; CKL **not** wired)
3. Optimizer invoke (`request_plan`)
4. Plan validation (`intent_ref`, `must_not_execute`)
5. Dispatch via domain runtime (`RenderExecutor`)
6. Evidence collection
7. Validation invoke
8. Recordkeeping (returns intent/plan/evidence bundle)

## Router invariants

| Invariant | Director |
|-----------|----------|
| Must not execute optimization work itself | **partial** |
| Must not modify plans after validation | **partial** (drift check in executor) |
| Must not suppress evidence | **partial** |
| Halt on constitutional breach | **partial** (PlanViolationError) |

## HTTP mapping

| Entry | Behavior |
|-------|----------|
| `POST /api/direct` + explicit ATCM or `idac=true` | `IdacRouter.handle_intent` via `app/idac_direct_bridge.py`; `DirectResponse.idac` bundle |
| `POST /api/idac/intent` | Full `IntentContract` → router bundle |
| `POST /api/direct` + auto/fast/beauty | Legacy `build_plan` + dispatch (no IDAC bundle) |
| `POST /api/atcm/plan` | AcceleratedRenderer plan-only |

```text
/api/direct (ATCM/IDAC)     IdacRouter (reference)
──────────────────────      ──────────────────────
DirectRequest               IntentContract (synthesized)
handle_intent               request_plan + RenderExecutor
DirectResponse + idac{}     intent/plan/evidence/validation
```
