/**
 * Tutorial: export formats that exist in this repo.
 *
 * Present (Node):
 *   - PNG via node-canvas / CLI movie pipeline
 *   - mesh JSON via scripts/export-surface-meshes.mjs
 *   - GLTF / OBJ via ExportManager (Node-only)
 *
 * Not claimed here: browser GLTF download, FFmpeg MP4 (optional if on PATH).
 *
 *   node examples/tutorials/export-formats.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "../lib/node-canvas.mjs";
import { CanvasRenderer } from "../../mrs/packages/renderer-core/src/render/canvas-renderer.js";
import { getSurface, sampleSurface } from "../../mrs/packages/renderer-core/src/surfaces/index.js";
import { ExportManager } from "../../mrs/packages/renderer-core/src/pipeline/ExportManager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../../output/examples-export");
fs.mkdirSync(outDir, { recursive: true });

const mesh = sampleSurface(getSurface("hopf-surface"), 20);
const canvas = createCanvas(512, 384);
const renderer = new CanvasRenderer(canvas, {
  profile: "technical",
  renderMode: "wireframe",
  scaleMode: "fit",
});
renderer.renderFrame(mesh, 0.4);
const pngPath = path.join(outDir, "hopf-wireframe.png");
fs.writeFileSync(pngPath, canvas.toBuffer("image/png"));
console.log(`PNG: ${pngPath}`);

const exporter = new ExportManager({ outputDir: outDir });
const scene = {
  width: 512,
  height: 384,
  frames: 1,
  fps: 1,
  surface: "hopf-surface",
  resolution: 20,
  renderMode: "wireframe",
  profile: "technical",
  scaleMode: "fit",
  d4: 4,
  d3: 4,
  scale: 80,
  background: "#0e1216",
  outputDir: outDir,
  outputPrefix: "export-demo",
};

const objPath = path.join(outDir, "hopf-surface.obj");
await exporter.exportOBJ(mesh, scene, objPath);
console.log(`OBJ: ${objPath}`);

const gltfPath = path.join(outDir, "hopf-surface.gltf");
await exporter.exportGLTF(mesh, scene, gltfPath);
console.log(`GLTF: ${gltfPath}`);

console.log("Declared (not run): browser MediaRecorder WebM — see js/export.js on the governed host.");
