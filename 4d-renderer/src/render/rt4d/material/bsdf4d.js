import { vec4, dot, normalize, sub, scale, add, length } from "../math/vec4.js";
import { uniformSampleS3, uniformPDF_S3, S3_AREA } from "../math/s3.js";

export class BSDF4D {
  evaluate(wi, wo, normal) { return vec4(0, 0, 0, 0); }
  sample(wi, normal, u1, u2, u3) { return { wo: uniformSampleS3(u1, u2, u3), pdf: uniformPDF_S3(), value: vec4(0, 0, 0, 0) }; }
  pdf(wi, wo, normal) { return uniformPDF_S3(); }
}

export class Lambertian4D extends BSDF4D {
  constructor(albedo) {
    super();
    this.albedo = albedo ?? vec4(0.8, 0.8, 0.8, 1);
  }

  evaluate(wi, wo, normal) {
    const cosTheta = dot(wo, normal);
    if (cosTheta <= 0) return vec4(0, 0, 0, 0);
    return scale(this.albedo, cosTheta / (2 * Math.PI * Math.PI));
  }

  sample(wi, normal, u1, u2, u3) {
    const wo = this._cosineSampleS3(u1, u2, normal);
    const cosTheta = dot(wo, normal);
    if (cosTheta <= 0) return { wo, pdf: 0, value: vec4(0, 0, 0, 0) };
    const pdf = cosTheta / (Math.PI * Math.PI);
    const value = scale(this.albedo, cosTheta / (2 * Math.PI * Math.PI));
    return { wo, pdf, value };
  }

  pdf(wi, wo, normal) {
    const cosTheta = dot(wo, normal);
    return cosTheta <= 0 ? 0 : cosTheta / (Math.PI * Math.PI);
  }

  _cosineSampleS3(u1, u2, n) {
    const theta = 2 * Math.PI * u1;
    const psi = Math.acos(Math.sqrt(1 - u2));
    const sinPsi = Math.sin(psi);
    const w = vec4(
      sinPsi * Math.cos(theta),
      sinPsi * Math.sin(theta),
      Math.cos(psi),
      0,
    );
    const d = dot(w, n);
    if (d < 0) return vec4(-w.x, -w.y, -w.z, -w.w);
    return w;
  }
}
