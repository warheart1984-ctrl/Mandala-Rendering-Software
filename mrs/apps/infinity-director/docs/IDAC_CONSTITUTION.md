# IDAC v0.1 Constitution (Charter)

**Status:** **declared** as IDAC-local charter; **partial** alignment with MRS 4DCE/4DRS by reference only.  
**Enforcement in Infinity Director:** see `DIRECTOR_ENFORCEMENT` in `app/idac/core/constitution.py`.

## Article I — Purpose

IDAC governs **Intent → Plan → Execution → Evidence → Validation → Learning** as a domain-agnostic stack. Rendering (Infinity Director / ATCM / RenderAccel) is the first reference runtime.

**Director:** **partial** — stack wired in `app/idac/`; CKL does not load this charter.

## Article II — Supremacy

This IDAC Constitution supersedes Policy and Optimizer heuristics for the IDAC stack. Breach yields **PlanViolation** and halt — no silent fallback.

**Director:** **partial** — HTTP 422 RenderViolation / PlanViolation on some paths only.

## Article III — Mission

Mission is the highest **non-constitutional** authority. Intent must cite `mission_ref`.

**Director:** **partial** — `mission_ref` validated against mission registry in `app/idac/core/mission_registry.py`.

## Article IV — Policy

Policy may allocate resources, quality, fallback rules, safety, and risk — but Policy **may not**:

- execute work without Intent
- override constitutional invariants
- suppress Evidence
- modify ExecutionPlans mid-execution

Constitution overrides Policy when they conflict.

**Director:** **partial** — RenderAccelContract policyRef; no CKL binding.

## Article V — Intent

Intent is **normative** and **immutable once optimization begins**.

CIEMS **IntentContract** fields: `mission_ref`, `policy_ref`, `domain`, `goal`, `constraints`, `priority`, `risk_profile`.

**Director:** **partial** — validated in `IdacRouter.validate_intent`; `/api/direct` uses `DirectRequest` without full IntentContract.

## Article VI — Optimization

Optimization is **propositional** only: `request_plan(...) → ExecutionPlan`. Optimizer **must not execute**.

**Director:** **partial** — `app/idac/core/optimizer.py`; ATCM behind rendering adapter.

## Article VII — Execution

Execution is plan-faithful, emits Evidence, halts on violation, aims for deterministic replay under validated plans.

**Director:** **partial** — full-frame Genblaze dispatch; tile-faithful execution **declared** future.

## Article VIII — Evidence

Evidence is descriptive, replay-oriented, **immutable after validation** (spec). CIEMS **EvidenceContract**: `intent_ref`, `plan_ref`, `execution_trace`, `artifacts`, `environment`, `outcome`.

**Director:** **partial** — ReplayRecord skeleton; bit-identical replay **not measured**.

## Article IX — Validation

Validation is authoritative and final in spec; re-judges Intent ↔ Evidence.

**Director:** **partial** — `app/idac/core/validation.py`; 8 check types with pass/fail/verdict; bit-identical replay skipped (waiver W-BIT-IDENTICAL).

## Article X — Learning

Learning is post-constitutional; **must not mutate invariants**.

**Director:** **partial** — `app/idac/core/learning.py`; append-only JSONL store; invariant `no_learning_without_validated_evidence` enforced as gate prior to append.

## Six constitutional invariants

| Invariant | Director enforcement |
|-----------|---------------------|
| No execution without intent | **partial** |
| No optimization without constitutional constraints | **partial** |
| No execution without validated plan | **partial** |
| No result without replayable evidence | **partial** |
| No plan deviation without violation | **partial** |
| No learning without validated evidence | **partial** |

Machine-readable invariant ids (charter gate): `no_execution_without_intent`, `no_optimization_without_constitutional_constraints`, `no_execution_without_validated_plan`, `no_result_without_replayable_evidence`, `no_plan_deviation_without_violation`, `no_learning_without_validated_evidence`.
