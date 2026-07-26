# @mrs/engine3d-core

Deterministic six-step Engine3D host loop (plus replay append).

**Relationship to `@mrs/renderer-core/engine3d`:** that package is the earlier
WaveBridge-coupled **partial** living demo. This package is the CI-ready
TypeScript core with explicit modules, invariants, and replay — same locked
order, standalone implementation (no WaveField dependency).

## Status (Drive-G-1)

| Piece | Status |
|-------|--------|
| EngineHost tick order + force clear + replay append | **enforced** (tests) |
| World3D / Body / BodyRegistry / WorldMesh | **enforced** (tests) |
| PhysicsEngine semi-implicit Euler | **enforced** (tests) |
| BridgeV1 pure evaluate (gravity-like) | **enforced** (tests) |
| Substrate4D + GlyphEngine4D → VisualMod | **enforced** (tests) |
| RendererCore + SceneBuilder + ShaderPrograms (null/headless) | **enforced** (tests) |
| Runtime invariants (forces cleared, visualMod before render) | **enforced** (tests) |
| Structural invariants (order-only) | **partial** — description says structurally enforced |
| WebGPU backend classes | **skeleton** — Node has no `navigator.gpu` by default |
| CIEMSOverlay / MandalaMapping pure helpers | **partial** (unit-tested) |
| Governance DSL (`Engine3DRules` + default rules) | **partial** (unit-tested; `.ciems` parser declared) |
| Constitutional suite (order, freeze, substrate, rules) | **partial** (real checks + skipped declared tests) |
| Cluster / GPU scheduler / wire protocols | **declared** — see SPEC + RFC |
| Engine3D constitution / rulebook / ledger docs | **declared** — `docs/4d-engine/engine3d/` |

## Locked tick order

1. Gather inputs (`InputGatherer` / clock + registry + mesh vertices)
2. `bridge.evaluate(inputs)` → `Map<id, Vec3>`
3. Apply forces via registry; **clear** the forces map
4. `physics.step(dt, bodies)`
5. `substrate.update(lifted4D)` → `VisualMod`
6. `renderer.render(world, visualMod)`
7. Append `ReplayRecord` to timeline

## WebGPU honesty

Node 20 does **not** ship WebGPU. Real GPU output needs a browser with
`navigator.gpu` or a Dawn/wgpu Node binding. The demo uses
`NullHeadlessRenderer`. Backend files under `src/renderer/backend/` are
**skeleton** abstractions.

## Scripts

```bash
npm install
npm run build
npm run test:engine3d
npm run demo:engine3d
```

## Docker

Lean multi-stage Dockerfile: build + test during image build; runtime runs
the headless demo. No X11/GL packages (not required for null renderer).
