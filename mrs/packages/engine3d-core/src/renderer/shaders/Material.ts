import type { ShaderSource } from "./ShaderSource.js";
import type { PipelineConfig } from "./PipelineConfig.js";
import { DEFAULT_SHADER_SOURCE } from "./ShaderSource.js";
import { DEFAULT_PIPELINE } from "./PipelineConfig.js";

export interface Material {
  readonly id: string;
  readonly shader: ShaderSource;
  readonly pipeline: PipelineConfig;
  readonly uniforms: Record<string, number>;
}

export function createDefaultMaterial(id = "default"): Material {
  return {
    id,
    shader: DEFAULT_SHADER_SOURCE,
    pipeline: DEFAULT_PIPELINE,
    uniforms: {},
  };
}
