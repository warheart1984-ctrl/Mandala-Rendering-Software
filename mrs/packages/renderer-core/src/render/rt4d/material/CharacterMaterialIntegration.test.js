/**
 * Character Material Integration Tests
 * Tests end-to-end integration of character materials with GPU renderer
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { 
  getCharacterMaterial,
  serializeCharacterMaterial,
  CHARACTER_MATERIAL_ENUM
} from './CharacterMaterialRegistry.js';

// Mock scene with character materials
function createMockSceneWithCharacterMaterials() {
  return {
    materials: {
      listIds() { return ['skin-char-001', 'fur-char-001', 'metal-char-001', 'fabric-char-001', 'leather-char-001', 'standard-mat']; },
      get(id) {
        const mockMaterials = {
          'skin-char-001': {
            id: 'skin-char-001',
            type: 'lambertian',
            params: { albedo: { x: 0.7, y: 0.5, z: 0.4, w: 1 }, roughness: 0.48 },
            emission: { x: 0, y: 0, z: 0, w: 0 }
          },
          'fur-char-001': {
            id: 'fur-char-001',
            type: 'lambertian',
            params: { albedo: { x: 0.3, y: 0.2, z: 0.1, w: 1 }, roughness: 0.7 },
            emission: { x: 0, y: 0, z: 0, w: 0 }
          },
          'metal-char-001': {
            id: 'metal-char-001',
            type: 'ggx',
            params: { albedo: { x: 0.8, y: 0.8, z: 0.8, w: 1 }, roughness: 0.1, f0: { x: 0.9, y: 0.9, z: 0.9, w: 1 } },
            emission: { x: 0, y: 0, z: 0, w: 0 }
          },
          'fabric-char-001': {
            id: 'fabric-char-001',
            type: 'lambertian',
            params: { albedo: { x: 0.6, y: 0.2, z: 0.2, w: 1 }, roughness: 0.8 },
            emission: { x: 0, y: 0, z: 0, w: 0 }
          },
          'leather-char-001': {
            id: 'leather-char-001',
            type: 'lambertian',
            params: { albedo: { x: 0.28, y: 0.14, z: 0.08, w: 1 }, roughness: 0.72 },
            emission: { x: 0, y: 0, z: 0, w: 0 }
          },
          'standard-mat': {
            id: 'standard-mat',
            type: 'lambertian',
            params: { albedo: { x: 0.8, y: 0.8, z: 0.8, w: 1 }, roughness: 0.5 },
            emission: { x: 0, y: 0, z: 0, w: 0 }
          }
        };
        return mockMaterials[id] || null;
      }
    }
  };
}

describe('Character Material Integration', () => {
  it('recognizes skin material by id', () => {
    const mat = getCharacterMaterial('skin');
    assert.ok(mat);
    assert.equal(mat.name, 'skin');
    
    const serialized = serializeCharacterMaterial('skin');
    assert.equal(serialized.characterType, CHARACTER_MATERIAL_ENUM.skin);
    assert.equal(serialized.typeAndParams[0], 1);
  });
  
  it('recognizes fur material by id', () => {
    const serialized = serializeCharacterMaterial('fur');
    assert.equal(serialized.characterType, CHARACTER_MATERIAL_ENUM.fur);
    assert.equal(serialized.typeAndParams[0], 2);
  });
  
  it('recognizes metal material by id', () => {
    const serialized = serializeCharacterMaterial('metal');
    assert.equal(serialized.characterType, CHARACTER_MATERIAL_ENUM.metal);
    assert.equal(serialized.typeAndParams[0], 3);
  });
  
  it('serializes volume params for SSS materials', () => {
    const serialized = serializeCharacterMaterial('skin');
    
    // Skin has SSS
    assert.ok(serialized.volumeParams[0] > 0);
    assert.ok(serialized.volumeParams[3] > 0);
    assert.deepEqual(serialized.volumeParams, [1, 0.35, 0.2, 0.012]);
  });

  it('resolves scene ids containing character name for serialize', () => {
    const serialized = serializeCharacterMaterial('skin-char-001');
    assert.equal(serialized.characterType, CHARACTER_MATERIAL_ENUM.skin);
    assert.equal(serialized.characterName, 'skin');
  });
  
  it('serializes zero volume params for non-SSS materials', () => {
    const serialized = serializeCharacterMaterial('metal');
    
    assert.deepEqual(serialized.volumeParams, [0, 0, 0, 0]);
  });
  
  it('creates GPU-compatible buffer data', () => {
    const serialized = serializeCharacterMaterial('skin');
    
    // Verify structure matches WGSL MaterialData struct
    // albedo: vec4<f32>
    assert.equal(serialized.albedo.length, 4);
    serialized.albedo.forEach(v => assert.equal(typeof v, 'number'));
    
    // emission: vec4<f32>
    assert.equal(serialized.emission.length, 4);
    serialized.emission.forEach(v => assert.equal(typeof v, 'number'));
    
    // typeAndParams: vec4<f32>
    assert.equal(serialized.typeAndParams.length, 4);
    serialized.typeAndParams.forEach(v => assert.equal(typeof v, 'number'));
    
    // volumeParams: vec4<f32>
    assert.equal(serialized.volumeParams.length, 4);
    serialized.volumeParams.forEach(v => assert.equal(typeof v, 'number'));
  });
  
  it('preserves provenance chain', () => {
    const serialized = serializeCharacterMaterial('skin');
    
    assert.ok(serialized.provenance);
    assert.ok(serialized.provenance.source);
    assert.ok(serialized.provenance.json_source);
    assert.ok(serialized.provenance.hash);
    assert.equal(serialized.provenance.status, 'partial');
    assert.equal(serialized.shaderHash.length, 16);
  });
  
  it('different materials have different enum values', () => {
    const materials = ['skin', 'fur', 'metal', 'fabric', 'leather'];
    const enums = materials.map(m => serializeCharacterMaterial(m).characterType);
    
    // All should be unique
    const uniqueEnums = new Set(enums);
    assert.equal(uniqueEnums.size, materials.length);
  });
  
  it('character material serialization is deterministic', () => {
    const serialized1 = serializeCharacterMaterial('skin');
    const serialized2 = serializeCharacterMaterial('skin');
    
    assert.deepEqual(serialized1.albedo, serialized2.albedo);
    assert.deepEqual(serialized1.typeAndParams, serialized2.typeAndParams);
    assert.deepEqual(serialized1.volumeParams, serialized2.volumeParams);
    assert.equal(serialized1.shaderHash, serialized2.shaderHash);
  });
  
  it('material params are correctly mapped', () => {
    const serialized = serializeCharacterMaterial('skin');
    
    // From skin.json: baseColor [0.72, 0.52, 0.42, 1]
    assert.deepEqual(serialized.albedo.slice(0, 3), [0.72, 0.52, 0.42]);
    
    // From skin.json: roughness 0.48
    assert.equal(serialized.typeAndParams[1], 0.48);
    
    // From skin.json: metallic 0.0
    assert.equal(serialized.typeAndParams[2], 0.0);
  });
});
