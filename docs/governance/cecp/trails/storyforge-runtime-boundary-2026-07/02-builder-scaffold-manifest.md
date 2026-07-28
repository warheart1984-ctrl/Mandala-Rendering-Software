# 02 — Builder scaffold manifest

| Field | Value |
|-------|-------|
| Trail | `storyforge-runtime-boundary-2026-07` |
| Stage | Builder |
| Mode | Monk + Hermit (minimal pure surface) · Sage light |
| Predecessor | `01-architect-adr.md` |
| Date | 2026-07-27 |

## Intent

Scaffold MRS-side StoryForge Runtime Spec v1.0 crossing contracts and adapter
shell per Architect file manifest — stubs only; no PromptComposer logic.

## Scaffold manifest (created paths)

| Path | Kind | Tag |
|------|------|-----|
| `mrs/adapters/storyforge-boundary/BOUNDARY.md` | ownership | **partial** |
| `mrs/adapters/storyforge-boundary/CONTRACT.md` | contract | **partial** |
| `mrs/adapters/storyforge-boundary/README.md` | docs | **partial** |
| `mrs/adapters/storyforge-boundary/schemas/RenderRequest.schema.json` | schema | **partial** |
| `mrs/adapters/storyforge-boundary/schemas/RenderResult.schema.json` | schema | **partial** |
| `mrs/adapters/storyforge-boundary/fixtures/sample-render-request.json` | fixture | **partial** |
| `mrs/adapters/storyforge-boundary/stubs/mapping_notes.md` | stub map | **skeleton** |
| `mrs/adapters/storyforge-boundary/validate_request.py` | module shell | → Implementor |
| `mrs/adapters/storyforge-boundary/route.py` | module shell | → Implementor |
| `mrs/adapters/storyforge-boundary/test_boundary.py` | test placeholder | → Implementor |
| `docs/contracts/storyforge-runtime/README.md` | pointer | **declared**/pointer |
| Trail `README.md` + stage files | CECP | **partial** |

## Dependency graph

```text
StoryForge (out of repo / declared)
    └── RenderRequest JSON
            └── storyforge-boundary.validate_request
                    └── storyforge-boundary.route
                            ├── scene-spec → embedded SceneSpecification (**partial**)
                            ├── engine3d-world → echo (**skeleton**)
                            ├── proton-raster → note toward proton-raster-bridge (**skeleton**)
                            └── rt4d → note (**skeleton**)
                    └── RenderResult JSON
```

No Genblaze `app/*.py` dependency added. No StoryForge package dependency.

## Build artifacts inventory

- Schemas + BOUNDARY + CONTRACT: present
- Mapping stubs: **skeleton**
- SF RenderIntentBuilder / PromptComposer / IModelBackend: **declared** (not scaffolded in MRS)

## Test placeholders

`test_boundary.py` names Architect acceptance: fixture validate, refuse without
intent/world, unknown route, smuggled SF bodies, Genblaze ban, no SF imports.

## Multi-mode lens (Builder — light)

| Mode | Note |
|------|------|
| Monk | One package, two schemas, one fixture |
| Hermit | Pure validate core; no Genblaze entanglement |
| Warrior | No HTTP surface this trail |
| Cartographer | Dependency graph above |

## Handoff to Implementor

Fill `validate_request.py` + `route.py` + make tests green. Do not implement SF
PromptComposer/IModelBackend. Do not edit charter paths.
