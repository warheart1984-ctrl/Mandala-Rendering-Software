# StoryForge ↔ MRS Runtime Boundary

> **Status:** **partial** — MRS freezes the crossing contract. StoryForge-owned
> stages remain **declared** on the MRS side (owner: StoryForge).
> Drive-G-1: do not claim end-to-end StoryForge Runtime Spec v1.0 is enforced in MRS.

## Canonical pipeline (SoT — StoryForge Runtime Spec v1.0)

```text
Story → Scene → Shot → RenderIntent → PromptComposer → immutable PromptSpec
  → IModelBackend → RenderRequest → [MRS] → RenderResult
```

## Ownership freeze

| Owner | Stages / concerns |
|-------|-------------------|
| **StoryForge** | Story … RenderRequest (incl. RenderIntent, PromptSpec, IModelBackend, PromptComposer) |
| **MRS** | Engine3D, RT4D, geometry, materials, lighting, rendering, provenance, evidence, **RenderResult** |
| **Crossing** | Only **RenderRequest** enters MRS. MRS does **not** modify RenderIntent or PromptSpec. |

## Opaque provenance only

MRS may receive `provenance.promptSpecHash` and `provenance.renderIntentHash` as
**opaque** references. MRS must not fetch, rewrite, or re-compose PromptSpec /
RenderIntent bodies.

## Name collision warning

`mrs/packages/cros` defines Creative-OS `RenderIntent` / `RenderResult` artifacts.
Those are a **different lineage** from StoryForge Runtime Spec types. Do not import
CROS kinds as substitutes for this boundary’s schemas.

## Precursor bridges (honest map)

| Existing MRS surface | Tag vs SF v1.0 |
|----------------------|----------------|
| `mrs/adapters/prompt-scene-bridge/` (prompt → SceneSpecification) | **partial** precursor — not RenderRequest |
| Engine3D expand via prompt-scene bridge | **partial** / route target |
| `mrs/adapters/proton-raster-bridge/` | **partial** / route target |
| This adapter (`storyforge-boundary`) | **partial** — schema + validate + optional deep execute (PNG/hashes) |

## Genblaze ban

No `story_forge` / `storyforge` strings under `mrs/apps/genblaze-media/app/*.py`.
Do not import StoryForge into MRS app hosts. Adapter docs may describe the boundary;
the Genblaze app process stays clean.

## Schemas

- `schemas/RenderRequest.schema.json` — MRS intake
- `schemas/RenderResult.schema.json` — MRS output
