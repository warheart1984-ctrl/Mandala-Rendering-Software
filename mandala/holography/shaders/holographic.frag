// holographic.frag — Holographic PBR where governance = material
// SoT: mandala/holography/shaders/holographic.frag (Three.js r160+)
precision highp float;
uniform vec3 uBoundaryColor;
uniform vec3 uLightPos;
uniform float uTime;
uniform mat3 uInducedMetric;
varying vec3 vNormal;
varying vec3 vEntDir;
varying float vRho;
varying float vCurvature;
varying vec4 vGovernance;
varying vec3 vWorldPos;
varying float vWij;
float D_GGX(float NoH, float roughness) {
  float a = roughness*roughness;
  float a2 = a*a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / (3.14159265 * d * d);
}
void main() {
  float intent = vGovernance.x;
  float evidence = vGovernance.y;
  float conformance = vGovernance.z;
  float stewardship = vGovernance.w;
  vec3 N = normalize(vNormal);
  N = normalize(uInducedMetric * N);
  vec3 L = normalize(uLightPos - vWorldPos);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 H = normalize(L + V);
  float NoL = max(dot(N, L), 0.0);
  float NoV = max(dot(N, V), 0.0);
  float NoH = max(dot(N, H), 0.0);
  // Energy wire palette: cyan ↔ amber from ρ / height (Stage-1 left panel look).
  float warm = clamp(vRho * 0.55 + vWorldPos.y * 0.25 + max(vCurvature, 0.0) * 0.15, 0.0, 1.0);
  vec3 cyan = vec3(0.0, 0.78, 1.0);
  vec3 amber = vec3(1.0, 0.47, 0.11);
  vec3 cream = vec3(1.0, 0.90, 0.70);
  vec3 energy = mix(cyan, amber, smoothstep(0.28, 0.55, warm));
  float core = pow(max(vRho, 0.05), 0.85);
  float spark = pow(max(dot(H, normalize(vEntDir)), 0.0), 24.0) * vWij;
  float rim = pow(1.0 - NoV, 2.5) * 0.55;
  float glow = 0.35 + NoL * 0.35 + core * 0.55 + spark * 0.4 + rim;
  vec3 color = mix(energy, cream, core * 0.45) * glow;
  color += energy * stewardship * 0.12;
  color += cream * intent * evidence * 0.08;
  // Soft circular point sprite falloff for bloom-like stars
  vec2 pc = gl_PointCoord * 2.0 - 1.0;
  float d = dot(pc, pc);
  if (d > 1.0) discard;
  float alpha = clamp(1.0 - d, 0.0, 1.0);
  color *= (0.55 + 0.45 * alpha);
  gl_FragColor = vec4(color, 1.0);
}
