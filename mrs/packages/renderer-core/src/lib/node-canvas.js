/**
 * Load the native `canvas` package with an actionable error when the addon is missing.
 *
 * Drive-G-1: Windows headless PNG needs a working toolchain (or matching prebuild).
 * Browser Canvas2D / ChatGPT widget paths do not use this module.
 */

import { createRequire } from "node:module";

const INSTALL_HINT = `Native \`canvas\` failed to load.

Headless PNG (CLI \`4d-render\`, gallery generate, ExportManager image) needs the
cairo-backed node-canvas native addon. Browser Canvas2D and the ChatGPT widget do not.

On Windows:
  1. Install Visual Studio Build Tools with "Desktop development with C++"
     https://github.com/Automattic/node-canvas/wiki/Installation:-Windows
  2. From mrs/:  pnpm run setup
     (same as: pnpm install && pnpm rebuild canvas esbuild)
  3. Use Node.js 20+ matching the ABI used at rebuild time

On macOS/Linux: ensure cairo/pango deps per the node-canvas wiki, then rebuild.
If a prior pnpm install left sticky ignoredBuilds: pnpm rebuild canvas esbuild`;

/**
 * @returns {typeof import("canvas")}
 */
export function loadNodeCanvas() {
  try {
    const require = createRequire(import.meta.url);
    return require("canvas");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const wrapped = new Error(`${INSTALL_HINT}\n\nUnderlying: ${message}`);
    wrapped.cause = err;
    throw wrapped;
  }
}

/**
 * @returns {typeof import("canvas") | null}
 */
export function tryLoadNodeCanvas() {
  try {
    return loadNodeCanvas();
  } catch {
    return null;
  }
}

/** @returns {import("canvas").createCanvas} */
export function createCanvas(...args) {
  const { createCanvas: create } = loadNodeCanvas();
  return create(...args);
}
