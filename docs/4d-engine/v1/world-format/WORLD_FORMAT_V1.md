# World Format v1 — WorldDocument

> **Status:** **declared** (JSON Schema + example + TS DTOs).  
> Runtime loaders that ingest WorldDocument end-to-end are **not** claimed.  
> Normative schema: [../schemas/WorldDocument.v1.schema.json](../schemas/WorldDocument.v1.schema.json)  
> Proto sketch (conceptual): [WorldDocument.v1.proto](./WorldDocument.v1.proto)

## Purpose

World Format v1 defines an authored **4D world** document: entities in \(\mathbb{R}^4\), materials, optional default observation hints, and metadata. Hosts and tools **project** worlds via PLP; they do not treat a single 3D mesh dump as the source of truth.

## Relationship to other scene contracts

| Contract | Package / path | Relationship |
| --- | --- | --- |
| **WorldDocument v1** | this format | Multi-entity 4D SoT (**declared**) |
| **Scene4DDTO** | `@mrs/scene-schema` | Parallel ChatGPT/widget DTO (**partial**). May be derived lossily from a one-surface world; must not be broken |
| **GovernedWorld** | `schemas/World.schema.json` | CIEMS constitutional host world (**partial**) |
| **Scene4D (SDF)** | `renderer-core/schemas/Scene4D.schema.json` | SDF render scene (**partial**) |

## Document shape

```json
{
  "schemaVersion": "1.0",
  "id": "world.example.clifford-lab",
  "name": "Clifford lab",
  "description": "Declared example world for schema validation",
  "units": "meters",
  "materials": [
    {
      "id": "mat.wire-cyan",
      "color": "#6ec8ff",
      "opacity": 1,
      "wireframe": true
    }
  ],
  "entities": [
    {
      "id": "ent.clifford",
      "name": "Clifford torus",
      "transform4d": {
        "translate": [0, 0, 0, 0],
        "rotate": { "xw": 0.2, "zw": 0.1 },
        "scale": [1, 1, 1, 1]
      },
      "geometry": {
        "kind": "surface",
        "surfaceId": "clifford-torus",
        "resolution": 48
      },
      "materialId": "mat.wire-cyan",
      "tags": ["demo", "surface"]
    }
  ],
  "defaultObservation": {
    "modeId": "perspective_w",
    "params": { "d4": 4, "d3": 4 }
  },
  "metadata": {
    "status": "declared",
    "createdBy": "docs/4d-engine/v1"
  }
}
```

Canonical checked-in example: [`examples/scenes/world-document-v1-example.json`](../../../../examples/scenes/world-document-v1-example.json).

Validate:

```bash
npm run validate:world-document
```

## Field notes

### `schemaVersion`

Const `"1.0"` for v1. Future versions bump deliberately; no silent breaking changes.

### `transform4d`

- `translate`: length-4 number array \([x,y,z,w]\).
- `rotate`: optional plane angles (radians) keyed `xy|xz|xw|yz|yw|zw`.
- `scale`: length-4 number array (default all 1).

Aligns with rotation-plane vocabulary used by `Scene4DDTO` / renderer-core (**partial** evidence in those packages).

### `geometry.kind`

| kind | Meaning | Engine support today |
| --- | --- | --- |
| `surface` | Named parametric surface id | **partial** — renderer-core surface registry |
| `meshRef` | External mesh / asset uri | **declared** only |
| `sdfRef` | Reference into SDF Scene4D asset | **declared** only |
| `empty` | Transform marker / locator | **declared** |

`surfaceId` values SHOULD use **renderer-core registry ids** when `kind === "surface"` (e.g. `clifford-torus`, `tesseract`, `hopf-surface`, `trefoil-4d`, `torus-3d`). ChatGPT `Scene4DDTO` uses underscore aliases (`clifford_torus`, …) mapped via `mrs/apps/chatgpt-mrs/server/src/mrs-adapter/surface-map.ts` — do not conflate the two id spaces.

### `defaultObservation`

Optional hint for PLP; not a substitute for explicit `ObservationMode` at project time.

## Non-goals (v1)

- Claiming binary interchange or protobuf codegen (proto is a **sketch**).
- Replacing CIEMS `GovernedWorld` or ChatGPT `Scene4DDTO`.
- Embedding full timeline / ISL / CKL policy inside WorldDocument (those remain CIEMS concerns).
