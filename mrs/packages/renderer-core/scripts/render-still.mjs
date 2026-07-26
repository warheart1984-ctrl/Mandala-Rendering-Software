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
 * Engine3D frame path (OPTIONAL, not default):
 *   This CLI remains the Genblaze prompt→archetype still path.
 *   Engine3D → RT4D bridge capture/receipt lives in `@mrs/engine3d-core`
 *   (`captureEngine3DScene` / `renderEngine3dFrame`) and
 *   `src/render/rt4d/bridge/engine3dBridgeScene.js`. Do not assume
 *   `ENGINE3D_FRAME=1` / `--engine3d-frame` hijacks this default.
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

export const RENDER_STILL_VERSION = "1.1.0";
/** Per-archetype Reinhard exposure multiplier (default 2.4). */
const SCENE_EXPOSURE = {
  "mythic-tableau": 3.2,
  "neural-lattice": 2.9,
  "tesseract-lattice": 2.0,
};
/** Byte-luminance below which a pixel counts as "dark" for noise reporting. */
const DARK_LUMINANCE_THRESHOLD = 24;
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
  "tesseract-lattice",
  "mythic-tableau",
  "neural-lattice",
];

// `tesseract-vertices` rendered the 16 projected vertices as bare hyperspheres
// and nothing else: no edges, so the classic 8-cell read as disconnected blobs,
// and prompts containing "reflective"/"metallic" pushed it onto GGX, which goes
// near-black at draft sample counts. It is superseded by `tesseract-lattice`
// (vertices + 32 edge beams + emissive core + mandala rings). The old id stays
// accepted so stored specs / explicit `--scene` values keep rendering.
export const SCENE_ALIASES = {
  "tesseract-vertices": "tesseract-lattice",
};

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
  // Tesseract cues outrank the mandala/neural branch below: a prompt naming both
  // ("a tesseract ... inside a radial mandala grid") wants the 8-cell lattice as
  // the subject with rings as accents, not a generic radial node field. The
  // tesseract-lattice archetype carries its own mandala rings for that reason.
  if (/\b(tesseract|hypercube|4d|four[- ]?dimension|8-cell)/.test(p)) return "tesseract-lattice";
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
  const requested = scene ? (SCENE_ALIASES[scene] ?? scene) : null;
  const chosenScene =
    (requested && SCENE_ARCHETYPES.includes(requested) ? requested : null) ||
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
// Tesseract lattice geometry
//
// RT4D exposes exactly two BVH-bounded primitives (`Hypersphere`, `Hyperplane`);
// `ImplicitHypersurface` has no `getBounds`, so adding one disables the BVH for
// the whole scene. There is no line/capsule/segment primitive. A "beam" is
// therefore a deterministic chain of overlapping hyperspheres, and its object
// count is bounded by the caller's `step` (see `beamChain`).
// ---------------------------------------------------------------------------

const TESSERACT_HALF = 0.95;      // 4D vertex coordinate (±half on each axis)
const TESSERACT_PROJ_DIST = 2.2;  // 4D→3D perspective denominator offset
const TESSERACT_PROJ_SCALE = 2.1; // projected scale (outer ≈1.60, inner ≈0.63)
const TESSERACT_CENTER_Y = 0.55;  // lift so the outer cube floats above the plane
const TESSERACT_BEAM_RADIUS = 0.155;
/** Concentric mandala ring node specs for `tesseract-lattice` (exported for unit asserts). */
export const TESSERACT_RING_SPECS = [
  // r ≥ R·sin(π/n): 0.21 ≥ 2.05·sin(π/32)≈0.201 and 0.21 ≥ 2.55·sin(π/40)≈0.200
  { radius: 2.05, count: 32, y: TESSERACT_CENTER_Y - 0.05, nodeRadius: 0.21 },
  { radius: 2.55, count: 40, y: TESSERACT_CENTER_Y - 0.12, nodeRadius: 0.21 },
];

/** True when neighbouring ring nodes touch or overlap: nodeRadius ≥ radius·sin(π/count). */
export function ringNodesTouch(radius, count, nodeRadius) {
  return nodeRadius >= radius * Math.sin(Math.PI / count);
}
// Centre spacing as a fraction of the beam radius. The integrator returns
// `emission * cosθ` for light materials, so sphere-chain beams always scallop
// slightly at the joints; 1.35 is the readability/CPU sweet spot measured for
// draft stills (see PR). Closer spacing helps but costs spheres linearly.
const TESSERACT_BEAM_STEP_SCALE = 1.35;
const TESSERACT_GROUND_OFFSET = -1.85;
const TESSERACT_CAMERA_RADIUS = 6.4;
/**
 * Rough-GGX ring accents ("reflective metallic surfaces") need enough samples to
 * resolve; below this they render as near-black silhouettes. Draft therefore
 * uses soft emissive cyan rings — honestly not metal — and `final` (≥ this
 * threshold) gets the rough GGX "silver" material.
 */
const RING_GGX_MIN_SAMPLES = 12;

/**
 * Concentric mandala ring specs for `tesseract-lattice`.
 *
 * Neighbouring equal-radius spheres on a circle of radius R touch/overlap when
 * `nodeRadius >= radius * sin(π / count)` (half the chord length between
 * neighbours). Counts are even integers with a small overlap margin:
 *   R=2.05, r=0.13 → need n≥50 (sin bound ≈0.124); use 52
 *   R=2.55, r=0.11 → need n≥73 (sin bound ≈0.105); use 76
 * vs the prior dotted 32/40 which failed that inequality. Node count +56
 * keeps total objects ≈541 (≤800 budget).
 */
export const TESSERACT_RING_SPECS = Object.freeze([
  Object.freeze({ radius: 2.05, count: 52, y: TESSERACT_CENTER_Y - 0.05, nodeRadius: 0.13 }),
  Object.freeze({ radius: 2.55, count: 76, y: TESSERACT_CENTER_Y - 0.12, nodeRadius: 0.11 }),
]);

/** True when neighbouring equal-radius spheres on a circle of `radius` touch or overlap. */
export function ringNodesTouch(radius, count, nodeRadius) {
  if (!(radius > 0) || !(count >= 3) || !(nodeRadius > 0)) return false;
  return nodeRadius >= radius * Math.sin(Math.PI / count);
}

/**
 * The 32 canonical edges of an 8-cell: vertex indices whose bit patterns differ
 * in exactly one of the four axes. Derived, not hand-listed, so it cannot drift.
 */
export const TESSERACT_EDGES = (() => {
  const edges = [];
  for (let i = 0; i < 16; i++) {
    for (let j = i + 1; j < 16; j++) {
      const d = i ^ j;
      if ((d & (d - 1)) === 0) edges.push([i, j]); // single-bit difference
    }
  }
  return edges;
})();

/**
 * The 16 tesseract vertices projected into the camera's central W-slice.
 *
 * Index bits map to (x, y, z, w) signs. `w` sets the perspective divisor, so the
 * w=-half cube becomes the outer cube and w=+half the inner one — the classic
 * tesseract diagram. Projected points sit at w=0 because `renderStill` fixes the
 * hyperplane sample at the central slice; geometry off that slice renders as
 * speckle.
 */
export function tesseractProjectedVertices({
  half = TESSERACT_HALF,
  projDist = TESSERACT_PROJ_DIST,
  projScale = TESSERACT_PROJ_SCALE,
  centerY = TESSERACT_CENTER_Y,
} = {}) {
  const out = [];
  for (let i = 0; i < 16; i++) {
    const x = i & 1 ? half : -half;
    const y = i & 2 ? half : -half;
    const z = i & 4 ? half : -half;
    const w = i & 8 ? half : -half;
    const k = projScale / (projDist + w);
    out.push(vec4(x * k, y * k + centerY, z * k, 0));
  }
  return out;
}

/**
 * Overlapping hypersphere chain approximating the segment a→b.
 *
 * `step` is the centre spacing; `step === radius` keeps the tube waist at
 * cos(30°) ≈ 87% of the radius, which reads as a continuous beam rather than a
 * bead string. Object count is `ceil(len/step) + 1`, so the caller bounds CPU
 * cost by choosing `step` — this is an approximation of a capsule, not a real
 * swept primitive.
 */
export function beamChain(a, b, radius, step = radius) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const dw = b.w - a.w;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw);
  const n = Math.max(1, Math.ceil(len / Math.max(1e-6, step)));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(
      new Hypersphere(vec4(a.x + dx * t, a.y + dy * t, a.z + dz * t, a.w + dw * t), radius),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scene construction
// ---------------------------------------------------------------------------

function buildScene(descriptor, seed, { samples = 24 } = {}) {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const scene = new Scene4D();
  const [ar, ag, ab] = descriptor.palette.albedo;
  const albedo = vec4(ar, ag, ab, 1);

  if (
    descriptor.scene === "mythic-tableau" ||
    descriptor.scene === "neural-lattice" ||
    descriptor.scene === "tesseract-lattice"
  ) {
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
  // A mid-grey floor reads as noisy sludge once it fills most of the frame at
  // draft sample counts, so the lattice gets a dark floor: the same NEE variance
  // lands on a darker surface, and the tesseract reads as suspended.
  scene.materials.createMaterial("ground", "lambertian", {
    albedo:
      descriptor.scene === "tesseract-lattice"
        ? vec4(0.16, 0.17, 0.22, 1)
        : vec4(0.42, 0.45, 0.52, 1),
  });
  // Emissive neon beam. `type: "light"` returns `emission * cosθ` directly from
  // the integrator with zero variance, which is what makes a 4-spp draft show
  // crisp beams instead of noise; cosθ still gives the tube a rim falloff and
  // a mild scallop where overlapping spheres meet — that is an honest limit of
  // the sphere-chain approximation, not a missing glow pass.
  // These are added with `addPrimitive`, NOT `addLight`: they are self-lit
  // surfaces, so they do not feed NEE and (by the tracer's light-hit rule in
  // `_handleSurface`) do not cast shadows. Shadows come from the diffuse/
  // glossy ring nodes when those are present.
  scene.materials.createMaterial("beam", "light", {
    emission: vec4(
      Math.min(1.55, ar * 1.35 + 0.06),
      Math.min(1.55, ag * 1.35 + 0.06),
      Math.min(1.55, ab * 1.35 + 0.06),
      0,
    ),
    albedo: vec4(ar, ag, ab, 1),
  });
  // Soft emissive ring accent used at draft sample counts. Same light-as-surface
  // trick as the beams, but dimmer, so the concentric rings read without NEE
  // noise. Not metal — see RING_GGX_MIN_SAMPLES for when "silver" is used.
  scene.materials.createMaterial("ring-glow", "light", {
    emission: vec4(
      Math.min(0.85, ar * 0.75 + 0.08),
      Math.min(0.85, ag * 0.75 + 0.08),
      Math.min(0.85, ab * 0.75 + 0.08),
      0,
    ),
    albedo: vec4(ar, ag, ab, 1),
  });
  // Brighter emissive junction node, so vertices read as lattice joints rather
  // than as the dark spheres the previous archetype produced.
  scene.materials.createMaterial("node", "light", {
    emission: vec4(
      Math.min(1.85, ar * 1.6 + 0.28),
      Math.min(1.85, ag * 1.6 + 0.28),
      Math.min(1.85, ab * 1.6 + 0.28),
      0,
    ),
    albedo: vec4(1, 1, 1, 1),
  });
  // White energy core. Registered via `addLight`, so it both reads as the bright
  // centre and actually illuminates nearby surfaces through NEE — the prompt's
  // "core ... illuminating the structure". Emission is low because a small
  // radius means a small S³ area and therefore a large solid-angle PDF.
  scene.materials.createMaterial("core", "light", {
    emission: vec4(5.6, 5.4, 4.9, 0),
    albedo: vec4(1, 1, 1, 1),
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
  const extraLights = [];
  const composition = {};
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
    case "tesseract-lattice": {
      // Readable 8-cell: 16 projected vertices joined by all 32 canonical edges
      // as emissive neon beam chains, a white energy core at the centre, and
      // concentric mandala rings as accents. Still deterministic procedural
      // primitives — no semantic synthesis.
      const verts = tesseractProjectedVertices();
      const beamRadius = TESSERACT_BEAM_RADIUS;

      const beamStep = beamRadius * TESSERACT_BEAM_STEP_SCALE;
      let beamSpheres = 0;
      for (const [i, j] of TESSERACT_EDGES) {
        for (const primitive of beamChain(verts[i], verts[j], beamRadius, beamStep)) {
          accents.push({ primitive, materialId: "beam" });
          beamSpheres += 1;
        }
      }

      // Brighter emissive vertex joints. These were diffuse in the first pass and
      // came back as dark knobs at every corner — the same failure mode as the
      // reported render, because a 4-spp diffuse sphere ringed by non-occluding
      // emissive beams gets almost no resolved direct light.
      for (const v of verts) accents.push({ primitive: new Hypersphere(v, beamRadius * 1.35), materialId: "node" });

      extraLights.push({
        primitive: new Hypersphere(vec4(0, TESSERACT_CENTER_Y, 0, 0), 0.3),
        materialId: "core",
      });

      // Radial mandala: two concentric node rings plus short spoke beams.
      // At draft sample counts rings are soft-emissive cyan (`ring-glow`) so they
      // read without NEE noise — honestly not reflective metal. At final
      // (samples ≥ RING_GGX_MIN_SAMPLES) they become rough GGX "silver".
      const useMetalRings =
        descriptor.materialType === "ggx" && samples >= RING_GGX_MIN_SAMPLES;
      const ringMaterial = useMetalRings ? "silver" : "ring-glow";
      // Continuous rings: each TESSERACT_RING_SPECS entry satisfies
      // nodeRadius >= radius·sin(π/count) so neighbours touch/overlap.
      let ringNodes = 0;
      for (let r = 0; r < TESSERACT_RING_SPECS.length; r++) {
        const { radius, count, y, nodeRadius } = TESSERACT_RING_SPECS[r];
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + (r === 0 ? 0 : Math.PI / count);
          accents.push({
            primitive: new Hypersphere(vec4(Math.cos(a) * radius, y, Math.sin(a) * radius, 0), nodeRadius),
            materialId: ringMaterial,
          });
          ringNodes += 1;
        }
      }

      // Six short radial spokes from the outer cube toward the first ring.
      let spokeSpheres = 0;
      const spokes = 6;
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2;
        const inner = vec4(Math.cos(a) * 1.72, TESSERACT_CENTER_Y - 0.05, Math.sin(a) * 1.72, 0);
        const outer = vec4(Math.cos(a) * 2.05, TESSERACT_CENTER_Y - 0.05, Math.sin(a) * 2.05, 0);
        for (const primitive of beamChain(inner, outer, 0.08, 0.11)) {
          accents.push({ primitive, materialId: "beam" });
          spokeSpheres += 1;
        }
      }

      composition.tesseract_vertices = verts.length;
      composition.tesseract_edges = TESSERACT_EDGES.length;
      composition.beam_spheres = beamSpheres;
      composition.spoke_spheres = spokeSpheres;
      composition.ring_nodes = ringNodes;
      composition.emissive_cores = 1;
      composition.ring_material = ringMaterial;
      composition.ring_material_note = useMetalRings
        ? "rough GGX silver (approximate reflective metal)"
        : "soft emissive cyan (draft-readable; not metal)";
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
  const groundOffset =
    descriptor.scene === "tesseract-lattice" ? TESSERACT_GROUND_OFFSET : -1.4;
  scene.addPrimitive(new Hyperplane(vec4(0, 1, 0, 0), groundOffset), "ground");
  // Lights elevated and off to the sides — close enough to light the scene,
  // outside the camera frustum so they do not appear as white disks.
  scene.addLight(new Hypersphere(vec4(4.2, 7.2, -3.8, 0), 0.7), "keylight");
  // NEE picks one light uniformly per bounce, so every extra light multiplies
  // light-selection variance. At 4 spp a key/fill/core triple leaves diffuse
  // surfaces mottled (some pixels draw the bright key three times, some the dim
  // fill three times). tesseract-lattice therefore runs key + core only and gets
  // its fill from the emissive lattice via BSDF-sampled indirect bounces.
  if (descriptor.scene !== "tesseract-lattice") {
    scene.addLight(new Hypersphere(vec4(-5.0, 5.8, 4.2, 0), 0.55), "filllight");
  }
  // In-frame emissive lights (e.g. the tesseract core) join NEE last so the
  // off-frame key/fill remain lights[0]/[1] for every existing archetype.
  for (const { primitive, materialId } of extraLights) scene.addLight(primitive, materialId);
  scene.build();

  return {
    scene,
    objectCount: objects.length + accents.length + extraLights.length,
    composition,
  };
}

function buildCamera(seed, width, height, descriptor = null) {
  const rng = mulberry32(seed ^ 0x2545f491);
  const theta = rng() * Math.PI * 2;
  const orbitJitter = rng();
  let radius = 4.4;
  let elevation = 1.55 + orbitJitter * 0.25;
  let lookY = 0.45;
  if (descriptor?.scene === "tesseract-lattice") {
    // Pull back far enough for the outer cube plus both mandala rings, and keep
    // the view axis near-horizontal. The default 4.4/1.55 rig tilts down ~14°,
    // which puts the horizon at ~23% of frame height and lets the ground fill
    // the remaining ~77% — the dominant grey band in the reported render.
    radius = TESSERACT_CAMERA_RADIUS;
    elevation = TESSERACT_CENTER_Y + 0.62 + orbitJitter * 0.14;
    lookY = TESSERACT_CENTER_Y; // locked on the emissive core
  }
  const camW = 0; // stay in the projected slice with the geometry
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


  const { scene, objectCount, composition } = buildScene(descriptor, seed, { samples });
  const { camera, position, lookAt } = buildCamera(seed, width, height, descriptor);

  const rng = mulberry32(seed);
  const tracer = new PathTracer4D({ maxDepth, samplesPerPixel: samples, rng });

  const rgba = Buffer.alloc(width * height * 4);
  // tesseract-lattice sits lower than the diffuse archetypes because its beams
  // and core are emissive; the default 2.4 blows them to flat white.
  const exposure = SCENE_EXPOSURE[descriptor.scene] ?? 2.4;
  let lumSum = 0;
  let darkPixels = 0;
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
      if (lum < DARK_LUMINANCE_THRESHOLD) darkPixels += 1;
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
    note: "Procedural scene selection + seeded RT4D path trace. NOT text-to-image / not diffusion. Archetypes (including tesseract-lattice) are abstract 4D primitive compositions, not photoreal or semantic synthesis.",
    prompt,
    prompt_hash: hashPromptToSeed(prompt),
    seed,
    scene: descriptor.scene,
    palette: descriptor.palette.name,
    material_type: descriptor.materialType,
    object_count: objectCount,
    composition,
    camera: { position, look_at: lookAt, fov_x: camera.fovX, fov_y: camera.fovY, fov_w: camera.fovW },
    width,
    height,
    samples,
    max_depth: maxDepth,
    bytes: png.length,
    sha256,
    mean_luminance: Number(meanLuminance.toFixed(3)),
    mean_luminance_center: Number(meanLuminanceCenter.toFixed(3)),
    dark_pixel_fraction: Number((darkPixels / (width * height)).toFixed(4)),
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
