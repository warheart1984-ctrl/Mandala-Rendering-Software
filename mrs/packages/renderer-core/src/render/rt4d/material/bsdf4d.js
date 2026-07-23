import { vec4, dot, normalize, sub, scale, add, length } from "../math/vec4.js";
import { uniformSampleS3, uniformPDF_S3, S3_AREA, cosineWeightedSampleS3 } from "../math/s3.js";

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
    return scale(this.albedo, 3 / (4 * Math.PI));
  }

  sample(wi, normal, u1, u2, u3) {
    const { direction: wo, pdf } = cosineWeightedSampleS3(u1, u2, u3, normal);
    if (pdf <= 0) return { wo, pdf: 0, value: vec4(0, 0, 0, 0) };
    const value = scale(this.albedo, 3 / (4 * Math.PI));
    return { wo, pdf, value };
  }

  pdf(wi, wo, normal) {
    const cosTheta = dot(wo, normal);
    return cosTheta <= 0 ? 0 : 3 * cosTheta / (4 * Math.PI);
  }

}
