import { vec4, length, normalize } from "./vec4.js";

export const S3_AREA = 2 * Math.PI * Math.PI;

export function uniformSampleS3(u1, u2, u3) {
  const theta = 2 * Math.PI * u1;
  const phi = Math.acos(2 * u2 - 1);
  const psi = 2 * Math.PI * u3;
  const sinPhi = Math.sin(phi);
  return vec4(
    Math.sin(psi) * sinPhi * Math.cos(theta),
    Math.sin(psi) * sinPhi * Math.sin(theta),
    Math.sin(psi) * Math.cos(phi),
    Math.cos(psi),
  );
}

export function uniformPDF_S3() {
  return 1 / S3_AREA;
}

export function cosineWeightedSampleS3(u1, u2, n) {
  const v = uniformSampleS3(u1, u2, 0);
  const d = dot4(v, n);
  if (d < 0) return scale(v, -1);
  return v;
}

function dot4(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

function scale(v, s) {
  return vec4(v.x * s, v.y * s, v.z * s, v.w * s);
}

export function powerHeuristic(nf, pdfF, ng, pdfG) {
  const f = nf * pdfF;
  const g = ng * pdfG;
  return (f * f) / (f * f + g * g);
}

export function sphericalTo4D(theta, phi, psi) {
  const sinPhi = Math.sin(phi);
  return vec4(
    Math.sin(psi) * sinPhi * Math.cos(theta),
    Math.sin(psi) * sinPhi * Math.sin(theta),
    Math.sin(psi) * Math.cos(phi),
    Math.cos(psi),
  );
}

export function sampleGGX_S3(u1, u2, u3, alpha, n) {
  const theta = 2 * Math.PI * u1;
  const phi = Math.acos(2 * u2 - 1);
  const psi = Math.acos(Math.sqrt((1 - u3) / (1 + u3 * (alpha * alpha - 1))));

  const sinPhi = Math.sin(phi);
  const h = vec4(
    Math.sin(psi) * sinPhi * Math.cos(theta),
    Math.sin(psi) * sinPhi * Math.sin(theta),
    Math.sin(psi) * Math.cos(phi),
    Math.cos(psi),
  );

  const d = dot4(h, n);
  if (d < 0) return vec4(-h.x, -h.y, -h.z, -h.w);
  return h;
}

export function ggxNDF(h, n, alpha) {
  const d = dot4(h, n);
  if (d <= 0) return 0;
  const a2 = alpha * alpha;
  const denom = Math.PI * Math.PI * (1 + (a2 - 1) * d * d);
  return a2 / denom;
}

export { vec4, dot4 as dot };
