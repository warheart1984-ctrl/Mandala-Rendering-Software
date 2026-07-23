import { randomUUID } from "node:crypto";
import type { Scene4DDTO } from "@mrs/scene-schema";
import {
  DEFAULT_CAMERA,
  DEFAULT_MATERIAL,
  DEFAULT_PROJECTION,
} from "@mrs/scene-schema";

/** In-memory scene store for this MCP process (not durable). */
export const sceneStore = new Map<string, Scene4DDTO>();

export function createDefaultScene(
  partial: Partial<Scene4DDTO> & Pick<Scene4DDTO, "surface">
): Scene4DDTO {
  return {
    id: partial.id ?? randomUUID(),
    surface: partial.surface,
    rotations: partial.rotations ?? [
      { plane: "XW", speed: 0.7 },
      { plane: "YZ", speed: 1.1 },
    ],
    projection: partial.projection ?? { ...DEFAULT_PROJECTION },
    camera: partial.camera ?? { ...DEFAULT_CAMERA },
    material: partial.material ?? { ...DEFAULT_MATERIAL },
    quality: partial.quality ?? "adaptive",
    resolution: partial.resolution ?? 24,
    time: partial.time ?? 0,
  };
}

export function getSceneOrThrow(sceneId: string): Scene4DDTO {
  const scene = sceneStore.get(sceneId);
  if (!scene) {
    throw new Error(`Unknown sceneId: ${sceneId}`);
  }
  return scene;
}
