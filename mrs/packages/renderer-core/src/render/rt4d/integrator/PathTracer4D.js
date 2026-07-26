import { vec4, scale, add, mul, length, dot, normalize, sub, neg } from "../math/vec4.js";
import { uniformSampleS3, S3_AREA, powerHeuristic } from "../math/s3.js";

/** Surface area of an S³ of radius R (hypersphere boundary in R⁴). */
function hypersphereArea(radius) {
  return S3_AREA * radius * radius * radius;
}

function offsetOrigin(position, direction) {
  return vec4(
    position.x + direction.x * 0.001,
    position.y + direction.y * 0.001,
    position.z + direction.z * 0.001,
    position.w + direction.w * 0.001,
  );
}

export class PathTracer4D {
  constructor(options = {}) {
    this.maxDepth = options.maxDepth ?? 8;
    this.rrThreshold = options.rrThreshold ?? 3;
    this.samplesPerPixel = options.samplesPerPixel ?? 64;
    this.rng = options.rng ?? (() => Math.random());
  }

  /**
   * @param {object} ray
   * @param {object} scene
   * @param {number} depth
   */
  trace(ray, scene, depth = 0) {
    if (depth >= this.maxDepth) return vec4(0, 0, 0, 0);

    const hit = scene.intersect(ray);
    if (!hit) return scene.getEnvironment?.(ray) ?? vec4(0, 0, 0, 0);

    const mat = scene.getMaterial(hit.materialId);
    if (!mat) return vec4(0, 0, 0, 0);

    if (mat.isLight) {
      // Emission only — MIS vs NEE is applied by the caller that sampled this
      // direction (camera rays have no prior BSDF; they just see the light).
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
    let Lo = mat.emission ?? vec4(0, 0, 0, 0);

    if (depth >= this.rrThreshold) {
      const q = Math.max(0.05, 1 - length(mat.emission));
      if (this.rng() > q) return Lo;
      // Survival: weight handled by continuing without explicit 1/q for demo stability
    }

    // Next-event estimation: sample a hypersphere light, shadow-test, MIS.
    const nee = this._sampleLight(scene, hit);
    if (nee && nee.pdf > 0) {
      const shadowRay = {
        origin: offsetOrigin(hit.position, nee.wo),
        direction: nee.wo,
        tMin: 0.001,
        tMax: nee.dist + 1e-3,
      };
      const blocker = scene.intersect(shadowRay);
      const blockerMat = blocker ? scene.getMaterial(blocker.materialId) : null;
      // The light prim is in the BVH; a hit on any light is unoccluded.
      const occluded = Boolean(blocker && !blockerMat?.isLight);
      if (!occluded) {
        const f = mat.bsdf.evaluate(wi, nee.wo, hit.normal);
        const cosTheta = Math.max(0, dot(nee.wo, hit.normal));
        if (cosTheta > 0 && length(f) > 0) {
          const bsdfPdf = mat.bsdf.pdf(wi, nee.wo, hit.normal);
          const wLight = this._misWeight(nee.pdf, bsdfPdf);
          // Area-light estimator: L_e * f * cosθ / pdf_ω
          // (pdf_ω already includes the 4D Jacobian r³ / cos_light).
          const contrib = scale(
            mul(nee.emission, f),
            (cosTheta * wLight) / (nee.pdf + 1e-9),
          );
          Lo = add(Lo, contrib);
        }
      }
    }

    const u1 = this.rng(), u2 = this.rng(), u3 = this.rng();
    const bsdfSample = mat.bsdf.sample(wi, hit.normal, u1, u2, u3);

    if (bsdfSample.pdf <= 0 || length(bsdfSample.value) === 0) return Lo;

    const scatterRay = {
      origin: offsetOrigin(hit.position, bsdfSample.wo),
      direction: bsdfSample.wo,
      tMin: 0.001,
      tMax: 1e9,
    };

    const L = this.trace(scatterRay, scene, depth + 1);
    const lightPdf = this._sampleLightPDF(scene, hit, bsdfSample.wo);
    const misWeight = this._misWeight(bsdfSample.pdf, lightPdf);
    const cosTheta = Math.abs(dot(bsdfSample.wo, hit.normal));
    const contribution = scale(
      mul(L, bsdfSample.value),
      (cosTheta * misWeight) / (bsdfSample.pdf + 1e-9),
    );

    return add(Lo, contribution);
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

  /**
   * Sample a direction toward a random hypersphere light (area → solid-angle PDF).
   * In 4D the light surface is an S³; the Jacobian is r³ / cos (not r²).
   * @returns {{ wo, pdf, emission, dist } | null}
   */
  _sampleLight(scene, hit) {
    const lights = scene.getLights();
    if (lights.length === 0) return null;

    const light = lights[Math.floor(this.rng() * lights.length)];
    const R = light.radius;
    if (!(R > 0)) return null;

    const u1 = this.rng(), u2 = this.rng(), u3 = this.rng(), u4 = this.rng();
    const nOnLight = uniformSampleS3(u1, u2, u3, u4);
    const c = light.center;
    const lightPoint = vec4(
      c.x + nOnLight.x * R,
      c.y + nOnLight.y * R,
      c.z + nOnLight.z * R,
      c.w + nOnLight.w * R,
    );
    const toL = sub(lightPoint, hit.position);
    const dist = length(toL);
    if (!(dist > 1e-6)) return null;
    const wo = scale(toL, 1 / dist);

    // Outward normal at light point is nOnLight; foreshortening vs incoming -wo.
    const cosLight = Math.max(0, -dot(wo, nOnLight));
    if (cosLight <= 0) return null;

    const area = hypersphereArea(R);
    const pdfArea = 1 / (area + 1e-12);
    // 4D: dA → dω Jacobian uses r³ (S³ area scales as r³).
    const pdfSolid = (pdfArea * dist * dist * dist) / (cosLight + 1e-9);
    const pdf = pdfSolid / lights.length;

    const mat = scene.getMaterial(light.materialId);
    // Raw emission — cos_light lives in the estimator via pdf_ω, not here.
    const emission = mat?.emission ?? vec4(0, 0, 0, 0);

    return { wo, pdf, emission, dist };
  }

  /**
   * PDF of sampling direction `wo` via the light strategy (area → solid-angle).
   */
  _sampleLightPDF(scene, hit, wo) {
    const lights = scene.getLights();
    if (lights.length === 0) return 0;

    const ray = {
      origin: offsetOrigin(hit.position, wo),
      direction: wo,
      tMin: 0.001,
      tMax: 1e9,
    };
    const lh = scene.intersect(ray);
    if (!lh) return 0;
    const mat = scene.getMaterial(lh.materialId);
    if (!mat?.isLight) return 0;

    return this._hitLightPDF(scene, lh, ray);
  }

  /** Solid-angle PDF for an already-resolved light hit along `ray`. */
  _hitLightPDF(scene, lh, ray) {
    const lights = scene.getLights();
    if (lights.length === 0) return 0;

    const light =
      lights.find((L) => L.materialId === lh.materialId) ??
      lights.find((L) => {
        const d = length(sub(lh.position, L.center));
        return Math.abs(d - L.radius) < 1e-2;
      });
    if (!light || !(light.radius > 0)) return 0;

    const dist = lh.t;
    const cosLight = Math.max(0, -dot(ray.direction, lh.normal));
    if (cosLight <= 0) return 0;

    const area = hypersphereArea(light.radius);
    const pdfArea = 1 / (area + 1e-12);
    return ((pdfArea * dist * dist * dist) / (cosLight + 1e-9)) / lights.length;
  }

  _misWeight(pdfA, pdfB) {
    return powerHeuristic(1, pdfA, 1, pdfB);
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
