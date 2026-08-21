// metal.wgsl — conductor specular/reflection contract. Status: partial.

struct MetalMaterial {
  base_color: vec3<f32>,
  roughness: f32,
  f0: vec3<f32>,
};

fn fresnel_schlick(cos_theta: f32, f0: vec3<f32>) -> vec3<f32> {
  let om = 1.0 - cos_theta;
  return f0 + (vec3<f32>(1.0) - f0) * om * om * om * om * om;
}

fn metal_brdf(n: vec3<f32>, l: vec3<f32>, v: vec3<f32>, m: MetalMaterial) -> vec3<f32> {
  let h = normalize(l + v);
  let ndotl = max(dot(n, l), 0.0);
  let ndoth = max(dot(n, h), 0.0);
  let spec_exp = mix(256.0, 8.0, m.roughness);
  let spec = pow(ndoth, spec_exp);
  let f = fresnel_schlick(max(dot(h, v), 0.0), m.f0);
  return m.base_color * ndotl * 0.12 + f * spec * ndotl;
}
