# CIEMS Governance Rulebook v1.0

> **Status of this document: DECLARED — operational counterpart to the Engine3D Constitution; not runtime-enforced as a cluster policy engine.**  
> Drive-G-1: Rules use RFC 2119 language as specification prose. Partial
> enforcement exists only where `@mrs/engine3d-core` tests prove behavior.

**Title:** Constitutional Governance Rules for Engine3D  
**Version:** 1.0  
**Date:** 2026-07-26  
**Companion:** [CIEMS_ENGINE3D_CONSTITUTION_v1.0.md](./CIEMS_ENGINE3D_CONSTITUTION_v1.0.md)

This Rulebook defines how CIEMS is intended to govern Engine3D Nodes, GPU
Schedulers, Substrate Engines, Renderers, and Visualizers.

## Rule 1 — Evidence Precedence

**Statement:** All governance decisions MUST reference at least one ReplayRecordID.  
**Rationale:** Governance must be evidence-based, not speculative.  
**Enforcement (declared):** Governance Engine rejects any decision lacking replay evidence.  
**In-core today:** N/A (no decision API).

## Rule 2 — Contract Precedence

**Statement:** All GPU allocations MUST reference a GPUContractID.  
**Rationale:** GPU usage is a constitutional resource governed by contract.  
**Enforcement (declared):** GPU Scheduler denies allocation requests without contract.  
**In-core today:** N/A (no scheduler). Tests for this rule are **skipped/deferred**.

## Rule 3 — Deterministic Execution

**Statement:** Engine3D Nodes MUST execute the EngineHost loop in the locked order.  
**Enforcement:** Compliance tests verify order; governance signals emitted on violation *(signal emission declared)*.  
**In-core today:** host-order + constitutional phase-trace tests (**enforced**).

## Rule 4 — Governance Overlay Requirement

**Statement:** Renderers MUST apply governance signals via CIEMSOverlay before rendering.  
**Enforcement (declared):** Renderer rejects visualMod lacking governance context.  
**In-core today:** `DefaultCIEMSOverlay` tested; **not** required by `NullHeadlessRenderer`. Renderer-reject test **deferred**.

## Rule 5 — Replay Integrity

**Statement:** ReplayRecords MUST be immutable once submitted.  
**Enforcement (partial):** `InMemoryReplayTimeline` stores frozen record copies; mutation throws in strict mode.  
**Cluster ledger append-only store:** declared.

## Rule 6 — Substrate Transparency

**Statement:** Substrate transformations MUST be deterministic and auditable.  
**Enforcement (partial):** substrate determinism test (deep-equal of two updates).  
**Lifted4D → visualMod audit log service:** declared.

## Rule 7 — Mandala Integration

**Statement:** Mandala Visualizer MUST incorporate governance signals into lattice rendering.  
**Enforcement (declared):** Visualizer rejects lattice bundles lacking governance signals.  
**In-core today:** mapping without signal gate; visualizer-reject test **deferred**.

## Rule 8 — Constitutional Violations

**Statement:** Violations MUST emit critical governance signals.  
**Enforcement (partial):** default DSL rules can push `critical` / `warn` signals when evaluated.  
**Automatic violation→signal wiring in EngineHost:** declared / not wired.

## Textual DSL (future)

A text form `governance/engine3d.rules.ciems` (`rule <id> when <condition> then <action>`)
is **declared**. The in-core implementation ships **hand-compiled** pure functions in
`src/governance/rules/defaultRules.ts`. A real `.ciems` parser is **future / optional**.
