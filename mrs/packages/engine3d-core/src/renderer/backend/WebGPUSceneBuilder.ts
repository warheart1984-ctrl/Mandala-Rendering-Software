import type { World3D } from "../../world/World3D.js";

/**
 * WebGPU scene binder — **skeleton**.
 * Does not allocate GPU buffers in Node CI.
 */
export class WebGPUSceneBuilder {
  bindScene(_pass: unknown, world: World3D): void {
    void world;
    // Declared: would upload mesh buffers and bind vertex state.
  }
}
