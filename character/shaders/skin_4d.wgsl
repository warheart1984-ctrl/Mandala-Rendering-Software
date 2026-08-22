// skin_4d.wgsl — 4D skin BSDF for Mandala character pipeline
// Status: integrated (4D upgrade from 3D partial)
// 
// Converts 3D skin shader to 4D with vec4 support
// Subsurface scattering with 4D normal handling

struct SkinMaterial4D {
  base_color: vec4<f32>,
  roughness: f32,
  sss_radius: vec4<f32>,
  sss_scale: f32,
  _pad: f32,
};

fn normalize4D(v: vec4<f32>) -> vec4<f32> {
  let len = sqrt(dot(v, v));
  return select(vec4<f32>(0.0), v / len, len > 1e-6);
}

fn skin_brdf_4d(
  n: vec4<f32>,
  l: vec4<f32>,
  v: vec4<f32>,
  m: SkinMaterial4D
) -> vec4<f32> {
  // Handle w-component for 4D
  let n_norm = normalize4D(n);
  let l_norm = normalize4D(l);
  let v_norm = normalize4D(v);
  
  let ndotl = max(dot(n_norm, l_norm), 0.0);
  let ndotv = max(dot(n_norm, v_norm), 0.0);
  let wrap = max(ndotl * 0.5 + 0.5, 0.0);
  
  // Diffuse with wrap lighting for skin
  let diffuse = m.base_color * (0.65 * ndotl + 0.35 * wrap);
  
  // Specular with 4D half-vector
  let h = normalize4D(l_norm + v_norm);
  let ndoth = max(dot(n_norm, h), 0.0);
  let spec = pow(ndoth, mix(16.0, 4.0, m.roughness));
  
  // Subsurface scattering approximation
  let sss = m.sss_scale * exp(-m.roughness * 2.0) * ndotl;
  let sss_contrib = m.base_color * sss * 0.3;
  
  return diffuse + vec4<f32>(spec * 0.08) + sss_contrib;
}

// Entry point for RT4D pipeline
fn evaluateSkin4D(
  material: MaterialData,
  normal: vec4<f32>,
  lightDir: vec4<f32>,
  viewDir: vec4<f32>,
  light: LightData
) -> vec4<f32> {
  var m: SkinMaterial4D;
  m.base_color = material.albedo;
  m.roughness = material.typeAndParams.y;
  m.sss_radius = material.volumeParams.xyzw;
  m.sss_scale = material.volumeParams.x;
  m._pad = 0.0;
  
  let result = skin_brdf_4d(normal, lightDir, viewDir, m);
  return result * light.emission;
}
