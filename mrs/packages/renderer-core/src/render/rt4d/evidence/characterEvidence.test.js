import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CharacterEvidenceBuilder, UniversalEvidenceBuilder, sha256Hex } from "./CharacterEvidenceRecord.js";

describe("CharacterEvidenceBuilder", () => {
  it("hashes character render state deterministically", () => {
    const builder = new CharacterEvidenceBuilder();
    const args = [
      3,
      99,
      "PortraitRig-Alpha",
      "neutral",
      { focalLengthMm: 85, position: [0, 1, 3], target: [0, 1, 0] },
      { keyLight: { dir: [0, -1, 0], intensity: 4 } },
      { head: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
      [[0, 0, 0], [1, 0, 0]],
      [{ id: "skin", kind: "skin", params: { roughness: 0.5 } }],
      Buffer.from([1, 2, 3]),
    ];
    const a = builder.build(...args);
    const b = builder.build(...args);
    assert.deepEqual(a, b);
    assert.equal(a.pngChecksum, sha256Hex(Buffer.from([1, 2, 3])));
  });
});

describe("UniversalEvidenceBuilder", () => {
  it("includes optional v1.2/v2 hashes only when supplied", () => {
    const record = new UniversalEvidenceBuilder().build({
      frameIndex: 1,
      seed: 2,
      world: { id: "w" },
      materials: [],
      camera: {},
      lighting: {},
      physics: { gravity: [0, -9.8, 0] },
      pngBytes: Buffer.from("png"),
    });
    assert.equal(record.frameIndex, 1);
    assert.equal(typeof record.worldHash, "string");
    assert.equal(typeof record.physicsHash, "string");
    assert.equal("particleHash" in record, false);
  });
});
