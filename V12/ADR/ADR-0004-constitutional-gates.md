# ADR-0004 — Constitutional Gates Before Execution

- **Decision ID:** ADR-0004
- **Status:** accepted (enforced)
- **Date:** 2026-08-07T00:00:00Z
- **Author:** warheart1984-ctrl <warheart1984@gmail.com>

## Rationale

Execution must be gated by the charter before any state or render
occurs. The 7 policies in `default.policies.json` define these gates;
the CKL/GovernanceKernel pipeline evaluates intent against them, and the
16-check conformance profile verifies the browser runtime honors them.

## Decision

1. Gate order: intent → authority → timeline/world → render → evidence.
2. Critical/high policies **block**; medium policies may modify params
   (`ascension-drift-throttle`).
3. `play_timeline` without a world id is denied.
4. Mythar Ascension requires dual evidence.
5. Every render carries provenance.

## Alternatives rejected

| Alternative | Why rejected |
|-------------|--------------|
| Gate only at authority, allow render after | Leaves unprovenanced renders and world-less plays |
| Log-and-continue for critical policies | Violates lawbook R10 (constitution wins) |
| Skip conformance in non-browser hosts | Runtime must be verifiable everywhere |

## Consequences

- Conformance must stay 16/16 before any commit touching governance.
- Policy changes require explicit authorization (protected paths).

## Evidence

- **Commit:** `59b1378`
- **Test:** `npm run test:conformance` — 16/16
  (`V12/VALIDATION/conformance-results/conformance-run.txt`)
- **Artifact hash (SHA-256):**
  - `engine/governance/policies/default.policies.json`
    `10468D3E53C0E10E7C683F4619748E5CDF5BFA54A1517CD7CB165DB329E76796`
  - `engine/conformance/default.conformance-profile.json`
    `A6B617E8D4918CCF0A13429939CC5292F5DD4DA1A64FC5B4535ACFD4F6A7849E`
  - `engine/constitution/charter.js`
    `DCFBD18AC4D9673DEC971BCD19C5C4852F51B5E4A401A68C20B78C47DE2D452A`
- **Replay identity:** conformance run captured under
  `V12/VALIDATION/conformance-results/`
