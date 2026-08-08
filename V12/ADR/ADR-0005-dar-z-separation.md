# ADR-0005 — Darz Separation: Authority Plane vs. Execution Plane

- **Decision ID:** ADR-0005
- **Status:** accepted (enforced)
- **Date:** 2026-08-07T00:00:00Z
- **Author:** warheart1984-ctrl <warheart1984@gmail.com>

## Rationale

"Where did this architecture come from?" — and, critically, **who is
allowed to make it act**? The Darz review established that decision
authority and execution effect must live in separate planes. An actor on
the authority plane may *authorize*; an actor on the execution plane may
*act* — but neither may cross into the other without a registered
contract. This prevents implicit escalation and cross-layer mutation.

## Decision

1. **Authority plane:** `engine/governance/` (CKL, GovernanceKernel,
   DecisionEngine) and `src/` contracts — decide and authorize.
2. **Execution plane:** `mrs/packages/renderer-core/`, hosts, adapters —
   render and mutate.
3. No implicit escalation: an intent may not silently raise its own
   authority.
4. No cross-layer mutation: the execution plane may not bypass the
   governance plane to change state.
5. Authority is bounded by registered contracts / allow-lists
   (`policy-no-authority-without-contract`).

## Alternatives rejected

| Alternative | Why rejected |
|-------------|--------------|
| Single merged plane (authorize + act together) | Escalation surface; breaks accountability |
| Execution may self-authorize when trusted | Reintroduces the exact gap Darz closed |
| Planes separated only in browser runtime | Hosts must honor the same separation |

## Consequences

- Conformance checks `authority.chain-valid`,
  `governance.no-implicit-escalation`, and
  `execution.no-cross-layer-mutation` must keep passing.
- Cross-plane operations require an explicit contract in
  `engine/constitution/contracts.js`.

## Evidence

- **Commit:** `e92d0b1` (Darz reference audit); `59b1378` (Phase D+
  subsystem)
- **Test:** conformance 16/16, including
  `authority.chain-valid`, `governance.no-implicit-escalation`,
  `execution.no-cross-layer-mutation`
  (`V12/VALIDATION/conformance-results/conformance-run.txt`)
- **Artifact hash (SHA-256):**
  - `engine/governance/policies/default.policies.json`
    `10468D3E53C0E10E7C683F4619748E5CDF5BFA54A1517CD7CB165DB329E76796`
  - `engine/constitution/charter.js`
    `DCFBD18AC4D9673DEC971BCD19C5C4852F51B5E4A401A68C20B78C47DE2D452A`
- **Replay identity:** task records rejected/approved by the CRE retain
  replay identity via `verifyReplayToken` (see `REPLAY.md`)
