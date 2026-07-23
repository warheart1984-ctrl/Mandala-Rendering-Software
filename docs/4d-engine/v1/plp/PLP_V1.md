# PLP v1 — Projection & Lineage Protocol

> **Status:** **declared** (RFC-style). Thin JS stub: **skeleton**.  
> Schemas: [../schemas/](../schemas/) · Constitution Art. III · SPEC Part III

## Abstract

PLP defines how a **WorldDocument** is observed into a host-consumable **Scene3D** plus a **LineageBundle** that preserves provenance from 4D entities to projected nodes. Hosts (Unity, Unreal, browser) MUST NOT invent 4D state when only Scene3D is present.

## Terminology

| Term | Definition |
| --- | --- |
| World | WorldDocument v1 instance |
| ObservationMode | Named projection / slice parameters |
| Scene3D | Projected triangle/line/point graph for a 3D host |
| LineageBundle | Maps projected node ids → source entity ids + mode |
| `projectWorld` | Constitutional API producing Scene3D + LineageBundle |

## Observation modes (declared)

`modeId` values (extensible):

| modeId | Intent | Params (typical) | Evidence today |
| --- | --- | --- | --- |
| `drop_w` | \((x,y,z,w)\mapsto(x,y,z)\) | — | LiveLink DropW (**skeleton**/experimental) |
| `perspective_w` | Perspective divide by \(d_4 - w\) | `d4`, optional `nearClip` | `project4Dto3D` (**partial**) |
| `scale_by_w` | Scale xyz by \((1 + s\cdot w)\) | `s` | LiveLink ScaleByW (**skeleton**) |
| `offset_y_by_w` | \(y' = y + s\cdot w\) | `s` | LiveLink OffsetYByW (**skeleton**) |
| `slice_hyperplane` | Intersect / clip by hyperplane | `normal`, `offset` | `SlicingPlane` / hyperplane math (**partial**) |

Schema: `ObservationMode.v1.schema.json`.

## Pipeline stages

```
WorldDocument
    → [1] schema validate          (partial: npm script)
    → [2] resolve geometry         (skeleton: surfaces in stub)
    → [3] apply ObservationMode    (skeleton / partial math)
    → [4] emit Scene3D             (skeleton)
    → [5] emit LineageBundle       (skeleton stubs)
    → [6] host adapter bind        (Unity FourDAdapter skeleton)
```

## Scene3D (declared shape)

Minimum:

- `schemaVersion`: `"1.0"`
- `id`: string
- `nodes[]`: `{ id, name?, mesh?, transform?, materialId?, meta? }`
- `meshes[]` optional top-level library: `{ id, positions, normals?, indices?, primitive? }`
- `materials[]` optional projected material refs

`positions` are 3D (`[x,y,z,...]` flat). Schema: `Scene3D.v1.schema.json`.

## LineageBundle (declared shape)

- `schemaVersion`: `"1.0"`
- `worldId`: string
- `observation`: ObservationMode (embedded or ref)
- `entries[]`: `{ projectedNodeId, sourceEntityId, geometryKind?, notes? }`
- `generatedAt?`: ISO string (optional; hosts may stamp)

Schema: `LineageBundle.v1.schema.json`.

## Invariants

| ID | Invariant | Enforcement today |
| --- | --- | --- |
| **PL-1** | Projection does not mutate the WorldDocument in place | **declared** (stub returns new objects) |
| **PL-2** | Every projected renderable node has a lineage entry | **declared** (stub aims to satisfy; not proven in CI beyond smoke) |
| **PL-3** | Lineage `worldId` matches input world `id` | **declared** |
| **PL-4** | ObservationMode identity is recorded in the bundle | **declared** |
| **PL-5** | Adapters treat Scene3D as observation, not as 4D SoT | **declared** in FourDAdapter README |

## API — `projectWorld`

```js
import { projectWorld } from "@mrs/renderer-core/plp"; // or package path exported

const { status, scene3D, lineageBundle } = projectWorld(world, {
  modeId: "perspective_w",
  params: { d4: 4 }
});
// status === "skeleton" | "partial" until fuller pipeline lands
```

### Stub behavior (honest)

Current stub (**skeleton**):

- Accepts WorldDocument-like objects and ObservationMode.
- For `geometry.kind === "surface"` with a known surface id, samples vertices via renderer-core surfaces when available and projects with `project4Dto3D`.
- Returns Scene3D-shaped meshes (may be empty on failure) and lineage stubs.
- Sets `status: "skeleton"` — **does not** claim full PLP conformance.

Path: `mrs/packages/renderer-core/src/plp/projectWorld.js`.

## Host live consumption (**declared**)

Unreal `UFourDLiveLinkClient` **declares** a `ProjectionRequest` / `ProjectionResponse` JSON bridge that carries `scene3D` + `lineageBundle` (see [UNREAL_LIVE_PROJECTION.md](../adapters/UNREAL_LIVE_PROJECTION.md)). Intended producer is a gateway around `projectWorld`. This is **not** Unity LiveLink wire parity and is **not** proven end-to-end.

## Non-goals

- Computing 4D physics inside PLP.
- Replacing Unity LiveLink wire protocol (may interoperate later — **roadmap**).
- Guaranteeing watertight meshes or host shading parity.
