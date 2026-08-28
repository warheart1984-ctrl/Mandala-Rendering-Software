# Physical invariants (catalog)

Encoding spec (do not invent another):
[`mrs/packages/renderer-core/src/render/rt4d/math/physical_invariants.md`](../../mrs/packages/renderer-core/src/render/rt4d/math/physical_invariants.md)

**Method:** Invariant → boolean predicate on states. Meta: `{id, ok, evidence}`.

Python (same method): [`mrs/packages/renderer-core/src/render/rt4d/math/physical_invariants.py`](../../mrs/packages/renderer-core/src/render/rt4d/math/physical_invariants.py)

**See also:** [CONTRACT.md](./CONTRACT.md) (layer 3 physical validity is **declared**). [ROSETTA.md](./ROSETTA.md) (shared state only; not a physics proof).

Passing a math/numeric predicate does **not** prove physical validity.

## Catalog

| ID | Formula / statement | Where | Status | Physical | Contract |
|----|---------------------|-------|--------|----------|----------|
| PI-GEO-LENGTH | ‖Rv‖² = ‖v‖² when RᵀR = I | `physicalInvariants.js` | **tested** | **declared** | projection |
| PI-CALC-ENERGY | dE/dt = 0 ⇒ E(t1)=E(t2) | same | **tested** | **declared** | projection |
| PI-TRIG-RADIAL | x'²+y'² = x²+y² via cos²+sin²=1 | same | **tested** | **declared** | projection |
| math4d.so4-isometry | det(R₄)=1, R₄ᵀR₄=I₄ | `so4.js` `validateSO4`, CONTRACT.md | math **enforced** (JS/CPU) | **declared** | projection |
| math4d.hyperplane-incidence | n·x = d; basis ⊥ n, orthonormal | `hyperplane.js`, CONTRACT.md | math **enforced** | **declared** | projection |
| proto.scalar-mass-conservation | \|Σφ'−Σφ\| ≤ 1e-2 | `mandala/proto/aais-gate.mjs` | gate **enforced** | Claim B **not claimed** | proto |
| mandala.engine.no-superluminal-defect | Chebyshev ≤ maxDefectStep | `constraint-solver.mjs` | **partial** | **declared** | proto |
| holo.unit-timelike-normal | g(n,n)=−1 | `mandala/holography/projector.mjs` | **partial** | **declared** | holography |
| holo.induced-hij | h_ij = g_ij − g_0i g_0j/g_00 → δ | `inducedMetricHij` | **partial** | **declared** | holography |
| holo.null-constraint | \|Δx\| ≤ c\|Δt\| | `metric.nullConstraintOk` | **declared** (stub) | **declared** | holography |
| holo.rho-bounds | ρ ∈ [0,1] proxy | EGT / holo-loop clamp | **partial** | **declared** | holography |
| holo.w-ij-bounds | w_ij ∈ [0,1] | `HOLOGRAPHIC_BULK_BOUNDARY.md` | **partial** | **declared** | holography |
| character.k-lock | \|K\|≥0.8, drift<0.08 | `boundary-appearance.mjs` | **partial** | **declared** | character |
| character.dhat-60 | joint if \|d̂^i·d̂^j\| < cos(60°) | same | **partial** | **declared** | character |
| inv-bulk-egt-coupling | no bulk step without updateEGT | `ciems-lab.mjs` | **partial** (soft) | **declared** | holography |
| holo.ads-cft-claim-b | AdS/CFT / RT / von Neumann | holography READMEs | **declared** | **not claimed** | holography |
| EI-RADIOMETRIC | BRDF=3ρ/(4π), pdf=3cosθ/(4π) | `normalization.test.js` | **tested** | **declared** | projection |

Not a second physics: Rosetta does not add invariants. Engine3D tick invariants and CROS CI-001..006 are different lineages (governance / creative), not this catalog.

## How to add one

Same as the encoding document — do not write a new template:

1. State the invariant (formula as the project claims it).
2. Write a boolean predicate on states (`ok = pred(state)`).
3. Register `{id, branch, statement, predicate, status, contract, physical}` on `PROJECT_INVARIANTS`.
4. Return `invariant_predicate_result(id, ok, evidence)`.
5. Tag **physical** `declared` unless the project actually claims a physics proof (none today). AdS/CFT stays `not-claimed` / predicate must not pass.

```bash
cd mrs/packages/renderer-core/src/render/rt4d/math
python3 physical_invariants.py
python3 -m unittest test_physical_invariants.py
```
