/**
 * Smoke: Zod shapes must emit OpenAI-compatible JSON Schema
 * (no tuple items arrays, no empty additionalProperties).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { updateSceneInputShape } from "./update-scene.js";
import { replaySceneInputShape } from "./replay-scene.js";
import { validateSceneSpecInputShape } from "./validate-scene-spec.js";
import { renderSceneSpecInputShape } from "./render-scene-spec.js";
import {
  asVec4,
  numberPairArray,
  parseSceneSpecPayload,
  vec4NumberArray,
} from "./schema-helpers.js";

function assertNoTupleItems(node, path = "$") {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      assertNoTupleItems(node[i], `${path}[${i}]`);
    }
    return;
  }
  if (Array.isArray(node.items)) {
    assert.fail(
      `${path}.items is an array (tuple form) — OpenAI MCP rejects this; use homogeneous items schema`
    );
  }
  if (node.$ref) {
    assert.fail(
      `${path} uses $ref (${node.$ref}) — OpenAI MCP rejects $ref in tool schemas`
    );
  }
  if (
    node.additionalProperties &&
    typeof node.additionalProperties === "object" &&
    !Array.isArray(node.additionalProperties) &&
    Object.keys(node.additionalProperties).length === 0
  ) {
    assert.fail(
      `${path}.additionalProperties is {} — OpenAI MCP rejects empty schemas`
    );
  }
  for (const [k, v] of Object.entries(node)) {
    assertNoTupleItems(v, `${path}.${k}`);
  }
}

describe("OpenAI-compatible MCP tool schemas", () => {
  it("update_4d_scene uses homogeneous number arrays for camera vec4", () => {
    const schema = zodToJsonSchema(z.object(updateSceneInputShape));
    assertNoTupleItems(schema);
    const pos =
      schema.properties.patch.properties.camera.properties.position4d;
    const tgt =
      schema.properties.patch.properties.camera.properties.target4d;
    assert.equal(pos.type, "array");
    assert.deepEqual(pos.items, { type: "number" });
    assert.equal(pos.minItems, 4);
    assert.equal(pos.maxItems, 4);
    assert.equal(tgt.type, "array");
    assert.deepEqual(tgt.items, { type: "number" });
  });

  it("replay / validate / render schemas are OpenAI-safe", () => {
    for (const shape of [
      replaySceneInputShape,
      validateSceneSpecInputShape,
      renderSceneSpecInputShape,
    ]) {
      assertNoTupleItems(zodToJsonSchema(z.object(shape)));
    }
    const validate = zodToJsonSchema(z.object(validateSceneSpecInputShape));
    assert.equal(validate.properties.sceneSpec.type, "string");
  });

  it("inspect-like vec4 / pair helpers emit homogeneous items without $ref", () => {
    const inspectLike = zodToJsonSchema(
      z.object({
        origin4d: vec4NumberArray().optional(),
        direction4d: vec4NumberArray().optional(),
        timeRange: numberPairArray().optional(),
      })
    );
    assertNoTupleItems(inspectLike);
    assert.deepEqual(inspectLike.properties.origin4d.items, {
      type: "number",
    });
    assert.deepEqual(inspectLike.properties.direction4d.items, {
      type: "number",
    });
  });

  it("helpers coerce vec4 and parse sceneSpec JSON string", () => {
    assert.deepEqual(asVec4([1, 2, 3, 4]), [1, 2, 3, 4]);
    assert.deepEqual(parseSceneSpecPayload('{"id":"s1"}'), { id: "s1" });
    assert.deepEqual(parseSceneSpecPayload({ id: "s2" }), { id: "s2" });
    assert.equal(vec4NumberArray().safeParse([0, 0, 0]).success, false);
    assert.equal(vec4NumberArray().safeParse([0, 0, 0, 1]).success, true);
  });
});
