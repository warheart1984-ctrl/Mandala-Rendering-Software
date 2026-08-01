# Anime Structure Plate Projector Contract (v1)

| Field | Value |
| --- | --- |
| Status | **declared / partial** — contract text + compare evidence exist; **not** a runtime CKL / governance gate |
| Contract id | `AnimeStructurePlateProjector-v1` |
| Lane | `anime-structure` (Engine3D soft-raster / ink-cel structure plate) |
| Print SoT | **untouched** — `Projector4D` in `rt4d/output/projector.js` remains Digital Printer / beauty-print SoT |
| Related verify | [`USER_4D_TO_3D_MATH_VERIFY.md`](./USER_4D_TO_3D_MATH_VERIFY.md) |
| Design note | [`W_AS_STORY_VS_FLAT_AXIS.md`](./W_AS_STORY_VS_FLAT_AXIS.md) |
| Provenance schema | [`schemas/4d-engine/v1/StructurePlateProjectionProvenance.v1.schema.json`](../../../schemas/4d-engine/v1/StructurePlateProjectionProvenance.v1.schema.json) |
| Experiment evidence | `tmp/rt4d-project-compare/` · runner `mrs/packages/renderer-core/scripts/rt4d-project-compare.mjs` |
| Landed commits | `7f47af3` (verify + runner), `fec593b` (runner tidy) |
| Drive-G-1 | No universal winner. No Print SoT / Digital Printer mutation. Promotion of a default remains **declared** until richer evidence. Meta-pattern: **experiment → provenance → contract → promotion**. |

> **BANNER:** Structure-lane projection is a **consumer contract** over RT4D hits for
> Engine3D structure plates. It does **not** replace CPU RT4D print, Digital Printer,
> or ProjCC observation aperture. Aperture ≠ print ≠ structure plate.

---

## 1. Purpose

Governed projection of **4D RT hits → 3D structure-lane visualization** for Engine3D soft-raster / ink-cel, with:

1. **Reproducible foreshortening** (when the lane selects a perspective reference model)
2. **Provenance** on every plate / projected point set (method + reference model + lane)
3. **CECP-aligned semantics** — evidence, honest status tags, Print SoT sovereignty

This contract binds **how the anime-structure lane chooses and records a projector**. It does not crown one mathematics as universally correct.

---

## 2. Input

| Field | Requirement |
| --- | --- |
| Point | \(p = (x, y, z, w)\) from RT4D hit / sample |
| \(d_4\) | \(d_4 > 0\) when using Projector4D / \(\alpha\)-perspective |
| Lane selector | `anime-structure` → **Projector4D SoT reference** (default *candidate*, not enforced) · `literal-xyz` → **drop_w** |

Lane selector is a **routing intent**, not a runtime gate until wired (status: **declared**).

---

## 3. Reference models

### 3.1 Projector4D (Print SoT closed form — structure-lane *candidate*)

\[
(x', y', z') = \frac{d_4}{d_4 + w}\,(x, y, z)
\qquad (d_4 > 0),\quad \alpha = \frac{1}{d_4}
\]

| Property | Note |
| --- | --- |
| Foreshortening | Far \(w\) compresses / expands xyz footprint |
| Pole | \(w = -d_4\) (denominator zero) |
| \(\alpha\) | \(1/d_4\) — equivalent form \((x,y,z)/(1+\alpha w)\) |
| 4D story | \(w\) readable as size / nearness in 3D viz |
| Deterministic replay | Same hits + \(d_4\) → same \(xyz\) (finite cases) |

**Implementation SoT (math/print):** `mrs/packages/renderer-core/src/render/rt4d/output/projector.js` (`Projector4D.project4Dto3D`). Structure-lane use **reads** this formula; it must **not** mutate Print SoT behavior for Digital Printer.

### 3.2 drop_w (literal XYZ)

\[
(x', y', z') = (x, y, z)
\]

| Property | Note |
| --- | --- |
| No foreshortening | Identity on xyz |
| No \(w\)-story | Fourth axis discarded for geometry |
| Baseline | Literal structural inspection / debug |
| Deterministic replay | Trivial identity |

**Implementation touchpoint:** LiveLink `drop_w` in `live-link/StateSnapshot.js` (and equivalent structure-lane mapping).

---

## 4. Verdict rule (lane choice — not a universal ranking)

| Intent | Prefer | Status |
| --- | --- | --- |
| 4D narrative / explanation of structure | **Projector4D** | default *candidate* for `anime-structure` — **declared** until richer ink/cel evidence |
| Literal / flattening / engineering debug | **drop_w** | keep as engineering / debug path |

**Do not declare a universal winner.** Multi-lane philosophy: not one projector for every use case.

---

## 5. Evaluation stance (binding)

Locked from compare evidence (`tmp/rt4d-project-compare/`, commits `7f47af3` / `fec593b`):

1. **Experiment is valuable** — intuition → measurable evidence; same hits / camera / scene ⇒ differences attributable to the projection model.
2. **Results make sense** — Projector4D communicates the 4th dimension via foreshortening / depth; drop_w keeps literal XYZ and a weaker 4th-axis story.
3. **Provenance of method / reference model** ⇒ replayable comparisons.
4. **No universal winner**
   - **Projector4D** — better for explanation / storytelling of 4D structure (anime-structure default *candidate*)
   - **drop_w** — better for debugging / literal structural inspection
5. Fits **multi-lane** philosophy.

Promotion of Projector4D to **enforced** anime-structure default: **declared** only — requires richer scene / comprehension evidence (see §6, §9).

---

## 6. Decision Process / Promotion Gate

**Biggest win** of this work is formalizing the **decision process**, not crowning Projector4D over drop_w.

Promotion package (docs):

- [`PROMOTION_GATE.v1.md`](./PROMOTION_GATE.v1.md) — criteria; status **Not ready**
- [`PROMOTION_READINESS_CHECKLIST.md`](./PROMOTION_READINESS_CHECKLIST.md) — ~70% readiness
- [`POLE_STRESS_MITIGATION.md`](./POLE_STRESS_MITIGATION.md) — **Option C** auto-fallback for v1 (**partial** in runner); Option D hybrid = future
- [`PROMOTION_DECISION_MATRIX.v1.md`](./PROMOTION_DECISION_MATRIX.v1.md)

| Binding | Statement |
| --- | --- |
| Lane conclusion | **Projector4D** → 4D story / explanation; **drop_w** → literal geometry / debug. Different objectives, different lanes — not competitors for one “correct” projector. |
| Pole-stress evidence | Pole-stress already ran (`tmp/rt4d-project-compare/pole-stress/`; §9): Print SoT raw non-finite=1, structure-lane rejected=3 (reject-mode diag), drop_w accepted=13 of 13. Exposing a real boundary is **good** evidence that shapes the structure-lane policy — not a reason to collapse lanes. |
| v1 mitigation | **Option C** thresholds (\(\varepsilon=0.15\), \(S_{\max}=6\), \(S_{\min}=0.05\), \(R_{\max}=0.45\), reject_ratio \(0.20\)) wired **partial** in `rt4d-project-compare.mjs` — reject/non-finite/scale → `drop_w` fallback with provenance. |
| Default promotion | Remains **declared / not ready** until richer ink/cel + viewer-comprehension studies + CI provenance validator; promote only if evidence shows better understanding **without** compromising replay. |
| Pattern slogan | **experiment → provenance → contract → promotion** — not promote-first, validate-later. |

Status tags unchanged: contract **declared / partial**; default promotion **declared / not ready**.

---

## 7. Provenance (required fields)

Every structure-plate artifact MUST carry:

| Field | Type | Notes |
| --- | --- | --- |
| `projector_id` | string | e.g. `projector4d-sot` \| `drop_w` |
| `projection_method` | string | same vocabulary as id for this contract |
| `reference_model` | string | closed-form description |
| `alpha` **or** `d4` | number \| null | required for perspective methods; null for drop_w |
| `lane` | string | e.g. `anime-structure` |
| `print_sot_touched` | boolean | must be `false` for structure-lane experiments |
| `asset_sha256` | string | required when artifact is a plate (PNG) |

JSON Schema: `schemas/4d-engine/v1/StructurePlateProjectionProvenance.v1.schema.json` (**declared** schema; not a runtime gate).

---

## 8. Repo locations

| Role | Path | Status |
| --- | --- | --- |
| Print / math SoT \(d_4/(d_4+w)\) | `mrs/packages/renderer-core/src/render/rt4d/output/projector.js` | enforced by projection invariant suite for print fidelity |
| Sign-variant \(d_4/(d_4-w)\) | `mrs/packages/renderer-core/src/math/project.js` | implemented; **not** Print SoT when signs disagree |
| Observation / ProjCC | `mrs/packages/renderer-core/src/render/rt4d/projection/` | partial→enforced suite; aperture ≠ print ≠ structure plate |
| LiveLink drop / soft scale | `mrs/packages/renderer-core/src/live-link/StateSnapshot.js` | `drop_w`, `scale_by_w` |
| Compare runner | `mrs/packages/renderer-core/scripts/rt4d-project-compare.mjs` | **partial** evidence tool |
| Evidence folder | `tmp/rt4d-project-compare/` | often untracked; regenerate via runner |

---

## 9. Next experiments

| # | Experiment | Goal | Status tag |
| --- | --- | --- | --- |
| 1 | **Pole stress** — \(w \approx -d_4\) | Document reject / finite / non-finite policy; compare both methods | **partial** — ran (`tmp/rt4d-project-compare/pole-stress/`); 13 samples, Print SoT raw non-finite=1, structure-lane rejected=3, drop_w accepted=13 |
| 2 | **Richer ink/cel scene** | User comprehension beyond sparse points | **skeleton / partial** — denser scaffold ran (`--scene rich` → `scene-rich/`, 194 hits, fallback soft-raster); full ink-cel pipeline still **declared** |
| 3 | Default promotion | If evidence still favors Projector4D for understanding → default anime-structure projection; keep drop_w for debug | promotion **declared** until richer evidence |

### Pole policy (structure-lane compare — **partial** Option C)

| Layer | Behavior near \(w=-d_4\) |
| --- | --- |
| Print SoT `Projector4D` | No reject today — scale \(d_4/(d_4+w)\) may become non-finite |
| `math/project.js` (sign-variant) | near-clip reject → `visible: false` |
| Structure-lane compare wrapper | **Option C auto-fallback** to `drop_w` when \(\lvert d_4+w\rvert < \varepsilon\) (\(\varepsilon=0.15\)), scale outside \([0.05, 6]\), or non-finite — with provenance note. Reject-mode retained for diagnostics. Hybrid (Option D) **future**. |

Print SoT remains unchanged by this wrapper policy. See [`POLE_STRESS_MITIGATION.md`](./POLE_STRESS_MITIGATION.md).

---

## 10. Explicit non-claims

- Contract is **not** a charter CKL row / runtime deny gate (**declared**).
- No mutation of Digital Printer / Print SoT / constitutional charter.
- Soft-raster / fallback plates ≠ photoreal beauty print.
- Sparse or rich point dumps ≠ full ink-cel production pipeline.
- 3D shading after project ≠ full 4D transport.

---

## 11. Cross-links

- [`USER_4D_TO_3D_MATH_VERIFY.md`](./USER_4D_TO_3D_MATH_VERIFY.md) — formula ↔ repo mapping
- [`W_AS_STORY_VS_FLAT_AXIS.md`](./W_AS_STORY_VS_FLAT_AXIS.md) — readable design note
- [`PROMOTION_GATE.v1.md`](./PROMOTION_GATE.v1.md) — promotion gate (v1, **not ready**)
- [`PROMOTION_READINESS_CHECKLIST.md`](./PROMOTION_READINESS_CHECKLIST.md)
- [`POLE_STRESS_MITIGATION.md`](./POLE_STRESS_MITIGATION.md) — Option C
- [`PROJECTION_CONTINUITY_CONTRACT.md`](./PROJECTION_CONTINUITY_CONTRACT.md) — ProjCC (observation aperture)
- [`INTEGRATION_NOTES.md`](./INTEGRATION_NOTES.md) — ProjCC wiring
- [`../QUALITY_PROGRESS_LOG.md`](../QUALITY_PROGRESS_LOG.md) — quality trail entry
- CECP anime trail: `docs/governance/cecp/trails/constitutional-anime-rendering-2026-07/`
