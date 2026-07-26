# CIEMS–ENGINE3D Cluster and Wire Protocol Specification v1.0

> **Status of this document: DECLARED — normative specification, not runtime-enforced.**  
> Drive-G-1 / AGENTS.md: conformance to this document is **not** implemented or enforced in CI
> except where an explicit code+test link exists under `mrs/packages/engine3d-core/`.  
> RFC 2119 keywords (MUST / SHALL / MAY) below are the specification’s own conformance language;
> they do not imply present capability.

**Date:** 2026-07-26  
**Companion (design sketch):** [ENGINE3D_CLUSTER_AND_WIRE_PROTOCOL_RFC.md](./ENGINE3D_CLUSTER_AND_WIRE_PROTOCOL_RFC.md)  
**This SPEC is normative for the wire protocol.** The RFC remains a shorter design note and
SHALL defer to this document on conflicts.

## 1. Status of This Document

This document defines the constitutional wire protocol for the CIEMS–ENGINE3D
cluster. It is **declared normative** for all future implementations of:

- Engine3D Nodes
- GPU Scheduler
- Governance Engine
- Mandala Visualizer

Conformance to this specification is **required** for participation in a CIEMS-
governed Engine3D cluster **once** such a cluster is implemented. As of this
writing, multi-node compose, gRPC services, and signature verification are
**not** shipped.

## 2. Terminology

**Engine3D Node**: A process that executes the EngineHost loop (gather → bridge →
apply/clear forces → physics → substrate → render → replay).

**GPU Scheduler**: A process that allocates GPU time to Engine3D Nodes under a
GPUContract.

**Governance Engine**: A CIEMS process that consumes replay evidence and emits
governance signals.

**Mandala Visualizer**: A process that renders Mandala Neural Lattice views from
replay and governance data.

**ReplayRecord**: A structured record of a single Engine3D tick, including
inputs and visualMod. *(Partial in-core: `InMemoryReplayTimeline`.)*

**GPUContract**: A constitutional contract describing permitted GPU usage.
*(Declared — not enforced at runtime.)*

**GovernanceSignal**: A structured governance message associated with Engine3D
state. *(Partial in-core: DSL + `DefaultCIEMSOverlay`.)*

## 3. Constitutional Principles

### 3.1 Evidence Requirement

No governance or scheduling decision SHALL occur without referencing at least
one ReplayRecord identifier.

### 3.2 Contract Requirement

No GPU allocation SHALL occur without referencing a GPUContract identifier.

### 3.3 Overlay Requirement

No visualization SHALL occur without at least one GovernanceSignal in scope.

### 3.4 Determinism Requirement

All protocol messages MUST be deterministic and replayable. Implementations
SHALL NOT rely on hidden state.

### 3.5 Signature Requirement

All HTTP messages MUST include:

- `X-CIEMS-Version: 1.0`
- `X-Engine3D-Version: 1.0`
- `X-CIEMS-Signature: <sha256>`

The signature MUST be computed over the canonical JSON body.
*(Signature computation and verification: declared / TBD — do not invent hashes.)*

## 4. Channel A: Engine3D Node ↔ GPU Scheduler

### 4.1 Purpose

Channel A governs GPU allocation decisions for Engine3D Nodes.

### 4.2 HTTP JSON Endpoints

#### 4.2.1 POST `/scheduler/register`

Registers a GPU queue and its GPUContract.

Request body:

```json
{
  "nodeId": "node-01",
  "pendingFrames": 12,
  "contract": {
    "id": "gpu-contract-node01",
    "maxFrameTimeMs": 4,
    "maxMemoryMB": 512,
    "priority": "high",
    "governanceTag": "ciems:governed"
  }
}
```

#### 4.2.2 POST `/scheduler/request`

Requests an allocation decision.

```json
{
  "nodeId": "node-01",
  "pendingFrames": 12,
  "lastReplayRecordId": "replay-204"
}
```

Response:

```json
{
  "renderNow": true,
  "reason": "high-priority, lowest pendingFrames",
  "allocationId": "alloc-882",
  "contractId": "gpu-contract-node01"
}
```

### 4.3 gRPC Service (declared sketch)

Proto and services below are **declared only**. They are intentionally **not**
checked into `mrs/packages/engine3d-core/` as live packages so CI cannot imply
they run. Full combined proto:

```protobuf
syntax = "proto3";
package engine3d.v1;

message Empty {}
message RegisterAck { bool ok = 1; }
message VisualizerAck { bool accepted = 1; }

message Vec3 { float x = 1; float y = 2; float z = 3; }

message GPUContract {
  string id = 1;
  int32 maxFrameTimeMs = 2;
  int32 maxMemoryMB = 3;
  string priority = 4;
  string governanceTag = 5;
}

message GPUQueue {
  string nodeId = 1;
  int32 pendingFrames = 2;
  GPUContract contract = 3;
}

message AllocationRequest {
  string nodeId = 1;
  int32 pendingFrames = 2;
  string lastReplayRecordId = 3;
}

message AllocationDecision {
  bool renderNow = 1;
  string reason = 2;
  string allocationId = 3;
  string contractId = 4;
}

service GPUScheduler {
  rpc RegisterQueue(GPUQueue) returns (RegisterAck);
  rpc RequestAllocation(AllocationRequest) returns (AllocationDecision);
}

message EngineInputs {
  double time = 1;
  double dt = 2;
  // bodies / vertices omitted in sketch — see ReplayRecord JSON schema
}

message VisualMod {
  repeated float colors = 1;
  repeated float scales = 2;
  map<string, double> shader_params = 3;
}

message ReplayRecord {
  int32 tickIndex = 1;
  double time = 2;
  double dt = 3;
  EngineInputs inputs = 4;
  VisualMod visualMod = 5;
}

message GovernanceSignal {
  string id = 1;
  string severity = 2;
  string message = 3;
  repeated double position3D = 4;
}

message GovernanceSignals {
  repeated GovernanceSignal signals = 1;
}

service Governance {
  rpc SubmitReplay(ReplayRecord) returns (GovernanceSignals);
}

message MandalaNode {
  string id = 1;
  repeated double position = 2;
  double activation = 3;
  string channel = 4;
}

message Edge {
  string from = 1;
  string to = 2;
}

message MandalaLattice {
  repeated MandalaNode nodes = 1;
  repeated Edge edges = 2;
}

message LatticeBundle {
  MandalaLattice lattice = 1;
  repeated GovernanceSignal signals = 2;
}

service Visualizer {
  rpc PushLattice(LatticeBundle) returns (VisualizerAck);
}
```

## 5. Channel B: Engine3D Node ↔ Governance Engine

### 5.1 Purpose

Channel B conveys replay evidence and returns governance signals.

### 5.2 HTTP JSON Endpoint

#### 5.2.1 POST `/governance/replay`

```json
{
  "record": {
    "tickIndex": 204,
    "time": 3.264,
    "dt": 0.016,
    "inputs": { "time": 3.264, "dt": 0.016, "bodies": [], "vertices": [] },
    "visualMod": {
      "colors": [1, 1, 1, 1],
      "scales": [1],
      "shaderParams": { "glyphCount": 1, "glyphIntensity": 0.5 }
    }
  }
}
```

Response:

```json
{
  "signals": [
    {
      "id": "gov-crit-01",
      "severity": "critical",
      "message": "Frame time exceeded contract",
      "position3D": [0, 1, 0]
    }
  ]
}
```

### 5.3 Partial in-core evidence

Pure rule evaluation (`createDefaultEngine3DRules` / `Engine3DRules.evaluate`)
and `DefaultCIEMSOverlay.applySignals` are **unit-tested** in
`@mrs/engine3d-core`. They are **not** wired to HTTP/gRPC Channel B.

## 6. Channel C: Governance Engine ↔ Mandala Visualizer

### 6.1 Purpose

Channel C conveys MandalaLattice plus GovernanceSignals to the visualizer.

### 6.2 HTTP JSON Endpoint

#### 6.2.1 POST `/visualizer/lattice`

```json
{
  "lattice": {
    "nodes": [
      {
        "id": "tick-204",
        "position": [3.264, 0.5],
        "activation": 1,
        "channel": "engine3d"
      }
    ],
    "edges": [["tick-203", "tick-204"]]
  },
  "signals": [
    {
      "id": "gov-crit-01",
      "severity": "critical",
      "message": "Frame time exceeded contract",
      "position3D": [0, 1, 0]
    }
  ]
}
```

### 6.3 Partial in-core evidence

`DefaultMandalaMapping.mapReplayToLattice` is **unit-tested**. The visualizer
service and WebGPU Mandala render path are **declared**.

## 7. Conformance

An implementation conforms to this specification if:

1. It implements all required endpoints for its role.
2. It enforces the constitutional principles in Section 3.
3. It produces and consumes messages that validate against the defined schemas.

**Current repo status:** single-process EngineHost + partial governance/mandala
helpers only. Cluster bootstrap, gRPC server/client, and signature verification
remain **declared / deferred**.

## 8. Deferred (explicitly not shipped)

| Item | Status |
|------|--------|
| Live `proto/engine3d_cluster.proto` package | Declared (fenced above) |
| gRPC server/client TypeScript | Declared (not in tree) |
| `scripts/bootstrap-engine3d-cluster.sh` | Declared (not in tree) |
| Multi-node docker-compose services | Declared (see RFC) |
| WebGPU Mandala visualizer runtime | Declared |
| Engine3D → RT4D SceneBridge (single-process) | Partial — see [ENGINE3D_SCENE_BRIDGE_SPEC_v1.0.md](./ENGINE3D_SCENE_BRIDGE_SPEC_v1.0.md) |
| Cluster RenderCoordinator Channels A/B/C | Declared — **not** implemented by SceneBridge |
