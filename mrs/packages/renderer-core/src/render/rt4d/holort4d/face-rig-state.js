/**
 * FaceRigState — 68 Landmark3D + bones + temporal optical flow (CPU stub, no mesh).
 *
 * Status:
 *   buildFaceRigState / LANDMARK_TO_CONTROL — enforced (CPU tests)
 *   bone IK — declared (head cluster pose stub only)
 */

import { ARKIT_BLENDSHAPE_NAMES, LANDMARK_COUNT } from "./face-rig-control-shared.js";

export { LANDMARK_COUNT };

/** @typedef {{ x: number, y: number, z: number }} Vec3f */

/**
 * @typedef {object} Landmark3D
 * @property {number} id
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {string} bone
 * @property {string[]} controls
 * @property {{ x: number, y: number, z: number }|undefined} [velocity]
 */

/**
 * @typedef {object} FaceRigState
 * @property {Landmark3D[]} landmarks
 * @property {Float32Array} blendshapes
 * @property {{ name: string, pos: Vec3f, rot: Vec3f }[]} bones
 * @property {{ prevLandmarks: Landmark3D[]|null, dt: number, opticalFlow: Float32Array }} temporal
 * @property {string} fieldId
 */

/** Region → ARKit control names (dlib 68 layout). */
function buildLandmarkToControl() {
  /** @type {Record<number, string[]>} */
  const map = {};
  const jaw = ["jawOpen", "jawLeft", "jawRight", "jawForward"];
  const brow = ["browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight"];
  const nose = ["noseSneerLeft", "noseSneerRight"];
  const eyeR = ["eyeBlinkRight", "eyeLookDownRight", "eyeLookInRight", "eyeLookOutRight", "eyeLookUpRight", "eyeSquintRight", "eyeWideRight"];
  const eyeL = ["eyeBlinkLeft", "eyeLookDownLeft", "eyeLookInLeft", "eyeLookOutLeft", "eyeLookUpLeft", "eyeSquintLeft", "eyeWideLeft"];
  const mouth = ["mouthClose", "mouthSmileLeft", "mouthSmileRight", "mouthFrownLeft", "mouthFrownRight", "mouthPucker", "jawOpen"];
  for (let i = 0; i <= 16; i++) map[i] = jaw;
  for (let i = 17; i <= 26; i++) map[i] = brow;
  for (let i = 27; i <= 35; i++) map[i] = nose;
  for (let i = 36; i <= 41; i++) map[i] = eyeR;
  for (let i = 42; i <= 47; i++) map[i] = eyeL;
  for (let i = 48; i <= 67; i++) map[i] = mouth;
  return map;
}

export const LANDMARK_TO_CONTROL = Object.freeze(buildLandmarkToControl());

/** Normalized face-local landmark template (dlib-style 68, y-up). */
const LANDMARK_TEMPLATE = Object.freeze([
  [-0.55, -0.72, 0], [-0.48, -0.58, 0], [-0.38, -0.48, 0], [-0.26, -0.42, 0],
  [-0.12, -0.38, 0], [0, -0.36, 0], [0.12, -0.38, 0], [0.26, -0.42, 0],
  [0.38, -0.48, 0], [0.48, -0.58, 0], [0.55, -0.72, 0], [0.42, -0.82, 0],
  [0.28, -0.88, 0], [0.12, -0.9, 0], [0, -0.91, 0], [-0.12, -0.9, 0], [-0.28, -0.88, 0],
  [-0.38, 0.18, 0], [-0.28, 0.24, 0], [-0.16, 0.26, 0], [-0.04, 0.25, 0], [0.04, 0.22, 0],
  [0.38, 0.18, 0], [0.28, 0.24, 0], [0.16, 0.26, 0], [0.04, 0.25, 0], [-0.04, 0.22, 0],
  [0, 0.2, 0.08], [-0.08, 0.08, 0.1], [-0.04, 0.02, 0.12], [0, -0.02, 0.14],
  [0.04, 0.02, 0.12], [0.08, 0.08, 0.1], [-0.06, -0.12, 0.1], [0, -0.16, 0.12], [0.06, -0.12, 0.1],
  // Right eye 36–41: outer → upper lid → inner (nose) → lower lid (dlib CCW, y-up)
  [-0.21, 0.08, 0.02], [-0.18, 0.11, 0.02], [-0.12, 0.11, 0.02], [-0.09, 0.08, 0.02],
  [-0.12, 0.05, 0.02], [-0.18, 0.05, 0.02],
  // Left eye 42–47: mirror of right
  [0.21, 0.08, 0.02], [0.18, 0.11, 0.02], [0.12, 0.11, 0.02], [0.09, 0.08, 0.02],
  [0.12, 0.05, 0.02], [0.18, 0.05, 0.02],
  [-0.14, -0.28, 0.04], [-0.08, -0.24, 0.04], [-0.02, -0.22, 0.04], [0.02, -0.22, 0.04],
  [0.08, -0.24, 0.04], [0.14, -0.28, 0.04], [0.1, -0.34, 0.04], [0.04, -0.36, 0.04],
  [0, -0.37, 0.04], [-0.04, -0.36, 0.04], [-0.1, -0.34, 0.04], [-0.14, -0.28, 0.04],
  [-0.06, -0.28, 0.05], [-0.02, -0.26, 0.05], [0.02, -0.26, 0.05], [0.06, -0.28, 0.05],
  [0.04, -0.32, 0.05], [0, -0.33, 0.05], [-0.04, -0.32, 0.05], [-0.06, -0.28, 0.05],
]);

function blendIndex(name) {
  return ARKIT_BLENDSHAPE_NAMES.indexOf(name);
}

function bs(rig, name, fallback = 0) {
  const i = blendIndex(name);
  if (i < 0 || i >= (rig.blendshapes?.length ?? 0)) return fallback;
  return rig.blendshapes[i];
}

function rotY(p, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}

function rotX(p, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
}

function rotZ(p, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
}

function applyHeadRot(p, headRot) {
  let q = { x: p.x, y: p.y, z: p.z };
  q = rotY(q, headRot.y ?? 0);
  q = rotX(q, headRot.x ?? 0);
  q = rotZ(q, headRot.z ?? 0);
  return q;
}

/** @param {number} idx */
export function boneNameForLandmark(idx) {
  if (idx <= 16) return "jaw";
  if (idx <= 26) return "brow";
  if (idx <= 35) return "nose";
  if (idx <= 41) return "eye_r";
  if (idx <= 47) return "eye_l";
  return "mouth";
}

/** Bone colors for topology map (jaw=red, eyes=blue, mouth=green). */
export const BONE_COLORS = Object.freeze({
  jaw: [220, 48, 48],
  brow: [220, 150, 40],
  nose: [160, 64, 200],
  eye_r: [48, 96, 220],
  eye_l: [48, 96, 220],
  mouth: [48, 180, 72],
});

/** Adjacent landmark pairs per bone region (topology edges). */
export const BONE_EDGES = Object.freeze([
  ...rangeEdges(0, 16),
  ...rangeEdges(17, 21),
  ...rangeEdges(22, 26),
  ...rangeEdges(27, 35),
  ...rangeEdges(36, 41, true),
  ...rangeEdges(42, 47, true),
  ...rangeEdges(48, 59),
  ...rangeEdges(60, 67),
]);

function rangeEdges(a, b, closed = false) {
  const edges = [];
  for (let i = a; i < b; i++) edges.push([i, i + 1]);
  if (closed) edges.push([b, a]);
  return edges;
}

/**
 * @typedef {object} FaceRig
 * @property {Float32Array} blendshapes
 * @property {Vec3f} headPos
 * @property {Vec3f} headRot
 * @property {string} fieldId
 */

/**
 * Apply coarse ARKit deltas to the 68-point template (CPU stub, not FACS mesh).
 * @param {FaceRig} rig
 * @returns {Array<{ x: number, y: number, z: number }>}
 */
export function deformLandmarksFromRig(rig) {
  const jawOpen = bs(rig, "jawOpen");
  const blinkL = bs(rig, "eyeBlinkLeft");
  const blinkR = bs(rig, "eyeBlinkRight");
  const smileL = bs(rig, "mouthSmileLeft");
  const smileR = bs(rig, "mouthSmileRight");
  const browUp = bs(rig, "browInnerUp");
  const jawLeft = bs(rig, "jawLeft");
  const jawRight = bs(rig, "jawRight");

  return LANDMARK_TEMPLATE.map((t, idx) => {
    let x = t[0];
    let y = t[1];
    let z = t[2];
    if (idx <= 16) y -= jawOpen * 0.12;
    if (idx >= 36 && idx <= 41) y -= blinkR * 0.04;
    if (idx >= 42 && idx <= 47) y -= blinkL * 0.04;
    if (idx >= 48 && idx <= 59) {
      if (x < 0) x -= smileL * 0.06;
      if (x > 0) x += smileR * 0.06;
      y -= jawOpen * 0.05;
    }
    if (idx >= 17 && idx <= 26) y += browUp * 0.05;
    x += (jawRight - jawLeft) * 0.04;
    z += (rig.headPos?.z ?? 0) * 0.01;
    const local = applyHeadRot({ x, y, z }, rig.headRot ?? { x: 0, y: 0, z: 0 });
    return {
      x: local.x + (rig.headPos?.x ?? 0),
      y: local.y + (rig.headPos?.y ?? 0),
      z: local.z + (rig.headPos?.z ?? 0),
    };
  });
}

/**
 * Orthographic project rig-space landmarks to pixel coordinates (face-centered).
 * @param {FaceRig|FaceRigState} rigOrState
 * @param {number} width
 * @param {number} height
 */
export function projectLandmarksFromRig(rigOrState, width, height) {
  const pts = rigOrState.landmarks
    ?? deformLandmarksFromRig(rigOrState);
  const scale = Math.min(width, height) * 0.42;
  const cx = width * 0.5;
  const cy = height * 0.44;
  return pts.map((p, index) => ({
    index,
    x: cx + p.x * scale,
    y: cy - p.y * scale,
    z: p.z ?? 0,
  }));
}

/**
 * Stub bone chain from head cluster pose (no mesh IK).
 * @param {FaceRig} rig
 */
export function buildStubBones(rig) {
  const hp = rig.headPos ?? { x: 0, y: 0, z: 0 };
  const hr = rig.headRot ?? { x: 0, y: 0, z: 0 };
  const jawOpen = bs(rig, "jawOpen");
  return [
    { name: "head", pos: { ...hp }, rot: { ...hr } },
    { name: "jaw", pos: { x: hp.x, y: hp.y - 0.35, z: hp.z + 0.02 }, rot: { x: hr.x + jawOpen * 0.25, y: hr.y, z: hr.z } },
    { name: "brow", pos: { x: hp.x, y: hp.y + 0.22, z: hp.z + 0.04 }, rot: { x: hr.x, y: hr.y, z: hr.z } },
    { name: "eye_r", pos: { x: hp.x - 0.18, y: hp.y + 0.08, z: hp.z + 0.03 }, rot: { x: hr.x, y: hr.y, z: hr.z } },
    { name: "eye_l", pos: { x: hp.x + 0.18, y: hp.y + 0.08, z: hp.z + 0.03 }, rot: { x: hr.x, y: hr.y, z: hr.z } },
    { name: "mouth", pos: { x: hp.x, y: hp.y - 0.28, z: hp.z + 0.05 }, rot: { x: hr.x, y: hr.y, z: hr.z } },
  ];
}

/**
 * Rasterize per-landmark velocity into a 2-channel optical flow grid (dx, dy interleaved).
 * @param {Landmark3D[]} landmarks
 * @param {Landmark3D[]|null} prevLandmarks
 * @param {number} width
 * @param {number} height
 * @param {number} dt
 */
export function rasterizeOpticalFlow(landmarks, prevLandmarks, width, height, dt) {
  const flow = new Float32Array(width * height * 2);
  if (!prevLandmarks || prevLandmarks.length !== landmarks.length) return flow;

  const scale = Math.min(width, height) * 0.42;
  const cx = width * 0.5;
  const cy = height * 0.44;
  const splatR = 6;

  for (let i = 0; i < landmarks.length; i++) {
    const cur = landmarks[i];
    const prev = prevLandmarks[i];
    const dx = (cur.x - prev.x) / dt;
    const dy = (cur.y - prev.y) / dt;
    const px = Math.round(cx + cur.x * scale);
    const py = Math.round(cy - cur.y * scale);
    for (let oy = -splatR; oy <= splatR; oy++) {
      for (let ox = -splatR; ox <= splatR; ox++) {
        if (ox * ox + oy * oy > splatR * splatR) continue;
        const x = px + ox;
        const y = py + oy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const o = (y * width + x) * 2;
        flow[o] = dx;
        flow[o + 1] = dy;
      }
    }
  }
  return flow;
}

/**
 * Derive full FaceRigState from head cluster pose + blendshapes.
 * @param {FaceRig} rig
 * @param {object} [opts]
 * @param {FaceRigState} [opts.prevState]
 * @param {number} [opts.width=512]
 * @param {number} [opts.height=512]
 * @param {number} [opts.dt=1/30]
 * @returns {FaceRigState}
 */
export function buildFaceRigState(rig, opts = {}) {
  const width = opts.width ?? 512;
  const height = opts.height ?? 512;
  const dt = opts.dt ?? 1 / 30;
  const prevState = opts.prevState ?? null;
  const prevLandmarks = prevState?.landmarks ?? null;

  const pts = deformLandmarksFromRig(rig);
  /** @type {Landmark3D[]} */
  const landmarks = pts.map((p, id) => {
    /** @type {Landmark3D} */
    const lm = {
      id,
      x: p.x,
      y: p.y,
      z: p.z,
      bone: boneNameForLandmark(id),
      controls: LANDMARK_TO_CONTROL[id] ?? [],
    };
    if (prevLandmarks && prevLandmarks[id]) {
      const prev = prevLandmarks[id];
      lm.velocity = {
        x: (p.x - prev.x) / dt,
        y: (p.y - prev.y) / dt,
        z: (p.z - prev.z) / dt,
      };
    }
    return lm;
  });

  const opticalFlow = rasterizeOpticalFlow(landmarks, prevLandmarks, width, height, dt);

  return {
    landmarks,
    blendshapes: rig.blendshapes ?? new Float32Array(52),
    bones: buildStubBones(rig),
    temporal: {
      prevLandmarks,
      dt,
      opticalFlow,
    },
    fieldId: rig.fieldId ?? "face-rig",
  };
}

/** Verify all 68 landmarks have LANDMARK_TO_CONTROL entries. */
export function landmarkControlCoverage() {
  let covered = 0;
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    if (Array.isArray(LANDMARK_TO_CONTROL[i]) && LANDMARK_TO_CONTROL[i].length > 0) covered += 1;
  }
  return { covered, total: LANDMARK_COUNT };
}
