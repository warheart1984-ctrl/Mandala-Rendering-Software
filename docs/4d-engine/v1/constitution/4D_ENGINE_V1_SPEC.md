# 4D Engine v1 — Constitutional Specification

> **Status:** **constitutional / declared**  
> Companion charter: [4D_ENGINE_V1_CONSTITUTION.md](./4D_ENGINE_V1_CONSTITUTION.md)  
> Index: [../README.md](../README.md)

This specification expands Articles I–X into implementable contracts. Soft verbs (**declares**, **aligns with**, **prepares**) apply unless a path is tagged with stronger evidence.

---

## Part I — Dimensional model

### I.1 Space

- Points: \(p = (x,y,z,w) \in \mathbb{R}^4\).
- Vectors and affine transforms act in \(\mathbb{R}^4\).
- Rotations: plane angles \(\theta_{xy},\theta_{xz},\theta_{xw},\theta_{yz},\theta_{yw},\theta_{zw}\).

### I.2 Observation vs world

| Concept | Meaning | Status |
| --- | --- | --- |
| World | WorldDocument entities in \(\mathbb{R}^4\) | **declared** |
| Observation | Result of PLP `projectWorld` | **declared** (+ **skeleton** stub) |
| Presentation | Host mesh / material / camera in 3D engine | Unity/Unreal/browser **partial/skeleton** |

### I.3 Existing math surfaces (evidence)

| Symbol / API | Path | Status |
| --- | --- | --- |
| `project4Dto3D` | `renderer-core/src/math/project.js` | **partial** |
| `composeRotations` / SO(4) | `mat4.js`, `so4.js` | **partial** |
| Surfaces (tesseract, Clifford, Hopf, …) | `src/surfaces/` | **partial** |
| Hyperplane / slice | `camera/SlicingPlane.js`, `math/hyperplane.js` | **partial** |

---

## Part II — World Format & scene graph

### II.1 WorldDocument v1

Normative narrative: [WORLD_FORMAT_V1.md](../world-format/WORLD_FORMAT_V1.md).  
JSON Schema: [WorldDocument.v1.schema.json](../schemas/WorldDocument.v1.schema.json).  
TypeScript DTO: `@mrs/scene-schema` → `world-document.ts` (**declared** DTOs; does not replace `Scene4DDTO`).

### II.2 Relation to Scene4DDTO

```
WorldDocument (multi-entity, 4D SoT)     Scene4DDTO (single surface widget)
        │                                        │
        │  declared view / extract (lossy)       │
        └──────────────► optional Scene4DDTO ────┘
                         for ChatGPT App tools
```

| Concern | WorldDocument | Scene4DDTO |
| --- | --- | --- |
| Scope | Multi-entity world | One surface + rotations + camera + material |
| Audience | Engine / adapters / PLP | ChatGPT App / tool contract |
| Schema | WorldDocument.v1 | scene-schema `Scene4DDTO` |
| Status | **declared** | **partial** (used by app) |

**Rule:** Do not break ChatGPT `Scene4DDTO`. WorldDocument is a **parallel** contract.

### II.3 Relation to GovernedWorld / SDF Scene4D

- `schemas/World.schema.json` — CIEMS constitutional entities/components (**partial**).
- `Scene4D.schema.json` — SDF tree + camera path for CLI render (**partial**).
- Neither is superseded by WorldDocument; migrations are **roadmap**.

### II.4 Entity model (declared)

Minimum fields (see schema for full constraints):

- `id`, `name?`, `transform4d` (translate, rotate planes, scale)
- `geometry` — `kind`: `surface` \| `meshRef` \| `sdfRef` \| `empty`
- `materialId?`, `tags?`, `userData?`

---

## Part III — Projection & Lineage Protocol (PLP)

Normative: [PLP_V1.md](../plp/PLP_V1.md).

### III.1 API

```ts
projectWorld(world: WorldDocument, mode: ObservationMode): {
  status: "declared" | "partial" | "skeleton";
  scene3D: Scene3D;
  lineageBundle: LineageBundle;
}
```

### III.2 Pipeline stages (declared)

1. Validate WorldDocument (schema) — **partial** via `npm run validate:world-document`
2. Resolve entities / geometry samples — **skeleton** (surfaces only in stub)
3. Apply observation mode (drop-w, perspective-w, slice, …) — **skeleton** / uses existing project helpers where applicable
4. Emit `Scene3D` meshes / nodes — **skeleton**
5. Emit `LineageBundle` (entity → projected node ids, mode id, params) — **skeleton** stubs
6. Host adapter consumes Scene3D + lineage — Unity **skeleton**

### III.3 Invariants PL-1…PL-5

See PLP doc. **Declared**; stub does not machine-prove all invariants.

---

## Part IV — Physics (deferred)

| Item | Status |
| --- | --- |
| Product physics in Engine v1 core | **deferred / roadmap** |
| `RigidBody4D` etc. in renderer-core | **skeleton** experimental |
| Adapter-side pseudo-physics from Scene3D only | Out of scope unless explicitly labeled host-local |

---

## Part V — Editor

| Surface | Status | Evidence |
| --- | --- | --- |
| ChatGPT create/update/replay scene tools | **partial** | `mrs/apps/chatgpt-mrs/server/src/tools/` |
| Unity MRS Inspector window | **skeleton** | `Assets/Engine/Inspector/Editor/` |
| FourDImporterWindow / SliceController | **skeleton** | `Assets/Engine/FourDAdapter/Editor/` |
| Full 4D DCC | **roadmap** | — |

---

## Part VI — Staged delivery strategy

**Status:** **strategic positioning (declared)**

Aligns with Constitution Article VI. No dates or SLAs are committed here.

---

## Part VII — Strategic positioning (declared)

Restates Constitution Article VII. Host engines are presentation substrates; Engine v1 is an observation/compute layer **when implemented**. Competitive “Unity of 4D” wording is **forbidden** under Drive-G-1 unless evidence appears.

---

## Part VIII — Economic notes (declared / softened)

Restates Constitution Article VIII. No pricing, marketplace, or token claims.

---

## Part IX — Product thesis (declared)

Restates Constitution Article IX with the evidence table in the constitution index README.

---

## Part X — Conformance & validation

| Check | Command / artifact | Status |
| --- | --- | --- |
| WorldDocument example validates | `npm run validate:world-document` | **partial** |
| Existing package tests | `npm test` | must remain green |
| PLP stub smoke | imported by validation / unit if present | **skeleton** |
| Unity FourDAdapter | compile in Editor | **skeleton** (not CI-verified here) |
| Machine enforcement of Articles | — | **not enforced** |

### X.1 Scorecard refresh rule

When implementation catches a **declared** item, upgrade status in:

1. This SPEC / constitution tables  
2. `docs/4d-engine/v1/README.md`  
3. Root `README.md` capability snapshot (weak verbs)  
4. `constitution/CHARTER.md` cross-link section  

Do not upgrade marketing ahead of the scorecard.
