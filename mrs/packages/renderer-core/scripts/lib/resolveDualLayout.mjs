/**
 * Dual-layout path resolution for monorepo vs flattened Docker `/app` layout.
 *
 * Layouts (mirrors `mrs/adapters/storyforge-boundary/paths.py`):
 *   * Monorepo: `<repo>/mrs/packages/...`, `<repo>/mrs/adapters/...`
 *   * Docker: `/app/renderer-core`, `/app/proton-raster-bridge`, `/app/engine3d-core`
 *
 * STATUS: **enforced** for existsSync candidate picking; not a governance gate.
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
 * Resolve mintCir.js from renderer-core/scripts or proton-raster-bridge cwd.
 * ENV: PROTON_MINTCIR_SCRIPT
 *
 * @param {string} fromDir absolute directory of the calling script
 * @returns {string} absolute path
 */
export function resolveMintCirPath(fromDir) {
  const env = (process.env.PROTON_MINTCIR_SCRIPT || "").trim();
  const found = firstExistingPath(
    env || null,
    // Monorepo: mrs/packages/renderer-core/scripts → mrs/adapters/proton-raster-bridge
    join(fromDir, "../../../adapters/proton-raster-bridge/mintCir.js"),
    // Monorepo from adapter dir itself
    join(fromDir, "mintCir.js"),
    // Docker flattened: /app/renderer-core/scripts → /app/proton-raster-bridge
    join(fromDir, "../../proton-raster-bridge/mintCir.js"),
    // Docker from /app/proton-raster-bridge
    join(fromDir, "../proton-raster-bridge/mintCir.js"),
    "/app/proton-raster-bridge/mintCir.js",
  );
  if (!found) {
    throw new Error(
      "mintCir.js not found (set PROTON_MINTCIR_SCRIPT). Tried monorepo adapters/ and Docker /app/proton-raster-bridge.",
    );
  }
  return found;
}

/**
 * Resolve proton index.js module.
 * ENV: PROTON_INDEX_MODULE (absolute path to index.js)
 *
 * @param {string} fromDir absolute directory of the calling script
 * @returns {string} absolute path
 */
export function resolveProtonIndexPath(fromDir) {
  const env = (process.env.PROTON_INDEX_MODULE || "").trim();
  const found = firstExistingPath(
    env || null,
    // From renderer-core/scripts
    join(fromDir, "../src/render/rt4d/proton/index.js"),
    // Monorepo from proton-raster-bridge
    join(fromDir, "../../packages/renderer-core/src/render/rt4d/proton/index.js"),
    // Docker from proton-raster-bridge → /app/renderer-core
    join(fromDir, "../renderer-core/src/render/rt4d/proton/index.js"),
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
 * Resolve render-still.mjs (PNG encoder export).
 * ENV: RT4D_SCRIPT_PATH | PROTON_ENCODE_PNG_SCRIPT
 *
 * @param {string} fromDir absolute directory of the calling script
 * @returns {string} absolute path
 */
export function resolveEncodePngPath(fromDir) {
  const env = (
    process.env.PROTON_ENCODE_PNG_SCRIPT ||
    process.env.RT4D_SCRIPT_PATH ||
    ""
  ).trim();
  const found = firstExistingPath(
    env || null,
    // From renderer-core/scripts (same dir)
    join(fromDir, "render-still.mjs"),
    // Monorepo from proton-raster-bridge
    join(fromDir, "../../packages/renderer-core/scripts/render-still.mjs"),
    // Docker from proton-raster-bridge
    join(fromDir, "../renderer-core/scripts/render-still.mjs"),
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
 * Helper dirname from import.meta.url
 * @param {string|URL} metaUrl
 */
export function scriptDir(metaUrl) {
  return dirname(fileURLToPath(metaUrl));
}
