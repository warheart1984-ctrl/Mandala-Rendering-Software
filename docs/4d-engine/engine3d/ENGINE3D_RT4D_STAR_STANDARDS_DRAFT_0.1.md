# Engine3D → RT4D + 4D Star Standards (Draft 0.1)

> **Document status:** DRAFT 0.1 — normative intent with mixed implementation status.  
> Drive-G-1: do not treat every section as enforced. Status tags below are authoritative.

**Package:** `@mrs/engine3d-core`  
**Related:** [ENGINE3D_SCENE_BRIDGE_SPEC_v1.0](./ENGINE3D_SCENE_BRIDGE_SPEC_v1.0.md),
[ENGINE3D_WORLD_OBJECT_MATERIAL_SPEC_v1.0](./ENGINE3D_WORLD_OBJECT_MATERIAL_SPEC_v1.0.md)

---

## 1. Engine3D → RT4D compilation

| ID | Requirement | Status |
|----|-------------|--------|
| E3D-RT4D-1 | Identical worldDocument → identical RT4D primitives | **enforced** (star + mandala tests) |
| E3D-RT4D-2 | Primitives carry UniversalMaterial metadata (`rt4dMaterial`) | **enforced** |
| E3D-RT4D-3 | Geometry mapping: capsule/cylinder/torus→oriented_capsule; sphere→hypersphere; lattice roles → glass/metal/emissive capsule *spec roles* | **partial** (`materialRole` keeps PathTracer lattice ids; `provenance.specRole` carries glass_capsule / metal_capsule / emissive_capsule) |
| E3D-RT4D-4 | Provenance: origin node, material ID, generator seed, integrity hash | **enforced** on worldDocument→RT4D path |
| E3D-RT4D-5 | Replayable compilation | **enforced** (seed + params) |

**SoT:** `src/scene/WorldDocumentRt4d.ts`

---

## 2. UniversalMaterial (15 types)

Catalog via `createDefaultMaterialCatalog()` — all 15 types. Soft-raster approximates Fresnel glass, GGX-ish metal, SSS lift, hair anisotropy (**partial** shading; not Cycles).

| ID | Requirement | Status |
|----|-------------|--------|
| UM-1 | type + parameters | **enforced** |
| UM-2 | catalog version / generator origin / integrity | **partial** (`MATERIAL_CATALOG_VERSION`; world asset provenance) |
| UM-3 | soft-raster behavior approximations | **partial** |
| UM-4 | bind to meshes / capsules / hyperspheres | **enforced** |

---

## 3. Material Catalog Registry

| ID | Requirement | Status |
|----|-------------|--------|
| MCR-1 | Catalog entries with id/type/params | **enforced** |
| MCR-2 | Default catalog = 15 types + lattice + star presets when attached | **enforced** (star worlds attach star presets) |
| MCR-3 | Catalog version immutable string | **enforced** (`MATERIAL_CATALOG_VERSION = "1.0.0"`) |
| MCR-4 | Generators attach full catalog | **enforced** (mandala + star) |

---

## 4. RT4D capsule geometry

| ID | Requirement | Status |
|----|-------------|--------|
| RT4D-1 | Oriented capsule (a, b, radius, material) | **enforced** |
| RT4D-2 | Hypersphere (center, radius, material) | **enforced** |
| RT4D-3 | Lattice capsules (glass_tube / chrome_joint / core_glow) | **enforced** |
| RT4D-4 | Deterministic construction | **enforced** |
| RT4D-5 | Material binding | **enforced** |
| RT4D-6 | Provenance on capsules | **enforced** (worldDocument path) |

**Orientation quaternion:** **declared** (Engine3D transform uses Euler; RT4D uses endpoints).

---

## 5. Bridge Schema 1.2

Schema id: `engine3d-bridge-scene/1.2`

| ID | Requirement | Status |
|----|-------------|--------|
| BS-1.2-1 | `oriented_capsule` | **enforced** |
| BS-1.2-2 | Material metadata via materialHint + rt4dMaterial on compile path | **partial** |
| BS-1.2-3 | Provenance fields on primitives; optional `rt4dStar` composite | **partial** (worldDocument bridge primitives carry provenance; World3D capture path may omit) |
| BS-1.2-4 | Backward compatible with 1.1 hyperspheres | **enforced** |

---

## 6. Constitutional rendering charter (Engine3D)

| ID | Principle | Status |
|----|-----------|--------|
| CR-1 | Determinism | **partial** (bridge + star/mandala generators) |
| CR-2 | Material governance via UniversalMaterial | **enforced** |
| CR-3 | Provenance on outputs | **partial** |
| CR-4 | Replayability | **partial** |
| CR-5 | Interop via Bridge 1.2 | **partial** |
| CR-6 | No ungoverned geometry | **partial** (generators only) |

---

## 7. RT4D 4D Star

**Artifact:** `Rt4dStar` — hypersphere core + N hypercapsule arms + optional halo.

| ID | Requirement | Status |
|----|-------------|--------|
| RT4D-STAR-1..4 / S1..S4 | Core, arms, provenance, determinism | **enforced** (`create4dStarWorld`, `worldDocumentToRt4dStar`) |
| UM-STAR-1..3 | Distinct core/arm(/halo) materials in catalog | **enforced** |
| WGEN-STAR-1..4 | `create4dStarWorld` / `createWorldGenerator("star")` | **enforced** |
| BR-STAR-1..3 | Emit composite + decompose for runtimes | **enforced** (composite + flat primitives) |
| INT-STAR-ARM-* | Analytic ray–hypercapsule | **enforced** via existing `OrientedCapsule` in renderer-core (not re-derived here) |
| MANDALA-STAR-* | CIEMS binding / evidence role | **declared** |

**API:**

```js
import { create4dStarWorld, worldDocumentToRt4dPrimitives } from "@mrs/engine3d-core";

const world = create4dStarWorld({
  seed: 42,
  coreRadius: 0.35,
  armRadius: 0.08,
  armCount: 8,
  armLength: 1.8,
  includeHalo: true,
});
const prims = worldDocumentToRt4dPrimitives(world);
```

---

## 8. Honest gaps (roadmap)

- Full CIEMS / CPS evidence chain for MandalaStar4D: **declared**
- Bridge capture from live `World3D` → auto-attach `rt4dStar`: **declared**
- PathTracer lattice materials keyed by `um_star_*` without role alias: **partial** (mapped to glass_tube / core_glow)
- Storyforge prompt front-end: **out of band** — see Genblaze/CROS bans; integrate as a *pre-renderer adapter*, not inside CROS
