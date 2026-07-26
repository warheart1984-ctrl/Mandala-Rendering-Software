/**
 * Handle live-link `type: "scene_spec"` messages.
 *
 * Status (Drive-G-1): **partial** — parse / validate / convert ack only.
 * Does not push meshes to Unity/Unreal or trigger a remote render.
 */

import {
  parseSceneSpecification,
  validateSceneCapabilities,
  convertSceneSpecification,
  sampleFrame,
} from "../scene-spec/index.js";

/**
 * @param {object} msg — wire message `{ type: "scene_spec", spec, frame?, time?, requestId? }`
 * @returns {object} response payload (caller sends as JSON)
 */
export function handleSceneSpecMessage(msg) {
  const requestId = msg?.requestId ?? null;
  if (!msg || msg.type !== "scene_spec") {
    return {
      type: "scene_spec_result",
      ok: false,
      requestId,
      error: "expected type scene_spec",
    };
  }

  const structural = parseSceneSpecification(msg.spec);
  if (!structural.ok) {
    return {
      type: "scene_spec_result",
      ok: false,
      requestId,
      error: "invalid_spec",
      errors: structural.errors,
    };
  }

  const frameSel = {};
  if (msg.frame != null) frameSel.frame = Number(msg.frame);
  if (msg.time != null) frameSel.time = Number(msg.time);
  const sampled = sampleFrame(structural.value, frameSel);

  const caps = validateSceneCapabilities(sampled.spec, { target: "both" });
  if (!caps.ok) {
    return {
      type: "scene_spec_result",
      ok: false,
      requestId,
      error: "unsupported_spec",
      errors: caps.errors,
    };
  }

  const converted = convertSceneSpecification(sampled.spec);
  return {
    type: "scene_spec_result",
    ok: true,
    requestId,
    frameIndex: sampled.frameIndex,
    timeSeconds: sampled.time,
    specHash: converted.specHash,
    seed: converted.seed,
    worldId: converted.worldDocument.id,
    entityCount: converted.worldDocument.entities.length,
    primitiveCount: converted.rt4d.primitives.length,
    note: "parse/validate/convert ack only — mesh push / remote render not claimed",
  };
}
