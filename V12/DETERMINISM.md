# DETERMINISM.md — V12

> **Author:** warheart1984-ctrl
> **Updated:** 2026-08-07
> **Status:** partial — replay verification is deterministic; identity
> generation is not cross-process stable. See charter P4.

## What is deterministic

- **Replay tokens recompute identically.** `verifyReplayToken` recomputes
  the token from current record state and must match the stored token.
  Any modification to the record breaks verification. Proven in
  `V12/VALIDATION/replay-results/replay-probe.txt`.
- **Constitutional hashes bind declaration state.** Two records differing
  only in `conclusion` produce different hashes (tamper-sensitive).
- **Math and BRDF normalization** are deterministic closed-form
  expressions (23/23 normalization tests).
- **Parameter replay** restores identical values
  (`replay.deterministic-params` conformance check).

## What is not deterministic (declared)

- **Identity generation** uses `Date.now()` + `Math.random()`
  (`ConstitutionalInferenceContract.#generateInferenceId`). Record IDs
  are not portable across runs or machines. This matches charter status
  **P4 partial**.
- Randomness in renderer sampling is seed-controlled (see
  `PathTracerSeedHash`), not wall-clock.

## Non-negotiable

- No time-of-day behavior may influence *outcomes* (only identity/ids).
- No change may make replay verification non-deterministic.
- Any new randomness must be seed-hashed and recorded.

## Evidence

- Replay probe: `V12/VALIDATION/replay-results/replay-probe.txt`
  (record `2d7665292cc4ad67`, replay token
  `6106c619f1cb3996226221a6b49fd59a3b1c16e765ab7b34b05dbd421cb4930f`,
  recompute `valid: true`).
- See `REPLAY.md` and `ADR-0003-deterministic-execution`.
