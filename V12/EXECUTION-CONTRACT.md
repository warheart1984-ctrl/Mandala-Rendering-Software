# EXECUTION-CONTRACT.md — V12

> **Author:** warheart1984-ctrl
> **Updated:** 2026-08-07

## The execution contract

Execution is only permitted through the governed pipeline. An ungoverned
mutation is a violation of the charter, not a feature.

```
intent
  │  (P1: intent present)
  ▼
authority
  │  (P3: actor has registered contract / allow-list)
  ▼
timeline/world
  │  (I-4: play_timeline requires world)
  ▼
render
  │  (I-6: attach provenance)
  ▼
evidence record
```

## Phase D+ execution flow (CRE)

`ConstitutionalReasoningEngine.reason()` / `submitReasoningTask()` runs:

1. **Declare** — intent + inference declaration
2. **Validate** — mode thresholds (fast/deliberate/critical/audit)
3. **Blind-spot check** — evidence coverage, causal/dimensional/temporal,
   replay verifiability
4. **Execute** — inference record creation, continuity verification
5. **Review** — quality validators, constitutional frame record

A task that fails validation is rejected with the failure reason — it is
never silently degraded (lawbook R10).

## Rejection semantics

| Failure | Behaviour |
|---------|-----------|
| Confidence below mode threshold | task `failed`, reason recorded |
| Evidence strength below threshold | task `failed`, reason recorded |
| Blind spots (non-FAST modes) | task `failed` with blind-spot list |
| Replay token mismatch | task `failed` (`Replay verification failed`) |
| Continuity verification failure | task `failed` |

## Evidence

- CRE behavior: smoke tests (success + rejection paths) recorded in
  `V12/VALIDATION/test-results/`.
- Governance pipeline: `engine/governance/GovernanceKernel.js`,
  `engine/governance/ConstitutionalKnowledgeLayer.js`.
