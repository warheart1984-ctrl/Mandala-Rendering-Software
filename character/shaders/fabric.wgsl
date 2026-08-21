// fabric.wgsl — leather/fabric roughness + grain. Status: partial.

struct FabricMaterial {
  base_color: vec3<f32>,
  roughness: f32,
  grain_scale: f32,
  grain_strength: f32,
};

fn fabric_brdf(n: vec3<f32>, l: vec3<f32>, uv: vec2<f32>, m: FabricMaterial) -> vec3<f32> {
  let grain = sin(uv.x * m.grain_scale) * sin(uv.y * m.grain_scale * 1.7);
  let n2 = normalize(n + vec3<f32>(grain * m.grain_strength, 0.0, grain * m.grain_strength));
  let ndotl = max(dot(n2, l), 0.0);
  let wrap = ndotl * (1.0 - m.roughness * 0.3) + m.roughness * 0.15;
  return m.base_color * wrap;
}
