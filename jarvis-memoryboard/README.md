# Jarvis Continuity Ledger

**Continuity infrastructure** for Mandala Rendering Software agents — isolated under
`jarvis-memoryboard/`. The service is **stateless/replaceable**; continuity lives in
governed ledger records — not in chat transcripts.

The Continuity Ledger **preserves what was recorded** with provenance. It does **not**
determine epistemic truth (see `docs/CONTINUITY_LEDGER_SOC.md`). The broader
**Constitutional Continuity Service (CCS)** vision is largely **declared**
(`docs/CCS_CHARTER.md`).

## Maturity (evidence-bound)

### Continuity Ledger (this package)

| Capability | Status | Evidence |
|------------|--------|----------|
| Continuity (A→B→C same restore) | **enforced** | `tests/test_acceptance.py::TestContinuityAcceptance` |
| Replay (why/where/when/session) | **enforced** | `TestReplayAcceptance` + `/api/jarvis/memory/retrieve` |
| Conflict (no silent merge / no truth pick) | **enforced** | `TestConflictAcceptance` + `/api/jarvis/memory/conflicts` |
| Drift (multi-day fidelity) | **partial** | hash check enforced; protocol in `docs/DRIFT_PROTOCOL.md` |
| AMUL substrate (`app/amul.py`) | **partial** | append-only field, lineage, verify/drift **enforced** (`tests/test_amul.py`); scale/GC/index **declared** |
| AMUL RAG (`app/amul_rag.py`) | **partial** | classifier/modes, lexical vector+BM25, evidence gate, replay log **enforced** (`tests/test_amul_rag.py`); neural embeddings **declared**, LLM generation **extractive-v0 / partial** (`JARVIS_RAG_LLM_URL` hook) |

### Four-layer SoC

| Layer | Status | Notes |
|-------|--------|-------|
| Continuity Ledger / Memory | **enforced** (subset) | Store, retrieve, conflicts, provenance |
| Evidence Engine | **declared** | Out of package — `docs/ADAPTER_CONSUMERS.md` |
| Knowledge Engine | **declared** | Out of package |
| Understanding Engine | **declared** | Out of package |

### CCS roadmap (not claimed implemented)

| Component | Status | Evidence |
|-----------|--------|----------|
| CCS as root continuity authority | **declared** | `docs/CCS_CHARTER.md` |
| Constitutional Boundary Clause (I–VI) | **declared** | `docs/CONSTITUTIONAL_BOUNDARY_CLAUSE.md` |
| Continuity Blocks (immutable) | **declared** | Charter §1.2; gap in `docs/LEDGER_TO_CCS_MAPPING.md` |
| Signed Evidence Objects | **declared** / **skeleton** | CES stubs only |
| CES.* registration | **declared** | `schemas/ces/*`, `schemas/registry.json` |
| RC.* registration | **declared** | `schemas/rc/*` |
| Unified provenance chain | **declared** | Charter §4 |
| Multi-product single read/write path | **declared** | Charter §5 |
| Clause V memory exclusion | **partial** / **transitional** | Hooks may still POST session facts; not API-enforced |
| ESFR promotion of CCS | **declared** | Charter §6 checklist — all gaps |

## Architecture docs

- `docs/CONSTITUTIONAL_BOUNDARY_CLAUSE.md` — *Continuity unifies evidence, not domains* (declared)
- `docs/CONTINUITY_LEDGER_SOC.md` — SoC boundaries & non-goals
- `docs/CCS_CHARTER.md` — CCS charter (declared)
- `docs/LEDGER_TO_CCS_MAPPING.md` — today → CCS gap map
- `docs/ADAPTER_CONSUMERS.md` — read-only consumer contract (declared)
- `docs/DRIFT_PROTOCOL.md` — drift operator protocol

## Canonical record fields (`continuity-ledger-v1`)

Every memory includes:

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | `mem-…` |
| `created_at` / `updated_at` | yes | ISO-8601 UTC timestamps |
| `source_agent` | yes | Who wrote it |
| `session_id` | yes | Which session produced it |
| `type` | yes | `decision \| fact \| task \| preference \| architecture \| research` |
| `confidence` | yes | Caller-asserted `0.0–1.0` (not inferred by ledger) |
| `evidence` | yes | list of `{kind, ref, note?}` (may be empty) |
| `supersedes` | optional | Recorded replacement **claim** — never silent merge |
| `status` | yes | Claimed lifecycle: `draft \| verified \| archived` |
| `content` | yes | Decision/fact text (not a chat dump) |
| `subject` | optional | Conflict grouping key |
| `content_sha256` | yes | Normalized-content hash for drift checks |

Legacy rows migrate on load to ledger fields and re-save with `"schema": "continuity-ledger-v1"`.

## Quick start

```powershell
.\jarvis-memoryboard\scripts\start-memoryboard.ps1
.\jarvis-memoryboard\scripts\install-cursor-hooks.ps1
.\jarvis-memoryboard\scripts\install-autostart.ps1
cd jarvis-memoryboard; python -m pytest -q
.\jarvis-memoryboard\scripts\smoke-test.ps1
```

Default URL: `http://127.0.0.1:8001`

## Prove Continuity across chats

1. Chat A: POST `type=decision` with `session_id=chat-a` and stable `subject`.
2. Chat B: `GET /api/jarvis/memory/retrieve?query=…&truth_scope=live` — same `id` + `content_sha256`.
3. Chat C: `GET /api/jarvis/memory/{id}` — identical content + provenance.
4. Or: `python -m pytest tests/test_acceptance.py::TestContinuityAcceptance -q`

## API

- `GET /health` — `schema: continuity-ledger-v1`
- `GET /api/jarvis/memory/retrieve` — memories + `selections` + `conflicts` (surfaces disputes; does not pick truth)
- `GET /api/jarvis/memory/conflicts?subject=`
- `GET/POST/PATCH/DELETE /api/jarvis/memory[/{id}]`
- Board: `GET/POST/PATCH /api/jarvis/memory/board`
