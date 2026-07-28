# 03 — Implementor notes (judge-wow)

**Trail:** `judge-wow-2026-07`  
**Stage:** Implementor  
**Status:** complete (production fill)  
**Predecessor:** `02-builder-scaffold-manifest.md`  
**Date:** 2026-07-27

---

## 1. Intent fulfilled

Compose existing proton six-mod + Engine3D star path into a **judge-wow** package:
dense star→proton triptych (beauty/depth/normal), Genblaze HTTP wire (default-off),
prompt→scene→proton CLI (`--scene-spec`), `shadeRasterFragment` in HeadlessStillRenderer,
and optional bake plate shell — without charter/AGENTS/policy edits. P4 determinism
preserved (`frameSha256` stable for same seed). Drive-G-1 tags match evidence.

## 2. Files touched (real paths)

| Path | Change |
|------|--------|
| `mrs/packages/renderer-core/src/render/rt4d/proton/aovEncode.js` | **enforced** depth/normal PNG + `writeTriptychAovs` |
| `mrs/packages/renderer-core/src/render/rt4d/proton/pipeline.js` | `runProtonPipelineFromField`, `protonFieldFromLegacyProtons`, `protonFieldFromWorldDocumentRt4d` |
| `mrs/packages/renderer-core/src/render/rt4d/proton/fromWorldDocumentRt4d.js` | color from `rt4dMaterial.baseColor` |
| `mrs/packages/renderer-core/src/render/rt4d/proton/index.js` | export AOV + FromField APIs |
| `mrs/packages/renderer-core/src/render/rt4d/proton/judgeWow.test.js` | real star/AOV/determinism tests |
| `mrs/packages/renderer-core/scripts/render-proton-splat.mjs` | `--star-demo`, `--lattice-demo`, `--out-dir`, `--aov` |
| `mrs/packages/renderer-core/scripts/judge-wow-proton-triptych.mjs` | opinionated 256–512 star wrapper |
| `mrs/packages/renderer-core/scripts/prompt-scene-to-proton.mjs` | `--scene-spec` → proton AOVs |
| `mrs/packages/renderer-core/scripts/bake-draft-lattice-plate.mjs` | Engine3D still wrap; polish:skipped without FAL |
| `mrs/apps/genblaze-media/app/config.py` | `proton_raster_*` settings + env |
| `mrs/apps/genblaze-media/app/proton_raster_provider.py` | subprocess + `generate_proton_raster` |
| `mrs/apps/genblaze-media/app/main.py` | `/health` proton_raster; `POST /api/proton-raster` |
| `mrs/apps/genblaze-media/tests/test_proton_raster.py` | mocked subprocess + HTTP |
| `mrs/packages/engine3d-core/src/renderer/raster/HeadlessStillRenderer.ts` | `shadeRasterFragment` when `mesh.material` |
| `mrs/packages/engine3d-core/test/renderer/material-aware-raster.test.ts` | glass vs metal beauty means differ |
| `docs/governance/cecp/trails/judge-wow-2026-07/03-implementor-notes.md` | this file |

Protected paths **not** touched: `constitution/`, `AGENTS.md`, policies, charter.

## 3. Unit / integration test inventory

| Test | Enforces |
|------|----------|
| `judgeWow.test.js` aovEncode | PNG signature / encode APIs |
| `judgeWow.test.js` star triptych | `protonCount≥30`, depth/normal buffers, same seed → same `frameSha256` |
| `judgeWow.test.js` writeTriptychAovs | beauty+depth+normal on disk |
| `mods.six.test.js` / registry / softSplat | prior six-mod suite (unchanged green) |
| `test_proton_raster.py` | default-off, availability shape, mocked CLI, health, 503, mocked POST, ban strings |
| `material-aware-raster.test.js` + `raster-still.test.js` | shade hook + still buffers |

## 4. Commands run + results

```text
node --test mrs/packages/renderer-core/src/render/rt4d/proton/*.test.js
→ 29 pass / 0 fail

node mrs/packages/renderer-core/scripts/judge-wow-proton-triptych.mjs \
  --width 256 --out-dir mrs/packages/renderer-core/output/judge-wow-triptych-256
→ ok; protonCount=38; beauty.png + depth.png + normal.png + evidence.json

cd mrs/packages/engine3d-core
  npm run build   # pre-existing TS errors in package (star/ao/capsule types) — emit still used
  node --test dist/test/renderer/material-aware-raster.test.js \
               dist/test/renderer/raster-still.test.js
→ 12 pass / 0 fail

cd mrs/apps/genblaze-media
  .venv\Scripts\python.exe -m pytest tests/test_proton_raster.py -q
→ 10 passed
```

If venv missing: `cd mrs/apps/genblaze-media && python -m pytest tests/test_proton_raster.py -q`

## 5. Status tag updates

| Deliverable | Tag | Evidence |
|-------------|-----|----------|
| Dense star→proton triptych | **enforced** | CLI + judgeWow tests + 3 PNGs @256 |
| `aovEncode.js` | **enforced** | unit tests + triptych write |
| Genblaze proton HTTP (mocked) | **enforced** | pytest mocked subprocess + POST |
| Genblaze live Node-in-Docker | **partial** | needs node + script in image |
| `prompt-scene-to-proton.mjs` | **enforced** | `--scene-spec` → pipeline AOVs |
| Prompt string → scene in Genblaze one-shot | **declared** / gap | CLI-only; use `/api/prompt-to-scene` then CLI |
| `shadeRasterFragment` in HeadlessStillRenderer | **enforced** | material branch + raster tests |
| TextureSampler in still path | **declared** | deferred (gap comment in renderer) |
| `bake-draft-lattice-plate.mjs` | **partial** | structure still; polish:skipped without FAL |

## 6. Remaining gaps

1. **TextureSampler** not wired in `renderStillBuffers` (needs atlas binder + uvs sampling) — explicit gap.
2. **Genblaze prompt→proton HTTP one-shot** not added (low-risk avoided); compose `/api/prompt-to-scene` + CLI.
3. **engine3d-core `tsc`** still reports pre-existing type mismatches (`star` preset, `oriented_capsule`, `ao` role) unrelated to this hook; runtime dist tests for raster pass.
4. **Bake polish** remains skipped without FAL keys (by design, exit 0).

## 7. Handoff to Reviewer

- Confirm Drive-G-1 tags above vs code.
- Confirm no protected-path edits.
- Spot-check CIR/`intentId` on evidence JSON from triptych.
- Demo 90s command in § below (also returned to parent).

### Demo 90s command

```bash
node mrs/packages/renderer-core/scripts/judge-wow-proton-triptych.mjs --width 256 --out-dir mrs/packages/renderer-core/output/judge-wow-triptych-256
```
