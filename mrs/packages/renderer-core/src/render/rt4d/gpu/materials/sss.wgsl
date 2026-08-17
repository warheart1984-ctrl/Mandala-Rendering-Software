// SSS dipole - WGSL
// Provenance: intentId=material-sss-v1
fn sssDipole(NdotL: f32, radius: f32) -> vec3<f32> {
  let sigmaS = 0.5;
  let sigmaA = 0.1;
  let attenuation = exp(-radius * (sigmaA + sigmaS));
  return vec3<f32>(attenuation) * max(0.0, NdotL);
}
