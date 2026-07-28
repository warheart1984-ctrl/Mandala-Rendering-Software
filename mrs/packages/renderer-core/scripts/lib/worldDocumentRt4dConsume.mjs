/**
 * Live PathTracer4D consume of WorldDocumentRt4d primitives (capsules + spheres).
 *
 * Drive-G-1: descriptors from engine3d-core `worldDocumentToRt4dPrimitives`;
 * this module builds Scene4D and path-traces. Not soft-raster; not diffusion.
 *
 * Status: **enforced** by unit + Genblaze path_trace tests.
 */

import { createHash } from "node:crypto";
import { Scene4D } from "../../src/render/rt4d/scene/Scene4D.js";
import { Camera4D } from "../../src/render/rt4d/camera/Camera4D.js";
import { PathTracer4D } from "../../src/render/rt4d/integrator/PathTracer4D.js";
import {
  Hypersphere,
  OrientedCapsule,
} from "../../src/render/rt4d/geometry/hypersurface.js";
import { vec4 } from "../../src/render/rt4d/math/vec4.js";
import { TextureRegistry } from "../../src/render/rt4d/material/TextureRegistry.js";
import { encodePNG } from "../render-still.mjs";

export const WORLDDOCUMENT_RT4D_VERSION = "1.0.0";
const GLASS_BEAM_MIN_SAMPLES = 12;

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

function toByte(c, exposure) {
  let v = c * exposure;
  v = v / (1 + v);
  v = Math.pow(Math.max(0, v), 1 / 2.2);
  return Math.min(255, Math.max(0, Math.round(v * 255)));
}

function backgroundColor(dir) {
  const t = Math.min(1, Math.max(0, 0.5 * (dir.y + 1)));
  const horizon = [0.62, 0.66, 0.72];
  const zenith = [0.12, 0.14, 0.22];
  return vec4(
    horizon[0] + (zenith[0] - horizon[0]) * t,
    horizon[1] + (zenith[1] - horizon[1]) * t,
    horizon[2] + (zenith[2] - horizon[2]) * t,
    0,
  );
}

function materialIdForPrimitive(prim, samples) {
  const role = prim.materialRole ?? "";
  if (role === "core_glow" || role === "core") return "core_glow";
  if (role === "chrome_joint" || role === "node" || role === "joint") {
    return "chrome_joint";
  }
  if (
    role === "glass_tube" ||
    role === "beam" ||
    role === "edge" ||
    prim.kind === "oriented-capsule"
  ) {
    return samples >= GLASS_BEAM_MIN_SAMPLES ? "glass_tube" : "glass_tube_draft";
  }
  return prim.materialId || "surf";
}

function ensureLatticeMaterials(scene) {
  if (!scene.materials.has("surf")) {
    scene.materials.createMaterial("surf", "lambertian", {
      albedo: vec4(0.55, 0.62, 0.72, 1),
    });
  }
  if (!scene.materials.has("glass_tube")) {
    scene.materials.createMaterial("glass_tube", "dielectric", {
      albedo: vec4(0.15, 0.45, 1.0, 1),
      ior: 1.52,
      roughness: 0.03,
      emission: vec4(0.45, 0.95, 1.4, 0),
    });
  }
  if (!scene.materials.has("glass_tube_draft")) {
    scene.materials.createMaterial("glass_tube_draft", "light", {
      emission: vec4(0.55, 1.05, 1.55, 0),
      albedo: vec4(0.15, 0.45, 1.0, 1),
    });
  }
  if (!scene.materials.has("chrome_joint")) {
    scene.materials.createMaterial("chrome_joint", "ggx", {
      albedo: vec4(0.05, 0.05, 0.05, 1),
      roughness: 0.08,
      f0: vec4(0.92, 0.92, 0.95, 1),
    });
  }
  if (!scene.materials.has("core_glow")) {
    scene.materials.createMaterial("core_glow", "light", {
      emission: vec4(15, 15, 15, 0),
      albedo: vec4(1, 1, 1, 1),
    });
  }
}

/**
 * Register materials from WorldRt4dPrimitive.rt4dMaterial when not lattice-role.
 * @param {Scene4D} scene
 * @param {object} entry
 */
function registerRt4dMaterialEntry(scene, entry) {
  if (!entry?.id || scene.materials.has(entry.id)) return;
  const p = entry.params ?? {};
  const [r, g, b] = p.baseColor ?? [0.7, 0.7, 0.75];
  const [er, eg, eb] = p.emissive ?? [0, 0, 0];
  const brdf = p.brdf ?? "lambertian";
  const textureRefs = p.textureRefs ?? [];
  if (brdf === "dielectric" || entry.kind === "glass") {
    scene.materials.createMaterial(entry.id, "dielectric", {
      albedo: vec4(r, g, b, 1),
      ior: 1.52,
      roughness: p.roughness ?? 0.05,
      emission: vec4(er, eg, eb, 0),
      textureRefs,
    });
  } else if (brdf === "ggx" || entry.kind === "metal") {
    scene.materials.createMaterial(entry.id, "ggx", {
      albedo: vec4(r, g, b, 1),
      roughness: p.roughness ?? 0.2,
      f0: vec4(0.9, 0.9, 0.92, 1),
      textureRefs,
    });
  } else if (brdf === "emissive" || entry.kind === "emissive") {
    scene.materials.createMaterial(entry.id, "light", {
      emission: vec4(Math.max(er, 1), Math.max(eg, 1), Math.max(eb, 1), 0),
      albedo: vec4(r, g, b, 1),
      textureRefs,
    });
  } else {
    scene.materials.createMaterial(entry.id, "lambertian", {
      albedo: vec4(r, g, b, 1),
      roughness: p.roughness ?? 0.7,
      textureRefs,
    });
  }
}

/**
 * @param {readonly object[]} primitives — WorldRt4dPrimitive[]
 * @param {{
 *   width?: number,
 *   height?: number,
 *   samples?: number,
 *   maxDepth?: number,
 *   exposure?: number,
 *   seed?: number,
 *   camera?: { eye?: number[], lookAt?: number[], fovY?: number },
 *   textures?: object[],
 *   worldId?: string,
 * }} [opts]
 */
export function renderWorldRt4dPrimitives(primitives, opts = {}) {
  const width = Math.max(16, Math.min(1024, opts.width ?? 128));
  const height = Math.max(16, Math.min(1024, opts.height ?? 96));
  const samples = Math.max(1, Math.min(512, opts.samples ?? 4));
  const maxDepth = Math.max(1, Math.min(12, opts.maxDepth ?? 4));
  const exposure = opts.exposure ?? 2.2;
  const seed = (opts.seed ?? 0x4d5253) >>> 0;
  const prims = Array.isArray(primitives) ? primitives : [];

  const scene = new Scene4D();
  if (opts.textures?.length) {
    scene.textures = new TextureRegistry(opts.textures);
  }
  ensureLatticeMaterials(scene);
  const matIds = new Set(scene.materials.listIds());

  for (const prim of prims) {
    if (prim.rt4dMaterial) registerRt4dMaterialEntry(scene, prim.rt4dMaterial);
    const mid = materialIdForPrimitive(prim, samples);
    if (!matIds.has(mid) && prim.rt4dMaterial) {
      // Prefer lattice role ids; fall back to material id from entry.
      const fallback = prim.materialId || prim.rt4dMaterial.id;
      if (!matIds.has(fallback) && prim.rt4dMaterial) {
        registerRt4dMaterialEntry(scene, { ...prim.rt4dMaterial, id: fallback });
        matIds.add(fallback);
      }
    }
    if (!matIds.has(mid)) {
      const entry = prim.rt4dMaterial;
      if (entry) {
        registerRt4dMaterialEntry(scene, { ...entry, id: mid });
      } else {
        scene.materials.createMaterial(mid, "lambertian", {
          albedo: vec4(0.55, 0.62, 0.72, 1),
        });
      }
      matIds.add(mid);
    }

    if (prim.kind === "oriented-capsule") {
      const geom = new OrientedCapsule(
        { x: prim.a[0], y: prim.a[1], z: prim.a[2], w: prim.a[3] ?? 0 },
        { x: prim.b[0], y: prim.b[1], z: prim.b[2], w: prim.b[3] ?? 0 },
        prim.radius,
      );
      if (mid === "core_glow") scene.addLight(geom, mid);
      else scene.addPrimitive(geom, mid);
      continue;
    }
    if (prim.kind === "hypersphere") {
      const sphere = new Hypersphere(
        vec4(
          prim.center[0],
          prim.center[1],
          prim.center[2],
          prim.center[3] ?? 0,
        ),
        prim.radius,
      );
      if (mid === "core_glow") scene.addLight(sphere, mid);
      else scene.addPrimitive(sphere, mid);
    }
  }

  // Soft fill light so dark chrome scenes aren't empty
  scene.materials.createMaterial("fill_light", "light", {
    emission: vec4(4, 4.2, 4.5, 0),
    albedo: vec4(1, 1, 1, 1),
  });
  scene.addLight(new Hypersphere(vec4(3.5, 5, 2.5, 0), 0.35), "fill_light");
  scene.build();

  const eye = opts.camera?.eye ?? [0, 2.2, 7.5, 0];
  const lookAt = opts.camera?.lookAt ?? [0, 0.4, 0, 0];
  const fov = ((opts.camera?.fovY ?? 0.85) * 180) / Math.PI;
  const camera = new Camera4D({
    x: eye[0],
    y: eye[1],
    z: eye[2],
    w: eye[3] ?? 0,
    lx: lookAt[0],
    ly: lookAt[1],
    lz: lookAt[2],
    lw: lookAt[3] ?? 0,
    fovX: fov,
    fovY: fov,
    fovZ: 45,
    fovW: 28,
    width,
    height,
  });

  const rng = mulberry32(seed);
  const tracer = new PathTracer4D({ maxDepth, samplesPerPixel: samples, rng });
  const rgba = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let s = 0; s < samples; s++) {
        const ray = camera.generateRay(x, y, rng(), rng(), 0.5, 0.5);
        const hit = scene.intersect(ray);
        const L = hit ? tracer.trace(ray, scene) : backgroundColor(ray.direction);
        r += L.x;
        g += L.y;
        b += L.z;
      }
      const inv = 1 / samples;
      const idx = (y * width + x) * 4;
      rgba[idx] = toByte(r * inv, exposure);
      rgba[idx + 1] = toByte(g * inv, exposure);
      rgba[idx + 2] = toByte(b * inv, exposure);
      rgba[idx + 3] = 255;
    }
  }

  const png = encodePNG(width, height, rgba);
  const sha256 = createHash("sha256").update(png).digest("hex");
  return {
    png,
    sha256,
    width,
    height,
    samples,
    maxDepth,
    seed,
    primitiveCount: prims.length,
    provenance: {
      engine: "mrs-renderer-core/rt4d",
      script: "render-worlddocument-rt4d",
      version: WORLDDOCUMENT_RT4D_VERSION,
      kind: "worlddocument-rt4d-path-trace",
      world_id: opts.worldId ?? null,
      primitive_count: prims.length,
      width,
      height,
      samples,
      max_depth: maxDepth,
      seed,
      sha256,
      structure_source: "path_trace",
    },
  };
}
