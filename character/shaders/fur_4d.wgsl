// fur_4d.wgsl — 4D fur BSDF for Mandala character pipeline
// Status: integrated (4D upgrade from 3D partial)

struct FurMaterial4D {
  base_color: vec4<f32>,
  roughness: f32,
  anisotropy: f32,
  rotation: f32,
};

fn normalize4D(v: vec4<f32>) -> vec4<f32> {
  let len = sqrt(dot(v, v));
  return select(vec4<f32>(0.0), v / len, len > 1e-6);
}

fn fur_brdf_4d(
  n: vec4<f32>,
  t: vec4<f32>,
  l: vec4<f32>,
  v: vec4<f32>,
  m: FurMaterial4D
) -> vec4<f32> {
  let n_norm = normalize4D(n);
  let t_norm = normalize4D(t);
  let l_norm = normalize4D(l);
  let v_norm = normalize4D(v);
  
  let ndotl = max(dot(n_norm, l_norm), 0.0);
  let h = normalize4D(l_norm + v_norm);
  let th = dot(t_norm, h);
  let shifted = pow(clamp(1.0 - th * th, 0.0, 1.0), mix(32.0, 6.0, m.roughness));
  let layer0 = shifted * m.anisotropy;
  let layer1 = pow(max(dot(n_norm, h), 0.0), 24.0) * 0.25;
  
  let specular = vec4<f32>((layer0 + layer1) * 0.35);
  return m.base_color * ndotl + specular;
}

fn evaluateFur4D(
  material: MaterialData,
  normal: vec4<f32>,
  lightDir: vec4<f32>,
  viewDir: vec4<f32>,
  light: LightData
) -> vec4<f32> {
  var m: FurMaterial4D;
  m.base_color = material.albedo;
  m.roughness = material.typeAndParams.y;
  m.anisotropy = material.typeAndParams.w;
  m.rotation = 0.0;
  
  // Tangent vector from normal (simplified)
  var t = vec4<f32>(0.0, 1.0, 0.0, 0.0);
  if (abs(normal.x) > 0.9) {
    t = vec4<f32>(0.0, 0.0, 1.0, 0.0);
  }
  t = normalize4D(t - normal * dot(normal, t));
  
  let result = fur_brdf_4d(normal, t, lightDir, viewDir, m);
  return result * light.emission;
}
