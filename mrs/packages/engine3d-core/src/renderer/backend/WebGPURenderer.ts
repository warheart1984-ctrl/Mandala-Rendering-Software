import type { RendererCore } from "../RendererCore.js";
import type { World3D } from "../../world/World3D.js";
import type { VisualMod } from "../../substrate/VisualMod.js";
import type { WebGPUDevice } from "./WebGPUDevice.js";
import { WebGPUSceneBuilder } from "./WebGPUSceneBuilder.js";
import { WebGPUShaderPrograms } from "./WebGPUShaderPrograms.js";
import { DEFAULT_SHADER_SOURCE } from "../shaders/ShaderSource.js";

/**
 * WebGPU-backed RendererCore — **skeleton**.
 * Instantiation is allowed for API shape; render() throws unless a real device is injected.
 */
export class WebGPURenderer implements RendererCore {
  constructor(
    private readonly gpu: WebGPUDevice | null = null,
    private readonly sceneBuilder: WebGPUSceneBuilder = new WebGPUSceneBuilder(),
    private readonly shaders: WebGPUShaderPrograms = new WebGPUShaderPrograms(
      null,
      DEFAULT_SHADER_SOURCE,
    ),
  ) {}

  render(world: World3D, visualMod: VisualMod): void {
    void world;
    void visualMod;
    void this.sceneBuilder;
    void this.shaders;
    if (!this.gpu) {
      throw new Error(
        "WebGPURenderer is skeleton: no GPU device. Use NullHeadlessRenderer in Node/CI.",
      );
    }
    throw new Error(
      "WebGPURenderer.render not implemented — requires Dawn/wgpu or browser WebGPU.",
    );
  }
}
