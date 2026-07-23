#!/usr/bin/env node
/**
 * Local Node render timing for CanvasRenderer frames.
 * Reports only measured numbers from this run — no invented FPS claims.
 *
 *   node examples/benchmarks/bench-render.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "../lib/node-canvas.mjs";
import { CanvasRenderer } from "../../mrs/packages/renderer-core/src/render/canvas-renderer.js";
import { getSurface, sampleSurface } from "../../mrs/packages/renderer-core/src/surfaces/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIDTH = 640;
const HEIGHT = 480;
const FRAMES = 30;
const surfaces = [
  { id: "tesseract", resolution: null },
  { id: "clifford-torus", resolution: 24 },
  { id: "hopf-surface", resolution: 24 },
];

const results = [];

for (const { id, resolution } of surfaces) {
  const mesh = sampleSurface(getSurface(id), resolution);
  const canvas = createCanvas(WIDTH, HEIGHT);
  const renderer = new CanvasRenderer(canvas, {
    profile: "technical",
    renderMode: "wireframe",
    scaleMode: "fit",
  });

  // Warmup
  renderer.renderFrame(mesh, 0);

  const t0 = performance.now();
  for (let i = 0; i < FRAMES; i++) {
    renderer.renderFrame(mesh, (i / FRAMES) * Math.PI * 2);
  }
  const elapsedMs = performance.now() - t0;
  const perFrameMs = elapsedMs / FRAMES;
  const row = {
    surface: id,
    resolution: resolution ?? "discrete",
    width: WIDTH,
    height: HEIGHT,
    frames: FRAMES,
    mode: "wireframe",
    renderer: "CanvasRenderer + node-canvas",
    elapsedMs: Number(elapsedMs.toFixed(2)),
    perFrameMs: Number(perFrameMs.toFixed(3)),
    measuredFpsEstimate: Number((1000 / perFrameMs).toFixed(1)),
  };
  results.push(row);
  console.log(
    `${id}: ${row.elapsedMs} ms / ${FRAMES} frames → ${row.perFrameMs} ms/frame (~${row.measuredFpsEstimate} fps est.)`
  );
}

const report = {
  methodology:
    "Single-threaded Node, node-canvas, CanvasRenderer.renderFrame loop. " +
    "Warmup one frame excluded. Not a browser GPU benchmark. Not comparable to WebGPU/RT4D path tracer.",
  host: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
  },
  measuredAt: new Date().toISOString(),
  results,
};

const out = path.join(__dirname, "last-run.json");
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`Wrote ${out}`);
