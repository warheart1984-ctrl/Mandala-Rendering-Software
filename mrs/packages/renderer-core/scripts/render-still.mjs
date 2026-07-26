#!/usr/bin/env node
/**
 * render-still.mjs — deterministic RT4D still renderer for Genblaze.
 *
 * Renders a single PNG from a procedurally-selected 4D scene using the real
 * RT4D CPU path tracer (`PathTracer4D`), BVH4D acceleration, and the audited
 * BSDF normalization (BRDF = 3rho/(4pi), pdf = 3cos/(4pi)).
 *
 * HONEST SCOPE (Drive-G-1):
 *   - This is NOT text-to-image and NOT diffusion. There is no semantic image
 *     synthesis. The prompt only drives *procedural scene selection*: keywords
 *     map to a scene archetype + palette + material, and a seed (derived from
 *     the prompt, or supplied explicitly) drives deterministic variation of
 *     object count, camera orbit and 4D (w-axis) offsets.
 *   - Output is a deterministic, replayable path-traced render of that scene.
 *     Same seed + same scene + same size => byte-identical PNG.
 *
 * Rays that miss all geometry are composited over a procedural gradient sky so
 * the still is never blank; foreground surfaces are genuinely path traced.
 *
 * Usage:
 *   node scripts/render-still.mjs --prompt "cyan tesseract lattice" \
 *        --width 448 --height 448 --samples 24 --seed 12345 \
 *        --output /tmp/out.png --provenance /tmp/out.json
 *
 * On success the provenance JSON is written to stdout (single line) and,
 * optionally, to the --provenance path. Exit code is non-zero on failure with
 * a diagnostic on stderr.
 */

import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import process from "node:process";

import { Scene4D } from "../src/render/rt4d/scene/Scene4D.js";
import { Camera4D } from "../src/render/rt4d/camera/Camera4D.js";
import { PathTracer4D } from "../src/render/rt4d/integrator/PathTracer4D.js";
import { Hypersphere, Hyperplane } from "../src/render/rt4d/geometry/hypersurface.js";
import { vec4 } from "../src/render/rt4d/math/vec4.js";
import { lengthPreserved4, rotate2d } from "../src/render/rt4d/math/physicalInvariants.js";

export const RENDER_STILL_VERSION = "1.0.0";
const MAX_DIM = 1024;
const MAX_SAMPLES = 512;
const MAX_DEPTH_CAP = 12;

// ---------------------------------------------------------------------------
// Deterministic RNG + prompt hashing
// ---------------------------------------------------------------------------

/** mulberry32 — small, fast, deterministic PRNG seeded by a uint32. */
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

/** FNV-1a 32-bit hash of a string → uint32 (stable across runs/platforms). */
export function hashPromptToSeed(text) {
  let h = 0x811c9dc5;
  const s = String(text ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Prompt → procedural scene selection (keyword mapping, NOT generation)
// ---------------------------------------------------------------------------

const SCENE_ARCHETYPES = [
  "central-orb",
  "orbital-cluster",
  "torus-ring",
  "lattice-grid",
  "tesseract-vertices",
  "mythic-tableau",
  "neural-lattice",
];

const PALETTES = {
  neon: { albedo: [0.10, 0.80, 0.90], name: "neon" },
  warm: { albedo: [0.92, 0.36, 0.16], name: "warm" },
  cool: { albedo: [0.20, 0.42, 0.92], name: "cool" },
  green: { albedo: [0.22, 0.80, 0.36], name: "green" },
  gold: { albedo: [0.92, 0.72, 0.22], name: "gold" },
  violet: { albedo: [0.70, 0.26, 0.86], name: "violet" },
  mono: { albedo: [0.85, 0.85, 0.90], name: "mono" },
};

// Each alternation is anchored with a leading \b so a keyword only matches at a
// word start. Without it short tokens hijack selection from inside unrelated
// words — "Mandala Rendering System" matched `ring` via "Rende(ring)", and
// `net` matched "pla(net)"/"mag(net)ic". Suffixes still match (rings, grids,
// orbital, lattices) because there is no trailing boundary.
function pickScene(prompt) {
  const p = (prompt || "").toLowerCase();
  if (/\b(dragon|wolf|battle|creature|mountain|tableau)/.test(p)) return "mythic-tableau";
  if (/\b(tesseract|hypercube|4d|four[- ]?dimension|8-cell)/.test(p)) return "tesseract-vertices";
  // Mandala / MRS / neural-lattice prompts before generic ring/grid so
  // "Mandala Rendering System" + "neural lattice" land on a dedicated radial
  // lattice with an energy core — still procedural primitives, not diffusion.
  if (
    /\b(mandala|neural[- ]?lattice|sovereign|glyph|glyphs|energy[- ]?core|constitutional)/.test(p)
  ) {
    return "neural-lattice";
  }
  if (/\b(torus|ring|donut|halo|loop|orbit)/.test(p)) return "torus-ring";
  if (/\b(grid|lattice|matrix|array|mesh|net)/.test(p)) return "lattice-grid";
  if (/\b(cluster|galaxy|scatter|particle|swarm|constellation|nebula)/.test(p)) return "orbital-cluster";
  if (/\b(sphere|orb|planet|ball|pearl|core|singularity)/.test(p)) return "central-orb";
  return null; // caller falls back to seed-derived choice
}

// Word-anchored for the same reason as pickScene: `ice` matched "latt(ice)", so
// every lattice prompt silently became the cool palette.
function pickPalette(prompt) {
  const p = (prompt || "").toLowerCase();
  if (/\b(neon|cyan|electric|teal|aqua)/.test(p)) return PALETTES.neon;
  if (/\b(warm|fire|red|lava|sunset|ember|crimson|orange)/.test(p)) return PALETTES.warm;
  if (/\b(cool|ice|blue|azure|cobalt|frost)/.test(p)) return PALETTES.cool;
  if (/\b(green|emerald|forest|jade|lime)/.test(p)) return PALETTES.green;
  if (/\b(gold|amber|bronze|brass|yellow)/.test(p)) return PALETTES.gold;
  if (/\b(purple|violet|magenta|lilac|plasma)/.test(p)) return PALETTES.violet;
  if (/\b(mono|white|silver|grey|gray|chrome|steel)/.test(p)) return PALETTES.mono;
  return null;
}

// Word-anchored so `shine` stops matching "ma(chine)"; "crystalline" still
// selects ggx because the word itself begins with `crystal`.
function pickMaterialType(prompt) {
  const p = (prompt || "").toLowerCase();
  if (/\b(glass|chrome|metal|mirror|glossy|polished|crystal|shine|reflective)/.test(p)) {
    return "ggx";
  }
  return "lambertian";
}

/** HSV→RGB for seed-derived palettes (h in [0,1]). */
function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

/** Resolve the full scene descriptor from prompt/overrides + seed. */
export function resolveSceneDescriptor({ prompt = "", scene = null, palette = null, seed }) {
  const chosenScene =
    (scene && SCENE_ARCHETYPES.includes(scene) ? scene : null) ||
    pickScene(prompt) ||
    SCENE_ARCHETYPES[seed % SCENE_ARCHETYPES.length];

  let pal = null;
  if (palette && PALETTES[palette]) pal = PALETTES[palette];
  if (!pal) pal = pickPalette(prompt);
  if (!pal) {
    const hue = ((seed >>> 8) & 0xffff) / 0xffff;
    pal = { albedo: hsvToRgb(hue, 0.72, 0.88), name: `seed-hue-${hue.toFixed(3)}` };
  }

  return {
    scene: chosenScene,
    palette: pal,
    materialType: pickMaterialType(prompt),
  };
}

// ---------------------------------------------------------------------------
// Scene construction
// ---------------------------------------------------------------------------

function buildScene(descriptor, seed) {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const scene = new Scene4D();
  const [ar, ag, ab] = descriptor.palette.albedo;
  const albedo = vec4(ar, ag, ab, 1);

  if (descriptor.scene === "mythic-tableau" || descriptor.scene === "neural-lattice") {
    // Diffuse body stays readable at draft sample counts (GGX silhouettes go black).
    scene.materials.createMaterial("surf", "lambertian", {
      albedo: vec4(
        Math.min(1, ar * 1.15 + 0.08),
        Math.min(1, ag * 1.15 + 0.08),
        Math.min(1, ab * 1.15 + 0.08),
        1,
      ),
    });
  } else if (descriptor.materialType === "ggx") {
    scene.materials.createMaterial("surf", "ggx", {
      albedo,
      // Soft enough to read under 4D NEE at demo sample counts.
      roughness: 0.35,
      f0: vec4(0.85, 0.85, 0.9, 1),
    });
  } else {
    scene.materials.createMaterial("surf", "lambertian", { albedo });
  }
  scene.materials.createMaterial("ground", "lambertian", {
    albedo: vec4(0.42, 0.45, 0.52, 1),
  });
  // Emission scaled for the 4D area→solid-angle Jacobian (r³). Too low and
  // stills look like dark noise; the previous r² PDF over-brightened fireflies.
  scene.materials.createMaterial("keylight", "light", {
    emission: vec4(90, 84, 76, 0),
    albedo: vec4(1, 1, 1, 1),
  });
  scene.materials.createMaterial("filllight", "light", {
    emission: vec4(32, 36, 42, 0),
    albedo: vec4(1, 1, 1, 1),
  });
  // High-roughness GGX / lambertian accents stay readable at draft sample counts.
  // Do NOT use type "light" for in-frame accents — those render as white disks.
  scene.materials.createMaterial("silver", "ggx", {
    albedo: vec4(0.78, 0.88, 0.98, 1),
    roughness: 0.55,
    f0: vec4(0.55, 0.6, 0.7, 1),
  });
  scene.materials.createMaterial("gold", "ggx", {
    albedo: vec4(0.98, 0.72, 0.18, 1),
    roughness: 0.55,
    f0: vec4(0.7, 0.5, 0.2, 1),
  });
  scene.materials.createMaterial("shadow", "lambertian", {
    albedo: vec4(0.18, 0.2, 0.28, 1),
  });
  scene.materials.createMaterial("radiant-core", "lambertian", {
    albedo: vec4(0.98, 0.9, 0.45, 1),
  });

  const objects = [];
  const accents = [];
  const jitter = (amp) => (rng() - 0.5) * 2 * amp;

  switch (descriptor.scene) {
    case "central-orb": {
      objects.push(new Hypersphere(vec4(0, 0.1, 0, jitter(0.4)), 1.15));
      break;
    }
    case "orbital-cluster": {
      const count = 4 + (seed % 5); // 4..8
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + jitter(0.3);
        const r = 1.7 + jitter(0.25);
        objects.push(
          new Hypersphere(
            vec4(Math.cos(a) * r, 0.1 + jitter(0.4), Math.sin(a) * r, 0),
            0.45 + rng() * 0.2,
          ),
        );
      }
      objects.push(new Hypersphere(vec4(0, 0.1, 0, 0), 0.7));
      break;
    }
    case "torus-ring": {
      const count = 12 + (seed % 5); // 12..16
      const R = 1.65;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        objects.push(
          new Hypersphere(
            vec4(Math.cos(a) * R, 0.15, Math.sin(a) * R, 0),
            0.34,
          ),
        );
      }
      break;
    }
    case "lattice-grid": {
      const spacing = 1.15;
      for (let ix = -1; ix <= 1; ix++) {
        for (let iz = -1; iz <= 1; iz++) {
          objects.push(
            new Hypersphere(
              vec4(ix * spacing, 0.1, iz * spacing, 0),
              0.34,
            ),
          );
        }
      }
      break;
    }
    case "tesseract-vertices":
    {
      // Project the 16 tesseract vertices into the camera's central W-slice
      // (w→0) with a mild perspective so both cubes read as a classic
      // tesseract diagram instead of vanishing off the hyperplane.
      const s = 0.95;
      for (let i = 0; i < 16; i++) {
        const x = (i & 1) ? s : -s;
        const y = (i & 2) ? s : -s;
        const z = (i & 4) ? s : -s;
        const w = (i & 8) ? s : -s;
        const k = 1.35 / (2.2 + w);
        objects.push(
          new Hypersphere(vec4(x * k * 2.0, y * k * 2.0 + 0.15, z * k * 2.0, 0), 0.26),
        );
      }
      break;
    }
    case "mythic-tableau": {
      // Abstract creature anatomy built from deterministic 4D primitives.
      // Compact frustum composition so body / wings / attackers / divers all read
      // at typical orbit cameras. NOT semantic text-to-image synthesis.
      // Mountain dragon: heavy central body, raised head, segmented folded wings.
      objects.push(new Hypersphere(vec4(0, 0.05, 0, 0), 0.7));
      objects.push(new Hypersphere(vec4(0.0, 0.62, -0.05, 0), 0.38));
      objects.push(new Hypersphere(vec4(0.1, 0.95, -0.08, 0), 0.22));
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          objects.push(
            new Hypersphere(
              vec4(side * (0.5 + i * 0.28), 0.5 - i * 0.1, 0.08 + i * 0.06, 0),
              0.3 - i * 0.03,
            ),
          );
        }
      }

      // Wolf-like attackers climbing from the lower foreground (in-frame).
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          accents.push({
            primitive: new Hypersphere(
              vec4(side * (0.85 + i * 0.28), -0.55 + i * 0.14, -0.55 + i * 0.1, 0),
              0.2 - i * 0.02,
            ),
            materialId: "shadow",
          });
        }
      }

      // Two descending lattice dragons form the upper triangle (kept inside FOV).
      for (const [side, materialId] of [[-1, "silver"], [1, "gold"]]) {
        for (let i = 0; i < 5; i++) {
          accents.push({
            primitive: new Hypersphere(
              vec4(side * (1.1 - i * 0.14), 1.55 - i * 0.2, 0.1 + i * 0.05, 0),
              0.26 - i * 0.02,
            ),
            materialId,
          });
        }
        accents.push({
          primitive: new Hypersphere(vec4(side * 1.1, 1.55, 0.1, 0), 0.14),
          materialId: "radiant-core",
        });
      }
      break;
    }
    case "neural-lattice": {
      // Radial lattice around a central energy core — procedural mandala /
      // neural-circuit silhouette. NOT photoreal glyphs or diffusion synthesis.
      accents.push({
        primitive: new Hypersphere(vec4(0, 0.2, 0, jitter(0.15)), 0.42),
        materialId: "radiant-core",
      });
      const ringCounts = [8, 12];
      const radii = [1.05, 1.85];
      for (let ring = 0; ring < ringCounts.length; ring++) {
        const count = ringCounts[ring];
        const R = radii[ring];
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + jitter(0.04);
          const y = 0.12 + (ring === 0 ? 0.08 : -0.02) + jitter(0.06);
          objects.push(
            new Hypersphere(
              vec4(Math.cos(a) * R, y, Math.sin(a) * R, jitter(0.2)),
              ring === 0 ? 0.22 : 0.18,
            ),
          );
          // Short radial "ribbon" segments toward the core (circuit spokes).
          if (i % 2 === 0) {
            const mid = R * 0.55;
            accents.push({
              primitive: new Hypersphere(
                vec4(Math.cos(a) * mid, y * 0.7, Math.sin(a) * mid, 0),
                0.11,
              ),
              materialId: i % 4 === 0 ? "gold" : "silver",
            });
          }
        }
      }
      // Outer glyph accents (small bright nodes on a sparse ring).
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        accents.push({
          primitive: new Hypersphere(
            vec4(Math.cos(a) * 2.15, 0.55 + jitter(0.1), Math.sin(a) * 2.15, 0),
            0.12,
          ),
          materialId: i % 2 === 0 ? "gold" : "silver",
        });
      }
      break;
    }
    default: {
      objects.push(new Hypersphere(vec4(0, 0.1, 0, 0), 1.15));
      break;
    }
  }

  for (const obj of objects) scene.addPrimitive(obj, "surf");
  for (const { primitive, materialId } of accents) scene.addPrimitive(primitive, materialId);
  scene.addPrimitive(new Hyperplane(vec4(0, 1, 0, 0), -1.4), "ground");
  // Lights elevated and off to the sides — close enough to light the scene,
  // outside the camera frustum so they do not appear as white disks.
  scene.addLight(new Hypersphere(vec4(4.2, 7.2, -3.8, 0), 0.7), "keylight");
  scene.addLight(new Hypersphere(vec4(-5.0, 5.8, 4.2, 0), 0.55), "filllight");
  scene.build();

  return { scene, objectCount: objects.length + accents.length };
}

function buildCamera(seed, width, height) {
  const rng = mulberry32(seed ^ 0x2545f491);
  const theta = rng() * Math.PI * 2;
  const radius = 4.4;
  const elevation = 1.55 + rng() * 0.25;
  const camW = 0; // stay in the projected slice with the geometry
  const lookY = 0.45;
  const position = {
    x: Math.cos(theta) * radius,
    y: elevation,
    z: Math.sin(theta) * radius,
    w: camW,
  };
  const camera = new Camera4D({
    x: position.x,
    y: position.y,
    z: position.z,
    w: position.w,
    lx: 0,
    ly: lookY,
    lz: 0,
    lw: 0,
    fovX: 52,
    fovY: 52,
    fovZ: 8,
    fovW: 8,
    width,
    height,
  });
  return { camera, position, lookAt: { x: 0, y: lookY, z: 0, w: 0 } };
}

// ---------------------------------------------------------------------------
// Background + tonemapping
// ---------------------------------------------------------------------------

/** Procedural gradient sky for primary-ray misses (keeps the still non-blank). */
function backgroundColor(dir, palette) {
  const t = Math.min(1, Math.max(0, 0.5 * (dir.y + 1)));
  const [ar, ag, ab] = palette.albedo;
  // Horizon is bright neutral; zenith darkens toward a palette-tinted deep tone.
  const horizon = [0.62, 0.66, 0.72];
  const zenith = [0.10 + ar * 0.10, 0.13 + ag * 0.10, 0.24 + ab * 0.10];
  return vec4(
    horizon[0] + (zenith[0] - horizon[0]) * t,
    horizon[1] + (zenith[1] - horizon[1]) * t,
    horizon[2] + (zenith[2] - horizon[2]) * t,
    0,
  );
}

/** Reinhard tonemap + gamma 2.2, clamped to a byte. */
function toByte(c, exposure) {
  let v = c * exposure;
  v = v / (1 + v);
  v = Math.pow(Math.max(0, v), 1 / 2.2);
  return Math.min(255, Math.max(0, Math.round(v * 255)));
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder (truecolor + alpha, 8-bit, filter 0)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

export function encodePNG(width, height, rgba) {
  const src = Buffer.isBuffer(rgba) ? rgba : Buffer.from(rgba.buffer ?? rgba, rgba.byteOffset ?? 0, rgba.length);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    src.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Core render
// ---------------------------------------------------------------------------

export function renderStill(options = {}) {
  const width = clampInt(options.width ?? 448, 16, MAX_DIM);
  const height = clampInt(options.height ?? 448, 16, MAX_DIM);
  const samples = clampInt(options.samples ?? 24, 1, MAX_SAMPLES);
  const maxDepth = clampInt(options.maxDepth ?? 5, 1, MAX_DEPTH_CAP);
  const prompt = options.prompt ?? "";
  const seed =
    options.seed != null && Number.isFinite(Number(options.seed))
      ? (Number(options.seed) >>> 0)
      : hashPromptToSeed(prompt);

  const descriptor = resolveSceneDescriptor({
    prompt,
    scene: options.scene ?? null,
    palette: options.palette ?? null,
    seed,
  });


  const { scene, objectCount } = buildScene(descriptor, seed);
  const { camera, position, lookAt } = buildCamera(seed, width, height);

  const rng = mulberry32(seed);
  const tracer = new PathTracer4D({ maxDepth, samplesPerPixel: samples, rng });

  const rgba = Buffer.alloc(width * height * 4);
  const exposure =
    descriptor.scene === "mythic-tableau"
      ? 3.2
      : descriptor.scene === "neural-lattice"
        ? 2.9
        : 2.4;
  let lumSum = 0;
  // Center ROI excludes ground band (bottom 25%) so grey floor cannot alone pass.
  let roiLumSum = 0;
  let roiCount = 0;
  const yLo = Math.floor(height * 0.15);
  const yHi = Math.floor(height * 0.7);
  const xLo = Math.floor(width * 0.25);
  const xHi = Math.floor(width * 0.75);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let s = 0; s < samples; s++) {
        const u1 = rng();
        const u2 = rng();
        // Fix the hyperplane sample (rz/rw) at the central 4D slice.
        // Randomizing u3/u4 here sprays rays through the fourth dimension so
        // finite hyperspheres appear as speckles while the infinite ground
        // plane still fills in — the broken look users were seeing.
        const ray = camera.generateRay(x, y, u1, u2, 0.5, 0.5);
        const hit = scene.intersect(ray);
        const L = hit ? tracer.trace(ray, scene) : backgroundColor(ray.direction, descriptor.palette);
        r += L.x;
        g += L.y;
        b += L.z;
      }
      const inv = 1 / samples;
      const R = toByte(r * inv, exposure);
      const G = toByte(g * inv, exposure);
      const B = toByte(b * inv, exposure);
      const idx = (y * width + x) * 4;
      rgba[idx] = R;
      rgba[idx + 1] = G;
      rgba[idx + 2] = B;
      rgba[idx + 3] = 255;
      const lum = 0.299 * R + 0.587 * G + 0.114 * B;
      lumSum += lum;
      if (x >= xLo && x < xHi && y >= yLo && y < yHi) {
        roiLumSum += lum;
        roiCount += 1;
      }
    }
  }

  const png = encodePNG(width, height, rgba);
  const sha256 = createHash("sha256").update(png).digest("hex");
  const meanLuminance = lumSum / (width * height);
  const meanLuminanceCenter = roiCount > 0 ? roiLumSum / roiCount : 0;

  // Cheap engine invariant evidence: length preserved under a 4D rotation of a
  // sample vector (PI-GEO-LENGTH). Uses the tested predicate, not a render gate.
  const rot = rotate2d(1, 0, (seed % 360) * (Math.PI / 180));
  const invariantOk = lengthPreserved4(
    vec4(1, 0, 0, 0),
    vec4(rot.x, rot.y, 0, 0),
    1e-9,
  );

  const provenance = {
    engine: "mrs-renderer-core/rt4d",
    renderer_version: RENDER_STILL_VERSION,
    kind: "deterministic-procedural-4d-render",
    note: "Procedural scene selection + seeded RT4D path trace. NOT text-to-image / not diffusion.",
    prompt,
    prompt_hash: hashPromptToSeed(prompt),
    seed,
    scene: descriptor.scene,
    palette: descriptor.palette.name,
    material_type: descriptor.materialType,
    object_count: objectCount,
    camera: { position, look_at: lookAt, fov_x: camera.fovX, fov_y: camera.fovY, fov_w: camera.fovW },
    width,
    height,
    samples,
    max_depth: maxDepth,
    bytes: png.length,
    sha256,
    mean_luminance: Number(meanLuminance.toFixed(3)),
    mean_luminance_center: Number(meanLuminanceCenter.toFixed(3)),
    invariant: { id: "PI-GEO-LENGTH", status: "tested", ok: invariantOk },
  };


  return { png, provenance };
}

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** Options that always take the following token as their value (even if it starts with `--`). */
const VALUE_OPTIONS = new Set([
  "prompt",
  "seed",
  "scene",
  "palette",
  "width",
  "height",
  "samples",
  "max-depth",
  "maxDepth",
  "output",
  "provenance",
]);

/**
 * Parse CLI argv into a flag map.
 *
 * Value-taking options always consume the next token — including values that
 * begin with `--` (e.g. `--prompt --weird-keyword-tesseract`). Bare `--` is
 * treated as end-of-options and ignored. Boolean flags remain true when they
 * have no following value.
 */
export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    if (!key) continue;
    const next = argv[i + 1];
    if (VALUE_OPTIONS.has(key)) {
      if (next === undefined) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
      continue;
    }
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const output = args.output;
  if (!output) {
    process.stderr.write("render-still: --output <path.png> is required\n");
    process.exit(2);
  }
  const outPath = String(output).toLowerCase().endsWith(".png") ? String(output) : `${output}.png`;

  let result;
  try {
    result = renderStill({
      prompt: typeof args.prompt === "string" ? args.prompt : "",
      seed: args.seed,
      scene: typeof args.scene === "string" ? args.scene : null,
      palette: typeof args.palette === "string" ? args.palette : null,
      width: args.width,
      height: args.height,
      samples: args.samples,
      maxDepth: args["max-depth"] ?? args.maxDepth,
    });
  } catch (err) {
    process.stderr.write(`render-still: render failed: ${err && err.stack ? err.stack : err}\n`);
    process.exit(1);
  }

  try {
    writeFileSync(outPath, result.png);
  } catch (err) {
    process.stderr.write(`render-still: could not write ${outPath}: ${err}\n`);
    process.exit(1);
  }

  const provenance = { ...result.provenance, output: outPath };
  if (typeof args.provenance === "string") {
    try {
      writeFileSync(args.provenance, JSON.stringify(provenance, null, 2));
    } catch (err) {
      process.stderr.write(`render-still: could not write provenance ${args.provenance}: ${err}\n`);
    }
  }
  process.stdout.write(JSON.stringify(provenance) + "\n");
}

const isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (isMain) main();
