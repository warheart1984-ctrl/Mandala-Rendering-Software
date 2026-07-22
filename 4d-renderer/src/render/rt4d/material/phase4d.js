import { dot, vec4, normalize } from "../math/vec4.js";
import { uniformSampleS3, uniformPDF_S3, S3_AREA } from "../math/s3.js";

export class PhaseFunction4D {
  evaluate(wi, wo) { return 1 / S3_AREA; }
  sample(wi, u1, u2, u3) { return { wo: uniformSampleS3(u1, u2, u3), pdf: uniformPDF_S3() }; }
  pdf(wi, wo) { return uniformPDF_S3(); }
}

export class Isotropic4D extends PhaseFunction4D {
  sample(wi, u1, u2, u3) {
    return { wo: uniformSampleS3(u1, u2, u3), pdf: uniformPDF_S3() };
  }
}

export class HenyeyGreenstein4D extends PhaseFunction4D {
  constructor(g) {
    super();
    this.g = g ?? 0;
  }

  evaluate(wi, wo) {
    const mu = dot(wi, wo);
    const g = this.g;
    const denom = 1 + g * g - 2 * g * mu;
    return (1 - g * g) / (4 * Math.PI * Math.PI * Math.sqrt(denom * denom * denom));
  }

  sample(wi, u1, u2, u3) {
    const g = this.g;
    const cosTheta = (1 + g * g - Math.pow((1 - g * g) / (1 - g + 2 * g * u1), 2)) / (2 * g);
    const phi = 2 * Math.PI * u2;
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));

    const i = Math.abs(wi.x) < 0.5 ? vec4(1, 0, 0, 0) : vec4(0, 1, 0, 0);
    const u = normalize({ x: wi.y * i.z - wi.z * i.y, y: wi.z * i.x - wi.x * i.z, z: wi.x * i.y - wi.y * i.x, w: 0 });
    const v = cross4D(wi, u);
    const uLen = Math.sqrt(u.x * u.x + u.y * u.y + u.z * u.z + u.w * u.w);
    const vLen = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z + v.w * v.w);
    if (uLen < 1e-9 || vLen < 1e-9) return { wo: uniformSampleS3(u1, u2, u3), pdf: uniformPDF_S3() };

    const un = { x: u.x / uLen, y: u.y / uLen, z: u.z / uLen, w: u.w / uLen };
    const vn = { x: v.x / vLen, y: v.y / vLen, z: v.z / vLen, w: v.w / vLen };

    const wo = vec4(
      sinTheta * (Math.cos(phi) * un.x + Math.sin(phi) * vn.x) + cosTheta * wi.x,
      sinTheta * (Math.cos(phi) * un.y + Math.sin(phi) * vn.y) + cosTheta * wi.y,
      sinTheta * (Math.cos(phi) * un.z + Math.sin(phi) * vn.z) + cosTheta * wi.z,
      sinTheta * (Math.cos(phi) * un.w + Math.sin(phi) * vn.w) + cosTheta * wi.w,
    );

    const pdf = this.evaluate(wi, wo);
    return { wo, pdf };
  }
}

function cross4D(a, b) {
  return vec4(
    a.y * b.z - a.z * b.y,
    a.z * b.w - a.w * b.z,
    a.w * b.x - a.x * b.w,
    a.x * b.y - a.y * b.x,
  );
}
