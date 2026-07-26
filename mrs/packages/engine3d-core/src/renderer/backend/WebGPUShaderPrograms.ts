import type { ShaderSource } from "../shaders/ShaderSource.js";

/**
 * WebGPU shader/pipeline binder — **skeleton**.
 */
export class WebGPUShaderPrograms {
  constructor(
    private readonly device: unknown,
    private readonly shader: ShaderSource,
  ) {
    void this.device;
    void this.shader;
  }

  bindPipeline(_pass: unknown, _params: Record<string, number>): void {
    // Declared: createRenderPipeline + bind groups.
  }
}
