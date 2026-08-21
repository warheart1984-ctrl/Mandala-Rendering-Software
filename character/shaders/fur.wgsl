// fur.wgsl — anisotropic / layered fur contract.
// CPU raster uses tangent-shift highlights on hair cards. Status: partial.

struct FurMaterial {
  base_color: vec3<f32>,
  roughness: f32,
  anisotropy: f32,
  rotation: f32,
};

fn fur_brdf(n: vec3<f32>, t: vec3<f32>, l: vec3<f32>, v: vec3<f32>, m: FurMaterial) -> vec3<f32> {
  let ndotl = max(dot(n, l), 0.0);
  let t_rot = t; // rotation reserved
  let h = normalize(l + v);
  let th = dot(t_rot, h);
  let shifted = pow(clamp(1.0 - th * th, 0.0, 1.0), mix(32.0, 6.0, m.roughness));
  let layer0 = shifted * m.anisotropy;
  let layer1 = pow(max(dot(n, h), 0.0), 24.0) * 0.25;
  return m.base_color * ndotl + vec3<f32>((layer0 + layer1) * 0.35);
}
