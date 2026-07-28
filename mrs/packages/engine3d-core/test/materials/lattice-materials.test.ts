import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  glassTubeMaterial,
  chromeJointMaterial,
  coreGlowMaterial,
  DEFAULT_LATTICE_MATERIALS,
  bindDefaultLatticeMaterials,
} from "../../src/materials/LatticeMaterials.js";
import { materialToRt4dEntry } from "../../src/world/MaterialSystem.js";
import { DefaultWorld3D } from "../../src/world/World3D.js";
import type { UniversalMaterial } from "../../src/world/WorldObject.js";
import type { WorldMesh } from "../../src/world/WorldMesh.js";

describe("LatticeMaterials", () => {
  it("matches glass/chrome/core intent", () => {
    assert.equal(glassTubeMaterial.id, "glass_tube");
    assert.equal(glassTubeMaterial.type, "glass");
    assert.equal(glassTubeMaterial.roughness, 0.03);
    assert.deepEqual(glassTubeMaterial.baseColor, [0.15, 0.45, 1.0]);

    assert.equal(chromeJointMaterial.id, "chrome_joint");
    assert.equal(chromeJointMaterial.type, "metal");
    assert.equal(chromeJointMaterial.metallic, 1.0);
    assert.equal(chromeJointMaterial.roughness, 0.08);

    assert.equal(coreGlowMaterial.id, "core_glow");
    assert.equal(coreGlowMaterial.type, "emissive");
    assert.ok(coreGlowMaterial.emissive[0] >= 10);
  });

  it("registers all three ids", () => {
    const bag: Record<string, UniversalMaterial> = {};
    bindDefaultLatticeMaterials(bag);
    assert.equal(Object.keys(bag).sort().join(","), "chrome_joint,core_glow,glass_tube");
    assert.equal(DEFAULT_LATTICE_MATERIALS["glass_tube"]!.id, "glass_tube");
  });

  it("maps to RT4D entries", () => {
    const glass = materialToRt4dEntry(glassTubeMaterial);
    assert.equal(glass.params.brdf, "dielectric");
    assert.equal(glass.params.transmission, 1);
    const chrome = materialToRt4dEntry(chromeJointMaterial);
    assert.equal(chrome.params.brdf, "ggx");
    assert.equal(chrome.params.metallic, 1);
    const core = materialToRt4dEntry(coreGlowMaterial);
    assert.equal(core.params.brdf, "emissive");
  });

  it("World3D.addLatticeMaterials binds the still-world defaults", () => {
    const mesh = {
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      indices: new Uint32Array([0, 1, 2]),
    } as WorldMesh;
    const world = new DefaultWorld3D(mesh);
    world.addLatticeMaterials();
    assert.equal(world.latticeMaterialsBound, true);
    assert.equal(world.materials["glass_tube"]?.type, "glass");
    assert.equal(world.materials["chrome_joint"]?.type, "metal");
    assert.equal(world.materials["core_glow"]?.type, "emissive");
  });
});
