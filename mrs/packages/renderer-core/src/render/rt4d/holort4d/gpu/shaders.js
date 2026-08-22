/**
 * HoloRT4D GPU shader strings. .wgsl files in this directory are SoT.
 * Frozen PathSample is 64 bytes (path-sample.js). Polar tiled path: no atomic<f32>.
 * Loaded from disk so WGSL comments cannot break JS template literals.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const load = (name) => readFileSync(join(dir, name), "utf8");

export const HOLO_PATH_FINALIZE_WGSL = load("HoloRT4D_PathFinalize.comp.wgsl");
export const HOLO_BIN_PATHS_WGSL = load("HoloRT4D_BinPaths.comp.wgsl");
export const HOLO_TILED_ACCUMULATE_WGSL = load("HoloRT4D_TiledAccumulate.comp.wgsl");
export const HOLO_ACCUMULATE_ATOMIC_WGSL = load("HoloRT4D_AccumulateAtomic.comp.wgsl");
export const HOLO_PHASE_ENCODE_WGSL = load("HoloRT4D_PhaseEncode.comp.wgsl");
export const HOLO_PHASE_ENCODE_ATOMIC_WGSL = load("HoloRT4D_PhaseEncodeAtomic.comp.wgsl");
/** Declared debug encode. Not Polar default. Not dispatched. Plain f32 field reads. */
export const HOLO_DEBUG_REAL_IMAG_WGSL = load("HoloRT4D_DebugRealImag.comp.wgsl");

/** Polar tiled + bin + f32 PhaseEncode. Must not contain atomic<f32>. Atomic encode is gated separately. */
export const POLAR_SAFE_WGSL = [
  HOLO_BIN_PATHS_WGSL,
  HOLO_TILED_ACCUMULATE_WGSL,
  HOLO_PHASE_ENCODE_WGSL,
];
