# BRIDGECONTRACT v2.0 — Multi-Field Bridge

Status: **declared** (this document) · Scalar multi-field path: **partial** ·
Vector/tensor/4D steppers: **skeleton** · Portals: **declared**

Generalizes v1.0. v1 `WaveBridge` remains supported.

## §1 Purpose

Allow multiple scalar wave fields (and optional empty vector/tensor/4D slots)
to produce **layered** lifts, force bundles, visual mods, and transition
signals.

## §2 FieldRegistry

```
scalarFields: WaveField3D[]   // required for useful evaluate; may be length ≥ 1
vectorFields: VectorField3D[] // may be []
tensorFields: TensorField3D[] // may be []
waveFields4D: WaveField4D[]   // may be []
```

Empty non-scalar arrays must not crash evaluate.

## §3 Couplings

Per-scalar arrays `α`, `k`, `γ`, `σ` (`alphaLift`, `kForce`, `ampVisual`,
`sigmaTransition`). Empty → pad with defaults; non-empty length mismatch → throw.

## §4 Outputs

- `lifted4D: Vec4[][]` — one layer per scalar field
- `forces: Map<bodyId, Vec3[]>` — force bundle length = scalar count
- `visualMod: Float32Array[]`
- `transitions: Float32Array[]` — `Θ = σ |ψ|` via `transitionSignal`

## §5 WaveBridgeV2

Steps all scalar fields with `stepWaveField3D`. Vector/tensor/4D: **skeleton**
no-ops. Builds per-scalar lift/mod/transition; accumulates `F = −k ∇ψ` bundles.

## §6 Dimensional shift (declared)

Pure helpers: `transitionSignal`, `shouldDimensionalShift(Θ, τ)` (Θ > τ),
`shiftMap3to4`, `returnMap4to3`. **Not** a live portal system; not renderer-wired.

## §7 Evidence

- Tests: multi-scalar evaluate, empty registry slots, threshold helper, v1 regressions

## §8 Frame invariant

`runBridgeFrameV2`: step registry → force bundles → lift layers → optional
body integrate. Orchestration only.

## Explicit non-claims

- Not continuum multi-physics
- Not portal / dimensional-shift product
- Not CKL-enforced
