# StoryForge→MRS pipeline v1.0 — CECP trail

| Field | Value |
|-------|-------|
| `trailId` | `storyforge-mrs-pipeline-v1-2026-07` |
| `feature` | Shippable RenderRequest→RenderResult path (PNG + hashes) |
| `started` | 2026-07-27 |
| `overallStatus` | **partial** |
| `cognitive-profile` | Systems Architect (primary) → Scientist → Guardian |
| `softwareCreationMode` | Pipeline-Conductor / Boundary-Guardian / Testwright / Render-Physicist / Constructor / Forge |
| Predecessor | `storyforge-runtime-boundary-2026-07` |

See `cognitive-switches.md` for Role+Profile+Mode sample run log.

## Stage checklist

- [x] `01-architect-adr.md`
- [x] `02-builder-scaffold-manifest.md`
- [x] `03-implementor-notes.md`
- [x] `04-reviewer-conformance.md`
- [x] `05-inspector-acceptance.md`
- [x] `06-engineer-standards.md`
- [x] `cognitive-switches.md`
- [x] `lineage.json`

## How to run E2E (host)

```text
python mrs/adapters/storyforge-boundary/run_pipeline.py \
  -r mrs/adapters/storyforge-boundary/fixtures/sample-render-request-executable.json \
  --execute --out-dir output --json

python mrs/adapters/storyforge-boundary/smoke_pipeline.py
# → output/storyforge-pipeline-smoke.png
```

Genblaze (opt-in): `RENDER_REQUEST_API_ENABLED=1` → `POST /api/render-request`.

## Docker

Dockerfile COPYs boundary + prompt-scene-bridge + proton bridge; build smoke for
RenderRequest included.

**Live rebuild (2026-07-28):** **PASS** — see `07-docker-live-smoke.md`
(`mrs-genblaze:storyforge-pipeline-v1`, `/health` 200, adapters + pipeline ok).
