// metal_4d.wgsl — 4D metal BSDF for Mandala character pipeline
// Status: integrated (4D upgrade from 3D partial)

struct MetalMaterial4D {
  base_color: vec4<f32>,
  roughness: f32,
  f0: vec4<f32>,
};

fn fresnel_schlick4D(cos_theta: f32, f0: vec4<f32>) -> vec4<f32> {
  let om = 1.0 - cos_theta;
  return f0 + (vec4<f32>(1.0) - f0) * om * om * om * om * om;
}

fn normalize4D(v: vec4<f32>) -> vec4<f32> {
  let len = sqrt(dot(v, v));
  return select(vec4<f32>(0.0), v / len, len > 1e-6);
}

fn metal_brdf_4d(
  n: vec4<f32>,
  l: vec4<f32>,
  v: vec4<f32>,
  m: MetalMaterial4D
) -> vec4<f32> {
  let n_norm = normalize4D(n);
  let l_norm = normalize4D(l);
  let v_norm = normalize4D(v);
  
  let h = normalize4D(l_norm + v_norm);
  let ndotl = max(dot(n_norm, l_norm), 0.0);
  let ndoth = max(dot(n_norm, h), 0.0);
  let spec_exp = mix(256.0, 8.0, m.roughness);
  let spec = pow(ndoth, spec_exp);
  let f = fresnel_schlick4D(max(dot(h, v_norm), 0.0), m.f0);
  let spec_color = f * spec;
  
  return m.base_color * spec_color * ndotl;
}

fn evaluateMetal4D(
  material: MaterialData,
  normal: vec4<f32>,
  lightDir: vec4<f32>,
  viewDir: vec4<f32>,
  light: LightData
) -> vec4<f32> {
  var m: MetalMaterial4D;
  m.base_color = material.albedo;
  m.roughness = material.typeAndParams.y;
  m.f0 = material.albedo;
  
  let result = metal_brdf_4d(normal, lightDir, viewDir, m);
  return result * light.emission;
}
