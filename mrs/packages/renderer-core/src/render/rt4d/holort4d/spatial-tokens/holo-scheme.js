/**
 * Holo-Scheme V1 — ChatGPT-facing compact spatial payload.
 *
 * Primary product shape for Custom GPT Actions ($1 Spatial Plugin).
 * Wraps / complements HoloRT4D-Spatial-V1 math tokens.
 *
 * Status:
 * - 8×8 categorical depth bins: enforced (deterministic from depth grid)
 * - environment_type / realism_index: partial heuristics
 * - meters / calibrated world units: declared (not claimed unless calibrated)
 */

import { createHash } from "node:crypto";
import { clampByte } from "./types.js";
import { tokenizeFromDepthGrid } from "./tokenize.js";

export const HOLO_SCHEME_AUTH = "VERIFIED_MATH_ENGINE_RX580";
export const HOLO_SCHEME_UNIT_COST = "$1.00";
export const HOLO_SCHEME_EXECUTION_INSTRUCTION =
  "Use these Z-numbers to interpret the 2D image as a 4D volume. No guessing required. Apply geometric constraints to all future reasoning.";

export const HOLO_SCHEME_STATUS = Object.freeze({
  spatial_grid_8x8: "enforced",
  environment_type: "partial",
  face_topography: "partial",
  realism_index: "partial",
  metersCalibration: "declared",
  note:
    "Bins are categorical 0(bg)→255(fg). realism_index is a heuristic, not anatomical truth. Meter claims require declared calibration.",
});

/**
 * @typedef {object} HoloSchemeV1
 * @property {string} scheme_auth
 * @property {string} unit_cost
 * @property {object} spatial_metadata
 * @property {object} global_scene
 * @property {number[][]} spatial_grid_8x8
 * @property {object} subject_analysis
 * @property {string} execution_instruction
 * @property {string} hash
 * @property {object} [status]
 * @property {object} [spatial_v1]
 */

/**
 * Build Holo-Scheme V1 from a dense depth grid.
 *
 * @param {object} args
 * @param {Float32Array|number[]} args.depthGrid
 * @param {number} args.width
 * @param {number} args.height
 * @param {import('./face.js').FaceRigLike} [args.faceRig]
 * @param {boolean} [args.includeSpatialV1=false] attach full HoloRT4D-Spatial-V1 token
 * @returns {HoloSchemeV1}
 */
export function buildHoloSchemeV1({
  depthGrid,
  width,
  height,
  faceRig,
  includeSpatialV1 = false,
}) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
    throw new Error("width/height must be positive");
  }
  const n = w * h;
  if (!depthGrid || depthGrid.length < n) {
    throw new Error(`depthGrid length ${(depthGrid && depthGrid.length) || 0} < width*height ${n}`);
  }

  const { grid, depthMin, depthMax } = downsampleDepth8x8(depthGrid, w, h);
  const flat = flattenGrid(grid);
  const center_depth_val = grid[3][3] | 0; // near-center of 8×8
  const lighting_slope = computeLightingSlope(grid);
  const environment_type = inferEnvironmentType(grid); // partial
  const body_silhouette = inferBodySilhouette(flat);
  const face_topography = buildFaceTopography(faceRig, flat, depthMin, depthMax);

  /** @type {Omit<HoloSchemeV1, 'hash'> & { hash?: string }} */
  const scheme = {
    scheme_auth: HOLO_SCHEME_AUTH,
    unit_cost: HOLO_SCHEME_UNIT_COST,
    spatial_metadata: {
      dimensions: [w | 0, h | 0],
      depth_bins: 256,
      method: "Categorical_Distribution_NonAI",
      temporal_persistence: "4D_Active",
    },
    global_scene: {
      center_depth_val,
      environment_type,
      lighting_slope,
    },
    spatial_grid_8x8: grid,
    subject_analysis: {
      body_silhouette,
      face_topography,
    },
    execution_instruction: HOLO_SCHEME_EXECUTION_INSTRUCTION,
    status: { ...HOLO_SCHEME_STATUS },
  };

  if (includeSpatialV1) {
    scheme.spatial_v1 = tokenizeFromDepthGrid(depthGrid, {
      width: w,
      height: h,
      resolution: 8,
      faceRig,
      meta: { wrapped_by: "Holo-Scheme-V1" },
    });
  }

  const hash = hashHoloScheme(scheme);
  scheme.hash = hash;
  return /** @type {HoloSchemeV1} */ (scheme);
}

/**
 * Deterministic SHA-256 of canonical Holo-Scheme JSON (hash field excluded).
 * @param {object} scheme
 * @returns {string}
 */
export function hashHoloScheme(scheme) {
  const json = canonicalHoloSchemeJson(scheme);
  return createHash("sha256").update(json, "utf8").digest("hex");
}

/**
 * Canonical JSON for hashing — sorted keys, no `hash` / `spatial_v1` / `status`.
 * @param {object} scheme
 * @returns {string}
 */
export function canonicalHoloSchemeJson(scheme) {
  const root = {
    execution_instruction: String(scheme.execution_instruction ?? HOLO_SCHEME_EXECUTION_INSTRUCTION),
    global_scene: {
      center_depth_val: (scheme.global_scene?.center_depth_val ?? 0) | 0,
      environment_type: String(scheme.global_scene?.environment_type ?? "unknown"),
      lighting_slope: round6(scheme.global_scene?.lighting_slope ?? 0),
    },
    scheme_auth: String(scheme.scheme_auth ?? HOLO_SCHEME_AUTH),
    spatial_grid_8x8: (scheme.spatial_grid_8x8 ?? []).map((row) =>
      (row ?? []).map((v) => clampByte(v)),
    ),
    spatial_metadata: {
      depth_bins: (scheme.spatial_metadata?.depth_bins ?? 256) | 0,
      dimensions: [
        (scheme.spatial_metadata?.dimensions?.[0] ?? 0) | 0,
        (scheme.spatial_metadata?.dimensions?.[1] ?? 0) | 0,
      ],
      method: String(scheme.spatial_metadata?.method ?? "Categorical_Distribution_NonAI"),
      temporal_persistence: String(
        scheme.spatial_metadata?.temporal_persistence ?? "4D_Active",
      ),
    },
    subject_analysis: {
      body_silhouette: String(scheme.subject_analysis?.body_silhouette ?? "none"),
      face_topography: {
        eye_socket_z: (scheme.subject_analysis?.face_topography?.eye_socket_z ?? 0) | 0,
        forehead_slope: String(
          scheme.subject_analysis?.face_topography?.forehead_slope ?? "0.00_rad",
        ),
        nose_tip_z: (scheme.subject_analysis?.face_topography?.nose_tip_z ?? 0) | 0,
        realism_index: round6(scheme.subject_analysis?.face_topography?.realism_index ?? 0),
      },
    },
    unit_cost: String(scheme.unit_cost ?? HOLO_SCHEME_UNIT_COST),
  };
  return JSON.stringify(root);
}

/**
 * Compact chat text for GPT paste / reasoning.
 * @param {HoloSchemeV1} scheme
 * @returns {string}
 */
export function formatHoloSchemeForLLM(scheme) {
  const rows = (scheme.spatial_grid_8x8 ?? [])
    .map((row, y) => `  R${y}: [${(row ?? []).join(",")}]`)
    .join("\n");
  const ft = scheme.subject_analysis?.face_topography ?? {};
  const gs = scheme.global_scene ?? {};
  return [
    `HOLO-SCHEME V1 auth=${scheme.scheme_auth} hash=sha256:${scheme.hash}`,
    `COST ${scheme.unit_cost} method=${scheme.spatial_metadata?.method}`,
    `DIM ${scheme.spatial_metadata?.dimensions?.[0]}x${scheme.spatial_metadata?.dimensions?.[1]} depth_bins=${scheme.spatial_metadata?.depth_bins}`,
    `SCENE center_z=${gs.center_depth_val} env=${gs.environment_type} lighting_slope=${gs.lighting_slope}`,
    `GRID 8x8 (0=bg … 255=fg):`,
    rows,
    `SUBJECT ${scheme.subject_analysis?.body_silhouette}`,
    `FACE nose_z=${ft.nose_tip_z} eye_z=${ft.eye_socket_z} forehead=${ft.forehead_slope} realism=${ft.realism_index} (partial heuristic)`,
    `INSTRUCTION ${scheme.execution_instruction}`,
    `NOTE meters/angles calibrated: declared (not claimed). Do not invent distances beyond bin geometry.`,
  ].join("\n");
}

/**
 * @param {Float32Array|number[]} depth
 * @param {number} width
 * @param {number} height
 */
function downsampleDepth8x8(depth, width, height) {
  let lo = Infinity;
  let hi = -Infinity;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const v = Number(depth[i]);
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = 1;
  }
  if (hi === lo) hi = lo + 1;
  const span = hi - lo;

  const cellW = width / 8;
  const cellH = height / 8;
  /** @type {number[][]} */
  const grid = [];
  for (let cy = 0; cy < 8; cy++) {
    /** @type {number[]} */
    const row = [];
    for (let cx = 0; cx < 8; cx++) {
      const x0 = Math.floor(cx * cellW);
      const y0 = Math.floor(cy * cellH);
      const x1 = Math.min(width, Math.ceil((cx + 1) * cellW));
      const y1 = Math.min(height, Math.ceil((cy + 1) * cellH));
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const v = Number(depth[y * width + x]);
          if (!Number.isFinite(v)) continue;
          sum += v;
          count += 1;
        }
      }
      const mean = count > 0 ? sum / count : lo;
      // Nearer / higher relative depth → higher bin (255 = foreground)
      row.push(clampByte(((mean - lo) / span) * 255));
    }
    grid.push(row);
  }
  return { grid, depthMin: lo, depthMax: hi };
}

/** @param {number[][]} grid */
function flattenGrid(grid) {
  /** @type {number[]} */
  const out = [];
  for (const row of grid) for (const v of row) out.push(v);
  return out;
}

/** @param {number[][]} grid */
function computeLightingSlope(grid) {
  let sum = 0;
  let n = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const c = grid[y][x];
      const r = grid[y][Math.min(7, x + 1)];
      const d = grid[Math.min(7, y + 1)][x];
      sum += Math.abs(r - c) + Math.abs(d - c);
      n += 2;
    }
  }
  const mean = n > 0 ? sum / n : 0;
  // Normalize vs max step 255 → [0,1], round6
  return round6(Math.min(1, mean / 64));
}

/**
 * Partial environment heuristic from depth distribution.
 * @param {number[][]} grid
 */
function inferEnvironmentType(grid) {
  const flat = flattenGrid(grid);
  const mean = flat.reduce((a, b) => a + b, 0) / flat.length;
  let varSum = 0;
  for (const v of flat) varSum += (v - mean) ** 2;
  const variance = varSum / flat.length;
  const center = grid[3][3];
  const edgeMean =
    (grid[0][0] + grid[0][7] + grid[7][0] + grid[7][7] + grid[0][3] + grid[7][3]) / 6;

  if (center > edgeMean + 40 && variance > 800) return "subject_foreground";
  if (variance < 400) return "interior_planar";
  if (mean < 80) return "distant_exterior";
  return "interior_planar";
}

/** @param {number[]} flat */
function inferBodySilhouette(flat) {
  const hits = flat.filter((v) => v >= 120 && v <= 255).length;
  if (hits >= 8) return "detected_at_bins_120_255";
  if (hits > 0) return `partial_bins_120_255_count_${hits}`;
  return "none";
}

/**
 * Face topography from FaceRigState landmark z when available (partial).
 * Synthetic defaults when not.
 * @param {import('./face.js').FaceRigLike|undefined} faceRig
 * @param {number[]} flatGrid
 * @param {number} depthMin
 * @param {number} depthMax
 */
function buildFaceTopography(faceRig, flatGrid, depthMin, depthMax) {
  const defaults = {
    nose_tip_z: 255,
    eye_socket_z: 210,
    forehead_slope: "0.12_rad",
    realism_index: 0.98,
  };

  if (!faceRig || !Array.isArray(faceRig.landmarks) || faceRig.landmarks.length === 0) {
    // Use grid-derived foreground as soft defaults when no landmarks
    const hi = Math.max(...flatGrid);
    const mid = flatGrid.slice().sort((a, b) => a - b)[Math.floor(flatGrid.length * 0.7)] ?? 210;
    return {
      nose_tip_z: hi,
      eye_socket_z: mid,
      forehead_slope: defaults.forehead_slope,
      realism_index: round6(Math.min(0.98, 0.5 + hi / 512)),
      source: "synthetic_defaults",
      status: "partial",
    };
  }

  const span = depthMax - depthMin || 1;
  const toBin = (z) => clampByte(((Number(z) - depthMin) / span) * 255);

  const byId = (id) => faceRig.landmarks.find((l) => Number(l.id) === id);
  const nose = byId(30) ?? byId(33) ?? faceRig.landmarks[Math.min(30, faceRig.landmarks.length - 1)];
  const eyeL = byId(36) ?? byId(39);
  const eyeR = byId(42) ?? byId(45);
  const brow = byId(27) ?? byId(21) ?? byId(22);

  const noseZ = nose?.z != null ? toBin(nose.z) : defaults.nose_tip_z;
  let eyeZ = defaults.eye_socket_z;
  if (eyeL?.z != null || eyeR?.z != null) {
    const zs = [eyeL?.z, eyeR?.z].filter((z) => z != null).map(Number);
    eyeZ = toBin(zs.reduce((a, b) => a + b, 0) / zs.length);
  }

  let forehead_slope = defaults.forehead_slope;
  if (brow?.z != null && nose?.z != null) {
    const dz = Number(nose.z) - Number(brow.z);
    const rad = Math.atan2(dz, span);
    forehead_slope = `${round6(rad)}_rad`;
  }

  // Partial realism: landmark coverage + z spread (NOT anatomical truth)
  const withZ = faceRig.landmarks.filter((l) => l.z != null && Number.isFinite(Number(l.z)));
  const coverage = withZ.length / Math.max(1, faceRig.landmarks.length);
  const realism_index = round6(Math.min(0.98, 0.55 + coverage * 0.4));

  return {
    nose_tip_z: noseZ,
    eye_socket_z: eyeZ,
    forehead_slope,
    realism_index,
    source: "face_rig_landmarks",
    status: "partial",
  };
}

/** @param {number} n */
function round6(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 1e6) / 1e6;
}
