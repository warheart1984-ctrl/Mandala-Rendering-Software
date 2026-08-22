/**

 * Face rig → 3-map Turbo control (depth / topology / flow) for SD-Turbo + HoloRT4D.

 *

 * Pipeline: FaceRig → FaceRigState → renderAllTurboControls → img2img @ sd-server :13306

 *

 * Status:

 *   buildFaceRigState / renderDepthMap / renderColoredByBone / renderFlow — enforced (CPU tests)

 *   buildFaceRigSnapshot / buildFaceRigEnvelopes — enforced

 *   renderRigWithNumbers — partial (legacy 2D debug; use topology.png)

 *   sdTurboRoundtrip — partial (requires sd-server)

 *   secondPassPathSample — declared (see docs/holort4d/FACE_RIG_TURBO_CONTROL.md)

 */



import {

  buildCanonicalEnvelope,

  buildCPF4DEnvelope,

  hashUint8Array,

  hashFloat32Array,

  PIPELINE_STAGES,

  STATUS_TAGS,

} from "./canonical.js";

import { encodePngRgba8 } from "./debug.js";

import {

  ARKIT_BLENDSHAPE_NAMES,

  CONTROL_BAR_BLENDSHAPES,

  FACE_RIG_FLOAT_COUNT,

  LANDMARK_COUNT,

} from "./face-rig-control-shared.js";

import {

  BONE_COLORS,

  BONE_EDGES,

  buildFaceRigState,

  boneNameForLandmark,

  deformLandmarksFromRig,

  projectLandmarksFromRig,

} from "./face-rig-state.js";



export {

  ARKIT_BLENDSHAPE_NAMES,

  FACE_RIG_FLOAT_COUNT,

  LANDMARK_COUNT,

  CONTROL_BAR_BLENDSHAPES,

  buildFaceRigState,

  deformLandmarksFromRig,

  projectLandmarksFromRig,

  boneNameForLandmark,

};

export { LANDMARK_TO_CONTROL, BONE_COLORS, BONE_EDGES, landmarkControlCoverage } from "./face-rig-state.js";



/** @typedef {{ x: number, y: number, z: number }} Vec3f */



/**

 * @typedef {object} FaceRig

 * @property {Float32Array} blendshapes — 52 ARKit weights

 * @property {Vec3f} headPos

 * @property {Vec3f} headRot

 * @property {string} fieldId

 */



export const FACE_RIG_CONTROL_STATUS = Object.freeze({

  state3d: "enforced",

  depthMap: "enforced",

  topologyMap: "enforced",

  flowMap: "enforced",

  snapshot: "enforced",

  renderNumbers: "partial",

  sdTurbo: "partial",

  secondPass: "declared",

});



/** Landmark index label scale (~16–18px bold: 7 rows × 2px + stroke). */

const LABEL_SCALE = 2;



/** Bottom status bar text scale. */

const BAR_TEXT_SCALE = 2;



const BAR_HEIGHT = 40;



/** Extra label offset for crowded landmark clusters (29/31 nose, 49–52 mouth). */

const CROWDED_LABEL_OFFSET = Object.freeze({

  29: { dx: -14, dy: -18 },

  31: { dx: 14, dy: -18 },

  49: { dx: -20, dy: 4 },

  50: { dx: -8, dy: -20 },

  51: { dx: 8, dy: -20 },

  52: { dx: 20, dy: 4 },

});



function blendIndex(name) {

  return ARKIT_BLENDSHAPE_NAMES.indexOf(name);

}



function bs(rig, name, fallback = 0) {

  const i = blendIndex(name);

  if (i < 0 || i >= (rig.blendshapes?.length ?? 0)) return fallback;

  return rig.blendshapes[i];

}



/**

 * Bottom-bar blendshape text for Turbo readability.

 * @param {FaceRig} rig

 */

export function formatControlBarText(rig) {

  const parts = [];

  for (const name of CONTROL_BAR_BLENDSHAPES) {

    parts.push(`${name}:${bs(rig, name, 0).toFixed(2)}`);

  }

  return parts.join(" | ");

}



/**

 * Pack 52 blendshapes + headPos + headRot into one Float32Array (58 floats).

 * @param {FaceRig} rig

 */

export function packFaceRigFloats(rig) {

  const out = new Float32Array(FACE_RIG_FLOAT_COUNT);

  const n = Math.min(52, rig.blendshapes?.length ?? 0);

  for (let i = 0; i < n; i++) out[i] = rig.blendshapes[i];

  const hp = rig.headPos ?? { x: 0, y: 0, z: 0 };

  const hr = rig.headRot ?? { x: 0, y: 0, z: 0 };

  out[52] = hp.x;

  out[53] = hp.y;

  out[54] = hp.z;

  out[55] = hr.x;

  out[56] = hr.y;

  out[57] = hr.z;

  return out;

}



/**

 * Build a CPF-4D RawSnapshot from a FaceRig (58 floats + extended metadata).

 * @param {FaceRig} rig

 * @param {number} width

 * @param {number} height

 * @param {import("./face-rig-state.js").FaceRigState} [rigState]

 */

export function buildFaceRigSnapshot(rig, width = 512, height = 512, rigState = null) {

  const state = rigState ?? buildFaceRigState(rig, { width, height });

  const data = packFaceRigFloats(rig);

  const zs = state.landmarks.map((lm) => lm.z);

  const minZ = Math.min(...zs);

  const maxZ = Math.max(...zs);

  const snap = {

    kind: "CPF-4D",

    fieldId: rig.fieldId ?? state.fieldId ?? "face-rig",

    pixelGrid: { width, height },

    data,

    width,

    height,

    channels: 1,

    meaning: "face-rig-blendshapes",

    bounceCount: 1,

    layout: "rig-float58",

    cpuStatus: "enforced",

    metadata: {

      landmarkCount: state.landmarks.length,

      boneCount: state.bones.length,

      zRange: { min: minZ, max: maxZ },

      hasOpticalFlow: state.temporal.opticalFlow.some((v) => v !== 0),

      layout: "rig-float58+face-rig-state-v1",

    },

    faceRigStateSummary: {

      fieldId: state.fieldId,

      landmarkCount: state.landmarks.length,

      bones: state.bones.map((b) => b.name),

      dt: state.temporal.dt,

    },

  };

  snap.perceptualFeatures = {

    mean: data.reduce((a, v) => a + v, 0) / data.length,

    max: Math.max(...data),

    level: "CPF-4D",

    width,

    height,

    channels: 1,

    meaning: snap.meaning,

  };

  return snap;

}



/** 5×7 bitmap digits 0-9 for monospace index labels. */

const DIGIT5X7 = [

  [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],

  [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],

  [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],

  [0x1f, 0x01, 0x02, 0x06, 0x01, 0x11, 0x0e],

  [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],

  [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],

  [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],

  [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],

  [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],

  [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],

];



/** 5×7 glyphs for ARKit camelCase labels (MSB = left column). */

const CHAR5X7 = Object.freeze({

  " ": [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],

  ":": [0x00, 0x04, 0x00, 0x00, 0x04, 0x00, 0x00],

  ".": [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],

  "|": [0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],

  "0": DIGIT5X7[0],

  "1": DIGIT5X7[1],

  "2": DIGIT5X7[2],

  "3": DIGIT5X7[3],

  "4": DIGIT5X7[4],

  "5": DIGIT5X7[5],

  "6": DIGIT5X7[6],

  "7": DIGIT5X7[7],

  "8": DIGIT5X7[8],

  "9": DIGIT5X7[9],

  a: [0x00, 0x00, 0x0e, 0x01, 0x0f, 0x11, 0x0f],

  b: [0x10, 0x10, 0x16, 0x19, 0x11, 0x11, 0x16],

  c: [0x00, 0x00, 0x0e, 0x10, 0x10, 0x10, 0x0e],

  d: [0x01, 0x01, 0x0d, 0x13, 0x11, 0x11, 0x0d],

  e: [0x00, 0x00, 0x0e, 0x11, 0x1f, 0x10, 0x0e],

  f: [0x06, 0x09, 0x08, 0x1c, 0x08, 0x08, 0x08],

  g: [0x00, 0x00, 0x0d, 0x13, 0x11, 0x0d, 0x03],

  h: [0x10, 0x10, 0x16, 0x19, 0x11, 0x11, 0x11],

  i: [0x04, 0x00, 0x0c, 0x04, 0x04, 0x04, 0x0e],

  j: [0x02, 0x00, 0x06, 0x02, 0x02, 0x12, 0x0c],

  k: [0x10, 0x10, 0x12, 0x14, 0x18, 0x14, 0x12],

  l: [0x0c, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],

  m: [0x00, 0x00, 0x1a, 0x15, 0x15, 0x11, 0x11],

  n: [0x00, 0x00, 0x16, 0x19, 0x11, 0x11, 0x11],

  o: [0x00, 0x00, 0x0e, 0x11, 0x11, 0x11, 0x0e],

  p: [0x00, 0x00, 0x16, 0x19, 0x19, 0x16, 0x10],

  q: [0x00, 0x00, 0x0d, 0x13, 0x13, 0x0d, 0x01],

  r: [0x00, 0x00, 0x16, 0x19, 0x10, 0x10, 0x10],

  s: [0x00, 0x00, 0x0e, 0x10, 0x0e, 0x01, 0x1e],

  t: [0x08, 0x08, 0x1c, 0x08, 0x08, 0x09, 0x06],

  u: [0x00, 0x00, 0x11, 0x11, 0x11, 0x13, 0x0d],

  v: [0x00, 0x00, 0x11, 0x11, 0x11, 0x0a, 0x04],

  w: [0x00, 0x00, 0x11, 0x11, 0x15, 0x15, 0x0a],

  x: [0x00, 0x00, 0x11, 0x0a, 0x04, 0x0a, 0x11],

  y: [0x00, 0x00, 0x11, 0x11, 0x11, 0x0d, 0x01],

  z: [0x00, 0x00, 0x1f, 0x02, 0x04, 0x08, 0x1f],

  A: [0x04, 0x0a, 0x11, 0x11, 0x1f, 0x11, 0x11],

  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],

  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],

  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],

  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],

  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],

  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0e],

  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],

  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],

  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],

  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],

  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],

  M: [0x11, 0x1b, 0x15, 0x11, 0x11, 0x11, 0x11],

  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],

  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],

  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],

  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],

  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],

  S: [0x0e, 0x11, 0x10, 0x0e, 0x01, 0x11, 0x0e],

  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],

  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],

  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],

  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0a],

  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],

  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],

  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],

});



/** Fixed rig-space z span so absolute depth shifts change the depth map (not per-frame min/max). */

const DEPTH_Z_MIN = -0.2;

const DEPTH_Z_MAX = 0.6;



function setPixel(rgba, width, height, x, y, r, g, b, a = 255) {

  const ix = Math.round(x);

  const iy = Math.round(y);

  if (ix < 0 || iy < 0 || ix >= width || iy >= height) return;

  const o = (iy * width + ix) * 4;

  rgba[o] = r;

  rgba[o + 1] = g;

  rgba[o + 2] = b;

  rgba[o + 3] = a;

}



function fillRect(rgba, width, height, x0, y0, w, h, r, g, b) {

  for (let y = y0; y < y0 + h; y++) {

    for (let x = x0; x < x0 + w; x++) {

      setPixel(rgba, width, height, x, y, r, g, b);

    }

  }

}



function drawLine(rgba, width, height, x0, y0, x1, y1, r, g, b) {

  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);

  for (let i = 0; i <= steps; i++) {

    const t = i / steps;

    setPixel(rgba, width, height, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, g, b);

  }

}



function drawGlyphRows(rgba, width, height, rows, x, y, scale, bold, r, g, b) {

  if (!rows) return;

  for (let row = 0; row < 7; row++) {

    for (let col = 0; col < 5; col++) {

      if (rows[row] & (1 << (4 - col))) {

        const bw = bold ? scale + 1 : scale;

        fillRect(rgba, width, height, x + col * scale, y + row * scale, bw, scale, r, g, b);

      }

    }

  }

}



function drawDigit(rgba, width, height, digit, x, y, scale, bold, r, g, b) {

  drawGlyphRows(rgba, width, height, DIGIT5X7[digit], x, y, scale, bold, r, g, b);

}



function drawNumber(rgba, width, height, n, x, y, scale, r, g, b) {

  const s = String(n);

  let cx = x;

  for (let i = 0; i < s.length; i++) {

    drawDigit(rgba, width, height, parseInt(s[i], 10), cx, y, scale, false, r, g, b);

    cx += 6 * scale;

  }

}



/** Bold label: stroke then fill. */

function drawNumberBold(rgba, width, height, n, x, y, scale, r, g, b) {

  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {

    drawNumber(rgba, width, height, n, x + dx, y + dy, scale, 0, 0, 0);

  }

  drawNumber(rgba, width, height, n, x, y, scale, r, g, b);

}



function glyphAdvance(ch, scale) {

  if (ch === " ") return 3 * scale;

  if (ch === ":" || ch === "." || ch === "|") return 4 * scale;

  return 6 * scale;

}



function drawChar(rgba, width, height, ch, x, y, scale, bold, r, g, b) {

  const rows = CHAR5X7[ch];

  if (rows) {

    drawGlyphRows(rgba, width, height, rows, x, y, scale, bold, r, g, b);

    return;

  }

  if (ch >= "0" && ch <= "9") {

    drawDigit(rgba, width, height, ch.charCodeAt(0) - 48, x, y, scale, bold, r, g, b);

  }

}



function drawText(rgba, width, height, text, x, y, scale, bold, r, g, b) {

  let cx = x;

  for (const ch of text) {

    drawChar(rgba, width, height, ch, cx, y, scale, bold, r, g, b);

    cx += glyphAdvance(ch, scale);

  }

}



function whiteBackground(width, height) {

  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < rgba.length; i += 4) {

    rgba[i] = 255;

    rgba[i + 1] = 255;

    rgba[i + 2] = 255;

    rgba[i + 3] = 255;

  }

  return rgba;

}



function projectStateLandmarks(state, width, height) {

  return projectLandmarksFromRig(state, width, height);

}



function normalizeZ(landmarks) {

  const zs = landmarks.map((lm) => lm.z ?? 0);

  const minZ = Math.min(...zs);

  const maxZ = Math.max(...zs);

  const span = Math.max(maxZ - minZ, 1e-6);

  return { minZ, maxZ, span };

}



/**

 * Depth map — z encoded as grayscale (restores dropped depth from 2D ortho debug).

 * @param {import("./face-rig-state.js").FaceRigState} rig

 * @param {number} [width=512]

 * @param {number} [height=512]

 */

export function renderDepthMap(rig, width = 512, height = 512) {

  const rgba = whiteBackground(width, height);

  const pixels = projectStateLandmarks(rig, width, height);

  const depthSpan = DEPTH_Z_MAX - DEPTH_Z_MIN;

  const splatR = 8;



  for (let i = 0; i < pixels.length; i++) {

    const z = rig.landmarks[i].z ?? 0;

    const t = (z - DEPTH_Z_MIN) / depthSpan;

    const v = Math.round(Math.min(255, Math.max(0, t * 255)));

    const { x: px, y: py } = pixels[i];

    for (let oy = -splatR; oy <= splatR; oy++) {

      for (let ox = -splatR; ox <= splatR; ox++) {

        if (ox * ox + oy * oy > splatR * splatR) continue;

        setPixel(rgba, width, height, px + ox, py + oy, v, v, v);

      }

    }

  }



  const png = encodePngRgba8(width, height, rgba);

  const controlHash = hashUint8Array(new Uint8Array(png.buffer, png.byteOffset, png.byteLength));

  const zs = rig.landmarks.map((lm) => lm.z ?? 0);

  const minZ = Math.min(...zs);

  const maxZ = Math.max(...zs);

  return { rgba, width, height, png, controlHash, minZ, maxZ };

}



/**

 * Topology map — bone-colored edges + landmark id labels.

 * @param {import("./face-rig-state.js").FaceRigState} rig

 * @param {FaceRig} [faceRig] — for bottom blendshape bar

 * @param {number} [width=512]

 * @param {number} [height=512]

 */

export function renderColoredByBone(rig, faceRig = null, width = 512, height = 512) {

  const rgba = whiteBackground(width, height);

  const pixels = projectStateLandmarks(rig, width, height);

  const pxById = Object.fromEntries(pixels.map((p) => [p.index, p]));



  for (const [a, b] of BONE_EDGES) {

    const pa = pxById[a];

    const pb = pxById[b];

    if (!pa || !pb) continue;

    const bone = boneNameForLandmark(a);

    const [r, g, bcol] = BONE_COLORS[bone] ?? [128, 128, 128];

    drawLine(rgba, width, height, pa.x, pa.y, pb.x, pb.y, r, g, bcol);

  }



  for (const lm of pixels) {

    const bone = boneNameForLandmark(lm.index);

    const [r, g, b] = BONE_COLORS[bone] ?? [0, 0, 0];

    fillRect(rgba, width, height, lm.x - 2, lm.y - 2, 4, 4, r, g, b);

    const off = CROWDED_LABEL_OFFSET[lm.index] ?? { dx: 4, dy: -16 };

    drawNumberBold(rgba, width, height, lm.index, lm.x + off.dx, lm.y + off.dy, LABEL_SCALE, 0, 0, 0);

  }



  if (faceRig) {

    const barY = height - BAR_HEIGHT;

    fillRect(rgba, width, height, 0, barY, width, BAR_HEIGHT, 245, 245, 245);

    fillRect(rgba, width, height, 0, barY, width, 1, 0, 0, 0);

    drawText(rgba, width, height, formatControlBarText(faceRig), 8, barY + 12, BAR_TEXT_SCALE, true, 0, 0, 0);

  }



  const png = encodePngRgba8(width, height, rgba);

  const controlHash = hashUint8Array(new Uint8Array(png.buffer, png.byteOffset, png.byteLength));

  return { rgba, width, height, png, controlHash };

}



/**

 * Optical flow map for HoloRT4D PathSample.opticalLength conditioning.

 * RG = dx/dy normalized around 128; B = magnitude.

 * @param {import("./face-rig-state.js").FaceRigState} rig

 * @param {number} [width=512]

 * @param {number} [height=512]

 */

export function renderFlow(rig, width = 512, height = 512) {

  const rgba = new Uint8ClampedArray(width * height * 4);

  const flow = rig.temporal.opticalFlow;

  let maxMag = 1e-6;

  for (let i = 0; i < flow.length; i += 2) {

    const dx = flow[i];

    const dy = flow[i + 1];

    maxMag = Math.max(maxMag, Math.hypot(dx, dy));

  }



  for (let y = 0; y < height; y++) {

    for (let x = 0; x < width; x++) {

      const fi = (y * width + x) * 2;

      const dx = flow[fi] ?? 0;

      const dy = flow[fi + 1] ?? 0;

      const mag = Math.hypot(dx, dy) / maxMag;

      const o = (y * width + x) * 4;

      rgba[o] = Math.round(128 + (dx / maxMag) * 127);

      rgba[o + 1] = Math.round(128 + (dy / maxMag) * 127);

      rgba[o + 2] = Math.round(mag * 255);

      rgba[o + 3] = 255;

    }

  }



  const png = encodePngRgba8(width, height, rgba);

  const controlHash = hashUint8Array(new Uint8Array(png.buffer, png.byteOffset, png.byteLength));

  return { rgba, width, height, png, controlHash, maxMag };

}



/**

 * Render all three Turbo control maps.

 * @param {FaceRig} rig

 * @param {number} [width=512]

 * @param {number} [height=512]

 * @param {import("./face-rig-state.js").FaceRigState} [prevState]

 */

export function renderAllTurboControls(rig, width = 512, height = 512, prevState = null) {

  const state = buildFaceRigState(rig, { width, height, prevState });

  const depth = renderDepthMap(state, width, height);

  const topology = renderColoredByBone(state, rig, width, height);

  const flow = renderFlow(state, width, height);

  return { state, depth, topology, flow };

}



/**

 * Legacy 2D orthographic debug plot (partial — prefer topology.png).

 * @param {FaceRig} rig

 * @param {number} [width=512]

 * @param {number} [height=512]

 */

export function renderRigWithNumbers(rig, width = 512, height = 512) {

  const state = buildFaceRigState(rig, { width, height });

  const out = renderColoredByBone(state, rig, width, height);

  return { ...out, controlHash: out.controlHash };

}



/**

 * Build canonical CPF-4D envelope + 3-map control provenance.

 * @param {FaceRig} rig

 * @param {object} [opts]

 */

export function buildFaceRigEnvelopes(rig, opts = {}) {

  const width = opts.width ?? 512;

  const height = opts.height ?? 512;

  const state = opts.rigState ?? buildFaceRigState(rig, { width, height, prevState: opts.prevState ?? null });

  const snapshot = buildFaceRigSnapshot(rig, width, height, state);

  const raw = {

    kind: "CPF-4D",

    fieldId: snapshot.fieldId,

    pixelGrid: { width, height },

    data: snapshot.data,

    palette: null,

  };

  const canonical = buildCanonicalEnvelope(raw, {

    briefId: opts.briefId ?? "holort4d-face-rig",

    waveFieldId: opts.waveFieldId ?? snapshot.fieldId,

    pipelineStage: opts.pipelineStage ?? PIPELINE_STAGES.VISION_BRIDGE,

    statusTag: opts.statusTag ?? STATUS_TAGS.PUBLISHED,

    notes: opts.notes ?? "face-rig CPF-4D blendshape snapshot + 3-map controls",

    channels: 1,

  });

  const cpf4d = buildCPF4DEnvelope(snapshot, {

    briefId: opts.briefId ?? "holort4d-face-rig",

    waveFieldId: opts.waveFieldId ?? snapshot.fieldId,

    source: "face-rig-control",

  });

  const rigHash = hashFloat32Array(snapshot.data);

  const provenance = {

    intent: "face-rig-3map-turbo",

    rigHash,

    controlImageHash: opts.controlHash ?? opts.topologyHash ?? null,

    controlMaps: {

      depth: opts.depthHash ?? null,

      topology: opts.topologyHash ?? opts.controlHash ?? null,

      flow: opts.flowHash ?? null,

    },

    blendshapeCount: ARKIT_BLENDSHAPE_NAMES.length,

    floatCount: FACE_RIG_FLOAT_COUNT,

    landmarkCount: LANDMARK_COUNT,

    status: FACE_RIG_CONTROL_STATUS,

    pipeline: {

      state3d: "enforced",

      depthMap: "enforced",

      topologyMap: "enforced",

      flowMap: "enforced",

      snapshot: "enforced",

      sdTurbo: opts.sdRan ? "partial" : "declared",

      secondPass: "declared",

    },

    honest: {

      prior: "2D orthographic topology debug (z dropped) — not a rig",

      now: "3-map rig: depth + bone topology + optical flow",

    },

  };

  return { snapshot, state, canonical, cpf4d, provenance, rigHash };

}



/** Default demo rig — neutral with readable blendshape bar values. */

export function createDefaultFaceRig(fieldId = "holort4d-face-demo") {

  const blendshapes = new Float32Array(52);

  blendshapes[blendIndex("jawOpen")] = 0.18;

  blendshapes[blendIndex("mouthSmileLeft")] = 0.12;

  blendshapes[blendIndex("mouthSmileRight")] = 0.12;

  blendshapes[blendIndex("browInnerUp")] = 0.08;

  blendshapes[blendIndex("eyeBlinkLeft")] = 0.12;

  return {

    blendshapes,

    headPos: { x: 0, y: 0, z: 0.05 },

    headRot: { x: 0.05, y: 0, z: 0 },

    fieldId,

  };

}



/**

 * Summarize FaceRigState for JSON output (rig-snapshot.json).

 * @param {import("./face-rig-state.js").FaceRigState} state

 */

export function summarizeFaceRigState(state) {

  const zs = state.landmarks.map((lm) => lm.z);

  return {

    fieldId: state.fieldId,

    landmarkCount: state.landmarks.length,

    zRange: { min: Math.min(...zs), max: Math.max(...zs) },

    bones: state.bones.map((b) => b.name),

    temporal: {

      dt: state.temporal.dt,

      hasPrev: state.temporal.prevLandmarks != null,

      flowNonZero: state.temporal.opticalFlow.some((v) => v !== 0),

    },

    landmarks: state.landmarks.map((lm) => ({

      id: lm.id,

      x: lm.x,

      y: lm.y,

      z: lm.z,

      bone: lm.bone,

      controls: lm.controls,

    })),

  };

}


