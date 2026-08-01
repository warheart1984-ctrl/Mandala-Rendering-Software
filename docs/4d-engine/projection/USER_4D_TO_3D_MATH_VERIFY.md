# User 4D→3D projection math — verification vs MRS SoT

| Field | Value |
| --- | --- |
| Status | **declared** (analysis / mapping note; not a new renderer) |
| Date | 2026-08-01 |
| Print SoT (implementation) | `mrs/packages/renderer-core/src/render/rt4d/output/projector.js` (`Projector4D`) |
| Related | [`PROJECTION_CONTINUITY_CONTRACT.md`](./PROJECTION_CONTINUITY_CONTRACT.md) · [`ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md`](./ANIME_STRUCTURE_PLATE_PROJECTOR_CONTRACT.v1.md) · [`W_AS_STORY_VS_FLAT_AXIS.md`](./W_AS_STORY_VS_FLAT_AXIS.md) |
| Drive-G-1 | Verifies formulas and maps them to existing code. Does **not** claim a new projection path is implemented or enforced. Does **not** change Print SoT. No universal winner between Projector4D and drop_w. |

## Reference model vs implementation (binding)

**Separate mathematics from implementation.** Projection equations below are **reference models**. Code paths (`Projector4D`, LiveLink `drop_w` / `scale_by_w`, Engine3D soft-raster, `math/project.js`) are **implementation choices** for different render lanes.

| Layer | Role | Rule |
| --- | --- | --- |
| Reference model | Closed-form 4D→3D math (linear drop-\(w\); \(\alpha\)-perspective; alt \(d/(d-w)\)) | Evaluate through evidence; do not crown one model “correct” a priori |
| Print SoT | `Projector4D` \(d_4/(d_4+w)\) | **Leave untouched** by structure-lane experiments |
| Anime structure lane | Engine3D soft-raster / ink-cel consumer of projected RT4D hits | **Separate consumer** — may compare reference models without mutating Print SoT |
| Observation / LiveLink | Continuity aperture, sync projections | Different lane; aperture ≠ print |

Pattern: **multiple reference models evaluated through evidence** — not picking one mathematically “correct” implementation up front.

## Provenance (required on artifacts)

Every compare / structure-lane artifact MUST record which projector produced it so replay and A/B stay unambiguous:

```json
{
  "projector_id": "projector4d-sot",
  "projection_method": "projector4d-sot",
  "reference_model": "(x',y',z') = (d4/(d4+w)) * (x,y,z)",
  "alpha": "1/d4",
  "d4": 4,
  "lane": "anime-structure",
  "print_sot_touched": false
}
```

Allowed `projection_method` / `projector_id` values for this note’s experiment vocabulary:

| ID | Reference model | Implementation used in experiment |
| --- | --- | --- |
| `projector4d-sot` | \((x',y',z')=(d_4/(d_4+w))\cdot(x,y,z)\), \(\alpha=1/d_4\), pole at \(w=-d_4\) | `Projector4D.project4Dto3D` |
| `drop_w` | \((x',y',z')=(x,y,z)\) | LiveLink-equivalent linear drop |

## Verdict table (reference models ↔ repo)

| Formula | Model status | Caveats | Repo implementation |
| --- | --- | --- | --- |
| Linear \(P\in\mathbb{R}^{3\times4}\): \((x',y',z')^\top = P(x,y,z,w)^\top\) | Valid reference | Linear only (no foreshortening). Drop-\(w\) is one choice of \(P\). A bare \(P\) is not an SO(4) rotation. | LiveLink `drop_w`; Camera4D hyperplane + drop |
| Perspective \((x',y',z')=(x,y,z)/(1+\alpha w)\) | Valid reference | Singularity at \(1+\alpha w=0\). Sign of \(\alpha\) picks near side. | **Print SoT** `Projector4D`: \(d_4/(d_4+w)\) ≡ \(\alpha=1/d_4\). LiveLink `scale_by_w` is softer: \(1/(1+\lvert w\rvert)\). |
| Camera-at-\(w=d\) style \(x/(d-w)\) | Valid alt (sign) | ≡ SoT under \(w\mapsto -w\). | `math/project.js` uses \(d_4/(d_4-w)\). Prefer **Projector4D** as Print SoT when they disagree. |
| Ray \(r(t)=o+td\) in \(\mathbb{R}^4\) → intersect → project → 3D viz | Valid skeleton | 3D shading ≠ full 4D transport; normals/occlusion after project are lane-local. | RT4D intersect + chosen projector → Engine3D soft-raster/ink-cel |

## Canonical forms (user-confirmed)

**Drop-\(w\) baseline:**

\[
(x',y',z')=(x,y,z).
\]

**Perspective (user ↔ Print SoT closed form):**

\[
(x',y',z')=\frac{(x,y,z)}{1+\alpha w}
\quad\Longleftrightarrow\quad
(x',y',z')=\frac{d_4}{d_4+w}\,(x,y,z)
\quad\text{when}\quad
\alpha=\frac{1}{d_4}\ (d_4>0).
\]

Pole at \(w=-d_4\). Alt \(d_4/(d_4-w)\) ≡ SoT under \(w\mapsto -w\).

## Where implementations live

| Role | Path | Status tag |
| --- | --- | --- |
| Print SoT \(d_4/(d_4+w)\), \(d_3/(d_3+z)\) | `rt4d/output/projector.js` | enforced by projection invariant / continuity tests |
| Canvas / mesh \(d_4-w\) | `math/project.js` | implemented; **sign differs** from Projector4D |
| Observation continuity \(P(\theta,\varphi,\tau,\kappa)\) | `rt4d/projection/*`, ProjCC | partial→enforced suite; aperture ≠ print |
| LiveLink drop / soft scale | `live-link/StateSnapshot.js` | implemented for sync clients |
| Engine3D structure plate | soft-raster / ink-cel | separate consumer lane |
| Path-tracer observation bind | ProjCC / `pathTracerHooks.js` | **partial** |

## Structure lane (Constitutional Anime)

Anime structure lane consumes projected RT4D hits into Engine3D soft-raster (then ink/cel). It does **not** replace Digital Printer / Print SoT. Compare reference models on the **same** hit set, **same** Engine3D camera/scene, with provenance on every artifact.

### Compare acceptance criteria

1. Silhouette preservation  
2. Foreshortening  
3. Depth perception  
4. Replay determinism  
5. Viewer comprehension  

Runner (reusable): `mrs/packages/renderer-core/scripts/rt4d-project-compare.mjs`  
Evidence folder (tmp OK, often untracked): `tmp/rt4d-project-compare/`  
Flags: `--pole-stress` (near \(w=-d_4\)); `--scene rich` (denser scaffold — ink-cel still **declared**)

### Evaluation stance (binding)

- Same hits / camera / scene ⇒ differences attributable to projection model.
- Projector4D communicates 4th dim via foreshortening; drop_w is literal XYZ (weaker 4th-axis story).
- **No universal winner** — Projector4D for storytelling; drop_w for debug / literal inspection.
- Default anime-structure promotion of Projector4D remains **declared** until richer evidence.

## Explicit non-claims

- No new renderer / Print SoT change from this note.
- No claim that `math/project.js` and `Projector4D` are identical (they are not — \(w\) sign).
- No claim that one structure-lane projector is globally “correct” without evidence against the five criteria.
- No photoreal / beauty-print upgrade from this mapping.
- 3D soft-raster shading is not full 4D transport.
