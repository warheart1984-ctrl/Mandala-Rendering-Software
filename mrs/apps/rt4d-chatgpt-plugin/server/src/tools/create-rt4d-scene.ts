import { z } from "zod";
import {
  ContinuityStateInputSchema,
  ProductionModeSchema,
  RotationPlaneSchema,
} from "../modes.js";
import { createRt4dScene } from "../scene-store.js";

export const createRt4dSceneInputShape = {
  prompt: z
    .string()
    .min(1)
    .max(2000)
    .describe(
      "Anime / dimensional scene direction. Not diffusion-as-anime; selects production intent."
    ),
  mode: ProductionModeSchema.describe(
    "Production mode → product lane (portrait/manga/anime_scene/film)."
  ),
  rotationPlanes: z
    .array(
      z.object({
        plane: RotationPlaneSchema,
        speed: z.number(),
      })
    )
    .optional()
    .describe("Default XW+YW for Dimensional Awakening / golden dragon demos."),
  projection: z
    .object({
      type: z.enum(["perspective", "orthographic"]),
      distance4d: z.number(),
      distance3d: z.number(),
    })
    .optional(),
  continuityState: ContinuityStateInputSchema.describe(
    "Optional ContinuityState.v1 slice; next shot should inherit rather than regenerate."
  ),
  intentId: z.string().optional(),
  timelineId: z.string().optional(),
  worldId: z.string().optional(),
  parentShotId: z.string().nullable().optional(),
};

const parser = z.object(createRt4dSceneInputShape);

export function handleCreateRt4dScene(args: unknown) {
  const parsed = parser.parse(args ?? {});
  const scene = createRt4dScene({
    prompt: parsed.prompt,
    mode: parsed.mode,
    rotations: parsed.rotationPlanes,
    projection: parsed.projection,
    continuityState: parsed.continuityState,
    intentId: parsed.intentId,
    timelineId: parsed.timelineId,
    worldId: parsed.worldId,
    parentShotId: parsed.parentShotId,
  });

  return {
    text: `Created RT4D scene ${scene.sceneId} mode=${scene.mode} lane=${scene.productLane} pass=${scene.pass} (${scene.passStatus}). ShotEvidenceEnvelope emitted (partial).`,
    sceneId: scene.sceneId,
    scene: scene.sceneJson,
    provenance: scene.provenance,
    continuityState: scene.continuityState,
    shotEvidence: scene.shotEvidence,
    statusTag: "partial" as const,
  };
}
