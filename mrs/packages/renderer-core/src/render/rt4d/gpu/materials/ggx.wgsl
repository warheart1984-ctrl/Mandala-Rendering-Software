// GGX multi-lobe - WGSL
// Provenance: intentId=material-ggx-v1
fn ggxNDF(alpha: f32, NdotH: f32) -> f32 {
  let a2 = alpha * alpha;
  let denom = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / (3.14159265 * denom * denom + 1e-6);
}
fn ggxMultiLobe(roughness: f32, NdotH: f32) -> f32 {
  let alpha = roughness * roughness;
  return ggxNDF(alpha, NdotH);
}
