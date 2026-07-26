# Engine3D Cluster, GPU Scheduler & Wire Protocols

**Status:** declared / not implemented  
**Date:** 2026-07-26  
**Authority:** Drive-G-1 — documentation must not outrun evidence.

This RFC captures the distributed Engine3D topology and wire contracts from the
ENGINE3D COMPLETION PLAN. Nothing in this document is enforced by CI unless a
matching implementation and test exist under `mrs/packages/engine3d-core/`.

## 1. Cluster topology (declared)

| Service | Role |
|---------|------|
| `engine3d-node` | Runs EngineHost + physics + substrate + headless renderer |
| `engine3d-gpu-scheduler` | Allocates GPU time across nodes under GPUContract |
| `engine3d-governance` | CIEMS governance + replay analysis |
| `engine3d-visualizer` | Mandala Neural Lattice + governance overlay UI |

Proposed compose shape (not shipped as separate packages in this PR):

```yaml
# DECLARED — do not treat as present capability
services:
  engine3d-node:
    build:
      context: ./mrs/packages/engine3d-core
    deploy:
      replicas: 4
    environment:
      NODE_ROLE: engine-node
  engine3d-gpu-scheduler:
    environment:
      NODE_ROLE: gpu-scheduler
  engine3d-governance:
    environment:
      NODE_ROLE: governance
  engine3d-visualizer:
    ports: ["8080:8080"]
    environment:
      NODE_ROLE: visualizer
```

## 2. GPUContract / scheduler (declared)

```ts
export interface GPUContract {
  id: string;
  maxFrameTimeMs: number;
  maxMemoryMB: number;
  priority: "low" | "normal" | "high";
  governanceTag: string; // e.g. "ciems:governed"
}

export interface GPUQueue {
  nodeId: string;
  pendingFrames: number;
  contract: GPUContract;
}

export interface GPUScheduler {
  registerQueue(queue: GPUQueue): void;
  allocate(): void;
}
```

Allocation policy (declared): highest priority, then lowest `pendingFrames`.

## 3. CIEMS overlay (partial in-core)

Pure helper `DefaultCIEMSOverlay` lives in `engine3d-core` with unit tests.
It is **not** wired into `DefaultEngineHost.engineTick` (host remains
deterministic six-step + replay). Cluster governance emission remains declared.

## 4. Mandala lattice mapping (partial in-core)

Pure helper `DefaultMandalaMapping.mapReplayToLattice` is unit-tested.
The visualizer service / WebGPU lattice renderer is **declared**.

## 5. Wire protocols — Channel A / B / C (declared)

### Channel A — HTTP JSON control plane

- `POST /v1/tick-batch` — submit deterministic tick requests
- `GET /v1/replay/:nodeId` — fetch in-memory replay timeline snapshot
- `POST /v1/governance/signals` — publish GovernanceSignal[]

### Channel B — gRPC frame / metrics (proto sketch)

```protobuf
syntax = "proto3";
package engine3d.v1;

message Vec3 { float x = 1; float y = 2; float z = 3; }

message TickMetrics {
  string node_id = 1;
  uint64 tick_index = 2;
  double time = 3;
  double dt = 4;
  uint32 body_count = 5;
  uint32 glyph_count = 6;
}

message ReplayChunk {
  string node_id = 1;
  repeated TickMetrics ticks = 2;
}

service Engine3DControl {
  rpc ReportMetrics(TickMetrics) returns (Empty);
  rpc PullReplay(ReplayRequest) returns (ReplayChunk);
}

message Empty {}
message ReplayRequest { string node_id = 1; uint64 from_tick = 2; }
```

### Channel C — GPU schedule signals (declared)

Scheduler → node: `RenderNow { nodeId, contractId, deadlineMs }`  
Node → scheduler: `QueueDepth { nodeId, pendingFrames, lastFrameMs }`

## 6. WebGPU / Docker honesty

- Node 20 does **not** include WebGPU by default.
- The CI Docker image for `engine3d-core` is lean and runs the **null headless**
  renderer; it does not install X11/GL/Dawn.
- Real GPU output requires a browser `navigator.gpu` or a Dawn/wgpu binding.

## 7. Implementation evidence today

| Item | Status |
|------|--------|
| Single-process EngineHost loop | enforced in `@mrs/engine3d-core` |
| CIEMSOverlay / MandalaMapping pure functions | partial |
| Multi-node compose / gRPC / GPU scheduler packages | declared |
