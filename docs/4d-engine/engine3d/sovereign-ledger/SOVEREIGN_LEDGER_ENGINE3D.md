# Sovereign Ledger — Engine3D Artifacts

> **Status of this document: DECLARED — design ledger entries, not runtime-enforced ratification.**  
> Editorial choice: the original design text used `Status: Ratified`. Per Drive-G-1,
> that wording would overclaim enforcement. Each entry below uses
> **`Status: Declared (spec)`**. Content hashes remain `<sha256>` placeholders
> (TBD) — this agent does not invent evidence hashes.  
> These entries live under `docs/4d-engine/engine3d/sovereign-ledger/` and are
> **not** auto-appended to `G:\DRIVE_G_LAWS.md`.

**Date:** 2026-07-26  
**Home:** this directory (Engine3D-local)

---

## Entry 1 — Engine3D Constitutional Loop

| Field | Value |
|-------|--------|
| Artifact | `ENGINE3D_EXECUTION_LOOP` |
| Version | 1.0 |
| Hash | `<sha256>` (TBD) |
| Summary | Defines the immutable 7-stage EngineHost loop. |
| Status | Declared (spec) |
| Implementation note | Loop order **enforced** in `@mrs/engine3d-core` tests; ledger “ratification” is not a runtime gate. |

---

## Entry 2 — GPUContract Standard

| Field | Value |
|-------|--------|
| Artifact | `GPU_CONTRACT_STANDARD` |
| Version | 1.0 |
| Hash | `<sha256>` (TBD) |
| Summary | Defines constitutional constraints on GPU usage. |
| Status | Declared (spec) |
| Implementation note | No scheduler/GPUContract runtime in this drop. |

---

## Entry 3 — ReplayRecord Standard

| Field | Value |
|-------|--------|
| Artifact | `REPLAY_RECORD_STANDARD` |
| Version | 1.0 |
| Hash | `<sha256>` (TBD) |
| Summary | Defines immutable replay evidence format. |
| Status | Declared (spec) |
| Implementation note | `ReplayRecord` type + frozen append copies are **partial**; cluster ledger store declared. |

---

## Entry 4 — Mandala Neural Lattice Standard

| Field | Value |
|-------|--------|
| Artifact | `MANDALA_NEURAL_LATTICE` |
| Version | MNL-1.0 |
| Hash | `<sha256>` (TBD) |
| Summary | Defines lattice structure, mapping, and governance integration. |
| Status | Declared (spec) |
| Implementation note | Mapping helper **partial**; visualizer/WebGPU declared. See [MANDALA_NEURAL_LATTICE_SPEC_MNL-1.0.md](../MANDALA_NEURAL_LATTICE_SPEC_MNL-1.0.md). |

---

## Entry 5 — CIEMS Governance Rulebook

| Field | Value |
|-------|--------|
| Artifact | `CIEMS_GOVERNANCE_RULEBOOK` |
| Version | 1.0 |
| Hash | `<sha256>` (TBD) |
| Summary | Defines governance rules for Engine3D. |
| Status | Declared (spec) |
| Doc | [CIEMS_GOVERNANCE_RULEBOOK_v1.0.md](../CIEMS_GOVERNANCE_RULEBOOK_v1.0.md) |

---

## Entry 6 — Engine3D Cluster Wire Protocol

| Field | Value |
|-------|--------|
| Artifact | `ENGINE3D_WIRE_PROTOCOL` |
| Version | 1.0 |
| Hash | `<sha256>` (TBD) |
| Summary | Defines Channels A–B–C for cluster communication. |
| Status | Declared (spec) |
| Doc | [ENGINE3D_CLUSTER_AND_WIRE_PROTOCOL_SPEC_v1.0.md](../ENGINE3D_CLUSTER_AND_WIRE_PROTOCOL_SPEC_v1.0.md) |
