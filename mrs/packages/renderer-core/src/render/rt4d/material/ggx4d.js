import { vec4, dot, normalize, sub, scale, add, neg, length } from "../math/vec4.js";
import { buildONBFromNormal, uniformSampleS2 } from "../math/s3.js";
import { BSDF4D } from "./bsdf4d.js";

export class GGX4D extends BSDF4D {
  constructor(albedo, roughness, f0) {
    super();
    this.albedo = albedo ?? vec4(0.8, 0.8, 0.8, 1);
    this.alpha = Math.max(0.01, roughness ?? 0.2);
    this.f0 = f0 ?? vec4(0.04, 0.04, 0.04, 1);
  }

  evaluate(wi, wo, normal) {
    const cosWo = dot(wo, normal);
    const cosWi = dot(wi, normal);
    if (cosWo <= 0 || cosWi <= 0) return vec4(0, 0, 0, 0);

    const h = normalize(add(wi, wo));
    const D = this._ggxNDF(h, normal);
    const F = this._fresnel(dot(wi, h));
    const G = this._smithG(wi, wo, normal);

    const denom = 4 * Math.abs(cosWi * cosWo);
    if (denom < 1e-9) return vec4(0, 0, 0, 0);

    return scale(this.albedo, D * F * G / denom);
  }

  sample(wi, normal, u1, u2, u3) {
    const h = this._sampleVisibleNormal(wi, normal, u1, u2, u3);
    const wo = reflect(wi, h);
    const cosWo = dot(wo, normal);
    if (cosWo <= 0) return { wo, pdf: 0, value: vec4(0, 0, 0, 0) };

    const D = this._ggxNDF(h, normal);
    const G1 = this._smithG1(wi, normal);
    const pdf = D * G1 * Math.abs(dot(wi, h)) / (Math.abs(dot(wi, normal)) + 1e-9);
    const value = this.evaluate(wi, wo, normal);
    return { wo, pdf, value };
  }

  pdf(wi, wo, normal) {
    const h = normalize(add(wi, wo));
    const cosWiH = dot(wi, h);
    if (cosWiH <= 0) return 0;
    const D = this._ggxNDF(h, normal);
    const G1 = this._smithG1(wi, normal);
    return D * G1 * Math.abs(cosWiH) / (Math.abs(dot(wi, normal)) + 1e-9);
  }

  _ggxNDF(h, n) {
    const cosTheta = dot(h, n);
    if (cosTheta <= 0) return 0;
    const a2 = this.alpha * this.alpha;
    const denom = Math.PI * Math.PI * (1 + (a2 - 1) * cosTheta * cosTheta);
    return a2 / denom;
  }

  _fresnel(cosTheta) {
    const c = Math.max(0, cosTheta);
    return this.f0.x + (1 - this.f0.x) * Math.pow(1 - c, 5);
  }

  _smithG1(v, n) {
    const cosV = dot(v, n);
    if (cosV <= 0) return 0;
    const tanTheta = Math.sqrt(Math.max(0, 1 - cosV * cosV)) / cosV;
    const a = 1 / (this.alpha * tanTheta);
    return 2 / (1 + Math.sqrt(1 + a * a));
  }

  _smithG(wi, wo, n) {
    return this._smithG1(wi, n) * this._smithG1(wo, n);
  }

  _sampleVisibleNormal(wi, n, u1, u2, u3) {
    const { T1, T2, T3 } = buildONBFromNormal(n);

    const phi = 2 * Math.PI * u1;
    const sinTheta = Math.sqrt(u2);
    const cosTheta = Math.sqrt(1 - u2);
    const s2 = uniformSampleS2(u2, u3);

    const hLocal = vec4(sinTheta * s2.x, sinTheta * s2.y, sinTheta * s2.z, cosTheta);

    const h = vec4(
      hLocal.x * T1.x + hLocal.y * T2.x + hLocal.z * T3.x + hLocal.w * n.x,
      hLocal.x * T1.y + hLocal.y * T2.y + hLocal.z * T3.y + hLocal.w * n.y,
      hLocal.x * T1.z + hLocal.y * T2.z + hLocal.z * T3.z + hLocal.w * n.z,
      hLocal.x * T1.w + hLocal.y * T2.w + hLocal.z * T3.w + hLocal.w * n.w,
    );

    return normalize(h);
  }
}

function reflect(v, n) {
  const d = 2 * dot(v, n);
  return sub(v, scale(n, d));
}
