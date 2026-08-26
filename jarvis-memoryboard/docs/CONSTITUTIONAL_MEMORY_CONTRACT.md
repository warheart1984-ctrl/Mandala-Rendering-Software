# Constitutional Memory Contract (EMR / STM / LTM)

**Status:** partial (Memoryboard EMR/STM view enforced in this package; AMUL substrate architecture declared/partial)  
**Scope:** `jarvis-memoryboard/` (API + EMR/STM). AMUL Architect is the LTM substrate architecture — **declared/partial**, not claimed as invented by EMR.  
**Does not modify:** Continuity Ledger CRUD invariants, conflict non-merge, domain authority, or repo governance charters outside this package.

## Canonical stack (binding)

```
AMUL Architect     = LTM substrate (persistence / memory structure / lineage)
        ↓
Jarvis Memoryboard = LTM access / API / representation layer  (this package)
        ↓
Intent ──► EMR     = excitation, bonding, certification, bundle formation
        ↓ promote
STM                = active working set (token-budgeted)
        ↓
LLM                = reasoning / generation engine
```

### Prior-art / novelty boundary

| Layer | Claims | Does not claim |
|-------|--------|----------------|
| **AMUL** | Persistent LTM architecture (structure, lineage, persistence) | — |
| **Memoryboard** | LTM access interface + Continuity Ledger SoT | Inventing persistent LTM |
| **EMR** | Governed activation: what becomes active cognition | Inventing persistent LTM |
| **STM** | Budgeted working-set view | Being a second database of truth |
| **LLM** | Reasoning / generation over STM | Owning long-horizon memory |

**EMR's novel contribution (narrow):** given an existing persistent memory architecture, how the system dynamically decides what becomes active cognition.

## One-line architecture

```
AMUL (LTM substrate) → Memoryboard (LTM API) → EMR (governed activation) → STM (budgeted working set) → LLM
```

Inference cost aims at **currently relevant state**, not lifetime history.

## Layer map (this package)

| Layer | Role | Ownership / maturity |
|-------|------|----------------------|
| **AMUL Architect** | LTM substrate: persistence, structure, lineage | **declared / partial** — outside or alongside this package; not rewritten by EMR |
| **Jarvis Memoryboard** | LTM access/API; Continuity Ledger records (M-particles) | **enforced** — `MemoryRecord` store + CRUD/retrieve |
| **EMR** | Excitation, bonding, certification, bundle formation; promote/evict/budget/resolve | **partial→enforced** — `app/emr.py` |
| **STM** | Activated working set (**view**, not a store). Summaries + LTM pointers | Ephemeral session map in EMR; never mutates LTM |
| **LLM** | Reasoning surface. Receives STM injections only | Consumers (agents / Director) |

Continuity Ledger remains the **LTM SoT via Memoryboard**. EMR reads Memoryboard and produces STM views; it does not replace AMUL or the ledger.

## Continuity boundary (binding)

1. **Eviction ≠ forgetting.** Leaving STM returns a particle to dormancy in LTM (via Memoryboard). Provenance, evidence, and lineage remain.
2. **Compression must never silently become truth.** Every STM entry carries `memory_id` provenance back to LTM; evidence expands only from LTM `evidence[]`.
3. **Conflicts are never merged** by EMR. Unresolved conflict subjects may be demoted or annotated; adjudication stays outside this package (Evidence / Knowledge / Understanding — declared).
4. **STM does not write LTM.** Promotion/eviction change only the active view.
5. **EMR does not invent LTM.** Persistent memory architecture belongs to AMUL; Memoryboard is the access layer.

## Activation score

\[
A_i = Q_i \cdot R_i \cdot P_i \cdot e^{-D_i \Delta t}
\]

| Factor | Meaning | Ledger mapping (v1) |
|--------|---------|---------------------|
| \(Q_i\) | Query / intent alignment | Token overlap of query vs `content` / `subject` / `tags` |
| \(R_i\) | Resonance / bonding with trajectory | Overlap of trajectory tokens vs same fields (sticky prior STM) |
| \(P_i\) | Provenance / authority / certification weight | `confidence` × status weight (`verified` > `draft` ≫ `archived`) |
| \(D_i\) | Decay rate | Per-type constant; \(\Delta t\) from `updated_at` |

## Thresholds & budget

| Rule | Condition | Effect |
|------|-----------|--------|
| Promote | \(A_i > \theta_{promote}\) | LTM (via Memoryboard) → STM |
| Evict | \(A_i < \theta_{evict}\) | STM → LTM dormancy (record unchanged) |
| Budget | \(\sum Cost(M_i) \le C_{budget}\) | Greedy by \(A_i / Cost\) |

Defaults: \(\theta_{promote}=0.12\), \(\theta_{evict}=0.04\), \(C_{budget}=512\) tokens.

## Resolution levels

| Level | Payload | When |
|-------|---------|------|
| `summary` | Compressed claim (~15–30 tokens target) | Default STM injection |
| `detail` | Full LTM `content` | Reasoning demand |
| `evidence` | `detail` + `evidence[]` + provenance | Verification / high stakes |

Expansion is always `STM → memory_id → Memoryboard LTM → evidence`. No invented detail.

## API surface (Memoryboard package)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/jarvis/memory/active` | EMR excite → budgeted STM view (contract GET) |
| `POST` | `/api/jarvis/memory/emr/excite` | Same excitation with full request body |
| `GET` | `/api/jarvis/memory/emr/status` | EMR session / STM counts |
| `GET` | `/api/jarvis/memory/stm` | Read current STM session view |
| `GET` | `/api/jarvis/memory/stm/context` | LLM-ready STM injection block |
| `POST` | `/api/jarvis/memory/stm/expand` | Raise STM entry resolution |
| `GET` | `/api/jarvis/memory/{id}/resolve` | Expand one LTM particle (no STM membership required) |
| `DELETE` | `/api/jarvis/memory/stm` | Clear STM session view |

Existing Continuity Ledger endpoints remain the LTM SoT (`list` / `retrieve` / CRUD / `conflicts` / `board`).

## Non-goals

- EMR does not adjudicate truth.
- EMR does not claim invention of persistent LTM (AMUL).
- EMR does not replace vector search as a product claim; v1 is lexical + authority + decay.
- EMR does not auto-POST session chat into LTM (Clause V / Continuity SoC).

## Maturity tags

| Claim | Tag |
|-------|-----|
| Memoryboard = LTM access/API; Continuity Ledger SoT | enforced |
| AMUL = LTM substrate architecture | declared / partial |
| STM view + budget + resolve API | enforced (`tests/test_emr.py`) |
| EMR governed activation (lexical Q·R·P·decay) | partial (enforced tests; embedding resonance declared) |
| Cross-agent constitutional enforcement of thresholds | declared |
