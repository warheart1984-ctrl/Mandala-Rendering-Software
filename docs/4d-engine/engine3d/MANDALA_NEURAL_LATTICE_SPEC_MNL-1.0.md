# Mandala Neural Lattice Specification (MNL-1.0)

> **Status of this document: DECLARED — visualization standard, not a shipped visualizer.**  
> Drive-G-1: RFC 2119 language is specification prose. Partial mapping exists in
> `@mrs/engine3d-core` (`DefaultMandalaMapping`); WebGPU Mandala runtime is **not**
> implemented.

**Standard:** MNL-1.0  
**Date:** 2026-07-26  
**Related:** [CIEMS_ENGINE3D_CONSTITUTION_v1.0.md](./CIEMS_ENGINE3D_CONSTITUTION_v1.0.md)

## 1. Purpose

The Mandala Neural Lattice (MNL) is the constitutional visualization standard for
Engine3D replay and governance data. It provides a structured, interpretable,
neural-like lattice representation of temporal, spatial, and governance signals.

## 2. Lattice Structure

### 2.1 Nodes

Each node represents a ReplayRecord.

```ts
interface MandalaNode {
  id: string;
  position: [number, number];
  activation: number;
  channel: string;
}
```

### 2.2 Edges

Edges represent temporal continuity.

```ts
type Edge = [from: string, to: string];
```

### 2.3 Channels

Channels classify node semantics:

- `engine3d`
- `physics`
- `substrate`
- `governance`
- `glyphs`

*(Current mapper emits `engine3d` only.)*

## 3. Mapping Specification

### 3.1 Replay → Lattice

| Source | Target |
|--------|--------|
| `ReplayRecord.tickIndex` | `Node.id` as `tick-${tickIndex}` |
| `ReplayRecord.time` | `Node.position[0]` |
| `visualMod.shaderParams.glyphIntensity` | `Node.position[1]` |
| `visualMod.shaderParams.glyphCount` | `Node.activation` |

**Evidence:** `DefaultMandalaMapping.mapReplayToLattice` (unit-tested).

### 3.2 Governance → Lattice

| Source | Target |
|--------|--------|
| `GovernanceSignal.severity` | Node activation modifier |
| `GovernanceSignal.position3D` | Optional spatial overlay |

*(Governance→lattice merge: declared — not in mapper yet.)*

## 4. Rendering Requirements

The Mandala Visualizer MUST:

- render nodes in temporal order
- render edges between consecutive nodes
- apply governance overlays
- preserve deterministic layout

**Evidence today:** deterministic layout of the pure mapper is tested; WebGPU
render pass is **declared** (see SPEC deferred section / RFC).

## 5. Constitutional Constraints

- No lattice MAY be rendered without governance signals. *(Declared visualizer rule.)*
- No lattice MAY omit replay evidence.
- No lattice MAY reorder nodes.

## 6. Implementation status

| Piece | Status |
|-------|--------|
| `MandalaNode` / `MandalaLattice` types | partial (in-core) |
| `mapReplayToLattice` | partial (tested) |
| Governance overlay on lattice | declared |
| WebGPU Mandala pipeline | declared / deferred |
