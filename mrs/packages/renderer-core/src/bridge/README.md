# Wave Bridge (3D ↔ 4D)

Import: `@mrs/renderer-core/bridge`

| Version | Surface | Status |
|---------|---------|--------|
| v1.0 | `WaveBridge`, `WaveField3D` FD | **partial** |
| v2.0 | `WaveBridgeV2`, `FieldRegistry` | **partial** (scalars); vector/tensor/4D step **skeleton**; portals **declared** |
| v3.0 | `WaveBridgeV3`, κ / ∂κ proxies | **partial** helpers + coupling; evolution / portals **skeleton/declared** |

See `BRIDGECONTRACT_v1.0.md`, `BRIDGECONTRACT_v2.0.md`, `BRIDGECONTRACT_v3.0.md`.

## What it is

A library bridge layer: discrete scalar waves, optional multi-field registry,
tensor **trace** curvature proxy, and lift/force/mod formulas. Reuses math3d.

## What it is NOT

- Continuum PDE / GR / “reality fabric” enforcement
- Live portals or dimensional-shift runtime
- PathTracer4D / Genblaze wiring
- CKL / constitutional gate (docs only under this folder)

## Frame invariants

- **§7 (v1)** `runBridgeFrame` — field → forces → optional integrate → lift
- **§8 (v2)** `runBridgeFrameV2` — registry step → bundles → layers
- **§9 (v3)** `runBridgeFrameV3` — same + κ / div / ∂κ coupling terms

## CFL

Scalar FD stable only when `σ = c dt / dx` is in a safe range (typically
`σ ≤ 1/√3` in 3D). Not unconditional.

## Tests

```bash
npm run test:bridge
```
