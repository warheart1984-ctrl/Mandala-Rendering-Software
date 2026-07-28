# 05 — Inspector acceptance (proton-hq)

**Trail:** `proton-hq-2026-07`  
**Stage:** Inspector (CECP 05) — evidence probes only; no product redesign/implement  
**Date:** 2026-07-27  
**Predecessor:** `04-reviewer-conformance.md` (**PASS_WITH_NOTES**)  
**InspectorVerdict:** **PASS_WITH_GAPS**

---

## 1. Scope / claims under test

Verify Implementor claims against live probes from
`mrs/packages/renderer-core` (Drive-G-1: claim vs evidence):

| Claim (Implementor / evidence.json) | Probe target |
|-------------------------------------|--------------|
| 30 tests pass (qualityHq + judgeWow + softSplat + mods.six) | `node --test` suite |
| HQ beauty at `output/judge-wow-hq/` | CLI `judge-wow-hq.mjs --quality high` |
| beauty 512, ss=2, tonemap aces-lite | evidence.json + PNG IHDR |
| renderWidth 1024, lightingPunchMode enrich-only, bloom false, intentId present | evidence.json |
| Same-seed frameSha256 / pngSha256 stable across sequential HQ runs | two CLI runs |
| `--bloom` refused with declared message | `render-proton-splat.mjs --bloom` |
| Visual density vs Architect “dramatically better” aspiration | honest compare to `judge-wow-show` (256) |

Protected paths not edited. No feature code changes this stage.

---

## 2. Commands run + results

### 2.1 Tests

```text
cd mrs/packages/renderer-core
node --test src/render/rt4d/proton/qualityHq.test.js \
  src/render/rt4d/proton/judgeWow.test.js \
  src/render/rt4d/proton/softSplat.test.js \
  src/render/rt4d/proton/mods.six.test.js
```

**Result:** exit 0

```text
ℹ tests 30
ℹ suites 11
ℹ pass 30
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 345.9088
```

### 2.2 HQ render

```text
node scripts/judge-wow-hq.mjs --quality high --out-dir output/judge-wow-hq
```

**Result:** exit 0; `ok: true`; artifacts present:

| File | Present | Notes |
|------|---------|-------|
| `beauty.png` | yes | ~26629 bytes |
| `depth.png` | yes | ~8626 bytes |
| `normal.png` | yes | ~6809 bytes |
| `evidence.json` | yes | ~1816 bytes |

### 2.3 evidence.json asserts (post re-run)

| Field | Expected | Observed | Result |
|-------|----------|----------|--------|
| qualityId | high | `high` | PASS |
| width | 512 | `512` | PASS |
| height | 512 | `512` | PASS |
| supersample | 2 | `2` | PASS |
| renderWidth | 1024 | `1024` | PASS |
| tonemap | aces-lite | `aces-lite` | PASS |
| lightingPunchMode | enrich-only | `enrich-only` | PASS |
| bloom | false | `false` | PASS |
| intentId | present | `a2a59f4a8e23756408ecc50d64a6502c` | PASS |
| protonCount | ~50 | `50` | PASS |
| exposure | (wired) | `1.35` | PASS |

### 2.4 Determinism (two sequential HQ CLI runs, same defaults/seed)

| Run | frameSha256 | pngSha256 | cir.timestamp |
|-----|-------------|-----------|---------------|
| 1 | `83614ab90dbd99f9cbabc88a2f3d905c01310115377058ccc2422eb92b1687ac` | `e7c0c5cda1ecf192de6bd0b225b21e0bd4a9329d025cf4b84832fde61484381e` | `2026-07-28T02:01:40.381Z` |
| 2 | `83614ab90dbd99f9cbabc88a2f3d905c01310115377058ccc2422eb92b1687ac` | `e7c0c5cda1ecf192de6bd0b225b21e0bd4a9329d025cf4b84832fde61484381e` | `2026-07-28T02:02:08.627Z` |

**frameMatch:** true · **pngMatch:** true · CIR timestamp differs (expected; not part of frame hash).

Pipeline unit test also covers same-seed `frameSha256` under supersample+tonemap (included in 30-pass suite).

### 2.5 Bloom refuse

```text
node scripts/render-proton-splat.mjs --star-demo --quality high --bloom \
  --width 64 --height 64 --out-dir output/_bloom-refuse-test
```

**Result:** exit 1

```text
Error: bloom: declared — not shipped this trail (refuse --bloom). STATUS: declared
```

### 2.6 PNG IHDR (beauty.png)

```text
IHDR width=512 height=512
PNG signature=89504e470d0a1a0a
```

Not leftover 256.

### 2.7 Visual / pixel punch (honest)

| Plate | Path | IHDR | protonCount | Notes |
|-------|------|------|-------------|-------|
| show (prior) | `output/judge-wow-show/beauty.png` | 256×256 | 50 | soft white-ish sparse splat; no HQ tonemap/ss fields in evidence |
| HQ (this trail) | `output/judge-wow-hq/beauty.png` | 512×512 | 50 | chromatic soft splats; aces-lite / ss=2; still sparse central cluster |

HQ plate is sharper-resolution and punchier/more chromatic than the 256 show plate, but still reads as **soft / sparse** soft-splat (~50 protons; armCount still capped at 16). Does **not** meet Architect aspiration wording “dramatically HQ / dramatically better” as a dense cinematic look — technical acceptance for resolution/tonemap/ss/determinism **is** met.

---

## 3. Claim ↔ evidence table

| Claim | Evidence | Result |
|-------|----------|--------|
| 30 tests pass | `node --test` → 30 pass / 0 fail | **PASS** |
| HQ beauty + AOVs + evidence on disk | files under `output/judge-wow-hq/` | **PASS** |
| width 512 / renderWidth 1024 / ss=2 | evidence.json + IHDR 512 | **PASS** |
| tonemap aces-lite | evidence.json | **PASS** |
| lightingPunchMode enrich-only | evidence.json | **PASS** |
| bloom false; `--bloom` refused declared | evidence + CLI exit 1 message | **PASS** |
| intentId present | evidence.json | **PASS** |
| same-seed frameSha256 / pngSha256 stable | two sequential HQ runs match | **PASS** |
| CPU only; no GPU/path-trace | Reviewer notes + STATUS; Inspector did not find GPU claims in probes | **PASS** (spot-check) |
| Architect “dramatically better” visual density | still soft/sparse; armCount 16; ~50 protons | **GAP** (aesthetic) |

---

## 4. Gaps

1. **Visual density vs Architect aspiration** — plate remains soft-splat sparse; armCount hard-cap 16; protonCount 50. Technical HQ knobs (512, ss=2, aces-lite, enrich punch) ship; “dramatically better” density does not. → **PASS_WITH_GAPS** (do not FAIL solely on aesthetics).
2. **Bloom / depth-cue** — still **declared**; refuse path verified.
3. **Non-blocking from Reviewer (inherited)** — tonemap-before-downsample order; no hard [512,768] clamp beyond preset; kernel scales lack dedicated unit assert; HQ plates gitignored (local regenerate OK).
4. **index.js roadmap “ToneMap” vs enforced `applyTonemap`** — wording clarity for ESFR (Reviewer note); not a probe failure.

No blocking technical defects found by Inspector probes.

---

## 5. InspectorVerdict

**PASS_WITH_GAPS**

Technical acceptance (tests, HQ CLI, evidence fields, determinism hashes, bloom refuse, PNG 512 IHDR) **verified**. Remaining gap is honest visual density vs Architect “dramatically better” aspiration under armCount/protonCount constraints — not a sole FAIL.

---

## 6. Handoff to ESFR (stage 06)

Next: Engineer Standards Final Review (`06-engineer-standards.md`).

Please check:

- Drive-G-1 claim honesty on STATUS tags (HQ **enforced**; bloom **declared**; no GPU claims).
- Coding/API consistency for quality/tonemap/ss CLI flags.
- CI / test adequacy (30 proton tests green; whether ESFR wants matrix entry for HQ).
- Reviewer notes: tonemap-before-downsample, index roadmap ToneMap wording, densityBoost ADR drift.
- Maturity wording: operator demo plate exists locally; do not claim commercial/cinematic density ready.
- Do **not** treat soft aesthetics as ESFR fail if technical gates hold; note gap for roadmap if needed.

Demo re-verify:

```bash
cd mrs/packages/renderer-core
node scripts/judge-wow-hq.mjs --quality high --out-dir output/judge-wow-hq
```

Stable hashes observed this inspect:

- `frameSha256`: `83614ab90dbd99f9cbabc88a2f3d905c01310115377058ccc2422eb92b1687ac`
- `pngSha256`: `e7c0c5cda1ecf192de6bd0b225b21e0bd4a9329d025cf4b84832fde61484381e`
