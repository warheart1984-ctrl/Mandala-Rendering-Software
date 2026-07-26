export type CullFace = "none" | "back" | "front";

export interface PipelineConfig {
  cullFace: CullFace;
  depthTest: boolean;
  blend: boolean;
}

export const DEFAULT_PIPELINE: PipelineConfig = {
  cullFace: "back",
  depthTest: true,
  blend: false,
};
