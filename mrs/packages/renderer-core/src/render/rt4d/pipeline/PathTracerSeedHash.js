/**
 * Supporting measurement for EI-REPLAY-DETERMINISM: same seed + same tiny
 * Scene4D → identical CPU path-tracer raster hash (single-process).
 *
 * Does **not** prove full timeline / multi-host replay. Catalog stays **declared**.
 */

import { PathTracer4D, SampleAccumulator } from "../integrator/PathTracer4D.js";
import { Projector4D } from "../output/projector.js";
import { Scene4D } from "../scene/Scene4D.js";
import { Hypersphere } from "../geometry/hypersurface.js";
import { Camera4D } from "../camera/Camera4D.js";
import { vec4 } from "../math/vec4.js";
import { hashBytes } from "./CPUConformanceGate.js";

/**
 * Deterministic tiny scene (fixed primitives; caller supplies seed for RNG only).
 * @returns {{ scene: Scene4D, camera: Camera4D }}
 */
export function buildTinyDeterministicScene(width = 4, height = 4) {
  const scene = new Scene4D();
  scene.addPrimitive(new Hypersphere(vec4(0, 0, 0, 0), 0.8), "default");
  scene.addPrimitive(new Hypersphere(vec4(1.2, 0.3, -0.2, 0.4), 0.35), "default");
  scene.addLight(new Hypersphere(vec4(0, 1.5, -1, 0.5), 0.2), "default");
  scene.build();
  const camera = new Camera4D({
    x: 0,
    y: 0,
    z: -3,
    w: 0,
    width,
    height,
    fovX: 50,
    fovY: 50,
    fovZ: 40,
    fovW: 30,
  });
  return { scene, camera };
}

/**
 * Sync CPU path-trace + project (mirrors renderRT4DFrame core loop).
 * @param {Scene4D} scene
 * @param {Camera4D} camera
 * @param {{ width: number, height: number, samples: number, maxDepth: number, seed: number }} opts
 * @returns {Uint8ClampedArray|Uint8Array|Float32Array|Array}
 */
export function renderTinyPathTracerFrame(scene, camera, opts) {
  const { width, height, samples, maxDepth, seed } = opts;
  const tracer = new PathTracer4D({ maxDepth, samplesPerPixel: samples });
  const accumulator = new SampleAccumulator(width, height);
  let rngState = seed;
  const fracSin = (s) => {
    const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let color = vec4(0, 0, 0, 0);
      for (let s = 0; s < samples; s++) {
        const u1 = fracSin(rngState++);
        const u2 = fracSin(rngState++);
        const u3 = fracSin(rngState++);
        const ray = camera.generateRay(x, y, u1, u2, u3);
        const L = tracer.trace(ray, scene);
        color.x += L.x;
        color.y += L.y;
        color.z += L.z;
      }
      const invS = 1 / samples;
      accumulator.addSample(
        x,
        y,
        vec4(color.x * invS, color.y * invS, color.z * invS, 1),
      );
    }
  }
  accumulator.totalSamples = 1;
  const pixels = accumulator.finalize();
  const proj = new Projector4D({ width, height });
  return proj.rasterize(pixels, width, height);
}

/**
 * Same seed → same hash for two independent tiny path-tracer runs.
 *
 * @param {{
 *   width?: number,
 *   height?: number,
 *   samples?: number,
 *   maxDepth?: number,
 *   seed?: number,
 * }} [opts]
 * @returns {{
 *   ok: boolean,
 *   hashA: string,
 *   hashB: string,
 *   width: number,
 *   height: number,
 *   seed: number,
 *   samples: number,
 *   kind: string,
 * }}
 */
export function cpuPathTracerHashDeterministic(opts = {}) {
  const width = opts.width ?? 4;
  const height = opts.height ?? 4;
  const samples = opts.samples ?? 1;
  const maxDepth = opts.maxDepth ?? 2;
  const seed = opts.seed ?? 0x4d5253;

  const a = buildTinyDeterministicScene(width, height);
  const b = buildTinyDeterministicScene(width, height);
  const frameOpts = { width, height, samples, maxDepth, seed };
  const pixelsA = renderTinyPathTracerFrame(a.scene, a.camera, frameOpts);
  const pixelsB = renderTinyPathTracerFrame(b.scene, b.camera, frameOpts);
  const hashA = hashBytes(pixelsA);
  const hashB = hashBytes(pixelsB);
  return {
    ok: hashA === hashB,
    hashA,
    hashB,
    width,
    height,
    seed,
    samples,
    kind: "cpu-path-tracer-seed-hash",
  };
}
