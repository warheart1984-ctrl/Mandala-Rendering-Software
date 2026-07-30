# Adapter note — consuming the Continuity Ledger

**Status: declared roadmap** — no Evidence / Knowledge / Understanding engines are implemented in this package.

Boundary: *Continuity unifies evidence, not domains* (`CONSTITUTIONAL_BOUNDARY_CLAUSE.md`). Consumers reconstruct shared evidence/order/authority; they do **not** import foreign domain semantics via the ledger.

## Read-only contract (intended)

Downstream engines **should**:

1. `GET /api/jarvis/memory/retrieve` (or list with provenance) — never invent missing provenance.
2. Treat `conflicts[].unresolved=true` as **open** — do not assume one memory is true.
3. Treat `supersedes`, `status`, and `confidence` as **caller-asserted continuity claims**, not Evidence Engine verdicts.
4. Write back only via ledger POST/PATCH when recording a new continuity event (e.g. a decision after evaluation) — single write path (**declared** for CCS).

## Layer mapping

| Engine | Consumes | Produces (elsewhere) |
|--------|----------|----------------------|
| Evidence | ledger evidence links + content | warrant / score (**declared**) |
| Knowledge | verified claims after evidence | organized KO graph (**declared**) |
| Understanding | knowledge + context | explanations (**declared**) |
| Continuity Ledger | writes from agents/hooks | replayable records (**enforced** subset today) |

See `CONTINUITY_LEDGER_SOC.md` and `CCS_CHARTER.md`.
