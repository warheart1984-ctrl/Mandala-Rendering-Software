# Compose · Compiler · Rosetta

Three **different jobs**. Do not fuse the physics.

The projection equation and axiom chain live in **[`CONTRACT.md`](./CONTRACT.md)**. This note names the split and the shared-state bridge. It does not rewrite that contract.

Status tags follow AGENTS.md: **enforced** / **partial** / **declared** / **skeleton**.

---

## The three jobs

| Job | What it is | What it is not | Status |
|-----|------------|----------------|--------|
| **Compose** | Operators compose **inside one contract**. math4d is the composer for the [projection contract](./CONTRACT.md). `transformPipeline` is that composition. | Not a holography compiler. The renderer must not invent what “4D” means in shading. | **enforced** (JS/CPU; see CONTRACT.md) |
| **Compiler** | Contract → backend. Hardware is executor. CPU / GLSL / WebGPU / Vulkan must answer the [backend question](./CONTRACT.md#backend-contract-question). math4d/JS is the current **enforced** compiler target for *projection*. Chamber holography GLSL is a **partial** compiler target for a *different* contract (bulk→boundary). | Not a drop-in \(\mathcal{R}\) of the projection equation. Not a compiler of ρ / \(h_{ij}\). | Projection JS/CPU **enforced**; holography GLSL **partial**; holography GPU raster **declared** |
| **Rosetta** | Thin bridge of **shared chamber state** between two contracts. They share a world clock and actors. They do **not** share \(\Pi\). | Not a claim that `EntanglementRenderer` **is** \(\Pi_{3\to 2}\circ\Pi_{4\to 3}\circ R_4\). | **partial** (state mapping only) |

Elegant math can be the wrong physics. Keep three layers ([CONTRACT.md](./CONTRACT.md#three-layers-do-not-collapse)): mathematical correctness, numerical correctness, physical validity. Passing 1 and 2 does not prove 3.

---

## Two contracts (do not collapse)

| Contract | SoT | Physics |
|----------|-----|---------|
| Projection | `mrs/packages/renderer-core/src/math4d/` (`transformPipeline`) · [PIPELINE.md](./PIPELINE.md) · [CONTRACT.md](./CONTRACT.md) | Euclidean \(\mathbb{R}^4\), SO(4), hyperplane slice, ordinary 3D camera |
| Holography | `mandala/holography/` (`EntanglementRenderer`, `shaders/holographic.vert\|.frag`) · [HOLOGRAPHIC_BULK_BOUNDARY.md](../mandala/HOLOGRAPHIC_BULK_BOUNDARY.md) | Bulk→boundary, ρ / \(h_{ij}\) / COMPOSITE, time as EGT relationships |

Chamber wire (holography): `scripts/simulation-chamber.mjs --holo` → `simulation-chamber-holo.mjs` → `mandala/engine/chamber/holo-loop.mjs` → `buildHolographicBuffers` → `.bin` + `watch.html`.

Stub to ignore: `mrs/packages/renderer-core/src/render/rt4d/holographic/`.

**Do not** make holography “just the rasterizer” of math4d. **Do not** make math4d a compiler of ρ / \(h_{ij}\).

---

## Shared state (what Rosetta maps)

Keys only. No rewrite of either \(\Pi\).

| Key | Projection reading | Holography reading | Shared? |
|-----|--------------------|--------------------|---------|
| \(X\) | World point \((x,y,z,w)\in\mathbb{R}^4\) | Actor / observer / defect in the chamber lattice | Envelope only — coordinates are not the same chart |
| \(t\) | Frame / track time | `BulkSpacetimeEngine` clock (`bulk.state.t`) | **World clock** |
| time-as-\(w\) | Temporal extrusion \(V=\{(x,w)\mid w=t\}\) (**partial**) | Clock value may be copied onto \(X.w\); holography time is EGT relationships, **not** extrusion | Clock value, **not** the same physics of time |
| camera | `Camera4D` pose / view \(R_4(X-C)\) | Movie Lane observer `{x,y,z,t}` — **not** `Camera4D` | Pose envelope; not the same projector |
| provenance | `intentId` / `worldId` / `timelineId` / `timeSeconds` / `parameters` | `renderIdentity`, scene id, frame index | Record fields |
| `outDir` | Chamber / debug output directory | Same | Path |

API:

- Lexicon + envelope: `@mrs/renderer-core/math4d` → `JOBS`, `buildSharedState`, `ROSETTA_STATUS`
- Chamber adapters: `mandala/engine/chamber/rosetta.mjs` → `mapHoloFrameToSharedState` (wired from `holo-loop.mjs`)

---

## Honest non-claims

- Rosetta does **not** evaluate the projection equation. That is compose (`evaluateMathContract`).
- Chamber GLSL is **not** a compiler target of the projection contract.
- `EntanglementRenderer` is **not** \(\mathcal{R}\) of math4d.
- No GPU fps claim. Holography GPU raster remains **declared**.

## Tests

```bash
cd mrs/packages/renderer-core && npm run test:math4d
node --test mandala/engine/chamber/rosetta.test.mjs
```
