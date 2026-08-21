import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ENERGY_MESH_NAME,
  FOX_WARRIOR_PREVIEW_IDS,
  exportWarriorHybridGlb,
  fixtureClayVertices,
  isWarriorCharacterId,
} from "../src/warrior-fixture-hybrid.js";

describe("warrior fixture hybrid", () => {
  it("maps warrior-anthro-fox-01 to sculptor fixture, not a production sculpt", () => {
    assert.equal(isWarriorCharacterId(FOX_WARRIOR_PREVIEW_IDS.characterId), true);
    const hybrid = exportWarriorHybridGlb();
    assert.equal(hybrid.statusTag, "partial");
    assert.equal(hybrid.productionSculpt, false);
    assert.equal(hybrid.fixtureStatus, "core-enforced-fixture-not-production-sculpt");
    assert.equal(hybrid.energy.meshName, ENERGY_MESH_NAME);
    assert.equal(hybrid.energy.kind, "convex_hull");
    assert.equal(hybrid.energy.role, "energy-field-only");
    assert.equal(hybrid.character.kind, "sculptor_fixture");
    assert.equal(hybrid.character.rigSchemaVersion, "character-rig/1.0");
    assert.ok(hybrid.character.vertexCount >= 4);
    assert.equal(hybrid.glb[0], 0x67);
    assert.equal(hybrid.glb[1], 0x6c);
    assert.equal(hybrid.glb[2], 0x54);
    assert.equal(hybrid.glb[3], 0x46);
    assert.match(hybrid.glbSha256, /^[0-9a-f]{64}$/);
    assert.match(hybrid.claim, /Not a production sculpt/);
  });

  it("clay vertices come from the fixture document, not a hull generator", () => {
    const verts = fixtureClayVertices("anthro");
    assert.equal(verts.length, 4);
    assert.equal(verts[0].length, 3);
  });
});
