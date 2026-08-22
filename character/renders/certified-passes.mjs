/**
 * Three certified projections of ONE CertifiedCharacterState:
 *   1. ENERGY / field pass  — field lines from ∇φ (proto reference kernel)
 *                             blended with bone tangents / mesh-flow, over a
 *                             faint structural wire. This is an energy/field
 *                             VISUALIZATION, not "4D physics": there is no
 *                             temporal derivative or motion history yet.
 *   2. CLAY_RIG pass        — neutral gray matte (GGX ~0.8 roughness stand-in),
 *                             topology + wire + bone markers, no PBR colour.
 *   3. BEAUTY pass          — material shading (skin/fur/fabric) with HDR-ish
 *                             key/fill/rim. It only SHADES structure that
 *                             already exists; it never invents geometry.
 *
 * This module is a "dumb executor": it takes the asset + precomputed field and
 * paints pixels. The certified state and every provenance hash are owned by
 * character/certified/state.mjs. No Math.random anywhere (determinism / P4).
 *
 * Reuses (read-only): the character PNG encoder (./png.mjs), the shader library
 * (../shaders/library.mjs), and the proto ∇φ operator
 * (../../mandala/proto/cpu-reference.mjs). RT4D (render-still.mjs) only supports
 * Hypersphere/Hyperplane/OrientedCapsule primitives and cannot shade a triangle
 * mesh, so these passes use the same deterministic CPU raster that already
 * produces char_wire/rig/final. A mesh→RT4D adapter is a declared future layer.
 *
 * STATUS: energy/clay/beauty raster — partial (deterministic CPU stand-in).
 */
import { encodePngRgba } from "./png.mjs";
import { shade, materialForRegion, MATERIALS, LIGHT_RIG } from "../shaders/library.mjs";
import { computeGradientInto } from "../../mandala/proto/cpu-reference.mjs";
import { PROTO_SHAPE, idx } from "../../mandala/proto/constitution.mjs";

// ---------------------------------------------------------------------------
// Small vector helpers (local, deterministic)
// ---------------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// ---------------------------------------------------------------------------
// Camera — eased ping-pong (mirrors the delivered Simulation Chamber easing
// `0.5 - 0.5*cos(2πNp)` with a stable look-at). Kept local because the chamber
// module is owned by another agent and is not on base main.
// ---------------------------------------------------------------------------
export function cameraForFrame(p, opts = {}) {
  const cycles = opts.cycles ?? 1;
  const eased = 0.5 - 0.5 * Math.cos(2 * Math.PI * cycles * p); // 0→1→0
  const yawMin = opts.yawMin ?? -0.7;
  const yawMax = opts.yawMax ?? 0.9;
  return {
    lookAt: opts.lookAt ?? [0, 1.05, 0],
    radius: opts.radius ?? 2.7,
    yaw: yawMin + (yawMax - yawMin) * eased,
  };
}

// ---------------------------------------------------------------------------
// Projection + raster primitives (mirror character/renders/presets.mjs so the
// three passes register with the existing char_wire/rig/final look).
// ---------------------------------------------------------------------------
function project(p, cam, w, h) {
  const x = p[0] - cam.lookAt[0];
  const y = p[1] - cam.lookAt[1];
  const z = p[2] - cam.lookAt[2];
  const cos = Math.cos(cam.yaw), sin = Math.sin(cam.yaw);
  const rx = x * cos + z * sin;
  const rz = -x * sin + z * cos;
  const depth = rz + cam.radius;
  const f = (h * 0.85) / Math.max(0.2, depth);
  return { x: w * 0.5 + rx * f, y: h * 0.62 - y * f, z: depth };
}

function setPixel(buf, w, h, x, y, r, g, b) {
  const xi = x | 0, yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= w || yi >= h) return;
  const i = (yi * w + xi) * 4;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
}

/** Additive splat (energy glow) — clamps at 255 via Uint8ClampedArray. */
function addPixel(buf, w, h, x, y, r, g, b) {
  const xi = x | 0, yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= w || yi >= h) return;
  const i = (yi * w + xi) * 4;
  buf[i] += r; buf[i + 1] += g; buf[i + 2] += b; buf[i + 3] = 255;
}

function drawLine(buf, zbuf, w, h, a, b, color, mode = "z") {
  const dx = b.x - a.x, dy = b.y - a.y;
  const steps = Math.max(2, Math.ceil(Math.hypot(dx, dy)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + dx * t, y = a.y + dy * t, z = a.z + (b.z - a.z) * t;
    const zi = (y | 0) * w + (x | 0);
    if (mode === "z") {
      if (zi < 0 || zi >= zbuf.length) continue;
      if (z > zbuf[zi] + 0.02) continue;
      zbuf[zi] = z;
      setPixel(buf, w, h, x, y, color[0], color[1], color[2]);
    } else {
      // additive glow — no z-test, brightens overlaps
      addPixel(buf, w, h, x, y, color[0], color[1], color[2]);
      addPixel(buf, w, h, x + 1, y, color[0] * 0.4, color[1] * 0.4, color[2] * 0.4);
      addPixel(buf, w, h, x, y + 1, color[0] * 0.4, color[1] * 0.4, color[2] * 0.4);
    }
  }
}

function fillTriangle(buf, zbuf, w, h, a, b, c, color) {
  const minX = Math.max(0, Math.min(a.x, b.x, c.x) | 0);
  const maxX = Math.min(w - 1, Math.max(a.x, b.x, c.x) | 0);
  const minY = Math.max(0, Math.min(a.y, b.y, c.y) | 0);
  const maxY = Math.min(h - 1, Math.max(a.y, b.y, c.y) | 0);
  const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (Math.abs(area) < 1e-6) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w0 = (b.x - x) * (c.y - y) - (b.y - y) * (c.x - x);
      const w1 = (c.x - x) * (a.y - y) - (c.y - y) * (a.x - x);
      const w2 = (a.x - x) * (b.y - y) - (a.y - y) * (b.x - x);
      const inside = area > 0 ? (w0 >= 0 && w1 >= 0 && w2 >= 0) : (w0 <= 0 && w1 <= 0 && w2 <= 0);
      if (!inside) continue;
      const z = (w0 * a.z + w1 * b.z + w2 * c.z) / area;
      const zi = y * w + x;
      if (z <= zbuf[zi]) {
        zbuf[zi] = z;
        const i = zi * 4;
        buf[i] = color[0]; buf[i + 1] = color[1]; buf[i + 2] = color[2]; buf[i + 3] = 255;
      }
    }
  }
}

function newFrame(w, h, bg) {
  const buf = new Uint8ClampedArray(w * h * 4);
  const zbuf = new Float32Array(w * h);
  zbuf.fill(1e9);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = bg[0]; buf[i * 4 + 1] = bg[1]; buf[i * 4 + 2] = bg[2]; buf[i * 4 + 3] = 255;
  }
  return { buf, zbuf };
}

const to255 = (c) => [
  Math.round(c[0] * 255),
  Math.round(c[1] * 255),
  Math.round(c[2] * 255),
];

// ---------------------------------------------------------------------------
// ENERGY field: build φ, take ∇φ from the proto reference kernel, integrate
// field lines blended with bone tangents. Deterministic (seeded integer hash).
// ---------------------------------------------------------------------------

/** Deterministic 0..1 hash for a lattice cell (no Math.random). */
function cellHash(x, y, z, seed) {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ x, 0x85ebca6b);
  h = Math.imul(h ^ y, 0xc2b2ae35);
  h = Math.imul(h ^ z, 0x27d4eb2f);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function meshBounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of positions) {
    for (let k = 0; k < 3; k++) {
      if (p[k] < min[k]) min[k] = p[k];
      if (p[k] > max[k]) max[k] = p[k];
    }
  }
  return { min, max };
}

/**
 * Build the certified field state: a scalar potential φ the character
 * "emanates" (Gaussian wells at bone joints) plus a small seeded perturbation,
 * then ∇φ via the proto reference kernel (computeGradientInto).
 *
 * Returns the raw grad field, a world↔lattice map, and a deterministic digest
 * used as worldStateHash.
 */
export function buildFieldState(asset, seed, opts = {}) {
  const shape = PROTO_SHAPE;
  const n = shape.cellCount;
  const phi = new Float32Array(n);
  const bounds = meshBounds(asset.mesh.positions);
  const margin = 3;
  const span = [
    Math.max(1e-3, bounds.max[0] - bounds.min[0]),
    Math.max(1e-3, bounds.max[1] - bounds.min[1]),
    Math.max(1e-3, bounds.max[2] - bounds.min[2]),
  ];
  const lo = [margin, margin, margin];
  const hi = [shape.nx - 1 - margin, shape.ny - 1 - margin, shape.nz - 1 - margin];
  const worldToLat = (p) => [
    lo[0] + ((p[0] - bounds.min[0]) / span[0]) * (hi[0] - lo[0]),
    lo[1] + ((p[1] - bounds.min[1]) / span[1]) * (hi[1] - lo[1]),
    lo[2] + ((p[2] - bounds.min[2]) / span[2]) * (hi[2] - lo[2]),
  ];

  const sigma = opts.sigma ?? 2.6;
  const amp = opts.amplitude ?? 1.0;
  const inv2s2 = 1 / (2 * sigma * sigma);
  const rad = Math.ceil(sigma * 3);
  // Splat negative Gaussian wells at bone heads (downhill −∇φ points at the rig).
  for (const bone of asset.armature.bones) {
    const c = worldToLat(bone.head);
    const cx = Math.round(c[0]), cy = Math.round(c[1]), cz = Math.round(c[2]);
    for (let z = Math.max(0, cz - rad); z <= Math.min(shape.nz - 1, cz + rad); z++) {
      for (let y = Math.max(0, cy - rad); y <= Math.min(shape.ny - 1, cy + rad); y++) {
        for (let x = Math.max(0, cx - rad); x <= Math.min(shape.nx - 1, cx + rad); x++) {
          const d2 = (x - c[0]) ** 2 + (y - c[1]) ** 2 + (z - c[2]) ** 2;
          phi[idx(x, y, z, shape)] -= amp * Math.exp(-d2 * inv2s2);
        }
      }
    }
  }
  // Small seeded perturbation (zero-ish mean); keeps worldStateHash seed-sensitive.
  const etaAmp = opts.etaAmplitude ?? 0.03;
  for (let z = 0; z < shape.nz; z++) {
    for (let y = 0; y < shape.ny; y++) {
      for (let x = 0; x < shape.nx; x++) {
        phi[idx(x, y, z, shape)] += (cellHash(x, y, z, seed) - 0.5) * etaAmp;
      }
    }
  }

  const grad = new Float32Array(n * 3);
  computeGradientInto(phi, grad, shape);

  return { shape, phi, grad, worldToLat, bounds, sigma };
}

function sampleGrad(grad, shape, lat) {
  const cx = Math.min(shape.nx - 1, Math.max(0, Math.round(lat[0])));
  const cy = Math.min(shape.ny - 1, Math.max(0, Math.round(lat[1])));
  const cz = Math.min(shape.nz - 1, Math.max(0, Math.round(lat[2])));
  const i = idx(cx, cy, cz, shape);
  return [grad[i * 3], grad[i * 3 + 1], grad[i * 3 + 2]];
}

/** Nearest bone segment tangent (bind pose) for a world point. */
function nearestBoneTangent(asset, p) {
  let best = null, bestD = Infinity;
  for (const b of asset.armature.bones) {
    const c = [(b.head[0] + b.tail[0]) / 2, (b.head[1] + b.tail[1]) / 2, (b.head[2] + b.tail[2]) / 2];
    const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
    if (d < bestD) { bestD = d; best = b; }
  }
  return norm(sub(best.tail, best.head));
}

/**
 * Integrate field lines: start at bone heads + a stride of mesh vertices, step
 * along a blend of −∇φ (field) and the local bone tangent (mesh-flow).
 */
export function buildFieldLines(asset, field, opts = {}) {
  const steps = opts.steps ?? 12;
  const stepLen = opts.stepLen ?? 0.045;
  const blend = opts.blend ?? 0.55; // weight on −∇φ vs bone tangent
  const vertStride = opts.vertStride ?? 6;

  const seeds = [];
  for (const b of asset.armature.bones) seeds.push(b.head.slice());
  const positions = asset.mesh.positions;
  for (let i = 0; i < positions.length; i += vertStride) seeds.push(positions[i].slice());

  const lines = [];
  for (const s0 of seeds) {
    let p = s0.slice();
    const line = [p.slice()];
    for (let k = 0; k < steps; k++) {
      const g = sampleGrad(field.grad, field.shape, field.worldToLat(p));
      const gd = norm([-g[0], -g[1], -g[2]]); // downhill −∇φ
      const t = nearestBoneTangent(asset, p);
      const dir = norm([
        gd[0] * blend + t[0] * (1 - blend),
        gd[1] * blend + t[1] * (1 - blend),
        gd[2] * blend + t[2] * (1 - blend),
      ]);
      p = [p[0] + dir[0] * stepLen, p[1] + dir[1] * stepLen, p[2] + dir[2] * stepLen];
      line.push(p.slice());
    }
    lines.push(line);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Material specs (spec-only; hashed by the certified state, not pixels)
// ---------------------------------------------------------------------------
export const ENERGY_MATERIAL = Object.freeze({
  id: "energy-field",
  model: "grad-phi+bone-tangent field lines",
  source: "mandala/proto/cpu-reference.mjs::computeGradientInto",
  emissive: [0.35, 0.95, 1.0],
  claim: "field-visualization",
  not: "4D-physics (no temporal derivative / motion history yet)",
});

export const CLAY_MATERIAL = Object.freeze({
  id: "clay",
  model: "neutral-gray GGX stand-in",
  roughness: 0.8,
  baseColor: [0.5, 0.5, 0.5],
  pbr: false,
  overlays: ["wire", "bone-markers"],
});

/** Beauty spec derived from the shader library + region mapping (shade-only). */
export function beautyMaterialSpec(asset) {
  const regions = [...new Set(asset.mesh.regions)].sort();
  const regionMaterials = {};
  for (const r of regions) regionMaterials[r] = materialForRegion(r, asset.species, "beauty").id;
  const rig = {};
  for (const [k, L] of Object.entries(LIGHT_RIG)) {
    rig[k] = { intensity: L.intensity, color: L.color, dir: L.dir.map((n) => Math.round(n * 1e4) / 1e4) };
  }
  return {
    id: "beauty",
    model: "key-fill-rim HDR-ish",
    shadeOnly: true,
    invents_geometry: false,
    lightRig: rig,
    regionMaterials,
  };
}

// ---------------------------------------------------------------------------
// The three passes — each returns { rgba, width, height }
// ---------------------------------------------------------------------------
export function renderEnergyPass(asset, field, lines, cam, w, h) {
  const { buf, zbuf } = newFrame(w, h, [4, 6, 12]);
  const proj = (p) => project(p, cam, w, h);
  // faint structural wire (the structure the energy rides on)
  for (const [a, b] of asset.edges) {
    drawLine(buf, zbuf, w, h, proj(asset.mesh.positions[a]), proj(asset.mesh.positions[b]), [26, 44, 66], "z");
  }
  // glowing ∇φ + bone-tangent field lines (additive)
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const t = i / Math.max(1, line.length - 1);
      const col = [40 + 120 * t, 150 + 90 * t, 190 + 60 * t]; // cyan → near-white tip
      drawLine(buf, zbuf, w, h, proj(line[i]), proj(line[i + 1]), col, "add");
    }
  }
  return { rgba: buf, width: w, height: h };
}

export function renderClayPass(asset, cam, w, h) {
  const { buf, zbuf } = newFrame(w, h, [20, 20, 24]);
  const proj = (p) => project(p, cam, w, h);
  const view = [Math.sin(cam.yaw), 0.2, Math.cos(cam.yaw)];
  const clay = { albedo: CLAY_MATERIAL.baseColor, roughness: CLAY_MATERIAL.roughness };
  const tris = asset.triangles;
  for (let i = 0; i < tris.length; i += 3) {
    const ia = tris[i], ib = tris[i + 1], ic = tris[i + 2];
    const n = asset.normals[ia];
    const col = shade(n, view, clay);
    fillTriangle(buf, zbuf, w, h,
      proj(asset.mesh.positions[ia]), proj(asset.mesh.positions[ib]), proj(asset.mesh.positions[ic]),
      to255(col));
  }
  // wire overlay (topology)
  for (const [a, b] of asset.edges) {
    drawLine(buf, zbuf, w, h, proj(asset.mesh.positions[a]), proj(asset.mesh.positions[b]), [70, 80, 95], "z");
  }
  // bone markers
  for (const bone of asset.armature.bones) {
    drawLine(buf, zbuf, w, h, proj(bone.head), proj(bone.tail), [255, 90, 70], "z");
    const j = proj(bone.head);
    setPixel(buf, w, h, j.x, j.y, 255, 220, 80);
    setPixel(buf, w, h, j.x + 1, j.y, 255, 220, 80);
    setPixel(buf, w, h, j.x, j.y + 1, 255, 220, 80);
  }
  return { rgba: buf, width: w, height: h };
}

export function renderBeautyPass(asset, sim, cam, w, h) {
  const { buf, zbuf } = newFrame(w, h, [18, 16, 22]);
  const proj = (p) => project(p, cam, w, h);
  const view = [Math.sin(cam.yaw), 0.2, Math.cos(cam.yaw)];
  const positions = asset.mesh.positions;
  const tris = asset.triangles;
  for (let i = 0; i < tris.length; i += 3) {
    const ia = tris[i], ib = tris[i + 1], ic = tris[i + 2];
    const n = asset.normals[ia];
    const region = asset.mesh.regions[Math.floor(i / 6)] || "torso";
    const mat = materialForRegion(region, asset.species, "beauty");
    const col = shade(n, view, mat);
    fillTriangle(buf, zbuf, w, h, proj(positions[ia]), proj(positions[ib]), proj(positions[ic]), to255(col));
  }
  // sim overlays — only structure that already exists (cloak / hair strands)
  if (sim) {
    for (const [a, b] of sim.cloakEdges) {
      drawLine(buf, zbuf, w, h, proj(a), proj(b), to255(shade([0, 0, 1], view, MATERIALS.fabric)), "z");
    }
    for (const curve of sim.hairCurves) {
      for (let i = 0; i < curve.length - 1; i++) {
        drawLine(buf, zbuf, w, h, proj(curve[i]), proj(curve[i + 1]), to255(shade([0, 1, 0], view, MATERIALS.fur)), "z");
      }
    }
  }
  return { rgba: buf, width: w, height: h };
}

/** Encode an RGBA frame to a PNG buffer (reuses the character PNG encoder). */
export function encodeFrame(frame) {
  return encodePngRgba(frame.width, frame.height, frame.rgba);
}
