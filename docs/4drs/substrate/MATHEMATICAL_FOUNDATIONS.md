# Mathematical Foundations — Engine-Core Substrate

**Document role:** Normative *intent* for the 4DRS mathematical substrate.  
**Status:** **declared** (Drive-G-1). Equations define the target model; they are **not** claimed as fully enforced by RT4D v1.0 unless an Evidence row says otherwise.  
**Related:** [`CONSTITUTIONAL_CONTRACTS.md`](./CONSTITUTIONAL_CONTRACTS.md) · [`../SPEC-v1.0.md`](../SPEC-v1.0.md) · [`../../constitution/CHARTER.md`](../../constitution/CHARTER.md)

---

## Goal

Treat physics, live links, shaders, assets, and replay as operations on well-defined structures in

\[
\mathbb{R}^{4} \times \mathbb{R}
\]

(space–time), with optional discrete state attached to fields.

| Symbol | Meaning |
| --- | --- |
| \(x \in \mathbb{R}^{4}\) | Spatial point \(x = (x,y,z,w)\) |
| \(t \in \mathbb{R}\) | Time |
| \(\Phi(x,t) \in S\) | State field (geometry, material, dynamics) |
| \(K\) | Simplicial complex (topology) |
| \(f \colon K \to \mathbb{R}^{4}\) | Geometric embedding |

**Topology / geometry separation:** topology lives in \(K\); geometry lives in the embedding \(f\). 4D objects may be modeled as 3-manifolds embedded in \(\mathbb{R}^{4}\) or as 4-simplicial complexes.

---

## 1. 4D physics — governing equations

### 1.1 State space

\[
x \in \mathbb{R}^{4},\quad x = (x,y,z,w),\quad t \in \mathbb{R}
\]

\[
\Phi(x,t) \in S
\]

where \(S\) carries geometry, velocity, material, and constraints.

### 1.2 Dynamics (general form)

\[
\frac{\partial\Phi}{\partial t}
=
F\bigl(\Phi,\nabla_{4}\Phi,x,t\bigr)
\]

with \(\nabla_{4}\) the gradient on \(\mathbb{R}^{4}\).

**Particle / Newtonian form:**

\[
m\frac{d^{2}x}{dt^{2}}
=
F(x,\dot{x},t),
\quad x \in \mathbb{R}^{4}
\]

**XPBD-style constraints:**

\[
C(x_{1},\ldots,x_{n}) = 0,
\quad x_{i} \in \mathbb{R}^{4}
\]

with iterative projection in \(\mathbb{R}^{4}\).

### 1.3 Discretization (canonical kernel)

- Time: \(t_{n} = n\,\Delta t\)
- Space: vertices \(x_{i}^{n} \in \mathbb{R}^{4}\)

\[
x_{i}^{n+1}
=
x_{i}^{n}
+
\Delta t\,v_{i}^{n}
+
\Delta t^{2}\,a_{i}^{n}
\]

This is the **canonical 4D physics kernel** for particle / rigid updates.

### 1.4 Evidence (v1.0)

| Claim | Status | Evidence |
| --- | --- | --- |
| \(\mathbb{R}^{4}\) rigid bodies + world step | **skeleton** | `4d-renderer/src/physics/` (`PhysicsWorld4D`, `RigidBody4D`, `Collider4D`) |
| Explicit PDE \(\partial\Phi/\partial t = F(\ldots)\) field solver | **declared** | this document |
| Full XPBD constraint projection suite | **declared** | this document; not charter-enforced |

---

## 2. Live engine links — dimensional morphisms

### 2.1 Engine state spaces

\[
E_{k} = \{\Phi_{k}(x,t)\}
\]

### 2.2 Link as operator / morphism

\[
L_{ij} \colon E_{i} \to E_{j}
\]

Example — map 4D physics (or path state) into a 3D projection film:

\[
\Psi(y,t) = P\bigl(\Phi(x,t)\bigr),
\quad P \colon \mathbb{R}^{4} \to \mathbb{R}^{3}
\]

### 2.3 Live link constraint

\[
\Phi_{j}(t) = L_{ij}\bigl(\Phi_{i}(t)\bigr)
\]

enforced each frame → synchronous coupling (categorical reading: functor between state categories).

### 2.4 Evidence (v1.0)

| Claim | Status | Evidence |
| --- | --- | --- |
| Shared-frame / native preview path | **experimental** | `SharedFramePreview`, SovereignX GPU dispatch, `/?nativePreview=1` |
| Formal \(L_{ij}\) registry + continuity proofs | **declared** | this document; LEL-C |

---

## 3. Shader graphs — functional DAGs over 4D inputs

### 3.1 Nodes

Each node \(n_{k}\) is a function

\[
n_{k} \colon \mathbb{R}^{4} \times P_{k} \to V_{k}
\]

with parameters \(P_{k}\) and intermediate values \(V_{k}\).

### 3.2 Graph

DAG \(G = (V,E)\) with composition

\[
o(x) = n_{k_{m}} \circ \cdots \circ n_{k_{1}}(x)
\]

### 3.3 4D-aware shading

Inputs may include \(w\), 4D normals, and distance fields. For an implicit surface \(S(x) = 0\):

\[
N_{4}(x) = \frac{\partial S(x)}{\partial x}
\]

### 3.4 Evidence (v1.0)

| Claim | Status | Evidence |
| --- | --- | --- |
| Node/graph containers + WGSL compile path | **skeleton** | `4d-renderer/src/shader-graph/` |
| Pure-function / DAG / 4D-normal calculus as constitutional law | **declared** | SG-C |

---

## 4. Asset export — projection + serialization

### 4.1 Projection operators

\[
\Pi_{3\mathrm{D}} \colon \mathbb{R}^{4} \to \mathbb{R}^{3},
\quad
\Pi_{2\mathrm{D}} \colon \mathbb{R}^{4} \to \mathbb{R}^{2}
\]

Hyperplane slice example:

\[
\Pi_{w=w_{0}}(x,y,z,w) = (x,y,z)
\quad\text{with } w = w_{0}
\]

### 4.2 Export pipeline

1. Choose projection \(\Pi\).  
2. Apply \(\Pi\) to geometry and fields.  
3. Serialize to target schema (glTF, MRS mesh JSON, …):

\[
A = \bigl(\Pi(K),\,\Pi(f),\,\Pi(\Phi)\bigr)
\]

### 4.3 Evidence (v1.0)

| Claim | Status | Evidence |
| --- | --- | --- |
| Surface mesh export + host loaders | **partial** | `npm run export:surfaces`, `*.mesh.json`, Unity/Unreal solid paths |
| Morph / sequential GLB exporters | **skeleton** | `4d-renderer/src/asset-pipeline/` |
| Mandatory projection-evidence + dimensional-loss manifest | **declared** | AE-C |

---

## 5. Deterministic replay — pure functional evolution

### 5.1 Transition

\[
S_{n+1} = T(S_{n}, u_{n})
\]

- \(S_{n}\): full engine state at step \(n\)  
- \(u_{n}\): input / control at step \(n\)  
- \(T\): deterministic transition

### 5.2 Determinism conditions

- Fixed \(\Delta t\)  
- No hidden global state  
- Pure RNG with fixed seed: \(r_{n} = R(r_{n-1})\) with \(R\) deterministic  

### 5.3 Replay

Given \(S_{0}\) and \(\{u_{n}\}\):

\[
S_{n}
=
T^{(n)}\bigl(S_{0},\{u_{k}\}_{k=0}^{n-1}\bigr)
\]

Temporal contract: same inputs → same trajectory.

### 5.4 Evidence (v1.0)

| Claim | Status | Evidence |
| --- | --- | --- |
| Param / timeline replay + provenance recorder | **partial** | `ReplayService`, `ProvenanceRecorder`, CSE CSR, CSSV frames |
| Bit-identical full-engine \(T^{(n)}\) across hosts | **declared** | DR-C |
| RT4D film RNG keyed by seed | **partial** | `renderRT4DFrame` seed path (engineering hash, not cryptographic) |

---

## Mapping to RT4D v1.0 modules

| Substrate topic | Closest shipped surface |
| --- | --- |
| \(\mathbb{R}^{4}\) algebra / \(S^{3}\) sampling | `rt4d/math` |
| Hypersurface / volume hits | `rt4d/geometry` |
| Path integration | `rt4d/integrator` |
| Projection helpers | `rt4d/output`, cinematic `project4Dto3D` |
| Official validation scene | Hyper-Caustic Lens |

RT4D freezes **rendering** APIs; this substrate extends the same \(\mathbb{R}^{4}\) language to dynamics, coupling, shading graphs, export, and replay.
