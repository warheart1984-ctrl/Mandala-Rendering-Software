# StoryForge boundary adapter (MRS)

MRS-side freeze + **shippable path** for StoryForge Runtime Spec crossing:

**RenderRequest → MRS → RenderResult** (PNG + SHA-256)

- Ownership: `BOUNDARY.md`
- Contract (enforced vs declared): `CONTRACT.md`
- Schemas: `schemas/`
- Validate / route / execute: `validate_request.py`, `route.py`, `execute.py`, `paths.py`
- CLI: `run_pipeline.py`
- Smoke: `smoke_pipeline.py` → `output/storyforge-pipeline-smoke.png`
- **Full demo:** `demo_full_run.py` → `output/cecp-full-run/` (proton HQ + scene + engine3d)
- Wrapper: `node scripts/demo-storyforge-to-4d.mjs`
- Tests: `test_boundary.py`, `test_pipeline.py`

```text
# Full cinematic plate run (HQ proton 512 + AOVs)
python mrs/adapters/storyforge-boundary/demo_full_run.py --out-dir output/cecp-full-run --genblaze-smoke

# Single route
python run_pipeline.py -r fixtures/sample-render-request-cinematic-proton.json --execute --out-dir ../../../../output/cecp-full-run --json
```

Status: **enforced** for MRS RenderRequest→pixels routes when Node scripts present.
StoryForge Story→…→RenderRequest remains **declared** (SF-owned).
