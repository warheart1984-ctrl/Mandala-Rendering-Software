# ADR-0002 — Execution Substrate: Plain-JS ESM, No Build Step

- **Decision ID:** ADR-0002
- **Status:** accepted (enforced)
- **Date:** 2026-08-07T00:00:00Z
- **Author:** warheart1984-ctrl <warheart1984@gmail.com>

## Rationale

The Phase D+ constitutional subsystem (`src/`) must be directly loadable
and testable under Node without a transpilation step. The prior files
were TypeScript-annotated JavaScript that failed to parse
(`SyntaxError`, `ERR_MODULE_NOT_FOUND`), referenced interface exports that
did not exist, and contained duplicated method/validator definitions.
The substrate is therefore **plain JavaScript (ESM)** with `node:crypto`
hashing and no build step, keeping contracts machine-readable and
importable by browser hosts, tests, and the reasoning engine alike.

## Decision

1. All `src/` modules are plain-JS ESM.
2. No TS annotations, no `: Type` signatures, no `.ts` build inputs.
3. Type-shape contracts live in record construction + schemas, not in a
   type system.
4. Validation is exercised by runtime tests, not a compiler.

## Alternatives rejected

| Alternative | Why rejected |
|-------------|--------------|
| TypeScript source + build step | Adds toolchain; broke direct Node execution; import errors |
| JSDoc-typed .mjs only | Marginal benefit; not enforced |
| Port contracts to C# substrate | Hosts are skeletons; adds cross-language sync burden |

## Consequences

- `node --check` is the syntax gate.
- The 98/98 test suite is the type/shape gate.
- `engine/` C# remains the runtime SoT for non-JS hosts (unrelated).

## Evidence

- **Commit:** `59b1378` — 13 files, 5115 insertions
- **Test:** constitution suite 98/98; `node --check` clean on all modules
- **Artifact hash (SHA-256):**
  - `ConstitutionalInferenceContract.js`
    `4C27E29402167DDAB7679EFE152A1EE05CC889C46695A6040DBB9926E3695B4F`
  - `ConstitutionalContinuityContract.js`
    `4416F3A3CA039CF5B163C354340AEFD815AF59E2E46D3A638D8A6CB2C97F9E90`
  - `IntentLifecycleContract.js`
    `BFBB2F04CC2DFC0593BA4364597BC5AB7633AAD7E9347A7BCBAFB6073767B58E`
  - `ConstitutionalEvidenceRoot.js`
    `800BFAE7CC7B5B609EC70F1BB62EF3EB0961C0F9B049E5CE6FD8D06B9BE6826A`
  - `ConstitutionalReasoningEngine.js`
    `7D3C84062AEAE1350A5A6AB7AE63D09AA31FA64A7E28CF8610B472330CC4D912`
- **Replay identity:** replay probe record `2d7665292cc4ad67`
  (`V12/VALIDATION/replay-results/replay-probe.txt`)
