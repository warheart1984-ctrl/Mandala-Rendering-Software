import type { Material } from "./shaders/Material.js";

export interface ShaderPrograms {
  use(): void;
  setUniforms(params: Record<string, number>): void;
}

/**
 * Material-aware shader program binder.
 * In Node / null backend: records calls only (no GPU).
 */
export class DefaultShaderPrograms implements ShaderPrograms {
  private currentMaterial: Material | null = null;
  useCount = 0;
  lastUniforms: Record<string, number> = {};

  useMaterial(material: Material): void {
    this.currentMaterial = material;
  }

  use(): void {
    this.useCount += 1;
  }

  setUniforms(params: Record<string, number>): void {
    this.lastUniforms = { ...params };
    if (!this.currentMaterial) {
      return;
    }
    // Backend-specific uniform upload would go here.
  }

  getCurrentMaterial(): Material | null {
    return this.currentMaterial;
  }
}
