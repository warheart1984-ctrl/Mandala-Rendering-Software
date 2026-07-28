/**
 * Dual-layout path resolution for proton-raster-bridge (Docker-copied sibling).
 *
 * Same contract as renderer-core/scripts/lib/resolveDualLayout.mjs — kept local
 * so the flattened `/app/proton-raster-bridge` image does not need a cross-tree
 * static import at module load time.
 *
 * STATUS: **enforced** for existsSync candidate picking.
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * @param {...string} candidates
 * @returns {string|null}
 */
export function firstExistingPath(...candidates) {
  for (const c of candidates) {
    if (!c) continue;
    const p = resolve(c);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * @param {string|null} absPath
 * @returns {string}
 */
export function toFileUrl(absPath) {
  if (!absPath) {
    throw new Error("toFileUrl: path is null");
  }
  return pathToFileURL(absPath).href;
}

/**
 * @param {string} fromDir
 * @returns {string}
 */
export function resolveProtonIndexPath(fromDir) {
  const env = (process.env.PROTON_INDEX_MODULE || "").trim();
  const found = firstExistingPath(
    env || null,
    join(fromDir, "../../packages/renderer-core/src/render/rt4d/proton/index.js"),
    join(fromDir, "../renderer-core/src/render/rt4d/proton/index.js"),
    join(fromDir, "../src/render/rt4d/proton/index.js"),
    "/app/renderer-core/src/render/rt4d/proton/index.js",
  );
  if (!found) {
    throw new Error(
      "proton/index.js not found (set PROTON_INDEX_MODULE). Tried monorepo packages/ and Docker /app/renderer-core.",
    );
  }
  return found;
}

/**
 * @param {string} fromDir
 * @returns {string}
 */
export function resolveEncodePngPath(fromDir) {
  const env = (
    process.env.PROTON_ENCODE_PNG_SCRIPT ||
    process.env.RT4D_SCRIPT_PATH ||
    ""
  ).trim();
  const found = firstExistingPath(
    env || null,
    join(fromDir, "../../packages/renderer-core/scripts/render-still.mjs"),
    join(fromDir, "../renderer-core/scripts/render-still.mjs"),
    join(fromDir, "render-still.mjs"),
    "/app/renderer-core/scripts/render-still.mjs",
  );
  if (!found) {
    throw new Error(
      "render-still.mjs not found (set RT4D_SCRIPT_PATH or PROTON_ENCODE_PNG_SCRIPT).",
    );
  }
  return found;
}

/**
 * @param {string|URL} metaUrl
 */
export function scriptDir(metaUrl) {
  return dirname(fileURLToPath(metaUrl));
}
