import type { Scene4DDTO } from "@mrs/scene-schema";

/** Backend selected after capability probe — WebGPU is optional/declared only. */
export type RenderBackend = "canvas2d" | "webgpu-unavailable";

export type SceneSpec = Scene4DDTO;

export interface RenderState {
  time: number;
  d4: number;
  d3: number;
  rotationWeights: Record<string, number>;
  backend: RenderBackend;
}

export interface RendererHandle {
  render(t: number): void;
  resize(width: number, height: number, dpr?: number): void;
  destroy(): void;
  getBackend(): RenderBackend;
  setD4(d4: number): void;
  adjustRotation(dx: number, dy: number): void;
  getState(): RenderState;
}

export type MeshClickHandler = (
  projected2D: { x: number; y: number },
  vertex4D: { x: number; y: number; z: number; w: number } | null
) => void;

/**
 * Probe WebGPU. Returns false when unavailable — callers must use Canvas2D
 * and must not claim WebGPU rendering.
 */
export async function detectWebGPU(): Promise<boolean> {
  try {
    const nav = globalThis.navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<unknown> };
    };
    if (!nav?.gpu?.requestAdapter) return false;
    const adapter = await nav.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}
