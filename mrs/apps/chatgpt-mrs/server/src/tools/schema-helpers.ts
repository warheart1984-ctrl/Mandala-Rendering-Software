import { z } from "zod";

/**
 * OpenAI ChatGPT MCP rejects:
 * - Zod tuple JSON Schema (`items: [{type}, …]`)
 * - shared Zod instances that become `$ref` in the same tool schema
 * - `z.record(z.unknown())` → `additionalProperties: {}`
 *
 * Always construct fresh `z.array(z.number()).min(n).max(n)` per field
 * so zod-to-json-schema inlines homogeneous `items: { type: "number" }`.
 */
export function vec4NumberArray(
  description = "Length-4 number array [x, y, z, w]"
) {
  return z.array(z.number()).min(4).max(4).describe(description);
}

export function numberPairArray(description = "Length-2 number array [a, b]") {
  return z.array(z.number()).min(2).max(2).describe(description);
}

export type Vec4 = [number, number, number, number];

export function asVec4(v: number[]): Vec4 {
  return [v[0]!, v[1]!, v[2]!, v[3]!];
}

/**
 * Parse a SceneSpecification from either a JSON string or a plain object.
 * Prefer string in the public MCP schema (OpenAI rejects empty additionalProperties).
 */
export function parseSceneSpecPayload(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) throw new Error("sceneSpec JSON string is empty");
    const parsed: unknown = JSON.parse(trimmed);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("sceneSpec must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  }
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  throw new Error("sceneSpec must be a JSON object or JSON string");
}
