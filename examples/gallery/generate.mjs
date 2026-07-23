#!/usr/bin/env node
/**
 * Generate gallery PNGs for the five registered surfaces (wireframe + solid).
 * Uses CanvasRenderer + node-canvas — same path as CLI single-frame render.
 *
 *   node examples/gallery/generate.mjs
 *
 * Requires native `canvas` (cairo). On Windows: cd mrs && pnpm run setup
 * (VS C++ Build Tools). Browser web-demo does not need native canvas.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CanvasRenderer } from "../../mrs/packages/renderer-core/src/render/canvas-renderer.js";
import {
  getSurface,
  sampleSurface,
  listSurfaces,
} from "../../mrs/packages/renderer-core/src/surfaces/index.js";

let createCanvas;
try {
  ({ createCanvas } = await import("../lib/node-canvas.mjs"));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  console.error(
    "\nGallery PNG generation skipped — native canvas unavailable. " +
      "Use examples/web-demo.html for browser Canvas2D, or fix canvas via: cd mrs && pnpm run setup."
  );
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "images");
fs.mkdirSync(outDir, { recursive: true });

const WIDTH = 720;
const HEIGHT = 540;
const THETA = 1.05;
const modes = [
  { mode: "wireframe", profile: "technical" },
  { mode: "solid", profile: "cinematic" },
];

const captions = [];

for (const { id, name } of listSurfaces()) {
  const resolution = id === "tesseract" ? null : 28;
  const mesh = sampleSurface(getSurface(id), resolution);
  for (const { mode, profile } of modes) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const renderer = new CanvasRenderer(canvas, {
      profile,
      renderMode: mode,
      scaleMode: "fit",
      background: "#0e1216",
    });
    renderer.renderFrame(mesh, THETA);
    const filename = `${id}-${mode}.png`;
    const outPath = path.join(outDir, filename);
    fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
    const caption = {
      file: `images/${filename}`,
      surface: id,
      name,
      mode,
      profile,
      width: WIDTH,
      height: HEIGHT,
      theta: THETA,
      vertices: mesh.vertices.length,
      edges: mesh.edges.length,
      faces: mesh.faces?.length ?? 0,
      renderer: "CanvasRenderer",
    };
    captions.push(caption);
    console.log(`Wrote ${filename}`);
  }
}

fs.writeFileSync(
  path.join(__dirname, "captions.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), captions }, null, 2)
);
console.log(`Captions: ${path.join(__dirname, "captions.json")}`);
