/**
 * Sovereign IDE RT4D Material Loader
 * Loads JSON material definitions into Vulkan MaterialsBuffer
 */

const MATERIALS_MAP = {
  'DIFFUSE': 4,
  'DISNEY': 0,
  'GGX': 1,
  'GLASS': 2,
  'THIN_GLASS': 3
};

function loadMaterialJSON(jsonPath) {
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  
  // Pack into GPU buffer format
  // vec3 baseColor, float metallic
  // float roughness, float ior
  // vec3 emission, float emissionStrength
  // int bsdfType, int flags
  
  const buffer = new Float32Array(16);
  buffer[0] = data.baseColor[0];
  buffer[1] = data.baseColor[1];
  buffer[2] = data.baseColor[2];
  buffer[3] = data.metallic;
  
  buffer[4] = data.roughness;
  buffer[5] = data.ior || 1.5;
  buffer[6] = 0.0;
  buffer[7] = 0.0;
  
  buffer[8] = data.emission[0];
  buffer[9] = data.emission[1];
  buffer[10] = data.emission[2];
  buffer[11] = data.emissionStrength;
  
  buffer[12] = MATERIALS_MAP[data.bsdfType] || 0;
  buffer[13] = data.flags ? 1 : 0;
  buffer[14] = data.clearcoat || 0.0;
  buffer[15] = data.clearcoatGloss || 0.0;
  
  return buffer;
}

// Sovereign IDE viewport sliders
module.exports = {
  // Env exposure slider 0..4
  setEnvExposure: (engine, value) => {
    const ubo = new Float32Array(4);
    ubo[0] = value;
    engine.updateUniformBuffer('EnvSettingsUBO', 3, ubo);
  },
  
  // Gamma slider 1.8..2.4
  setGamma: (engine, value) => {
    const ubo = new Float32Array(4);
    ubo[1] = value;
    engine.updateUniformBuffer('EnvSettingsUBO', 3, ubo);
  },
  
  // Material editor JSON -> GPU buffer
  loadMaterial: (engine, jsonPath, index) => {
    const buffer = loadMaterialJSON(jsonPath);
    engine.updateStorageBuffer('MaterialsBuffer', index * 64, buffer);
  },
  
  // RT4D render loop hook
  renderRT4D: (engine, settings) => {
    const { width, height, maxDepth, spp } = settings;
    
    // 1. Raygen
    engine.dispatchRT4DPass(0, engine.RT4DPassType.RAYGEN, 
      Math.ceil(width/64), Math.ceil(height/64));
    
    // 2. Path queue loop
    for (let bounce = 0; bounce < maxDepth; bounce++) {
      engine.dispatchRT4DPass(1, engine.RT4DPassType.BVH,
        Math.ceil(width/64), Math.ceil(height/64));
      engine.dispatchRT4DPass(2, engine.RT4DPassType.SHADE,
        Math.ceil(width/64), Math.ceil(height/64));
    }
    
    // 3. Accumulate
    engine.dispatchRT4DPass(3, engine.RT4DPassType.ACCUM, 
      Math.ceil(width/64), Math.ceil(height/64));
    
    // 4. Temporal
    engine.dispatchRT4DPass(4, engine.RT4DPassType.TEMPORAL,
      Math.ceil(width/8), Math.ceil(height/8));
    
    // 5. SVGF
    engine.dispatchRT4DPass(5, engine.RT4DPassType.DENOISE,
      Math.ceil(width/8), Math.ceil(height/8));
    
    // 6. Resolve + Tonemap
    engine.dispatchRT4DPass(6, engine.RT4DPassType.DENOISE,
      Math.ceil(width/8), Math.ceil(height/8));
  }
};

// Example usage:
// const { setEnvExposure, loadMaterial } = require('./sovereign_rt4d_material_loader');
// setEnvExposure(engine, 1.5);
// loadMaterial(engine, './materials/polished_glass.json', 0);
