import { z } from "zod";
import { RotationPlaneSchema } from "../modes.js";
import {
  updateRt4dSceneRecord,
  type SceneUpdatePatch,
} from "../scene-store.js";
import { handleRenderRt4dPreview } from "./render-rt4d-preview.js";

export const updateRt4dSceneInputShape = {
  sceneId: z.string().min(1),
  rotations: z
    .array(
      z.object({
        plane: RotationPlaneSchema,
        speed: z.number(),
      })
    )
    .optional()
    .describe("Replace rotation planes (e.g. XW/YW/ZW speeds)."),
  projection: z
    .object({
      type: z.enum(["perspective", "orthographic"]).optional(),
      distance4d: z.number().optional(),
      distance3d: z.number().optional(),
    })
    .optional()
    .describe("Patch projection distances / type."),
  prompt: z.string().min(1).max(2000).optional(),
  rePreview: z
    .boolean()
    .optional()
    .describe("If true, call render_rt4d_preview after update (debounced by client)."),
  width: z.number().int().min(16).max(1024).optional(),
  height: z.number().int().min(16).max(1024).optional(),
  /** Legacy catch-all; preferred fields above. */
  patch: z.record(z.unknown()).optional(),
};

const parser = z.object(updateRt4dSceneInputShape);

function patchFromArgs(
  parsed: z.infer<typeof parser>
): SceneUpdatePatch {
  const fromLegacy =
    parsed.patch && typeof parsed.patch === "object"
      ? (parsed.patch as SceneUpdatePatch)
      : {};

  return {
    rotations: parsed.rotations ?? fromLegacy.rotations,
    projection: parsed.projection ?? fromLegacy.projection,
    prompt: parsed.prompt ?? fromLegacy.prompt,
    continuityVersionBump: true,
  };
}

export async function handleUpdateRt4dScene(args: unknown) {
  const parsed = parser.parse(args ?? {});
  const patch = patchFromArgs(parsed);

  if (!patch.rotations && !patch.projection && !patch.prompt) {
    return {
      text: `update_rt4d_scene requires rotations, projection, and/or prompt for ${parsed.sceneId}.`,
      sceneId: parsed.sceneId,
      statusTag: "partial" as const,
      implemented: true,
      error: "EmptyPatch",
      note: "Phase 2 partial — pass XW/YW/ZW speeds or projection.distance4d.",
    };
  }

  const scene = updateRt4dSceneRecord(parsed.sceneId, patch);
  let preview: Awaited<ReturnType<typeof handleRenderRt4dPreview>> | null =
    null;

  if (parsed.rePreview) {
    preview = await handleRenderRt4dPreview({
      sceneId: scene.sceneId,
      width: parsed.width,
      height: parsed.height,
    });
  }

  return {
    text: `Updated RT4D scene ${scene.sceneId} (continuityVersion=${scene.continuityState.continuityVersion}). Dimensional preview controls only — not AnimeStylizer / RT3D persistence.`,
    sceneId: scene.sceneId,
    scene: scene.sceneJson,
    rotations: scene.rotations,
    projection: scene.projection,
    provenance: scene.provenance,
    continuityState: scene.continuityState,
    shotEvidence: scene.shotEvidence,
    previewUrl: preview?.previewUrl ?? scene.preview?.previewUrl ?? null,
    previewSha256: preview?.sha256 ?? scene.preview?.sha256 ?? null,
    previewSource: preview?.source ?? scene.preview?.source ?? null,
    statusTag: "partial" as const,
    implemented: true,
    visualKind: "dimensional_preview" as const,
  };
}
