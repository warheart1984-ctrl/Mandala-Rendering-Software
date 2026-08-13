/**
 * Shared frame-rendering helpers for the RT4D movie scripts.
 * Deterministic: camera motion is a pure function of the frame index.
 */

import { createCanvas } from "canvas";

export const WIDTH = 1280;
export const HEIGHT = 720;
export const CAM_R = 4.6;
export const CAM_F = 1000;

export function createFrame() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  return { canvas, ctx: canvas.getContext("2d") };
}

export function orbitBasis(az, alt) {
  const cosA = Math.cos(az), sinA = Math.sin(az);
  const cosE = Math.cos(alt), sinE = Math.sin(alt);
  const eye = [CAM_R * cosA * cosE, CAM_R * sinE, CAM_R * sinA * cosE];
  const forward = normalize([-eye[0], -eye[1], -eye[2]]);
  const worldUp = [0, 1, 0];
  const right = normalize(cross(forward, worldUp));
  const up = cross(right, forward);
  return { eye, forward, right, up };
}

export function toScreen(p, cam, cx, cy) {
  const v = [p[0] - cam.eye[0], p[1] - cam.eye[1], p[2] - cam.eye[2]];
  const zv = dot(v, cam.forward);
  if (zv < 0.08) return null;
  const xv = dot(v, cam.right);
  const yv = dot(v, cam.up);
  return [cx + (xv / zv) * CAM_F, cy - (yv / zv) * CAM_F];
}

export function buildSphereGrid(radius, lonCount, latCount, segs) {
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

export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function strokePoly(ctx, pts) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

export function drawBackground(ctx) {
  const g = ctx.createRadialGradient(WIDTH / 2, HEIGHT * 0.45, 80, WIDTH / 2, HEIGHT * 0.5, Math.max(WIDTH, HEIGHT) * 0.75);
  g.addColorStop(0, "#101533");
  g.addColorStop(0.55, "#080a1c");
  g.addColorStop(1, "#03040a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

export function drawHud(ctx, lines, frame) {
  ctx.font = "15px Consolas, monospace";
  const pad = 14;
  const boxW = 760;
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

export function renderWorldFrame(ctx, world, cam, cx, cy, headIdx) {
  drawBackground(ctx);

  const gridRadius = world.gridRadius ?? 1.35;
  const grid = buildSphereGrid(gridRadius, 10, 5, 48);
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

  if (world.centerMark) {
    const s0 = toScreen([0, 0, 0], cam, cx, cy);
    if (s0) {
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(s0[0], s0[1], 0, s0[0], s0[1], 46);
      glow.addColorStop(0, "rgba(255, 190, 110, 0.5)");
      glow.addColorStop(1, "rgba(255, 190, 110, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(s0[0], s0[1], 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(255, 200, 130, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(s0[0], s0[1], 4, 0, Math.PI * 2);
      ctx.stroke();
    }
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
    const pts = particle.trajectory.slice(0, headIdx + 1).map((p) => toScreen(p, cam, cx, cy));
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
      const head = toScreen(particle.trajectory[headIdx], cam, cx, cy);
      if (head) {
        ctx.globalCompositeOperation = "lighter";
        const glow = ctx.createRadialGradient(head[0], head[1], 0, head[0], head[1], 22);
        glow.addColorStop(0, hexToRgba(particle.color, 0.55));
        glow.addColorStop(1, hexToRgba(particle.color, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(head[0], head[1], 22, 0, Math.PI * 2);
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
