#!/usr/bin/env node
/**
 * Generate gallery PNGs for the five registered surfaces (wireframe + solid).
 * Uses CanvasRenderer + node-canvas — same path as CLI single-frame render.
 *
 *   node examples/gallery/generate.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "../lib/node-canvas.mjs";
import { CanvasRenderer } from "../../4d-renderer/src/render/canvas-renderer.js";
import {
  getSurface,
  sampleSurface,
  listSurfaces,
} from "../../4d-renderer/src/surfaces/index.js";

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
