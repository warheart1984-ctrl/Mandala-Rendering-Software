/**
 * Full-body control maps from capsule humanoid — depth + topology skeleton.
 * Uses the same full-body camera as holort4d-human-frame --fullbody.
 *
 * Status: partial — orthographic-style z from ray hit.t, ragdoll topology (not GLB).
 */
import { buildHumanoidPrimitives } from "./humanoid-avatar.mjs";
import {
  DEFAULT_HUMAN_POSE,
  FULLBODY_BASE_Y,
  createHumanCamera,
  worldToPixel,
} from "./holort4d-human-face.mjs";
import { Scene4D } from "../mrs/packages/renderer-core/src/render/rt4d/scene/Scene4D.js";
import { vec4 } from "../mrs/packages/renderer-core/src/render/rt4d/math/vec4.js";
import { Hyperplane } from "../mrs/packages/renderer-core/src/render/rt4d/geometry/hypersurface.js";
import { encodePngRgba8 } from "../mrs/packages/renderer-core/src/render/rt4d/holort4d/index.js";

const BONE_COLORS = {
  head: [220, 175, 140],
  neck: [190, 150, 110],
  torso: [90, 170, 95],
  lArm: [90, 110, 220],
  rArm: [70, 90, 200],
  lLeg: [220, 95, 95],
  rLeg: [200, 75, 75],
  ground: [55, 55, 58],
};

const SKELETON_EDGES = [
  ["head", "neckTop", "head"],
  ["neckTop", "torsoTop", "neck"],
  ["torsoTop", "torsoBottom", "torso"],
  ["torsoTop", "lShoulder", "torso"],
  ["torsoTop", "rShoulder", "torso"],
  ["lShoulder", "lElbow", "lArm"],
  ["lElbow", "lHand", "lArm"],
  ["rShoulder", "rElbow", "rArm"],
  ["rElbow", "rHand", "rArm"],
  ["torsoBottom", "lHip", "torso"],
  ["torsoBottom", "rHip", "torso"],
  ["lHip", "lKnee", "lLeg"],
  ["lKnee", "lFoot", "lLeg"],
  ["rHip", "rKnee", "rLeg"],
  ["rKnee", "rFoot", "rLeg"],
];

function buildHumanScene() {
  const scene = new Scene4D({ surfaceId: "humanoid-body-maps-capsules" });
  scene.materials.createMaterial("skin", "lambertian", {
    albedo: vec4(0.72, 0.58, 0.48, 1),
  });
  scene.materials.createMaterial("floor", "lambertian", {
    albedo: vec4(0.15, 0.15, 0.16, 1),
  });
  const { primitives } = buildHumanoidPrimitives(DEFAULT_HUMAN_POSE, "skin", FULLBODY_BASE_Y, [0, 0, 0, 0]);
  for (const { primitive, materialId } of primitives) {
    scene.addPrimitive(primitive, materialId);
  }
  scene.addPrimitive(new Hyperplane(vec4(0, 1, 0, 0), 0), "floor");
  scene.build();
  return scene;
}

function setPx(rgba, width, height, x, y, r, g, b, a = 255) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= width || iy >= height) return;
  const o = (iy * width + ix) * 4;
  rgba[o] = r;
  rgba[o + 1] = g;
  rgba[o + 2] = b;
  rgba[o + 3] = a;
}

function drawLine(rgba, width, height, x0, y0, x1, y1, r, g, b, thickness = 2) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + dx * t;
    const y = y0 + dy * t;
    for (let oy = -thickness; oy <= thickness; oy++) {
      for (let ox = -thickness; ox <= thickness; ox++) {
        if (ox * ox + oy * oy <= thickness * thickness) {
          setPx(rgba, width, height, x + ox, y + oy, r, g, b);
        }
      }
    }
  }
}

function fillDisk(rgba, width, height, cx, cy, radius, r, g, b) {
  const rr = radius * radius;
  for (let oy = -radius; oy <= radius; oy++) {
    for (let ox = -radius; ox <= radius; ox++) {
      if (ox * ox + oy * oy <= rr) setPx(rgba, width, height, cx + ox, cy + oy, r, g, b);
    }
  }
}

/**
 * Ray-traced depth map (hit.t grayscale) + joint topology overlay.
 * @param {{ width?: number, height?: number, pose?: object }} opts
 */
export function renderBodyControlMaps(opts = {}) {
  const width = opts.width ?? 512;
  const height = opts.height ?? 512;
  const pose = opts.pose ?? DEFAULT_HUMAN_POSE;
  const camera = createHumanCamera({ width, height, mode: "fullbody" });
  const scene = buildHumanScene();

  const depthRgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < depthRgba.length; i += 4) {
    depthRgba[i] = 255;
    depthRgba[i + 1] = 255;
    depthRgba[i + 2] = 255;
    depthRgba[i + 3] = 255;
  }

  let minT = Infinity;
  let maxT = -Infinity;
  const tGrid = new Float64Array(width * height);
  tGrid.fill(Infinity);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ray = camera.generateRay(x, y, 0.5, 0.5, 0.5, 0.5);
      const hit = scene.intersect(ray);
      if (hit) {
        tGrid[y * width + x] = hit.t;
        minT = Math.min(minT, hit.t);
        maxT = Math.max(maxT, hit.t);
      }
    }
  }

  const span = Math.max(maxT - minT, 1e-6);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = tGrid[y * width + x];
      if (!Number.isFinite(t)) continue;
      const v = Math.round(255 * (1 - (t - minT) / span));
      const o = (y * width + x) * 4;
      depthRgba[o] = v;
      depthRgba[o + 1] = v;
      depthRgba[o + 2] = v;
    }
  }

  const depthPng = encodePngRgba8(width, height, depthRgba);

  const topoRgba = new Uint8ClampedArray(depthRgba);
  const { joints } = buildHumanoidPrimitives(pose, "skin", FULLBODY_BASE_Y, [0, 0, 0, 0]);
  const pxByJoint = {};
  for (const [name, pt] of Object.entries(joints)) {
    const px = worldToPixel(camera, pt, width, height);
    if (px) pxByJoint[name] = px;
  }

  for (const [a, b, boneKey] of SKELETON_EDGES) {
    const pa = pxByJoint[a];
    const pb = pxByJoint[b];
    if (!pa || !pb) continue;
    const [r, g, bcol] = BONE_COLORS[boneKey] ?? [128, 128, 128];
    drawLine(topoRgba, width, height, pa.x, pa.y, pb.x, pb.y, r, g, bcol, 3);
  }

  for (const [name, px] of Object.entries(pxByJoint)) {
    const boneKey = SKELETON_EDGES.find(([a, b]) => a === name || b === name)?.[2]
      ?? (name.includes("Foot") ? (name.startsWith("l") ? "lLeg" : "rLeg") : "torso");
    const [r, g, b] = BONE_COLORS[boneKey] ?? [0, 0, 0];
    fillDisk(topoRgba, width, height, px.x, px.y, 4, r, g, b);
  }

  const topologyPng = encodePngRgba8(width, height, topoRgba);

  return {
    width,
    height,
    camera,
    depth: { png: depthPng, minT, maxT },
    topology: { png: topologyPng },
    jointPixels: pxByJoint,
  };
}
