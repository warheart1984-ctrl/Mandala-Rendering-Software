import type { World3D } from "../world/World3D.js";
import type { VisualMod } from "../substrate/VisualMod.js";
import type { SceneBuilder } from "./SceneBuilder.js";
import { DefaultSceneBuilder } from "./SceneBuilder.js";
import type { ShaderPrograms } from "./ShaderPrograms.js";
import { DefaultShaderPrograms } from "./ShaderPrograms.js";
import type { Material } from "./shaders/Material.js";
import { createDefaultMaterial } from "./shaders/Material.js";

export interface RendererCore {
  render(world: World3D, visualMod: VisualMod): void;
}

export class DefaultRendererCore implements RendererCore {
  renderCount = 0;

  constructor(
    private readonly sceneBuilder: SceneBuilder = new DefaultSceneBuilder(),
    private readonly shaders: ShaderPrograms = new DefaultShaderPrograms(),
    private readonly defaultMaterial: Material = createDefaultMaterial(),
  ) {}

  getSceneBuilder(): SceneBuilder {
    return this.sceneBuilder;
  }

  getShaders(): ShaderPrograms {
    return this.shaders;
  }

  render(world: World3D, visualMod: VisualMod): void {
    this.sceneBuilder.buildScene(world);
    if (this.shaders instanceof DefaultShaderPrograms) {
      this.shaders.useMaterial(this.defaultMaterial);
    }
    this.shaders.use();
    this.shaders.setUniforms({ ...visualMod.shaderParams });
    this.renderCount += 1;
  }
}

/**
 * Headless null renderer used by demo/CI.
 * Status: **enforced** for call-path; produces no pixels.
 */
export class NullHeadlessRenderer extends DefaultRendererCore {
  readonly backend = "null-headless" as const;
}
