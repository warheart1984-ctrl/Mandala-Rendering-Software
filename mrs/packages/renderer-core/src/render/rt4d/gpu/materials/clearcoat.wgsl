// Clearcoat layer with Fresnel - WGSL
// Provenance: intentId=material-clearcoat-v1
fn clearcoatFresnel(NdotV: f32, Ior: f32) -> f32 {
  let R0 = pow((1.0 - Ior) / (1.0 + Ior), 2.0);
  return R0 + (1.0 - R0) * pow(1.0 - NdotV, 5.0);
}
fn clearcoatBRDF(NdotV: f32, roughness: f32) -> f32 {
  let F = clearcoatFresnel(NdotV, 1.5);
  return F * (1.0 - roughness);
}
