import { vec4, length, normalize, cross4D } from "./vec4.js";

export const S3_AREA = 2 * Math.PI * Math.PI;

export function uniformSampleS3(u1, u2, u3) {
  // 4D Gaussian trick: 4 independent normals, normalized to S³
  const r1 = Math.sqrt(-2 * Math.log(u1 || 1e-30));
  const t1 = 2 * Math.PI * u2;
  const r2 = Math.sqrt(-2 * Math.log(u3 || 1e-30));
  const t2 = 2 * Math.PI * Math.random();
  const x = r1 * Math.cos(t1);
  const y = r1 * Math.sin(t1);
  const z = r2 * Math.cos(t2);
  const w = r2 * Math.sin(t2);
  const len = Math.sqrt(x * x + y * y + z * z + w * w);
  return vec4(x / len, y / len, z / len, w / len);
}

export function uniformPDF_S3() {
  return 1 / S3_AREA;
}

/**
 * Uniform sample on S² (the 2-sphere).
 * Used as the cross-section sampler for S³ constructions.
 * @returns {vec4} with w=0
 */
export function cosineWeightedPDF_S3(wo, n) {
  const cosTheta = Math.abs(dot4(wo, n));
  return 3 * cosTheta / (4 * Math.PI);
}

export function uniformSampleS2(u1, u2) {
  const phi = 2 * Math.PI * u1;
  const cosTheta = 1 - 2 * u2;
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  return vec4(sinTheta * Math.cos(phi), sinTheta * Math.sin(phi), cosTheta, 0);
}

/**
 * Cosine-weighted sample on S³+ (the 3-sphere hemisphere).
 *
 * The marginal distribution of θ under cosine weighting on S³ is:
 *   p(θ) = 3 cos(θ) sin²(θ),  θ ∈ [0, π/2]
 *
 * CDF: F(θ) = sin³(θ)
 * Inverse: θ = arcsin(∛u)
 *
 * At fixed θ, the cross-section of S³ is an S² of radius sin(θ).
 * We sample that S² uniformly and lift to S³, then rotate to align with normal n.
 *
 * @param {number} u1 - random in [0,1] (used for θ via CDF inversion)
 * @param {number} u2 - random in [0,1] (used for S² φ)
 * @param {number} u3 - random in [0,1] (used for S² cosθ)
 * @param {{x,y,z,w}} n - unit normal on S³
 * @returns {{direction: {x,y,z,w}, pdf: number}}
 */
export function cosineWeightedSampleS3(u1, u2, u3, n) {
  const sinThetaCubed = u1;
  const sinTheta = Math.pow(Math.min(1, Math.max(0, sinThetaCubed)), 1 / 3);
  const theta = Math.asin(sinTheta);
  const cosTheta = Math.cos(theta);

  const s2 = uniformSampleS2(u2, u3);

  const sinT = Math.sin(theta);
  const localDir = vec4(sinT * s2.x, sinT * s2.y, sinT * s2.z, cosTheta);

  const dir = alignToNormalS3(localDir, n);

  const pdf = 3 * cosTheta / (4 * Math.PI);
  return { direction: dir, pdf };
}

/**
 * Build an orthonormal basis {T1, T2, T3, n} for R⁴ where n is the given unit vector.
 * Uses Gram-Schmidt with carefully chosen reference vectors.
 */
export function buildONBFromNormal(n) {
  const refs = [
    vec4(1, 0, 0, 0),
    vec4(0, 1, 0, 0),
    vec4(0, 0, 1, 0),
    vec4(0, 0, 0, 1),
  ];

  let bestRef = refs[0];
  let bestDot = Math.abs(dot4(refs[0], n));
  for (const r of refs) {
    const d = Math.abs(dot4(r, n));
    if (d < bestDot) { bestDot = d; bestRef = r; }
  }

  const d1 = dot4(bestRef, n);
  const t1Raw = vec4(bestRef.x - d1 * n.x, bestRef.y - d1 * n.y, bestRef.z - d1 * n.z, bestRef.w - d1 * n.w);
  const t1Len = Math.sqrt(dot4(t1Raw, t1Raw));
  if (t1Len < 1e-10) return { T1: vec4(1, 0, 0, 0), T2: vec4(0, 1, 0, 0), T3: vec4(0, 0, 1, 0) };
  const T1 = vec4(t1Raw.x / t1Len, t1Raw.y / t1Len, t1Raw.z / t1Len, t1Raw.w / t1Len);

  let T2 = null;
  for (const r of refs) {
    const d2n = dot4(r, n);
    const d21 = dot4(r, T1);
    const t2Raw = vec4(
      r.x - d2n * n.x - d21 * T1.x,
      r.y - d2n * n.y - d21 * T1.y,
      r.z - d2n * n.z - d21 * T1.z,
      r.w - d2n * n.w - d21 * T1.w,
    );
    const t2Len = Math.sqrt(dot4(t2Raw, t2Raw));
    if (t2Len > 1e-10) {
      T2 = vec4(t2Raw.x / t2Len, t2Raw.y / t2Len, t2Raw.z / t2Len, t2Raw.w / t2Len);
      break;
    }
  }
  if (!T2) return { T1, T2: vec4(0, 1, 0, 0), T3: vec4(0, 0, 1, 0) };

  let T3 = null;
  for (const r of refs) {
    const d3n = dot4(r, n);
    const d31 = dot4(r, T1);
    const d32 = dot4(r, T2);
    const t3Raw = vec4(
      r.x - d3n * n.x - d31 * T1.x - d32 * T2.x,
      r.y - d3n * n.y - d31 * T1.y - d32 * T2.y,
      r.z - d3n * n.z - d31 * T1.z - d32 * T2.z,
      r.w - d3n * n.w - d31 * T1.w - d32 * T2.w,
    );
    const t3Len = Math.sqrt(dot4(t3Raw, t3Raw));
    if (t3Len > 1e-10) {
      T3 = vec4(t3Raw.x / t3Len, t3Raw.y / t3Len, t3Raw.z / t3Len, t3Raw.w / t3Len);
      break;
    }
  }
  if (!T3) return { T1, T2, T3: vec4(0, 0, 1, 0) };

  return { T1, T2, T3 };
}

/**
 * Rotate a vector from the local frame (north pole = +w) to a frame
 * where the north pole aligns with unit vector n on S³.
 */
export function alignToNormalS3(v, n) {
  const d = dot4(v, n);
  if (Math.abs(Math.abs(d) - 1) < 1e-10) {
    return d > 0 ? vec4(n.x, n.y, n.z, n.w) : vec4(-n.x, -n.y, -n.z, -n.w);
  }

  const { T1, T2, T3 } = buildONBFromNormal(n);

  return vec4(
    v.x * T1.x + v.y * T2.x + v.z * T3.x + v.w * n.x,
    v.x * T1.y + v.y * T2.y + v.z * T3.y + v.w * n.y,
    v.x * T1.z + v.y * T2.z + v.z * T3.z + v.w * n.z,
    v.x * T1.w + v.y * T2.w + v.z * T3.w + v.w * n.w,
  );
}

function dot4(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
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

export { vec4, dot4 as dot, cross4D };
