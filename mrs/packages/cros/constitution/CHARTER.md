# CROS Charter — Cinematic Render Operating System v0.1.0

> **Drive-G-1:** No claim in this document may exceed the implementation evidence behind it.
> Status tags: **enforced** | **partial** | **declared** | **skeleton**.
> **Machine source of truth:** `constitution/invariants.json`. If this prose and that JSON disagree, the JSON wins.

## 0. What CROS is, and what it is not

CROS is a **reference architecture** for governed cinematic rendering: a constitution, a set of
content-addressed lineage artifacts, an adapter contract, and dual conformance profiles.

CROS **is not**:

- a renderer, a render farm, or a scheduler;
- an implementation of any DCC integration (no Cycles, Arnold, RenderMan, Karma adapter exists);
- a claim about what any MRS application currently ships.

In particular, `mrs/apps/genblaze-media` does **not** implement CROS. It predates this package,
imports nothing from it, and is not modified by it. See §6.

Current maturity, per Drive-G-2 (five dimensions rated independently):

| Dimension | Rating | Evidence |
| --- | --- | --- |
| Constitutional model | **design complete** for v0.1 scope | this charter + `constitution/invariants.json` (6 invariants, 5 principles) |
| Governance methodology | **partial** | 6 validators implemented + unit-tested; no runtime invokes them |
| Reference implementation | **skeleton** | typed artifacts, hashing, evidence builder, gen-ai planner; zero adapters |
| Platform engineering | **absent** | no service, no CI wiring, no packaging of data files |
| Commercial operations | **absent** | not applicable at this stage |

## I. Principles

| # | Principle | Statement |
| --- | --- | --- |
| **P1** | Lineage completeness | Every delivered frame traces to a CreativeIntent through an unbroken chain of typed artifacts. No stage may be skipped or synthesised after the fact. |
| **P2** | Profile-scoped honesty | Reproducibility claims are made in the vocabulary of the active conformance profile. A claim valid under one profile is not portable to another. |
| **P3** | Adapter subordination | Backends satisfy a contract; they do not extend it. CROS never depends on a specific renderer, model provider, or DCC. |
| **P4** | Evidence precedes assertion | A render is not complete when pixels exist. It is complete when the evidence package describing those pixels exists and verifies. |
| **P5** | Declared is not enforced | Documentation, schemas, and profile JSON are specifications, not runtime gates, and must never be described as such. |

## II. Constitutional invariants

Status below is **package-local**: it describes whether a validator exists and is tested, not
whether any production system obeys it. `runtimeStatus` for all six invariants is `absent` —
this package contains no runtime.

| ID | Invariant | Status | Validator | Why not enforced |
| --- | --- | --- | --- | --- |
| **CI-001** | Intent immutability — intent is content-addressed; a body change yields a new identity | **partial** | `check_ci001_intent_immutable` | No persistent artifact store to gate writes against |
| **CI-002** | Planning derived from a valid intent + declared capabilities, citing the intent hash | **partial** | `check_ci002_planning_derived` | Only the gen-ai capability subset has a planner |
| **CI-003** | Execution observable — ≥1 progress observation, monotonically non-decreasing | **partial** | `check_ci003_execution_observable` | No adapter host emits progress |
| **CI-004** | Evidence before completion — no delivery without a RenderEvidence citing the result hash | **partial** | `check_ci004_evidence_before_completion` | No delivery path exists to gate |
| **CI-005** | Profile-scoped replayability — declared replayClass must be permitted by the active profile | **partial** | `check_ci005_replayability` | Validator checks the *claim*; no replay executor reproduces anything |
| **CI-006** | Adapter isolation — no sibling-adapter, host-app, or narrative-layer imports | **partial** | `check_ci006_adapter_isolation` | Import scan is real and runs; the adapter registry it would police is empty |

## III. Lineage

```
CreativeIntent → RenderIntent → RenderPlan → RenderExecution → RenderResult → RenderEvidence → ReplayRecord
```

Seven artifacts, six transitions, **nothing skips**. Each artifact cites its immediate predecessor
by both `derivedFrom` (identity) and a stage-specific hash field (content). Skipping a stage is
detectable because the successor's predecessor-hash has nowhere to come from.

Full transition table, required hash fields, and the tamper-detection argument:
`schemas/lineage.md`.

## IV. Conformance profiles

CROS refuses to define "reproducible" globally. Replay semantics belong to a profile.

| Profile | Status | Permitted replay classes | Claim |
| --- | --- | --- | --- |
| `cros.dcc-offline` | **declared** | `bit-identical`, `deterministic-parameters` | Offline path-tracing under a locked environment. Every requirement is a *declared expectation for future adapters*. No adapter implements it. |
| `cros.gen-ai-nim` | **skeleton** | `provider-contract` only | Hosted generative endpoints. Replay = pinned model id + params + prompt hash + seed-if-exposed + provider request id + asset SHA-256. **Frame-exact reproduction is not claimed and is forbidden to claim.** |

`cros.gen-ai-nim` **excludes** `bit-identical` from `allowedClasses`. Under CI-005 this makes a
frame-exact claim on a gen-ai render a validation failure, not a stylistic preference.

## V. Adapter contract

`IRenderAdapter` (`src/cros/adapter.py`) is a `typing.Protocol` with eight lifecycle methods:

`discoverCapabilities` · `validateEnvironment` · `compilePlan` · `execute` · `streamProgress` ·
`collectArtifacts` · `verify` · `shutdown`

Method names retain the architecture's camelCase spelling rather than being renamed to PEP 8
snake_case, so that the Python Protocol, the schemas, and any future C++/C# mirror name the same
contract. Status: **skeleton** — a Protocol plus a `NullRenderAdapter` test double that renders
nothing. No backend adapter exists.

## VI. Boundaries

Hard constraints on this package:

1. **No Story Forge lineage.** CROS must not import or reference `story_forge` / `storyforge`.
2. **No host coupling.** CROS must not import `app` or `genblaze` (the `mrs/apps/genblaze-media`
   host). Any future integration is one-directional and out-of-process — the host may emit
   RenderEvidence-shaped fields over HTTP; CROS never reaches into the host.
3. **No cross-adapter imports.** An adapter may not import a sibling adapter.

Constraints 1–3 are checked by an import scan over `src/cros/**/*.py`
(`tests/test_adapter_protocol.py::test_cros_package_has_no_banned_imports`). This is the one
invariant in this package with a real, currently-meaningful automated check — because the thing it
polices (this package's own import graph) actually exists.

CROS does not modify MRS constitutional artifacts. It carries its own constitution under
`constitution/` and is subordinate to the MRS charter, not a replacement for it.

## VII. Amendment

`constitution/invariants.json` is the source of truth. Changing an invariant's `status` upward
requires the `evidence` array to cite a test that passes. Adding a replay class requires stating,
in that class's definition, exactly what equality it does and does not assert.
