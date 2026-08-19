# CPC-v1.0 — Constitutional Pruning Contract

> **Status:** **declared** (spec). No ASGC/CEP/RCC/SVC runtime is imported or
> enforced by this repository yet — every reclaimable artifact keeps its
> working file until an **enforced** tagged pass exists and a scheduled
> constitutional job has run under evidence.
> **Trail:** `docs/governance/cecp/trails/constitutional-pruning-2026-08/` *(declared)*
> **Prior:** none (new contract; formalizes substrate/evidence/replay/shader
> retention as one governance layer).
> **Drive-G note:** Drive G is the working substrate that must fight corruption
> — growth without evidence-linked pruning *is* corruption. This contract is the
> standing rule for reclaiming that substrate safely.

## Governing invariant

**No pruning without evidence.**

Every reclaimable artifact is pruned only when all three hold:

1. **Evidence of non-use** — a measured read/use count over its policy window
   (not "nobody remembers it").
2. **A surviving justification path** — at least one verifiable evidence path
   remains for every constitutional decision that touched it.
3. **A replayable canonical state** — for any audited epoch, a canonical replay
   chain reproduces the constitutional state after the prune.

**Pruning is a scheduled constitutional job, not ad-hoc cleanup.** Ad-hoc `rm`
is a constitutional violation. The schedule is the authority; the evidence is
the proof; the replay chain is the audit.

## Scope

| Volume | Controller | Example contents |
|--------|-----------|------------------|
| `substrate/`, `cache/`, `models/`, `tmp/`, `build/` | ASGC | kernels, model caches, shader packs, temp assets, derived builds |
| `evidence/`, `logs/`, `traces/`, `decisions/` | CEP | atomic events, derived claims, constitutional decisions |
| `replay/`, `.cnode-trace`, timeline files, state deltas | RCC | replay histories, state snapshots, intent/decision sequences |
| `shaders/`, `kernels/`, GPU caches, pipeline configs | SVC | shader/kernel variants, feature/usage/performance profiles |

Out of scope: `src/`, `schemas/`, `docs/` (source of truth), git history
(branch/tag pruning is git policy, not CPC).

## Volume controllers

### 1. ASGC — Adaptive Substrate Garbage Collector

Every adaptive artifact carries a **Substrate Lifecycle Record (SLR)**:

| Field | Meaning |
|-------|---------|
| `origin` | engine/intent that produced it |
| `epoch` | time window of production |
| `use-count` | how often actually read |
| `evidence-link` | which decisions/replays depend on it |

Policy tiers:

| Tier | Rule |
|------|------|
| Hot | recently used; pinned — never touched |
| Warm | used within `N` days; compress but keep |
| Cold | no reads in `N` epochs; candidate for deletion |
| Dead | no evidence references; hard delete |

**Invariant:** No substrate deletion without checking evidence links. An
artifact with a live evidence-link is never Dead, regardless of age.

### 2. CEP — Constitutional Evidence Pruner

Evidence is a DAG: **atomic events** (logs, traces, metrics) → **derived
claims** (summaries, aggregates) → **constitutional decisions** (authority /
validation nodes).

Pruning strategies:

| Strategy | Meaning |
|----------|---------|
| Collapse | replace long raw traces with **signed summaries** |
| Windowing | full detail for last `N` days; summarized beyond |
| Anchoring | keep "anchor events" that define major state changes |
| Redaction | remove redundant/low-value detail once summarized |

**Invariant:** Every constitutional decision retains at least one verifiable
evidence path. CEP never deletes the last path — it only compresses and
coalesces.

### 3. RCC — Replay Chain Compactor

A replay chain is: **initial state → intents → decisions → state transitions.**

Compaction modes:

| Mode | Meaning |
|------|---------|
| Checkpointing | periodic full snapshots; discard intermediate micro-steps |
| Delta coalescing | merge tiny deltas into coarse-grained segments |
| Branch pruning | keep canonical branches; drop failed/abandoned ones after `N` days |

**Invariant:** For any audited epoch, at least one canonical replay chain
reproduces the constitutional state. RCC trades granularity for auditability —
never for opacity.

### 4. SVC — Shader Variant Consolidator

Each variant carries a **feature vector** (active toggles/defines), a **usage
profile** (scenes/frames/workloads that used it), and a **performance profile**
(latency/throughput/error rates).

Consolidation strategy: **cluster** variants by feature+performance similarity →
**select canonical** (1–2 representatives per cluster) → **deprecate** the rest
(grace period) → **delete** after grace → **regenerate on demand** from
canonical + diff.

**Invariant:** No scene loses a performant, valid shader path — it only loses
redundant variants. Deprecated ≠ deleted until the grace period elapses.

## Volume → contract binding

| Volume | Controller | Bound invariant |
|--------|-----------|-----------------|
| substrate | ASGC | no deletion without evidence-link check |
| evidence | CEP | no decision loses its last verifiable path |
| replay | RCC | every audited epoch stays replayable |
| shader/kernel | SVC | every scene keeps a performant valid path |

## The single clause

A prune is lawful only when it carries, in its prune record:

1. **evidence of non-use** (ASGC: SLR read counts; CEP: window + path audit;
   RCC: delta age + branch status; SVC: usage/performance profile),
2. **a surviving justification path** (the evidence DAG still reaches the
   affected decisions after the prune),
3. **a replayable canonical state** (the RCC chain reproduces the epoch).

No prune without all three. No prune without a scheduled job run. No prune
without a signed prune record (what, why, which evidence, which replay path).

## Error state machine (fail loud)

`OK` · `NO_SLR` · `LIVE_EVIDENCE_LINK` · `NO_JUSTIFICATION_PATH` ·
`NO_REPLAYABLE_STATE` · `UNSCHEDULED_PRUNE` · `PRUNE_SIGNATURE_MISSING`

Each is a refusal to prune plus a written reason — never a forced delete.

## How to run (declared; becomes enforced pass)

```bash
# Dry-run sweep: report candidates per controller, touch nothing.
python mrs/tools/cpc/sweep.py --dry-run

# Scheduled job (constitutional): prune only lawful candidates, sign records.
python mrs/tools/cpc/sweep.py --apply --epoch <epoch-id> --schedule <schedule-file>

# Verify: every prune in this epoch still has its 3 proofs.
python mrs/tools/cpc/verify.py --epoch <epoch-id>
```

Until `sweep.py` exists and passes a review trail, the contract is **declared
only** — no artifact is pruned by spec claim alone.

## Module paths

- Contract: `mrs/docs/governance/cecp/CONSTITUTIONAL_PRUNING_CONTRACT_v1.0.md` (this file)
- Schedule (declared): `mrs/tools/cpc/schedule.example.json`
- Sweep / verify (declared, absent): `mrs/tools/cpc/{sweep,verify}.py`
- Trails: `mrs/docs/governance/cecp/trails/constitutional-pruning-2026-08/`
