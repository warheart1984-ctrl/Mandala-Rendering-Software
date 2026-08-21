// skin.wgsl — declared/partial skin BSDF contract for Mandala character pipeline.
// CPU beauty raster does NOT execute this. Status: partial (Lambert + wrap stand-in).

struct SkinMaterial {
  base_color: vec3<f32>,
  roughness: f32,
  sss_radius: vec3<f32>,
  sss_scale: f32,
};

fn skin_brdf(n: vec3<f32>, l: vec3<f32>, v: vec3<f32>, m: SkinMaterial) -> vec3<f32> {
  let ndotl = max(dot(n, l), 0.0);
  let wrap = max(dot(n, l) * 0.5 + 0.5, 0.0);
  let diffuse = m.base_color * (0.65 * ndotl + 0.35 * wrap);
  let h = normalize(l + v);
  let spec = pow(max(dot(n, h), 0.0), mix(16.0, 4.0, m.roughness));
  return diffuse + vec3<f32>(spec * 0.08);
}
