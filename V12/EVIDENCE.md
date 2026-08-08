# EVIDENCE.md — V12

> **Author:** warheart1984-ctrl
> **Updated:** 2026-08-07

## Evidence model

Evidence is any record that can answer *"why is this true / this here?"*
Evidence must be **id, worldId, timelineId** bound
(`evidence.bundle-fields` conformance check) and may be dual-required
(`evidence.dual-require`).

```
Evidence
 ├── id
 ├── worldId
 ├── timelineId
 ├── type / payload
 ├── constitutionalHash
 └── replayToken (replay identity)
```

## Evidence in this tree

Every claim in V12 cites one or more of:

| Kind | Example |
|------|---------|
| Commit | `59b1378` (src subsystem) |
| Test | `V12/VALIDATION/test-results/constitution-suite.txt` (98/98) |
| Conformance | `V12/VALIDATION/conformance-results/conformance-run.txt` (16/16) |
| Artifact hash | SHA-256 of contract files (see ADRs) |
| Replay identity | replay probe record `2d7665292cc4ad67` |

## Provenance chain

`lineage.json` records the full chain per subsystem:

```
idea (ADR) → decision (decision-chain.json)
  → implementation (commit) → test (VALIDATION/)
    → artifact (SHA-256) → evidence (this tree)
```

## Rules

1. No claim without evidence (lawbook R4).
2. Status tags must be accurate: enforced / partial / declared / skeleton.
3. Evidence files are committed alongside the change that produced them.
