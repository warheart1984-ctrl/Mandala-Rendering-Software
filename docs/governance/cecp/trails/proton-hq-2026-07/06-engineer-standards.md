# 06 — ESFR (Engineer Standards Final Reviewer)

**Trail:** `proton-hq-2026-07`  
**Stage:** ESFR / Engineer Standards (CECP stage 06)  
**Status:** complete  
**Predecessor:** `05-inspector-acceptance.md` (**PASS_WITH_GAPS**)  
**Also noted:** Reviewer `04-reviewer-conformance.md` (**PASS_WITH_NOTES**)  
**Date:** 2026-07-27  
**Package:** `docs/governance/esfr/`  
**Role constraint:** read-only — no product/source edits; trail + lineage only  
**Module:** `mrs/packages/renderer-core/src/render/rt4d/proton/{qualityPreset,tonemap,supersample,bloom,pipeline,rasterizeProtons}` + `scripts/judge-wow-hq.mjs` / `scripts/render-proton-splat.mjs`

---

## 1. ESFRVerdict: `PASS_WITH_GAPS`

HQ quality path (512 / ss=2 / aces-lite / enrich punch / bloom refuse / same-seed
hashes / 30 proton tests) meets scoped engineering standards. Gaps align with
Inspector (visual density vs Architect “dramatically better”) and Reviewer notes
(tonemap-before-downsample, index roadmap ToneMap wording, CI coverage, densityBoost
ADR drift). Does **not** override Inspector evidence. No standards **REJECT**.

## 2. PromotionEligibility: `PROMOTE_WITH_GAPS`

Eligible for CECP ship / ecosystem inclusion with listed gaps
(`promotion.esfr.md` Rules 01–06; test-matrix Promotion Readiness).
CHEA / CCR / CDGF evaluated as **declared** layers only
(`docs/governance/CONSTITUTIONAL_LAYER_STACK.md`).

| ESFRVerdict | PromotionEligibility |
|-------------|----------------------|
| `PASS_WITH_GAPS` | `PROMOTE_WITH_GAPS` |

---

## 3. Test matrix (`test-matrix.esfr.md`)

| Category | Outcome | Notes |
|----------|---------|-------|
| Engineering Standards Compliance | PASS | Proton HQ modules under `renderer-core` SoT; naming/STATUS match package; deterministic CLI/tests; no architectural drift beyond declared scope |
| Architectural Coherence | PASS_WITH_GAPS | Aligns with RT4D CPU soft-splat + six-mod pipeline; aesthetic density aspiration unmet; bloom/depth-cue still **declared**; CIEMS/AAES-OS framing **declared** only |
| Execution Legitimacy (CHEA Ω∞) | PASS | Against **declared** CHEA — Node CLI host evidenced; no false CHEA enforcement; no ungoverned external deps |
| Capability Legitimacy (CCR) | PASS | Against **declared** CCR — HQ preset/tonemap/ss within Architect scope; bloom refused (no silent capability); no GPU expansion |
| Operational Legitimacy (CDGF) | PASS | Against **declared** CDGF — CLI + evidence.json match declared intent; gitignored plates regenerate locally; no ops fabric claimed |
| Promotion Readiness | PROMOTE_WITH_GAPS | Inspector **PASS_WITH_GAPS**; ESFR **PASS_WITH_GAPS**; gaps explicit; lineage/README updated this stage |

---

## 4. Evidence probes (`probes.esfr.md`)

| Probe | Result | Citation |
|-------|--------|----------|
| 01 Standards Alignment | PASS | Module STATUS headers (`qualityPreset`/`tonemap`/`supersample` **enforced**; `bloom` **declared**); Implementor §5 tags; AAES-OS framing **declared** |
| 02 Architectural Coherence | PASS_WITH_GAPS | CECP trail 01–05; RT4D proton path; visual density gap (`05` §2.7 / §4); no GPU claims |
| 03 Execution Legitimacy (CHEA) | PASS | **declared** layer; Inspector §2.1–2.2 Node CLI + `node --test` 30/30 |
| 04 Capability Legitimacy (CCR) | PASS | **declared** layer; HQ flags wired; `--bloom` refuse (`05` §2.5); no unauthorized expansion |
| 05 Operational Legitimacy (CDGF) | PASS | **declared** layer; `judge-wow-hq` + evidence fields (`05` §2.3); operator demo local |
| 06 Determinism & Replay | PASS | Inspector §2.4: identical `frameSha256` / `pngSha256` across two HQ runs; qualityHq unit coverage |
| 07 Lineage Integrity | PASS | Stages 01–06 present; this artifact; README + `lineage.json` updated; seed append `docs/governance/esfr/lineage.esfr.json` |
| 08 Promotion Eligibility | PROMOTE_WITH_GAPS | Rules 01–02 (evidence + gaps); 03 lineage; 04–05 declared stack; 06 no REJECT drift |

---

## 5. StandardsReport

### A — Engineering Standards Compliance

- Scope matches Architect/Implementor: quality preset, CPU tonemap, supersample,
  enrich antifog, bloom stub, judge-wow-hq CLI — no drive-by product edits this stage.
- Naming and module boundaries match nearby `proton/` code; errors refuse bloom with
  honest **declared** message.
- Status tags honest: HQ path **enforced**; bloom/depth-cue **declared**; GPU
  **out of scope**.
- Determinism confirmed by Inspector (hashes) and unit tests.

### B — Architectural Coherence

- Fits RT4D CPU soft-splat model (no path-trace / GPU claims).
- AAES-OS / CIEMS stack cited as **declared** framing only.
- Gap: Architect “dramatically better” density not met (~50 protons, armCount 16) —
  technical HQ knobs ship; cinematic density does not (Inspector GAP).
- Minor: `index.js` roadmap still lists “ToneMap” among declared mods while
  `applyTonemap` is **enforced** for proton HQ — wording clarity for follow-on docs
  (Reviewer note; non-blocking).

### C — Execution Legitimacy (CHEA Ω∞) — declared layer

- Execution host: Node scripts under `mrs/packages/renderer-core` (evidenced).
- No CHEA registry claimed **enforced**.
- Replayability: same-seed frame/png hashes stable (`05` §2.4).

### D — Capability Legitimacy (CCR) — declared layer

- Capability set limited to declared HQ operators; bloom not silently enabled.
- No unauthorized expansion beyond trail scope.
- densityBoost ADR drift 1.35→1.4 noted by Reviewer — non-blocking; evidence shows 1.4.

### E — Operational Legitimacy (CDGF) — declared layer

- Operational behavior matches declared intent (CLI flags → evidence.json fields).
- Side effects limited to gitignored `output/judge-wow-hq/` artifacts.
- No CDGF fabric claimed **enforced**.

### Determinism

| Check | Result | Citation |
|-------|--------|----------|
| Two sequential HQ CLI runs | frameSha256 + pngSha256 match | `05` §2.4 |
| qualityHq tonemap/ss unit tests | included in 30/30 | `05` §2.1 |
| CIR timestamp differs | expected; not in frame hash | `05` §2.4 |

Stable hashes cited by Inspector:

- `frameSha256`: `83614ab90dbd99f9cbabc88a2f3d905c01310115377058ccc2422eb92b1687ac`
- `pngSha256`: `e7c0c5cda1ecf192de6bd0b225b21e0bd4a9329d025cf4b84832fde61484381e`

### Lineage

| Artifact | State |
|----------|-------|
| `01`–`05` trail files | present |
| `06-engineer-standards.md` | this file |
| `README.md` stage 06 | updated |
| `lineage.json` | updated (`06-engineer-standards` complete) |
| `docs/governance/esfr/lineage.esfr.json` | append ProtonHqQuality row |

### Promotion

Per Rule 01: Inspector **PASS_WITH_GAPS** + ESFR **PASS_WITH_GAPS** + matrix/probes
complete → `PROMOTE_WITH_GAPS`. Rule 02 gaps listed below. No Rule 06 REJECT drift.

---

## 6. Checklist (ship-quality detail)

| Area | Result | Notes |
|------|--------|-------|
| Coding standards & scope | PASS | HQ modules + scripts only; protected paths clean (`04`) |
| API & contract consistency | PASS | `resolveQualityPreset` / `applyTonemap` / `renderDims`/`downsampleBox` / CLI flags coherent; bloom refuse shared |
| Drive-G-1 claim honesty | PASS | HQ **enforced**; bloom **declared**; no GPU; aesthetic “dramatically better” not claimed as met |
| Drive-G-2 maturity wording | PASS | Operator demo plate local; not commercial/cinematic-density ready |
| CI / test adequacy | PASS_WITH_GAPS | 30/30 local; `.github/workflows/mrs-rt4d-ci.yml` does **not** list `proton/*.test.js` / HQ suite |
| Docker / ops readiness | N/A | No Docker coupling in this trail |
| Dependency & license hygiene | PASS | No new deps cited; MIT package reuse; CPU-only (P5 hygiene) |

---

## 7. Findings

### Blocking

None.

### Non-blocking

- [medium] Visual density vs Architect aspiration — soft/sparse (~50 protons, armCount 16); technical HQ OK (`05` GAP).
- [medium] CI workflow omits proton HQ / `qualityHq` / `judgeWow` suites (local green only).
- [low] Tonemap applied before downsample (Reviewer P4 note) — document as intentional if unchanged.
- [low] No hard [512,768] clamp beyond preset; kernel scales lack dedicated unit assert.
- [low] `index.js` roadmap “ToneMap” vs enforced `applyTonemap` — clarify wording.
- [low] densityBoost ADR 1.35→1.4 drift — evidence shows 1.4.
- [info] HQ plates gitignored — regenerate via CLI (acceptable for operator demo).

---

## 8. Gaps (required for PASS_WITH_GAPS / PROMOTE_WITH_GAPS)

| Gap | Tag | Evidence needed for later promotion |
|-----|-----|-------------------------------------|
| Visual density / “dramatically better” cinematic look | **partial** | Follow-on trail raising armCount and/or proton density + Inspector visual probe |
| Bloom / depth-cue operators | **declared** | Real operators + tests; remove CLI refuse |
| CI coverage for proton HQ suite | **partial** | Add `proton/*.test.js` (or HQ subset) to `mrs-rt4d-ci.yml` |
| Dedicated sigmaScale / opacityScale unit asserts | **partial** | Unit tests beyond pipeline evidence fields |
| Hard output-size clamp policy | **declared** | ADR + clamp if product requires [512,768] |
| index.js ToneMap roadmap wording | **partial** | Docs-only: mark proton tonemap **enforced** vs broader ToneMap roadmap |
| GPU / path-trace | **out of scope** | Separate trail if ever claimed |

---

## 9. Evidence alignment

- Inspector verdict cited: **PASS_WITH_GAPS** (`05-inspector-acceptance.md`)
- Reviewer: **PASS_WITH_NOTES** → maps to ESFR gap list (not re-litigated as lawbook FAIL)
- Contradictions / missing artifacts: none for scoped technical HQ claims
- ESFR does **not** rewrite Inspector claim↔evidence rows
- Preferred honest outcome matches Inspector: `PASS_WITH_GAPS` + `PROMOTE_WITH_GAPS`

---

## 10. Ship gate decision

**PROMOTE_WITH_GAPS** — ship scoped Proton HQ quality path as a governed CECP
deliverable with explicit gaps. Do not claim commercial/cinematic density or bloom.

### Enforced today (evidence-backed)

- `resolveQualityPreset` (`default`|`high`)
- `applyTonemap` (none / reinhard / aces-lite) + exposure/gamma
- supersample `renderDims` + `downsampleBox`
- enrich antifog + enrich-only lighting punch
- `judge-wow-hq.mjs` / splat CLI HQ flags
- HQ beauty 512 + AOVs + evidence (local regenerate)
- same-seed `frameSha256` / `pngSha256`
- bloom CLI refuse (**declared** stub)

### Absolute beauty path

`G:\Mandala Rendering Software\mrs\packages\renderer-core\output\judge-wow-hq\beauty.png`

### How to run HQ

```bash
cd mrs/packages/renderer-core
node scripts/judge-wow-hq.mjs --quality high --out-dir output/judge-wow-hq
```

Optional suite re-verify:

```bash
cd mrs/packages/renderer-core
node --test src/render/rt4d/proton/qualityHq.test.js \
  src/render/rt4d/proton/judgeWow.test.js \
  src/render/rt4d/proton/softSplat.test.js \
  src/render/rt4d/proton/mods.six.test.js
```

---

## 11. Distinct from Reviewer

Lawbook / P1–P5 not re-litigated; Reviewer artifact `04-reviewer-conformance.md`
stands. This stage is ship-standards, Drive-G-1/G-2, CI/deps hygiene, matrix/probes,
and promotion eligibility only.
