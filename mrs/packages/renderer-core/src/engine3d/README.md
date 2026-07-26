# Engine3D (living demo host)

Import: `@mrs/renderer-core/engine3d`

| Piece | Status |
|-------|--------|
| `EngineHost` / `engineTick` / `runFrames` | **partial** |
| `World3D` (`mesh.vertices`) | **partial** |
| `Substrate4DStub` | **skeleton** |
| `Renderer3DStub` | **skeleton** |

## Locked frame order

Do not reorder. Each fixed step (`engineTick`):

```js
function engineLoop() {
  const dt = clock.deltaTime();
  // 1. Gather 3D world state
  const inputs = {
    time: clock.time,
    deltaTime: dt,
    bodies: world.bodies,
    geometryVertices: world.mesh.vertices,
  };
  // 2. Bridge evaluation (3D → 4D) — WaveBridge v1 only
  const outputs = bridge.evaluate(inputs);
  // 3. Apply wave forces to 3D physics
  for (const [body, force] of forceByBody.entries()) {
    body.applyForce(force.x, force.y, force.z);
  }
  // 4. Step 3D physics
  physics.step(dt);
  // 5. Send lifted 4D coords to 4D substrate
  substrate.update(outputs.lifted4D);
  // 6. Render 3D with visual modulation
  renderer.render(world, outputs.visualMod);
}
```

v1 `BridgeOutputs.forces` is `Map<body.id, Vec3>`; the host resolves onto
stable `World3D` body refs before step 3 so the loop matches the body-keyed
shape above.

## What it is NOT

- Full game engine / Unreal / PhysX parity
- WebGPU/WebGL renderer
- Genblaze / RT4D live path / BridgeContract v2–v6

## Tests / demo

```bash
npm run test:engine3d
npm run demo:engine3d
```
