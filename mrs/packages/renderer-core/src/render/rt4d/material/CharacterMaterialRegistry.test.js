/**
 * Character Material Registry Tests
 * Phase 1 — status: partial
 */

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { existsSync } from "node:fs";
import {
  loadCharacterMaterial,
  loadAllCharacterMaterials,
  getCharacterMaterials,
  getCharacterMaterial,
  serializeCharacterMaterial,
  packCharacterMaterialFloats,
  unpackCharacterMaterialFloats,
  buildCharacterShadersWgsl,
  getCharacterMaterialTypeEnum,
  isCharacterMaterial,
  enhanceMaterialWithCharacterData,
  evaluateCharacterBrdfCpu,
  resolveCharacterMaterialName,
  resolveCharacterShadersDir,
  clearCharacterMaterialsCache,
  CHARACTER_MATERIAL_TYPES,
  CHARACTER_MATERIAL_ENUM,
} from "./CharacterMaterialRegistry.js";

describe("CharacterMaterialRegistry", () => {
  before(() => {
    clearCharacterMaterialsCache();
  });

  it("resolves character shaders directory that exists", () => {
    const dir = resolveCharacterShadersDir();
    assert.ok(existsSync(dir), `expected shaders dir: ${dir}`);
    assert.ok(existsSync(`${dir}/skin.json`));
  });

  it("loads skin material correctly", () => {
    const mat = loadCharacterMaterial("skin");

    assert.ok(mat);
    assert.equal(mat.name, "skin");
    assert.equal(mat.id, "skin");
    assert.equal(mat.status, "partial");
    assert.ok(mat.shaderSource.includes("skin_brdf"));
    assert.ok(mat.shaderHash);
    assert.equal(mat.provenance.source, "character/shaders/skin.wgsl");
    assert.equal(mat.provenance.loaded_at, undefined);
  });

  it("loads all character materials", () => {
    const materials = loadAllCharacterMaterials();

    assert.ok(materials);
    assert.equal(Object.keys(materials).length, CHARACTER_MATERIAL_TYPES.length);

    for (const type of CHARACTER_MATERIAL_TYPES) {
      assert.ok(materials[type], type);
      assert.equal(materials[type].name, type);
    }
  });

  it("caches materials", () => {
    clearCharacterMaterialsCache();
    const mat1 = getCharacterMaterials();
    const mat2 = getCharacterMaterials();
    assert.strictEqual(mat1, mat2);
  });

  it("gets specific material", () => {
    const mat = getCharacterMaterial("skin");
    assert.equal(mat.name, "skin");
    assert.deepEqual(mat.pbr.baseColor, [0.72, 0.52, 0.42, 1]);
  });

  it("throws on unknown material", () => {
    assert.throws(() => getCharacterMaterial("unknown"), /Unknown character material/);
  });

  it("serializes skin material for GPU", () => {
    const serialized = serializeCharacterMaterial("skin");

    assert.equal(serialized.albedo.length, 4);
    assert.equal(serialized.albedo[0], 0.72);
    assert.equal(serialized.albedo[1], 0.52);
    assert.equal(serialized.albedo[2], 0.42);

    assert.equal(serialized.typeAndParams[0], CHARACTER_MATERIAL_ENUM.skin);
    assert.equal(serialized.typeAndParams[1], 0.48);
    assert.equal(serialized.typeAndParams[2], 0.0);

    assert.equal(serialized.volumeParams.length, 4);
    assert.equal(serialized.characterType, 1);
  });

  it("serialize → pack → unpack round-trip preserves MaterialData floats", () => {
    for (const name of CHARACTER_MATERIAL_TYPES) {
      const serialized = serializeCharacterMaterial(name);
      const packed = packCharacterMaterialFloats(serialized);
      assert.equal(packed.length, 16);
      const unpacked = unpackCharacterMaterialFloats(packed);
      for (let i = 0; i < 4; i++) {
        assert.ok(Math.abs(unpacked.albedo[i] - serialized.albedo[i]) < 1e-6);
        assert.ok(Math.abs(unpacked.emission[i] - serialized.emission[i]) < 1e-6);
        assert.ok(Math.abs(unpacked.typeAndParams[i] - serialized.typeAndParams[i]) < 1e-6);
        assert.ok(Math.abs(unpacked.volumeParams[i] - serialized.volumeParams[i]) < 1e-6);
      }
      assert.equal(unpacked.characterType, serialized.characterType);
    }
  });

  it("serializes non-SSS material with zero volume", () => {
    const serialized = serializeCharacterMaterial("metal");
    assert.equal(serialized.typeAndParams[0], CHARACTER_MATERIAL_ENUM.metal);
    assert.deepEqual(serialized.volumeParams, [0, 0, 0, 0]);
  });

  it("builds WGSL concat with character sources (provenance only)", () => {
    const wgsl = buildCharacterShadersWgsl();
    assert.ok(wgsl.includes("skin_brdf"));
    assert.ok(wgsl.includes("Character material: skin"));
    assert.ok(wgsl.includes("do not naive-inline"));
  });

  it("gets material type enum", () => {
    assert.equal(getCharacterMaterialTypeEnum("skin"), 1);
    assert.equal(getCharacterMaterialTypeEnum("fur"), 2);
    assert.equal(getCharacterMaterialTypeEnum("metal"), 3);
    assert.equal(getCharacterMaterialTypeEnum("skin-char-001"), 1);
    assert.equal(getCharacterMaterialTypeEnum("unknown"), 0);
  });

  it("identifies character materials", () => {
    assert.equal(isCharacterMaterial("skin"), true);
    assert.equal(isCharacterMaterial("fur-char-001"), true);
    assert.equal(isCharacterMaterial("standard"), false);
  });

  it("resolves character material names from scene ids", () => {
    assert.equal(resolveCharacterMaterialName("skin"), "skin");
    assert.equal(resolveCharacterMaterialName("skin-char-001"), "skin");
    assert.equal(resolveCharacterMaterialName("basic"), null);
  });

  it("enhances material with character data", () => {
    const materialEntry = {
      id: "char-skin-001",
      kind: "skin",
      params: { baseColor: [0.7, 0.5, 0.4] },
    };

    const enhanced = enhanceMaterialWithCharacterData(materialEntry);
    assert.equal(enhanced.characterType, 1);
    assert.ok(enhanced.characterShaderSource);
    assert.ok(enhanced.characterShaderHash);
    assert.ok(enhanced.provenance.character_material);
  });

  it("does not enhance non-character materials", () => {
    const materialEntry = {
      id: "basic-001",
      kind: "basic",
      params: { baseColor: [0.8, 0.8, 0.8] },
    };
    const enhanced = enhanceMaterialWithCharacterData(materialEntry);
    assert.strictEqual(enhanced, materialEntry);
    assert.equal(enhanced.characterType, undefined);
  });

  it("material provenance includes deterministic hash (no wall-clock)", () => {
    const a = loadCharacterMaterial("skin");
    const b = loadCharacterMaterial("skin");
    assert.equal(a.provenance.hash, b.provenance.hash);
    assert.equal(a.provenance.hash.length, 16);
  });

  it("CPU BRDF stub returns distinct responses by material id", () => {
    const dirs = { n: [0, 0, 1], l: [0.3, 0.7, 0.6], v: [0, 0, 1] };
    const skin = evaluateCharacterBrdfCpu("skin", dirs);
    const metal = evaluateCharacterBrdfCpu("metal", dirs);
    assert.equal(skin.characterType, 1);
    assert.equal(metal.characterType, 3);
    assert.notDeepEqual(skin.rgb, metal.rgb);
  });
});
