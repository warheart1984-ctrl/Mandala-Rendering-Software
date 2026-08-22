/**
 * HoloRT4D Spatial Token types — scheme HoloRT4D-Spatial-V1.
 */

import { SPATIAL_TOKEN_SCHEME } from "./status.js";

/**
 * @typedef {object} GridCell
 * @property {number} cell          cell index 0..(resolution²-1), row-major
 * @property {number} depth         quantized depth 0–255
 * @property {number} curvature     mean absolute Laplacian / slope magnitude
 * @property {[number, number, number]} normal  unit normal (nx, ny, nz)
 * @property {string} [object]      optional label (face region / heuristic)
 * @property {{dx:number, dy:number, mag:number}} [motion]  optional motion
 */

/**
 * @typedef {object} SpatialToken
 * @property {string} scheme
 * @property {number} resolution
 * @property {number} width
 * @property {number} height
 * @property {GridCell[]} cells
 * @property {object} [meta]
 */

/**
 * @param {Partial<GridCell>} partial
 * @returns {GridCell}
 */
export function createGridCell(partial = {}) {
  const normal = partial.normal ?? [0, 0, 1];
  /** @type {GridCell} */
  const cell = {
    cell: Number(partial.cell ?? 0),
    depth: clampByte(partial.depth ?? 0),
    curvature: Number(partial.curvature ?? 0),
    normal: [Number(normal[0]), Number(normal[1]), Number(normal[2])],
  };
  if (partial.object != null) cell.object = String(partial.object);
  if (partial.motion != null) {
    cell.motion = {
      dx: Number(partial.motion.dx ?? 0),
      dy: Number(partial.motion.dy ?? 0),
      mag: Number(partial.motion.mag ?? 0),
    };
  }
  return cell;
}

/**
 * @param {object} opts
 * @returns {SpatialToken}
 */
export function createSpatialToken(opts = {}) {
  return {
    scheme: opts.scheme ?? SPATIAL_TOKEN_SCHEME,
    resolution: Number(opts.resolution ?? 16),
    width: Number(opts.width ?? 0),
    height: Number(opts.height ?? 0),
    cells: Array.isArray(opts.cells) ? opts.cells : [],
    meta: opts.meta ?? undefined,
  };
}

/** @param {number} v */
export function clampByte(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, n));
}

/**
 * Canonical JSON for hashing — sorted keys, fixed numeric formatting.
 * @param {SpatialToken} token
 * @returns {string}
 */
export function canonicalTokenJson(token) {
  const cells = [...(token.cells ?? [])]
    .sort((a, b) => a.cell - b.cell)
    .map((c) => {
      /** @type {Record<string, unknown>} */
      const o = {
        cell: c.cell | 0,
        curvature: round6(c.curvature),
        depth: c.depth | 0,
        normal: [
          round6(c.normal[0]),
          round6(c.normal[1]),
          round6(c.normal[2]),
        ],
      };
      if (c.object != null) o.object = c.object;
      if (c.motion != null) {
        o.motion = {
          dx: round6(c.motion.dx),
          dy: round6(c.motion.dy),
          mag: round6(c.motion.mag),
        };
      }
      return o;
    });

  /** @type {Record<string, unknown>} */
  const root = {
    cells,
    height: token.height | 0,
    resolution: token.resolution | 0,
    scheme: String(token.scheme ?? SPATIAL_TOKEN_SCHEME),
    width: token.width | 0,
  };
  if (token.meta != null) root.meta = sortKeysDeep(token.meta);
  return JSON.stringify(root);
}

/** @param {number} n */
function round6(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 1e6) / 1e6;
}

/** @param {unknown} v */
function sortKeysDeep(v) {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === "object") {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const k of Object.keys(/** @type {object} */ (v)).sort()) {
      out[k] = sortKeysDeep(/** @type {Record<string, unknown>} */ (v)[k]);
    }
    return out;
  }
  return v;
}
