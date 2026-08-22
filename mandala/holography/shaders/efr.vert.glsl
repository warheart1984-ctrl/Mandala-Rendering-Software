// EFR vertex shader template — warp by curvature proxy K.
// Status: partial (CPU EFR PNG is the working path; this is a GPU blueprint).
#version 450

layout(location = 0) in vec3 aPosition;
layout(location = 1) in float aRho;
layout(location = 2) in float aK;
layout(location = 3) in vec2 aUV;

layout(set = 0, binding = 0) uniform EFRUniforms {
  mat4 uMVP;
  float uWarpScale;
  float uTime;
  float uAlpha;
  float uBeta;
} ubo;

layout(location = 0) out float vRho;
layout(location = 1) out float vK;
layout(location = 2) out vec2 vUV;
layout(location = 3) out float vCausalPulse;

void main() {
  vec3 warped = aPosition + vec3(0.0, aK * ubo.uWarpScale, 0.0);
  vRho = aRho;
  vK = aK;
  vUV = aUV;
  vCausalPulse = 0.5 + 0.5 * sin(ubo.uTime + aRho * 6.28318);
  gl_Position = ubo.uMVP * vec4(warped, 1.0);
}
