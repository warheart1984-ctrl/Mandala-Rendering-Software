/**
 * CPU raster: wire_sim and beauty_sim.
 * STATUS: enforced (deterministic software raster). Path-traced beauty: declared.
 */
import { encodePngRgba } from "./png.mjs";
import { shade, materialForRegion, MATERIALS } from "../shaders/library.mjs";

function project(p, cam, w, h) {
  const x = p[0] - cam.lookAt[0];
  const y = p[1] - cam.lookAt[1];
  const z = p[2] - cam.lookAt[2];
  const cos = Math.cos(cam.yaw), sin = Math.sin(cam.yaw);
  const rx = x * cos + z * sin;
  const rz = -x * sin + z * cos;
  const ry = y;
  const depth = rz + cam.radius;
  const f = (h * 0.85) / Math.max(0.2, depth);
  return {
    x: w * 0.5 + rx * f,
    y: h * 0.62 - ry * f,
    z: depth,
  };
}

function setPixel(buf, w, h, x, y, r, g, b, a = 255) {
  const xi = x | 0, yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= w || yi >= h) return;
  const i = (yi * w + xi) * 4;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
}

function drawLine(buf, zbuf, w, h, a, b, color, glow = false) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const steps = Math.max(2, Math.ceil(Math.hypot(dx, dy)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + dx * t;
    const y = a.y + dy * t;
    const z = a.z + (b.z - a.z) * t;
    const zi = (y | 0) * w + (x | 0);
    if (zi < 0 || zi >= zbuf.length) continue;
    if (z > zbuf[zi] + 0.02) continue;
    zbuf[zi] = z;
    setPixel(buf, w, h, x, y, color[0], color[1], color[2]);
    if (glow) {
      setPixel(buf, w, h, x + 1, y, color[0] * 0.5, color[1] * 0.5, color[2] * 0.5);
      setPixel(buf, w, h, x, y + 1, color[0] * 0.5, color[1] * 0.5, color[2] * 0.5);
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
      if (area > 0 ? (w0 >= 0 && w1 >= 0 && w2 >= 0) : (w0 <= 0 && w1 <= 0 && w2 <= 0)) {
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
}

function defaultCam(yaw = 0.45) {
  return { lookAt: [0, 1.1, 0], radius: 2.6, yaw };
}

/**
 * @param {object} asset
 * @param {object} sim   result of runCharacterSim
 * @param {"wire"|"rig"|"beauty"} stage
 * @param {object} opts
 */
export function rasterStage(asset, sim, stage, opts = {}) {
  const w = opts.width || 384;
  const h = opts.height || 384;
  const cam = opts.cam || defaultCam(opts.yaw ?? 0.45);
  const buf = new Uint8ClampedArray(w * h * 4);
  const zbuf = new Float32Array(w * h);
  zbuf.fill(1e9);

  const bg = stage === "beauty" ? [18, 16, 22] : [6, 10, 16];
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = bg[0]; buf[i * 4 + 1] = bg[1]; buf[i * 4 + 2] = bg[2]; buf[i * 4 + 3] = 255;
  }

  const proj = (p) => project(p, cam, w, h);
  const positions = asset.mesh.positions;
  const view = [Math.sin(cam.yaw), 0.2, Math.cos(cam.yaw)];

  if (stage === "beauty") {
    const tris = asset.triangles;
    for (let i = 0; i < tris.length; i += 3) {
      const ia = tris[i], ib = tris[i + 1], ic = tris[i + 2];
      const pa = proj(positions[ia]), pb = proj(positions[ib]), pc = proj(positions[ic]);
      const n = asset.normals[ia];
      const region = asset.mesh.regions[Math.floor(i / 6)] || "torso";
      const mat = materialForRegion(region, asset.species, "beauty");
      const col = shade(n, view, mat);
      fillTriangle(buf, zbuf, w, h, pa, pb, pc, [
        Math.round(col[0] * 255),
        Math.round(col[1] * 255),
        Math.round(col[2] * 255),
      ]);
    }
    // Sim overlay: cloak as fabric, hair as fur strands
    const fabric = MATERIALS.fabric;
    for (const [a, b] of sim.cloakEdges) {
      const ca = shade([0, 0, 1], view, fabric);
      drawLine(buf, zbuf, w, h, proj(a), proj(b), [
        Math.round(ca[0] * 255), Math.round(ca[1] * 255), Math.round(ca[2] * 255),
      ]);
    }
    const fur = MATERIALS.fur;
    for (const curve of sim.hairCurves) {
      for (let i = 0; i < curve.length - 1; i++) {
        const c = shade([0, 1, 0], view, fur);
        drawLine(buf, zbuf, w, h, proj(curve[i]), proj(curve[i + 1]), [
          Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255),
        ]);
      }
    }
  }

  if (stage === "wire" || stage === "rig") {
    const wireCol = [40, 210, 255];
    const energyCol = [180, 255, 255];
    for (const [a, b] of asset.edges) {
      drawLine(buf, zbuf, w, h, proj(positions[a]), proj(positions[b]), wireCol, true);
    }
    for (const curve of asset.energy) {
      for (let i = 0; i < curve.length - 1; i++) {
        drawLine(buf, zbuf, w, h, proj(curve[i]), proj(curve[i + 1]), energyCol, true);
      }
    }
    // Sim motion on the wire from frame 0
    for (const [a, b] of sim.cloakEdges) {
      drawLine(buf, zbuf, w, h, proj(a), proj(b), [90, 160, 255]);
    }
    for (const curve of sim.hairCurves) {
      for (let i = 0; i < curve.length - 1; i++) {
        drawLine(buf, zbuf, w, h, proj(curve[i]), proj(curve[i + 1]), [255, 210, 80]);
      }
    }
  }

  if (stage === "rig") {
    const boneCol = [255, 90, 70];
    const jointCol = [255, 220, 80];
    for (const bone of asset.armature.bones) {
      drawLine(buf, zbuf, w, h, proj(bone.head), proj(bone.tail), boneCol, true);
      const j = proj(bone.head);
      setPixel(buf, w, h, j.x, j.y, jointCol[0], jointCol[1], jointCol[2]);
      setPixel(buf, w, h, j.x + 1, j.y, jointCol[0], jointCol[1], jointCol[2]);
      setPixel(buf, w, h, j.x, j.y + 1, jointCol[0], jointCol[1], jointCol[2]);
    }
  }

  return encodePngRgba(w, h, buf);
}

export const PRESETS = Object.freeze({
  wire_sim: { stage: "wire", description: "topology + energy curves after sim" },
  beauty_sim: { stage: "beauty", description: "materials + lighting after the same sim" },
  rig_view: { stage: "rig", description: "mesh wire + armature overlay after sim" },
});
