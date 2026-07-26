import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildEvidenceRecordV12 } from "../../src/scene/EvidenceBuilderV12.js";
import { createWorldGenerator, generateWorldFromGenerator, hashWorldGenerator } from "../../src/world/WorldGenerator.js";

describe("WorldGenerator", () => {
  it("generates deterministic procedural worlds with assets and generator hashes", () => {
    const generator = createWorldGenerator("city", 123, { count: 3, spread: 4 });
    const a = generateWorldFromGenerator(generator);
    const b = generateWorldFromGenerator(generator);
    assert.deepEqual(a.objects, b.objects);
    assert.equal(a.assets?.[0]?.id, "city-generator");
    assert.equal(typeof hashWorldGenerator(generator), "string");
  });

  it("evidence includes assetHash and worldGeneratorHash", () => {
    const world = generateWorldFromGenerator(createWorldGenerator("mandala", 77, { count: 2 }));
    const evidence = buildEvidenceRecordV12({ world, scene: {}, frameIndex: 0, seed: 77 });
    assert.equal(typeof evidence.assetHash, "string");
    assert.equal(typeof evidence.worldGeneratorHash, "string");
  });
});
