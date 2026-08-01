# \(w\) as Story vs \(w\) as Flat Axis

| Field | Value |
| --- | --- |
| Status | **declared** (design note; binds evaluation language, not a runtime gate) |
| Contract | [`ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md`](./ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md) |
| Verify | [`USER_4D_TO_3D_MATH_VERIFY.md`](./USER_4D_TO_3D_MATH_VERIFY.md) |
| Evidence | `tmp/rt4d-project-compare/` · commits `7f47af3` / `fec593b` |
| Print SoT / Digital Printer | **untouched** |

---

## The fork

When RT4D hits become a 3D structure plate for Engine3D (soft-raster / ink-cel), the fourth coordinate \(w\) can be treated two ways:

1. **Story** — \(w\) changes how the same \((x,y,z)\) *reads* in 3D (size, nesting, foreshortening).
2. **Flat axis** — \(w\) is dropped; what you see is literal XYZ, as if the fourth axis never bent the silhouette.

Those are **Projector4D** and **drop_w**.

---

## Projector4D — \(w\) as story

\[
(x',y',z')=\frac{d_4}{d_4+w}\,(x,y,z)
\]

Farther (or nearer) along \(w\) scales the point. The plate can *show* that a structure has extent in the fourth dimension: nodes nest, radii breathe, depth cues disagree with a flat drop. That is the storytelling value for anime-structure explanation.

Cost: a pole at \(w=-d_4\). Near the singularity, honesty beats silent clamp — reject or flag; do not invent a calm plate that hides the pole.

---

## drop_w — \(w\) as flat axis

\[
(x',y',z')=(x,y,z)
\]

What you see is what the first three coordinates already are. Excellent for debugging (“is this hit where I think in XYZ?”), literal inspection, and baselines. Weaker as a 4D *story*: the fourth axis does not speak through foreshortening.

---

## Choosing (no universal winner)

| You want… | Choose |
| --- | --- |
| Explain / show 4D structure to a viewer | **Projector4D** (anime-structure default *candidate*) |
| Debug / literal structural inspection | **drop_w** |

**Do not declare a universal winner.** Same hits, same camera, same scene — differences belong to the projection model. Provenance (`projector_id`, `reference_model`, \(d_4\)/\(\alpha\), lane) makes those comparisons replayable.

This fits a **multi-lane** philosophy: Print SoT, observation aperture (ProjCC), and anime structure plates may need different projectors for different jobs. One formula does not own every lane.

The durable win is the **decision process**, not a single projector pick: Projector4D and drop_w serve different objectives (4D story vs literal debug). Pole-stress exposing a real boundary is evidence that belongs in the lane contract. Default promotion stays **declared** until richer ink/cel + comprehension studies; pattern = **experiment → provenance → contract → promotion** (see contract §6).

---

## Shared guarantees

Both paths are:

- **Deterministic** on the same hit set
- **Replay-safe** when provenance is recorded
- **Engine3D-compatible** as 3D point / mesh consumers (soft-raster today; ink-cel richer pipeline still **declared** / scaffolded)

Neither path:

- Touches **Print SoT** (`Projector4D` as Digital Printer / beauty-print authority)
- Routes into **Digital Printer**
- Amends the constitutional charter

Structure-lane experiments **read** the Projector4D closed form; they do not rewrite the print kernel.

---

## What the first compare already showed (**partial** evidence)

On a shared hypersphere-arc hit dump (`tmp/rt4d-project-compare/`):

- Projector4D produced measurable foreshortening / depth contrast (`mean|scale-1|`, larger z-span / radius variance).
- drop_w kept literal XYZ (scale ≡ 1, flatter 4D story).
- Dual-run point-set hashes matched → replay determinism **PASS**.
- Plates used Engine3D soft-raster when available, else in-script fallback (same camera intent).

That is enough to justify *keeping both* and treating Projector4D as the storytelling **candidate** — not enough to **enforce** it as the only anime-structure default. Pole-stress has already run (structure-lane rejects near \(w=-d_4\); drop_w accepts all); richer ink/cel + viewer-comprehension evidence still gate promotion. Default promotion stays **declared**.

---

## Next

See contract §9: richer scene / comprehension (`--scene rich` and beyond), then only with evidence promote Projector4D as default anime-structure projection while retaining drop_w for engineering.
