# CROS — Cinematic Render Operating System

> **Status: reference-architecture scaffold (v0.1.0).** Not a renderer. Not a farm.
> Not a claim that any MRS application implements CROS.
> Drive-G-1 binds every sentence below.

## What this is

A focused foundation for a governed cinematic render stack:

| Piece | Path | Status |
| --- | --- | --- |
| Constitution (CI-001..CI-006) | `constitution/` | **design** — prose + machine-readable JSON |
| Lifecycle bridge (SX-PTIG) | `constitution/LIFECYCLE.md` + `lifecycle-bridge.json` | **declared** — continuity ≠ acceptance; not a runtime gate |
| Lineage artifact schemas (7) | `schemas/` | **specified** — Draft 2020-12, unit-validated |
| Dual conformance profiles | `profiles/` | `cros.dcc-offline` **declared**; `cros.gen-ai-nim` **skeleton** |
| Python package | `src/cros/` | **skeleton / partial** — types, hashing, validators, gen-ai planner |
| Adapter Protocol | `src/cros/adapter.py` | **skeleton** — `typing.Protocol` + `NullRenderAdapter` test double |
| Tests | `tests/` | **real** — schemas, invariants, profile honesty, isolation scan |

## What this is not

- Not a running CROS runtime, scheduler, or farm planner.
- Not an Arnold / Cycles / RenderMan / Karma / Redshift / OIDN / ACES implementation.
- Not a claim that `mrs/apps/genblaze-media` implements CROS. That app is untouched.
- Not Story Forge. CROS carries **no Story Forge lineage**; `story_forge` / `storyforge`
  imports are banned and scanned (CI-006).

## Maturity (Drive-G-2)

Rated independently. Do not collapse these into a single "ready / not ready".

| Dimension | Rating | Evidence |
| --- | --- | --- |
| Constitutional model | **design complete** (v0.1 scope) | `constitution/CHARTER.md` + `constitution/invariants.json` |
| Governance methodology | **partial** | 6 validators in `src/cros/validation.py`, unit-tested; no runtime invokes them |
| Reference implementation | **skeleton** | typed artifacts, hashing, evidence builder, gen-ai planner; zero real adapters |
| Platform engineering | **absent** | no service, no CI job, wheel does not yet ship the spec directories |
| Commercial operations | **absent** | not applicable |

`runtimeStatus` in `constitution/invariants.json` is `absent`. Every invariant is at most
**partial**.

## Lineage

```
CreativeIntent → RenderIntent → RenderPlan → RenderExecution
    → RenderResult → RenderEvidence → ReplayRecord
```

Seven artifacts, six transitions, **nothing skips**. See `schemas/lineage.md`.

## Replay honesty (the load-bearing distinction)

CROS refuses a single meaning of "reproducible".

| Profile | Permitted `replayClass` | What it actually means |
| --- | --- | --- |
| `cros.dcc-offline` | `bit-identical`, `deterministic-parameters` | Declared expectations for a future offline path-tracer adapter. **No adapter exists.** |
| `cros.gen-ai-nim` | `provider-contract` **only** | Pinned model id + params + prompt hash + seed-if-exposed + provider request id + asset SHA-256. Reproducible *within the provider contract*. **Pixel equality is not asserted. Frame-exact claims are a CI-005 failure.** |

## Continuity ≠ acceptance (SX-PTIG bridge)

CROS **links** its lineage to the shared SX-PTIG lifecycle. The bridge is
**declared**, not a runtime gate, and does **not** claim CKL enforcement of PTIG.

| Guarantee | Role in CROS terms |
| --- | --- |
| ContinuityGuarantee | Preserve identity / lineage / provenance (inactive OK) |
| AcceptanceGuarantee | Activate only with evidence (CI-004) + honest replay class (CI-005) |

See [`constitution/LIFECYCLE.md`](./constitution/LIFECYCLE.md) and
[`lifecycle-bridge.json`](./constitution/lifecycle-bridge.json). PTIG SoT:
`mrs/packages/renderer-core/src/gpu/constitution/SX-PTIG.md`.

## Layout

```
mrs/packages/cros/
  README.md
  pyproject.toml
  constitution/
    CHARTER.md
    LIFECYCLE.md          # SX-PTIG bridge (declared)
    lifecycle-bridge.json
    invariants.json       # CI-001..CI-006; runtimeStatus: absent
  schemas/
    creative_intent.schema.json
    render_intent.schema.json
    render_plan.schema.json
    render_execution.schema.json
    render_result.schema.json
    render_evidence.schema.json
    replay_record.schema.json
    lineage.md
  profiles/
    cros.dcc-offline.json   # declared
    cros.gen-ai-nim.json    # skeleton
  src/cros/
    __init__.py
    resources.py      # locate constitution / schemas / profiles
    artifacts.py      # dataclasses, canonical hashing, schema validate
    evidence.py       # RenderEvidence / ReplayRecord builders (CI-004/005)
    adapter.py        # IRenderAdapter Protocol + NullRenderAdapter
    adapters/
      seedance.py     # skeleton only — live Seedance HTTP is genblaze-media
    planning.py       # gen-ai plan derivation (CI-002); offline raises
    validation.py     # CI-001..CI-006 checks + lineage walk
    bridge.py         # test-only genblaze-shaped dict → RenderEvidence
  tests/
    ...
```

## Real vs stub

| Capability | Real now | Stub / declared |
| --- | --- | --- |
| Content-addressed artifact hashing | yes | |
| JSON Schema validation of all 7 stages | yes | |
| CI-001..CI-006 validator functions | yes (caller-invoked) | no runtime gate |
| Gen-ai plan derivation | yes (single-step) | |
| Gen-ai evidence field enforcement | yes | |
| Offline DCC planner | | raises `UnsupportedProfileError` |
| Offline required-field enforcement | | declared, not machine-checked |
| Any real adapter (NIM, Cycles, …) | | none — `NullRenderAdapter`; `adapters/seedance.py` is **skeleton** only |
| Seedance live HTTP | | owned by genblaze-media (`GENBLAZE_VIDEO_BACKEND=seedance`), not this package |
| Replay executor | | `verdict: unverified` only |
| Farm / OIDN / ACES / color mgmt | | absent |
| Coupling to genblaze-media | none (banned) | optional future HTTP export |

## Install and test

From a source checkout (recommended — the wheel does not yet ship `constitution/`,
`schemas/`, or `profiles/`; see `src/cros/resources.py`):

```bash
cd mrs/packages/cros
pip install -e ".[dev]"
pytest
```

Or without installing, relying on `pyproject.toml`'s `pythonpath = ["src"]`:

```bash
cd mrs/packages/cros
pip install jsonschema pytest
pytest
```

Override the resource root if needed: `CROS_ROOT=/path/to/mrs/packages/cros`.

## Boundary with genblaze-media

Hard rules, enforced by the CI-006 import scan over `src/cros/**/*.py`:

1. CROS must not import `app`, `genblaze`, `story_forge`, or `storyforge`.
2. genblaze-media must not be modified to claim CROS is implemented.
3. No in-process coupling.

`src/cros/bridge.py` maps a **genblaze-shaped dict** (the field set genblaze-media
already emits: `run_id`, `model`, `provider`, `asset_sha256`, `prompt`, …) into a
`RenderEvidence` for **tests only**. It performs no I/O and is not wired into the app.

**Future (declared, not built):** genblaze-media can emit RenderEvidence-compatible
manifest fields over HTTP; CROS consumes them out-of-process. No shared library
import required either direction.

## Next recommended increments

1. **HTTP schema export** — serve the seven JSON Schemas and both profiles from a
   tiny static or FastAPI surface so external producers can validate without a
   Python import.
2. **Genblaze manifest field mapping in the app** — additive, optional emission of
   CROS-compatible fields from genblaze-media's existing generate response. Still
   no in-process import of `cros`.
3. **First stub AI adapter** — an `IRenderAdapter` that records capabilities,
   refuses real network calls under `dry_run`, and produces a sealed lineage ending
   at `verdict: unverified`. Still not a claim of provider-side reproducibility.
4. **Ship spec directories as package data** so an installed wheel resolves
   schemas without `CROS_ROOT`.
5. **Offline planner stub** that accepts a RenderIntent and emits a plan whose
   steps name the declared DCC requirements — still no Cycles/Arnold backend.

## Relationship to the MRS constitution

CROS is subordinate to the MRS charter (`constitution/CHARTER.md` at repo root,
`engine/constitution/`). It does not modify those files. It carries its own
constitution under `mrs/packages/cros/constitution/` and applies only to the
cinematic-render reference architecture this package describes.
