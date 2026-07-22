import { PathTracer4D, SampleAccumulator } from "./integrator/PathTracer4D.js";
import { Projector4D } from "./output/projector.js";
import { vec4 } from "./math/vec4.js";

export async function renderRT4DFrame(scene4D, camera4D, options = {}) {
  const width = options.width ?? camera4D.width;
  const height = options.height ?? camera4D.height;
  const samples = options.samples ?? 64;
  const maxDepth = options.maxDepth ?? 8;
  const seed = options.seed ?? Date.now();

  const tracer = new PathTracer4D({ maxDepth, samplesPerPixel: samples });
  const accumulator = new SampleAccumulator(width, height);

  let rngState = seed;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let color = vec4(0, 0, 0, 0);
      for (let s = 0; s < samples; s++) {
        const u1 = fracSin(rngState++);
        const u2 = fracSin(rngState++);
        const u3 = fracSin(rngState++);
        const ray = camera4D.generateRay(x, y, u1, u2, u3);
        const L = tracer.trace(ray, scene4D);
        color.x += L.x; color.y += L.y; color.z += L.z;
      }
      const invS = 1 / samples;
      accumulator.addSample(x, y, vec4(color.x * invS, color.y * invS, color.z * invS, 1));
    }
  }

  accumulator.totalSamples = 1;
  const pixels = accumulator.finalize();
  const proj = new Projector4D({ width, height });
  const raster = proj.rasterize(pixels, width, height);

  return { pixels: raster, width, height, samples };
}

function fracSin(s) {
  const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
