# 03 — Implementor notes (proton-hq)

**Trail:** `proton-hq-2026-07`  
**Stage:** Implementor (CECP 03)  
**Status:** complete (production fill)  
**Predecessor:** `02-builder-scaffold-manifest.md`  
**Date:** 2026-07-27

---

## 1. Intent fulfilled

Fill Builder HQ scaffolds with real CPU logic: `resolveQualityPreset(default|high)`,
ACES-lite / Reinhard tonemap on float beauty before 8-bit encode, box supersample
downsample, enrich antifog knobs (maxRadius ~0.68), enrich-only lighting punch,
CLI wiring (`--quality` / `--tonemap` / `--supersample` / `--exposure` /
`--lighting-punch`), HQ plate under `output/judge-wow-hq/`, and determinism tests.
No GPU / path-trace claims. Bloom remains **declared**. Protected paths untouched.

## 2. Files touched (real paths)

| Path | Change |
|------|--------|
| `mrs/packages/renderer-core/src/render/rt4d/proton/qualityPreset.js` | **enforced** table; high enrich antifog knobs |
| `mrs/packages/renderer-core/src/render/rt4d/proton/tonemap.js` | **enforced** exposure + none/reinhard/aces-lite + gamma |
| `mrs/packages/renderer-core/src/render/rt4d/proton/supersample.js` | **enforced** `renderDims` + `downsampleBox` |
| `mrs/packages/renderer-core/src/render/rt4d/proton/bloom.js` | **declared** refuse message (unchanged stub) |
| `mrs/packages/renderer-core/src/render/rt4d/proton/pipeline.js` | tonemap + ss in `runProtonPipelineFromField`; enrich nearGray + lightingPunch |
| `mrs/packages/renderer-core/src/render/rt4d/proton/rasterizeProtons.js` | `sigmaScale` / `opacityScale` knobs |
| `mrs/packages/renderer-core/src/render/rt4d/proton/index.js` | STATUS skeleton→enforced for HQ exports |
| `mrs/packages/renderer-core/src/render/rt4d/proton/qualityHq.test.js` | tonemap + supersample determinism |
| `mrs/packages/renderer-core/scripts/render-proton-splat.mjs` | wire quality/tonemap/ss/exposure/lighting-punch; refuse bloom |
| `mrs/packages/renderer-core/scripts/judge-wow-hq.mjs` | STATUS enforced; forwards wired flags |
| `mrs/packages/renderer-core/output/judge-wow-hq/beauty.png` | HQ render (512, ss=2) |
| `mrs/packages/renderer-core/output/judge-wow-hq/depth.png` | AOV |
| `mrs/packages/renderer-core/output/judge-wow-hq/normal.png` | AOV |
| `mrs/packages/renderer-core/output/judge-wow-hq/evidence.json` | quality/tonemap/ss provenance |
| `docs/governance/cecp/trails/proton-hq-2026-07/03-implementor-notes.md` | this file |
| `docs/governance/cecp/trails/proton-hq-2026-07/README.md` | stage 03 + status |

Protected paths **not** touched: `constitution/`, `AGENTS.md`, policies, charter,
conformance profile.

## 3. Unit / integration test inventory

| Test | Enforces |
|------|----------|
| `qualityHq.test.js` preset table | high width 512, ss 2, aces-lite, antifog maxRadius |
| `qualityHq.test.js` tonemap determinism | aces-lite / reinhard stable SHA; identity fast-path |
| `qualityHq.test.js` downsampleBox | 2×2→1×1 average; stable SHA |
| `qualityHq.test.js` pipeline ss+tonemap | same `frameSha256`; output 32 with render 64 |
| `qualityHq.test.js` bloom | throws **declared** |
| `judgeWow.test.js` | prior star triptych / AOV / determinism (green) |
| `mods.six.test.js` / `softSplat.test.js` | prior six-mod suite (green) |

## 4. Commands run + results

```text
cd mrs/packages/renderer-core
node --test src/render/rt4d/proton/qualityHq.test.js \
  src/render/rt4d/proton/judgeWow.test.js \
  src/render/rt4d/proton/softSplat.test.js \
  src/render/rt4d/proton/mods.six.test.js
→ 30 pass / 0 fail

node scripts/judge-wow-hq.mjs --quality high --out-dir output/judge-wow-hq
→ ok; qualityId=high; width=512; renderWidth=1024; supersample=2;
  tonemap=aces-lite; exposure=1.35; protonCount=50;
  beauty.png + depth.png + normal.png + evidence.json
```

Absolute beauty path:

`G:\Mandala Rendering Software\mrs\packages\renderer-core\output\judge-wow-hq\beauty.png`

## 5. Status tag updates

| Deliverable | Tag | Evidence |
|-------------|-----|----------|
| `resolveQualityPreset` / table | **enforced** | qualityHq tests + CLI |
| `applyTonemap` (aces-lite / reinhard / none) | **enforced** | unit + pipeline evidence.mods.tonemap |
| `downsampleBox` / supersample | **enforced** | unit + renderWidth≠width in evidence |
| Enrich preset knobs (antifog maxRadius) | **enforced** | high maxRadius 0.68; CLI enrich pass-through |
| Lighting punch | **enforced** | enrich-only (`lightingPunchMode: enrich-only`); skipLighting true |
| `judge-wow-hq.mjs` + splat flags | **enforced** | HQ CLI run |
| HQ beauty + AOVs | **enforced** | files on disk + evidence.json |
| Bloom / depth-cue | **declared** | stub throws; CLI refuses `--bloom` / `--depth-cue` |
| GPU / path-trace | **out of scope** | CPU soft-splat only |

## 6. Remaining gaps

1. **armCount > 16** — `create4dStarWorld` hard-caps `armCount` at 16; denser HQ look uses enrich/sigma/opacity, not more arms. Raising the cap needs an engine3d-core change (out of this trail’s renderer-core scope unless Foreman expands).
2. **Bloom / depth-cue** — still declared; not operators.
3. **sigmaScale / opacityScale** — wired and used on high preset; no dedicated unit assert beyond pipeline evidence fields (acceptable; Reviewer may want an explicit kernel-scale test).
4. **Pale material nearGray fix** — broadened threshold so `[0.85,0.9,1]` remaps via `vividFromId` instead of clipping to white under colorGain; changes absolute frame hashes vs pre-fix judge-wow plates (determinism same-seed still holds).

## 7. Handoff to Reviewer

- Confirm Drive-G-1 tags above vs code (especially no GPU claims).
- Confirm protected paths clean.
- Spot-check `evidence.json`: `qualityId`, `tonemap`, `exposure`, `supersample`, `renderWidth`/`renderHeight`, `intentId`, `lightingPunchMode`.
- Visual: HQ 512 plate should read denser/punchier than 256 default; chromatic arms present after nearGray fix.
- Demo command:

```bash
node mrs/packages/renderer-core/scripts/judge-wow-hq.mjs --quality high --out-dir mrs/packages/renderer-core/output/judge-wow-hq
```

### Lighting punch choice (documented)

**Enrich-only punch** (core color/density boost in `enrichJudgeWowField` when
`lightingPunch`); `skipLighting: true` on the star path. Avoids Mod6 Reinhard-style
lighting wash over chromatic arm colors (Architect decision 6).
