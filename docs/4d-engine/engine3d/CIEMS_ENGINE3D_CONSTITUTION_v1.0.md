# CIEMS–ENGINE3D Constitution v1.0

> **Status of this document: DECLARED — Engine3D-scoped constitutional charter, not runtime-enforced.**  
> This is **not** the repository root constitution (`constitution/CHARTER.md` /
> `engine/constitution/charter.js`). It does **not** modify AGENTS.md or other
> protected governance paths. Drive-G-1: RFC 2119 language below is specification
> prose; conformance is **not** implemented except where linked tests exist.

**Title:** Constitutional Charter for the Engine3D Execution Environment  
**Version:** 1.0  
**Date:** 2026-07-26  
**Scope:** `docs/4d-engine/engine3d/` and `mrs/packages/engine3d-core/` only

## Preamble

This Constitution establishes the governing principles, rights, duties, and
constraints for the Engine3D Execution Environment within the CIEMS Sovereignty
Stack. Engine3D is recognized as a constitutional subsystem whose operations
must be deterministic, auditable, replayable, and subject to governance oversight.

This Constitution binds all Engine3D Nodes, GPU Schedulers, Governance Engines,
Visualizers, and any auxiliary processes participating in the Engine3D cluster
**(when such a cluster exists)**. Present evidence: single-process
`@mrs/engine3d-core` host loop only.

## Article I — Authority

### Section 1. Constitutional Authority

Engine3D derives its authority from CIEMS, the Constitutional Intelligence
Execution and Management System. All Engine3D operations must conform to CIEMS
constitutional principles **as declared for this subsystem**.

### Section 2. Delegated Authority

Engine3D Nodes are granted authority to execute the EngineHost loop, subject to:

- deterministic execution
- replay evidence generation
- GPUContract compliance *(declared — cluster not shipped)*
- governance signal interpretation *(partial — pure helpers tested)*

### Section 3. Prohibited Authority

Engine3D Nodes SHALL NOT:

- allocate GPU resources without a valid GPUContract
- render frames without governance context *(declared cluster rule; null renderer today does not require signals)*
- mutate replay evidence *(partial — frozen copies on append)*
- bypass constitutional invariants *(partial — force-clear + VisualMod-before-render enforced)*

## Article II — Rights

### Section 1. Right to Determinism

Every Engine3D Node has the right to deterministic execution. No external
process may introduce nondeterministic behavior.

### Section 2. Right to Replay Evidence

Every governance decision must reference replay evidence. Nodes have the right
to produce replay records without interference.

### Section 3. Right to Constitutional Review

Any Engine3D subsystem may request constitutional review of:

- GPU allocation decisions
- governance signals
- substrate transformations
- renderer overlays

*(Review workflow: declared.)*

## Article III — Duties

### Section 1. Duty of Evidence

Nodes MUST produce a ReplayRecord for every tick.  
**Evidence today:** `DefaultEngineHost` appends to `ReplayTimeline` (tested).

### Section 2. Duty of Contract Compliance

Nodes MUST adhere to GPUContract limits (`maxFrameTimeMs`, `maxMemoryMB`,
`priority`, `governanceTag`).  
**Evidence today:** declared — no scheduler runtime.

### Section 3. Duty of Governance Integration

Nodes MUST apply governance signals to visualMod via CIEMSOverlay.  
**Evidence today:** `DefaultCIEMSOverlay` unit-tested; **not** wired into
`engineTick`.

### Section 4. Duty of Transparency

Nodes MUST expose `tickIndex`, `dt`, `time`, `inputs`, `visualMod` to governance
engines.  
**Evidence today:** fields exist on `ReplayRecord`; Channel B HTTP/gRPC declared.

## Article IV — Invariants

### Section 1. Execution Order

The EngineHost loop SHALL follow the immutable sequence:

1. Gather  
2. Bridge  
3. Apply/Clear Forces  
4. Physics  
5. Substrate  
6. Render  
7. Replay  

**Evidence today:** host-order + constitutional phase-trace tests.

### Section 2. Evidence Precedence

No decision SHALL occur without referencing ReplayRecordID. *(Declared for cluster.)*

### Section 3. Contract Precedence

No GPU allocation SHALL occur without referencing GPUContractID. *(Declared.)*

### Section 4. Governance Precedence

No visualization SHALL occur without governance signals. *(Declared for visualizer service.)*

## Article V — Enforcement

### Section 1. Constitutional Violations

Violations SHALL be reported to CIEMS Governance Engine. *(Declared.)*

### Section 2. Remedies

Governance Engine MAY:

- downgrade priority
- revoke GPUContract
- issue critical governance signals
- suspend node execution

*(Remedies: declared.)*

## Article VI — Amendments

Amendments require:

- majority approval of CIEMS Governance Engine
- compatibility with constitutional invariants
- publication in the Engine3D Sovereign Ledger docs under
  `docs/4d-engine/engine3d/sovereign-ledger/`

*(Amendment process: declared design; not an automated ledger.)*
