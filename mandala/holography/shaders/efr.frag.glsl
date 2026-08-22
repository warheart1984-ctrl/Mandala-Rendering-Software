// EFR fragment shader template — color by ρ / K; causal pulse.
// Status: partial (CPU EFR PNG is the working path; this is a GPU blueprint).
#version 450

layout(location = 0) in float vRho;
layout(location = 1) in float vK;
layout(location = 2) in vec2 vUV;
layout(location = 3) in float vCausalPulse;

layout(set = 0, binding = 1) uniform EFRFrag {
  float uRhoGain;
  float uKTint;
  float uCausalMix;
  float uMode;
} frag;

layout(location = 0) out vec4 outColor;

void main() {
  float rho = clamp(vRho * frag.uRhoGain, 0.0, 1.0);
  float k = clamp(vK * frag.uKTint, 0.0, 1.0);

  vec3 heat = vec3(
    0.12 + rho * 0.85 + k * 0.15,
    0.16 + rho * 0.55 * (1.0 - 0.3 * k),
    0.30 + (1.0 - rho) * 0.55
  );

  vec3 causal = vec3(0.2, 0.75, 0.7) * vCausalPulse;

  float mode = frag.uMode;
  vec3 color = heat;
  if (mode > 0.5 && mode < 1.5) {
    color = mix(vec3(0.05, 0.08, 0.1), causal, 0.85);
  } else if (mode > 1.5 && mode < 2.5) {
    color = mix(heat, vec3(k, 0.45, 1.0 - k), 0.5);
  } else if (mode > 2.5) {
    color = mix(heat, causal, frag.uCausalMix * vCausalPulse);
  }

  float alpha = clamp(0.35 + rho * 0.65, 0.0, 1.0);
  outColor = vec4(color, alpha);
}
