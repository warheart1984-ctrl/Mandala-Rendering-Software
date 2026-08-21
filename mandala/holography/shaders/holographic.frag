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
  float roughness = clamp(1.0 - stewardship * 0.8 - evidence * 0.2, 0.05, 1.0);
  float specular = clamp(conformance, 0.0, 1.0);
  float metallic = clamp(intent * 0.3, 0.0, 0.3);
  float sss = pow(vRho, 1.5) * 0.6 * (1.0 - roughness);
  vec3 sssColor = uBoundaryColor * sss * NoL;
  float fiber = pow(max(dot(H, normalize(vEntDir)), 0.0), 32.0) * vWij * vRho;
  float D = D_GGX(NoH, roughness);
  vec3 base = mix(uBoundaryColor * 0.2, uBoundaryColor, specular);
  vec3 diffuse = base * NoL * (1.0 - metallic);
  vec3 specCol = mix(vec3(0.04), base, metallic) * D * NoL;
  float cavity = 1.0 - clamp(vCurvature * 0.5, 0.0, 0.6);
  vec3 color = (diffuse + specCol) * cavity + sssColor + fiber * 0.5;
  float rim = pow(1.0 - NoV, 3.0) * conformance * 0.4;
  color += rim * uBoundaryColor;
  gl_FragColor = vec4(color, 1.0);
}
