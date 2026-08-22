/**
 * Load HoloRT4D spatial-tokens math core (renderer-core SoT).
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** mcp/src/internal → repo root */
export const REPO_ROOT = path.resolve(__dirname, "../../../../../../");

const CORE_PATH = path.join(
  REPO_ROOT,
  "mrs/packages/renderer-core/src/render/rt4d/holort4d/spatial-tokens/index.js"
);

export type SpatialToken = {
  scheme: string;
  resolution: number;
  width: number;
  height: number;
  cells: Array<{
    cell: number;
    depth: number;
    curvature: number;
    normal: [number, number, number];
    object?: string;
    motion?: { dx: number; dy: number; mag: number };
  }>;
  meta?: Record<string, unknown>;
};

export type SpatialCore = {
  SPATIAL_TOKEN_SCHEME: string;
  SPATIAL_TOKEN_STATUS: Readonly<Record<string, string>>;
  tokenizeFromDepthGrid: (
    depth: Float32Array | number[],
    opts: Record<string, unknown>
  ) => SpatialToken;
  hashSpatialToken: (token: SpatialToken) => string;
  canonicalTokenJson: (token: SpatialToken) => string;
  grayscalePseudoDepth: (
    rgba: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number
  ) => Float32Array;
  IMAGE_PSEUDO_DEPTH_STATUS: Readonly<Record<string, string>>;
  faceRigFromLandmarkXYZ: (xyz: Float32Array | number[]) => unknown;
};

let cached: SpatialCore | null = null;

export async function loadSpatialCore(): Promise<SpatialCore> {
  if (cached) return cached;
  cached = (await import(pathToFileURL(CORE_PATH).href)) as SpatialCore;
  return cached;
}
