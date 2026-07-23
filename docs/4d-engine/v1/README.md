# 4D Engine v1 — index

> **Drive-G-1 / Drive-G-2:** This tree declares constitutional architecture and formats.  
> It does **not** claim that a complete 4D engine, editor, physics stack, or host adapters are implemented.  
> Status tags: **constitutional / declared** · **partial** · **skeleton** · **roadmap**.

## Map

| Area | Path | Status |
| --- | --- | --- |
| Constitution (Articles I–X) | [constitution/4D_ENGINE_V1_CONSTITUTION.md](./constitution/4D_ENGINE_V1_CONSTITUTION.md) | **constitutional / declared** |
| Detailed specification (Parts I–X) | [constitution/4D_ENGINE_V1_SPEC.md](./constitution/4D_ENGINE_V1_SPEC.md) | **constitutional / declared** |
| World Format v1 | [world-format/WORLD_FORMAT_V1.md](./world-format/WORLD_FORMAT_V1.md) | **declared** (+ JSON Schema) |
| WorldDocument schema | [schemas/WorldDocument.v1.schema.json](./schemas/WorldDocument.v1.schema.json) · [`schemas/4d-engine/v1/`](../../../schemas/4d-engine/v1/) | **declared** |
| Proto sketch | [world-format/WorldDocument.v1.proto](./world-format/WorldDocument.v1.proto) | **declared** (conceptual; no generated stubs) |
| Projection & Lineage Protocol | [plp/PLP_V1.md](./plp/PLP_V1.md) | **declared** (+ schemas; thin JS stub) |
| Unity adapter | [adapters/UNITY_ADAPTER_V1.md](./adapters/UNITY_ADAPTER_V1.md) · `unity/.../FourDAdapter/` | **skeleton** |
| Unreal adapter | [adapters/UNREAL_ADAPTER_V1.md](./adapters/UNREAL_ADAPTER_V1.md) · `unreal/FourDAdapter/` | **skeleton** (+ v1.1 **declared** subsystem docs) |
| Unreal v1.1 subsystem docs | [adapters/UNREAL_SUBSYSTEM_ENHANCEMENTS.md](./adapters/UNREAL_SUBSYSTEM_ENHANCEMENTS.md) · Sequencer / Materials / Debugger / Live / W-encoding | **declared** / **skeleton** / **roadmap** |
| Example world | [examples/scenes/world-document-v1-example.json](../../../examples/scenes/world-document-v1-example.json) | **declared** example |
| Validate example | `npm run validate:world-document` | **partial** (schema check only) |

Also mirrored under [`docs/4drs/constitution/`](../../4drs/constitution/) for discoverability from 4DRS docs.

## What exists in MRS today vs declared here

| Capability | In-repo evidence today | 4D Engine v1 claim |
| --- | --- | --- |
| Parametric surfaces + projection math | `@mrs/renderer-core` surfaces, `math/project.js` | **partial** — observation helpers exist; PLP pipeline not fully enforced |
| RT4D path engine | `src/render/rt4d/` | **partial** — renderer path, not “Unity of 4D” |
| Scene4DDTO (ChatGPT / tools) | `@mrs/scene-schema` `Scene4DDTO` | **partial** — parallel widget DTO; not WorldDocument |
| ChatGPT App entry | `mrs/apps/chatgpt-mrs/` | **partial** — Stage-4-shaped product path |
| World JSON (governed host) | `schemas/World.schema.json`, `demo/worlds/` | **partial** — CIEMS world; distinct from WorldDocument v1 |
| 4D Inspector (MRS-IC) | inspector package + Unity Editor window | **skeleton** |
| Unity LiveLink | `Assets/Engine/LiveLink/` | **skeleton** / experimental |
| FourDAdapter (scene3D + lineage) | `Assets/Engine/FourDAdapter/` (Unity) · `unreal/FourDAdapter/` (UE) | **skeleton** — consumes projected output; does not compute 4D |
| 4D physics | `RigidBody4D` / colliders | **skeleton** — deferred as product physics (Art. IV) |
| Full editor / economy / adapters as products | — | **roadmap** / **strategic positioning (declared)** |

## Cross-links

- Charter: [`constitution/CHARTER.md`](../../../constitution/CHARTER.md)
- 4DRS docs: [`docs/4drs/README.md`](../../4drs/README.md)
- Root capability snapshot: [`README.md`](../../../README.md)

## Maturity (Drive-G-2 — five dimensions)

See the maturity table in [4D_ENGINE_V1_CONSTITUTION.md](./constitution/4D_ENGINE_V1_CONSTITUTION.md#drive-g-2-maturity-dimensions). Do not collapse to a single “ready / not ready” verdict.
