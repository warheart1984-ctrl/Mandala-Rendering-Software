// leather_4d.wgsl — 4D leather BSDF for Mandala character pipeline
// Status: integrated (4D upgrade from 3D partial)
// Leather with grain and sheen

struct LeatherMaterial4D {
  base_color: vec4<f32>,
  roughness: f32,
  sheen: f32,
  grain_strength: f32,
};

fn normalize4D(v: vec4<f32>) -> vec4<f32> {
  let len = sqrt(dot(v, v));
  return select(vec4<f32>(0.0), v / len, len > 1e-6);
}

fn leather_brdf_4d(
  n: vec4<f32>,
  l: vec4<f32>,
  v: vec4<f32>,
  m: LeatherMaterial4D
) -> vec4<f32> {
  let n_norm = normalize4D(n);
  let l_norm = normalize4D(l);
  let v_norm = normalize4D(v);
  
  let ndotl = max(dot(n_norm, l_norm), 0.0);
  let h = normalize4D(l_norm + v_norm);
  let ndoth = max(dot(n_norm, h), 0.0);
  
  // Base diffuse with roughness
  let diffuse = m.base_color * ndotl * (1.0 - m.roughness * 0.5);
  
  // Sheen specular
  let specular = pow(ndoth, mix(64.0, 16.0, m.roughness)) * m.sheen * 0.3;
  let spec_color = m.base_color * specular;
  
  // Grain normal perturbation
  let grain = sin(ndotl * 10.0) * m.grain_strength;
  let grain_effect = 1.0 + grain * 0.1;
  
  return (diffuse + spec_color) * grain_effect;
}

fn evaluateLeather4D(
  material: MaterialData,
  normal: vec4<f32>,
  lightDir: vec4<f32>,
  viewDir: vec4<f32>,
  light: LightData
) -> vec4<f32> {
  var m: LeatherMaterial4D;
  m.base_color = material.albedo;
  m.roughness = material.typeAndParams.y;
  m.sheen = 0.5;
  m.grain_strength = 0.1;
  
  let result = leather_brdf_4d(normal, lightDir, viewDir, m);
  return result * light.emission;
}
