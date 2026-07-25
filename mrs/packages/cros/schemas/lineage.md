# CROS Lineage — seven artifacts, six transitions, nothing skips

> **Status:** the chain is **specified** (7 JSON Schemas) and **validated** (`cros.validation.validate_lineage`,
> unit-tested). It is **not enforced at runtime** — no CROS runtime exists. See `constitution/invariants.json`.

## The chain

```
CreativeIntent ──▶ RenderIntent ──▶ RenderPlan ──▶ RenderExecution ──▶ RenderResult ──▶ RenderEvidence ──▶ ReplayRecord
     (1)                (2)             (3)              (4)                (5)               (6)                (7)
```

## Transition table

Each artifact cites its predecessor **twice**: once by identity (`derivedFrom`) and once by content
(a stage-named hash field). Both are required by schema.

| # | Artifact | `derivedFrom` points at | Predecessor-hash field | Governing invariant |
| --- | --- | --- | --- | --- |
| 1 | `CreativeIntent` | — (origin) | — | CI-001 |
| 2 | `RenderIntent` | CreativeIntent | `creativeIntentHash` | CI-001 |
| 3 | `RenderPlan` | RenderIntent | `renderIntentHash` | CI-002 |
| 4 | `RenderExecution` | RenderPlan | `planHash` | CI-003 |
| 5 | `RenderResult` | RenderExecution | `executionHash` | CI-003 |
| 6 | `RenderEvidence` | RenderResult | `resultHash` | CI-004, CI-005 |
| 7 | `ReplayRecord` | RenderEvidence | `evidenceHash` | CI-005 |

`CreativeIntent` is the only artifact whose schema omits `derivedFrom` / a predecessor hash. Every
other schema lists both in `required`.

## Why nothing can skip

The two-field citation is what makes skipping detectable rather than merely discouraged.

Suppose a caller wants to publish a `RenderEvidence` without ever producing a `RenderExecution`.
They must supply:

1. `derivedFrom` — a `RenderResult` id, and
2. `resultHash` — that result's `contentHash`.

To produce a `RenderResult` that hashes to that value, they must supply an `executionHash`, because
`executionHash` is in `RenderResult`'s `required` set and is therefore inside the hashed body. To
produce a matching `RenderExecution` they must supply a `planHash`, and so on to the origin.

So fabricating a late-stage artifact requires fabricating **the entire upstream chain**, and the
fabricated chain is internally consistent only if every hash actually recomputes. `validate_lineage`
recomputes all of them.

What this does and does not buy:

- **Does** detect a missing, reordered, or post-hoc-edited stage.
- **Does** detect an artifact body edited after its successor was written.
- **Does not** prove the events described actually happened. A caller who fabricates all seven
  artifacts consistently produces a chain that validates. Lineage integrity is a
  tamper-*evidence* property, not an attestation. Binding the chain to a signing authority is a
  future increment and is not implemented.

## Hashing rule

`contentHash` is SHA-256 over canonical JSON of the artifact body with the `contentHash` key
**excluded** (a hash cannot cover itself). Canonical form: UTF-8, keys sorted lexicographically,
no insignificant whitespace, `/` unescaped.

Implementation: `cros.artifacts.canonical_json` / `cros.artifacts.canonical_hash`.

## Stage responsibilities

| Stage | Answers | Owner |
| --- | --- | --- |
| CreativeIntent | *What do we want, and who is accountable?* | human |
| RenderIntent | *What exactly must be produced, at what spec?* | supervisor / pipeline TD |
| RenderPlan | *How, given what this adapter declared it can do?* | planner |
| RenderExecution | *What is happening right now?* | adapter |
| RenderResult | *What came out?* | adapter |
| RenderEvidence | *Can we prove what came out, and how reproducible is it?* | CROS |
| ReplayRecord | *Did reproduction actually hold?* | CROS |

The split between stages 5 and 6 is deliberate and is the core of CI-004: a `RenderResult` is not a
completion signal. "The renderer exited zero" and "we can prove what it produced" are different
claims, so they are different artifacts.

The split between 6 and 7 is the core of CI-005: evidence *claims* a reproduction class; a
`ReplayRecord` *tests* it. A `RenderEvidence` asserting `bit-identical` alongside a `ReplayRecord`
with `verdict: unverified` is a well-formed, honest pair — the claim is on record and openly
untested. Conflating the two is how "reproducible" becomes a marketing word.

## Profile interaction

Stage 6 and 7 are the only stages whose validity depends on the active conformance profile:
`replay.replayClass` (6) and `replayClass` (7) must appear in the profile's `replay.allowedClasses`.

Under `cros.gen-ai-nim`, `bit-identical` is **not** in `allowedClasses`. A frame-exact claim on a
hosted generative render is therefore a CI-005 validation failure. See
`profiles/cros.gen-ai-nim.json`.
