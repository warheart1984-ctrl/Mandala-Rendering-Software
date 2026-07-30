#!/usr/bin/env node
/**
 * render-glb.mjs — SceneSpecification → GLB export for Blender/Cycles photoreal.
 *
 * Exports the governed geometry from SceneSpecification to a binary GLB file.
 * The GLB can be loaded in Blender and rendered with Cycles for photorealism.
 *
 * Usage:
 *   node scripts/render-glb.mjs --spec ./examples/scene-spec-tesseract.json \
 *        --output /tmp/scene.glb [--provenance /tmp/prov.json]
 *
 * HONEST SCOPE (Drive-G-1):
 *   This exports the EXACT governed geometry (Scene4D primitives, lights, camera)
 *   that the RT4D path tracer would render. No diffusion, no AI enhancement.
 *   Same specHash + seed → byte-identical GLB.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import process from "node:process";

import {
  parseSceneSpecification,
  validateSceneCapabilities,
  convertSceneSpecification,
  sampleFrame,
} from "../src/scene-spec/index.js";

import { Scene4D } from "../src/render/rt4d/scene/Scene4D.js";
import { Camera4D } from "../src/render/rt4d/camera/Camera4D.js";
import { Hypersphere, Hyperplane } from "../src/render/rt4d/geometry/hypersurface.js";
import { vec4 } from "../src/render/rt4d/math/vec4.js";
import { exportSceneToGLB } from "../src/render/rt4d/export/glbExporter.js";

export const RENDER_GLB_VERSION = "1.0.0";

function defaultCameraFromSeed(seed, width, height) {
  const rng = mulberry32(seed ^ 0x2545f491);
  const theta = rng() * Math.PI * 2;
  const radius = 4.3;
  const elevation = 1.15 + rng() * 0.5;
  const camW = (rng() - 0.5) * 1.2;
  return {
    position4d: [Math.cos(theta) * radius, elevation, Math.sin(theta) * radius, camW],
    target4d: [0, 0.1, 0, 0],
    fovX: 52, fovY: 52, fovZ: 45, fovW: 28,
    width, height,
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resolveSurfaceMaterial(prim) {
  const mid = prim.materialId || "surf";
  const [ar, ag, ab] = prim.albedo;
  const mtype = prim.materialType === "ggx" ? "ggx" : "lambertian";
  const params = { albedo: vec4(ar, ag, ab, 1) };
  if (mtype === "ggx") {
    params.roughness = typeof prim.roughness === "number" && Number.isFinite(prim.roughness)
      ? Math.max(0.01, prim.roughness) : 0.2;
    const f0s = typeof prim.f0 === "number" && Number.isFinite(prim.f0) ? prim.f0 : 0.04;
    params.f0 = vec4(f0s, f0s, f0s, 1);
  }
  return { mid, mtype, params };
}

export function renderGLBFromSpec(spec, frameSel = {}) {
  const structural = parseSceneSpecification(spec);
  if (!structural.ok) {
    const err = new Error(
      "invalid SceneSpecification: " +
        structural.errors.map((e) => `${e.path || "(root)"}: ${e.message}`).join("; "),
    );
    err.errors = structural.errors;
    err.code = "SPEC_INVALID";
    throw err;
  }

  const sampled = sampleFrame(structural.value, frameSel);
  const caps = validateSceneCapabilities(sampled.spec, { target: "rt4d" });
  if (!caps.ok) {
    const err = new Error(
      "SceneSpecification capability check failed: " +
        caps.errors.map((e) => `${e.path}: ${e.message}`).join("; "),
    );
    err.errors = caps.errors;
    err.code = "SPEC_UNSUPPORTED";
    throw err;
  }

  const { rt4d, specHash, seed, worldDocument } = convertSceneSpecification(sampled.spec);
  const { width, height } = rt4d.output;

  const scene = new Scene4D();
  const matIds = new Set();

  for (const prim of rt4d.primitives) {
    const { mid, mtype, params } = resolveSurfaceMaterial(prim);
    if (!matIds.has(mid)) {
      scene.materials.createMaterial(mid, mtype, params);
      matIds.add(mid);
    }
    scene.addPrimitive(
      new Hypersphere(
        vec4(prim.center[0], prim.center[1], prim.center[2], prim.center[3]),
        prim.radius,
      ),
      mid,
    );
  }

  for (const pl of rt4d.planes) {
    const { mid, mtype, params } = resolveSurfaceMaterial(pl);
    if (!matIds.has(mid)) {
      scene.materials.createMaterial(mid, mtype, params);
      matIds.add(mid);
    }
    scene.addPrimitive(
      new Hyperplane(
        vec4(pl.normal[0], pl.normal[1], pl.normal[2], pl.normal[3]),
        pl.offset,
      ),
      mid,
    );
  }

  for (const L of rt4d.lights) {
    const mid = `light:${L.id}`;
    const em = L.emission;
    scene.materials.createMaterial(mid, "light", {
      emission: vec4(em[0], em[1], em[2], 0),
      albedo: vec4(1, 1, 1, 1),
    });
    scene.addLight(
      new Hypersphere(
        vec4(L.center[0], L.center[1], L.center[2], L.center[3]),
        L.radius,
      ),
      mid,
    );
  }

  scene.build();

  const camDesc = rt4d.camera ?? defaultCameraFromSeed(seed, width, height);
  const camera = new Camera4D({
    x: camDesc.position4d[0], y: camDesc.position4d[1],
    z: camDesc.position4d[2], w: camDesc.position4d[3],
    lx: camDesc.target4d[0], ly: camDesc.target4d[1],
    lz: camDesc.target4d[2], lw: camDesc.target4d[3],
    fovX: camDesc.fovX ?? 52, fovY: camDesc.fovY ?? 52,
    fovZ: camDesc.fovZ ?? 45, fovW: camDesc.fovW ?? 28,
    width, height,
  });

  const glb = exportSceneToGLB(scene, camera);

  const provenance = {
    version: RENDER_GLB_VERSION,
    specHash,
    seed,
    timestamp: new Date().toISOString(),
    width,
    height,
    primitiveCount: rt4d.primitives.length,
    planeCount: rt4d.planes.length,
    lightCount: rt4d.lights.length,
    materialCount: matIds.size,
    worldDocument: worldDocument ? { id: worldDocument.id, version: worldDocument.version } : null,
  };

  return { glb, provenance };
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
  };

  const specPath = getArg("--spec");
  const outputPath = getArg("--output") || "/tmp/scene.glb";
  const provenancePath = getArg("--provenance");
  const frame = getArg("--frame");
  const time = getArg("--time");

  if (!specPath) {
    console.error("Usage: node render-glb.mjs --spec <path.json> --output <path.glb> [--provenance <path.json>] [--frame N] [--time T]");
    process.exit(1);
  }

  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const frameSel = {};
  if (frame) frameSel.frame = parseInt(frame, 10);
  if (time) frameSel.time = parseFloat(time);

  console.log(`[GLB Export] spec: ${specPath}`);
  console.log(`[GLB Export] output: ${outputPath}`);

  const { glb, provenance } = renderGLBFromSpec(spec, frameSel);

  writeFileSync(outputPath, Buffer.from(glb));
  console.log(`[GLB Export] wrote ${glb.length} bytes`);

  if (provenancePath) {
    writeFileSync(provenancePath, JSON.stringify(provenance, null, 2));
    console.log(`[GLB Export] provenance: ${provenancePath}`);
  }

  // Print provenance as JSON line for pipeline consumers
  console.log(JSON.stringify(provenance));
}

main().catch((err) => {
  console.error("[GLB Export] ERROR:", err.message);
  process.exit(1);
});