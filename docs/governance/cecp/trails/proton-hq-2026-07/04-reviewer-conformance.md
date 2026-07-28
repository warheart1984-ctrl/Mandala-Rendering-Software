# 04 — Reviewer conformance (proton-hq)

**Trail:** `proton-hq-2026-07`  
**Stage:** Reviewer (CECP 04) — read-only  
**Date:** 2026-07-27  
**Verdict:** **PASS_WITH_NOTES**

---

## 1. Scope reviewed

qualityPreset.js, tonemap.js, supersample.js, bloom.js, pipeline.js, rasterizeProtons.js, index.js, qualityHq.test.js, render-proton-splat.mjs, judge-wow-hq.mjs, output/judge-wow-hq/evidence.json, trail 01–03. Protected paths clean.

## 2. Principles P1–P5 findings

| Principle | Finding |
|-----------|---------|
| P1 Intent | Satisfied — intentId/CIR required and recorded |
| P2 Evidence | Satisfied — evidence.json quality/tonemap/ss fields; plates gitignored (local regenerate) |
| P3 Authority | Satisfied — renderer-core proton + trail only |
| P4 Replayable | Satisfied — no PRNG; determinism tests; note tonemap-before-downsample order |
| P5 Sovereign | Satisfied — CPU only; no GPU claims |

## 3. Policy / ban / boundary findings

No GPU/path-trace claims. Bloom/depth-cue declared + refused. Protected paths untouched. Intent gate OK.

## 4. Constitutional / contract findings

STATUS tags honest (**enforced** for HQ path; bloom **declared**). Minor ADR drift: densityBoost 1.35→1.4. index.js roadmap “ToneMap” vs enforced proton `applyTonemap` — clarify for ESFR.

## 5. Defects

**Blocking:** none.

**Non-blocking:** tonemap-before-downsample; no hard [512,768] clamp; kernel scales lack dedicated unit assert; HQ output gitignored; bloom flags forwarded then refused by child.

## 6. Verdict

**PASS_WITH_NOTES**

## 7. Handoff to Inspector

Re-run qualityHq + judgeWow tests; re-run `judge-wow-hq.mjs --quality high`; verify evidence fields and same-seed hashes; verify beauty is 512×512 (not leftover 256); bloom refuse; protected-path clean.
