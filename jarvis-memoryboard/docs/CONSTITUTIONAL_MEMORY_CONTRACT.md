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
A_i^{base} = Q_i^{w_q} \cdot R_i^{w_r} \cdot P_i^{w_p}
\cdot (e^{-D_i^{eff} \Delta t})^{w_d}
\cdot (1 + U_i)^{w_u}
\cdot (1 + \kappa\cos(F_i,R))^{w_f}
\]

After base scoring, bounded graph expansion may add the strongest recorded path:

\[
A_i = A_i^{base} + w_g A_{seed}^{base} \cdot pathStrength(seed \rightarrow i)
\]

| Factor | Meaning | Ledger mapping (v1) |
|--------|---------|---------------------|
| \(Q_i\) | Query / intent alignment | Token overlap of query vs `content` / `subject` / `tags` |
| \(R_i\) | Resonance / bonding with trajectory | Overlap of trajectory tokens vs same fields (sticky prior STM) |
| \(P_i\) | Provenance / authority / certification weight | `confidence` × status weight (`verified` > `draft` ≫ `archived`) |
| \(D_i\) | Decay rate | Per-type constant; \(\Delta t\) from `updated_at` |
| \(U_i\) | Reinforcement salience | Bounded EMR sidecar state; never a truth score |
| \(F_i\) | Multichannel resonance frequency | Domain, authority, project, temporal, procedural, and identity channels |
| `pathStrength` | Graph expansion signal | Strongest bounded path through recorded/derived ledger edges |

The `weights` request object makes each soft component explicit and auditable.
Provenance admission remains a hard gate: a zero-authority/archived particle
cannot be made admissible by changing weights or reinforcing it.

## Metadata filtering

`filters` are applied before activation scoring and before `candidate_limit`.
Supported exact-match fields are `types`, `statuses`, `source_agents`,
`session_ids`, `subjects`, `tags_any`, and `tags_all`; range filters cover
confidence plus created/updated timestamps. String metadata is matched
case-insensitively. An archived record remains dormant even if requested.

## Bounded graph expansion

EMR traverses only relationships visible in the ledger: `supersedes`, explicit
`memory:mem-…` evidence references, shared subjects, and shared tags. Traversal
is bounded by depth, seed count, expanded-node count, minimum edge strength,
and hop decay. Every graph boost reports its seed, hop count, memory-id path,
typed edges, and numeric boost. The strongest path wins; cycles do not stack.

Graph expansion does not override the contradiction membrane. Two different
claims under one subject may be discovered, but are not silently co-admitted
when `contradiction_policy=exclude`.

The current evidence-calibrated defaults use graph contribution `0.30` and
minimum derived edge strength `0.35`. The decision record and its provisional
semantic judgments are in `docs/EMR_GRAPH_ADJUDICATION_2026-08-24.md`.

## Abstention

Before STM selection, EMR applies a gate to the strongest distinct-content
scores. The default gate requires evidence activation `>= 0.05`, lexical query
alignment `>= 0.20`, absolute score margin `>= 0.0005`, and relative margin
`>= 0.005`. It returns an empty STM plus an explicit reason when the query is
unsupported or ambiguous.

The gate uses canonical `gate_A`, calculated without reinforcement, graph
boosts, or caller-supplied retrieval-weight changes. Therefore repeated use,
graph proximity, and custom ranking weights can reorder supported memories but
cannot make an unsupported query appear answerable. Duplicate content hashes
are collapsed before the margin comparison. API callers may strengthen these
floors but cannot disable or lower them; controlled evaluation bypasses the
gate only through an internal function argument.

## Reinforcement

Reinforcement changes only the disposable EMR dynamics sidecar: bounded
salience raises retrievability and bounded decay damping extends recall life.
It never changes ledger content, status, confidence, evidence, or hashes.
Every reinforcement requires an explicit positive outcome signal containing a
source and outcome id. Reusing the same outcome id for the same memory is
idempotent and reported as a replay. Use
`POST /api/jarvis/memory/emr/reinforce` explicitly, or set
`reinforce_selected=true` together with `reinforcement_outcome` on an excitation
request. Selection alone is never a positive outcome.

Separate salience and decay-damping caps remain, and their compounded effect is
also capped at `1.25x` activation. Automatic reinforcement is off by default.

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
| `POST` | `/api/jarvis/memory/emr/reinforce` | Bounded retrieval-state reinforcement; never edits LTM truth fields |
| `POST` | `/api/jarvis/memory/emr/correct` | Operator correction — immediately resets reinforcement overlay |
| `POST` | `/api/jarvis/tools/emr_recall` | **Read-only** EMR Recall Protocol for agent tool calling |
| `POST` | `/api/jarvis/tools/emr_remember` | Governed create (draft); gated by `JARVIS_MCP_WRITE_ENABLED` — **partial** |
| `POST` | `/api/jarvis/tools/emr_upsert` | Governed supersede (draft + archive prior); same gate — **partial** |
| `GET` | `/api/jarvis/tools` | Tool catalog (OpenAI-compatible function schemas) |
| `GET` | `/api/jarvis/memory/emr/status` | EMR session / STM counts |
| `GET` | `/api/jarvis/memory/stm` | Read current STM session view |
| `GET` | `/api/jarvis/memory/stm/context` | LLM-ready STM injection block |
| `POST` | `/api/jarvis/memory/stm/expand` | Raise STM entry resolution |
| `GET` | `/api/jarvis/memory/{id}/resolve` | Expand one LTM particle (no STM membership required) |
| `DELETE` | `/api/jarvis/memory/stm` | Clear STM session view |

Existing Continuity Ledger endpoints remain the LTM SoT (`list` / `retrieve` / CRUD / `conflicts` / `board`).

## Defensible claims (evidence-bound)

Use these formulations in papers, READMEs, and operator docs:

| Claim | Wording |
|-------|---------|
| Recall quality | EMR **reduces unsupported recall** and makes memory selection **inspectable, replayable, and governable** |
| Contradictions | Contradictory memories are **detected and prevented from silent co-admission** under the tested policy |
| Reinforcement | **Retrieval ≠ reinforcement** — outcome-gated salience/decay changes retrievability only |
| Truth | Retrieval may affect activation; it **must never silently alter** LTM truth, authority, provenance, or content |

Do **not** claim "no hallucinated memories" or "no contradictions exist." Evaluation may surface unsupported promotion and unresolved disputes; the system surfaces them rather than hiding them.

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
| Weighted retrieval + decay + metadata filtering | enforced (`tests/test_emr*.py`) |
| Bounded graph expansion with path provenance | enforced (`tests/test_emr_dynamics.py`) |
| Bounded persistent reinforcement, separate from truth | enforced (`tests/test_emr_reinforce.py`) |
| Neural embedding resonance | declared |
| Cross-agent constitutional enforcement of thresholds | declared |
| MCP write tools (`emr_remember` / `emr_upsert`) | **partial** — draft-only, flag-gated; see `tests/test_emr_write.py` |
