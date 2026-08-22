/**
 * Temporal 4D Simulation Chamber path (partial).
 *
 * Demonstrates: space through time — animate M(t) → extrude motion solid
 * V={(x,w)|x∈M(t),w=t} → slide hyperplane along w → 3D frame sequence
 * + infographic multi-instance composite (t0…t4 in one image).
 *
 * Not a clinical medical device. Not photoreal. Soft-raster wire/fill only.
 *
 * Status: **partial**
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { rgbToPng } from "../png.mjs";
import {
  createTemporalExtrusion,
  evaluateSlice,
  TEMPORAL_EXTRUSION_STATUS,
  TEMPORAL_REMESHING_STATUS,
} from "../../../mrs/packages/renderer-core/src/math4d/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WATCH_TEMPLATE = join(__dirname, "watch-temporal.html");

export const TEMPORAL_4D_CHAMBER_STATUS = "partial";
export const TEMPORAL_4D_CHAMBER_CLAIM =
  "Temporal insight via slice + multi-instance composite — not clinical imaging, not photoreal PBR";

/** Phase labels matching the infographic beat (abstract organ, not medical claim). */
export const PHASE_LABELS = Object.freeze([
  "diastole",
  "early_systole",
  "mid_systole",
  "late_systole",
  "diastole",
]);

/**
 * Abstract organ-like mesh M(t): ellipsoid with a mid-cycle "narrowing" ring.
 * Matching topology for all t (remeshing still declared).
 *
 * @param {number} t - normalized time in [0,1] over one cycle
 * @param {{ rings?: number, segs?: number, seed?: number }} [opts]
 */
export function organMeshAtTime(t, opts = {}) {
  const rings = opts.rings ?? 10;
  const segs = opts.segs ?? 16;
  const phase = ((t % 1) + 1) % 1;
  // Pulse: larger at diastole (ends), smaller at mid-systole
  const pulse = 0.72 + 0.28 * Math.cos(phase * Math.PI * 2);
  // Narrowing feature peaks near late systole (~0.6–0.75) — temporal insight demo
  const narrowPeak = Math.exp(-Math.pow((phase - 0.65) / 0.12, 2));
  const narrow = 1 - 0.35 * narrowPeak;

  /** @type {{x:number,y:number,z:number}[]} */
  const vertices = [];
  /** @type {number[][]} */
  const faces = [];

  for (let i = 0; i <= rings; i++) {
    const v = i / rings;
    const theta = v * Math.PI;
    const y = Math.cos(theta);
    // Asymmetric "ventricle" bulge on +x
    const bulge = 1 + 0.18 * Math.sin(theta) * Math.sin(theta);
    for (let j = 0; j < segs; j++) {
      const u = j / segs;
      const phi = u * Math.PI * 2;
      let rx = 0.55 * pulse * bulge;
      let rz = 0.48 * pulse;
      // Circumferential narrowing band around equator
      const band = Math.exp(-Math.pow((v - 0.5) / 0.12, 2));
      rx *= 1 - band * (1 - narrow);
      rz *= 1 - band * (1 - narrow) * 0.85;
      const x = rx * Math.sin(theta) * Math.cos(phi);
      const z = rz * Math.sin(theta) * Math.sin(phi);
      vertices.push({ x, y: y * 0.7 * pulse, z });
    }
  }

  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * segs + j;
      const b = i * segs + ((j + 1) % segs);
      const c = (i + 1) * segs + j;
      const d = (i + 1) * segs + ((j + 1) % segs);
      faces.push([a, c, b], [b, c, d]);
    }
  }

  return {
    vertices,
    faces,
    phase,
    pulse,
    narrowStrength: narrowPeak,
    status: "partial",
  };
}

/**
 * Temporal color ramp (cyan → purple → red → orange) by phase ∈ [0,1].
 * @param {number} phase
 * @returns {{r:number,g:number,b:number}}
 */
export function phaseColor(phase) {
  const stops = [
    { t: 0, c: [0.25, 0.75, 0.95] },
    { t: 0.25, c: [0.45, 0.35, 0.85] },
    { t: 0.5, c: [0.85, 0.2, 0.45] },
    { t: 0.7, c: [0.95, 0.35, 0.15] },
    { t: 1, c: [0.95, 0.55, 0.2] },
  ];
  const p = Math.min(1, Math.max(0, phase));
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (p >= stops[i].t && p <= stops[i + 1].t) {
      a = stops[i];
      b = stops[i + 1];
      break;
    }
  }
  const u = (p - a.t) / (b.t - a.t || 1);
  return {
    r: a.c[0] + (b.c[0] - a.c[0]) * u,
    g: a.c[1] + (b.c[1] - a.c[1]) * u,
    b: a.c[2] + (b.c[2] - a.c[2]) * u,
  };
}

function phaseLabel(phase) {
  const idx = Math.min(PHASE_LABELS.length - 1, Math.floor(phase * (PHASE_LABELS.length - 0.001)));
  return PHASE_LABELS[idx];
}

/**
 * Soft-raster wire + flat triangles (FX-8350 friendly).
 * Supports reuse into a shared buffer for multi-instance composites.
 *
 * @param {{vertices:{x,y,z}[],faces:number[][]}} mesh
 * @param {{
 *   width:number, height:number, color:{r,g,b}, highlight?:boolean,
 *   rgb?: Uint8Array, zbuf?: Float32Array, clearBg?: boolean,
 *   cx?: number, cy?: number, scale?: number, yaw?: number,
 *   alpha?: number, wireOnly?: boolean, energyWire?: boolean,
 *   modelOffset?: {x?:number,y?:number,z?:number},
 * }} opts
 */
export function softRasterMesh(mesh, opts) {
  const W = opts.width;
  const H = opts.height;
  const rgb = opts.rgb ?? new Uint8Array(W * H * 3);
  const zbuf = opts.zbuf ?? new Float32Array(W * H);
  const clearBg = opts.clearBg !== false && !opts.rgb;
  if (clearBg) {
    zbuf.fill(1e9);
    for (let i = 0; i < W * H; i++) {
      const gy = Math.floor(i / W) / H;
      rgb[i * 3] = Math.floor(8 + gy * 12);
      rgb[i * 3 + 1] = Math.floor(10 + gy * 14);
      rgb[i * 3 + 2] = Math.floor(18 + gy * 22);
    }
  } else if (!opts.zbuf) {
    zbuf.fill(1e9);
  }

  const col = opts.color;
  const scale = opts.scale ?? Math.min(W, H) * 0.38;
  const cx = opts.cx ?? W * 0.5;
  const cy = opts.cy ?? H * 0.52;
  const yaw = opts.yaw ?? 0.55;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const alpha = Math.max(0, Math.min(1, opts.alpha ?? 1));
  const wireOnly = Boolean(opts.wireOnly || opts.energyWire);
  const energyWire = Boolean(opts.energyWire);
  const ox = opts.modelOffset?.x ?? 0;
  const oy = opts.modelOffset?.y ?? 0;
  const oz = opts.modelOffset?.z ?? 0;

  function project(v) {
    const vx = v.x + ox;
    const vy = v.y + oy;
    const vz = v.z + oz;
    const x = vx * cosY - vz * sinY;
    const z = vx * sinY + vz * cosY;
    const y = vy;
    const persp = 1.8 / (2.4 + z);
    return {
      X: cx + x * scale * persp,
      Y: cy - y * scale * persp,
      Z: z,
    };
  }

  const projected = mesh.vertices.map(project);

  function blendPut(o, r8, g8, b8, a) {
    if (a >= 0.99) {
      rgb[o] = r8;
      rgb[o + 1] = g8;
      rgb[o + 2] = b8;
      return;
    }
    rgb[o] = Math.min(255, Math.floor(rgb[o] * (1 - a) + r8 * a));
    rgb[o + 1] = Math.min(255, Math.floor(rgb[o + 1] * (1 - a) + g8 * a));
    rgb[o + 2] = Math.min(255, Math.floor(rgb[o + 2] * (1 - a) + b8 * a));
  }

  function put(px, py, z, r, g, b, wire) {
    const x = (px + 0.5) | 0;
    const y = (py + 0.5) | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (z > zbuf[i] + 1e-4 && !wire) return;
    if (wire) {
      if (z > zbuf[i] + 0.15) return;
    } else {
      zbuf[i] = z;
    }
    const o = i * 3;
    if (wire) {
      const boost = energyWire ? 1.35 : 1.15;
      blendPut(
        o,
        Math.min(255, Math.floor(r * 255 * boost)),
        Math.min(255, Math.floor(g * 255 * boost)),
        Math.min(255, Math.floor(b * 255 * boost)),
        alpha
      );
    } else {
      const shade = 0.45 + 0.55 * Math.max(0, Math.min(1, 0.5 - z * 0.25));
      blendPut(
        o,
        Math.min(255, Math.floor(r * 255 * shade)),
        Math.min(255, Math.floor(g * 255 * shade)),
        Math.min(255, Math.floor(b * 255 * shade)),
        alpha
      );
    }
  }

  function fillTri(pa, pb, pc, r, g, b) {
    const minX = Math.max(0, Math.floor(Math.min(pa.X, pb.X, pc.X)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(pa.X, pb.X, pc.X)));
    const minY = Math.max(0, Math.floor(Math.min(pa.Y, pb.Y, pc.Y)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(pa.Y, pb.Y, pc.Y)));
    const area = (pb.X - pa.X) * (pc.Y - pa.Y) - (pb.Y - pa.Y) * (pc.X - pa.X);
    if (Math.abs(area) < 1e-6) return;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w0 = ((pb.X - x) * (pc.Y - y) - (pb.Y - y) * (pc.X - x)) / area;
        const w1 = ((pc.X - x) * (pa.Y - y) - (pc.Y - y) * (pa.X - x)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * pa.Z + w1 * pb.Z + w2 * pc.Z;
        put(x, y, z, r, g, b, false);
      }
    }
  }

  function drawLine(pa, pb, r, g, b, bloom = 0) {
    const steps = Math.max(2, Math.hypot(pb.X - pa.X, pb.Y - pa.Y) | 0);
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const x = pa.X + (pb.X - pa.X) * u;
      const y = pa.Y + (pb.Y - pa.Y) * u;
      const z = pa.Z + (pb.Z - pa.Z) * u;
      put(x, y, z, r, g, b, true);
      if (bloom > 0) {
        for (let dy = -bloom; dy <= bloom; dy++) {
          for (let dx = -bloom; dx <= bloom; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (dx * dx + dy * dy > bloom * bloom) continue;
            put(x + dx, y + dy, z + 0.02, r * 0.55, g * 0.55, b * 0.55, true);
          }
        }
      }
    }
  }

  const hr = opts.highlight ? 1.25 : 1;
  const bloom = energyWire ? 1 : 0;
  for (const f of mesh.faces ?? []) {
    if (f.length < 3) continue;
    const a = projected[f[0]];
    const b = projected[f[1]];
    const c = projected[f[2]];
    if (!a || !b || !c) continue;
    if (!wireOnly) {
      fillTri(a, b, c, col.r * 0.55 * hr, col.g * 0.55 * hr, col.b * 0.55 * hr);
    }
    drawLine(a, b, col.r * hr, col.g * hr, col.b * hr, bloom);
    drawLine(b, c, col.r * hr, col.g * hr, col.b * hr, bloom);
    drawLine(c, a, col.r * hr, col.g * hr, col.b * hr, bloom);
  }

  return { width: W, height: H, rgb, zbuf };
}

/** Tiny 3×5 glyphs for t0…t9 and a few letters (infographic labels). */
const GLYPHS = Object.freeze({
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  t: ["111", "010", "010", "010", "010"],
  i: ["010", "000", "010", "010", "010"],
  n: ["000", "110", "101", "101", "101"],
  s: ["011", "100", "010", "001", "110"],
  g: ["011", "100", "101", "101", "011"],
  h: ["101", "101", "111", "101", "101"],
  "!": ["010", "010", "010", "000", "010"],
  " ": ["000", "000", "000", "000", "000"],
});

function stampGlyph(rgb, W, H, ch, x0, y0, color, scale = 1) {
  const g = GLYPHS[ch];
  if (!g) return 3 * scale + 1;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      if (g[row][col] !== "1") continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = x0 + col * scale + dx;
          const y = y0 + row * scale + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const o = (y * W + x) * 3;
          rgb[o] = color[0];
          rgb[o + 1] = color[1];
          rgb[o + 2] = color[2];
        }
      }
    }
  }
  return 3 * scale + scale;
}

function stampText(rgb, W, H, text, x0, y0, color, scale = 1) {
  let x = x0;
  for (const ch of text) {
    x += stampGlyph(rgb, W, H, ch, x, y0, color, scale);
  }
}

function fillBg(rgb, W, H) {
  for (let i = 0; i < W * H; i++) {
    const gy = Math.floor(i / W) / H;
    const gx = (i % W) / W;
    rgb[i * 3] = Math.floor(6 + gy * 10 + gx * 4);
    rgb[i * 3 + 1] = Math.floor(8 + gy * 12 + gx * 3);
    rgb[i * 3 + 2] = Math.floor(16 + gy * 20 + (1 - gx) * 6);
  }
}

function drawRing(rgb, W, H, cx, cy, r0, r1, color, alpha = 0.85) {
  const minX = Math.max(0, Math.floor(cx - r1 - 1));
  const maxX = Math.min(W - 1, Math.ceil(cx + r1 + 1));
  const minY = Math.max(0, Math.floor(cy - r1 - 1));
  const maxY = Math.min(H - 1, Math.ceil(cy + r1 + 1));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < r0 || d > r1) continue;
      const o = (y * W + x) * 3;
      rgb[o] = Math.min(255, Math.floor(rgb[o] * (1 - alpha) + color[0] * alpha));
      rgb[o + 1] = Math.min(255, Math.floor(rgb[o + 1] * (1 - alpha) + color[1] * alpha));
      rgb[o + 2] = Math.min(255, Math.floor(rgb[o + 2] * (1 - alpha) + color[2] * alpha));
    }
  }
}

/**
 * Infographic-style temporal composite: t0…tN instances in one frame,
 * phase-colored cyan→orange, with mid/late-cycle insight highlight.
 *
 * Status: **partial** — soft-raster multi-instance smear, not Mythar holo / clinical.
 *
 * @param {{
 *   phases?: number[],
 *   width?: number,
 *   height?: number,
 *   rings?: number,
 *   segs?: number,
 *   energyWire?: boolean,
 * }} [opts]
 */
export function renderTemporalComposite(opts = {}) {
  const phases =
    opts.phases ??
    [0, 0.25, 0.5, 0.65, 1];
  const W = Math.min(512, opts.width ?? 480);
  const H = Math.min(512, opts.height ?? 256);
  const rings = opts.rings ?? 8;
  const segs = opts.segs ?? 12;
  const energyWire = Boolean(opts.energyWire);
  const rgb = new Uint8Array(W * H * 3);
  const zbuf = new Float32Array(W * H);
  zbuf.fill(1e9);
  fillBg(rgb, W, H);

  // Phase legend strip (top)
  for (let x = 24; x < W - 24; x++) {
    const u = (x - 24) / (W - 48);
    const c = phaseColor(u);
    for (let y = 8; y <= 14; y++) {
      const o = (y * W + x) * 3;
      rgb[o] = Math.floor(c.r * 220);
      rgb[o + 1] = Math.floor(c.g * 220);
      rgb[o + 2] = Math.floor(c.b * 220);
    }
  }

  const n = phases.length;
  /** @type {{phase:number,cx:number,cy:number,narrow:number,label:string,insight:boolean,u:number,mesh:ReturnType<typeof organMeshAtTime>}[]} */
  const staged = [];
  let insightIdx = 0;
  let maxNarrow = -1;

  // Pass 1 — sample meshes + find late-cycle narrowing peak (temporal insight)
  for (let i = 0; i < n; i++) {
    const phase = phases[i];
    const mesh = organMeshAtTime(phase, { rings, segs });
    if (mesh.narrowStrength > maxNarrow) {
      maxNarrow = mesh.narrowStrength;
      insightIdx = i;
    }
    const u = n === 1 ? 0.5 : i / (n - 1);
    staged.push({
      phase,
      cx: W * (0.12 + u * 0.76),
      cy: H * (0.58 - Math.sin(u * Math.PI) * 0.08),
      narrow: mesh.narrowStrength,
      label: phaseLabel(phase),
      insight: false,
      u,
      mesh,
    });
  }
  staged[insightIdx].insight = true;

  // Pass 2 — draw back-to-front (earlier phases first = temporal smear stack)
  for (let i = 0; i < n; i++) {
    const s = staged[i];
    const scale = Math.min(W, H) * (0.22 + (i === insightIdx ? 0.03 : 0));
    const alpha = 0.42 + s.u * 0.55;
    const color = phaseColor(s.phase);
    softRasterMesh(s.mesh, {
      width: W,
      height: H,
      rgb,
      zbuf,
      clearBg: false,
      color,
      highlight: s.narrow > 0.45,
      cx: s.cx,
      cy: s.cy,
      scale,
      yaw: 0.45 + s.u * 0.25,
      alpha,
      wireOnly: energyWire,
      energyWire,
      modelOffset: { x: (s.u - 0.5) * 0.15, z: (0.5 - s.u) * 0.2 },
    });
  }

  const placed = staged;
  const insight = placed[insightIdx];
  const ic = phaseColor(insight.phase);
  drawRing(
    rgb,
    W,
    H,
    insight.cx,
    insight.cy - 4,
    Math.min(W, H) * 0.15,
    Math.min(W, H) * 0.18,
    [Math.floor(ic.r * 255), Math.floor(ic.g * 255), Math.floor(ic.b * 255)],
    0.75
  );
  // Callout stem + label
  const callX = Math.min(W - 70, Math.floor(insight.cx + 18));
  const callY = Math.max(22, Math.floor(insight.cy - Math.min(W, H) * 0.22));
  for (let s = 0; s < 18; s++) {
    const x = Math.floor(insight.cx + 8 + s * 0.7);
    const y = Math.floor(insight.cy - 10 - s);
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const o = (y * W + x) * 3;
    rgb[o] = 255;
    rgb[o + 1] = 210;
    rgb[o + 2] = 120;
  }
  stampText(rgb, W, H, "insight!", callX, callY, [255, 220, 140], 2);

  // Per-instance t# labels under each
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    const c = phaseColor(p.phase);
    const label = `t${i}`;
    const lx = Math.floor(p.cx - 6);
    const ly = Math.min(H - 14, Math.floor(p.cy + Math.min(W, H) * 0.2));
    stampText(
      rgb,
      W,
      H,
      label,
      lx,
      ly,
      [
        Math.floor(c.r * 230),
        Math.floor(c.g * 230),
        Math.floor(c.b * 230),
      ],
      2
    );
  }

  return {
    width: W,
    height: H,
    rgb,
    phases,
    insightIndex: insightIdx,
    insightPhase: insight.phase,
    insightNarrow: +insight.narrow.toFixed(4),
    status: "partial",
    style: energyWire ? "temporal-composite-energy-wire" : "temporal-composite",
    note:
      "Multi-instance temporal smear in one frame (infographic). Soft-raster only — not Mythar holo, not clinical.",
  };
}

/**
 * Draw a small time-axis strip of prior silhouette dots (infographic-style smear hint).
 */
function stampTimelineStrip(rgb, W, H, frameIndex, frameCount, color) {
  const y0 = H - 18;
  for (let i = 0; i <= frameIndex; i++) {
    const x = 12 + Math.floor((i / Math.max(1, frameCount - 1)) * (W - 24));
    const o = (y0 * W + x) * 3;
    if (o < 0 || o + 2 >= rgb.length) continue;
    const u = i / Math.max(1, frameCount - 1);
    const c = phaseColor(u);
    rgb[o] = Math.floor(c.r * 220);
    rgb[o + 1] = Math.floor(c.g * 220);
    rgb[o + 2] = Math.floor(c.b * 220);
  }
  // current marker
  const xm = 12 + Math.floor((frameIndex / Math.max(1, frameCount - 1)) * (W - 24));
  for (let dy = -3; dy <= 3; dy++) {
    const o = ((y0 + dy) * W + xm) * 3;
    if (o < 0 || o + 2 >= rgb.length) continue;
    rgb[o] = Math.floor(color.r * 255);
    rgb[o + 1] = Math.floor(color.g * 255);
    rgb[o + 2] = Math.floor(color.b * 255);
  }
}

/**
 * Try a short mp4 from the PNG sequence (optional; skips if ffmpeg missing).
 * @param {string} framesDir
 * @param {string[]} pngNames
 * @param {string} outMp4
 */
function tryEncodeMp4(framesDir, pngNames, outMp4) {
  try {
    const listPath = join(framesDir, "_concat.txt");
    writeFileSync(
      listPath,
      pngNames.map((n) => `file '${n.replace(/'/g, "'\\''")}'`).join("\n") + "\n"
    );
    const r = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-r",
        "4",
        "-i",
        listPath,
        "-pix_fmt",
        "yuv420p",
        "-c:v",
        "libx264",
        "-crf",
        "28",
        outMp4,
      ],
      { encoding: "utf8" }
    );
    if (r.status === 0) {
      return { ok: true, path: outMp4.split(/[/\\]/).pop() || "composite-sequence.mp4" };
    }
    return { ok: false, reason: (r.stderr || r.error || "ffmpeg-failed").toString().slice(0, 200) };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e).slice(0, 200) };
  }
}

/**
 * Run temporal 4D chamber demo.
 *
 * @param {{
 *   sceneCard?: object,
 *   outDir: string,
 *   width?: number,
 *   height?: number,
 *   frames?: number,
 *   keyframes?: number,
 *   rings?: number,
 *   segs?: number,
 *   sliceMode?: "slide"|"orbit"|"static",
 *   compositeWidth?: number,
 *   compositeHeight?: number,
 *   skipMp4?: boolean,
 * }} opts
 */
export async function runTemporal4dChamber(opts) {
  const outDir = opts.outDir;
  const width = opts.width ?? 320;
  const height = opts.height ?? 240;
  const frameCount = opts.frames ?? 8;
  const keyCount = opts.keyframes ?? 5;
  const rings = opts.rings ?? 10;
  const segs = opts.segs ?? 16;
  const sliceMode = opts.sliceMode ?? "slide";
  const compositeWidth = opts.compositeWidth ?? 480;
  const compositeHeight = opts.compositeHeight ?? 256;

  mkdirSync(outDir, { recursive: true });
  const framesDir = join(outDir, "frames");
  mkdirSync(framesDir, { recursive: true });

  const t0wall = performance.now();
  const keyTimes = [];
  for (let i = 0; i < keyCount; i++) keyTimes.push(i / Math.max(1, keyCount - 1));

  const meshAtTime = (t) => organMeshAtTime(t, { rings, segs });
  const te = createTemporalExtrusion({ meshAtTime });
  const solid = te.extrudePath(keyTimes);
  const vertsPerFrame = meshAtTime(0).vertices.length;

  const frameMeta = [];
  const pngNames = [];

  for (let f = 0; f < frameCount; f++) {
    const u = frameCount === 1 ? 0 : f / (frameCount - 1);
    // Slide hyperplane along time axis: n=ê_w, d = u
    const slice = evaluateSlice(
      {
        mode: sliceMode === "orbit" ? "orbit" : "slide",
        normal: { x: 0, y: 0, z: 0, w: 1 },
        offset: 0,
        slideSpeed: 1,
        orbitSpeed: 0.4,
      },
      u
    );
    const w = sliceMode === "slide" ? slice.offset : u;
    const sliced = te.sliceAtW(solid, w, { times: keyTimes, vertsPerFrame });
    // Prefer slice of motion solid; fall back to direct M(t) if empty
    const mesh =
      sliced.vertices.length > 0
        ? sliced
        : meshAtTime(w);
    const phase = ((w % 1) + 1) % 1;
    const color = phaseColor(phase);
    const narrow = organMeshAtTime(phase, { rings, segs }).narrowStrength;
    const img = softRasterMesh(mesh, {
      width,
      height,
      color,
      highlight: narrow > 0.45,
    });
    stampTimelineStrip(img.rgb, width, height, f, frameCount, color);

    const name = `frame-${String(f).padStart(4, "0")}.png`;
    writeFileSync(join(framesDir, name), rgbToPng(img.width, img.height, img.rgb));
    pngNames.push(name);

    // Lightweight bin sidecar: count + t + packed xyz (partial chamber compatibility)
    const binName = `frame-${String(f).padStart(6, "0")}.bin`;
    const n = mesh.vertices.length;
    const header = Buffer.alloc(64);
    header.writeUInt32LE(n, 0);
    header.writeUInt32LE(f, 4);
    header.writeFloatLE(1, 8);
    header.writeFloatLE(1, 24);
    header.writeFloatLE(1, 40);
    const body = Buffer.alloc(n * 3 * 4);
    for (let i = 0; i < n; i++) {
      const v = mesh.vertices[i];
      body.writeFloatLE(v.x, i * 12);
      body.writeFloatLE(v.y, i * 12 + 4);
      body.writeFloatLE(v.z, i * 12 + 8);
    }
    writeFileSync(join(framesDir, binName), Buffer.concat([header, body]));

    frameMeta.push({
      index: f,
      w,
      phase,
      phaseLabel: phaseLabel(phase),
      narrowStrength: +narrow.toFixed(4),
      png: name,
      bin: binName,
      vertexCount: n,
      faceCount: mesh.faces?.length ?? 0,
      sliceMode: slice.mode,
      insightHighlight: narrow > 0.45,
    });
  }

  // Infographic composite: t0…t4 in ONE image (closes sequence-only gap)
  const compositePhases = keyTimes.length >= 5
    ? keyTimes.slice(0, 5)
    : [0, 0.25, 0.5, 0.65, 1];
  // Ensure late-systole insight sample (~0.65) is present
  if (!compositePhases.some((p) => Math.abs(p - 0.65) < 0.08)) {
    compositePhases[Math.min(3, compositePhases.length - 1)] = 0.65;
  }

  const composite = renderTemporalComposite({
    phases: compositePhases,
    width: compositeWidth,
    height: compositeHeight,
    rings: Math.min(rings, 8),
    segs: Math.min(segs, 12),
    energyWire: false,
  });
  writeFileSync(
    join(outDir, "composite.png"),
    rgbToPng(composite.width, composite.height, composite.rgb)
  );

  // Optional stretch: energy-wire style composite (partial — not full holo COMPOSITE EGT)
  const compositeWire = renderTemporalComposite({
    phases: compositePhases,
    width: Math.min(512, compositeWidth),
    height: Math.min(512, compositeHeight),
    rings: Math.min(rings, 8),
    segs: Math.min(segs, 12),
    energyWire: true,
  });
  writeFileSync(
    join(outDir, "composite-energy-wire.png"),
    rgbToPng(compositeWire.width, compositeWire.height, compositeWire.rgb)
  );

  let mp4 = { ok: false, reason: "skipped" };
  if (!opts.skipMp4) {
    mp4 = tryEncodeMp4(framesDir, pngNames, join(outDir, "composite-sequence.mp4"));
  }

  const wallMs = performance.now() - t0wall;
  const receipt = {
    status: TEMPORAL_4D_CHAMBER_STATUS,
    claim: TEMPORAL_4D_CHAMBER_CLAIM,
    tagline: "We don't just render space. We render space through time.",
    disclaimer:
      "Abstract temporal demo for Simulation Chamber. Not a medical device. " +
      "Not photoreal. Not clinical diagnostic imaging. Temporal insight via hyperplane slice " +
      "+ multi-instance infographic composite only.",
    scene: opts.sceneCard?.id ?? "scene-temporal-4d",
    math4d: {
      temporalExtrusion: TEMPORAL_EXTRUSION_STATUS,
      remeshing: TEMPORAL_REMESHING_STATUS,
      solidVertices: solid.vertices?.length ?? 0,
      solidTets: solid.tets?.length ?? 0,
      keyTimes,
      vertsPerFrame,
    },
    frames: frameMeta,
    composite: {
      png: "composite.png",
      energyWirePng: "composite-energy-wire.png",
      width: composite.width,
      height: composite.height,
      phases: composite.phases,
      insightIndex: composite.insightIndex,
      insightPhase: composite.insightPhase,
      insightNarrow: composite.insightNarrow,
      style: composite.style,
      status: "partial",
      note: composite.note,
      energyWireStatus: "partial",
      energyWireNote:
        "Soft-raster energy-wire bloom on organ mesh — not Mythar holo COMPOSITE / EGT boundary path.",
    },
    mp4: mp4.ok
      ? { file: "composite-sequence.mp4", status: "partial" }
      : { status: "skipped", reason: mp4.reason },
    width,
    height,
    frameCount,
    wallMs: +wallMs.toFixed(1),
    codec: "png+raw-xyz-bin+composite",
    watch: "watch.html",
    enforced: [
      "math4d slice mode dispatch (slide/orbit)",
      "prismatic extrudeBetween matching topology",
      "sliceExtrudedAtW interpolation of motion solid",
    ],
    partial: [
      "soft-raster (not RT4D/PBR)",
      "abstract organ mesh (not anatomy SoT)",
      "bin layout simplified vs holo raw-float32",
      "infographic multi-instance temporal composite (one frame)",
      "energy-wire composite style (not full holo COMPOSITE)",
      "temporal remeshing declared",
    ],
    declared: [
      "non-matching topology remeshing",
      "clinical/medical imaging",
      "Mythar holographic appearance path",
    ],
    beforeAfter: {
      before: "Sequence-only: one slice M(w) per PNG — no multi-instance smear in one frame",
      after:
        "composite.png places t0…t4 spatially with cyan→orange phase coloring + insight callout on late-cycle narrowing",
    },
  };

  const receiptHash = createHash("sha256")
    .update(
      JSON.stringify({
        scene: receipt.scene,
        frames: frameMeta.map((f) => f.png),
        composite: receipt.composite.png,
      })
    )
    .digest("hex")
    .slice(0, 16);
  receipt.evidenceId = `temporal4d-${receiptHash}`;

  writeFileSync(join(outDir, "receipt.json"), JSON.stringify(receipt, null, 2));
  writeFileSync(
    join(outDir, "meta.json"),
    JSON.stringify(
      {
        codec: "png-sequence+composite",
        frameCount,
        width,
        height,
        frames: pngNames,
        composite: "composite.png",
        compositeEnergyWire: "composite-energy-wire.png",
        mp4: mp4.ok ? "composite-sequence.mp4" : null,
        insightPhase: composite.insightPhase,
        status: TEMPORAL_4D_CHAMBER_STATUS,
        note: TEMPORAL_4D_CHAMBER_CLAIM,
        view: "composite",
      },
      null,
      2
    )
  );

  writeFileSync(
    join(outDir, "README.md"),
    [
      "# Temporal 4D Chamber Demo (partial)",
      "",
      "> We don't just render space. We render space through time.",
      "",
      "## What this is",
      "",
      "- Animated abstract organ-like mesh `M(t)`",
      "- Temporal extrusion into motion solid `V={(x,w)|x∈M(t), w=t}` (math4d)",
      "- Hyperplane **slide** along the time axis → PNG sequence `t0…tn`",
      "- **Infographic composite** — t0…t4 in one image, cyan→orange, insight highlight",
      "- Soft-raster wire/fill — **not** photoreal, **not** a medical device",
      "",
      "## Before / after",
      "",
      "| | |",
      "|---|---|",
      "| Before | Sequence-only slices — no multi-instance temporal smear in one frame |",
      "| After | `composite.png` spatial t0…t4 + late-cycle narrowing callout |",
      "",
      "## Run",
      "",
      "```bash",
      "node scripts/simulation-chamber-temporal.mjs scene-temporal-4d --out output/simulation/temporal-4d-demo",
      "```",
      "",
      "## Outputs",
      "",
      `- frames/: ${frameCount} PNG + companion .bin`,
      "- composite.png — infographic multi-instance (primary deliverable)",
      "- composite-energy-wire.png — partial energy-wire style (not full holo)",
      "- receipt.json — honest status / disclaimer",
      "- watch.html — composite + sequence viewer",
      "",
      "## Status",
      "",
      `| Item | Tag |`,
      `|------|-----|`,
      `| Chamber path | **partial** |`,
      `| Temporal extrusion | **partial** |`,
      `| Infographic composite | **partial** |`,
      `| Energy-wire composite | **partial** |`,
      `| Mythar holo look | **declared** |`,
      `| Remeshing | **declared** |`,
      `| Clinical imaging | **declared** (out of scope) |`,
      "",
    ].join("\n")
  );

  if (existsSync(WATCH_TEMPLATE)) {
    copyFileSync(WATCH_TEMPLATE, join(outDir, "watch.html"));
  }

  return {
    ok: true,
    outDir,
    frameCount,
    receipt,
    wallMs,
    composite,
  };
}
