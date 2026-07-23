/**
 * Resolve node-canvas for examples/scripts from @mrs/renderer-core.
 * Throws a clear Windows/toolchain hint when the native addon is missing.
 *
 * Drive-G-1: Browser Canvas2D / ChatGPT widget do not need this module.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const corePkg = path.join(root, "mrs", "packages", "renderer-core", "package.json");

const INSTALL_HINT = `Native \`canvas\` failed to load.

Headless PNG examples need the cairo-backed node-canvas addon.
Browser Canvas2D / ChatGPT widget do not.

On Windows:
  1. VS Build Tools + "Desktop development with C++"
     https://github.com/Automattic/node-canvas/wiki/Installation:-Windows
  2. cd mrs && pnpm run setup
  3. Node.js 20+

Underlying details follow.`;

function loadCanvas() {
  try {
    const require = createRequire(corePkg);
    return require("canvas");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const wrapped = new Error(`${INSTALL_HINT}\n\nUnderlying: ${message}`);
    wrapped.cause = err;
    throw wrapped;
  }
}

const canvasMod = loadCanvas();
export const createCanvas = canvasMod.createCanvas.bind(canvasMod);
export const canvasPackage = canvasMod;
