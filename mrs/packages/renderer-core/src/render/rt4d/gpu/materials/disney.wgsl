// Disney BRDF variant - WGSL
// Provenance: intentId=material-disney-v1
fn disneyBRDF(albedo: vec3<f32>, roughness: f32, metallic: f32, NdotV: f32, NdotL: f32) -> f32 {
  let F0 = mix(vec3<f32>(0.04), albedo, metallic);
  let Fr = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);
  let spec = roughness * roughness / (4.0 * NdotV * NdotL + 1e-6);
  return max(0.0, spec);
}
