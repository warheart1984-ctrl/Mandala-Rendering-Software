# Physical Invariants (RT4D Math Engine)

**Source document:** `Pyshical Invarante.docx` (misspelled filename; content is a *Physical Invariant* note).
**Code:** `src/render/rt4d/math/physicalInvariants.js`
**Tests:** `src/render/rt4d/test/physicalInvariants.test.js`

## Drive-G-1 status

| Claim | Status | Evidence |
|-------|--------|----------|
| Length / radial / energy **predicates** match the document and hold numerically | **tested** | `physicalInvariants.test.js` |
| Predicates are importable from the math package | **tested** | exports in `math/index.js` + import smoke in tests |
| Predicates gate every render / path / CKL decision | **declared only** | not wired into `PathTracer4D`, CKL, or conformance profile |
| Classical `E(t)` conservation equals 4D BRDF energy conservation | **not claimed** | BRDF norms remain in `bsdf4d.js` / `normalization.test.js` (`3ρ/(4π)`, `3cosθ/(4π)`) |

## What the document states

Three branches of math, same pattern: **Invariant → boolean predicate on states**.

### 1. Geometry — distance under rotation

For a rotation (orthogonal) \(R\) with \(R^\top R = I\):

\[
\|Rv\|^2 = v^\top R^\top R v = \|v\|^2
\]

Predicate: `lengthPreserved(v, v_rot, tol)`.

### 2. Calculus — energy over time

\[
\frac{dE}{dt} = 0 \implies E(t) = C \implies E(t_1) = E(t_2)
\]

Predicate: `energyConserved(E_before, E_after, tol)`.

### 3. Trigonometry — explicit 2D rotation

\[
\begin{aligned}
x' &= x\cos\theta - y\sin\theta \\
y' &= x\sin\theta + y\cos\theta
\end{aligned}
\]

Using \(\cos^2\theta + \sin^2\theta = 1\) yields \(x'^2 + y'^2 = x^2 + y^2\).

Predicate: `radialDistanceInvariant(x, y, x_p, y_p, tol)`
Helper: `rotate2d(x, y, theta)`.

## Integration notes

- Lives under the **math / RT4D** tree (`renderer-core/.../math/`), not CROS CI-001..006.
- 4D helper `lengthPreserved4` applies the **same geometric statement** (orthogonal length preservation) to `vec4`; it does not add new physics beyond the document’s \(R^\top R = I\) argument.
- Existing SO(4) BRDF / PDF invariance tests in `normalization.test.js` are unchanged and remain the SoT for material math.
- **Invariant stack layer:** PI-* are registered as foundational constitutional math invariants under [`../invariants/`](../invariants/) (`STACK.md`). 4DRS engine invariants (EI-*) derive from these IDs; see [`docs/4drs/contracts/INVARIANT_STACK.md`](../../../../../../../docs/4drs/contracts/INVARIANT_STACK.md).
