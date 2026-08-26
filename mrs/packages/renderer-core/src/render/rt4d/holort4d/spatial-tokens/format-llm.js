/**
 * LLM-optimized Spatial Scheme text formatter.
 * Status: enforced (deterministic string for same token / scheme).
 */

import { hashSpatialToken } from "./hash.js";
import { formatHoloSchemeForLLM } from "./holo-scheme.js";

/**
 * Compact text ChatGPT understands best from a HoloRT4D-Spatial-V1 token.
 *
 * @param {import('./types.js').SpatialToken} token
 * @param {object} [opts]
 * @param {string} [opts.hash] precomputed hash
 * @returns {string}
 */
export function formatForLLM(token, opts = {}) {
  if (token && token.spatial_grid_8x8 && token.scheme_auth) {
    return formatHoloSchemeForLLM(token);
  }

  const hash = opts.hash ?? hashSpatialToken(token);
  const res = token.resolution | 0;
  const lines = [
    `SCHEME HoloRT4D-Spatial-V1 hash=sha256:${hash}`,
    `GRID ${res}x${res} depth_bins=256`,
  ];

  const cells = [...(token.cells ?? [])].sort((a, b) => a.cell - b.cell);
  for (const c of cells) {
    const cx = c.cell % res;
    const cy = Math.floor(c.cell / res);
    const n = c.normal ?? [0, 0, 1];
    const obj = c.object ? ` object=${c.object}` : "";
    const curv = Number.isFinite(c.curvature) ? c.curvature.toFixed(2) : "0.00";
    lines.push(
      `CELL(${cx},${cy}): depth=${c.depth | 0} curvature=${curv} normal=[${fmt3(n[0])},${fmt3(n[1])},${fmt3(n[2])}]${obj}`,
    );
  }

  const faceCells = cells.filter((c) => c.object && String(c.object).startsWith("face."));
  if (faceCells.length > 0) {
    const meanCurv =
      faceCells.reduce((s, c) => s + (c.curvature || 0), 0) / faceCells.length;
    lines.push(
      `OBJECTS: subject type=face curvature_index=${meanCurv.toFixed(2)} cells=${faceCells.length}`,
    );
  } else {
    lines.push("OBJECTS: none");
  }

  const depths = cells.map((c) => c.depth | 0);
  const floor_depth = depths.length ? Math.min(...depths) : 0;
  const ceiling = depths.length ? Math.max(...depths) : 0;
  lines.push(`ENVIRONMENT: floor_depth=${floor_depth} ceiling=${ceiling}`);
  lines.push(
    "NOTE: depth bins are categorical 0–255. Meter/angle claims require calibration (declared).",
  );

  return lines.join("\n");
}

/** @param {number} x */
function fmt3(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "0.0";
  return (Math.round(n * 100) / 100).toFixed(1).replace(/\.0$/, ".0");
}
