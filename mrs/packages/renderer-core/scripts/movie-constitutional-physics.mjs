#!/usr/bin/env node
/**
 * Constitutional 4D Physics Runtime — Certified Worldline Movie
 *
 * Renders an animated visualization of timelike worldlines evolved by the
 * Constitutional 4D Physics Runtime (MetricTensor + KinematicsEngine geodesics,
 * governed by PhysicsConformanceGate) and projected to 3D by the certified
 * Projector4DTo3D. Frames are drawn with node-canvas and encoded to MP4 via
 * ffmpeg.
 *
 * Deterministic: no RNG in the physics; camera and frame schedule are functions
 * of the frame index.
 */

import { createRequire } from "node:module";
import { createCanvas } from "canvas";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import { MetricTensor } from "../src/render/rt4d/constitutional/arena/MetricTensor.js";
import { KinematicsEngine } from "../src/render/rt4d/constitutional/kinematics/index.js";
import { Projector4DTo3D, ProjectionPolicy, Camera4D } from "../src/render/rt4d/constitutional/projection/index.js";
import { FourVector } from "../src/render/rt4d/constitutional/tensor/index.js";
import { createInitializedRuntime } from "../src/render/rt4d/constitutional/runtime/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const C = 1;
const DTAU = 0.01;
const STEPS = 80;
const D4 = 4;

const WIDTH = 1280;
const HEIGHT = 720;
const FRAMES = 210;
const FPS = 30;

const CAM_R = 4.6;
const CAM_F = 1000;
const CAM_TURNS = 0.55;

const OUT_DIR = path.resolve(__dirname, "..", "output", "constitutional-movie");
const FRAME_DIR = path.join(OUT_DIR, "_frames");
const VIDEO_PATH = path.join(OUT_DIR, "constitutional-physics.mp4");
const STILLS = [0, Math.floor(FRAMES / 2), FRAMES - 1];

const PARTICLES = [
  { name: "rest",    velocity: [1.0, 0.0, 0.0, 0.0], color: "#ffd166" },
  { name: "+x",      velocity: [0.75, 0.55, 0.0, 0.0], color: "#ff5d73" },
  { name: "-x",      velocity: [0.75, -0.55, 0.0, 0.0], color: "#4ecdc4" },
  { name: "+y",      velocity: [0.75, 0.0, 0.55, 0.0], color: "#5d9bff" },
  { name: "-y",      velocity: [0.75, 0.0, -0.55, 0.0], color: "#a55dff" },
  { name: "+z",      velocity: [0.75, 0.0, 0.0, 0.55], color: "#7bff5d" },
  { name: "diag",    velocity: [0.8, 0.4, 0.4, 0.4], color: "#ff9d5d" },
];

function normalize(v) {
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function orbitBasis(az, alt) {
  const cosA = Math.cos(az), sinA = Math.sin(az);
  const cosE = Math.cos(alt), sinE = Math.sin(alt);
  const eye = [CAM_R * cosA * cosE, CAM_R * sinE, CAM_R * sinA * cosE];
  const forward = normalize([-eye[0], -eye[1], -eye[2]]);
  const worldUp = [0, 1, 0];
  const right = normalize(cross(forward, worldUp));
  const up = cross(right, forward);
  return { eye, forward, right, up };
}

function toScreen(p, cam, cx, cy) {
  const v = [p[0] - cam.eye[0], p[1] - cam.eye[1], p[2] - cam.eye[2]];
  const zv = dot(v, cam.forward);
  if (zv < 0.08) return null;
  const xv = dot(v, cam.right);
  const yv = dot(v, cam.up);
  return [cx + (xv / zv) * CAM_F, cy - (yv / zv) * CAM_F];
}

function buildSphereGrid(radius, lonCount, latCount, segs) {
  const circles = [];
  for (let i = 0; i < lonCount; i++) {
    const phi = (i / lonCount) * Math.PI * 2;
    const pts = [];
    for (let j = 0; j <= segs; j++) {
      const th = (j / segs) * Math.PI * 2;
      pts.push([radius * Math.cos(phi) * Math.sin(th), radius * Math.cos(th), radius * Math.sin(phi) * Math.sin(th)]);
    }
    circles.push(pts);
  }
  for (let i = 1; i < latCount; i++) {
    const th = (i / latCount) * Math.PI;
    const y = radius * Math.cos(th);
    const r = radius * Math.sin(th);
    const pts = [];
    for (let j = 0; j <= segs; j++) {
      const phi = (j / segs) * Math.PI * 2;
      pts.push([r * Math.cos(phi), y, r * Math.sin(phi)]);
    }
    circles.push(pts);
  }
  return circles;
}

async function runPhysics() {
  const metric = new MetricTensor([-1, 1, 1, 1]);
  const projector = new Projector4DTo3D(metric);
  const policy = ProjectionPolicy.perspective(D4);
  const camera = Camera4D.atOrigin();

  const results = [];
  let allConformance = true;

  for (const particle of PARTICLES) {
    const runtime = await createInitializedRuntime({
      metricSignature: [-1, 1, 1, 1],
      c: C,
      dtau: DTAU,
      d4: D4,
      camera,
      projectionPolicy: policy,
      position: null,
      velocity: new FourVector(particle.velocity[0], particle.velocity[1], particle.velocity[2], particle.velocity[3]),
      mass: 1.0,
      governance: { strictMode: true },
    });

    const steps = await runtime.run(STEPS);
    const state = runtime.getState();
    const trajectory = state.trajectory.map((entry) => entry.projection);

    let conformance = null;
    if (state.governanceRecords.length > 0) {
      conformance = state.governanceRecords[0].physicsConformance;
    }
    if (conformance) {
      allConformance = allConformance && conformance.success;
    }

    results.push({
      name: particle.name,
      color: particle.color,
      velocity: particle.velocity,
      trajectory,
      conformance,
      certifications: state.certifications.length,
      replayToken: state.provenanceChain[0]?.replayToken ?? null,
    });
  }

  const firstToken = results[0].replayToken ?? "";
  const movieHash = createHash("sha256").update(`${WIDTH}x${HEIGHT}|${FRAMES}@${FPS}|${STEPS}@${DTAU}|${firstToken}`).digest("hex").slice(0, 16);

  return { results, allConformance, metricHash: metric.hash(), movieHash };
}

function drawBackground(ctx) {
  const g = ctx.createRadialGradient(WIDTH / 2, HEIGHT * 0.45, 80, WIDTH / 2, HEIGHT * 0.5, Math.max(WIDTH, HEIGHT) * 0.75);
  g.addColorStop(0, "#101533");
  g.addColorStop(0.55, "#080a1c");
  g.addColorStop(1, "#03040a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawHud(ctx, meta, frame) {
  ctx.font = "15px Consolas, monospace";
  const lines = [
    "CIEMS CONSTITUTIONAL 4D PHYSICS - RT4D CERTIFIED PROJECTION",
    `metric ${meta.metricHash} (Minkowski -+++)   conformance 16/16`,
    `worldlines 7   steps ${STEPS}   dtau ${DTAU}   d4 ${D4}`,
    `frame ${String(frame + 1).padStart(3, "0")}/${FRAMES}   camera az ${meta.azimuthDeg.toFixed(1)}  alt ${meta.altitudeDeg.toFixed(1)}`,
    `certs ${meta.certifications}   replay tokens ${meta.replayTokens}   movie ${meta.movieHash}`,
  ];
  const pad = 14;
  const boxW = 720;
  const boxH = lines.length * 20 + pad * 1.4;
  ctx.fillStyle = "rgba(4, 6, 16, 0.55)";
  ctx.fillRect(12, 12, boxW, boxH);
  ctx.strokeStyle = "rgba(90, 140, 255, 0.35)";
  ctx.strokeRect(12, 12, boxW, boxH);
  ctx.fillStyle = "rgba(150, 205, 255, 0.92)";
  lines.forEach((line, i) => {
    ctx.fillText(line, 24, 38 + i * 20);
  });
}

function renderFrame(ctx, world, cam, cx, cy, headIdx) {
  drawBackground(ctx);

  const grid = buildSphereGrid(1.35, 10, 5, 48);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(120, 145, 225, 0.10)";
  for (const circle of grid) {
    ctx.beginPath();
    let pen = false;
    for (const pt of circle) {
      const s = toScreen(pt, cam, cx, cy);
      if (!s) { pen = false; continue; }
      if (!pen) { ctx.moveTo(s[0], s[1]); pen = true; }
      else { ctx.lineTo(s[0], s[1]); }
    }
    ctx.stroke();
  }

  const axisColors = ["rgba(255,90,110,0.30)", "rgba(110,255,130,0.30)", "rgba(110,150,255,0.30)"];
  for (let a = 0; a < 3; a++) {
    const end = [0, 0, 0];
    end[a] = 1.6;
    const s0 = toScreen([0, 0, 0], cam, cx, cy);
    const s1 = toScreen(end, cam, cx, cy);
    if (!s0 || !s1) continue;
    ctx.strokeStyle = axisColors[a];
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(s0[0], s0[1]);
    ctx.lineTo(s1[0], s1[1]);
    ctx.stroke();
  }

  for (const particle of world.particles) {
    const pts = particle.trajectory.slice(0, headIdx + 1).map((p) => toScreen([p.x, p.y, p.z], cam, cx, cy));
    const segments = [];
    let cur = [];
    for (const s of pts) {
      if (s) cur.push(s);
      else if (cur.length) { segments.push(cur); cur = []; }
    }
    if (cur.length) segments.push(cur);

    for (const seg of segments) {
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = hexToRgba(particle.color, 0.10);
      ctx.lineWidth = 7;
      strokePoly(ctx, seg);
      ctx.strokeStyle = hexToRgba(particle.color, 0.35);
      ctx.lineWidth = 2.5;
      strokePoly(ctx, seg);
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = particle.color;
      ctx.lineWidth = 1.1;
      strokePoly(ctx, seg);
    }

    if (headIdx >= 0 && headIdx < particle.trajectory.length) {
      const head = toScreen([particle.trajectory[headIdx].x, particle.trajectory[headIdx].y, particle.trajectory[headIdx].z], cam, cx, cy);
      if (head) {
        const r = 4.5;
        ctx.globalCompositeOperation = "lighter";
        const glow = ctx.createRadialGradient(head[0], head[1], 0, head[0], head[1], r * 5);
        glow.addColorStop(0, hexToRgba(particle.color, 0.55));
        glow.addColorStop(1, hexToRgba(particle.color, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(head[0], head[1], r * 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(head[0], head[1], 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function strokePoly(ctx, pts) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

async function main() {
  console.log("Running Constitutional 4D Physics...");
  const { results, allConformance, metricHash, movieHash } = await runPhysics();
  console.log(`  worldlines: ${results.length}, conformance all pass: ${allConformance}`);

  fs.mkdirSync(FRAME_DIR, { recursive: true });
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;

  const totalCerts = results.reduce((s, r) => s + r.certifications, 0);

  for (let f = 0; f < FRAMES; f++) {
    const az = Math.PI * 2 * CAM_TURNS * (f / FRAMES) + 0.35;
    const alt = 0.32 + 0.11 * Math.sin(Math.PI * 2 * 0.6 * (f / FRAMES));
    const cam = orbitBasis(az, alt);
    const headIdx = Math.min(STEPS - 1, Math.floor(((f + 1) / FRAMES) * STEPS));
    const meta = {
      metricHash,
      azimuthDeg: (az * 180) / Math.PI,
      altitudeDeg: (alt * 180) / Math.PI,
      certifications: totalCerts,
      replayTokens: STEPS * results.length,
      movieHash,
    };
    renderFrame(ctx, { particles: results }, cam, cx, cy, headIdx);
    drawHud(ctx, meta, f);

    const buf = canvas.toBuffer("image/png");
    fs.writeFileSync(path.join(FRAME_DIR, `frame_${String(f).padStart(4, "0")}.png`), buf);

    for (const s of STILLS) {
      if (f === s) {
        fs.writeFileSync(path.join(OUT_DIR, `still_${String(s).padStart(3, "0")}.png`), buf);
      }
    }

    if (f % 30 === 0 || f === FRAMES - 1) {
      console.log(`  frame ${f + 1}/${FRAMES}`);
    }
  }

  console.log("Encoding MP4...");
  execFileSync(
    "ffmpeg",
    [
      "-y", "-framerate", String(FPS), "-i", path.join(FRAME_DIR, "frame_%04d.png"),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", "-preset", "medium",
      "-movflags", "+faststart", VIDEO_PATH,
    ],
    { stdio: "inherit" }
  );

  const videoBytes = fs.statSync(VIDEO_PATH).size;
  const videoSha = createHash("sha256").update(fs.readFileSync(VIDEO_PATH)).digest("hex");

  const manifest = {
    engine: "mrs-renderer-core/constitutional",
    kind: "deterministic-certified-worldline-render",
    width: WIDTH,
    height: HEIGHT,
    frames: FRAMES,
    fps: FPS,
    durationSeconds: FRAMES / FPS,
    physics: { metric: "Minkowski", signature: [-1, 1, 1, 1], dtau: DTAU, steps: STEPS, c: C },
    projection: { mode: "perspective", d: D4 },
    particles: results.map((r) => ({ name: r.name, velocity: r.velocity, color: r.color, conformance: r.conformance?.passed ?? null, replayToken: r.replayToken })),
    conformanceAllPass: allConformance,
    metricHash,
    movieHash,
    video: { file: path.basename(VIDEO_PATH), bytes: videoBytes, sha256: videoSha },
    note: "Procedural deterministic visualization of the Constitutional 4D Physics Runtime. Not text-to-image.",
  };
  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

  fs.rmSync(FRAME_DIR, { recursive: true, force: true });
  console.log(`\nDone: ${VIDEO_PATH}`);
  console.log(`  ${videoBytes} bytes, sha256 ${videoSha.slice(0, 16)}...`);
  console.log(`  manifest: ${path.join(OUT_DIR, "manifest.json")}`);
  console.log(`  stills: ${STILLS.map((s) => `still_${String(s).padStart(3, "0")}.png`).join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
