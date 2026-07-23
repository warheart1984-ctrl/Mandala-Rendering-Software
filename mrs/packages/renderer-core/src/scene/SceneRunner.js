/**
 * Scene Runner — loads scene JSON, runs GPU/CPU render, emits evidence.
 */
import { createCanvas } from "canvas";
import fs from "node:fs";
import path from "node:path";
import { createWebGPURenderer } from "../gpu/WebGPURenderer.js";
import { Camera4D } from "../camera/Camera4D.js";
import { HyperplaneSlicer } from "../render/slicer.js";
import { createScene } from "../pipeline/scene.js";
import { sampleSurface, getSurface } from "../surfaces/index.js";
import { createLattice, fillLattice, marchingCubes4D, latticeStats } from "../lattice/index.js";
import { cinematicRotation } from "../math/mat4.js";
import { project4Dto2D } from "../math/project.js";
import { drawWireframe, drawVertices, drawSolid } from "../render/index.js";
import { createFrameEvidence } from "../camera/Camera4D.js";

/**
 * Load scene from JSON file.
 */
export async function loadScene(scenePath) {
  const text = fs.readFileSync(scenePath, "utf-8");
  return JSON.parse(text);
}

/**
 * Run a scene — dispatches to GPU or CPU renderer based on mode.
 */
export async function runScene(scenePath, options = {}) {
  const scene = await loadScene(scenePath);
  const renderConfig = scene.render;
  const outputDir = options.output ?? renderConfig.output;
  
  fs.mkdirSync(outputDir, { recursive: true });
  
  // Write scene config for reproducibility
  fs.writeFileSync(path.join(outputDir, "scene.json"), JSON.stringify(scene, null, 2));
  
  const evidenceLog = [];
  
  if (renderConfig.mode === "gpu") {
    return await runGPUScene(scene, outputDir, evidenceLog);
  } else if (renderConfig.mode === "slice") {
    return await runSliceScene(scene, outputDir, evidenceLog);
  } else if (renderConfig.mode === "lattice") {
    return await runLatticeScene(scene, outputDir, evidenceLog);
  } else {
    return await runSurfaceScene(scene, outputDir, evidenceLog);
  }
}

/**
 * GPU SDF Raymarching
 */
async function runGPUScene(scene, outputDir, evidenceLog) {
  const { createWebGPURenderer } = await import("../gpu/WebGPURenderer.js");
  const camera = new Camera4D({
    width: renderConfig.width,
    height: renderConfig.height,
    d3: scene.camera.d3,
    d4: scene.camera.d4,
    scale: scene.camera.scale,
    normal: scene.camera.hyperplane.normal,
    d: scene.camera.hyperplane.offset,
    projectionMode: scene.camera.projection
  });
  
  const renderer = await createWebGPURenderer({
    width: renderConfig.width,
    height: renderConfig.height,
    maxSteps: renderConfig.maxSteps,
    epsilon: renderConfig.epsilon,
    maxDistance: renderConfig.maxDistance,
    sdfType: scene.scene.sdf.shape || scene.scene.sdf.type,
    sdfParams: scene.scene.sdf.params,
    camera,
    showNormals: false,
    showDepth: false
  });
  
  const frames = renderConfig.frames;
  const fps = renderConfig.fps;
  const duration = frames / fps;
  
  for (let i = 0; i < frames; i++) {
    const t = (i / frames) * duration * 2 * Math.PI;
    const canvas = createCanvas(renderConfig.width, renderConfig.height);
    const evidence = await renderer.renderFrame(t, canvas);
    evidenceLog.push(evidence);
    
    const frameNum = String(i).padStart(6, "0");
    fs.writeFileSync(path.join(outputDir, `frame-${frameNum}.png`), canvas.toBuffer("image/png"));
    
    if (i % 10 === 0) {
      process.stdout.write(`\r  GPU: ${i + 1}/${frames}`);
    }
  }
  
  process.stdout.write("\n");
  
  // Write evidence
  fs.writeFileSync(path.join(outputDir, "evidence.json"), JSON.stringify(evidenceLog, null, 2));
  
  return { outputDir, frames, evidenceLog };
}

/**
 * CPU Hyperplane Slicing
 */
async function runSliceScene(scene, outputDir, evidenceLog) {
  const surface = getSurface(scene.scene.surface);
  const mesh = sampleSurface(surface, scene.render.resolution ?? 64);
  
  const camera = new Camera4D({
    width: scene.render.width,
    height: scene.render.height,
    d3: scene.camera.d3,
    d4: scene.camera.d4,
    scale: scene.camera.scale,
    normal: scene.camera.hyperplane.normal,
    d: scene.camera.hyperplane.offset,
    projectionMode: scene.camera.projection
  });
  
  const slicer = new HyperplaneSlicer(camera, {
    renderMode: scene.render.mode ?? "both",
    background: scene.scene.background
  });
  
  const frames = scene.render.frames;
  const fps = scene.render.fps;
  const duration = frames / fps;
  
  for (let i = 0; i < frames; i++) {
    const t = (i / frames) * duration * 2 * Math.PI;
    camera.orbit(t, 1.0);
    if (scene.camera.slideSpeed) camera.slide(scene.camera.slideSpeed, t);
    
    // Interpolate hyperplane from path
    if (scene.camera.path) {
      camera.hyperplane.d = interpolatePath(scene.camera.path, i / frames).hyperplaneOffset;
    }
    
    const canvas = createCanvas(scene.render.width, scene.render.height);
    const ctx = canvas.getContext("2d");
    const result = slicer.renderFrame(ctx, mesh);
    
    const frameNum = String(i).padStart(6, "0");
    fs.writeFileSync(path.join(outputDir, `slice-${frameNum}.png`), canvas.toBuffer("image/png"));
    
    evidenceLog.push(result.evidence);
    
    if (i % 10 === 0) {
      process.stdout.write(`\r  Slice: ${i + 1}/${frames}`);
    }
  }
  
  process.stdout.write("\n");
  fs.writeFileSync(path.join(outputDir, "evidence.json"), JSON.stringify(evidenceLog, null, 2));
  
  return { outputDir, frames, evidenceLog };
}

/**
 * CPU Lattice Marching Cubes
 */
async function runLatticeScene(scene, outputDir, evidenceLog) {
  const res = scene.render.resolution ?? 24;
  const scale = scene.render.scale ?? 4;
  
  const lattice = createLattice({ resX: res, resY: res, resZ: res, resW: res, scaleX: scale, scaleY: scale, scaleZ: scale, scaleW: scale });
  
  // Build SDF from scene
  const densityFn = buildDensityFunction(scene.scene.sdf);
  fillLattice(lattice, densityFn);
  
  const stats = latticeStats(lattice);
  console.log(`Lattice stats: min=${stats.min.toFixed(3)} max=${stats.max.toFixed(3)} fill=${(stats.fillRatio*100).toFixed(1)}%`);
  
  const mesh = marchingCubes4D(lattice, scene.render.isolevel ?? 0.3);
  console.log(`Mesh: ${mesh.vertices.length} verts, ${mesh.faces.length} faces, ${mesh.edges.length} edges`);
  
  if (mesh.vertices.length === 0) {
    throw new Error("No geometry extracted — adjust isolevel or SDF");
  }
  
  const frames = scene.render.frames;
  const fps = scene.render.fps;
  const duration = frames / fps;
  
  for (let i = 0; i < frames; i++) {
    const t = (i / frames) * duration * 2 * Math.PI;
    const rotate = cinematicRotation(t, { xw: 0.7, yz: 1.1, zw: 1.5, yw: 2.0 });
    
    const canvas = createCanvas(scene.render.width, scene.render.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = scene.scene.background;
    ctx.fillRect(0, 0, scene.render.width, scene.render.height);
    
    const projected = mesh.vertices.map(v => {
      const rotated = rotate(v);
      return project4Dto2D(rotated, scene.render.width, scene.render.height, 4.0, scene.camera.d3 ?? 4.0, scene.camera.scale ?? 80);
    });
    const rotated4d = mesh.vertices.map(v => rotate(v));
    
    if (scene.render.mode === "solid" || scene.render.mode === "both") {
      drawSolid(ctx, projected, mesh.faces, rotated4d, { strokeEdges: scene.render.mode === "both" });
    }
    drawWireframe(ctx, projected, mesh.edges, { lineWidth: 0.8 });
    drawVertices(ctx, projected);
    
    const frameNum = String(i).padStart(6, "0");
    fs.writeFileSync(path.join(outputDir, `lattice-${frameNum}.png`), canvas.toBuffer("image/png"));
    
    // Record evidence
    const camera = new Camera4D({
      width: scene.render.width,
      height: scene.render.height,
      d3: scene.camera.d3,
      d4: scene.camera.d4,
      scale: scene.camera.scale,
      normal: scene.camera.hyperplane.normal,
      d: scene.camera.hyperplane.offset
    });
    camera.orbit(t, 1.0);
    const evidence = createFrameEvidence(camera, i);
    evidence.pipeline = "LATTICE_MARCHING_CUBES";
    evidence.mesh = { vertices: mesh.vertices.length, faces: mesh.faces.length, edges: mesh.edges.length };
    evidenceLog.push(evidence);
    
    if (i % 10 === 0) {
      process.stdout.write(`\r  Lattice: ${i + 1}/${frames}`);
    }
  }
  
  process.stdout.write("\n");
  fs.writeFileSync(path.join(outputDir, "evidence.json"), JSON.stringify(evidenceLog, null, 2));
  
  return { outputDir, frames, evidenceLog };
}

/**
 * CPU Parametric Surface
 */
async function runSurfaceScene(scene, outputDir, evidenceLog) {
  const surface = getSurface(scene.scene.surface);
  const mesh = sampleSurface(surface, scene.render.resolution ?? 64);
  
  const frames = scene.render.frames;
  const fps = scene.render.fps;
  const duration = frames / fps;
  
  for (let i = 0; i < frames; i++) {
    const t = (i / frames) * duration * 2 * Math.PI;
    const rotate = cinematicRotation(t, { xw: 0.7, yz: 1.1, zw: 1.5, yw: 2.0 });
    
    const canvas = createCanvas(scene.render.width, scene.render.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = scene.scene.background;
    ctx.fillRect(0, 0, scene.render.width, scene.render.height);
    
    const projected = mesh.vertices.map(v => {
      const rotated = rotate(v);
      return project4Dto2D(rotated, scene.render.width, scene.render.height, 4.0, scene.camera.d3 ?? 4.0, scene.camera.scale ?? 80);
    });
    const rotated4d = mesh.vertices.map(v => rotate(v));
    
    if (scene.render.mode === "solid" || scene.render.mode === "both") {
      drawSolid(ctx, projected, mesh.faces, rotated4d, { strokeEdges: scene.render.mode === "both" });
    }
    drawWireframe(ctx, projected, mesh.edges, { lineWidth: 0.8 });
    drawVertices(ctx, projected);
    
    const frameNum = String(i).padStart(6, "0");
    fs.writeFileSync(path.join(outputDir, `frame-${frameNum}.png`), canvas.toBuffer("image/png"));
    
    if (i % 10 === 0) {
      process.stdout.write(`\r  Render: ${i + 1}/${frames}`);
    }
  }
  
  process.stdout.write("\n");
  return { outputDir, frames, evidenceLog };
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

import { getSurface as getSurfaceImpl } from "../surfaces/index.js";

function buildDensityFunction(sdf) {
  if (sdf.type === "primitive") {
    return getPrimitiveSDF(sdf.shape, sdf.params);
  } else if (sdf.type === "boolean") {
    const children = sdf.children.map(buildDensityFunction);
    return getBooleanSDF(sdf.op, sdf.k, ...children);
  }
  throw new Error(`Unknown SDF type: ${sdf.type}`);
}

function getPrimitiveSDF(shape, params) {
  const fns = {
    hypersphere: (x,y,z,w) => Math.sqrt(x*x + y*y + z*z + w*w) - (params.radius ?? 1),
    hypertorus: (x,y,z,w) => {
      const R = params.R ?? 1.5;
      const r = params.r ?? 0.5;
      const d1 = Math.sqrt(x*x + y*y) - R;
      const d2 = Math.sqrt(z*z + w*w) - r;
      return Math.sqrt(d1*d1 + d2*d2);
    },
    gyroid: (x,y,z,w) => {
      const s = params.scale ?? 1.5;
      const gx = Math.cos(x*s)*Math.sin(y*s) + Math.cos(y*s)*Math.sin(z*s) + Math.cos(z*s)*Math.sin(w*s);
      const gy = Math.cos(y*s)*Math.sin(z*s) + Math.cos(z*s)*Math.sin(w*s) + Math.cos(w*s)*Math.sin(x*s);
      const gz = Math.cos(z*s)*Math.sin(w*s) + Math.cos(w*s)*Math.sin(x*s) + Math.cos(x*s)*Math.sin(y*s);
      const gw = Math.cos(w*s)*Math.sin(x*s) + Math.cos(x*s)*Math.sin(y*s) + Math.cos(y*s)*Math.sin(z*s);
      return 0.3 - Math.sqrt(gx*gx + gy*gy + gz*gz + gw*gw) * 0.5;
    },
    torus3d: (x,y,z,w) => {
      const R = params.R ?? 1.5;
      const r = params.r ?? 0.5;
      const d1 = Math.sqrt(x*x + y*y) - R;
      const d2 = Math.sqrt(d1*d1 + z*z) - r;
      return d2 + 0.3 * Math.sin(w * 6.28318);
    },
    fbm: (x,y,z,w) => fbm4(x * (params.scale??1), y * (params.scale??1), z * (params.scale??1), w * (params.scale??1)) * (params.amplitude??1),
    ridged: (x,y,z,w) => ridged4(x * (params.scale??1), y * (params.scale??1), z * (params.scale??1), w * (params.scale??1)) * (params.amplitude??1),
    tesseract: (x,y,z,w) => {
      const s = params.size ?? 1;
      const q = [Math.abs(x)-s, Math.abs(y)-s, Math.abs(z)-s, Math.abs(w)-s];
      return Math.max(...q);
    }
  };
  return fns[shape] ?? ((x,y,z,w) => 1);
}

function getBooleanSDF(op, k, ...children) {
  switch (op) {
    case "union": return (...args) => Math.min(...children.map(c => c(...args)));
    case "intersection": return (...args) => Math.max(...children.map(c => c(...args)));
    case "subtraction": return (...args) => Math.max(children[0](...args), -children[1](...args));
    case "smoothUnion": return (...args) => {
      const a = children[0](...args), b = children[1](...args);
      const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k));
      return h * a + (1 - h) * b - k * h * (1 - h);
    };
    case "smoothSubtraction": return (...args) => {
      const a = children[0](...args), b = children[1](...args);
      const h = Math.max(0, Math.min(1, 0.5 - 0.5 * (b + a) / k));
      return h * b + (1 - h) * (-a) + k * h * (1 - h);
    };
    default: throw new Error(`Unknown boolean op: ${op}`);
  }
}

// Simple 4D fbm/ridged (CPU fallback)
function fbm4(x,y,z,w) {
  let val = 0, amp = 1, freq = 1;
  for (let i = 0; i < 5; i++) {
    val += amp * noise4(x*freq, y*freq, z*freq, w*freq);
    freq *= 2; amp *= 0.5;
  }
  return val;
}

function ridged4(x,y,z,w) {
  let val = 0, amp = 1, freq = 1;
  for (let i = 0; i < 4; i++) {
    const n = Math.abs(noise4(x*freq, y*freq, z*freq, w*freq));
    val += amp * (1 - n) * (1 - n);
    freq *= 2; amp *= 0.5;
  }
  return val;
}

// Simple 4D hash noise
function noise4(x,y,z,w) {
  const i = Math.floor(x)*2654435761 ^ Math.floor(y)*1664525 ^ Math.floor(z)*1013904223 ^ Math.floor(w)*114007148195521;
  const f = i * 0.00000000023283064365386963;
  return f * 2 - 1;
}

function interpolatePath(path, t) {
  if (t <= path[0].t) return path[0];
  if (t >= path[path.length-1].t) return path[path.length-1];
  for (let i = 0; i < path.length-1; i++) {
    if (t >= path[i].t && t <= path[i+1].t) {
      const localT = (t - path[i].t) / (path[i+1].t - path[i].t);
      return lerpPath(path[i], path[i+1], localT);
    }
  }
  return path[path.length-1];
}

function lerpPath(a, b, t) {
  return {
    hyperplaneOffset: lerp(a.hyperplaneOffset, b.hyperplaneOffset, t),
    hyperplaneNormal: slerp4(a.hyperplaneNormal, b.hyperplaneNormal, t),
    position: lerp4(a.position, b.position, t),
    rotation: lerpRotation(a.rotation, b.rotation, t)
  };
}

function lerp(a,b,t) { return a + (b-a)*t; }

function lerp4(a,b,t) {
  return { x: lerp(a.x,b.x,t), y: lerp(a.y,b.y,t), z: lerp(a.z,b.z,t), w: lerp(a.w,b.w,t) };
}

function slerp4(a,b,t) {
  let dot = a.x*b.x + a.y*b.y + a.z*b.z + a.w*b.w;
  if (dot < 0) { dot = -dot; b = {x:-b.x,y:-b.y,z:-b.z,w:-b.w}; }
  dot = Math.max(-1,Math.min(1,dot));
  const theta = Math.acos(dot)*t;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(Math.acos(dot));
  if (sinTheta0 < 1e-6) return a;
  const s0 = Math.sin(Math.acos(dot)-theta)/sinTheta0;
  const s1 = sinTheta/sinTheta0;
  return { x:s0*a.x+s1*b.x, y:s0*a.y+s1*b.y, z:s0*a.z+s1*b.z, w:s0*a.w+s1*b.w };
}

function lerpRotation(a,b,t) {
  const planes = ["xy","xz","xw","yz","yw","zw"];
  const r = {};
  for (const p of planes) r[p] = lerp(a[p]??0, b[p]??0, t);
  return r;
}

export { runScene, loadScene };