#!/usr/bin/env node
/**
 * Tiny Node demo: run N EngineHost frames and print summary JSON.
 * Proves the v1 bridge loop is "alive" without a browser renderer.
 *
 * Usage: node scripts/engine3d-demo.mjs [frames]
 */
import { vec3 } from "../src/math3d/vec3.js";
import { FIXED_DT } from "../src/math3d/physics.js";
import { createWaveField3D, idx } from "../src/bridge/wave-field-3d.js";
import { WaveBridge } from "../src/bridge/bridge-contract.js";
import { EngineHost, World3D } from "../src/engine3d/index.js";

const frames = Math.max(1, Number(process.argv[2] ?? 12) || 12);

const field = createWaveField3D({
  nx: 7,
  ny: 7,
  nz: 7,
  dx: 1,
  c: 1,
  dt: FIXED_DT,
});
field.psi[idx(field, 3, 3, 3)] = 1;
field.psiPrev[idx(field, 3, 3, 3)] = 1;

const world = new World3D();
world.setVertices([vec3(3, 3, 3), vec3(2, 3, 3), vec3(4, 3, 3)]);
const body = world.addBody({
  position: vec3(2, 3, 3),
  mass: 1,
});

const host = new EngineHost({
  world,
  field,
  bridge: new WaveBridge(field, 1, 2, 1),
  fixedDelta: FIXED_DT,
});

const summary = host.runFrames(frames);

const out = {
  ...summary,
  bodyVelocity: { ...body.velocity },
  bodyPosition: {
    x: body.position.x,
    y: body.position.y,
    z: body.position.z,
  },
  sampleLiftW: host.substrate.lastLifted4D.map((p) => p.w),
  sampleVisualMod: host.lastOutputs?.visualMod ?? [],
};

console.log(JSON.stringify(out, null, 2));
