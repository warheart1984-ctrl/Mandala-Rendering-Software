#!/usr/bin/env node
/**
 * Comparison: wireframe vs solid for one surface (same theta / framing).
 *
 *   node examples/comparisons/wireframe-vs-solid.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "../lib/node-canvas.mjs";
import { CanvasRenderer } from "../../mrs/packages/renderer-core/src/render/canvas-renderer.js";
import { getSurface, sampleSurface } from "../../mrs/packages/renderer-core/src/surfaces/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "out");
fs.mkdirSync(outDir, { recursive: true });

const surfaceId = "trefoil-4d";
const mesh = sampleSurface(getSurface(surfaceId), 28);
const theta = 0.9;

for (const mode of ["wireframe", "solid"]) {
  const canvas = createCanvas(640, 480);
  const renderer = new CanvasRenderer(canvas, {
    profile: mode === "solid" ? "cinematic" : "technical",
    renderMode: mode,
    scaleMode: "fit",
  });
  renderer.renderFrame(mesh, theta);
  const file = path.join(outDir, `${surfaceId}-${mode}.png`);
  fs.writeFileSync(file, canvas.toBuffer("image/png"));
  console.log(`Wrote ${file}`);
}

console.log(
  "Same mesh + theta; profiles differ (technical vs cinematic) as in production CLI defaults."
);
