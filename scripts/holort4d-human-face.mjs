/**
 * Face priority zone — screen-space ellipse aligned with ART_DIRECTION_BRIEF §5.
 * Eyes/brow/cheek read first; used for PathSample weight boost and hybrid mask.
 */
import { Camera4D } from "../mrs/packages/renderer-core/src/render/rt4d/camera/Camera4D.js";
import { computeJoints, PROPORTIONS } from "./humanoid-avatar.mjs";

/** Weight multiplier when traced hit projects into face zone (concentrates |E|). */
export const FACE_ZONE_BOOST = 2.5;

export const DEFAULT_HUMAN_POSE = {
  armAngle: 0.25,
  armSwing: 0.1,
  legSpread: 0.12,
  bodyLean: 0.05,
};

/** Vertical lift so capsule feet sit on ground plane y=0 (hips at baseY). */
export const FULLBODY_BASE_Y = 0.42;

/** Head-shoulders portrait vs head-to-feet full body (capsule humanoid ~1.0 unit tall). */
export const CAMERA_PRESETS = {
  portrait: {
    x: 0,
    y: 1.05,
    z: -2.4,
    lx: 0,
    ly: 1.0,
    lz: 0,
    fovX: 42,
    fovY: 52,
  },
  fullbody: {
    x: 0,
    y: 0.88,
    z: -4.6,
    lx: 0,
    ly: 0.52,
    lz: 0,
    fovX: 30,
    fovY: 40,
  },
};

/**
 * Shared human camera for HoloRT4D frame, hybrid mask, and body control maps.
 * @param {{ width?: number, height?: number, mode?: 'portrait'|'fullbody' }} opts
 */
export function createHumanCamera(opts = {}) {
  const { width = 512, height = 512, mode = "portrait" } = opts;
  const preset = CAMERA_PRESETS[mode] ?? CAMERA_PRESETS.portrait;
  return new Camera4D({ ...preset, width, height });
}

/**
 * Project all pose joints; useful to verify full-body framing margins.
 * @returns {{ name: string, x: number, y: number }[]}
 */
export function projectPoseJoints(camera, width, height, pose = DEFAULT_HUMAN_POSE, baseY = 0) {
  const joints = computeJoints(pose, baseY);
  const out = [];
  for (const [name, pt] of Object.entries(joints)) {
    const px = worldToPixel(camera, pt, width, height);
    if (px) out.push({ name, x: px.x, y: px.y });
  }
  return out;
}

function dot4(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

/**
 * Project world point to pixel coordinates (matches Camera4D.generateRay NDC).
 * @returns {{ x: number, y: number } | null}
 */
export function worldToPixel(camera, point, width, height) {
  const b = camera.basis;
  const rel = {
    x: point.x - camera.position.x,
    y: point.y - camera.position.y,
    z: point.z - camera.position.z,
    w: point.w - camera.position.w,
  };
  const forward = dot4(rel, b.forward);
  if (forward <= 0.001) return null;
  const right = dot4(rel, b.right);
  const up = dot4(rel, b.up);
  const aspectX = Math.tan((camera.fovX / 2) * Math.PI / 180);
  const aspectY = Math.tan((camera.fovY / 2) * Math.PI / 180);
  const ndcX = right / (forward * aspectX);
  const ndcY = up / (forward * aspectY);
  return {
    x: ((ndcX + 1) * 0.5 * width) - 0.5,
    y: ((1 - ndcY) * 0.5 * height) - 0.5,
  };
}

/**
 * Face ellipse in pixel space — eyes/brow/cheek priority (§5).
 * Center biased upward from cranium toward brow plane.
 */
export function computeFaceZoneEllipse(camera, width, height, pose = DEFAULT_HUMAN_POSE, baseY = 0) {
  const { head } = computeJoints(pose, baseY);
  const headPx = worldToPixel(camera, head, width, height);
  if (!headPx) {
    return { cx: width * 0.5, cy: height * 0.38, rx: width * 0.2, ry: height * 0.24 };
  }
  const hr = PROPORTIONS.headRadius;
  const brow = worldToPixel(
    camera,
    { x: head.x, y: head.y + hr * 0.2, z: head.z + 0.06, w: head.w },
    width,
    height,
  );
  const cx = headPx.x;
  const cy = brow ? brow.y : headPx.y - height * 0.04;
  const chin = worldToPixel(
    camera,
    { x: head.x, y: head.y - hr * 0.55, z: head.z + 0.05, w: head.w },
    width,
    height,
  );
  const screenHeadH = chin ? Math.abs(chin.y - (brow?.y ?? headPx.y)) : height * 0.22;
  const rx = Math.max(width * 0.16, screenHeadH * 0.72);
  const ry = Math.max(height * 0.12, screenHeadH * 0.95);
  return { cx, cy, rx, ry };
}

/** Normalized elliptical distance; <=1 inside face zone. */
export function faceZoneNormDist(x, y, zone) {
  const dx = (x - zone.cx) / zone.rx;
  const dy = (y - zone.cy) / zone.ry;
  return Math.sqrt(dx * dx + dy * dy);
}

export function pointInFaceZone(x, y, zone) {
  return faceZoneNormDist(x, y, zone) <= 1;
}

/**
 * Larger protect ellipse for hybrid composite (~44% frame width diameter).
 * Weight boost uses the tighter computeFaceZoneEllipse; SD inpaint uses this.
 */
export function computeHybridProtectEllipse(camera, width, height, pose = DEFAULT_HUMAN_POSE, baseY = 0) {
  const core = computeFaceZoneEllipse(camera, width, height, pose, baseY);
  return {
    cx: core.cx,
    cy: core.cy,
    rx: Math.max(core.rx, width * 0.22),
    ry: Math.max(core.ry, height * 0.26),
  };
}

/**
 * RGBA mask: alpha=255 inside face (protected), 0 outside (SD inpaint target).
 */
export function buildFaceProtectMaskRgba(width, height, zone, featherPx = 4) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = faceZoneNormDist(x, y, zone);
      let a = 0;
      if (d <= 1) {
        a = 255;
      } else if (featherPx > 0 && d <= 1 + featherPx / Math.min(zone.rx, zone.ry)) {
        const t = (d - 1) / (featherPx / Math.min(zone.rx, zone.ry));
        a = Math.round(255 * (1 - t));
      }
      const o = (y * width + x) * 4;
      rgba[o] = 255;
      rgba[o + 1] = 255;
      rgba[o + 2] = 255;
      rgba[o + 3] = a;
    }
  }
  return rgba;
}

/**
 * SD inpaint mask (L): white = repaint, black = keep. Repaints OUTSIDE face zone.
 */
export function buildSdInpaintMaskL(width, height, zone, featherPx = 6) {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = faceZoneNormDist(x, y, zone);
      let v = 255;
      if (d <= 1) {
        v = 0;
      } else if (featherPx > 0 && d <= 1 + featherPx / Math.min(zone.rx, zone.ry)) {
        const t = (d - 1) / (featherPx / Math.min(zone.rx, zone.ry));
        v = Math.round(255 * t);
      }
      mask[y * width + x] = v;
    }
  }
  return mask;
}
