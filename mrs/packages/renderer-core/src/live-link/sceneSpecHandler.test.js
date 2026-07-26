/**
 * live-link scene_spec handler tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleSceneSpecMessage } from "./sceneSpecHandler.js";

describe("handleSceneSpecMessage", () => {
  it("acks a valid tesseract spec", () => {
    const out = handleSceneSpecMessage({
      type: "scene_spec",
      requestId: "r1",
      spec: {
        schemaVersion: "1.0",
        id: "ll-tess",
        entities: [
          {
            id: "tess",
            geometry: { kind: "surface", surfaceId: "tesseract" },
          },
        ],
        output: { seed: 1, width: 32, height: 32, samples: 1 },
      },
    });
    assert.equal(out.ok, true);
    assert.equal(out.type, "scene_spec_result");
    assert.equal(out.requestId, "r1");
    assert.ok(out.primitiveCount > 100);
    assert.equal(typeof out.specHash, "string");
  });

  it("returns errors with paths for invalid spec", () => {
    const out = handleSceneSpecMessage({
      type: "scene_spec",
      spec: { schemaVersion: "1.0", id: "bad", entities: [] },
    });
    assert.equal(out.ok, false);
    assert.equal(out.error, "invalid_spec");
    assert.ok(out.errors.some((e) => e.path === "entities"));
  });
});
