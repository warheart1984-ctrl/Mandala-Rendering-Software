import { z } from "zod";
import {
  parseSceneSpecification,
  validateSceneCapabilities,
} from "@mrs/renderer-core/scene-spec";
import { parseSceneSpecPayload } from "./schema-helpers.js";

export const validateSceneSpecInputShape = {
  // Stringified JSON — OpenAI rejects z.record(z.unknown()) → additionalProperties:{}
  sceneSpec: z
    .string()
    .describe(
      "SceneSpecification as a JSON string (schemaVersion 1.0 object)"
    ),
};

const parser = z.object(validateSceneSpecInputShape);

export function handleValidateSceneSpec(args: unknown): {
  ok: boolean;
  text: string;
  errors: Array<{ path?: string; message: string }>;
} {
  const parsed = parser.parse(args ?? {});
  let sceneSpec: Record<string, unknown>;
  try {
    sceneSpec = parseSceneSpecPayload(parsed.sceneSpec);
  } catch (err) {
    return {
      ok: false,
      text: "Invalid sceneSpec JSON string",
      errors: [
        {
          path: "sceneSpec",
          message: err instanceof Error ? err.message : String(err),
        },
      ],
    };
  }
  const structural = parseSceneSpecification(sceneSpec);
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
