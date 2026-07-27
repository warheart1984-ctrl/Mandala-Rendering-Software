# ENGINE3D_CONSTITUTIONAL_SUITE_v1.0

Unified constitutional bundle for Engine3D structure stills, camera, materials,
conformance, and Genblaze polish / RT4D background composition.

| Field | Value |
|-------|--------|
| Version | 1.0 |
| Status | **Declared** (normative intent). Chapters mark *declared* vs *enforced by tests* |
| Domain | CIEMS → Engine3D Structure Layer |
| Package | `@mrs/engine3d-core` + Genblaze Media |
| Related | [ENGINE3D_SCENE_BRIDGE_SPEC_v1.0](./ENGINE3D_SCENE_BRIDGE_SPEC_v1.0.md), [ENGINE3D_STRUCTURE_RECORD_SCHEMA_v1.0.json](./ENGINE3D_STRUCTURE_RECORD_SCHEMA_v1.0.json), [ENGINE3D_CINEMATIC_FOUNDATION_v1.0](./ENGINE3D_CINEMATIC_FOUNDATION_v1.0.md) |

> **Drive-G-1:** Do not claim portrait photorealism from RT4D hypersphere bridges.
> Faces/skin in final PNGs require a declared structure source (`engine3d_raster` /
> `engine3d_composite` / `flux_plate`) plus optional diffusion polish.

## Chapter status board

| Chapter | Artifact | Status |
|---------|----------|--------|
| 1 | Structure + polish + RT4D pipeline | **declared**; Genblaze `/api/engine3d-still` **prepared** |
| 2 | Structure record schema | **declared** (JSON Schema file); write path **prepared** |
| 3 | Conformance test suite | **partial** — raster still tests enforce C-1/C-2/R-3 |
| 4 | Camera cinematic framing (v1.1) | **declared** |
| 5 | Material PBR extensions | **declared** (UniversalMaterial already has metallic/roughness) |
| 6 | Cinematic foundation (timeline / short sequence) | **prepared** — see [ENGINE3D_CINEMATIC_FOUNDATION_v1.0](./ENGINE3D_CINEMATIC_FOUNDATION_v1.0.md); farm/8K **skeleton** |
| Bridge | SceneBridge → RT4D spheres | **partial** — **not** a portrait structure source |

---

## CHAPTER 1 — Pipeline (Engine3D → polish → RT4D background)

### Principle

No portrait realism without declared structure. Engine3D raster owns subject
geometry; polish owns skin/hair realism; RT4D owns mandala/lattice backgrounds.

```
Engine3D (WorldMesh / HumanRig / StaticMesh)
        │
        ▼
Structure AOVs: beauty.png, depth.png?, normal.png?
        │
        ├──── optional ────► RT4D background still
        │                           │
        │                           ▼
        └──────────────► composite_structure.png
                                │
                                ▼
                     polish (fal FLUX img2img)
                                │
                                ▼
                         Final portrait PNG
```

### Constitutional rules

1. Portrait `structure_png` origin ∈ `{ engine3d_raster, engine3d_composite, flux_plate }` — never `rt4d_sphere_bridge`.
2. Faces/skin in the final PNG → polish provider must be set; do not claim MRS path-traced skin.
3. RT4D may provide background only unless explicitly composited under `structure_source: engine3d_composite`.
4. SceneBridge hypersphere capture remains for 4D/lattice experiments — not anatomical structure.

---

## CHAPTER 2 — Structure record schema

Canonical JSON Schema: [ENGINE3D_STRUCTURE_RECORD_SCHEMA_v1.0.json](./ENGINE3D_STRUCTURE_RECORD_SCHEMA_v1.0.json).

Required fields: `schemaVersion`, `run_id`, `world_id`, `camera_id`, `beauty_path`,
`structure_source`, `timestamp`.

Invariants:

- `structure_source` MUST be declared.
- `beauty_path` MUST exist and be readable when a still is produced.
- If `polished_png_path` exists, `polish_strength` and `polish_prompt` MUST be present.

---

## CHAPTER 3 — Conformance test suite (summary)

| ID | Check | Status |
|----|-------|--------|
| C-1 | Camera width/height > 0; PNG dims match | **enforced** (raster-still tests) |
| C-2 | near > 0, far > near; depth normalized | **enforced** |
| R-2 | beauty (+ optional depth/normal) produced | **enforced** |
| R-3 | All AOVs match camera resolution | **enforced** |
| S-1 | Structure record completeness | **prepared** |
| S-2 | Replay byte-identical beauty | **partial** (soft raster deterministic) |

---

## CHAPTER 4 — Camera cinematic framing (v1.1 extensions)

Advisory fields on raster camera requests (declared):

- `cinematicDepthIntent?: "shallow" | "medium" | "deep"`
- `focalLengthMm?: number` (portraits prefer 50–135mm equivalent)
- `aspectLabel?: "16:9" | "2.39:1" | "4:5" | "custom"`

Clause CF-1: for portraits, lookAt SHOULD align with subject eye region.

---

## CHAPTER 5 — Material PBR (minimal)

`UniversalMaterial` already declares `baseColor`, `metallic`, `roughness`, `emissive`.

Raster still MVP: Lambert + simple specular from a single directional light.
Beauty uses shading; depth/normal AOVs remain purely geometric.

---

## Relationship to Scene Bridge

[ENGINE3D_SCENE_BRIDGE_SPEC_v1.0](./ENGINE3D_SCENE_BRIDGE_SPEC_v1.0.md) defines
body/mesh → hypersphere capture for RT4D adapters. That path **must not** be used
as the structure source for portrait polish. Portrait structure uses
`HeadlessStillRenderer` / `renderEngine3dStill` beauty (and optional composite).
