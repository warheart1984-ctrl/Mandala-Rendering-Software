import { vec4, scale, add, mul, length, dot, normalize, sub, neg } from "../math/vec4.js";
import { uniformSampleS3, S3_AREA, powerHeuristic } from "../math/s3.js";
import { sampleRt4dLight } from "../lighting/Rt4dLightAdapter.js";
import { DEFAULT_METRIC_ID } from "../identity/RenderIdentity.js";
import { createHash } from "node:crypto";

/** Per-ray debug telemetry is opt-in (MRS_TRACE=1) so the engine test
 *  suite stays runnable; the identical-PNG regression is caught by the
 *  fail-fast identity boundary + renderIdentityHash, not this logging. */
const TRACE_DEBUG = process.env.MRS_TRACE === "1" || process.env.MRS_TRACE === "true";

/** Surface area of an S³ of radius R (hypersphere boundary in R⁴). */
function hypersphereArea(radius) {
  return S3_AREA * radius * radius * radius;
}

/** Read a vertex's 4 components from an object or a nested array. */
function vertexComponents(v) {
  if (Array.isArray(v)) return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0];
  return [v.x ?? 0, v.y ?? 0, v.z ?? 0, v.w ?? 0];
}

/** Serialize indices whether flat ([i0,i1,i2,...]) or nested ([[a,b,c],...]). */
function indexData(indices) {
  if (!indices) return "";
  return Array.isArray(indices[0])
    ? indices.map((f) => f.join(",")).join(";")
    : indices.join(",");
}

function offsetOrigin(position, direction) {
  return vec4(
    position.x + direction.x * 0.001,
    position.y + direction.y * 0.001,
    position.z + direction.z * 0.001,
    position.w + direction.w * 0.001,
  );
}

/** Constitutional invariant: compute hash of scene geometry for traceability. */
function computeSceneGeometryHash(scene) {
  if (!scene.primitives || scene.primitives.length === 0) return "empty";
  const primitives = scene.primitives.filter(p => p.vertices && p.indices);
  if (primitives.length === 0) return "empty";
  const vertexCount = primitives.reduce((sum, m) => sum + (m.vertices?.length ?? 0), 0);
  const faceCount = primitives.reduce((sum, m) => sum + (m.indices?.length ?? 0), 0);
  const vertexData = primitives
    .map(m => (m.vertices ?? []).map(v => vertexComponents(v).join(",")).join(";"))
    .join("|");
  const faceData = primitives.map(m => indexData(m.indices)).join("|");
  const digest = createHash("sha256").update(`${vertexData};;${faceData}`).digest("hex");
  return `${digest.slice(0, 16)}:${faceCount}`;
}

/** Constitutional invariant: extract surface identity from scene if available. */
function extractSurfaceIdentity(scene) {
  if (scene.surfaceId) return scene.surfaceId;
  if (scene.surfaceIdentity) return scene.surfaceIdentity.surfaceId ?? scene.surfaceIdentity;
  if (scene.surfaceIdField) return scene.surfaceIdField;
  return "unknown";
}

/** Count triangles in a DynamicBvh tree (leaf arrays + recursive split). */
function countBvhPrimitives(node) {
  if (!node) return 0;
  if (node.triangles) return node.triangles.length;
  return countBvhPrimitives(node.left) + countBvhPrimitives(node.right);
}

export class PathTracer4D {
  constructor(options = {}) {
    this.maxDepth = options.maxDepth ?? 8;
    this.rrThreshold = options.rrThreshold ?? 3;
    this.samplesPerPixel = options.samplesPerPixel ?? 64;
    this.rng = options.rng ?? (() => Math.random());
    /**
     * Optional ProjCC observation bind.
     * Math/print SoT remains Projector4D + CPU RT4D rasterize — never aperture.
     * @type {null|{
     *   status: string,
     *   state: object,
     *   kernel: object,
     *   aperture: object,
     *   bindSite: string,
     *   printSoT: false,
     *   authority: "observation",
     * }}
     */
    this.observationProjection = options.observationProjection ?? null;
    /** Constitutional violations already surfaced per scene (dedupe by geometry hash). */
    this._warnedMissingGeometryHash = new Set();
  }

  /**
   * Bind a ProjCC observation bundle (ProjectionKernel + aperture).
   * Does not replace Projector4D print SoT or route aperture into print.
   *
   * @param {object|null} bundle
   * @returns {this}
   */
  bindObservationProjection(bundle) {
    if (bundle == null) {
      this.observationProjection = null;
      return this;
    }
    this.observationProjection = Object.freeze({
      status: bundle.status ?? "partial",
      state: bundle.state,
      kernel: bundle.kernel,
      aperture: bundle.aperture,
      observationModeId: bundle.observationModeId ?? null,
      projectionPolicyId: bundle.projectionPolicyId ?? null,
      bindSite: "PathTracer4D.observationProjection",
      printSoT: false,
      authority: "observation",
      note:
        "Governed observation aperture — assist/preview only; CPU RT4D print remains SoT.",
    });
    return this;
  }

  /**
   * Project a world point through the bound observation kernel when present.
   * Falls back to null when unbound — callers must use Projector4D for print.
   *
   * @param {{x:number,y:number,z:number,w:number}} point
   * @returns {null|{p3:object,screen:object,wFactor:number,printSoT:false,authority:"observation"}}
   */
  projectObservationPoint(point) {
    const bind = this.observationProjection;
    if (!bind?.kernel?.project) return null;
    const result = bind.kernel.project(point);
    return {
      ...result,
      printSoT: false,
      authority: "observation",
    };
  }

  /**
   * @param {object} ray
   * @param {object} scene
   * @param {number} depth
   * @param {object} [constitutionalContext] - Constitutional tracing context
   *   - geometryHash: string (sha256 of vertex/face/edge data)
   *   - sceneHash: string (sha256 of scene spec)
   *   - surfaceId: string (surface identifier)
   *   - rngSeed: number (RNG seed)
   *   - prevSceneHash: string (previous scene hash for comparison)
   */
  trace(ray, scene, depth = 0, constitutionalContext = {}) {
    // Constitutional invariant: trace entry must carry geometry evidence
    const surfaceId = extractSurfaceIdentity(scene);
    const sceneGeometryHash = computeSceneGeometryHash(scene);
    const sceneHash = constitutionalContext.sceneHash ?? "none";
    const rngSeed = constitutionalContext.rngSeed ?? "unknown";
    const geometryEvidenceId = constitutionalContext.geometryEvidenceId ?? scene.geometryEvidenceId ?? null;
    const metricId = constitutionalContext.metricId ?? scene.metric?.id ?? DEFAULT_METRIC_ID;

    // Constitutional invariant: trace entry must carry geometry evidence.
    // Emit at most once per scene — the ChatGPT render_4d_prompt path and the
    // engine suite otherwise flood stdout with one warning per ray, drowning
    // real output. The fail-fast identity boundary below still asserts when a
    // geometryEvidenceId is supplied.
    if (!constitutionalContext.geometryHash) {
      if (!this._warnedMissingGeometryHash.has(sceneGeometryHash)) {
        this._warnedMissingGeometryHash.add(sceneGeometryHash);
        console.warn(`[PathTracer4D] CONSTITUTIONAL VIOLATION: trace() called without geometryHash. surfaceId=${surfaceId}, sceneHash=${sceneHash}`);
      }
    } else {
      // Constitutional invariant: geometryHash must be non-empty
      if (!constitutionalContext.geometryHash || constitutionalContext.geometryHash === "") {
        console.warn(`[PathTracer4D] CONSTITUTIONAL VIOLATION: geometryHash is empty. surfaceId=${surfaceId}`);
      }
    }

    // Constitutional invariant: sceneHash must differ for different surfaces
    if (constitutionalContext.sceneHash && constitutionalContext.prevSceneHash) {
      if (constitutionalContext.sceneHash === constitutionalContext.prevSceneHash) {
        console.warn(`[PathTracer4D] CONSTITUTIONAL VIOLATION: sceneHash identical to previous. surfaceId=${surfaceId}`);
      }
    }

    // Fail-fast identity boundary (AC-R10 / RendererSurfaceDispatch): when the
    // render intent supplies a geometryEvidenceId, the scene's bound geometry
    // evidence must match it exactly. Verified once per scene; asserts throw.
    if (geometryEvidenceId && !scene._renderIdentityVerified) {
      scene.verifyRenderIdentity({
        surfaceId,
        geometryEvidenceId,
        metricId,
      });
      scene._renderIdentityVerified = true;
    }

    if (TRACE_DEBUG) {
      console.debug(`[PathTracer4D] trace entry: surfaceId=${surfaceId}, sceneGeometryHash=${sceneGeometryHash}, geometryEvidenceId=${geometryEvidenceId ?? "none"}, sceneHash=${sceneHash}, rngSeed=${rngSeed}, depth=${depth}`);
    }

    if (depth >= this.maxDepth) return vec4(0, 0, 0, 0);

    const hit = scene.intersect(ray);
    if (!hit) return scene.getEnvironment?.(ray) ?? vec4(0, 0, 0, 0);

    // Constitutional debug: first-hit signature ties the intersector's geometry
    // evidence to the render identity so lost-geometry regressions are visible.
    if (depth === 0 && constitutionalContext.__firstHitLogged !== true) {
      constitutionalContext.__firstHitLogged = true;
      if (TRACE_DEBUG) {
      const bvh = scene.geometryIntersector?.bvh ?? null;
      const bvhPrimCount = countBvhPrimitives(bvh);
      console.debug(
        `[PathTracer4D] First hit signature: materialId=${hit.materialId}, t=${hit.t}, ` +
        `surfaceId=${hit.surfaceId}, geometryHash=${hit.geometryHash}, ` +
        `geometryEvidenceId=${hit.geometryEvidenceId ?? "none"}, ` +
        `intersectorBvhPrimitives=${bvhPrimCount}, normal=(${hit.normal?.x},${hit.normal?.y},${hit.normal?.z},${hit.normal?.w})`,
      );
    }
    }

    const mat = scene.getShadedMaterial?.(hit.materialId, hit) ?? scene.getMaterial(hit.materialId);
    if (!mat) return vec4(0, 0, 0, 0);

    if (mat.isLight) {
      // Emission only — MIS vs NEE is applied by the caller that sampled this
      // direction (camera rays have no prior BSDF; they just see the light).
      const cosTheta = dot(neg(ray.direction), hit.normal);
      return cosTheta > 0 ? scale(mat.emission, cosTheta) : vec4(0, 0, 0, 0);
    }

    if (mat.isVolume && mat.phase) {
      return this._handleVolume(ray, hit, mat, scene, depth, constitutionalContext);
    }

    return this._handleSurface(ray, hit, mat, scene, depth, constitutionalContext);
  }

  _handleSurface(ray, hit, mat, scene, depth, constitutionalContext) {
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

    const L = this.trace(scatterRay, scene, depth + 1, constitutionalContext);
    const lightPdf = this._sampleLightPDF(scene, hit, bsdfSample.wo);
    const misWeight = this._misWeight(bsdfSample.pdf, lightPdf);
    const cosTheta = Math.abs(dot(bsdfSample.wo, hit.normal));
    const contribution = scale(
      mul(L, bsdfSample.value),
      (cosTheta * misWeight) / (bsdfSample.pdf + 1e-9),
    );

    return add(Lo, contribution);
  }

  _handleVolume(ray, hit, mat, scene, depth, constitutionalContext) {
    const wi = normalize(neg(ray.direction));
    const u1 = this.rng(), u2 = this.rng(), u3 = this.rng();

    const phaseSample = mat.phase.sample(wi, u1, u2, u3);

    const scatterRay = {
      origin: hit.position,
      direction: phaseSample.wo,
      tMin: 0.001,
      tMax: 1e9,
    };

    const L = this.trace(scatterRay, scene, depth + 1, constitutionalContext);

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
    const rigLights = scene.getRt4dLights?.() ?? [];
    const directLights = rigLights.filter((light) => light.type !== "environment");
    if (directLights.length > 0) {
      // Power-weighted selection among analytic lights (STATUS: enforced).
      const weights = directLights.map((light) => {
        const intensity = Number(light.intensity) || 1;
        const c = light.color || [1, 1, 1];
        const lum =
          0.2126 * (c[0] ?? 1) + 0.7152 * (c[1] ?? 1) + 0.0722 * (c[2] ?? 1);
        return Math.max(1e-6, intensity * Math.max(1e-6, lum));
      });
      const { index, pdfSelect } = this._pickWeighted(weights);
      const light = directLights[index];
      const sample = sampleRt4dLight(light, hit);
      if (!sample) return null;
      return { ...sample, pdf: sample.pdf * pdfSelect };
    }

    const lights = scene.getLights();
    if (lights.length === 0) return null;

    // Power × area weights — brighter / larger lights get more NEE samples.
    const weights = lights.map((light) => {
      const mat = scene.getMaterial(light.materialId);
      const em = mat?.emission ?? vec4(0, 0, 0, 0);
      const power = Math.max(1e-6, length(em));
      const R = light.radius > 0 ? light.radius : 1e-3;
      return power * hypersphereArea(R);
    });
    const { index, pdfSelect } = this._pickWeighted(weights);
    const light = lights[index];
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
    const pdf = pdfSolid * pdfSelect;

    const mat = scene.getMaterial(light.materialId);
    // Raw emission — cos_light lives in the estimator via pdf_ω, not here.
    const emission = mat?.emission ?? vec4(0, 0, 0, 0);

    return { wo, pdf, emission, dist };
  }

  /**
   * Discrete power-weighted pick. Returns selection pdf.
   * @param {number[]} weights
   * @returns {{ index: number, pdfSelect: number }}
   */
  _pickWeighted(weights) {
    let sum = 0;
    for (const w of weights) sum += w;
    if (!(sum > 0)) {
      return { index: 0, pdfSelect: 1 / Math.max(1, weights.length) };
    }
    let r = this.rng() * sum;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        return { index: i, pdfSelect: weights[i] / sum };
      }
    }
    const last = weights.length - 1;
    return { index: last, pdfSelect: weights[last] / sum };
  }

  /**
   * PDF of sampling direction `wo` via the light strategy (area → solid-angle).
   *
   * Governed light-rig analytic lights (point/directional/spot/area-as-Dirac)
   * are delta distributions sampled only via NEE. Their continuous directional
   * PDF for an arbitrary BSDF direction is 0 — not the discrete selection
   * probability 1/n (that factor stays on the NEE sample pdf only).
   */
  _sampleLightPDF(scene, hit, wo) {
    const rigLights = scene.getRt4dLights?.() ?? [];
    const directLights = rigLights.filter((light) => light.type !== "environment");
    if (directLights.length > 0) return 0;

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
    const pdfSolid = (pdfArea * dist * dist * dist) / (cosLight + 1e-9);

    // Match _sampleLight power×area selection probability.
    let sumW = 0;
    let wHit = 0;
    for (const L of lights) {
      const mat = scene.getMaterial(L.materialId);
      const em = mat?.emission ?? vec4(0, 0, 0, 0);
      const power = Math.max(1e-6, length(em));
      const R = L.radius > 0 ? L.radius : 1e-3;
      const w = power * hypersphereArea(R);
      sumW += w;
      if (L === light) wHit = w;
    }
    const pdfSelect = sumW > 0 ? wHit / sumW : 1 / lights.length;
    return pdfSolid * pdfSelect;
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
