# 4D Inspector — mathematical fields

**Status:** **declared** math; engine fill is **skeleton** / **partial** where code exists.  
**Contract:** [`MRS-IC-v1.1.md`](./MRS-IC-v1.1.md)

## 1. Picked point

\[
p \in \mathbb{R}^{4},\quad p=(x,y,z,w)
\]

Surface: implicit \(S(x)=0\) or parametric \(X(u,v):\mathbb{R}^{2}\to\mathbb{R}^{4}\).

## 2. Position

World-space coordinates of \(p\). Debugger: `position`.

## 3. Surface normal (4D)

Implicit:

\[
N_{4}(p)=\nabla S(p),\qquad
\hat n_{4}=\frac{N_{4}(p)}{\|N_{4}(p)\|}
\]

Mesh triangle: \(N_{4}\) from oriented edge cross in \(\mathbb{R}^{4}\) (engineering normal). Debugger: `normal4D`.

## 4. Tangent basis

Parametric: \(T_{u}=\partial X/\partial u\), \(T_{v}=\partial X/\partial v\).  
Implicit: \(T_{p}=\{v\in\mathbb{R}^{4}\mid \nabla S(p)\cdot v=0\}\).  
Orthonormalize to \(\{t_{1},t_{2}\}\). Debugger: `tangentBasis`.

## 5. Principal curvature

First form \(I\): \(E=\langle X_{u},X_{u}\rangle\), \(F=\langle X_{u},X_{v}\rangle\), \(G=\langle X_{v},X_{v}\rangle\).  
Second form \(II\): \(e=\langle X_{uu},\hat n_{4}\rangle\), etc.  
Shape operator eigenvalues \(\kappa_{1},\kappa_{2}\).  
**v1 skeleton:** may return zeros unless parametric second derivatives are supplied.

## 6. Projection matrix

\[
\Pi_{3\mathrm{D}}:\mathbb{R}^{4}\to\mathbb{R}^{3},\quad
\Pi(x)=Px
\]

Example drop-\(w\): \(P=\mathrm{diag}_{3\times4}(1,1,1)\). Debugger: `projectionMatrix`.

## 7. Hyperplane intersections

\[
H_{i}: n_{i}\cdot x + d_{i}=0,\quad
\delta_{i}=n_{i}\cdot p+d_{i}
\]

Debugger: list of \((n_{i},d_{i},\delta_{i},\mathrm{onPlane})\).

## 8. Rotation planes

4D rotations in coordinate planes; \(R(\theta)=\exp(\theta A)\) with antisymmetric \(A\). Debugger: planes + angles.

## 9. Jacobian

For \(X(u,v)\): \(J\in\mathbb{R}^{4\times 2}\) with columns \(X_{u},X_{v}\). Debugger: `jacobian`.

## 10. Local topology

Incident / neighbor cell IDs; boundary vs interior. Debugger: `topology`.

## Pipeline

Click → unproject 4D ray → BVH/primitive hit → fill `Inspector4DResult` → JSON/binary → Unity panel.
