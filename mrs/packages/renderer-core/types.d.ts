/**
 * Minimal ambient types for @mrs/renderer-core (JS implementation).
 * Evidence-bound: only symbols used by MRS ChatGPT widget / MCP adapters.
 */

export type Vec4Like = { x: number; y: number; z: number; w: number };

export type Mesh4D = {
  vertices: Vec4Like[];
  faces: Array<[number, number, number]>;
  edges: Array<[number, number]>;
};

export type SurfaceDef = {
  id: string;
  name: string;
  defaultResolution?: number;
  uRange?: [number, number];
  vRange?: [number, number];
  parametrize?: (u: number, v: number) => Vec4Like;
  sample?: (resolution?: number | null) => Mesh4D;
};

export declare const surfaces: Record<string, SurfaceDef>;
export declare function getSurface(id: string): SurfaceDef;
export declare function listSurfaces(): Array<{ id: string; name: string }>;
export declare function sampleSurface(
  surface: SurfaceDef,
  resolution?: number | null
): Mesh4D;

export declare function project4Dto2D(
  v: Vec4Like,
  d4: number,
  d3: number,
  width: number,
  height: number,
  scale: number
): { x: number; y: number };
export declare function project4Dto3D(
  v: Vec4Like,
  d4: number
): { x: number; y: number; z: number };

export declare function cinematicRotation(
  t: number,
  weights?: Record<string, number>
): (v: Vec4Like) => Vec4Like;

export declare class CanvasRenderer {
  constructor(canvas: HTMLCanvasElement | unknown, options?: Record<string, unknown>);
  d4: number;
  d3: number;
  scale: number;
  rotationWeights: Record<string, number>;
  background: string;
  renderMode: string;
  clear(): void;
  setViewSize(width: number, height: number): void;
  renderFrame(
    mesh: Mesh4D,
    t: number,
    renderOptions?: Record<string, unknown>
  ): void;
}

export declare class MRSInspector4D {
  constructor(options?: Record<string, unknown>);
  handleWireMessage(msg: unknown): unknown;
}

export declare class LiveLinkServer {
  constructor(options?: {
    port?: number;
    host?: string;
    inspector?: unknown;
  });
  port: number;
  start(): Promise<void> | void;
  stop(): Promise<void> | void;
  broadcastStateSnapshot(snapshot: unknown): void;
}

export declare class ExportManager {
  constructor(options?: { outputDir?: string; defaultFormat?: string });
  exportPNG(
    mesh: Mesh4D,
    scene: Record<string, unknown>,
    frameIndex: number,
    outputPath?: string
  ): Promise<Buffer>;
  exportGLTF(
    mesh: Mesh4D,
    scene: Record<string, unknown>,
    outputPath: string
  ): Promise<unknown>;
  exportOBJ(
    mesh: Mesh4D,
    scene: Record<string, unknown>,
    outputPath: string
  ): Promise<unknown>;
}
