/**
 * Parallel Renderer Worker Entry Point
 * Run as: node parallelRendererWorker.js
 */

import { parentPort } from "node:worker_threads";
import { mulberry32 } from "./parallelRenderer.js";

if (!parentPort) {
  throw new Error("Must run as worker thread");
}

function renderTile(tile, config) {
  const pixels = new Uint8Array(tile.width * tile.height * 4);
  const seed = config.seed + tile.index * 1000003;
  let rng = mulberry32(seed);
  
  for (let i = 0; i < pixels.length; i += 4) {
    const v = Math.floor(rng() * 256);
    pixels[i] = v;
    pixels[i + 1] = v;
    pixels[i + 2] = v;
    pixels[i + 3] = 255;
  }
  
  return { tileIndex: tile.index, pixels, timeMs: 0, samples: config.samples };
}

parentPort.on("message", async (work) => {
  const { tile, config } = work;
  const start = process.hrtime.bigint();
  
  const result = await renderTile(tile, config);
  
  const end = process.hrtime.bigint();
  result.timeMs = Number(end - start) / 1e6;
  
  parentPort.postMessage(result);
});