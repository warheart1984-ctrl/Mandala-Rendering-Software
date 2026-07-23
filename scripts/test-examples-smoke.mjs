/**
 * Smoke: examples suite paths + Node-importable tutorials (no canvas required for import checks).
 * Canvas-dependent tutorials are skipped unless a canvas package is found under renderer-core, root, or legacy 4d-renderer.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "examples/web-demo.html",
  "examples/web-demo/demo.js",
  "examples/web-demo/demo.css",
  "examples/README.md",
  "examples/gallery/README.md",
  "examples/gallery/generate.mjs",
  "examples/tutorials/README.md",
  "examples/tutorials/basic-render.js",
  "examples/tutorials/timeline-animation.js",
  "examples/scenes/tesseract-technical.json",
  "examples/videos/README.md",
  "examples/site/index.html",
];

for (const rel of required) {
  const p = path.join(root, rel);
  assert.ok(fs.existsSync(p), `missing ${rel}`);
}

const demoHtml = fs.readFileSync(path.join(root, "examples/web-demo.html"), "utf8");
assert.match(demoHtml, /web-demo\/demo\.js/);
assert.match(demoHtml, /Declared \/ not wired/i);

const tl = spawnSync(process.execPath, ["examples/tutorials/timeline-animation.js"], {
  cwd: root,
  encoding: "utf8",
});
assert.equal(tl.status, 0, tl.stderr || tl.stdout);
assert.match(tl.stdout, /TimelinePlayer/);

const canvasCandidates = [
  path.join(root, "mrs", "packages", "renderer-core", "node_modules", "canvas"),
  path.join(root, "node_modules", "canvas"),
  path.join(root, "4d-renderer", "node_modules", "canvas"),
];
const canvasPath = canvasCandidates.find((p) => fs.existsSync(p));
if (canvasPath) {
  const basic = spawnSync(process.execPath, ["examples/tutorials/basic-render.js"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(basic.status, 0, basic.stderr || basic.stdout);
  assert.match(basic.stdout, /Wrote/);
  console.log("canvas tutorials: ran basic-render.js");
} else {
  console.log("canvas tutorials: skipped (no canvas package)");
}

console.log("examples smoke ok");
