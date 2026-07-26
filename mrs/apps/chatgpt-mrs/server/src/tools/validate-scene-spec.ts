import { z } from "zod";
import {
  parseSceneSpecification,
  validateSceneCapabilities,
} from "@mrs/renderer-core/scene-spec";

export const validateSceneSpecInputShape = {
  sceneSpec: z
    .record(z.unknown())
    .describe("SceneSpecification JSON object (schemaVersion 1.0)"),
};

const parser = z.object(validateSceneSpecInputShape);

export function handleValidateSceneSpec(args: unknown): {
  ok: boolean;
  text: string;
  errors: Array<{ path?: string; message: string }>;
} {
  const parsed = parser.parse(args ?? {});
  const structural = parseSceneSpecification(parsed.sceneSpec);
  if (!structural.ok) {
    return {
      ok: false,
      text: `SceneSpecification structural errors (${structural.errors.length})`,
      errors: structural.errors.map(
        (e: { path?: string; message: string }) => ({
          path: e.path,
          message: e.message,
        })
      ),
    };
  }
  const caps = validateSceneCapabilities(structural.value, { target: "rt4d" });
  if (!caps.ok) {
    return {
      ok: false,
      text: `SceneSpecification capability errors (${caps.errors.length})`,
      errors: caps.errors.map((e: { path?: string; message: string }) => ({
        path: e.path,
        message: e.message,
      })),
    };
  }
  return {
    ok: true,
    text: `SceneSpecification ok (id=${structural.value?.id ?? "—"})`,
    errors: [],
  };
}
