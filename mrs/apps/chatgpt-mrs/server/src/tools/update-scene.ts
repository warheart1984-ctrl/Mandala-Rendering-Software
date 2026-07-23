import { z } from "zod";
import type { Scene4DDTO } from "@mrs/scene-schema";
import { getSceneOrThrow, sceneStore } from "../scene-store.js";
import type { RendererClient } from "../mrs-adapter/renderer-client.js";

export const updateSceneInputShape = {
  sceneId: z.string(),
  patch: z.object({
    rotations: z
      .array(
        z.object({
          plane: z.enum(["XY", "XZ", "XW", "YZ", "YW", "ZW"]),
          speed: z.number(),
        })
      )
      .optional(),
    projection: z
      .object({
        type: z.enum(["perspective", "orthographic"]).optional(),
        distance4d: z.number().optional(),
        distance3d: z.number().optional(),
      })
      .optional(),
    camera: z
      .object({
        position4d: z
          .tuple([z.number(), z.number(), z.number(), z.number()])
          .optional(),
        target4d: z
          .tuple([z.number(), z.number(), z.number(), z.number()])
          .optional(),
      })
      .optional(),
    material: z
      .object({
        color: z.string().optional(),
        opacity: z.number().optional(),
        wireframe: z.boolean().optional(),
      })
      .optional(),
    quality: z.enum(["adaptive", "performance", "high", "ultra"]).optional(),
    time: z.number().optional(),
    surface: z
      .enum([
        "clifford_torus",
        "hopf_surface",
        "tesseract",
        "trefoil_4d",
        "torus_3d",
      ])
      .optional(),
    resolution: z.number().optional(),
  }),
};

const parser = z.object(updateSceneInputShape);

export async function handleUpdateScene(
  args: unknown,
  client: RendererClient
): Promise<{
  scene: Scene4DDTO;
  text: string;
  liveLink?: { attempted: boolean; ok: boolean; detail?: string };
}> {
  const parsed = parser.parse(args ?? {});
  const current = getSceneOrThrow(parsed.sceneId);
  const next: Scene4DDTO = {
    ...current,
    id: current.id,
    surface: parsed.patch.surface ?? current.surface,
    rotations: parsed.patch.rotations ?? current.rotations,
    quality: parsed.patch.quality ?? current.quality,
    time: parsed.patch.time ?? current.time,
    resolution: parsed.patch.resolution ?? current.resolution,
    projection: parsed.patch.projection
      ? { ...current.projection, ...parsed.patch.projection }
      : current.projection,
    camera: parsed.patch.camera
      ? { ...current.camera, ...parsed.patch.camera }
      : current.camera,
    material: parsed.patch.material
      ? { ...current.material, ...parsed.patch.material }
      : current.material,
  };

  sceneStore.set(next.id, next);

  const ll = await client.setConfig({
    sceneId: next.id,
    surface: next.surface,
    time: next.time,
    projection: next.projection,
  });

  return {
    scene: next,
    text: `Updated scene ${next.id}`,
    liveLink: {
      attempted: true,
      ok: ll.ok,
      detail: ll.ok ? undefined : `${ll.status}: ${ll.detail}`,
    },
  };
}
