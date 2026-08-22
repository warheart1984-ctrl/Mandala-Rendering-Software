/**
 * Polar layout + atomic strategy.
 * Float SSBO atomicAdd is the locked baseline. Polar hardware gap is declared.
 * Polar GPU dispatch: BinPaths 256, TiledAccumulate 16×16, PhaseEncode f32. No atomic<f32>.
 */

import { POLAR_BANKS, POLAR_TILE_STRIDE, TILE_SIZE } from "./types.js";
import {
  describeHoloBindGroups,
  HOLO_BIND_SET_TILES,
  HOLO_BIND_SET_PHASE,
  HOLO_LOGICAL_SET_TILES,
  HOLO_LOGICAL_SET_PHASE,
} from "./layouts.js";

export const POLAR_BINPATHS_WORKGROUP = 256;
export const POLAR_TILED_WORKGROUP = Object.freeze([16, 16]);
export const POLAR_PHASE_ENCODE_WORKGROUP = Object.freeze([16, 16]);

export const POLAR_ATOMIC = Object.freeze({
  baseline: "float-ssbo-atomicAdd",
  polarHardware: "declared-gap",
  polarPrimary: "tiled-u32-count",
  fallback: "integer-fixed-point",
  fallbackStatus: "declared",
  floatAtomicFeature: "shader-float32-atomic",
  enabledOnPolarByDefault: false,
  note:
    "Polar primary path is tiled + u32 atomicAdd(count). atomic<f32> is gated behind shader-float32-atomic / supportsFloatAtomic. Polar Vulkan may compile float atomics but hardware does not guarantee true atomicity. Do not enable on Polar by default.",
});

const POLAR_NAME_RE = /polaris|rx\s*580|gcn-?4|gcn\s*4|ellesmere|baffin|lexa|gfx803|polaris10/;

/** Heuristic: live demo GPU is AMD RX 580 Polar. Never auto-enable float atomics. */
export function isPolarDevice(device, opts = {}) {
  if (opts.forcePolar === true) return true;
  if (opts.forcePolar === false) return false;
  const blobs = [
    device?.adapterInfo?.device,
    device?.adapterInfo?.architecture,
    device?.label,
    opts.adapterName,
    opts.label,
  ];
  return blobs.some((s) => typeof s === "string" && POLAR_NAME_RE.test(s.toLowerCase()));
}

/** RX 7000+ optional path. Polar must not take this branch by default. */
export function supportsFloatAtomic(device) {
  const features = device?.features;
  if (!features) return false;
  if (typeof features.has === "function") {
    return features.has("shader-float32-atomic") || features.has("shaderBufferFloat32AtomicAdd");
  }
  if (Array.isArray(features)) {
    return features.includes("shader-float32-atomic") || features.includes("shaderBufferFloat32AtomicAdd");
  }
  return false;
}

/**
 * Gate: requires feature + explicit force. Polar stays tiled unless allowPolarFloatAtomic.
 */
export function shouldUseFloatAtomic(device, opts = {}) {
  if (!supportsFloatAtomic(device)) return false;
  if (opts.forceFloatAtomic !== true) return false;
  if (isPolarDevice(device, opts) && opts.allowPolarFloatAtomic !== true) return false;
  return true;
}

/**
 * Polar dispatch plan. Bind groups match Set 4/5. Prefix-sum headers before BinPaths.
 * GPU live run remains partial until Polar validation; workgroup sizes are enforced in tests.
 */
export function describePolarDispatch(opts = {}) {
  const holoResX = opts.holoResX ?? opts.width ?? 640;
  const holoResY = opts.holoResY ?? opts.height ?? 480;
  const tileSizeX = opts.tileSizeX ?? TILE_SIZE;
  const tileSizeY = opts.tileSizeY ?? TILE_SIZE;
  const numTilesX = Math.ceil(holoResX / tileSizeX);
  const numTilesY = Math.ceil(holoResY / tileSizeY);
  const pathCount = opts.pathCount ?? holoResX * holoResY;
  const gpuAvailable = Boolean(opts.device);
  const bind = describeHoloBindGroups();
  return {
    status: "partial",
    gpuAvailable,
    polarFloatAtomics: false,
    prefixSumBeforeBinPaths: true,
    requiresMaxBindGroups: 4,
    bindGroups: {
      set4: HOLO_BIND_SET_TILES,
      set5: HOLO_BIND_SET_PHASE,
      logicalSet4: HOLO_LOGICAL_SET_TILES,
      logicalSet5: HOLO_LOGICAL_SET_PHASE,
      importsRt4d: false,
      set4Bindings: bind.set4.bindings.map((b) => b.name),
      set5Bindings: bind.set5.bindings.map((b) => b.name),
    },
    kernels: [
      {
        kernelName: "holo_binPaths",
        workgroupSize: POLAR_BINPATHS_WORKGROUP,
        workgroups: Math.ceil(pathCount / POLAR_BINPATHS_WORKGROUP),
        atomics: "u32-count-only",
        after: "prefix-sum TileHeaders.offset (count=0)",
      },
      {
        kernelName: "holo_tiledAccumulate",
        workgroupSize: [...POLAR_TILED_WORKGROUP],
        workgroups: [numTilesX, numTilesY],
        writers: "one-per-pixel",
        atomics: "none",
      },
      {
        kernelName: "holo_phaseEncode",
        workgroupSize: [...POLAR_PHASE_ENCODE_WORKGROUP],
        fieldRead: "f32",
        atomics: "none",
      },
    ],
    rx580: {
      gpu: "AMD RX 580 Polar / Vulkan",
      note: "Do not request shader-float32-atomic. Tiled path only.",
      howToRun: [
        "Use the Vulkan ICD for the RX 580 (radv or amdvlk).",
        "Create a GPUDevice without shader-float32-atomic.",
        "CPU prefix-sum TileHeaders.offset, upload with count=0, then dispatch.",
        "new HoloRT4DGPURenderer(device).dispatch(encoder, rt4d, { paths })",
        "Kernels: BinPaths @256 → TiledAccumulate @16×16 → PhaseEncode @16×16 (f32 reads).",
      ],
    },
  };
}

/** bank = (address/4) % 32. Element (row,col) at stride 17. */
export function polarBank(row, col, stride = POLAR_TILE_STRIDE) {
  return (row * stride + col) % POLAR_BANKS;
}

/** Warp 0 → rows 0–1, warp 1 → rows 2–3, … */
export function polarWarpRows(warpId) {
  return [warpId * 2, warpId * 2 + 1];
}

export function polarTileLayout() {
  return {
    tileSize: TILE_SIZE,
    banks: POLAR_BANKS,
    soa: true,
    tileReal: `shared float tileReal[${TILE_SIZE}][${POLAR_TILE_STRIDE}]`,
    tileImag: `shared float tileImag[${TILE_SIZE}][${POLAR_TILE_STRIDE}]`,
    tileRealWgsl: `array<f32, ${TILE_SIZE * POLAR_TILE_STRIDE}> // ly * 17 + lx; nested [16][17] fails workgroup 16-byte stride`,
    stride: POLAR_TILE_STRIDE,
    status: "partial",
  };
}
