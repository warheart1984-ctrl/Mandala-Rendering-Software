# Mapping stubs (declared / skeleton)

> Status: **skeleton** — documents intended maps; not deep execution.

| RenderRequest field | Existing MRS target | Tag |
|---------------------|---------------------|-----|
| `payload.sceneSpecification` | renderer-core SceneSpecification / prompt-scene `mrs_map` consumers | **partial** when embedded |
| `payload.engine3dWorldDocument` | engine3d-core world document / expand CLI | **skeleton** |
| `payload.worldDocumentRt4d` | RT4D world consume paths | **skeleton** |
| `payload.route = proton-raster` | `mrs/adapters/proton-raster-bridge/` request shape | **skeleton** |
| `provenance.*Hash` | Opaque only — no PromptSpec/RenderIntent mutation | **enforced** by validator refuse of smuggled bodies |

StoryForge PromptComposer / IModelBackend / RenderIntentBuilder: **declared**
(owner StoryForge) — not mapped into MRS modules.
