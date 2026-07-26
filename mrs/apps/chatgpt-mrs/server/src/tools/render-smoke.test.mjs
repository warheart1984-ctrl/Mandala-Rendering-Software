/**
 * Real RT4D smoke: prompt render returns PNG MCP image payload + provenance.
 * Bounded: 64×64 @ 2 spp.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { handleRender4dPrompt, render4dPromptInputShape } from "./render-4d-prompt.js";
import { renderSceneSpecInputShape } from "./render-scene-spec.js";

function assertOpenAiSafe(schema) {
  const walk = (node, path = "$") => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((n, i) => walk(n, `${path}[${i}]`));
      return;
    }
    if (Array.isArray(node.items)) {
      assert.fail(`${path}.items is tuple array`);
    }
    if (node.$ref) assert.fail(`${path} has $ref ${node.$ref}`);
    if (
      node.additionalProperties &&
      typeof node.additionalProperties === "object" &&
      !Array.isArray(node.additionalProperties) &&
      Object.keys(node.additionalProperties).length === 0
    ) {
      assert.fail(`${path}.additionalProperties is {}`);
    }
    for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
  };
  walk(schema);
}

describe("render_4d_prompt MCP schemas", () => {
  it("is OpenAI-safe (no $ref / tuple / empty additionalProperties)", () => {
    const schema = zodToJsonSchema(z.object(render4dPromptInputShape));
    assertOpenAiSafe(schema);
    assert.equal(schema.properties.prompt.type, "string");
    assert.deepEqual(schema.required, ["prompt"]);
  });

  it("render_scene_spec_rt4d schema remains OpenAI-safe with numeric overrides", () => {
    assertOpenAiSafe(zodToJsonSchema(z.object(renderSceneSpecInputShape)));
  });
});

describe("render_4d_prompt RT4D smoke", () => {
  it(
    "returns PNG image payload + sha256 provenance at smoke quality",
    { timeout: 60_000 },
    async () => {
      const { text, image, render } = await handleRender4dPrompt({
        prompt: "cyan tesseract lattice",
        quality: "smoke",
        seed: 42,
      });

      assert.match(text, /RT4D/);
      assert.equal(image.mimeType, "image/png");
      assert.ok(image.data.length > 32, "base64 data present");
      const raw = Buffer.from(image.data, "base64");
      assert.equal(raw[0], 0x89);
      assert.equal(raw[1], 0x50); // P
      assert.equal(raw[2], 0x4e); // N
      assert.equal(raw[3], 0x47); // G
      assert.equal(render.width, 64);
      assert.equal(render.height, 64);
      assert.equal(render.samples, 2);
      assert.equal(render.provider, "mrs-renderer-core/rt4d");
      assert.equal(render.sha256, image.sha256);
      assert.match(render.sha256, /^[a-f0-9]{64}$/);
      assert.equal(render.seed, 42);
      assert.equal(render.provenance.kind, "deterministic-procedural-4d-render");
    }
  );
});
