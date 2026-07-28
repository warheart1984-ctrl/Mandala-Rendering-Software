# 05 — Inspector acceptance (judge-wow)

**Trail:** `judge-wow-2026-07`  
**Stage:** Inspector  
**Status:** complete  
**Predecessor:** `04-reviewer-conformance.md` (foreman notes: PASS_WITH_NOTES)  
**Date:** 2026-07-27  
**Probe host:** local repo `G:/Mandala Rendering Software`

---

## 1. Verdict: `PASS_WITH_GAPS`

All required probes green. Implementor **enforced** tags match runnable evidence.
Honest **partial** / **declared** gaps remain (TextureSampler, Genblaze live Node-in-Docker,
prompt-string one-shot, bake polish). Soft-skip path for missing engine3d dist was
**not** taken here (dist present). Unrelated Genblaze CORS/plugin excluded from this trail.

---

## 2. Claim ↔ evidence table

| Claim (Implementor tag) | Evidence | Result |
|-------------------------|----------|--------|
| Dense star→proton triptych **enforced** | CLI demo `protonCount=50` (post-retune; Inspector earlier saw 38), beauty/depth/normal PNGs @256; `judgeWow` star assert `≥30` + bright-pixel gate | **PASS** |
| `aovEncode` / triptych AOVs **enforced** | unit tests + disk PNGs (valid `89 50 4e 47` sigs) | **PASS** |
| Genblaze proton HTTP mocked **enforced** | `pytest tests/test_proton_raster.py -q` → 10 passed | **PASS** |
| Genblaze live Node-in-Docker **partial** | not probed as live; tag honesty OK | **GAP (honest)** |
| `prompt-scene-to-proton.mjs` **enforced** | `--help` exit 0; `--scene-spec` required in usage/code | **PASS** |
| Prompt string → scene one-shot **declared** | CLI documents out-of-process gap | **GAP (honest)** |
| `shadeRasterFragment` in HeadlessStillRenderer **enforced** | import L17 + call ~L295; engine3d raster tests 12/12 | **PASS** |
| TextureSampler still path **declared** | comment L18–19 deferred / gap | **GAP (honest)** |
| Bake draft lattice plate **partial** | not re-probed; prior notes polish:skipped without FAL | **GAP (honest)** |
| P4 determinism (same seed → same `frameSha256`) | two CLI runs seed 42 → identical sha | **PASS** |
| `intentId` / CIR on evidence | evidence.json has intentId + cir | **PASS** |
| Star branch not soft-skipped | engine3d `dist/.../StarWorld.js` + `WorldDocumentRt4d.js` present; protonCount≥30 assert path | **PASS** |

---

## 3. Commands / probes run

| Command | Result |
|---------|--------|
| `node --test mrs/packages/renderer-core/src/render/rt4d/proton/*.test.js` | **29 pass / 0 fail / 0 skipped** (incl. star path ≥30) |
| `node …/judge-wow-proton-triptych.mjs --width 256 --out-dir …/judge-wow-triptych-256` | exit 0; mode `star-demo`; protonCount **38** |
| PNG sizes @256 | beauty **11685** B; depth **4307** B; normal **5978** B (non-empty; valid PNG sigs) |
| Same seed 42 → two out-dirs | `frameSha256` **match** `545a9be1…ada76a2f` |
| `.venv` Genblaze `pytest tests/test_proton_raster.py -q` | **10 passed** in 0.86s |
| `node --test dist/test/renderer/material-aware-raster.test.js dist/test/renderer/raster-still.test.js` (engine3d-core) | **12 pass / 0 fail** |
| `prompt-scene-to-proton.mjs --help` | exit 0; `--scene-spec` documented |
| Grep `shadeRasterFragment` in `HeadlessStillRenderer.ts` | import + call confirmed |

**Note:** No prior 64² beauty artifact found under `output/` for byte compare; 256 beauty ~11.7 KB is non-trivial (not empty/faint-tiny).

---

## 4. Replay / determinism notes

- Unit + CLI: same star seed → same `frameSha256`.
- CIR `timestamp` is wall-clock (present in evidence); hash path excludes it (sha stable across runs).

---

## 5. Gaps for Implementor

1. **TextureSampler** still declared / deferred in `HeadlessStillRenderer`.
2. **Genblaze live** Node+script-in-image remains **partial** (mocked path enforced only).
3. **Prompt string → SceneSpecification** not in this CLI (compose Genblaze `/api/prompt-to-scene` then `--scene-spec`).
4. **Bake polish** remains FAL-gated / partial.
5. Soft-skip fallback in `judgeWow.test.js` still exists when engine3d dist missing — acceptable per Reviewer; CI without dist would not exercise star density assert.

---

## 6. Claim wording to downgrade

None required for Implementor tags as stated. Do **not** elevate Genblaze live, TextureSampler, or bake to **enforced** without new probes.

---

## 7. Acceptance checklist vs Architect (§6)

| Criterion | Status |
|-----------|--------|
| Triptych CLI beauty + depth + normal @256–512 | **Met** (256 demo) |
| Deterministic frame hash same scene+seed | **Met** |
| `intentId` in evidence | **Met** |
| Genblaze default-off + availability shape | **Met** (pytest) |
| Prompt→scene→proton one-shot PNG+evidence | **Partial** — `--scene-spec` path enforced; prompt-string declared gap |
| Optional bake honest skeleton/partial | **Met** (partial tag) |
| No charter / AGENTS / policy edits | **Assumed OK** (not re-diffed protected paths this pass; Reviewer PASS_WITH_NOTES) |
| Drive-G-1 tags match evidence | **Met** |

**Decision:** Accepted as governed integration point **with gaps**.

**Enforced today:** star triptych AOVs, aovEncode, Genblaze mocked HTTP, prompt `--scene-spec` CLI, `shadeRasterFragment` hook, determinism.  
**Partial / declared gaps:** Genblaze live, TextureSampler, prompt-string compose, bake polish.  
**Standards Acceptance (stage 06):** hand off to Engineer Standards.

---

## 8. Handoff to Engineer Standards

Proceed to `06-engineer-standards.md` ship gate. Inspector does not redesign; fix list above is Implementor backlog only if product wants tags raised.
