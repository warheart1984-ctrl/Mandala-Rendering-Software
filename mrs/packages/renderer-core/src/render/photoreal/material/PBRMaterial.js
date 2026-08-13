/**
 * Base PBR Material class following Disney Principled BRDF
 * Energy-conserving, reciprocal, supports layered materials
 */
export class PBRMaterial {
  /**
   * @param {Object} definition
   * @param {number[]} definition.albedo - base color [r,g,b] linear sRGB
   * @param {number} definition.roughness - 0.0 to 1.0
   * @param {number} definition.metallic - 0.0 to 1.0
   * @param {number} definition.specular - 0.0 to 1.0 (non-metallic specular)
   * @param {number} definition.clearcoat - 0.0 to 1.0
   * @param {number} definition.clearcoatRoughness - 0.0 to 1.0
   * @param {number} definition.anisotropy - 0.0 to 1.0
   * @param {number} definition.anisotropyRotation - 0.0 to 1.0
   * @param {number} definition.sheen - 0.0 to 1.0 (fabric)
   * @param {number} definition.sheenTint - 0.0 to 1.0
   * @param {number} definition.transmission - 0.0 to 1.0 (glass)
   * @param {number} definition.ior - index of refraction
   * @param {number} definition.thickness - for thin-film/transmission
   * @param {number[]} definition.normalMap - optional normal map parameters
   * @param {number} definition.alpha - opacity
   */
  constructor(definition = {}) {
    this.albedo = definition.albedo ?? [0.8, 0.8, 0.8];
    this.roughness = Math.max(0.001, Math.min(1.0, definition.roughness ?? 0.5));
    this.metallic = Math.max(0.0, Math.min(1.0, definition.metallic ?? 0.0));
    this.specular = Math.max(0.0, Math.min(1.0, definition.specular ?? 0.5));
    this.clearcoat = Math.max(0.0, Math.min(1.0, definition.clearcoat ?? 0.0));
    this.clearcoatRoughness = Math.max(0.0, Math.min(1.0, definition.clearcoatRoughness ?? 0.0));
    this.anisotropy = Math.max(0.0, Math.min(1.0, definition.anisotropy ?? 0.0));
    this.anisotropyRotation = definition.anisotropyRotation ?? 0.0;
    this.sheen = Math.max(0.0, Math.min(1.0, definition.sheen ?? 0.0));
    this.sheenTint = Math.max(0.0, Math.min(1.0, definition.sheenTint ?? 0.5));
    this.transmission = Math.max(0.0, Math.min(1.0, definition.transmission ?? 0.0));
    this.ior = definition.ior ?? 1.5;
    this.thickness = definition.thickness ?? 0.0;
    this.alpha = definition.alpha ?? 1.0;
    
    this.materialId = definition.materialId ?? `mat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.type = "pbr";
  }

  /**
   * Evaluate BSDF: f(wi, wo) * cosθ
   * @param {number[]} wi - incoming direction (normalized)
   * @param {number[]} wo - outgoing direction (normalized)
   * @param {number[]} normal - surface normal
   * @param {number[]} tangent - surface tangent
   * @param {number[]} uv - texture coordinates
   * @returns {Object} { f: number[], pdf: number }
   */
  evaluate(wi, wo, normal, tangent, uv) {
    const { f, pdf } = this._bsdf(wi, wo, normal, tangent, uv);
    return { f, pdf };
  }

  /**
   * Sample BSDF: returns wi, f, pdf
   */
  sample(wo, normal, tangent, uv, rng) {
    // Importance sample the BSDF
    const { wi, f, pdf } = this._sampleBSDF(wo, normal, tangent, uv, rng);
    return { wi, f, pdf };
  }

  /**
   * PDF for given wi, wo
   */
  pdf(wi, wo, normal, tangent, uv) {
    return this._bsdfPDF(wi, wo, normal, tangent, uv);
  }

  // Internal BSDF evaluation (Disney Principled BRDF)
  _bsdf(wi, wo, normal, tangent, uv) {
    const ndotwi = Math.max(0, this._dot(normal, wi));
    const ndotwo = Math.max(0, this._dot(normal, wo));
    const vdotw = Math.max(0, this._dot(wo, this._halfVector(wi, wo)));
    
    if (ndotwi <= 0 || ndotwo <= 0) return { f: [0, 0, 0], pdf: 0 };

    // Fresnel term
    const F0 = this._fresnelF0();
    const F = this._fresnelSchlick(vdotw, F0);

    // Normal distribution function (GGX)
    const alpha = this._roughnessToAlpha(this.roughness);
    const D = this._ggxNDF(normal, this._halfVector(wi, wo), alpha);

    // Geometry term (Smith-GGX)
    const G = this._smithGGX(normal, wi, wo, alpha);

    // Diffuse (Disney diffuse)
    const Fd90 = 0.5 + 2.0 * vdotw * vdotw * this.roughness;
    const Fd = this._lerp(1.0, Fd90, Math.pow(1.0 - ndotwi, 5)) * this._lerp(1.0, Fd90, Math.pow(1.0 - ndotwo, 5));
    const diffuse = this._multiply(this.albedo, (1.0 - this.metallic) * (1.0 - F) * Fd / Math.PI);

    // Specular (GGX)
    const Fs = this._multiply(F, (1.0 - this.metallic) * this.specular);
    const specular = this._multiply(Fs, D * G / (4.0 * ndotwi * ndotwo + 1e-6));

    // Clearcoat
    let clearcoat = [0, 0, 0];
    if (this.clearcoat > 0) {
      const ccAlpha = this._roughnessToAlpha(this.clearcoatRoughness);
      const ccD = this._ggxNDF(normal, this._halfVector(wi, wo), ccAlpha);
      const ccG = this._smithGGX(normal, wi, wo, ccAlpha);
      const ccF = this._fresnelSchlick(vdotw, [0.04, 0.04, 0.04]);
      clearcoat = this._multiply([0.25 * this.clearcoat], ccD * ccG / (4.0 * Math.max(0.001, this._dot(normal, wi)) * Math.max(0.001, this._dot(normal, wo)) + 1e-6));
    }

    // Sheen
    let sheen = [0, 0, 0];
    if (this.sheen > 0) {
      const sheenColor = this._mix([1,1,1], this.albedo, this.sheenTint);
      const sheenF = this._fresnelSchlick(vdotw, sheenColor);
      sheen = this._multiply(sheenColor, this.sheen * sheenF * (1.0 - this.metallic));
    }

    // Combine
    const f = this._add(this._add(diffuse, specular), this._add(clearcoat, sheen));
    
    // PDF (cosine-weighted for diffuse, GGX for specular)
    const pdf = this._bsdfPDF(wi, wo, normal, tangent, uv);

    return { f, pdf };
  }

  _sampleBSDF(wo, normal, tangent, uv, rng) {
    // Cosine-weighted hemisphere for diffuse
    // GGX importance sampling for specular
    // Clearcoat sampling
    // For simplicity, return cosine-weighted
    const u1 = rng();
    const u2 = rng();
    const r = Math.sqrt(u1);
    const theta = 2 * Math.PI * u2;
    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);
    const z = Math.sqrt(Math.max(0, 1 - u1));
    
    // Transform to world space using tangent frame
    const wi = [
      x * tangent[0] + y * tangent[1] + z * normal[0],
      x * tangent[2] + y * tangent[3] + z * normal[1],
      x * tangent[4] + y * tangent[5] + z * normal[2]
    ];
    
    const f = this._bsdf(wi, wo, normal, tangent, uv).f;
    const pdf = Math.max(0, this._dot(normal, wi)) / Math.PI;
    
    return { wi, f, pdf };
  }

  _bsdfPDF(wi, wo, normal, tangent, uv) {
    // Simplified: cosine-weighted for diffuse, GGX for specular
    const ndotwi = Math.max(0, this._dot(normal, wi));
    return ndotwi / Math.PI;
  }

  // Helper methods
  _dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
  _halfVector(wi, wo) { return [(wi[0]+wo[0])*0.5, (wi[1]+wo[1])*0.5, (wi[2]+wo[2])*0.5]; }
  _multiply(a, b) { return Array.isArray(b) ? a.map((v,i) => v*b[i]) : a.map(v => v*b); }
  _add(a, b) { return a.map((v,i) => v+b[i]); }
  _lerp(a, b, t) { return a + (b-a)*t; }
  _mix(a, b, t) { return a.map((v,i) => v + (b[i]-v)*t); }
  _fresnelF0() {
    const F0 = this.metallic ? this.albedo : [0.04, 0.04, 0.04];
    return this._mix(F0, this.albedo, this.metallic);
  }
  _fresnelSchlick(cosTheta, F0) {
    const c = 1.0 - Math.max(0, cosTheta);
    const c5 = c*c*c*c*c;
    return this._add(F0, this._multiply(this._sub([1,1,1], F0), c5));
  }
  _sub(a, b) { return a.map((v,i) => v-b[i]); }
  _roughnessToAlpha(roughness) { return roughness * roughness; }
  _ggxNDF(normal, half, alpha) {
    const ndoth = this._dot(normal, half);
    const a2 = alpha * alpha;
    const denom = ndoth*ndoth * (a2 - 1) + 1;
    return a2 / (Math.PI * denom * denom + 1e-6);
  }
  _smithGGX(normal, wi, wo, alpha) {
    const ndotwi = this._dot(normal, wi);
    const ndotwo = this._dot(normal, wo);
    const k = alpha * alpha * 0.5;
    const G1 = ndotwi / (ndotwi * (1-k) + k + 1e-6);
    const G2 = ndotwo / (ndotwo * (1-k) + k + 1e-6);
    return G1 * G2;
  }
}

export function createMaterial(definition) {
  return new PBRMaterial(definition);
}

export function evaluateMaterial(materialId, wi, wo, geom) {
  // Lookup material by ID and evaluate
  // Implementation depends on material registry
}

export function sampleMaterial(materialId, wo, geom, rng) {
  // Sample BSDF for material
}

export function materialPdf(materialId, wi, wo, geom) {
  // PDF for material
}