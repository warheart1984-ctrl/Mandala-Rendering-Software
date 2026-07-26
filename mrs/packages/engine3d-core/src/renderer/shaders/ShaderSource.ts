export interface ShaderSource {
  vertex: string;
  fragment: string;
}

/** Placeholder WGSL-ish sources for material binding (not executed in Node). */
export const DEFAULT_SHADER_SOURCE: ShaderSource = {
  vertex: "// engine3d-core default vertex (skeleton)\n",
  fragment: "// engine3d-core default fragment (skeleton)\n",
};
