/**
 * Tutorial: basic Canvas / Node render of the unit tesseract.
 *
 * Evidence: uses getSurface + sampleSurface + CanvasRenderer (node-canvas).
 * Run from repo root:
 *   node examples/tutorials/basic-render.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "../lib/node-canvas.mjs";
import { CanvasRenderer } from "../../mrs/packages/renderer-core/src/render/canvas-renderer.js";
import { getSurface, sampleSurface } from "../../mrs/packages/renderer-core/src/surfaces/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../gallery/images");
fs.mkdirSync(outDir, { recursive: true });

const mesh = sampleSurface(getSurface("tesseract"));
const canvas = createCanvas(640, 480);
const renderer = new CanvasRenderer(canvas, {
  profile: "technical",
  renderMode: "wireframe",
  scaleMode: "fit",
  background: "#0e1216",
});

renderer.renderFrame(mesh, 0.85);
const out = path.join(outDir, "tutorial-tesseract-wireframe.png");
fs.writeFileSync(out, canvas.toBuffer("image/png"));
console.log(`Wrote ${out} (${mesh.vertices.length} verts, ${mesh.edges.length} edges)`);
