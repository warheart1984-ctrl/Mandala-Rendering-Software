# StoryForge Runtime — MRS contract pointer

Canonical MRS adapter SoT:

`mrs/adapters/storyforge-boundary/`

| Artifact | Path |
|----------|------|
| Ownership | `mrs/adapters/storyforge-boundary/BOUNDARY.md` |
| Contract | `mrs/adapters/storyforge-boundary/CONTRACT.md` |
| Intake schema | `mrs/adapters/storyforge-boundary/schemas/RenderRequest.schema.json` |
| Output schema | `mrs/adapters/storyforge-boundary/schemas/RenderResult.schema.json` |
| CECP trail (boundary freeze) | `docs/governance/cecp/trails/storyforge-runtime-boundary-2026-07/` |
| CECP trail (pipeline v1.0) | `docs/governance/cecp/trails/storyforge-mrs-pipeline-v1-2026-07/` |
| CLI | `mrs/adapters/storyforge-boundary/run_pipeline.py` |
| Smoke PNG | `python mrs/adapters/storyforge-boundary/smoke_pipeline.py` → `output/storyforge-pipeline-smoke.png` |

StoryForge-owned stages (RenderIntent, PromptSpec, IModelBackend, …) are
**declared** here — owner StoryForge. MRS freezes the crossing and optionally
executes deep render routes from RenderRequest.
