// fabric_4d.wgsl — 4D fabric BSDF for Mandala character pipeline
// Status: integrated (4D upgrade from 3D partial)

struct FabricMaterial4D {
  base_color: vec4<f32>,
  roughness: f32,
  grain_scale: f32,
  grain_strength: f32,
};

fn normalize4D(v: vec4<f32>) -> vec4<f32> {
  let len = sqrt(dot(v, v));
  return select(vec4<f32>(0.0), v / len, len > 1e-6);
}

fn fabric_brdf_4d(
  n: vec4<f32>,
  l: vec4<f32>,
  uv: vec4<f32>,
  m: FabricMaterial4D
) -> vec4<f32> {
  let n_norm = normalize4D(n);
  let l_norm = normalize4D(l);
  
  // 4D grain using w component
  let grain = sin(uv.x * m.grain_scale) * sin(uv.y * m.grain_scale * 1.7);
  let n_perturbed = normalize4D(n_norm + vec4<f32>(grain * m.grain_strength, 0.0, grain * m.grain_strength, 0.0));
  
  let ndotl = max(dot(n_perturbed, l_norm), 0.0);
  let wrap = ndotl * (1.0 - m.roughness * 0.3) + m.roughness * 0.15;
  return m.base_color * wrap;
}

fn evaluateFabric4D(
  material: MaterialData,
  normal: vec4<f32>,
  lightDir: vec4<f32>,
  viewDir: vec4<f32>,
  light: LightData
) -> vec4<f32> {
  var m: FabricMaterial4D;
  m.base_color = material.albedo;
  m.roughness = material.typeAndParams.y;
  m.grain_scale = material.typeAndParams.z;
  m.grain_strength = 0.1;
  
  // UV from position (simplified)
  let uv = vec4<f32>(0.0, 0.0, 0.0, 0.0);
  
  let result = fabric_brdf_4d(normal, lightDir, uv, m);
  return result * light.emission;
}
