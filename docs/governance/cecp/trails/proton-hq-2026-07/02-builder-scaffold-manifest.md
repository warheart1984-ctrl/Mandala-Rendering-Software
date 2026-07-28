# 02 — Builder scaffold manifest (proton-hq)

**Trail:** `proton-hq-2026-07`  
**Stage:** Builder (CECP stage 02)  
**Predecessor:** Architect ADR (Foreman writes `01-architect-adr.md` if missing)  
**Date:** 2026-07-27

---

## 1. Intent

Scaffold **proton HQ** quality / tonemap / supersample modules from Architect
preset contract (`QualityPresetId` = `default` | `high`) so Implementor can
wire CPU post and CLI flags without inventing layout.

**Cite:** User / Foreman binding — trail `docs/governance/cecp/trails/proton-hq-2026-07/`;
Architect preset table (high: 512, ss=2, aces-lite, exposure≈1.35,
densityBoost≈1.35, lightingPunch true, bloom false; default: 256, ss=1,
tonemap none, exposure 1, lightingPunch false).

**Not in this pass:** deep tonemap math, lighting punch algorithms, box-filter
downsample fill, `rasterizeProtons` changes, GPU paths, fake `beauty.png`.

## 2. Scaffold manifest (created paths)

| Path | Kind | Status tag |
|------|------|------------|
| `docs/governance/cecp/trails/proton-hq-2026-07/README.md` | trail index | **partial** |
| `docs/governance/cecp/trails/proton-hq-2026-07/lineage.json` | machine lineage | **partial** |
| `docs/governance/cecp/trails/proton-hq-2026-07/02-builder-scaffold-manifest.md` | this file | **partial** |
| `mrs/packages/renderer-core/src/render/rt4d/proton/qualityPreset.js` | stub module | **skeleton** |
| `mrs/packages/renderer-core/src/render/rt4d/proton/tonemap.js` | stub module | **skeleton** |
| `mrs/packages/renderer-core/src/render/rt4d/proton/supersample.js` | stub module | **skeleton** |
| `mrs/packages/renderer-core/src/render/rt4d/proton/bloom.js` | stub module | **declared** |
| `mrs/packages/renderer-core/src/render/rt4d/proton/index.js` | barrel export update | existing + HQ exports |
| `mrs/packages/renderer-core/src/render/rt4d/proton/qualityHq.test.js` | placeholder test | **skeleton** |
| `mrs/packages/renderer-core/scripts/judge-wow-hq.mjs` | CLI shell | **skeleton** |
| `mrs/packages/renderer-core/output/judge-wow-hq/.gitkeep` | output dir marker | no fake beauty |

## 3. Dependency graph

```text
[skeleton] resolveQualityPreset(id, overrides)
    → QUALITY_PRESET_TABLE { default | high }
    → width/height/supersample/tonemap/exposure/…/bloom/depthCue

[skeleton] applyTonemap(floatRgba, opts)
    → pass-through (Implementor: aces-lite / reinhard / exposure / gamma)

[skeleton] renderDims(w,h,ss) → render resolution
[skeleton] downsampleBox(…) → identity if dims match; else NotImplemented

[declared] applyBloom(…) → throws until Implementor

[skeleton] judge-wow-hq.mjs
    → spawn render-proton-splat.mjs --star-demo + planned flags
    → out-dir output/judge-wow-hq

[untouched] rasterizeProtons.js / lighting4d.js deep logic
[out of scope] GPU backends
```

**Package / subprocess boundaries**

| Boundary | Notes |
|----------|-------|
| `renderer-core` proton SoT | Node ESM stubs; CPU only |
| `judge-wow-hq.mjs` → `render-proton-splat.mjs` | child process; flags may be ignored until Implementor |
| CECP trail docs | evidence only; no governance constitution edits |

## 4. Build artifacts inventory

| Artifact | Label | Behavior now |
|----------|-------|--------------|
| `qualityPreset.js` | **skeleton** | `resolveQualityPreset` + frozen table; throws on unknown id |
| `tonemap.js` | **skeleton** | `applyTonemap` pass-through |
| `supersample.js` | **skeleton** | `renderDims`; `downsampleBox` identity or throw |
| `bloom.js` | **declared** | `applyBloom` throws |
| `index.js` exports | **skeleton** exports added | no rasterize deep change |
| `judge-wow-hq.mjs` | **skeleton** | USAGE + forward with planned flags |
| `output/judge-wow-hq/.gitkeep` | dir only | no beauty.png |

## 5. Test placeholders created

| Test | What it asserts today | Later (Implementor) |
|------|----------------------|---------------------|
| `proton/qualityHq.test.js` | Exports exist; preset shapes; tonemap pass-through; bloom throws; renderDims | Real ACES/reinhard; box downsample; CLI flag acceptance; beauty hash |

## 6. Handoff to Implementor

Fill next, in order:

1. **`tonemap.js`** — deterministic aces-lite + reinhard (+ exposure/gamma);
   keep STATUS honest until tests pass.
2. **`supersample.js`** — box downsample for ss>1; keep identity when ss=1.
3. **Wire `resolveQualityPreset`** into `render-proton-splat.mjs` / pipeline
   (densityBoost, radiusScale, lightingPunch, etc.) — do not invent GPU.
4. **CLI flags** on splat (`--quality`, `--tonemap`, `--supersample`,
   `--lighting-punch`, …) so `judge-wow-hq.mjs` forward works end-to-end.
5. **`bloom.js`** — optional; leave **declared** until product asks; default false.
6. Expand **`qualityHq.test.js`** for operators + ss; do not fake beauty.
7. Fill trail **`03-implementor-notes.md`** with paths + commands run.

**Owner of remaining gaps:** Implementor.  
**Protected paths:** not touched (`constitution/`, `engine/constitution/`,
`AGENTS.md`, policies, conformance profile).
