/**
 * Smoke: 4d-renderer package is importable and samples/projects correctly.
 * Does not require node-canvas (browser-safe modules only).
 * Optional PNG path runs only when canvas is installed.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = path.join(root, "4d-renderer");

function importFromPkg(rel) {
  return import(pathToFileURL(path.join(pkg, rel)).href);
}

const {
  getSurface,
  listSurfaces,
  sampleSurface,
  project4Dto2D,
  project4Dto3D,
  projectEdge4Dto2D,
  cinematicRotation,
  CanvasRenderer,
  createScene,
  fitTransform,
  applyFit,
  getRenderProfile,
  normalizeMesh4D,
  marchingCubes4D,
  createLattice,
  setDensity,
  weldMesh,
} = await importFromPkg("src/index.js");

const listed = listSurfaces();
assert.ok(listed.some((s) => s.id === "tesseract"), "tesseract registered");
assert.ok(listed.some((s) => s.id === "clifford-torus"), "clifford-torus registered");

// Shared mesh export artifacts (Unity/Unreal consume these).
const meshDir = path.join(root, "engine/surfaces/meshes");
const tessMesh = path.join(meshDir, "tesseract.mesh.json");
assert.ok(existsSync(tessMesh), "tesseract.mesh.json exported — run npm run export:surfaces");
const meshJson = JSON.parse(readFileSync(tessMesh, "utf-8"));
assert.equal(meshJson.vertexCount, 16);
assert.equal(meshJson.edgeCount, 32);
assert.ok(Array.isArray(meshJson.faces) && meshJson.faces.length === 48, "tesseract 48 solid faces");

const tess = sampleSurface(getSurface("tesseract"));
assert.equal(tess.vertices.length, 16, "tesseract has 16 vertices");
assert.equal(tess.edges.length, 32, "tesseract has 32 edges");

const rotate = cinematicRotation(0.5);
const p = rotate(tess.vertices[0]);
const screen = project4Dto2D(p, 320, 240, 4, 4, 80);
assert.equal(typeof screen.X, "number");
assert.equal(typeof screen.Y, "number");
assert.ok(Number.isFinite(screen.X) && Number.isFinite(screen.Y));

// Camera-plane crossings must clip instead of producing enormous coordinates.
const clipped4d = project4Dto3D({ x: 1, y: 1, z: 1, w: 3.99 }, 4);
assert.equal(clipped4d.visible, false, "4D near-plane point is clipped");
const clipped2d = project4Dto2D({ x: 1, y: 1, z: 4, w: 0 }, 320, 240, 4, 4, 80);
assert.equal(clipped2d.visible, false, "3D near-plane point is clipped");
const clippedEdge = projectEdge4Dto2D({x:0,y:0,z:0,w:0},{x:1,y:0,z:0,w:4.1},320,240,4,4,80);
assert.ok(clippedEdge && clippedEdge.every((p)=>Number.isFinite(p.X)), "crossing edge is geometrically clipped");

// FFmpeg arguments remain separate when directories contain spaces.
const { buildFfmpegArgs } = await importFromPkg("src/pipeline/movie-pipeline.js");
const { buildFfmpegPipeArgs } = await importFromPkg("src/pipeline/movie-pipeline.js");
const ffmpegArgs = buildFfmpegArgs(
  path.join(root, "folder with spaces", "frames"),
  path.join(root, "folder with spaces", "movie.mp4"),
  24,
  "custom-prefix",
);
assert.ok(ffmpegArgs.includes(path.resolve(root, "folder with spaces", "frames", "custom-prefix-%06d.png")));
assert.ok(ffmpegArgs.includes(path.resolve(root, "folder with spaces", "movie.mp4")));
assert.deepEqual(buildFfmpegPipeArgs(path.join(root,"folder with spaces","movie.mp4"),24).slice(0,6), ["-y","-f","image2pipe","-vcodec","png","-framerate"]);

const cliff = sampleSurface(getSurface("clifford-torus"), 8);
assert.ok(cliff.vertices.length > 16, "clifford mesh larger than tesseract");
assert.ok(cliff.faces.length > 0, "clifford has faces");

const scene = createScene({ surface: "tesseract", width: 64, height: 48 });
assert.equal(scene.surface, "tesseract");
assert.equal(scene.scaleMode, "fit");
assert.equal(getRenderProfile("cinematic").renderMode, "solid");

const fitPoints = [{ X: -100, Y: -50, visible: true }, { X: 100, Y: 50, visible: true }];
applyFit(fitPoints, fitTransform(fitPoints, 200, 100, { padding: 0.1, trim: 0 }));
assert.ok(fitPoints.every((p) => p.X >= 0 && p.X <= 200 && p.Y >= 0 && p.Y <= 100));

const normalized = normalizeMesh4D({ vertices: [{x:-10,y:0,z:0,w:0},{x:10,y:0,z:0,w:0}], edges:[[0,1]], faces:[] });
assert.ok(Math.abs(normalized.vertices[1].x - 1.5) < 1e-9, "mesh normalized to target radius");

// Multi-slice lattice indices must be globally offset and remain in range.
const tinyLattice = createLattice({ resX: 3, resY: 3, resZ: 3, resW: 3 });
for (let i=0;i<3;i++) for (let j=0;j<3;j++) for (let k=0;k<3;k++) for (let l=0;l<3;l++) {
  setDensity(tinyLattice, i,j,k,l, i === 1 && j === 1 && k === 1 ? 1 : 0);
}
const tinyMesh = marchingCubes4D(tinyLattice, 0.5);
assert.ok(tinyMesh.faces.flat().every((i) => i >= 0 && i < tinyMesh.vertices.length), "lattice face indices in range");
assert.ok(tinyMesh.edges.flat().every((i) => i >= 0 && i < tinyMesh.vertices.length), "lattice edge indices in range");
const welded = weldMesh({ vertices:[{x:0,y:0,z:0,w:0},{x:0,y:0,z:0,w:0},{x:1,y:0,z:0,w:0}], faces:[[0,1,2]], edges:[[0,2],[1,2]] });
assert.equal(welded.vertices.length, 2, "duplicate lattice vertices welded");

// Soft check: CanvasRenderer constructs against a minimal mock (no node-canvas).
const mockCanvas = {
  width: 64,
  height: 48,
  getContext() {
    return {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      lineCap: "",
      fillRect() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      arc() {},
      fill() {},
    };
  },
};
const renderer = new CanvasRenderer(mockCanvas, { scale: 40 });
renderer.renderFrame(tess, 0.1);
assert.equal(typeof CanvasRenderer, "function");

// Optional: real PNG via node-canvas if present (CLI path).
let pngOk = false;
try {
  const require = createRequire(path.join(pkg, "package.json"));
  require.resolve("canvas");
  const { renderFrameToBuffer } = await importFromPkg(
    "src/pipeline/movie-pipeline.js",
  );
  const buf = renderFrameToBuffer(tess, 0, {
    ...scene,
    width: 64,
    height: 48,
  });
  assert.ok(Buffer.isBuffer(buf) && buf.length > 100, "PNG buffer produced");
  pngOk = true;
} catch (err) {
  const hint =
    "Optional PNG needs native canvas (cd mrs && pnpm run setup; Windows: VS C++ Build Tools). ";
  console.log(`  (optional node-canvas PNG skipped: ${hint}${err.message})`);
}

console.log(
  `4d-renderer smoke ok — surfaces=${listed.length}, tesseract 16/32, clifford res8 verts=${cliff.vertices.length}${pngOk ? ", png=yes" : ", png=skipped"}`,
);
