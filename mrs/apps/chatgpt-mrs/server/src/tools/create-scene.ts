import { z } from "zod";
import type { Scene4DDTO, SurfaceId } from "@mrs/scene-schema";
import { createDefaultScene, sceneStore } from "../scene-store.js";

export const createSceneInputShape = {
  surface: z
    .enum([
      "clifford_torus",
      "hopf_surface",
      "tesseract",
      "trefoil_4d",
      "torus_3d",
    ])
    .describe("Parametric / discrete 4D surface id (DTO alias)"),
  rotationPlanes: z
    .array(
      z.object({
        plane: z.enum(["XY", "XZ", "XW", "YZ", "YW", "ZW"]),
        speed: z.number(),
      })
    )
    .optional(),
  projection: z
    .object({
      type: z.enum(["perspective", "orthographic"]),
      distance4d: z.number(),
      distance3d: z.number(),
    })
    .optional(),
  quality: z
    .enum(["adaptive", "performance", "high", "ultra"])
    .optional(),
  resolution: z.number().optional(),
};

const parser = z.object(createSceneInputShape);

export function handleCreateScene(args: unknown): {
  scene: Scene4DDTO;
  text: string;
} {
  const parsed = parser.parse(args ?? {});
  const scene = createDefaultScene({
    surface: parsed.surface as SurfaceId,
    rotations: parsed.rotationPlanes,
    projection: parsed.projection,
    quality: parsed.quality,
    resolution: parsed.resolution,
  });
  sceneStore.set(scene.id, scene);
  return {
    scene,
    text: `Created 4D scene ${scene.id} (${scene.surface})`,
  };
}
