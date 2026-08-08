# REPLAY.md — V12

> **Author:** warheart1984-ctrl
> **Updated:** 2026-08-07

## Replay identity

A record's **replay identity** is its `replayToken` — a SHA-256 digest
over its content-addressable state. Replay identity is what makes a
record (inference, continuity, frame) verifiably the same record later.

## Replay pipeline

```
record
  │
  ▼
#computeReplayToken(record)   ── SHA-256 over state ──► stored token
  │
  ▼
verifyReplayToken(id)         ── recompute, compare
  │
  ├── equal  → { valid: true, token }
  └── differ → { valid: false, reason: "Replay token mismatch" }
```

`verifyReplayToken` returns invalid if the record was modified after
creation — including a modified `constitutionalHash`.

## Where replay is enforced

- `ConstitutionalInferenceContract.verifyReplayToken`
- CRE `#applyReasoningMode` and `#processReasoningTask` reject tasks whose
  replay verification fails
- Blind-spot checks flag `Replay verification failed`
- `provenance.frame-recorded-during-play` (frames between play/stop)
- `replay.deterministic-params` (parameter values restored identically)

## Probe result (2026-08-07)

```
record1 id: 2d7665292cc4ad67
record1 constitutionalHash: e3573445dd1413af
tamper sensitivity: DIFFERENT (hash binds declaration state)
replay recompute valid: true  | token matches stored token
```

Full output: `V12/VALIDATION/replay-results/replay-probe.txt`

## Caveat

Replay identity is deterministic *within* a record's lifetime. Record IDs
themselves are generated with `Date.now()`/random, so identity strings
are not portable across processes. Determinism is verified by recompute,
not by cross-process equality (see `DETERMINISM.md`).
