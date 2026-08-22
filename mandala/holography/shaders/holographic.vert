// holographic.vert — Boundary projection + entanglement-driven displacement
// Prime Architect Blueprint 21193624 — bulk R^1,3 -> boundary R^3
// SoT: mandala/holography/shaders/holographic.vert (Three.js r160+)
attribute float entanglementDensity; // ρ per vertex
attribute vec3 entanglementDirection; // d^ij — dominant direction
attribute float curvature; // K — extrinsic curvature stability
attribute float entanglementWeight; // w_ij sum
attribute vec4 governance; // CIEMS: x=intent,y=evidence,z=conformance,w=stewardship
attribute vec3 baseNormal; // induced metric base
uniform float uTime;
uniform float uAnisotropy;
uniform mat3 uInducedMetric; // h_ij = g_ij - g0i g0j / g00
uniform float uMuscleGain; // 0.3 default — ρ -> bulge
uniform float uBoneThreshold; // 0.8 default — K lock
varying vec3 vNormal;
varying vec3 vEntDir;
varying float vRho;
varying float vCurvature;
varying vec4 vGovernance;
varying vec3 vWorldPos;
varying float vWij;
void main() {
  vRho = entanglementDensity;
  vEntDir = entanglementDirection;
  vCurvature = curvature;
  vGovernance = governance;
  vWij = entanglementWeight;
  vec3 hNormal = normalize(uInducedMetric * baseNormal);
  float muscle = entanglementDensity * uAnisotropy * entanglementWeight * uMuscleGain;
  float boneFactor = step(uBoneThreshold, curvature);
  vec3 displaced = position;
  displaced += hNormal * muscle * (1.0 - boneFactor * 0.9);
  displaced += entanglementDirection * muscle * 0.2;
  vec4 world = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = world.xyz;
  vNormal = mat3(modelMatrix) * hNormal;
  gl_Position = projectionMatrix * viewMatrix * world;
  gl_PointSize = 4.0 + entanglementDensity * 10.0;
}
