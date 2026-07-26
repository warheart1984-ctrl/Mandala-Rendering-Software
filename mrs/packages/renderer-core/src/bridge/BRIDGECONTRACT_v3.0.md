# BRIDGECONTRACT v3.0 — Tensor-Coupled Bridge

Status: **declared** (this document)

| Piece | Status |
|-------|--------|
| WaveBridge v1 scalar FD | **partial** (tested) |
| WaveBridgeV2 multi-scalar | **partial** (tested) |
| Tensor3x3, κ=tr(T), tensorGradient ∂κ proxy | **partial** (tested discrete helpers) |
| WaveBridgeV3 coupling formulas | **partial** (tested on synthetic fields) |
| `stepTensorField3D` / `stepWaveField4D` / portals | **skeleton** / **declared** |

This is **not** continuum GR, **not** live portals, and **not** an enforced
“reality fabric” or space-time warping simulator. Prefer weaker verbs: samples,
couples, proxies.

## §1 Purpose

Extend v2 outputs with optional vector divergence and tensor curvature proxies
in force, lift, visual mod, and transition terms.

## §2 Tensor helpers

- `Tensor3x3` `{xx,xy,xz,yx,yy,yz,zx,zy,zz}`
- `tensorCurvature(T) = xx+yy+zz` (trace proxy κ — not Ricci)
- `TensorField3D` grid (9 channels/cell)
- `tensorGradientAtPosition` — **simplified diagonal ∂κ proxy** via central
  differences of κ; **not** full ∇·T

## §3 Couplings (per scalar layer)

| Coeff | Role |
|-------|------|
| α `alpha` | wave lift |
| β `beta` | curvature lift |
| k `kForce` | wave force |
| λ `lambdaDiv` | isotropic div(V) force proxy |
| μ `muTensor` | ∂κ force |
| γ `gammaVisual` | ψ mod |
| δ `deltaVisual` | \|V\| mod |
| ε `epsilonVisual` | κ mod |
| σ `sigmaTransition` | Θ = σ ψ κ |

Safe when `vectorFields[s]` / `tensorFields[s]` missing → treat as 0.

## §4 Formulas

```
F = −k ∇ψ + λ (div V) ê_iso + μ ∇κ̂
w = α ψ + β κ
M = γ ψ + δ |V| + ε κ
Θ = σ ψ κ
```

`ê_iso` is an isotropic (1,1,1) mapping of scalar divergence — a coupling
proxy, not a pressure solver.

## §5 Outputs

Same shape as v2: `lifted4D[][]`, `forces` Map→`Vec3[]`, `visualMod[]`,
`transitions[]`.

## §6 Skeletons

- `stepTensorField3D`, `stepVectorField3D`, `stepWaveField4D`: no-op
- Portal / dimensional resonance events: **declared** only (see v2 helpers)

## §7 Evidence

- `tensorCurvature` on known matrix
- `tensorGradientAtPosition` on linear-xx synthetic field
- `WaveBridgeV3` with 1 scalar + 1 static tensor: `w` includes βκ
- v1/v2 regression tests

## §9 Frame invariant

`runBridgeFrameV3`: `stepAllFields` → force bundles → lift/mod/transition →
optional integrate. Not CKL / GR enforcement.

## Explicit non-claims

- Not continuum general relativity
- Not space-time warping simulation
- Not PathTracer4D wiring
- Not “reality fabric” product marketing
