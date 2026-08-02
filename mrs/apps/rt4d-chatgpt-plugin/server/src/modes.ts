import { z } from "zod";

/** ChatGPT production modes — skill routing + MCP tool intents. */
export const ProductionModeSchema = z.enum([
  "create_anime_character",
  "create_anime_scene",
  "add_rt4d_powers",
  "animate_dimensional_transformation",
  "render_manga_panel",
  "render_cinematic_sequence",
]);

export type ProductionMode = z.infer<typeof ProductionModeSchema>;

/** Which pipeline pass the mode primarily targets (Phase 1 may stub). */
export type PipelinePass = "rt3d_anime_scene" | "rt4d_dimensional" | "composite";

export type ProductLane =
  | "portrait"
  | "manga"
  | "anime_scene"
  | "film"
  | "game_asset"
  | "unknown";

export const MODE_PASS: Record<
  ProductionMode,
  { pass: PipelinePass; status: "partial" | "skeleton" | "declared" }
> = {
  create_anime_character: { pass: "rt3d_anime_scene", status: "declared" },
  create_anime_scene: { pass: "rt3d_anime_scene", status: "declared" },
  add_rt4d_powers: { pass: "rt4d_dimensional", status: "partial" },
  animate_dimensional_transformation: {
    pass: "rt4d_dimensional",
    status: "skeleton",
  },
  render_manga_panel: { pass: "composite", status: "declared" },
  render_cinematic_sequence: { pass: "composite", status: "declared" },
};

/** Map ChatGPT modes → product lanes (defensible architecture §4). */
export const MODE_PRODUCT_LANE: Record<ProductionMode, ProductLane> = {
  create_anime_character: "portrait",
  create_anime_scene: "anime_scene",
  add_rt4d_powers: "anime_scene",
  animate_dimensional_transformation: "anime_scene",
  render_manga_panel: "manga",
  render_cinematic_sequence: "film",
};

export const RotationPlaneSchema = z.enum([
  "XY",
  "XZ",
  "XW",
  "YZ",
  "YW",
  "ZW",
]);

export const ContinuityStateInputSchema = z
  .object({
    characterState: z.record(z.unknown()).optional(),
    worldState: z.record(z.unknown()).optional(),
    cameraState: z.record(z.unknown()).optional(),
    emotionState: z.record(z.unknown()).optional(),
    rt4dState: z.record(z.unknown()).optional(),
    continuityVersion: z.number().int().min(0).optional(),
  })
  .optional();
