/**
 * Character Material Registry
 * Wires character/shaders/*.json (+ WGSL paths) toward RT4D shade selection.
 *
 * Phase 1: Shader Wiring — status: partial
 * - Loads contracts + WGSL for provenance/hash.
 * - Serializes MaterialData-compatible fields for GPU pack.
 * - CPU BRDF stub selects fur/skin/metal/fabric/leather by material id.
 * - SHADE_WGSL uses stand-in BRDFs (signatures differ from character/*.wgsl).
 */

import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Resolve character/shaders relative to this package file (portable). */
export function resolveCharacterShadersDir() {
  // material → rt4d → render → src → renderer-core → packages → mrs → repo root
  return join(__dirname, '../../../../../../../character/shaders');
}

const CHARACTER_SHADERS_DIR = resolveCharacterShadersDir();

export const CHARACTER_MATERIAL_TYPES = Object.freeze([
  'skin',
  'fur',
  'metal',
  'fabric',
  'leather',
]);

export const CHARACTER_MATERIAL_ENUM = Object.freeze({
  standard: 0,
  skin: 1,
  fur: 2,
  metal: 3,
  fabric: 4,
  leather: 5,
});

/**
 * Load character material contract from JSON + WGSL
 */
export function loadCharacterMaterial(materialName, shadersDir = CHARACTER_SHADERS_DIR) {
  try {
    const jsonPath = join(shadersDir, `${materialName}.json`);
    if (!existsSync(jsonPath)) {
      console.warn(`Character material JSON missing: ${jsonPath}`);
      return null;
    }
    const jsonData = JSON.parse(readFileSync(jsonPath, 'utf8'));

    // Try 4D shader first, fall back to 3D
    const wgslFileName4D = jsonData.wgsl?.replace('.wgsl', '_4d.wgsl') || `${materialName}_4d.wgsl`;
    const wgslFileName3D = jsonData.wgsl || `${materialName}.wgsl`;
    
    let wgslSource = null;
    let wgslPath = null;
    let shaderVersion = '3d';
    
    const wgslPath4D = join(shadersDir, wgslFileName4D);
    if (existsSync(wgslPath4D)) {
      wgslSource = readFileSync(wgslPath4D, 'utf8');
      wgslPath = wgslPath4D;
      shaderVersion = '4d';
    } else {
      const wgslPath3D = join(shadersDir, wgslFileName3D);
      if (!existsSync(wgslPath3D)) {
        console.warn(`Character material WGSL missing: ${wgslPath3D}`);
        return null;
      }
      wgslSource = readFileSync(wgslPath3D, 'utf8');
      wgslPath = wgslPath3D;
    }

    const hashInput = `${materialName}:${jsonData.status}:${wgslSource}`;
    const hash = createHash('sha256').update(hashInput).digest('hex').slice(0, 16);

    return {
      name: materialName,
      id: jsonData.id || materialName,
      status: jsonData.status || 'unknown',
      type: jsonData.type || 'character',
      pbr: jsonData.pbr || {},
      sss: jsonData.sss || null,
      normal: jsonData.normal || null,
      shaderSource: wgslSource,
      shaderHash: hash,
      shaderVersion: shaderVersion,
      provenance: {
        source: `character/shaders/${wgslFileName4D}`,
        json_source: `character/shaders/${materialName}.json`,
        hash,
        status: shaderVersion === '4d' ? 'integrated' : 'partial',
        version: shaderVersion,
      },
    };
  } catch (error) {
    console.warn(`Character material ${materialName} not found:`, error.message);
    return null;
  }
}

/**
 * Load all character materials
 */
export function loadAllCharacterMaterials(shadersDir = CHARACTER_SHADERS_DIR) {
  const materials = {};

  for (const type of CHARACTER_MATERIAL_TYPES) {
    const mat = loadCharacterMaterial(type, shadersDir);
    if (mat) {
      materials[type] = mat;
    }
  }

  return materials;
}

let _characterMaterialsCache = null;

/**
 * Clear cache (tests / hot-reload)
 */
export function clearCharacterMaterialsCache() {
  _characterMaterialsCache = null;
}

/**
 * Get cached character materials
 */
export function getCharacterMaterials() {
  if (!_characterMaterialsCache) {
    _characterMaterialsCache = loadAllCharacterMaterials();
  }
  return _characterMaterialsCache;
}

/**
 * Get specific character material
 */
export function getCharacterMaterial(materialName) {
  const materials = getCharacterMaterials();
  const mat = materials[materialName];

  if (!mat) {
    throw new Error(`Unknown character material: ${materialName}`);
  }

  return mat;
}

/**
 * Resolve a scene material id to a character contract name, or null.
 * Accepts exact names ("skin") or ids containing the name ("skin-char-001").
 */
export function resolveCharacterMaterialName(materialId) {
  if (!materialId || typeof materialId !== 'string') return null;
  if (CHARACTER_MATERIAL_TYPES.includes(materialId)) return materialId;
  const idLower = materialId.toLowerCase();
  for (const name of CHARACTER_MATERIAL_TYPES) {
    if (idLower === name || idLower.includes(name)) return name;
  }
  return null;
}

/**
 * Serialize character material for GPU MaterialData buffer (16 floats).
 */
export function serializeCharacterMaterial(materialName, params = {}) {
  const name = resolveCharacterMaterialName(materialName) || materialName;
  const mat = getCharacterMaterial(name);

  const pbr = { ...mat.pbr, ...(params.pbr || {}) };
  if (params.baseColor) pbr.baseColor = params.baseColor;
  if (params.roughness != null) pbr.roughness = params.roughness;
  if (params.metallic != null) pbr.metallic = params.metallic;

  return {
    albedo: [
      pbr.baseColor?.[0] ?? 0.8,
      pbr.baseColor?.[1] ?? 0.8,
      pbr.baseColor?.[2] ?? 0.8,
      pbr.baseColor?.[3] ?? 1.0,
    ],

    emission: [
      pbr.emissive?.[0] ?? 0,
      pbr.emissive?.[1] ?? 0,
      pbr.emissive?.[2] ?? 0,
      1.0,
    ],

    // x = character material type enum, y = roughness, z = metallic, w = reserved
    typeAndParams: [
      CHARACTER_MATERIAL_ENUM[name] ?? 0,
      pbr.roughness ?? 0.5,
      pbr.metallic ?? 0.0,
      0.0,
    ],

    volumeParams: serializeVolumeParams(mat),

    characterType: CHARACTER_MATERIAL_ENUM[name] ?? 0,
    characterName: name,
    shaderHash: mat.shaderHash,
    provenance: mat.provenance,
  };
}

/**
 * Pack serialized material into Float32Array(16) matching MaterialData layout.
 */
export function packCharacterMaterialFloats(serialized) {
  const arr = new Float32Array(16);
  arr[0] = serialized.albedo[0];
  arr[1] = serialized.albedo[1];
  arr[2] = serialized.albedo[2];
  arr[3] = serialized.albedo[3];
  arr[4] = serialized.emission[0];
  arr[5] = serialized.emission[1];
  arr[6] = serialized.emission[2];
  arr[7] = serialized.emission[3];
  arr[8] = serialized.typeAndParams[0];
  arr[9] = serialized.typeAndParams[1];
  arr[10] = serialized.typeAndParams[2];
  arr[11] = serialized.typeAndParams[3];
  arr[12] = serialized.volumeParams[0];
  arr[13] = serialized.volumeParams[1];
  arr[14] = serialized.volumeParams[2];
  arr[15] = serialized.volumeParams[3];
  return arr;
}

/**
 * Round-trip: pack → unpack key fields (for tests).
 */
export function unpackCharacterMaterialFloats(arr) {
  const f = arr instanceof Float32Array ? arr : new Float32Array(arr);
  return {
    albedo: [f[0], f[1], f[2], f[3]],
    emission: [f[4], f[5], f[6], f[7]],
    typeAndParams: [f[8], f[9], f[10], f[11]],
    volumeParams: [f[12], f[13], f[14], f[15]],
    characterType: Math.round(f[8]),
  };
}

function serializeVolumeParams(mat) {
  if (!mat.sss) {
    return [0, 0, 0, 0];
  }

  const sss = mat.sss;
  return [
    sss.radius?.[0] ?? 1.0,
    sss.radius?.[1] ?? 0.35,
    sss.radius?.[2] ?? 0.2,
    sss.scale ?? 0.012,
  ];
}

/**
 * CPU stand-in BRDF selection by character material id.
 * Mirrors SHADE_WGSL character branches (not the WGSL source verbatim).
 *
 * @param {string} materialName
 * @param {{ n: number[], l: number[], v: number[] }} dirs unit vectors
 * @returns {{ rgb: number[], characterType: number, materialName: string, shaderHash: string }}
 */
export function evaluateCharacterBrdfCpu(materialName, dirs = {}) {
  const serialized = serializeCharacterMaterial(materialName);
  const name = serialized.characterName;
  const albedo = serialized.albedo;
  const roughness = serialized.typeAndParams[1];
  const metallic = serialized.typeAndParams[2];
  const sssR = serialized.volumeParams[0];
  const sssScale = serialized.volumeParams[3];

  const n = dirs.n || [0, 0, 1];
  const l = dirs.l || [0.45, 0.75, 0.48];
  const v = dirs.v || [0, 0, 1];
  const ndotl = Math.max(0, n[0] * l[0] + n[1] * l[1] + n[2] * l[2]);

  let rgb;
  switch (name) {
    case 'skin': {
      const wrap = Math.max(0, ndotl * 0.5 + 0.5);
      const warm = 1 + 0.5 * sssScale;
      rgb = [
        albedo[0] * (0.65 * ndotl + 0.35 * wrap) * warm + sssR * sssScale * 0.05,
        albedo[1] * (0.65 * ndotl + 0.35 * wrap) * warm + serialized.volumeParams[1] * sssScale * 0.05,
        albedo[2] * (0.65 * ndotl + 0.35 * wrap) * warm + serialized.volumeParams[2] * sssScale * 0.05,
      ];
      break;
    }
    case 'fur': {
      const spec = Math.pow(ndotl, 1 / Math.max(roughness, 0.01));
      rgb = [
        albedo[0] * (ndotl * 0.7 + spec * 0.3),
        albedo[1] * (ndotl * 0.7 + spec * 0.3),
        albedo[2] * (ndotl * 0.7 + spec * 0.3),
      ];
      break;
    }
    case 'metal': {
      const spec = Math.pow(ndotl, 1 / Math.max(roughness, 0.01));
      const f0 = metallic;
      rgb = [
        (albedo[0] * f0 + 0.04 * (1 - f0)) * spec,
        (albedo[1] * f0 + 0.04 * (1 - f0)) * spec,
        (albedo[2] * f0 + 0.04 * (1 - f0)) * spec,
      ];
      break;
    }
    case 'fabric':
    case 'leather': {
      const sheen = Math.pow(ndotl, 1 / Math.max(roughness * 2, 0.01));
      rgb = [
        albedo[0] * (ndotl * 0.8 + sheen * 0.2),
        albedo[1] * (ndotl * 0.8 + sheen * 0.2),
        albedo[2] * (ndotl * 0.8 + sheen * 0.2),
      ];
      break;
    }
    default:
      rgb = [albedo[0] * ndotl, albedo[1] * ndotl, albedo[2] * ndotl];
  }

  return {
    rgb: rgb.map((c) => Math.min(1, Math.max(0, c))),
    characterType: serialized.characterType,
    materialName: name,
    shaderHash: serialized.shaderHash,
  };
}

/**
 * Concatenate character WGSL sources for documentation / future include.
 * Status: partial — not safe to append raw into SHADE_WGSL (signature mismatch).
 */
export function buildCharacterShadersWgsl() {
  const materials = getCharacterMaterials();
  const shaderParts = [];

  for (const [name, mat] of Object.entries(materials)) {
    shaderParts.push(
      `// Character material: ${name}\n` +
        `// Source: ${mat.provenance.source}\n` +
        `// Hash: ${mat.shaderHash}\n` +
        `// NOTE: signatures differ from SHADE_WGSL stand-ins — do not naive-inline.\n` +
        mat.shaderSource +
        '\n',
    );
  }

  return shaderParts.join('\n');
}

export function getCharacterMaterialTypeEnum(materialName) {
  const name = resolveCharacterMaterialName(materialName) || materialName;
  return CHARACTER_MATERIAL_ENUM[name] ?? 0;
}

export function isCharacterMaterial(materialId) {
  return resolveCharacterMaterialName(materialId) != null;
}

/**
 * Convert legacy material entry to character material if applicable
 */
export function enhanceMaterialWithCharacterData(materialEntry) {
  if (!materialEntry || !materialEntry.kind) {
    return materialEntry;
  }

  const kindToCharacter = {
    skin: 'skin',
    hair: 'fur',
    cloth: 'fabric',
    metal: 'metal',
    leather: 'leather',
    fabric: 'fabric',
    fur: 'fur',
  };

  const characterType = kindToCharacter[materialEntry.kind];

  if (characterType) {
    const charMat = getCharacterMaterial(characterType);
    if (charMat) {
      return {
        ...materialEntry,
        characterType: CHARACTER_MATERIAL_ENUM[characterType],
        characterShaderSource: charMat.shaderSource,
        characterShaderHash: charMat.shaderHash,
        provenance: {
          ...(materialEntry.provenance || {}),
          character_material: charMat.provenance,
        },
      };
    }
  }

  return materialEntry;
}

export default {
  CHARACTER_MATERIAL_TYPES,
  CHARACTER_MATERIAL_ENUM,
  resolveCharacterShadersDir,
  loadCharacterMaterial,
  loadAllCharacterMaterials,
  clearCharacterMaterialsCache,
  getCharacterMaterials,
  getCharacterMaterial,
  resolveCharacterMaterialName,
  serializeCharacterMaterial,
  packCharacterMaterialFloats,
  unpackCharacterMaterialFloats,
  evaluateCharacterBrdfCpu,
  buildCharacterShadersWgsl,
  getCharacterMaterialTypeEnum,
  isCharacterMaterial,
  enhanceMaterialWithCharacterData,
};
