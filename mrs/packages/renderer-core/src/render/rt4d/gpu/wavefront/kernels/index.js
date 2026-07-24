/**
 * Load WGSL sources for wavefront stubs (Node-friendly).
 * Browser hosts may use the embedded defaults in WebGpuRhi instead.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

function load(name) {
  try {
    return readFileSync(join(dir, name), "utf8");
  } catch {
    return null;
  }
}

export const GENERATE_WGSL = load("generate.wgsl");
export const EXTEND_WGSL = load("extend.wgsl");
export const SHADE_WGSL = load("shade.wgsl");
export const ACCUMULATE_WGSL = load("accumulate.wgsl");

export const WAVEFRONT_WGSL = Object.freeze({
  rt4d_wavefront_generate: GENERATE_WGSL,
  rt4d_wavefront_extend: EXTEND_WGSL,
  rt4d_wavefront_shade: SHADE_WGSL,
  rt4d_wavefront_accumulate: ACCUMULATE_WGSL,
});
