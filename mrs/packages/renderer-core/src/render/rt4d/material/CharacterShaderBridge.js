/**
 * Character Shader Bridge
 * Maps 3D character shaders to 4D RT4D pipeline
 * Converts vec3 → vec4, adapts BRDFs for 4D
 */

/**
 * Convert 3D character shader to 4D
 * @param {string} shaderSource - WGSL shader source
 * @param {string} materialType - skin/fur/metal/fabric/leather
 * @returns {string} 4D WGSL shader source
 */
export function convertCharacterShaderTo4D(shaderSource, materialType) {
  // Replace vec3 with vec4 for 4D
  let converted = shaderSource
    .replace(/vec3<f32>/g, 'vec4<f32>')
    .replace(/vec3<f32>\s*\(/g, 'vec4<f32>(')
    .replace(/vec3<\w+>/g, 'vec4<$1>')
  
  // Replace 3D-specific operations with 4D equivalents
  converted = converted.replace(
    /let ndotl = max\(dot\(n, l\), 0\.0\)/,
    'let ndotl = max(dot(n.xyzw, l.xyzw), 0.0)'
  )
  
  // Add 4D normal handling
  if (!converted.includes('fn normalize4D')) {
    converted = converted.replace(
      'fn skin_brdf(',
      `fn normalize4D(v: vec4<f32>) -> vec4<f32> {
  return v / sqrt(dot(v, v) + 1e-6);
}

fn skin_brdf(`
    )
  }
  
  // Add w component handling
  converted = converted.replace(
    'return diffuse + vec3<f32>(spec * 0.08);',
    'return vec4<f32>(diffuse.xyz, 0.0) + vec4<f32>(spec * 0.08);'
  )
  
  return converted
}

/**
 * Generate 4D character material shader
 * @param {Object} materialConfig - Material configuration from JSON
 * @returns {string} WGSL shader source
 */
export function generate4DCharacterMaterialShader(materialConfig) {
  const { id, status, pbr, sss } = materialConfig
  
  const materialType = id
  
  const shaderTemplate = `
// 4D Character Material - ${materialType}
// Generated from character shader contract
// Status: ${status}

struct MaterialData {
  albedo: vec4<f32>,
  emission: vec4<f32>,
  typeAndParams: vec4<f32>,
  volumeParams: vec4<f32>,
}

struct LightData {
  center: vec4<f32>,
  radius: f32,
  emission: vec4<f32>,
}

const PI: f32 = 3.14159265
const EPS: f32 = 1e-6

fn evaluateCharacterBRDF_${materialType}(
  material: MaterialData,
  normal: vec4<f32>,
  lightDir: vec4<f32>,
  viewDir: vec4<f32>,
  light: LightData
) -> vec4<f32> {
  let albedo = material.albedo
  let emission = material.emission
  let roughness = material.typeAndParams.x
  let metallic = material.typeAndParams.y
  let sssScale = material.volumeParams.x
  
  let NdotL = max(dot(normal, lightDir), 0.0)
  let NdotV = max(dot(normal, viewDir), 0.0)
  
  if (NdotL <= 0.0) {
    return emission
  }
  
  // Base albedo with metallic
  let F0 = mix(vec4<f32>(0.04), albedo, metallic)
  
  // Diffuse component
  let diffuse = albedo * (1.0 - metallic) / PI
  
  // Specular component (GGX approximation)
  let halfVec = normalize(lightDir + viewDir)
  let NdotH = max(dot(normal, halfVec), 0.0)
  let VdotH = max(dot(viewDir, halfVec), 0.0)
  let alpha = roughness * roughness
  let alpha2 = alpha * alpha
  let denom = NdotH * NdotH * (alpha2 - 1.0) + 1.0
  let D = alpha2 / (PI * denom * denom + EPS)
  
  // Fresnel
  let F = F0 + (vec4<f32>(1.0) - F0) * pow(1.0 - VdotH, 5.0)
  
  // Geometry
  let G = 1.0
  
  let specular = (D * F * G) / max(4.0 * NdotL * NdotV, EPS)
  
  // Subsurface scattering approximation
  let sss = sssScale * exp(-roughness * 2.0) * NdotL
  
  let result = (diffuse + specular) * NdotL * light.emission + emission
  let sssResult = result * (1.0 + sss)
  
  return sssResult
}

export fn evaluateMaterial_${materialType}(material: MaterialData, normal: vec4<f32>, lightDir: vec4<f32>, viewDir: vec4<f32>, light: LightData) -> vec4<f32> {
  return evaluateCharacterBRDF_${materialType}(material, normal, lightDir, viewDir, light)
}
`
  
  return shaderTemplate
}

/**
 * Material type mapping for 4D rendering
 */
export const CHARACTER_MATERIAL_TYPES = {
  skin: {
    typeIndex: 1,
    params: {
      roughness: 0.48,
      metallic: 0.0,
      sssScale: 0.012
    }
  },
  fur: {
    typeIndex: 2,
    params: {
      roughness: 0.7,
      metallic: 0.0,
      sssScale: 0.001
    }
  },
  metal: {
    typeIndex: 3,
    params: {
      roughness: 0.2,
      metallic: 1.0,
      sssScale: 0.0
    }
  },
  fabric: {
    typeIndex: 4,
    params: {
      roughness: 0.8,
      metallic: 0.0,
      sssScale: 0.0
    }
  },
  leather: {
    typeIndex: 5,
    params: {
      roughness: 0.6,
      metallic: 0.0,
      sssScale: 0.0
    }
  }
}

/**
 * Convert character material config to RT4D MaterialData
 * @param {Object} materialConfig - Character material config
 * @returns {Object} RT4D MaterialData
 */
export function convertCharacterMaterialToRT4D(materialConfig) {
  const { id, pbr, sss } = materialConfig
  
  const materialType = CHARACTER_MATERIAL_TYPES[id]
  if (!materialType) {
    throw new Error(`Unknown material type: ${id}`)
  }
  
  return {
    albedo: {
      x: pbr.baseColor[0],
      y: pbr.baseColor[1],
      z: pbr.baseColor[2],
      w: pbr.baseColor[3]
    },
    emission: {
      x: pbr.emissive[0],
      y: pbr.emissive[1],
      z: pbr.emissive[2],
      w: 0.0
    },
    typeAndParams: {
      x: materialType.typeIndex,
      y: pbr.roughness,
      z: pbr.metallic,
      w: 0.0
    },
    volumeParams: {
      x: sss?.scale || 0.0,
      y: sss?.radius?.[0] || 0.0,
      z: sss?.radius?.[1] || 0.0,
      w: sss?.radius?.[2] || 0.0
    }
  }
}
