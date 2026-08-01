# Promotion Gate (v1) — Anime-Structure Plate Projector Lane

| Field | Value |
| --- | --- |
| Status | **Not ready** — promotion **declared**, not executed |
| Contract | [`ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md`](./ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md) §6 |
| Checklist | [`PROMOTION_READINESS_CHECKLIST.md`](./PROMOTION_READINESS_CHECKLIST.md) |
| Decision matrix | [`PROMOTION_DECISION_MATRIX.v1.md`](./PROMOTION_DECISION_MATRIX.v1.md) |
| Print SoT / Digital Printer | untouched |
| Drive-G-1 | No claim of default promotion until blockers clear |

## Purpose

Define the criteria, evidence, and constitutional requirements for promoting Projector4D (SoT) from “declared lane” to default Anime-Structure projection within the 4D Engine.

---

## Promotion Gate (v1)

### A. Mathematical Stability

Projector equation validated:

\[
(x', y', z') = \frac{d_4}{d_4 + w}\,(x, y, z)
\]

- α-equivalence confirmed: \(\alpha = 1/d_4\)
- Sign-variant projector documented ([`USER_4D_TO_3D_MATH_VERIFY.md`](./USER_4D_TO_3D_MATH_VERIFY.md))

**Required for promotion:**

- Pole-stress thresholds defined ([`POLE_STRESS_MITIGATION.md`](./POLE_STRESS_MITIGATION.md) — **partial** in runner)
- Numerical stability rules (reject / clamp / fallback) — Option C auto-fallback **partial**
- Hybrid behavior documented ([`DIAGRAM_HYBRID_POLE_BLEND.v1.md`](./DIAGRAM_HYBRID_POLE_BLEND.v1.md) — Option D **future**; v1 uses Option C)

### B. Evidence Requirements

| Item | Status |
| --- | --- |
| Sparse hits experiment | **PASS** (90 hits) |
| Scene-rich experiment | **PASS** (194 hits) |
| Replay determinism | **PASS** |
| Provenance schema (v1) | **declared** |

**Required for promotion:**

- CI provenance validator
- Ink-cel projection evidence
- Viewer comprehension study

### C. Rendering Integration

| Item | Status |
| --- | --- |
| Soft-raster fallback plates | generated (**partial**) |
| Full ink-cel projection | **declared** / incomplete |
| Shading-space alignment (3D vs 4D normals) | **declared** |
| Stroke stability under projector4d-sot | **declared** |

### D. Governance

| Item | Status |
| --- | --- |
| Multi-lane verdict locked | yes |
| No universal winner | yes |
| Default promotion declared (not executed) | yes |
| CSE/CCC constitutional review | **draft** eligibility — see `docs/governance/projcc/` |
| ProjCC binding | **declared** — [`PROJCC_BINDING_DIFF.v1.md`](../../governance/projcc/PROJCC_BINDING_DIFF.v1.md) |
| Promotion readiness sign-off | **not ready** |

---

## Promotion Decision (v1)

| Field | Value |
| --- | --- |
| Status | **Not ready** |
| Blocking items | pole thresholds (partial wire only), ink-cel tests, CI provenance validator |

Pattern: **experiment → provenance → contract → promotion**.

---

## Ink-Cel Evaluation Rubric (v1)

Defines how projector4d-sot must be evaluated under full ink-cel rendering before promotion.
Status of the rubric itself: **declared** until Engine3D ink-cel pipeline evidence exists.
Full plan: [`INK_CEL_PROJECTION_TEST_PLAN.md`](./INK_CEL_PROJECTION_TEST_PLAN.md).

### A. Silhouette Coherence

- Edges remain stable under projector4d-sot
- No tearing, jitter, or stroke discontinuity
- Silhouette matches 4D story arc

### B. Foreshortening Readability

- Foreshortening is visible but not overwhelming
- Viewer can interpret near-\(w\) vs far-\(w\)
- Scale modulation feels intentional, not chaotic

### C. Depth Cue Stability

- Z-spread increases under projector4d-sot
- Depth layering remains consistent across strokes
- No inversion or collapse near pole

### D. Stroke Behavior

- Ink-cel strokes maintain thickness and taper
- No stroke explosion under extreme scale
- No stroke collapse under near-zero scale

### E. Viewer Comprehension

- Viewers can articulate the 4D story
- Projector4d-sot plate is more expressive than drop_w
- drop_w remains clearer for debugging

### F. Replay Determinism

- Ink-cel plates must hash-match across runs
- Provenance must record projector method and \(d_4\)

### G. Promotion Gate

Ink-cel evaluation must PASS all criteria before projector4d-sot can be promoted as the default Anime-Structure projector.

---

## Cross-links

- [`PROMOTION_READINESS_CHECKLIST.md`](./PROMOTION_READINESS_CHECKLIST.md)
- [`POLE_STRESS_MITIGATION.md`](./POLE_STRESS_MITIGATION.md)
- [`DIAGRAM_POLE_STRESS.v1.md`](./DIAGRAM_POLE_STRESS.v1.md)
- [`docs/governance/projcc/PROJCC_REVIEW_PROJECTOR4D.v1.md`](../../governance/projcc/PROJCC_REVIEW_PROJECTOR4D.v1.md)
