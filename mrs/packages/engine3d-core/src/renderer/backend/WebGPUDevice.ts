/**
 * WebGPU device abstraction — **skeleton**.
 *
 * Honesty: Node.js does not ship `navigator.gpu` by default. Real devices
 * require a browser environment or a Dawn/wgpu binding (e.g. `webgpu` npm
 * packages that vendor Dawn). Do not claim GPU frames in CI.
 */

export interface WebGPUDevice {
  readonly adapter: unknown;
  readonly device: unknown;
  readonly context: unknown;
}

export async function createWebGPUDevice(
  _canvas: { width: number; height: number },
): Promise<WebGPUDevice> {
  const nav = globalThis as { navigator?: { gpu?: unknown } };
  if (!nav.navigator?.gpu) {
    throw new Error(
      "WebGPU unavailable: Node has no navigator.gpu by default. Use a browser or Dawn/wgpu binding.",
    );
  }
  throw new Error(
    "WebGPUDevice.createWebGPUDevice is skeleton — adapter request not implemented in engine3d-core CI path.",
  );
}
