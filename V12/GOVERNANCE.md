# GOVERNANCE.md — V12

> **Author:** warheart1984-ctrl
> **Updated:** 2026-08-07

## Governance pipeline

`engine/governance/` implements the decision pipeline:

1. **ConstitutionalKnowledgeLayer (CKL)** — loads `default.policies.json`,
   evaluates intent against policy actions.
2. **GovernanceKernel** — decides on intent + evidence, records decisions.
3. **DecisionEngine** — derives decisions from intents.

## The 7 policies

| Policy | Scope | Severity | Effect |
|--------|-------|----------|--------|
| no-execution-without-intent | runtime | critical | BLOCKED if intent null |
| no-state-change-without-evidence | state | high | BLOCKED if no evidence |
| no-render-without-provenance | render | high | attach provenance |
| no-authority-without-contract | authority | critical | BLOCKED if no contract |
| play-timeline-requires-world | timeline | critical | BLOCKED if no world |
| ascension-drift-throttle | render | medium | modify_param on drift > 0.7 |
| ascension-evidence | runtime | critical | BLOCKED if dual evidence missing |

## Conformance profile

`default.conformance-profile.json` — 16 checks across provenance, replay,
binding, timeline, evidence, ckl, authority, governance, execution,
normalization. All 16 pass:

- `V12/VALIDATION/conformance-results/conformance-run.txt`

## Governance scope vs. src/

- `engine/` is the **runtime** SoT for browser hosts.
- `src/` is the **Phase D+ subsystem** (contracts + reasoning), tested
  independently by the constitution suite (98/98).
- Both are governed by the same charter. `ADR-0005` documents the
  authority/execution separation.

## Evidence

- Conformance run: 16/16 (captured 2026-08-07)
- Policy source: `engine/governance/policies/default.policies.json`
  SHA-256 `10468D3E53C0E10E…`
