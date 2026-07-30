# Continuity Ledger — Separation of Concerns

**Status:** enforced for boundary wording in this package; other engines = **declared** / out of package.  
**Scope:** `jarvis-memoryboard/` only.

## Four layers

| Layer | Role | Ownership |
|-------|------|-----------|
| **Memory / Continuity Ledger** (this package) | Stores replayable records with provenance. Preserves what was recorded. Enforces continuity invariants (immutability of content hashes once written, required provenance fields, no silent merge, deterministic retrieve envelopes). Does **not** infer or decide what is epistemically true. | `jarvis-memoryboard/` |
| **Evidence Engine** | Evaluates whether evidence warrants a claim. | **declared** — not in this package |
| **Knowledge Engine** | Organizes verified knowledge. | **declared** — not in this package |
| **Understanding Engine** | Builds explanations and mental models. | **declared** — not in this package |

Principle: clean SoC — not one system doing everything. The model/runtime stays replaceable; the ledger is **continuity infrastructure**.

## Ledger non-goals (explicit)

The Continuity Ledger does **not**:

- Adjudicate epistemic truth or pick a “winning” claim among conflicts
- Infer `confidence` from content (callers supply confidence; migration maps legacy labels only)
- Build a knowledge graph or explanation
- Silently merge disagreeing records
- Rewrite meaning of stored content (PATCH is an operator mutation; Drift checks detect hash change)

## What the ledger *does* (OK)

| Behavior | Interpretation |
|----------|----------------|
| Store / retrieve | Continuity preservation |
| `selections.why_selected` | Replay filter rationale (query/status/type), not truth ranking |
| `conflicts` | Surface both sides with provenance |
| `supersedes` | Record of a **replacement claim** written by a caller |
| `status` | Record of a **claimed lifecycle** (`draft` / `verified` / `archived`) — not proof of verification by an Evidence Engine |
| `confidence` | Caller-asserted float; not computed by the ledger |
| `content_sha256` | Drift / fidelity helper |

## Tension with CCS §1.1 “invariants”

CCS “enforce constitutional (continuity) invariants” means: required provenance, no silent merge, deterministic replay contracts, recorded supersession edges — **governance of continuity**, not deciding what is true. Epistemic evaluation remains Evidence/Knowledge/Understanding engines (**declared**).

## Domain boundary (not a merger)

Per `CONSTITUTIONAL_BOUNDARY_CLAUSE.md` (**declared**): *Continuity unifies evidence, not domains.* This package must not collapse AIKI / ARIS / Sovereign X / Lineage / Mandala semantics. Shared substrate = evidence format, provenance, replay contracts, verification rules; meaning and authority stay domain-local.

**Clause V gap:** Continuity should exclude memory/emotion/transient/ungoverned context. Current `sessionEnd` hooks may still POST memory-like draft facts — status **transitional / partial**, not enforced. See Boundary Clause V.

See also: `CCS_CHARTER.md`, `ADAPTER_CONSUMERS.md`, `CONSTITUTIONAL_BOUNDARY_CLAUSE.md`.
