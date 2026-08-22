/**
 * Photoreal RNG - seeded, deterministic
 */
export class PhotorealRNG {
  constructor(seed = 0x5EED4D00) {
    this.state = seed >>> 0;
  }
  next() {
    this.state += 0x6D2B79F5;
    let r = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  }
  nextFloat() { return this.next(); }
  nextInt(max) { return Math.floor(this.next() * max); }
  nextGaussian() {
    const u1 = this.next();
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

/**
 * Vector math helpers
 */
export const V3 = {
  add: (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]],
  sub: (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]],
  mul: (a, s) => [a[0]*s, a[1]*s, a[2]*s],
  div: (a, s) => [a[0]/s, a[1]/s, a[2]/s],
  negate: (v) => [-v[0], -v[1], -v[2]],
  norm: (a) => Math.sqrt(a[0]*a[0] + a[1]*a[1] + a[2]*a[2]),
  dot: (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2],
  cross: (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]],
  length: (a) => Math.sqrt(a[0]*a[0] + a[1]*a[1] + a[2]*a[2]),
  normalize: (a) => {
    const len = Math.sqrt(a[0]*a[0] + a[1]*a[1] + a[2]*a[2]);
    return len > 0 ? [a[0]/len, a[1]/len, a[2]/len] : [0, 0, 0];
  },
  lerp: (a, b, t) => [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t, a[2] + (b[2]-a[2])*t],
  clamp: (a, min, max) => [Math.max(min, Math.min(max, a[0])), Math.max(min, Math.min(max, a[1])), Math.max(min, Math.min(max, a[2]))],
  mulVec: (v, s) => [v[0]*s, v[1]*s, v[2]*s],
  addVec: (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]]
};

/**
 * buildONB - build an orthonormal basis given a normal
 * @param {number[]} normal - normal vector
 * @returns {{tangent: number[], bitangent: number[], normal: number[]}}
 */
export function buildONB(normal) {
  const n = V3.normalize(normal);
  let tangent;
  if (Math.abs(n[0]) < 0.9) {
    tangent = V3.normalize(V3.cross([0, 0, 1], n));
  } else {
    tangent = V3.normalize(V3.cross([0, 1, 0], n));
  }
  const bitangent = V3.cross(n, tangent);
  return { tangent, bitangent, normal: n };
}

/**
 * sampleCosineHemisphere - sample a direction on the hemisphere with cosine-weighted distribution
 * @param {PhotorealRNG} rng - random number generator
 * @param {number[]} normal - hemisphere normal
 * @returns {number[]} - sampled direction
 */
export function sampleCosineHemisphere(rng, normal) {
  const r1 = rng.nextFloat();
  const r2 = rng.nextFloat();
  const cosTheta = Math.sqrt(r1);
  const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
  const phi = 2 * Math.PI * r2;
  
  const x = sinTheta * Math.cos(phi);
  const y = sinTheta * Math.sin(phi);
  const z = cosTheta;
  
  const onb = buildONB(normal);
  const tangent = onb.tangent;
  const bitangent = onb.bitangent;
  
  const worldX = tangent[0] * x + bitangent[0] * y + normal[0] * z;
  const worldY = tangent[1] * x + bitangent[1] * y + normal[1] * z;
  const worldZ = tangent[2] * x + bitangent[2] * y + normal[2] * z;
  
  return [worldX, worldY, worldZ];
}

/**
 * sampleSphere - uniform sphere sampling
 * @param {PhotorealRNG} rng - random number generator
 * @returns {number[]} - normalized vector on sphere
 */
export function sampleSphere(rng) {
  const r1 = rng.nextFloat();
  const r2 = rng.nextFloat();
  const theta = 2 * Math.PI * r1;
  const phi = Math.acos(2 * r2 - 1);
  
  return [Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi)];
}

/**
 * fresnelSchlick - Schlick's approximation of Fresnel reflectance
 * @param {number} cosTheta - cosine of incidence angle
 * @param {number[]} F0 - reflectance at normal incidence
 * @returns {number[]} - reflectance
 */
export function fresnelSchlick(cosTheta, F0 = [0.04, 0.04, 0.04]) {
  const F = F0.map(f => f + (1 - f) * Math.pow(1 - cosTheta, 5));
  return F;
}

/**
 * fresnelConductor - Fresnel reflectance for conductor (complex IOR)
 * @param {number} cosTheta - cosine of incidence angle
 * @param {number[]} eta - real part of refractive index
 * @param {number[]} k - imaginary part of refractive index
 * @returns {number[]} - reflectance
 */
export function fresnelConductor(cosTheta, eta, k) {
  const cosTheta2 = cosTheta * cosTheta;
  const sinTheta2 = 1 - cosTheta2;
  
  const eta2 = eta.map(e => e * e);
  const k2 = k.map(k => k * k);
  
  const c2 = sinTheta2 * eta2[0] * eta2[0] + k2[0] * k2[0];
  const c = Math.sqrt(c2);
  const g = cosTheta2 + c2 + cosTheta * c;
  const a = cosTheta + c;
  
  const R_par = (a * (a * (k2[0] * k2[0]) + eta2[0] * (eta2[0] - 1) * sinTheta2) - eta2[0] * k2[0] * k2[0]) / g / g;
  const R_per = ((eta2[0] * cosTheta - a) * (eta2[0] * cosTheta - a) + k2[0] * k2[0] * sinTheta2) / g / g;
  
  return [(R_par + R_per) / 2, (R_par + R_per) / 2, (R_par + R_per) / 2];
}

/**
 * ggxNDF - Normal Distribution Function (Trowbridge-Reitz)
 * @param {number[]} normal - surface normal
 * @param {number[]} half - half-vector
 * @param {number} alpha - roughness
 * @returns {number} - NDF value
 */
export function ggxNDF(normal, half, alpha) {
  const NdotH = Math.max(0, V3.dot(normal, half));
  const alpha2 = alpha * alpha;
  const NdotH2 = NdotH * NdotH;
  
  return alpha2 / (Math.PI * Math.pow(alpha2 + NdotH2 * (1 - alpha2), 2));
}

/**
 * smithGGX - Smith geometry function
 * @param {number[]} normal - surface normal
 * @param {number[]} v - view vector
 * @param {number[]} l - light vector
 * @param {number} alpha - roughness
 * @returns {number} - geometry term
 */
export function smithGGX(normal, v, l, alpha) {
  const NdotV = Math.max(0, V3.dot(normal, v));
  const NdotL = Math.max(0, V3.dot(normal, l));
  const alpha2 = alpha * alpha;
  
  const k = 1 / alpha2;
  const NdotV2 = NdotV * NdotV;
  const NdotL2 = NdotL * NdotL;
  
  const kV = (1 + (1 - k) * NdotV2) / k;
  const kL = (1 + (1 - k) * NdotL2) / k;
  
  const G = (2 * NdotV * NdotL) / (NdotV * kV + NdotL * kL);
  return G;
}

/**
 * disneyBRDF - Disney principled BRDF placeholder
 * @param {number[]} N - normal
 * @param {number[]} V - view vector
 * @param {number[]} L - light vector
 * @param {object} properties - material properties
 * @param {PhotorealRNG} rng - random number generator
 * @returns {{f: number[], pdf: number}}
 */
export function disneyBRDF(N, V, L, properties, rng) {
  const albedo = properties.albedo;
  const metallic = properties.metallic !== undefined ? properties.metallic : 0.0;
  const roughness = properties.roughness !== undefined ? properties.roughness : 0.5;
  const F0 = properties.F0 !== undefined ? properties.F0 : [0.04, 0.04, 0.04];
  
  const NdotL = Math.max(0, V3.dot(N, L));
  const NdotV = Math.max(0, V3.dot(N, V));
  const LdotV = Math.max(0, V3.dot(L, V));
  
  // Fresnel
  const F = fresnelSchlick(Math.max(0, V3.dot(N, V)), F0);
  
  // Distribution (GGX)
  const H = V3.normalize(L);
  const NdotH = Math.max(0, V3.dot(N, H));
  const alpha2 = roughness * roughness;
  const D = ggxNDF(N, H, roughness);
  
  // Geometry
  const G = smithGGX(N, V, L, roughness);
  
  // Simplified Disney BRDF
  const Fd90 = 1 - F[0];
  const numerator = albedo[0] * Fd90 + albedo[0] * metallic * LdotV;
  const DNDenom = 4 * (NdotV * NdotV + LdotV * LdotV) * (roughness * roughness) + 0.001;
  
  const resultF = [
    numerator / DNDenom,
    numerator / DNDenom,
    numerator / DNDenom
  ];
  
  const resultPdf = NdotL / Math.PI;
  
  return { f: resultF, pdf: resultPdf };
}

/**
 * sampleDiffuse - sample a diffuse direction
 * @param {PhotorealRNG} rng - random number generator
 * @param {number[]} normal - surface normal
 * @returns {number[]} - sampled direction
 */
export function sampleDiffuse(rng, normal) {
  const r1 = rng.nextFloat();
  const r2 = rng.nextFloat();
  const cosTheta = Math.sqrt(r1);
  const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
  const phi = 2 * Math.PI * r2;
  
  const onb = buildONB(normal);
  const tangent = onb.tangent;
  const bitangent = onb.bitangent;
  
  const worldX = tangent[0] * Math.sin(phi) * cosTheta + bitangent[0] * Math.cos(phi) * sinTheta + onb.normal[0] * cosTheta;
  const worldY = tangent[1] * Math.sin(phi) * cosTheta + bitangent[1] * Math.cos(phi) * sinTheta + onb.normal[1] * cosTheta;
  const worldZ = tangent[2] * Math.sin(phi) * cosTheta + bitangent[2] * Math.cos(phi) * sinTheta + onb.normal[2] * cosTheta;
  
  return [worldX, worldY, worldZ];
}

/**
 * sampleGGX - sample a GGX distribution
 * @param {PhotorealRNG} rng - random number generator
 * @param {number[]} normal - surface normal
 * @param {number} alpha - roughness
 * @returns {number[]} - sampled direction
 */
export function sampleGGX(rng, normal, alpha) {
  const cosTheta = Math.sqrt(rng.nextFloat());
  const phi = 2 * Math.PI * rng.nextFloat();
  const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
  
  const onb = buildONB(normal);
  const tangent = onb.tangent;
  const bitangent = onb.bitangent;
  
  const worldX = tangent[0] * Math.sin(phi) * sinTheta + bitangent[0] * Math.cos(phi) * sinTheta + onb.normal[0] * cosTheta;
  const worldY = tangent[1] * Math.sin(phi) * sinTheta + bitangent[1] * Math.cos(phi) * sinTheta + onb.normal[1] * cosTheta;
  const worldZ = tangent[2] * Math.sin(phi) * sinTheta + bitangent[2] * Math.cos(phi) * sinTheta + onb.normal[2] * cosTheta;
  
  return [worldX, worldY, worldZ];
}