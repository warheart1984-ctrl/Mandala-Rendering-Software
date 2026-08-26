/**
 * Minimal TypeScript surface for the SDK scaffold.
 */

export type GridCell = {
  cell: number;
  depth: number;
  curvature: number;
  normal: [number, number, number];
  object?: string;
  motion?: { dx: number; dy: number; mag: number };
};

export type SpatialToken = {
  scheme: string;
  resolution: number;
  width: number;
  height: number;
  cells: GridCell[];
  meta?: Record<string, unknown>;
};

export declare const SPATIAL_TOKEN_SCHEME: "HoloRT4D-Spatial-V1";
export declare const SPATIAL_TOKEN_STATUS: Readonly<Record<string, string>>;

export declare function tokenizeFromDepthGrid(
  depthF32: Float32Array | number[],
  opts: {
    width: number;
    height: number;
    resolution?: 8 | 16;
    prevDepth?: Float32Array | number[];
    faceRig?: { landmarks: Array<{ id?: number; x: number; y: number; z?: number }> };
    meta?: Record<string, unknown>;
  },
): SpatialToken;

export declare function hashSpatialToken(token: SpatialToken): string;
export declare function tokenize(
  depthF32: Float32Array | number[],
  opts: Parameters<typeof tokenizeFromDepthGrid>[1],
): SpatialToken;

export declare class HoloRT4DClient {
  constructor(opts?: { baseUrl?: string; fetchImpl?: typeof fetch });
  status(): Promise<Record<string, unknown>>;
  tokenize(body: Record<string, unknown>): Promise<Record<string, unknown>>;
}
