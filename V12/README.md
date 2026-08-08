# V12 — Evidence-Linked Architecture Documentation

> **Status:** enforced (documentation is a first-class artifact)
> **Author:** warheart1984-ctrl <warheart1984@gmail.com>
> **Created:** 2026-08-07
> **Implementation commit:** `59b1378`
> **Purpose:** Make the architecture traceable. Every decision carries a
> Decision ID, timestamp, author, rationale, alternatives rejected, and
> evidence — so that months from now, code can be traced back to intent.

## Why V12 exists

V12 is the evidence-linked documentation root for the constitutional
architecture. It exists to answer one question: **"Where did this
architecture come from?"** — and to make that answer reproducible:

```
Idea → decision → implementation → test → artifact → evidence
```

Documentation here is part of the architecture, not an afterthought.

## Provenance trail

| Stage | Location | Evidence |
|-------|----------|----------|
| Idea / decision | `V12/ADR/*.md` | Decision ID, rationale, alternatives rejected |
| Decision records | `V12/PROVENANCE/decision-chain.json` | Machine-readable ADRs |
| Implementation | `src/` (commit `59b1378`) | Git history |
| Test | `V12/VALIDATION/test-results/` | 98/98 suites pass |
| Artifact | artifact SHA-256 hashes in ADRs | Content-addressed |
| Replay identity | `V12/VALIDATION/replay-results/` | Replay tokens, determinism probe |
| Governance conformance | `V12/VALIDATION/conformance-results/` | 16/16 checks pass |
| Security | `V12/VALIDATION/security-results/` | Audit results |

## Map

```
V12
├── README.md                    ← this file
├── ARCHITECTURE.md              ← system layers and boundaries
├── CONSTITUTION.md              ← constitutional charter and contracts
├── INVARIANTS.md                ← invariants that must never break
├── EXECUTION-CONTRACT.md        ← intent → authority → timeline → render
├── GOVERNANCE.md                ← policies and the governance pipeline
├── DETERMINISM.md               ← determinism and replay guarantees
├── SECURITY.md                  ← security posture and controls
├── REPLAY.md                    ← replay identity and verification
├── EVIDENCE.md                  ← evidence model and artifact binding
├── API.md                       ← constitutional engine API surface
├── THREAT-MODEL.md              ← threats and mitigations
├── ADR/
│   ├── ADR-0001-v12-origin.md
│   ├── ADR-0002-execution-substrate.md
│   ├── ADR-0003-deterministic-execution.md
│   ├── ADR-0004-constitutional-gates.md
│   └── ADR-0005-dar-z-separation.md
├── PROVENANCE/
│   ├── lineage.json             ← idea→…→evidence chain
│   ├── architecture-history.json← event log
│   └── decision-chain.json      ← machine-readable ADRs
└── VALIDATION/
    ├── test-results/            ← 98/98 pass (constitution suite)
    ├── security-results/        ← audit log
    ├── replay-results/          ← determinism/replay probe
    └── conformance-results/     ← 16/16 checks pass
```

## Authoring rules

Every new decision or change to this tree must:

1. Be authored — every record carries `author` (name + email).
2. Be timestamped — ISO-8601 UTC.
3. Cite evidence — commit, test, artifact hash, or replay identity.
4. Update `PROVENANCE/` when a decision is added or implemented.
5. Re-run and commit validation results when implementation changes.

## Legal note

This documentation establishes a **technical provenance trail**. It does
not by itself determine legal ownership. Ownership, rights, and licensing
are governed by contracts, contributor status, licenses (MIT), and
applicable law — see `CITATION.cff` and `LICENSE`.
