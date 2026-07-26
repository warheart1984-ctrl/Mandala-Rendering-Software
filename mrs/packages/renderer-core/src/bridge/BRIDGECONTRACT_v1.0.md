# BRIDGECONTRACT v1.0

Status: **declared** (this document) · Implementation: **partial**

This file documents the v1.0 bridge surface shipped under
`@mrs/renderer-core/bridge`. It is **not** a constitutional charter edit, **not**
CKL-enforced, and **not** a claim of continuum PDE or dimensional-computing
product status.

## §1 Purpose

Provide a discrete **wave field bridge** between classical 3D motion/geometry
and a 4D lift coordinate `w`, plus force coupling into math3d `Body3D`.

## §2 Wave field

`WaveField3D` + `stepWaveField3D`: second-order finite-difference update on a
regular grid. **Tested** impulse propagation. Stable only under CFL constraints
(`σ = c dt / dx`); not unconditionally stable. Boundary: Dirichlet zero
(unchanged faces).

## §3 Lift / force / modulation

| Symbol | Meaning | Formula |
|--------|---------|---------|
| α | `alphaLift` | `w = α ψ` |
| k | `kForce` | `F = −k ∇ψ` |
| γ | `ampVisual` | `M = γ ψ` |

## §4 Inputs / outputs

`BridgeInputs3D`: `time`, `deltaTime`, `bodies`, `geometryVertices`

`BridgeOutputs`: `lifted4D`, `forces` (Map), `visualMod`

## §5 Contract

`BridgeContract.evaluate(inputs) → BridgeOutputs`

Concrete class: `WaveBridge(field, alphaLift, kForce, ampVisual)`

## §6 Evidence

- Unit tests in `bridge.test.js` (FD step, map, sample OOB, gradient, evaluate, determinism)
- Reuses math3d `vec3` / `Body3D` and math `vec4`

## §7 Frame invariant (orchestration)

Suggested frame order (library helper `runBridgeFrame`):

1. Advance wave field (`stepWaveField3D`)
2. Apply / collect body forces
3. Optionally integrate bodies
4. Lift geometry + visual mod

This is **orchestration**, not governance enforcement.

## Explicit non-claims

- Not continuum PDE proof
- Not Unreal/Unity parity
- Not PathTracer4D / Genblaze wiring
- Not CKL / constitutional runtime gate
