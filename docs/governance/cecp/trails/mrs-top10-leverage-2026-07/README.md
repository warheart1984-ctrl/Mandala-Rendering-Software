# CECP trail — MRS Top 10 leverage (2026-07)

| Field | Value |
|-------|-------|
| `trailId` | `mrs-top10-leverage-2026-07` |
| `feature` | Execute leverage-ranked actions from `mrs-whole-gap-scan-2026-07` |
| `requestedBy` | Operator |
| `started` | 2026-07-29 |
| `lineage` | Architect → Builder → Implementor → Reviewer → Inspector → ESFR |
| `overallStatus` | **partial** (see scoreboard) |
| `lenses` | mrs-crew · mandala-mode · Warrior/Constructor · GPU assist honesty |

## Scoreboard (10/10)

| # | Action | Status | Evidence | Tests / CI |
|---|--------|--------|----------|------------|
| 1 | Genblaze tile/crop API | **done** | `crop_region`, `POST /api/engine3d-tile-still`, `engine3d_still_provider.crop_png_bytes` | `test_engine3d_still.py`, `test_genblaze_tile_api_inventory.py` |
| 2 | Engine3D `path_trace` 501 | **done** | Wired via `generate_worlddocument_rt4d_still` + `render-worlddocument-rt4d.mjs` | Genblaze pytest (path_trace live needs world JSON + Node build) |
| 3 | Infinity Director pytest CI | **done** | `.github/workflows/ci.yml` job `infinity-director` | `python -m pytest -q` in `mrs/apps/infinity-director` |
| 4 | Live WebGPU print execute | **partial** | Still skip-ok on CPU CI; assist ≠ print SoT unchanged | `npm run test:gpu-live` (existing) |
| 5 | Unity FourD scene loader | **partial** | `FourDSceneLoader.cs` minimal JSON envelope | No Unity Play Mode CI |
| 6 | IDAC_LIVE_AUTO nightly | **done** | `.github/workflows/idac-live-nightly.yml` | `continue-on-error`; needs `:8787`/`:8791` |
| 7 | Scorecards / START_HERE paths | **done** | `docs/scorecards/*.md`, `docs/START_HERE_MRS_30_MIN.md` | Doc-only |
| 8 | Storyforge E2E ownership ADR | **done** | `08-storyforge-e2e-ownership-adr.md` | ADR-only |
| 9 | SX Router Phase 2 dispatch | **partial** | `test/phase2-deterministic-dispatch.test.js` | `npm test` in sovereign-x-router |
| 10 | Runtime provenance play/stop E2E | **partial** | `engine/runtime/test/TimelinePlayStopProvenance.test.js` | `npm run test:runtime-provenance` |

## Remaining blockers

- **W-TILE-FAITHFUL (operational):** Genblaze API landed; Director **execute loop** still single full-frame dispatch — staged tiles mark `api_available`, not live per-tile HTTP loop in `execute_plan`.
- **IDAC certification:** Checklist row C-08b remains **partial** until live services run on nightly with Genblaze up.
- **GPU live print:** No mandatory WebGPU hardware job; Digital Printer SoT remains **cpu.rt4d.print**.
- **Unity:** Mesh spawn + Play Mode smoke not in default CI.

## Verification (spot-check)

```bash
cd mrs/apps/genblaze-media && python -m pytest -q tests/test_engine3d_still.py tests/test_genblaze_tile_api_inventory.py
cd mrs/apps/infinity-director && python -m pytest -q
npm run test:runtime-provenance
cd mrs/packages/sovereign-x-router && npm test
```

## Stage index

| Stage | File |
|-------|------|
| 01 | `01-architect-adr.md` |
| 02 | `02-builder-scaffold-manifest.md` |
| 03 | `03-implementor-notes.md` |
| 04 | `04-reviewer-conformance.md` |
| 05 | `05-inspector-acceptance.md` |
| 06 | `06-engineer-standards.md` |
| SF ADR | `08-storyforge-e2e-ownership-adr.md` |
