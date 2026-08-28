# Math-first contract (projection)

**This is projection, not holographic ρ / h_ij / COMPOSITE.** Those live in `mandala/holography/` and the chamber path.

The six-stage infographic in [`PIPELINE.md`](./PIPELINE.md) **is** this contract. Do not invent a second math system. Hardware is an executor, not the source of truth. That matches governed rendering: the renderer must **not** decide what “4D” means inside shading code.

Status tags follow AGENTS.md: **enforced** / **partial** / **declared** / **skeleton**.

API: `@mrs/renderer-core/math4d` (`MATH_FIRST_CONTRACT`, `evaluateMathContract`, `transformPipeline`).

---

## Axiom chain

**Axioms → State space → Transforms → Invariants → Projection → Implementation → Tests**

| Step | Content | Status |
|------|---------|--------|
| **Axioms** | Euclidean \(\mathbb{R}^4\); \(R_4 \in \mathrm{SO}(4)\); slice is a hyperplane; ordinary 3D camera after the slice | **enforced** (stated + tested on JS/CPU) |
| **State space** | \(X = (x, y, z, w)\) | **enforced** (`vec4`) |
| **Transforms** | \(X' = R_4 X\), \(R_4 \in \mathrm{SO}(4)\); then \(\Pi_{4\to 3}\), then \(\Pi_{3\to 2}\) | **enforced** |
| **Invariants** | \(\det(R_4)=1\), \(R_4^{\mathsf{T}} R_4 = I_4\); slice basis orthonormal and \(\perp n\); clip \(\div w\) is the NDC map | **enforced** (`validateSO4`, hyperplane basis, `clipToNdc`) |
| **Projection** | \(\Pi_{4\to 3}: \mathbb{R}^4 \to \mathbb{R}^3\), \(\Pi_{3\to 2}: \mathbb{R}^3 \to \mathbb{R}^2\) | **enforced** |
| **Implementation** | `transformPipeline` ≡ \(\Pi_{3\to 2} \circ \Pi_{4\to 3} \circ R_4\) (plus camera origin; see below) | **enforced** (JS/CPU) |
| **Tests** | `math4d.test.js` — composition identity + “backend must preserve mathematical contract” | **enforced** (JS/CPU only) |

---

## Renderer equation

4D state: \(X = (x, y, z, w)\)

Rotation: \(X' = R_4 X\), \(R_4 \in \mathrm{SO}(4)\)

Dimensional reduction: \(\Pi_{4\to 3}: \mathbb{R}^4 \to \mathbb{R}^3\)

Ordinary camera projection: \(\Pi_{3\to 2}: \mathbb{R}^3 \to \mathbb{R}^2\)

The renderer evaluates:

\[
I = \mathcal{R}\bigl(\Pi_{3\to 2}\bigl[\Pi_{4\to 3}(R_4 X)\bigr]\bigr)
\]

\(\mathcal{R}\) is raster / shade / post. It consumes the already-projected 2D sample. It does **not** redefine \(R_4\), the slice, or “4D.”

`transformPipeline` implements \(\Pi_{3\to 2} \circ \Pi_{4\to 3} \circ R_4\). It does **not** implement \(\mathcal{R}\).

---

## Map onto existing modules (one stack)

| Symbol | Meaning | Existing module | Status |
|--------|---------|-----------------|--------|
| \(R_4 X\) | SO(4) rotation of the 4-vector | `rot4Apply` / `buildSO4` / `so4.js`; camera map is `toCameraSpace` | **enforced** |
| Camera pose | `Camera4D.orientation` is a **world pose**; diagram / contract \(R_4\) is **view** | `viewRotationFromCamera`: \(R_{\mathrm{view}} = R_{\mathrm{pose}}^{\mathsf{T}}\) | **enforced** |
| Origin \(C\) | Rigid translate before \(R_4\) | `toCameraSpace`: \(x_c = R_4(X - C)\) | **enforced** |
| \(\Pi_{4\to 3}\) | Hyperplane slice \(H: n\cdot x = d\) onto \((e_1,e_2,e_3)\) | `sliceTo3D` / `projectToSlice3D`; mesh clip `sliceTriangle` / `clipTriangle` | **enforced** |
| \(\Pi_{3\to 2}\) | Ordinary 3D camera: clip + NDC \(\div w\) + viewport (infographic stages 4–6) | `toClipSpace` + `perspectiveP3D`, `clipToNdc`, `ndcToScreen` | **enforced** (viewport); raster **declared** |
| \(\mathcal{R}\) | Screen raster / shade / post | Hosts (canvas / RT4D / chamber). Not in `math4d` | **declared** |

The axiom writes \(R_4 X\). The six-stage diagram and `toCameraSpace` apply \(R_4(X-C)\) because the camera has an origin. That is the same SO(4) action plus a translation — not a second math system.

---

## Backend contract question

Every CPU / OpenCL / CUDA / WebGPU / Vulkan path must answer:

> **Does implementation \(B\) preserve the mathematical contract?**

Hardware executes the contract. It does not author it.

| Backend | Status in this package |
|---------|------------------------|
| JS / CPU (`transformPipeline`) | **enforced** — composition identity tested |
| OpenCL | **declared** — no implementation here; do not stub |
| CUDA | **declared** — no implementation here; do not stub |
| WebGPU | **declared** — no implementation here; do not stub |
| Vulkan | **declared** — no implementation here; do not stub |

A future backend lands by satisfying `evaluateMathContract` (same \(R_4\), same \(\Pi_{4\to 3}\), same \(\Pi_{3\to 2}\)), not by inventing 4D inside a shader.

---

## Three layers (do not collapse)

| # | Layer | What it asks | Status here |
|---|-------|--------------|-------------|
| 1 | **Mathematical correctness** | Does the code implement the contract / invariants? | **enforced** (JS/CPU projection chain) |
| 2 | **Numerical correctness** | Float error, determinism, backend parity | **partial** (JS/CPU Float64 is deterministic and tested; no cross-backend parity suite) |
| 3 | **Physical validity** | Is this the right physics? | **declared** (elegant projection is not a physics proof) |

**Passing 1 and 2 does not prove 3.**

This contract does not claim that a hyperplane slice is the correct physics of 4D light, holography, or spacetime. ρ / \(h_{ij}\) / COMPOSITE are a different recorder.

**See also:** compose vs compiler vs Rosetta — [`ROSETTA.md`](./ROSETTA.md). Rosetta maps shared chamber state. It does not extend this equation. Physical-invariant catalog (document encoding, not a second contract): [`PHYSICAL_INVARIANTS.md`](./PHYSICAL_INVARIANTS.md).

---

## Tests

```bash
cd mrs/packages/renderer-core
npm run test:math4d
```

Fixture: `math4d.test.js` → `Math-first contract` → “backend must preserve mathematical contract.”
