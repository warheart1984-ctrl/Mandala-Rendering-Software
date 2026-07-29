# IDAC stack pointer (Mandala crew)

**Status:** partial reference in Infinity Director

## Crew lens

- **Intent** is the pivot between should and did.
- **Optimizer** proposes `ExecutionPlan` only — never executes.
- **Router** is the sole execution initiator in the IDAC model.
- **Runtime** must be plan-faithful; breach → PlanViolation, not best-effort fallback.

## SoT

- Index: `mrs/apps/infinity-director/docs/IDAC_STACK.md`
- Constitution: `IDAC_CONSTITUTION.md`
- Formal spec + diagrams: `IDAC_FORMAL_SPEC.md`
- **Evidence hierarchy:** `IDAC_EVIDENCE_HIERARCHY.md`
- **Core freeze:** `docs/IDAC_CORE_FREEZE.md` (repo root)
- **Roadmap:** `docs/IDAC_IMPLEMENTATION_ROADMAP.md`
- **Ops / route gate:** `docs/IDAC_OPS.md`

## Maturity rule (freeze v0.1)

Cite **evidence class** (Implementation / Verification / Operational / Performance / Conformance) on every claim. **No new core concepts** without amendment per freeze doc. Prefer implement + verify over new articles.

## Rendering first

ATCM + RenderAccel sit **below** IDAC as rendering DomainPlan producers; see `IDAC_RENDERING_ADAPTER_v1.md`.

## HTTP (Director)

- `POST /api/direct` with `speed_profile=atcm` | `atcm=true` | `idac=true` → `IdacRouter.handle_intent` (response field `idac`)
- `POST /api/idac/intent` — IntentContract wire
- auto | fast | beauty on `/api/direct` — legacy planner path (no IDAC bundle)

## CECP

`docs/governance/cecp/trails/idac-stack-2026-07/` — PROMOTE_WITH_GAPS
