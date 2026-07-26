/**
 * Optional adapter: Engine3D bridge scene document → RT4D Hypersphere list
 * (bounded) OR deterministic headless receipt.
 *
 * Status: **partial**
 *   - Document → hypersphere descriptors: implemented (no path-trace here)
 *   - Headless receipt hash: implemented
 *   - Full PathTracer4D integration from Engine3D: **declared**
 *
 * Does NOT change Genblaze default still path (`scripts/render-still.mjs`).
 * Consume via `ENGINE3D_FRAME=1` / explicit import only.
 */

import { createHash } from "node:crypto";

/**
 * @typedef {{
 *   kind: string,
 *   id: string,
 *   center: number[],
 *   radius: number,
 *   source?: string,
 *   materialHint?: string
 * }} BridgePrimitive
 */

/**
 * @typedef {{
 *   schemaVersion: string,
 *   frameIndex: number,
 *   seed: number,
 *   primitives: BridgePrimitive[],
 *   camera: object,
 *   lattice: object,
 *   mappingNotes?: object
 * }} Engine3DBridgeScene
 */

const MAX_PRIMITIVES_FOR_RT4D = 128;

/** Stable JSON for hashing (sorted object keys). */
export function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && Object.is(value, -0)) return 0;
    return value;
  }
  if (Array.isArray(value)) return value.map(sortKeys);
  const out = {};
  for (const k of Object.keys(value).sort()) {
    out[k] = sortKeys(value[k]);
  }
  return out;
}

export function hashBridgeScene(scene) {
  return createHash("sha256").update(canonicalJson(scene)).digest("hex").slice(0, 16);
}

/**
 * Map bridge primitives to RT4D-oriented hypersphere descriptors.
 * Caps count; skips non-sphere kinds beyond the cap.
 * Does not construct PathTracer4D / Scene4D (avoids pulling full integrator in unit tests).
 *
 * @param {Engine3DBridgeScene} scene
 * @param {{ maxPrimitives?: number }} [opts]
 */
export function bridgeSceneToHypersphereDescriptors(scene, opts = {}) {
  const max = opts.maxPrimitives ?? MAX_PRIMITIVES_FOR_RT4D;
  const prims = Array.isArray(scene?.primitives) ? scene.primitives : [];
  const out = [];
  let skippedInvalid = 0;
  let capReached = false;
  for (let i = 0; i < prims.length; i++) {
    if (out.length >= max) {
      capReached = true;
      break;
    }
    const p = prims[i];
    if (!p || !Array.isArray(p.center) || p.center.length < 3) {
      skippedInvalid += 1;
      continue;
    }
    const r = typeof p.radius === "number" && p.radius > 0 ? p.radius : 0.1;
    out.push({
      id: String(p.id ?? `p${i}`),
      center: [
        Number(p.center[0]) || 0,
        Number(p.center[1]) || 0,
        Number(p.center[2]) || 0,
        Number(p.center[3]) || 0,
      ],
      radius: r,
      materialHint: p.materialHint ?? "surf",
      source: p.source ?? "unknown",
    });
  }
  return {
    status: "partial",
    note: "Hypersphere approximations only; triangle meshes declared unsupported",
    hyperspheres: out,
    /** True only when MAX / maxPrimitives cap stopped further mapping. */
    truncated: capReached,
    /** Primitives skipped for missing/short center (not a cap hit). */
    skippedInvalid,
  };
}

/**
 * Deterministic headless receipt for CI (no PNG).
 * @param {Engine3DBridgeScene} scene
 * @param {object} [evidence]
 */
export function renderEngine3dFrameReceipt(scene, evidence = {}) {
  const sceneHash = hashBridgeScene(scene);
  const body = {
    schemaVersion: "engine3d-frame-receipt/1.0",
    mode: "null-headless",
    sceneHash,
    evidenceHash: createHash("sha256")
      .update(canonicalJson(evidence))
      .digest("hex")
      .slice(0, 16),
    primitiveCount: Array.isArray(scene?.primitives) ? scene.primitives.length : 0,
    hypersphereCount: bridgeSceneToHypersphereDescriptors(scene).hyperspheres.length,
    imageStatus: "not_rendered_headless",
  };
  return {
    ...body,
    receiptHash: createHash("sha256").update(canonicalJson(body)).digest("hex").slice(0, 16),
  };
}
