/**
 * EntanglementRenderer — EFR architecture facade over efr.mjs.
 * Status: **partial** (CPU PNG working; alloc-once streaming buffers + shader
 * sources). GPU Three.js / RX 580 raster is **declared** until a host draws.
 * Do not claim 60fps unless measured.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EFR_STATUS,
  EFR_MODES,
  COMPOSITE_STATUS,
  renderEFR,
  renderBoundary,
  renderEGTHeatmap,
  renderEGTCausal,
  renderEGTEmergentGeometry,
  renderEGTCombined,
} from "./efr.mjs";
import { inducedMetricHij, g_munu } from "./projector.mjs";

export { EFR_STATUS, EFR_MODES, COMPOSITE_STATUS };

/** Shader sources + CPU buffers exist; GPU draw is not claimed. */
export const HOLOGRAPHIC_SHADER_STATUS = "partial";
export const HOLOGRAPHIC_BUFFER_STATUS = "partial";
/** Alloc-once Float32 cache + DynamicDrawUsage / needsUpdate contract. */
export const HOLOGRAPHIC_STREAMING_STATUS = "partial";
export const HOLOGRAPHIC_GPU_RASTER_STATUS = "declared";

/** Cap for streaming attribute pools. Not a measured GPU limit. */
export const DEFAULT_MAX_HOLO_NODES = 8192;

const __dirname = dirname(fileURLToPath(import.meta.url));

export const HOLOGRAPHIC_SHADER_SOT = Object.freeze({
  vert: join(__dirname, "shaders/holographic.vert"),
  frag: join(__dirname, "shaders/holographic.frag"),
});

/** Mythar violet 0x8a5cff as linear 0–1 rgb (matches shader uBoundaryColor). */
export const MYTHAR_BOUNDARY_COLOR = Object.freeze([
  0x8a / 255,
  0x5c / 255,
  0xff / 255,
]);

export const HOLOGRAPHIC_ATTRIBUTE_NAMES = Object.freeze([
  "position",
  "entanglementDensity",
  "entanglementDirection",
  "curvature",
  "entanglementWeight",
  "governance",
  "baseNormal",
]);

/**
 * Fallback 4-metric when the rig has no bulk metric.
 * This is Minkowski g_μν = diag(−c²,1,1,1) from projector.mjs — not Euclidean I₄.
 */
const IDENTITY_4 = g_munu;

function hijToFloat32(h) {
  const src = h || inducedMetricHij(g_munu);
  const out = new Float32Array(9);
  for (let i = 0; i < 9; i++) out[i] = src[i] ?? (i % 4 === 0 ? 1 : 0);
  return out;
}

function copyHijInto(target, h) {
  const src = h?.elements || h || inducedMetricHij(g_munu);
  for (let i = 0; i < 9; i++) target[i] = src[i] ?? (i % 4 === 0 ? 1 : 0);
  return target;
}

function nodeInducedMetricValue(h) {
  const elements = hijToFloat32(h);
  elements.fromArray = function fromArray(src, offset = 0) {
    const s = src?.elements || src;
    for (let i = 0; i < 9; i++) this[i] = s[offset + i] ?? 0;
    return this;
  };
  return elements;
}

function streamingAttribute(array, itemSize, THREE) {
  if (THREE?.BufferAttribute) {
    const attr = new THREE.BufferAttribute(array, itemSize);
    if (typeof attr.setUsage === "function" && THREE.DynamicDrawUsage != null) {
      attr.setUsage(THREE.DynamicDrawUsage);
    }
    attr.needsUpdate = false;
    return attr;
  }
  return {
    array,
    itemSize,
    count: Math.floor(array.length / itemSize),
    needsUpdate: false,
    setUsage() {},
  };
}

function stubHolographicGeometry() {
  return {
    attributes: {},
    drawRange: { start: 0, count: 0 },
    boundingSphere: {
      center: { x: 0, y: 0, z: 0, set() {} },
      radius: 100,
    },
    setAttribute(name, attr) {
      this.attributes[name] = attr;
      return this;
    },
    setDrawRange(start, count) {
      this.drawRange = { start, count };
      return this;
    },
    computeBoundingSphere() {
      if (!this.boundingSphere) {
        this.boundingSphere = { center: { set() {} }, radius: 100 };
      }
      this.boundingSphere.radius = 100;
      return this;
    },
    dispose() {},
  };
}

function packedSub(src, n) {
  if (!src) return null;
  if (typeof src.subarray === "function") return src.subarray(0, n);
  return src;
}

export function loadHolographicShaderSources() {
  return {
    vertexShader: readFileSync(HOLOGRAPHIC_SHADER_SOT.vert, "utf8"),
    fragmentShader: readFileSync(HOLOGRAPHIC_SHADER_SOT.frag, "utf8"),
  };
}

export function createHolographicUniforms(THREE = null) {
  const T = THREE;
  const uInduced = T?.Matrix3
    ? { value: new T.Matrix3() }
    : { value: nodeInducedMetricValue(inducedMetricHij(g_munu)) };
  if (T?.Matrix3 && typeof uInduced.value.fromArray === "function") {
    uInduced.value.fromArray(hijToFloat32(inducedMetricHij(g_munu)));
  }
  return {
    uTime: { value: 0 },
    uAnisotropy: { value: 1.2 },
    uMuscleGain: { value: 0.3 },
    uBoneThreshold: { value: 0.8 },
    uBoundaryColor: {
      value: T?.Color
        ? new T.Color(...MYTHAR_BOUNDARY_COLOR)
        : [...MYTHAR_BOUNDARY_COLOR],
    },
    uInducedMetric: uInduced,
    uLightPos: {
      value: T?.Vector3 ? new T.Vector3(2, 4, 3) : [2.0, 4.0, 3.0],
    },
  };
}

/**
 * Node-safe material: { vertexShader, fragmentShader, uniforms }.
 * RawShaderMaterial only when THREE is passed. GPU raster remains declared.
 */
export function createHolographicMaterial(THREE = null) {
  const { vertexShader, fragmentShader } = loadHolographicShaderSources();
  const uniforms = createHolographicUniforms(THREE);
  if (THREE?.RawShaderMaterial) {
    return new THREE.RawShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
    });
  }
  return { vertexShader, fragmentShader, uniforms };
}

export class EntanglementRenderer {
  constructor(opts = {}) {
    this.status = EFR_STATUS;
    this.shaderStatus = HOLOGRAPHIC_SHADER_STATUS;
    this.bufferStatus = HOLOGRAPHIC_BUFFER_STATUS;
    this.streamingStatus = HOLOGRAPHIC_STREAMING_STATUS;
    this.gpuRasterStatus = HOLOGRAPHIC_GPU_RASTER_STATUS;
    this.defaultWidth = opts.width ?? 384;
    this.defaultHeight = opts.height ?? 512;
    this.maxNodes = opts.maxNodes || DEFAULT_MAX_HOLO_NODES;
    const raw = opts.mode ?? EFR_MODES.HEATMAP;
    this.mode =
      raw === "composite" || raw === "COMPOSITE" ? EFR_MODES.COMPOSITE : raw;
    this.THREE = opts.THREE || null;
    this.geometry = null;
    this._isHolographicGeometry = false;
    this._bufferCache = null;
    this.holoBuffers = null;
    this.material = opts.material || createHolographicMaterial(this.THREE);
    this.uniforms = this.material.uniforms;
  }

  ensureMaterial() {
    if (!this.material || !this.material.uniforms) {
      this.material = createHolographicMaterial(this.THREE);
    }
    this.uniforms = this.material.uniforms;
    return this.material;
  }

  ensureGeometry() {
    if (this.geometry && this._isHolographicGeometry) return this.geometry;

    if (this.geometry && typeof this.geometry.dispose === "function") {
      this.geometry.dispose();
    }

    const T = this.THREE;
    const MAX_NODES = this.maxNodes || DEFAULT_MAX_HOLO_NODES;
    const pos = new Float32Array(MAX_NODES * 3);
    const rho = new Float32Array(MAX_NODES);
    const dir = new Float32Array(MAX_NODES * 3);
    const curv = new Float32Array(MAX_NODES);
    const wij = new Float32Array(MAX_NODES);
    const gov = new Float32Array(MAX_NODES * 4);
    const baseN = new Float32Array(MAX_NODES * 3);

    const geometry = T?.BufferGeometry
      ? new T.BufferGeometry()
      : stubHolographicGeometry();

    const attr = (array, itemSize) => streamingAttribute(array, itemSize, T);
    geometry.setAttribute("position", attr(pos, 3));
    geometry.setAttribute("entanglementDensity", attr(rho, 1));
    geometry.setAttribute("entanglementDirection", attr(dir, 3));
    geometry.setAttribute("curvature", attr(curv, 1));
    geometry.setAttribute("entanglementWeight", attr(wij, 1));
    geometry.setAttribute("governance", attr(gov, 4));
    geometry.setAttribute("baseNormal", attr(baseN, 3));

    if (typeof geometry.setDrawRange === "function") geometry.setDrawRange(0, 0);
    if (T?.Sphere && T?.Vector3) {
      geometry.boundingSphere = new T.Sphere(new T.Vector3(0, 0, 0), 100);
    } else {
      geometry.boundingSphere = {
        center: { x: 0, y: 0, z: 0, set() {} },
        radius: 100,
      };
    }

    this.geometry = geometry;
    this._isHolographicGeometry = true;
    this._bufferCache = { pos, rho, dir, curv, wij, gov, baseN, max: MAX_NODES };
    return this.geometry;
  }

  /**
   * Stream holographic.vert attributes from CharacterHolographicRig.
   * Alloc-once cache; t→t+1 is .set / needsUpdate / setDrawRange — no new
   * BufferAttribute. THREE is optional.
   */
  buildHolographicBuffers(holoRig) {
    this.ensureGeometry();
    this.ensureMaterial();
    const nodes = holoRig?.nodes || [];
    const count = nodes.length;
    if (count === 0) return null;
    const max = this._bufferCache.max;
    if (count > max) {
      console.warn(
        `[entanglement-renderer] node count ${count} exceeds maxNodes ${max}; streaming pool not grown`,
      );
      return null;
    }

    const c = this._bufferCache;
    const packed = holoRig.buffers;
    const packedOk =
      packed &&
      (packed.entanglementDensity instanceof Float32Array ||
        packed.position instanceof Float32Array);

    if (packedOk) {
      const pPos = packedSub(packed.position, count * 3);
      const pRho = packedSub(packed.entanglementDensity, count);
      const pDir = packedSub(packed.entanglementDirection, count * 3);
      const pCurv = packedSub(packed.curvature, count);
      const pWij = packedSub(packed.entanglementWeight, count);
      const pGov = packedSub(packed.governance, count * 4);
      const pBn = packedSub(packed.baseNormal, count * 3);
      if (pPos) c.pos.set(pPos, 0);
      if (pRho) c.rho.set(pRho, 0);
      if (pDir) c.dir.set(pDir, 0);
      if (pCurv) c.curv.set(pCurv, 0);
      if (pWij) c.wij.set(pWij, 0);
      if (pGov) c.gov.set(pGov, 0);
      if (pBn) c.baseN.set(pBn, 0);
    } else {
      for (let i = 0; i < count; i++) {
        const n = nodes[i] || {};
        // 0.5 is a missing-data default, not measured entanglement.
        c.rho[i] = n.entanglementDensity ?? n.rho ?? 0.5;
        c.curv[i] = n.curvature ?? n.K ?? 0.0;
        c.wij[i] = n.weight ?? n.w_sum ?? 0.0;
        const d = n.direction || n.d_ij || { x: 0, y: 1, z: 0 };
        c.dir[i * 3] = d.x ?? d[0] ?? 0;
        c.dir[i * 3 + 1] = d.y ?? d[1] ?? 1;
        c.dir[i * 3 + 2] = d.z ?? d[2] ?? 0;
        const g = n.governance || n.gov || {};
        c.gov[i * 4] = g.intent ?? 0.8;
        c.gov[i * 4 + 1] = g.evidence ?? 0.8;
        // 0.868 is a golden-path default when CIEMS is missing — not PID1 proof.
        c.gov[i * 4 + 2] = g.conformance ?? 0.868;
        c.gov[i * 4 + 3] = g.stewardship ?? 1.0;
        const bn = n.baseNormal || n.normal || n.h_normal || [0, 1, 0];
        c.baseN[i * 3] = bn[0] ?? bn.x ?? 0;
        c.baseN[i * 3 + 1] = bn[1] ?? bn.y ?? 1;
        c.baseN[i * 3 + 2] = bn[2] ?? bn.z ?? 0;
        const p = n.pos || n.position || n.x_mu || { x: 0, y: 0, z: 0 };
        c.pos[i * 3] = p.x ?? p[0] ?? 0;
        c.pos[i * 3 + 1] = p.y ?? p[1] ?? 0;
        c.pos[i * 3 + 2] = p.z ?? p[2] ?? 0;
      }
    }

    const attrs = this.geometry.attributes;
    attrs.position.needsUpdate = true;
    attrs.entanglementDensity.needsUpdate = true;
    attrs.entanglementDirection.needsUpdate = true;
    attrs.curvature.needsUpdate = true;
    attrs.entanglementWeight.needsUpdate = true;
    attrs.governance.needsUpdate = true;
    attrs.baseNormal.needsUpdate = true;

    if (typeof this.geometry.setDrawRange === "function") {
      this.geometry.setDrawRange(0, count);
    }
    if (typeof this.geometry.computeBoundingSphere === "function") {
      this.geometry.computeBoundingSphere();
    }
    if (this.geometry.boundingSphere) this.geometry.boundingSphere.radius = 100;

    const g4 = holoRig.bulk?.metric || holoRig.g_munu || IDENTITY_4;
    const h = holoRig.egt?.h_ij || holoRig.h_ij || inducedMetricHij(g4);

    const u = this.material?.uniforms;
    if (u?.uInducedMetric?.value) {
      const target = u.uInducedMetric.value;
      if (typeof target.fromArray === "function") {
        target.fromArray(hijToFloat32(h));
      } else {
        copyHijInto(target.elements || target, h);
      }
    }
    if (u?.uTime) {
      u.uTime.value = holoRig.bulk?.t ?? holoRig.bulk?.state?.t ?? 0;
    }
    this.uniforms = u || this.uniforms;

    this.holoBuffers = {
      count,
      h_ij: h,
      position: c.pos.subarray(0, count * 3),
      entanglementDensity: c.rho.subarray(0, count),
      entanglementDirection: c.dir.subarray(0, count * 3),
      curvature: c.curv.subarray(0, count),
      entanglementWeight: c.wij.subarray(0, count),
      governance: c.gov.subarray(0, count * 4),
      baseNormal: c.baseN.subarray(0, count * 3),
    };
    return { count, h_ij: h };
  }

  /**
   * Optional Three.js host adapter. Core Node tests must not import THREE.
   * Prefers the streaming geometry when this renderer already owns one.
   */
  toThreeGeometry(THREE) {
    const T = THREE || this.THREE;
    if (!T?.BufferGeometry || !T?.BufferAttribute) {
      throw new Error("toThreeGeometry requires a Three.js module");
    }
    if (this._isHolographicGeometry && this.geometry) return this.geometry;
    const b = this.holoBuffers;
    if (!b) throw new Error("toThreeGeometry: call buildHolographicBuffers() first");
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(b.position, 3));
    g.setAttribute("entanglementDensity", new T.BufferAttribute(b.entanglementDensity, 1));
    g.setAttribute("entanglementDirection", new T.BufferAttribute(b.entanglementDirection, 3));
    g.setAttribute("curvature", new T.BufferAttribute(b.curvature, 1));
    g.setAttribute("entanglementWeight", new T.BufferAttribute(b.entanglementWeight, 1));
    g.setAttribute("governance", new T.BufferAttribute(b.governance, 4));
    g.setAttribute("baseNormal", new T.BufferAttribute(b.baseNormal, 3));
    return g;
  }

  /**
   * renderBoundary(egt, boundary, mode) → PNG buffer fields {width,height,rgb}
   * COMPOSITE consumes count-bounded views of the streaming cache.
   */
  renderBoundary(egt, boundary, mode = this.mode) {
    return renderBoundary(egt, boundary, mode, {
      width: this.defaultWidth,
      height: this.defaultHeight,
      h_ij: boundary?.h_ij || egt.h_ij || this.holoBuffers?.h_ij,
      holoBuffers: this.holoBuffers,
      uniforms: this.uniforms || this.material?.uniforms,
    });
  }

  render(egt, mode = this.mode) {
    return renderEFR(egt, mode, {
      width: this.defaultWidth,
      height: this.defaultHeight,
      h_ij: egt.h_ij || this.holoBuffers?.h_ij,
      holoBuffers: this.holoBuffers,
      uniforms: this.uniforms || this.material?.uniforms,
    });
  }
}

export function createEntanglementRenderer(opts) {
  return new EntanglementRenderer(opts);
}

export {
  renderEFR,
  renderBoundary,
  renderEGTHeatmap,
  renderEGTCausal,
  renderEGTEmergentGeometry,
  renderEGTCombined,
};
