# Character Shader → GPU Renderer Wiring Plan

## Current State

**Character Shaders (Existing):**
```
character/shaders/
├── skin.json + skin.wgsl (SSS declared, Lambert stand-in)
├── fur.json + fur.wgsl (anisotropic)
├── metal.json + metal.wgsl (conductor)
├── fabric.json + fabric.wgsl (roughness+grain)
├── leather.json + leather.wgsl (roughness+grain)
└── library.mjs (shader loader)
```

**GPU Renderer (Existing):**
```
mrs/packages/renderer-core/src/render/rt4d/gpu/
├── RT4DGPURenderer.js (main orchestrator)
├── shaders.js (RAYGEN_WGSL, SHADE_WGSL, ACCUM_WGSL)
├── materials/ (ggx.wgsl, disney.wgsl, sss.wgsl, clearcoat.wgsl)
└── sceneSerializer.js
```

**Problem:** Character shaders are contracts, not wired to GPU execution.

---

## Wiring Plan: 4 Steps

### Step 1: Material Registry with Character Shaders

Create `mrs/packages/renderer-core/src/render/rt4d/material/CharacterMaterialRegistry.js`

```javascript
import { readFileSync } from 'fs';
import { join } from 'path';

const SHADER_DIR = '/media/jon/New Volume/Mandala Rendering Software/character/shaders';

export const CHARACTER_MATERIALS = {
  skin: {
    json: JSON.parse(readFileSync(join(SHADER_DIR, 'skin.json'), 'utf8')),
    wgsl: readFileSync(join(SHADER_DIR, 'skin.wgsl'), 'utf8'),
    type: 'sss'
  },
  fur: { /* ... */ },
  metal: { /* ... */ },
  fabric: { /* ... */ },
  leather: { /* ... */ }
};

export function getCharacterMaterial(materialId) {
  const mat = CHARACTER_MATERIALS[materialId];
  if (!mat) throw new Error(`Unknown character material: ${materialId}`);
  return {
    shaderSource: mat.wgsl,
    params: mat.json.pbr,
    type: mat.type,
    provenance: {
      source: 'character/shaders',
      hash: computeHash(mat.wgsl)
    }
  };
}
```

**Why:** Centralizes character material contracts, adds provenance.

---

### Step 2: Extend MaterialData Structure

Current `MaterialData` in `shaders.js:74`:
```wgsl
struct MaterialData { 
  albedo: vec4<f32>, 
  emission: vec4<f32>, 
  typeAndParams: vec4<f32>, 
  volumeParams: vec4<f32> 
}
```

**Extend to support character materials:**
```wgsl
struct MaterialData { 
  albedo: vec4<f32>, 
  emission: vec4<f32>, 
  typeAndParams: vec4<f32>, 
  volumeParams: vec4<f32>,
  characterType: u32,  // 0=standard, 1=skin, 2=fur, 3=metal, 4=fabric, 5=leather
  sssRadius: vec3<f32>,
  sssScale: f32
}
```

Update `sceneSerializer.js` to serialize character materials:
```javascript
function serializeMaterial(mat) {
  if (mat.characterType) {
    const charMat = getCharacterMaterial(mat.characterType);
    return {
      ...mat,
      albedo: charMat.params.baseColor,
      sssRadius: charMat.json.sss.radius,
      sssScale: charMat.json.sss.scale
    };
  }
  return mat;
}
```

---

### Step 3: Modify SHADE_WGSL to Branch on Character Type

Current shade shader has simple diffuse (line 147-154). Extend:

```wgsl
fn evaluateCharacterBRDF(normal, lightDir, viewDir, material) -> vec3<f32> {
  switch (material.characterType) {
    case 1u: // skin
      return skin_brdf(normal, lightDir, viewDir, material);
    case 2u: // fur
      return fur_brdf(normal, lightDir, viewDir, material);
    case 3u: // metal
      return metal_brdf(normal, lightDir, viewDir, material);
    case 4u: // fabric
      return fabric_brdf(normal, lightDir, viewDir, material);
    default:
      return standard_brdf(normal, lightDir, viewDir, material);
  }
}
```

The character WGSL files need to be inlined into the main shade shader. Create `buildCharacterShaders.js`:

```javascript
import { readFileSync } from 'fs';
import { SHADE_WGSL } from './shaders.js';

const skinShader = readFileSync('character/shaders/skin.wgsl', 'utf8');
const furShader = readFileSync('character/shaders/fur.wgsl', 'utf8');

export const SHADE_WGSL_WITH_CHARACTERS = SHADE_WGSL.replace(
  '// CHARACTER_BRDFS_HERE',
  `${skinShader}\n${furShader}\n// ... others`
);
```

---

### Step 4: Update RT4DGPURenderer to Load Character Materials

In `RT4DGPURenderer.js:_createPipelines()`:

```javascript
async _createPipelines() {
  const device = this.device;
  
  // Load character shaders
  const characterBRDFs = await this._loadCharacterShaders();
  
  const shadeModule = device.createShaderModule({ 
    code: SHADE_WGSL_WITH_CHARACTERS + characterBRDFs 
  });
  
  // ... rest unchanged
}

async _loadCharacterShaders() {
  const shaders = [];
  for (const [name, mat] of Object.entries(CHARACTER_MATERIALS)) {
    shaders.push(`// ${name} shader\n${mat.wgsl}`);
  }
  return shaders.join('\n');
}
```

---

## Implementation Order

### Week 1: Material Registry + Serializer
- [ ] Create `CharacterMaterialRegistry.js`
- [ ] Extend MaterialData struct
- [ ] Update sceneSerializer to handle character materials
- [ ] Test: serialize character mesh, verify GPU buffer contains correct data

### Week 2: Shader Integration
- [ ] Create `buildCharacterShaders.js` to inline WGSL
- [ ] Modify SHADE_WGSL with character BRDF branches
- [ ] Update RT4DGPURenderer to load character shaders
- [ ] Test: render character with skin material, verify SSS effect

---

## Verification Tests

```javascript
// test-character-materials.test.js

test('skin material serializes correctly', () => {
  const mat = getCharacterMaterial('skin');
  expect(mat.params.baseColor).toEqual([0.72, 0.52, 0.42, 1]);
  expect(mat.json.sss.radius).toEqual([1.0, 0.35, 0.2]);
});

test('RT4DGPURenderer loads character shaders', async () => {
  const renderer = new RT4DGPURenderer({ width: 64, height: 64 });
  await renderer.init();
  expect(renderer._pipelines.shade).toBeDefined();
  // Verify shader module contains skin_brdf function
});

test('character material renders differently than Lambert', () => {
  // Render sphere with skin vs standard diffuse
  // Compare pixel values, should differ
});
```

---

## Dependencies

- WebGPU support in `navigator.gpu`
- `character/shaders/*.wgsl` files must be present
- `sceneSerializer.js` must be updated to pass `characterType` field

---

## Risks

1. **WGSL syntax mismatch**: Character shaders may use different conventions than RT4D shaders
   - Mitigation: Validate all character WGSL with `naga` or `wgsl-analyzer`

2. **Buffer layout mismatch**: Adding fields to MaterialData changes GPU buffer offsets
   - Mitigation: Update all bind group layouts and buffer creation

3. **Shader compilation time**: Inlining 5 shaders makes shade module large
   - Mitigation: Pre-compile to SPIR-V, or lazy-load per material

---

## Deliverable

After 2 weeks:
- Character materials render via GPU path tracer
- Skin SSS effect visible (even if approximate)
- Provenance tracked from character/shaders to pixels
- Material registry supports hot-reloading shaders

Next phase: Certified state store with AAIS signatures.
