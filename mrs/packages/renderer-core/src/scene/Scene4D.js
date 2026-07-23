/**
 * Scene4D — Declarative scene loader (SDF tree, camera path, lighting).
 * Loads Scene4D JSON, validates against schema, compiles to renderable form.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, "../../schemas/Scene4D.schema.json");

/**
 * Compile Scene4D JSON to a renderable scene object.
 * @param {object} json - Parsed Scene4D JSON
 * @returns {object} { sdfTree, cameraPath, renderConfig, lighting }
 */
export function compileScene(json) {
  validateScene(json);
  return {
    sdfTree: compileSDF(json.scene.sdf),
    cameraPath: compileCameraPath(json.camera),
    renderConfig: compileRenderConfig(json.render),
    lighting: compileLighting(json.lighting),
    background: json.scene.background ?? "#0e1216"
  };
}

/**
 * Load Scene4D from file and compile.
 * @param {string} filePath
 * @returns {object} compiled scene
 */
export async function loadScene(filePath) {
  const abs = path.resolve(filePath);
  const text = await fs.promises.readFile(abs, "utf-8");
  const json = JSON.parse(text);
  return compileScene(json);
}

/**
 * Validate scene against schema (basic structural checks).
 */
function validateScene(json) {
  if (!json.version || json.version !== "1.0") {
    throw new Error("Scene version must be '1.0'");
  }
  if (!json.scene?.sdf) throw new Error("scene.sdf is required");
  if (!json.camera?.hyperplane) throw new Error("camera.hyperplane is required");
  if (!json.camera?.path?.length) throw new Error("camera.path must have at least 1 keyframe");
  if (!json.render) throw new Error("render config is required");
}

/**
 * Compile SDF tree to executable node structure.
 */
function compileSDF(node) {
  if (!node) throw new Error("SDF node is null");
  
  switch (node.type) {
    case "primitive":
      return { type: "primitive", shape: node.shape, params: node.params ?? {}, transform: compileTransform(node.transform) };
    case "boolean":
      if (!node.children || node.children.length < 2) {
        throw new Error("Boolean SDF requires at least 2 children");
      }
      return {
        type: "boolean",
        op: node.op,
        k: node.k ?? 0.3,
        children: node.children.map(compileSDF)
      };
    case "transform":
      return { type: "transform", child: compileSDF(node.child), transform: compileTransform(node.transform) };
    case "repeat":
      return { type: "repeat", child: compileSDF(node.child), repeat: node.repeat, limit: node.limit };
    default:
      throw new Error(`Unknown SDF node type: ${node.type}`);
  }
}

/**
 * Compile 4D transform object to standard form.
 */
function compileTransform(t) {
  if (!t) return { translate: { x: 0, y: 0, z: 0, w: 0 }, rotate: {}, scale: { x: 1, y: 1, z: 1, w: 1 } };
  return {
    translate: t.translate ?? { x: 0, y: 0, z: 0, w: 0 },
    rotate: t.rotate ?? {},
    scale: t.scale ?? { x: 1, y: 1, z: 1, w: 1 }
  };
}

/**
 * Compile camera path to array of keyframes with interpolatable values.
 */
function compileCameraPath(camera) {
  const path = camera.path.map(kf => ({
    t: kf.t,
    hyperplaneOffset: kf.hyperplaneOffset ?? camera.hyperplane.offset,
    hyperplaneNormal: normalize4(kf.hyperplaneNormal ?? camera.hyperplane.normal),
    rotation: kf.rotation ?? {},
    position: kf.position ?? { x: 0, y: 0, z: 0, w: 0 },
    easing: kf.easing ?? "smoothstep"
  }));
  
  // Sort by t
  path.sort((a, b) => a.t - b.t);
  
  // Ensure first at 0, last at 1
  if (path[0].t !== 0) path.unshift({ ...path[0], t: 0 });
  if (path[path.length - 1].t !== 1) path.push({ ...path[path.length - 1], t: 1 });
  
  return path;
}

/**
 * Compile render config with defaults.
 */
function compileRenderConfig(render) {
  if (!render) return getDefaultRenderConfig();
  return {
    width: render.width ?? 1920,
    height: render.height ?? 1080,
    frames: render.frames ?? 120,
    fps: render.fps ?? 30,
    maxSteps: render.maxSteps ?? 128,
    epsilon: render.epsilon ?? 0.001,
    maxDistance: render.maxDistance ?? 100,
    mode: render.mode ?? "gpu",
    output: render.output ?? "output"
  };
}

function getDefaultRenderConfig() {
  return { width: 1920, height: 1080, frames: 120, fps: 30, maxSteps: 128, epsilon: 0.001, maxDistance: 100, mode: "gpu", output: "output" };
}

/**
 * Compile lighting config.
 */
function compileLighting(lighting) {
  if (!lighting || !lighting.enabled) return { enabled: false };
  return {
    enabled: true,
    ambient: lighting.ambient ?? { r: 0.1, g: 0.1, b: 0.1 },
    lights: (lighting.lights ?? []).map(l => ({
      type: l.type,
      position: l.position ?? { x: 0, y: 0, z: 0, w: 0 },
      direction: normalize4(l.direction ?? { x: 0, y: 0, z: -1, w: 0 }),
      color: l.color ?? { r: 1, g: 1, b: 1 },
      intensity: l.intensity ?? 1
    }))
  };
}

/**
 * Normalize 4D vector.
 */
function normalize4(v) {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z + v.w * v.w);
  if (len === 0) return { x: 0, y: 0, z: 0, w: 1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len, w: v.w / len };
}

/**
 * Interpolate camera state at time t ∈ [0,1].
 */
export function interpolateCamera(path, t) {
  if (t <= path[0].t) return path[0];
  if (t >= path[path.length - 1].t) return path[path.length - 1];
  
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (t >= a.t && t <= b.t) {
      const rawT = (t - a.t) / Math.max(Number.EPSILON, b.t - a.t);
      const localT = applyEasing(rawT, b.easing ?? a.easing);
      return lerpCamera(a, b, localT);
    }
  }
  return path[path.length - 1];
}

function lerpCamera(a, b, t) {
  return {
    hyperplaneOffset: lerp(a.hyperplaneOffset, b.hyperplaneOffset, t),
    hyperplaneNormal: slerp4(a.hyperplaneNormal, b.hyperplaneNormal, t),
    rotation: lerpRotation(a.rotation, b.rotation, t),
    position: lerp4(a.position, b.position, t)
  };
}

function lerp(a, b, t) { return a + (b - a) * t; }

function applyEasing(t, easing) {
  const x=Math.max(0,Math.min(1,t));
  if(easing==="linear")return x;
  if(easing==="ease-in")return x*x;
  if(easing==="ease-out")return 1-(1-x)*(1-x);
  if(easing==="smootherstep")return x*x*x*(x*(x*6-15)+10);
  return x*x*(3-2*x);
}

function lerp4(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), w: lerp(a.w, b.w, t) };
}

function slerp4(a, b, t) {
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  if (dot < 0) { dot = -dot; b = { x: -b.x, y: -b.y, z: -b.z, w: -b.w }; }
  dot = Math.max(-1, Math.min(1, dot));
  const theta = Math.acos(dot) * t;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(Math.acos(dot));
  if (sinTheta0 < 1e-6) return a;
  const s0 = Math.sin(Math.acos(dot) - theta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;
  return { x: s0 * a.x + s1 * b.x, y: s0 * a.y + s1 * b.y, z: s0 * a.z + s1 * b.z, w: s0 * a.w + s1 * b.w };
}

function lerpRotation(a, b, t) {
  const planes = ["xy", "xz", "xw", "yz", "yw", "zw"];
  const result = {};
  for (const p of planes) {
    const av = a[p] ?? 0;
    const bv = b[p] ?? 0;
    const delta = Math.atan2(Math.sin(bv-av), Math.cos(bv-av));
    result[p] = av + delta * t;
  }
  return result;
}

/**
 * SDF Builder — fluent API for composing SDF trees programmatically.
 */
export class SDFBuilder {
  constructor() { this.root = null; }
  
  static primitive(shape, params = {}, transform = {}) {
    const b = new SDFBuilder();
    b.root = { type: "primitive", shape, params, transform };
    return b;
  }
  
  static boolean(op, k, ...children) {
    const b = new SDFBuilder();
    b.root = { type: "boolean", op, k: k ?? 0.3, children: children.map(c => c.root ?? c) };
    return b;
  }
  
  static union(k, ...children) { return SDFBuilder.boolean("union", k, ...children); }
  static intersection(k, ...children) { return SDFBuilder.boolean("intersection", k, ...children); }
  static subtraction(k, ...children) { return SDFBuilder.boolean("subtraction", k, ...children); }
  static smoothUnion(k, ...children) { return SDFBuilder.boolean("smoothUnion", k, ...children); }
  static smoothSubtraction(k, ...children) { return SDFBuilder.boolean("smoothSubtraction", k, ...children); }
  
  static transform(child, transform) {
    const b = new SDFBuilder();
    b.root = { type: "transform", child: child.root ?? child, transform };
    return b;
  }
  
  static repeat(child, repeat, limit) {
    const b = new SDFBuilder();
    b.root = { type: "repeat", child: child.root ?? child, repeat, limit };
    return b;
  }
  
  // Convenience primitives
  static hypersphere(radius = 1, transform = {}) {
    return SDFBuilder.primitive("hypersphere", { radius }, transform);
  }
  
  static hypertorus(R = 1.5, r = 0.5, transform = {}) {
    return SDFBuilder.primitive("hypertorus", { R, r }, transform);
  }
  
  static gyroid(scale = 1.5, transform = {}) {
    return SDFBuilder.primitive("gyroid", { scale }, transform);
  }
  
  static torus3d(R = 1.5, r = 0.5, transform = {}) {
    return SDFBuilder.primitive("torus3d", { R, r }, transform);
  }
  
  static fbm(scale = 1, amplitude = 1, transform = {}) {
    return SDFBuilder.primitive("fbm", { scale, amplitude }, transform);
  }
  
  static ridged(scale = 1, amplitude = 1, transform = {}) {
    return SDFBuilder.primitive("ridged", { scale, amplitude }, transform);
  }
  
  static tesseract(size = 1, transform = {}) {
    return SDFBuilder.primitive("tesseract", { size }, transform);
  }
  
  build() { return this.root; }
}
