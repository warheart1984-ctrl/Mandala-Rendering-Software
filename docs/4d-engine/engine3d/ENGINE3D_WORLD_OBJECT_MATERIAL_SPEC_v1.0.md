# Engine3D WorldObject & Material Specification v1.0

## Purpose

This specification defines Engine3D's universal scene model. HumanRig is one object kind inside this model, not a separate rendering universe.

## WorldObject

`WorldObject` is the base entity for all 3D content:

- `id: string`
- `kind: "primitive" | "mesh" | "rig" | "light" | "camera" | "group"`
- `transform: Transform`
- `geometry: GeometryRef | null`
- `material: MaterialRef | null`
- `children: WorldObject[]`

`Transform` uses:

- `position: [number, number, number]`
- `rotation: [number, number, number]` or quaternion `[number, number, number, number]`
- `scale: [number, number, number]`

`GeometryRef` may declare:

- `primitiveType: "sphere" | "box" | "plane" | "cylinder" | "torus"`
- `meshId: string`
- `rigId: string`
- `sdfId: string`
- `sdfParams: Record<string, number>`

## Materials

`UniversalMaterial` declares:

- `id: string`
- `type: "basic" | "metal" | "glass" | "emissive" | "skin" | "hair" | "cloth" | "plastic" | "wood" | "stone"`
- `baseColor: [number, number, number]`
- `roughness: number`
- `metallic: number`
- `emissive: [number, number, number]`
- `textureRefs: TextureRef[]`

Procedural material extensions include `neon-grid`, `mandala-core`, `tesseract-surface`, `sovereign-glyph`, and `energy-lattice`.

## World Document

An `Engine3DWorldDocument` contains:

- `schemaVersion: "engine3d-world/1.0"`
- `id: string`
- `objects: WorldObject[]`
- `materials: UniversalMaterial[]`
- `lights: WorldObject[]`
- `cameras: WorldObject[]`
- `activeCameraId: string`

The code-level contract is exported from `@mrs/engine3d-core` as `WorldObject`, `UniversalMaterial`, and `Engine3DWorldDocument`.
