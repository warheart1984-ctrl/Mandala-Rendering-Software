/**
 * Map WorldDocumentRt4d capsules / hyperspheres → Proton4D[].
 *
 * STATUS: **enforced** (isotropic MVP)
 * Accepts WorldRt4dPrimitive-shaped objects (kind hypersphere | oriented-capsule).
 * Does not touch HeadlessStillRenderer.
 */

import { MAX_PROTONS } from "./types.js";
import { fromHyperspheres } from "./fromHyperspheres.js";

/**
 * Collect primitive arrays from common WorldDocumentRt4d shapes.
 * @param {unknown} worldDocument
 * @returns {unknown[]}
 */
function collectPrimitives(worldDocument) {
  if (!worldDocument || typeof worldDocument !== "object") return [];
  const doc = /** @type {Record<string, unknown>} */ (worldDocument);
  if (Array.isArray(doc)) return doc;
  if (Array.isArray(doc.primitives)) return doc.primitives;
  if (doc.scene && typeof doc.scene === "object") {
    const scene = /** @type {Record<string, unknown>} */ (doc.scene);
    if (Array.isArray(scene.primitives)) return scene.primitives;
  }
  if (doc.rt4d && typeof doc.rt4d === "object") {
    const rt4d = /** @type {Record<string, unknown>} */ (doc.rt4d);
    if (Array.isArray(rt4d.primitives)) return rt4d.primitives;
  }
  if (Array.isArray(doc.entities)) {
    return doc.entities
      .map((e) => {
        if (!e || typeof e !== "object") return null;
        const ent = /** @type {Record<string, unknown>} */ (e);
        const geom = ent.geometry ?? ent;
        if (!geom || typeof geom !== "object") return null;
        const g = /** @type {Record<string, unknown>} */ (geom);
        if (g.kind === "hypersphere" || g.kind === "oriented-capsule") {
          return {
            ...g,
            id: ent.id ?? g.id,
            color: ent.color ?? g.color ?? g.albedo,
          };
        }
        return null;
      })
      .filter(Boolean);
  }
  return [];
}

/**
 * @param {unknown} worldDocument
 * @param {Record<string, unknown>} [opts]
 * @returns {import("./types.js").Proton4D[]}
 */
/**
 * Pull RGB from WorldRt4dPrimitive.rt4dMaterial when color/albedo absent.
 * @param {Record<string, unknown>} p
 * @returns {Record<string, unknown>}
 */
function enrichPrimitiveColor(p) {
  if (p.color != null || p.albedo != null) return p;
  const mat = p.rt4dMaterial;
  if (!mat || typeof mat !== "object") return p;
  const m = /** @type {Record<string, unknown>} */ (mat);
  const base = m.baseColor ?? m.albedo ?? m.color;
  if (base == null) return p;
  return { ...p, color: base };
}

export function fromWorldDocumentRt4d(worldDocument, opts = {}) {
  const prims = collectPrimitives(worldDocument);
  const filtered = prims
    .filter((p) => {
      if (!p || typeof p !== "object") return false;
      const kind = /** @type {Record<string, unknown>} */ (p).kind;
      return (
        kind === "hypersphere" ||
        kind === "oriented-capsule" ||
        kind == null // bare center/radius hyperspheres
      );
    })
    .map((p) => enrichPrimitiveColor(/** @type {Record<string, unknown>} */ (p)));
  const worldId =
    worldDocument &&
    typeof worldDocument === "object" &&
    typeof /** @type {Record<string, unknown>} */ (worldDocument).id === "string"
      ? /** @type {Record<string, unknown>} */ (worldDocument).id
      : opts.worldId;
  const protons = fromHyperspheres(filtered, {
    ...opts,
    maxProtons: opts.maxProtons ?? MAX_PROTONS,
    sampleCapsules: opts.sampleCapsules !== false,
  });
  if (worldId) {
    for (const p of protons) {
      p.meta = { ...(p.meta ?? {}), worldId };
    }
  }
  return protons;
}
