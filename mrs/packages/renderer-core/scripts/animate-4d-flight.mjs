#!/usr/bin/env node
/**
 * animate-4d-flight — cinematic 4D → 3D flight animation.
 *
 * Runs the ConstitutionalRuntime (certified 4D geodesic + projection with
 * error bounds), then renders each step as a 3D-orbit camera frame using
 * node-canvas. Frames are written as PNGs and assembled into an MP4.
 *
 *   node scripts/animate-4d-flight.mjs [--frames 300] [--fps 30]
 *        [--width 1280] [--height 720] [--out output/animate-4d-flight]
 *        [--no-encode]
 */
import { createCanvas } from "canvas";
import { Command } from "commander";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { MetricTensor } from "../src/render/rt4d/constitutional/arena/MetricTensor.js";
import { FourVector } from "../src/render/rt4d/constitutional/tensor/index.js";
import { FourVelocity } from "../src/render/rt4d/constitutional/kinematics/index.js";
import { Camera4D, ProjectionPolicy } from "../src/render/rt4d/constitutional/projection/index.js";
import { createInitializedRuntime } from "../src/render/rt4d/constitutional/runtime/index.js";

const program = new Command();
program
  .name("animate-4d-flight")
  .description("Render a certified 4D→3D geodesic flight to frames + MP4")
  .option("--frames <n>", "number of steps / frames to render", (v) => parseInt(v, 10), 300)
  .option("--fps <n>", "frames per second for the MP4", (v) => parseInt(v, 10), 30)
  .option("--width <n>", "canvas width", (v) => parseInt(v, 10), 1280)
  .option("--height <n>", "canvas height", (v) => parseInt(v, 10), 720)
  .option("--out <dir>", "output directory (frames + mp4)", "output/animate-4d-flight")
  .option("--no-encode", "skip ffmpeg assembly");
program.parse(process.argv);
const opts = program.opts();

const DTAU = 0.03;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function formatSci(x) {
  if (!Number.isFinite(x) || x <= 0) return "0";
  return x.toExponential(1);
}

async function runFlight(frames) {
  const metric = MetricTensor.minkowski();
  const runtime = createInitializedRuntime({
    metricSignature: [-1, 1, 1, 1],
    c: 1,
    dtau: DTAU,
    d4: 4,
    camera: Camera4D.atOrigin(),
    projectionPolicy: ProjectionPolicy.perspective(4),
    position: new FourVector(0, 0, 0, 0, metric),
    velocity: new FourVelocity(new FourVector(1, 0.22, 0.09, 0.05, metric), metric).normalize(1),
    mass: 1.0,
    governance: { strictMode: false, requireReplay: false, requireAudit: false },
  });

  const trajectory = [];
  let maxPosErr = 0;
  let maxVelErr = 0;
  let maxProjResidual = 0;
  for (let i = 0; i < frames; i++) {
    const result = await runtime.step();
    const rec = result.provenance;
    const posErr = rec.positionCert?.errorBound?.max ?? 0;
    const velErr = rec.velocityCert?.errorBound?.max ?? 0;
    const projErr = rec.projection?.errorBound?.roundtripResidual ?? 0;
    maxPosErr = Math.max(maxPosErr, posErr);
    maxVelErr = Math.max(maxVelErr, velErr);
    maxProjResidual = Math.max(maxProjResidual, projErr);
    trajectory.push({
      t: result.step * DTAU,
      x: result.projection.x,
      y: result.projection.y,
      z: result.projection.z,
      posErr,
      velErr,
      projFinite: rec.projection?.errorBound?.finite ?? false,
    });
  }
  return { trajectory, maxPosErr, maxVelErr, maxProjResidual };
}

function vec(a, b) {
  return { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
}
function norm(v) {
  return Math.hypot(v.x, v.y, v.z);
}
function normed(v) {
  const n = norm(v) || 1;
  return { x: v.x / n, y: v.y / n, z: v.z / n };
}
function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function makeCamera(target, eye) {
  const f = normed(vec(eye, target));
  const r = normed(cross(f, { x: 0, y: 1, z: 0 }));
  const u = cross(r, f);
  return { eye, f, r, u };
}

function projectTo2D(p, cam, focal) {
  const v = vec(cam.eye, p);
  const z = dot(v, cam.f);
  if (z <= 0.15) return null;
  return { x: (dot(v, cam.r) * focal) / z, y: (dot(v, cam.u) * focal) / z, z };
}

function fitPoints(points, width, height, padding) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return { sx: 1, sy: 1, ox: width / 2, oy: height / 2 };
  const bw = maxX - minX;
  const bh = maxY - minY;
  const s = Math.min((width * (1 - 2 * padding)) / (bw || 1), (height * (1 - 2 * padding)) / (bh || 1), 2.4);
  return { sx: s, sy: s, ox: width / 2 - (minX + bw / 2) * s, oy: height / 2 - (minY + bh / 2) * s };
}

function applyFit(p, fit) {
  return { x: p.x * fit.sx + fit.ox, y: p.y * fit.sy + fit.oy };
}

function buildStars(rng, count) {
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rng(),
      y: rng(),
      r: 0.3 + rng() * 0.9,
      a: 0.15 + rng() * 0.5,
      layer: rng() < 0.7 ? 0 : 1,
    });
  }
  return stars;
}

function drawStars(ctx, width, height, stars, drift) {
  for (const s of stars) {
    const speed = s.layer === 0 ? 0.35 : 1.0;
    const x = (s.x + drift * speed) % 1;
    const y = (s.y + drift * 0.6 * speed) % 1;
    const px = ((x + 1) % 1) * width;
    const py = ((y + 1) % 1) * height;
    ctx.fillStyle = `rgba(214, 226, 255, ${s.a})`;
    ctx.beginPath();
    ctx.arc(px, py, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawVignette(ctx, width, height) {
  const g = ctx.createRadialGradient(width / 2, height / 2, height * 0.35, width / 2, height / 2, width * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

function drawTrail(ctx, trail2d) {
  const n = trail2d.length;
  for (let i = 1; i < n; i++) {
    const a = i / n;
    const p0 = trail2d[i - 1];
    const p1 = trail2d[i];
    if (!p0 || !p1) continue;
    ctx.strokeStyle = `rgba(96, 200, 255, ${0.05 + 0.5 * a})`;
    ctx.lineWidth = 0.5 + 2.6 * a;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
}

function drawGlow(ctx, p, color, coreColor, radius) {
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = coreColor;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawHud(ctx, width, height, frame, frames, t, velErr, projFinite) {
  ctx.fillStyle = "rgba(214, 226, 255, 0.6)";
  ctx.font = "12px Consolas, 'Courier New', monospace";
  const left = 24;
  ctx.fillText(`step ${String(frame + 1).padStart(4, "0")} / ${frames}   t = ${t.toFixed(2)} s`, left, height - 46);
  ctx.fillText(`certified 4D geodesic  ·  mass-shell |Δ| ≤ ${formatSci(velErr)}  ·  projection ${projFinite ? "finite" : "DEGENERATE"}`, left, height - 28);
  ctx.font = "15px Consolas, 'Courier New', monospace";
  ctx.fillStyle = "rgba(96, 200, 255, 0.8)";
  ctx.fillText("4D → 3D FLIGHT", left, 34);
  ctx.font = "11px Consolas, 'Courier New', monospace";
  ctx.fillStyle = "rgba(214, 226, 255, 0.4)";
  ctx.fillText("MRS ConstitutionalRuntime · Perspective projection", left, 52);
}

async function renderFrames({ trajectory }) {
  const frames = trajectory.length;
  const width = opts.width;
  const height = opts.height;
  const outDir = path.resolve(opts.out);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const rng = mulberry32(1337);
  const stars = buildStars(rng, 160);
  const focal = 0.9 * height;
  const TRAIL = 130;

  for (let frame = 0; frame < frames; frame++) {
    const cur = trajectory[frame];
    const camTarget = { x: cur.x, y: cur.y, z: cur.z };

    let extent = 1.2;
    for (let k = Math.max(0, frame - 40); k < frame; k++) {
      const p = trajectory[k];
      extent = Math.max(extent, norm(vec(camTarget, { x: p.x, y: p.y, z: p.z })));
    }
    const radius = Math.min(Math.max(2.2 * extent, 1.6), 14);
    const theta = frame * 0.012;
    const phi = 0.42 + 0.28 * Math.sin(frame * 0.016);
    const eye = {
      x: camTarget.x + radius * Math.cos(theta) * Math.cos(phi),
      y: camTarget.y + radius * Math.sin(phi),
      z: camTarget.z + radius * Math.sin(theta) * Math.cos(phi),
    };
    const cam = makeCamera(camTarget, eye);

    const pts2d = [];
    for (let k = Math.max(0, frame - TRAIL); k <= frame; k++) {
      const p = trajectory[k];
      const q = projectTo2D({ x: p.x, y: p.y, z: p.z }, cam, focal);
      pts2d.push(q);
    }
    const visible = pts2d.filter(Boolean);
    const fit = fitPoints(visible, width, height, 0.16);
    const mapped = pts2d.map((q) => (q ? applyFit(q, fit) : null));

    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, width, height);
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#0a0f16");
    bg.addColorStop(1, "#04060a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const drift = frame * 0.0006;
    drawStars(ctx, width, height, stars, drift);

    drawTrail(ctx, mapped);
    drawVignette(ctx, width, height);

    const tip = mapped[frame];
    if (tip) {
      drawGlow(ctx, tip, "rgba(120, 210, 255, 0.55)", "rgba(235, 246, 255, 1)", 18);
    }

    drawHud(ctx, width, height, frame, frames, cur.t, cur.velErr, cur.projFinite);

    const pad = String(frame).padStart(4, "0");
    const file = path.join(outDir, `frame-${pad}.png`);
    writeFileSync(file, canvas.toBuffer("image/png"));
    process.stdout.write(`\rframe ${frame + 1}/${frames}`);
  }
  process.stdout.write("\n");

  return outDir;
}

async function encode(outDir, frames) {
  if (opts.encode === false) return;
  const mp4 = path.join(outDir, "flight.mp4");
  const pattern = path.join(outDir, "frame-%04d.png");
  try {
    execFileSync("ffmpeg", [
      "-y",
      "-framerate", String(opts.fps),
      "-i", pattern,
      "-c:v", "libx264",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      mp4,
    ], { stdio: "inherit" });
    return mp4;
  } catch (err) {
    console.error("\nffmpeg encode failed:", err.message);
    return null;
  }
}

const { trajectory, maxPosErr, maxVelErr, maxProjResidual } = await runFlight(opts.frames);
console.log(`flight: ${trajectory.length} certified steps`);
console.log(`  max geodesic residual   = ${formatSci(maxPosErr)}`);
console.log(`  max mass-shell residual = ${formatSci(maxVelErr)}`);
console.log(`  max projection residual = ${formatSci(maxProjResidual)}`);

const outDir = await renderFrames({ trajectory, maxPosErr, maxVelErr, maxProjResidual });
const mp4 = await encode(outDir, trajectory.length);
if (mp4) console.log(`movie: ${mp4}`);
