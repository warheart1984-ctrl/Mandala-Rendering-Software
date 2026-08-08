# ADR-0003 — Deterministic, Replay-Verifiable Execution (Partial)

- **Decision ID:** ADR-0003
- **Status:** accepted (partial — P4 partial per charter)
- **Date:** 2026-08-07T00:00:00Z
- **Author:** warheart1984-ctrl <warheart1984@gmail.com>

## Rationale

Replayable reality (P4) requires that any record can be verified as the
same record later, and that any tampering is detectable. Full
determinism of *identity generation* is not claimed; what is enforced is
deterministic **verification**: replay tokens and constitutional hashes
recompute identically from record state, so any modification breaks
verification.

## Decision

1. Every record carries a `constitutionalHash` (content-addressed) and a
   `replayToken` (SHA-256 over record state).
2. `verifyReplayToken(id)` recomputes and compares; mismatch ⇒ invalid.
3. CRE rejects tasks whose replay verification fails.
4. Renderer sampling randomness is seed-controlled
   (`PathTracerSeedHash`), never wall-clock-driven.
5. Identity generation (`Date.now()` + random) is declared non-portable.

## Alternatives rejected

| Alternative | Why rejected |
|-------------|--------------|
| Fully deterministic identity (e.g., pure hash of input) | Collisions/duplicate tasks; harder UX; over-claims P4 |
| No replay tokens, hash-at-rest only | Cannot detect post-creation modification |
| Wall-clock time seeds | Breaks reproducibility (P4) |

## Consequences

- Determinism is verified by recompute, not cross-process equality.
- `DETERMINISM.md` and `REPLAY.md` document the boundary precisely.

## Evidence

- **Commit:** `59b1378`
- **Test:** replay probe
  (`V12/VALIDATION/replay-results/replay-probe.txt`); normalization
  suite 23/23
- **Artifact hash:** `ConstitutionalInferenceContract.js`
  `4C27E29402167DDAB7679EFE152A1EE05CC889C46695A6040DBB9926E3695B4F`
- **Replay identity:** record `2d7665292cc4ad67`, replayToken
  `6106c619f1cb3996226221a6b49fd59a3b1c16e765ab7b34b05dbd421cb4930f`,
  recompute `valid: true`
