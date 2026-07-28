/**
 * CECP Ω∞ end-to-end proton pipeline orchestration.
 *
 * STATUS: **enforced** (six mods + PNG)
 *
 * SceneSpecification → ProtonField → Lighting4D → Projection → Raster
 * → DepthField → NormalField → PNG
 *
 * Also: WorldDocumentRt4d / Proton4D[] → ProtonField via
 * `protonFieldFromWorldDocumentRt4d` / `runProtonPipelineFromField`
 * (no SceneSpecification required).
 */

import { createHash } from "node:crypto";
import {
  sceneToProtonField,
  assertProtonFieldInvariants,
  makeProton,
  protonToLegacy,
} from "./sceneToProtonField.js";
import { fromWorldDocumentRt4d } from "./fromWorldDocumentRt4d.js";
import { applyLighting4D } from "./lighting4d.js";
import {
  projectProtonField,
  defaultCamera4D,
} from "./projectProtonField.js";
import { rasterizeProtons } from "./rasterizeProtons.js";
import { depthFromRaster, assertDepthFieldInvariants } from "./depthField.js";
import {
  normalsFromRaster,
  assertNormalFieldInvariants,
} from "./normalField.js";
import { rasterToImage } from "./rasterToImage.js";
import { applyTonemap } from "./tonemap.js";
import { renderDims, downsampleBox } from "./supersample.js";

/**
 * @param {unknown} color
 * @returns {[number, number, number]}
 */
function rgb01(color) {
  if (Array.isArray(color) && color.length >= 3) {
    return [
      Math.min(1, Math.max(0, Number(color[0]) || 0)),
      Math.min(1, Math.max(0, Number(color[1]) || 0)),
      Math.min(1, Math.max(0, Number(color[2]) || 0)),
    ];
  }
  if (typeof color === "number" && Number.isFinite(color)) {
    const c = Math.min(1, Math.max(0, color));
    return [c, c, c];
  }
  return [0.85, 0.9, 1];
}

/**
 * Convert Proton4D[] (fromWorldDocumentRt4d) → ProtonField for Mod2+.
 * @param {import("./types.js").Proton4D[]} legacyProtons
 * @param {{ intentId?: string, worldId?: string }} [opts]
 * @returns {import("./sceneToProtonField.js").ProtonField}
 */
export function protonFieldFromLegacyProtons(legacyProtons, opts = {}) {
  if (!Array.isArray(legacyProtons)) {
    throw new Error("protonFieldFromLegacyProtons: protons array required");
  }
  /** @type {import("./sceneToProtonField.js").Proton[]} */
  const protons = [];
  /** @type {string[]} */
  const entityIds = [];
  const seen = new Set();

  for (let i = 0; i < legacyProtons.length; i++) {
    const lp = legacyProtons[i];
    if (!lp || typeof lp !== "object") continue;
    const mu = Array.isArray(lp.mu)
      ? lp.mu
      : Array.isArray(lp.center)
        ? lp.center
        : [0, 0, 0, 0];
    const meta = lp.meta && typeof lp.meta === "object" ? { ...lp.meta } : {};
    const sourceEntityId =
      typeof meta.sourceEntityId === "string"
        ? meta.sourceEntityId
        : typeof lp.id === "string"
          ? String(lp.id).replace(/-s\d+$/, "")
          : `__scene__`;
    if (sourceEntityId !== "__scene__" && !seen.has(sourceEntityId)) {
      seen.add(sourceEntityId);
      entityIds.push(sourceEntityId);
    }
    const density =
      typeof lp.opacity === "number"
        ? lp.opacity
        : typeof lp.weight === "number"
          ? lp.weight
          : 1;
    protons.push(
      makeProton(
        typeof lp.id === "string" && lp.id.length > 0 ? lp.id : `proton-${i}`,
        [
          Number(mu[0]) || 0,
          Number(mu[1]) || 0,
          Number(mu[2]) || 0,
          Number(mu[3]) || 0,
        ],
        typeof lp.radius === "number" && lp.radius > 0 ? lp.radius : 0.5,
        density,
        rgb01(lp.color),
        {
          sourceEntityId,
          ...(opts.intentId ? { intentId: opts.intentId } : {}),
          ...(opts.worldId ? { worldId: opts.worldId } : {}),
          ...meta,
        },
      ),
    );
  }

  protons.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const fieldHash = createHash("sha256")
    .update(JSON.stringify(protons))
    .digest("hex");

  /** @type {import("./sceneToProtonField.js").ProtonField} */
  const field = {
    protons,
    fieldHash,
    entityIds,
    status: "enforced",
  };
  if (opts.intentId) field.intentId = opts.intentId;
  return field;
}

/**
 * WorldDocumentRt4d (or primitives bag) → ProtonField without SceneSpecification.
 * @param {unknown} worldDocument
 * @param {{ intentId?: string, worldId?: string, maxProtons?: number }} [opts]
 */
export function protonFieldFromWorldDocumentRt4d(worldDocument, opts = {}) {
  const legacy = fromWorldDocumentRt4d(worldDocument, opts);
  const worldId =
    opts.worldId ??
    (worldDocument &&
    typeof worldDocument === "object" &&
    typeof /** @type {Record<string, unknown>} */ (worldDocument).id === "string"
      ? /** @type {Record<string, unknown>} */ (worldDocument).id
      : undefined);
  return protonFieldFromLegacyProtons(legacy, {
    intentId: opts.intentId,
    worldId,
  });
}

/**
 * Judge-wow plate enricher — readable footprints + chromatic colors (deterministic).
 * Caps oversized halo/core so soft splat does not fog the frame.
 *
 * @param {import("./sceneToProtonField.js").ProtonField} field
 * @param {{
 *   radiusScale?: number,
 *   densityBoost?: number,
 *   colorGain?: number,
 *   maxRadius?: number,
 *   lightingPunch?: boolean,
 * }} [opts]
 * @returns {import("./sceneToProtonField.js").ProtonField}
 */
export function enrichJudgeWowField(field, opts = {}) {
  if (!field || !Array.isArray(field.protons)) {
    throw new Error("enrichJudgeWowField: ProtonField required");
  }
  const radiusScale =
    typeof opts.radiusScale === "number" && opts.radiusScale > 0
      ? opts.radiusScale
      : 1.55;
  const densityBoost =
    typeof opts.densityBoost === "number" && opts.densityBoost > 0
      ? opts.densityBoost
      : 1;
  const colorGain =
    typeof opts.colorGain === "number" && opts.colorGain > 0
      ? opts.colorGain
      : 1.35;
  const maxRadius =
    typeof opts.maxRadius === "number" && opts.maxRadius > 0
      ? opts.maxRadius
      : 0.72;
  const lightingPunch = opts.lightingPunch === true;

  /**
   * Deterministic vivid RGB from proton id (when material colors are near-white/gray).
   * @param {string} id
   * @returns {[number, number, number]}
   */
  function vividFromId(id) {
    let h = 2166136261;
    const s = String(id);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const hue = ((h >>> 0) % 360) / 360;
    const sat = 0.78;
    const val = 0.95;
    const i = Math.floor(hue * 6);
    const f = hue * 6 - i;
    const p = val * (1 - sat);
    const q = val * (1 - f * sat);
    const t = val * (1 - (1 - f) * sat);
    const table = [
      [val, t, p],
      [q, val, p],
      [p, val, t],
      [p, q, val],
      [t, p, val],
      [val, p, q],
    ];
    const rgb = table[i % 6];
    return [rgb[0], rgb[1], rgb[2]];
  }

  const protons = field.protons.map((p) => {
    const id = String(p.id || "");
    const isHalo = /halo/i.test(id);
    const isCore = /core/i.test(id);
    let radius = Math.max(0.1, (Number(p.radius) || 0.25) * radiusScale);
    if (isHalo) radius = Math.min(radius, 0.42);
    else if (isCore) radius = Math.min(radius, 0.55);
    radius = Math.min(maxRadius, radius);

    const c = Array.isArray(p.color) ? p.color : [0.7, 0.75, 0.85];
    const r0 = Number(c[0]) || 0;
    const g0 = Number(c[1]) || 0;
    const b0 = Number(c[2]) || 0;
    const chroma = Math.max(r0, g0, b0) - Math.min(r0, g0, b0);
    // Pale / near-white materials (e.g. [0.85,0.9,1]) must remap — otherwise
    // colorGain clips all channels to 1 and washes the plate to white.
    const nearGray = chroma < 0.18 || (r0 + g0 + b0) / 3 > 0.88;
    const base = nearGray ? vividFromId(id) : [r0, g0, b0];
    const boosted = [
      Math.min(1, base[0] * colorGain),
      Math.min(1, base[1] * colorGain),
      Math.min(1, base[2] * colorGain),
    ];
    if (isCore) {
      // Punch core brightness without fully erasing chroma from vivid remap.
      boosted[0] = Math.min(1, Math.max(boosted[0], lightingPunch ? 0.88 : 0.95));
      boosted[1] = Math.min(1, Math.max(boosted[1], lightingPunch ? 0.82 : 0.92));
      boosted[2] = Math.min(1, Math.max(boosted[2], lightingPunch ? 0.75 : 0.85));
      if (lightingPunch) {
        boosted[0] = Math.min(1, boosted[0] * 1.05);
        boosted[1] = Math.min(1, boosted[1] * 1.03);
        boosted[2] = Math.min(1, boosted[2] * 1.02);
      }
    }
    const densityMul = lightingPunch && isCore ? densityBoost * 1.12 : densityBoost;
    return {
      ...p,
      radius,
      density: Math.min(
        1,
        Math.max(0.65, (Number(p.density) || 1) * densityMul),
      ),
      color: /** @type {[number, number, number]} */ (boosted),
      metadata: {
        ...p.metadata,
        judgeWowEnriched: true,
        ...(lightingPunch ? { lightingPunch: true } : {}),
      },
    };
  });
  protons.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const fieldHash = createHash("sha256")
    .update(JSON.stringify(protons))
    .digest("hex");
  return {
    ...field,
    protons,
    fieldHash,
  };
}

/**
 * Shared Mod2–Mod6 path from an existing ProtonField.
 * @param {import("./sceneToProtonField.js").ProtonField} field0
 * @param {{
 *   intentId: string,
 *   width?: number,
 *   height?: number,
 *   worldId?: string,
 *   lights?: import("./lighting4d.js").Light4D[],
 *   camera?: import("./projectProtonField.js").Camera4DProton,
 *   cir?: import("./types.js").CirOverlay,
 *   skipLighting?: boolean,
 *   mod1Status?: string,
 *   supersample?: number,
 *   tonemap?: "none"|"reinhard"|"aces-lite",
 *   exposure?: number,
 *   gamma?: number,
 *   sigmaScale?: number,
 *   opacityScale?: number,
 *   qualityId?: string,
 * }} opts
 */
export function runProtonPipelineFromField(field0, opts) {
  if (!opts?.intentId) {
    throw new Error("runProtonPipelineFromField: intentId required");
  }
  if (!field0 || !Array.isArray(field0.protons)) {
    throw new Error("runProtonPipelineFromField: ProtonField required");
  }
  const outW = opts.width ?? 256;
  const outH = opts.height ?? 256;
  const ss = Math.max(1, Math.floor(Number(opts.supersample) || 1));
  const dims = renderDims(outW, outH, ss);
  const renderW = dims.width;
  const renderH = dims.height;
  const tonemapMode =
    opts.tonemap === "reinhard" ||
    opts.tonemap === "aces-lite" ||
    opts.tonemap === "none"
      ? opts.tonemap
      : "none";
  const exposure =
    typeof opts.exposure === "number" && Number.isFinite(opts.exposure)
      ? opts.exposure
      : 1;
  const gamma =
    typeof opts.gamma === "number" && opts.gamma > 0 ? opts.gamma : 2.2;
  const sigmaScale =
    typeof opts.sigmaScale === "number" && opts.sigmaScale > 0
      ? opts.sigmaScale
      : 1;
  const opacityScale =
    typeof opts.opacityScale === "number" && opts.opacityScale > 0
      ? opts.opacityScale
      : 1;

  const inv1 = assertProtonFieldInvariants(field0);
  if (!inv1.ok) {
    throw new Error(`Mod1 invariants: ${inv1.errors.join("; ")}`);
  }

  const field = opts.skipLighting
    ? field0
    : applyLighting4D(field0, opts.lights ?? []);

  const camera = defaultCamera4D({
    ...(opts.camera ?? {}),
    width: renderW,
    height: renderH,
    params: {
      ...(opts.camera?.params ?? {}),
      width: renderW,
      height: renderH,
    },
  });
  const projected = projectProtonField(field, camera);
  if (projected.protons.length + projected.dropped.length < field.protons.length) {
    throw new Error("Mod2 silent loss detected");
  }

  const rasterHi = rasterizeProtons(projected, {
    intentId: opts.intentId,
    worldId: opts.worldId,
    width: renderW,
    height: renderH,
    protonsHash: field.fieldHash,
    cir: opts.cir,
    sigmaScale,
    opacityScale,
  });

  // Tonemap float beauty BEFORE 8-bit encode (and before / with supersample downsample).
  const tonemapped = applyTonemap(rasterHi.beauty, {
    mode: tonemapMode,
    exposure,
    gamma,
  });
  let beauty =
    tonemapped instanceof Float32Array
      ? tonemapped
      : Float32Array.from(tonemapped);
  let depthSum = rasterHi.depthSum;
  let depthWeight = rasterHi.depthWeight;
  let normalSum = rasterHi.normalSum;
  let width = renderW;
  let height = renderH;

  if (ss > 1) {
    beauty = downsampleBox(beauty, renderW, renderH, outW, outH, 4);
    depthSum = downsampleBox(depthSum, renderW, renderH, outW, outH, 1);
    depthWeight = downsampleBox(depthWeight, renderW, renderH, outW, outH, 1);
    normalSum = downsampleBox(normalSum, renderW, renderH, outW, outH, 3);
    width = outW;
    height = outH;
  }

  const n = width * height;
  const rgba = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    rgba[idx] = Math.min(255, Math.max(0, Math.round(beauty[idx] * 255)));
    rgba[idx + 1] = Math.min(
      255,
      Math.max(0, Math.round(beauty[idx + 1] * 255)),
    );
    rgba[idx + 2] = Math.min(
      255,
      Math.max(0, Math.round(beauty[idx + 2] * 255)),
    );
    rgba[idx + 3] = Math.min(
      255,
      Math.max(0, Math.round(beauty[idx + 3] * 255)),
    );
  }
  const frameSha256 = createHash("sha256")
    .update(Buffer.from(rgba))
    .digest("hex");

  /** @type {import("./rasterizeProtons.js").ProtonRaster} */
  const raster = {
    width,
    height,
    beauty,
    depthSum,
    depthWeight,
    normalSum,
    rgba,
    evidence: {
      ...rasterHi.evidence,
      width,
      height,
      renderWidth: renderW,
      renderHeight: renderH,
      supersample: ss,
      tonemap: tonemapMode,
      exposure,
      gamma,
      sigmaScale,
      opacityScale,
      ...(opts.qualityId ? { qualityId: opts.qualityId } : {}),
      frameSha256,
    },
    status: "enforced",
  };

  const depth = depthFromRaster(raster);
  const inv4 = assertDepthFieldInvariants(depth);
  if (!inv4.ok) throw new Error(`Mod4: ${inv4.errors[0]}`);

  const normals = normalsFromRaster(raster);
  const inv5 = assertNormalFieldInvariants(normals);
  if (!inv5.ok) throw new Error(`Mod5: ${inv5.errors[0]}`);

  const image = rasterToImage(raster);

  return {
    field,
    projected,
    raster,
    depth,
    normals,
    image,
    evidence: {
      ...raster.evidence,
      fieldHash: field.fieldHash,
      droppedCount: projected.dropped.length,
      depthMin: depth.min,
      depthMax: depth.max,
      pngSha256: image.sha256,
      mods: {
        sceneToProtonField: opts.mod1Status ?? "from-field",
        lighting4d: opts.skipLighting ? "skipped" : "enforced",
        projectProtonField: "enforced",
        rasterizeProtons: "enforced",
        depthField: "enforced",
        normalField: "enforced",
        rasterToImage: "enforced",
        tonemap: tonemapMode === "none" && exposure === 1 ? "identity" : "enforced",
        supersample: ss > 1 ? "enforced" : "identity",
      },
    },
    legacyProtons: field.protons.map(protonToLegacy),
  };
}

/**
 * @param {unknown} sceneSpec
 * @param {{
 *   intentId: string,
 *   width?: number,
 *   height?: number,
 *   worldId?: string,
 *   lights?: import("./lighting4d.js").Light4D[],
 *   camera?: import("./projectProtonField.js").Camera4DProton,
 *   cir?: import("./types.js").CirOverlay,
 *   skipLighting?: boolean,
 * }} opts
 */
export function runProtonPipeline(sceneSpec, opts) {
  if (!opts?.intentId) {
    throw new Error("runProtonPipeline: intentId required");
  }

  const field0 = sceneToProtonField(sceneSpec, {
    intentId: opts.intentId,
    worldId: opts.worldId,
  });

  return runProtonPipelineFromField(field0, {
    ...opts,
    mod1Status: "enforced",
  });
}

/** Fixture SceneSpecification for demos/tests. */
export function demoSceneSpec() {
  return {
    kind: "SceneSpecification",
    version: "1.0",
    entities: [
      {
        id: "core",
        geometry: {
          kind: "hypersphere",
          center: [0, 0, 0, 0],
          radius: 0.55,
        },
        color: [1, 0.55, 0.2],
        density: 1,
      },
      {
        id: "sat-a",
        geometry: {
          kind: "hypersphere",
          center: [0.9, 0.2, 0.1, 0.3],
          radius: 0.28,
        },
        color: [0.3, 0.7, 1],
        density: 0.9,
      },
      {
        id: "beam",
        geometry: {
          kind: "oriented-capsule",
          a: [-0.8, -0.2, 0, 0],
          b: [0.8, 0.2, 0, 0.2],
          radius: 0.12,
        },
        color: [0.6, 1, 0.7],
        density: 0.75,
      },
      {
        id: "empty-ish",
        geometry: { kind: "empty" },
        color: [0.9, 0.9, 1],
      },
    ],
  };
}
