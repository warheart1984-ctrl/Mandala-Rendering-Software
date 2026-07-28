/**
 * PathTracer4D live consume of WorldDocumentRt4d-shaped primitives.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderWorldRt4dPrimitives } from "../../../../scripts/lib/worldDocumentRt4dConsume.mjs";

describe("worldDocumentRt4dConsume", () => {
  it("path-traces oriented capsules + core hypersphere to a PNG", () => {
    const result = renderWorldRt4dPrimitives(
      [
        {
          kind: "oriented-capsule",
          id: "tube0",
          a: [-1, 0, 0, 0],
          b: [1, 0, 0, 0],
          radius: 0.12,
          materialId: "glass_tube",
          materialRole: "glass_tube",
          rt4dMaterial: {
            id: "glass_tube",
            kind: "glass",
            params: {
              baseColor: [0.15, 0.45, 1],
              roughness: 0.03,
              metallic: 0,
              emissive: [0.4, 0.9, 1.3],
              brdf: "dielectric",
              textureRefs: [],
            },
          },
        },
        {
          kind: "hypersphere",
          id: "core",
          center: [0, 0, 0, 0],
          radius: 0.2,
          materialId: "core_glow",
          materialRole: "core_glow",
          rt4dMaterial: {
            id: "core_glow",
            kind: "emissive",
            params: {
              baseColor: [1, 1, 1],
              roughness: 0.5,
              metallic: 0,
              emissive: [12, 12, 12],
              brdf: "emissive",
              textureRefs: [],
            },
          },
        },
        {
          kind: "hypersphere",
          id: "joint",
          center: [1, 0, 0, 0],
          radius: 0.15,
          materialId: "chrome_joint",
          materialRole: "chrome_joint",
          rt4dMaterial: {
            id: "chrome_joint",
            kind: "metal",
            params: {
              baseColor: [0.05, 0.05, 0.05],
              roughness: 0.08,
              metallic: 1,
              emissive: [0, 0, 0],
              brdf: "ggx",
              textureRefs: [],
            },
          },
        },
      ],
      { width: 48, height: 36, samples: 2, maxDepth: 3, seed: 42 },
    );
    assert.equal(result.png[0], 0x89);
    assert.equal(result.png[1], 0x50);
    assert.ok(result.sha256.length === 64);
    assert.equal(result.provenance.structure_source, "path_trace");
    assert.equal(result.primitiveCount, 3);
  });
});
