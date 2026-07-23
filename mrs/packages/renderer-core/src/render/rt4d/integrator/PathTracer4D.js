import { vec4, scale, add, mul, length, dot, normalize, sub, neg } from "../math/vec4.js";
import { uniformSampleS3, uniformPDF_S3, powerHeuristic } from "../math/s3.js";

export class PathTracer4D {
  constructor(options = {}) {
    this.maxDepth = options.maxDepth ?? 8;
    this.rrThreshold = options.rrThreshold ?? 3;
    this.samplesPerPixel = options.samplesPerPixel ?? 64;
    this.rng = options.rng ?? (() => Math.random());
  }

  trace(ray, scene, depth = 0) {
    if (depth >= this.maxDepth) return vec4(0, 0, 0, 0);

    const hit = scene.intersect(ray);
    if (!hit) return vec4(0, 0, 0, 0);

    const mat = scene.getMaterial(hit.materialId);
    if (!mat) return vec4(0, 0, 0, 0);

    if (mat.isLight) {
      const cosTheta = dot(neg(ray.direction), hit.normal);
      return cosTheta > 0 ? scale(mat.emission, cosTheta) : vec4(0, 0, 0, 0);
    }

    if (mat.isVolume && mat.phase) {
      return this._handleVolume(ray, hit, mat, scene, depth);
    }

    return this._handleSurface(ray, hit, mat, scene, depth);
  }

  _handleSurface(ray, hit, mat, scene, depth) {
    const wi = normalize(neg(ray.direction));

    if (depth >= this.rrThreshold) {
      const q = Math.max(0.05, 1 - length(mat.emission));
      if (this.rng() > q) return mat.emission;
    }

    const u1 = this.rng(), u2 = this.rng(), u3 = this.rng();
    const bsdfSample = mat.bsdf.sample(wi, hit.normal, u1, u2, u3);

    if (bsdfSample.pdf <= 0 || length(bsdfSample.value) === 0) return mat.emission;

    const scatterRay = {
      origin: vec4(
        hit.position.x + bsdfSample.wo.x * 0.001,
        hit.position.y + bsdfSample.wo.y * 0.001,
        hit.position.z + bsdfSample.wo.z * 0.001,
        hit.position.w + bsdfSample.wo.w * 0.001,
      ),
      direction: bsdfSample.wo,
      tMin: 0.001,
      tMax: 1e9,
    };

    const L = this.trace(scatterRay, scene, depth + 1);

    const lightPdf = this._sampleLightPDF(scene, hit, bsdfSample.wo);
    const misWeight = this._misWeight(bsdfSample.pdf, lightPdf);

    const cosTheta = Math.abs(dot(bsdfSample.wo, hit.normal));
    const contribution = scale(mul(L, bsdfSample.value), cosTheta * misWeight / (bsdfSample.pdf + 1e-9));

    return add(mat.emission, contribution);
  }

  _handleVolume(ray, hit, mat, scene, depth) {
    const wi = normalize(neg(ray.direction));
    const u1 = this.rng(), u2 = this.rng(), u3 = this.rng();

    const phaseSample = mat.phase.sample(wi, u1, u2, u3);

    const scatterRay = {
      origin: hit.position,
      direction: phaseSample.wo,
      tMin: 0.001,
      tMax: 1e9,
    };

    const L = this.trace(scatterRay, scene, depth + 1);

    const phaseVal = mat.phase.evaluate(wi, phaseSample.wo);
    const contribution = scale(L, phaseVal / (phaseSample.pdf + 1e-9));

    return add(mat.emission, contribution);
  }

  _sampleLightPDF(scene, hit, wo) {
    const lights = scene.getLights();
    if (lights.length === 0) return 0;

    let totalPDF = 0;

    for (const light of lights) {
      const c = light.center;
      const dc = vec4(c.x - hit.position.x, c.y - hit.position.y, c.z - hit.position.z, c.w - hit.position.w);
      const dist = Math.sqrt(dc.x * dc.x + dc.y * dc.y + dc.z * dc.z + dc.w * dc.w);
      const R = light.radius;

      let solidAngle;
      if (dist <= R) {
        solidAngle = 2 * Math.PI * Math.PI;
      } else {
        const sinAlpha = R / dist;
        const cosAlpha = Math.sqrt(Math.max(0, 1 - sinAlpha * sinAlpha));
        solidAngle = 2 * Math.PI * Math.PI * (1 - cosAlpha);
      }

      const lightPDF = 1 / (solidAngle + 1e-12);
      totalPDF += lightPDF / lights.length;
    }

    return totalPDF;
  }

  _misWeight(pdfBSDF, pdfLight) {
    return powerHeuristic(1, pdfBSDF, 1, pdfLight);
  }
}

export class SampleAccumulator {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.totalSamples = 0;
    this.accum = new Float64Array(width * height * 4);
  }

  addSample(x, y, color) {
    const idx = (y * this.width + x) * 4;
    this.accum[idx] += color.x;
    this.accum[idx + 1] += color.y;
    this.accum[idx + 2] += color.z;
    this.accum[idx + 3] += color.w;
  }

  getPixel(x, y) {
    const idx = (y * this.width + x) * 4;
    const n = this.totalSamples || 1;
    return vec4(this.accum[idx] / n, this.accum[idx + 1] / n, this.accum[idx + 2] / n, this.accum[idx + 3] / n);
  }

  finalize() {
    const pixels = new Uint8ClampedArray(this.width * this.height * 4);
    const n = this.totalSamples || 1;
    for (let i = 0; i < this.width * this.height; i++) {
      const idx = i * 4;
      pixels[idx] = Math.min(255, Math.max(0, (this.accum[idx] / n) * 255));
      pixels[idx + 1] = Math.min(255, Math.max(0, (this.accum[idx + 1] / n) * 255));
      pixels[idx + 2] = Math.min(255, Math.max(0, (this.accum[idx + 2] / n) * 255));
      pixels[idx + 3] = 255;
    }
    return pixels;
  }
}
