/**
 * Tutorial: camera / view parameters on CanvasRenderer.
 *
 * Browser counterpart: drag + wheel in examples/web-demo.html
 * (same semantics as js/renderer.js TesseractRenderer._bindNavigation).
 *
 * Node demo: varies d4 / scale / cameraY across three PNGs.
 *   node examples/tutorials/camera-controls.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "../lib/node-canvas.mjs";
import { CanvasRenderer } from "../../4d-renderer/src/render/canvas-renderer.js";
import { getSurface, sampleSurface } from "../../4d-renderer/src/surfaces/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../gallery/images");
fs.mkdirSync(outDir, { recursive: true });

const mesh = sampleSurface(getSurface("clifford-torus"), 24);
const views = [
  { name: "near", d4: 3.2, d3: 3.2, scale: 110, cameraY: 0 },
  { name: "default", d4: 4.0, d3: 4.0, scale: 90, cameraY: 0 },
  { name: "lifted", d4: 5.0, d3: 4.5, scale: 80, cameraY: 120 },
];

for (const view of views) {
  const canvas = createCanvas(480, 360);
  const renderer = new CanvasRenderer(canvas, {
    profile: "cinematic",
    renderMode: "both",
    scaleMode: "fit",
    d4: view.d4,
    d3: view.d3,
    scale: view.scale,
    cameraY: view.cameraY,
  });
  renderer.renderFrame(mesh, 1.2, { cameraY: view.cameraY });
  const out = path.join(outDir, `tutorial-camera-${view.name}.png`);
  fs.writeFileSync(out, canvas.toBuffer("image/png"));
  console.log(`Wrote ${out}`);
}

console.log(
  "Note: package CameraControls binds to Camera4D.orbit — used by slice path, not CanvasRenderer theta."
);
