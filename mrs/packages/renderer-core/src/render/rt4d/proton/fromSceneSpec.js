/**
 * Map SceneSpecification entities → Proton4D[].
 *
 * STATUS: **enforced** (isotropic MVP)
 * Uses expandSurfaceToSpheres from scene-spec/convert.js.
 * Attaches intentId into proton meta.
 *
 * Note: expandSurfaceToPrimitives is not exported on this branch; surface
 * entities use the sphere soup expander (capsules tessellated to spheres).
 */

import { expandSurfaceToSpheres } from "../../../scene-spec/convert.js";
import { MAX_PROTONS } from "./types.js";
import { fromHyperspheres } from "./fromHyperspheres.js";

/**
 * @param {unknown} colorHex
 * @returns {[number, number, number]|undefined}
 */
function hexToRgb01(colorHex) {
  if (typeof colorHex !== "string" || !colorHex.startsWith("#")) return undefined;
  const h = colorHex.slice(1);
  if (h.length !== 6) return undefined;
  const n = Number.parseInt(h, 16);
  if (!Number.isFinite(n)) return undefined;
  return [
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
  ];
}

/**
 * @param {unknown} sceneSpec
 * @param {Record<string, unknown>} [opts]
 * @returns {import("./types.js").Proton4D[]}
 */
export function fromSceneSpec(sceneSpec, opts = {}) {
  if (!sceneSpec || typeof sceneSpec !== "object") return [];
  const spec = /** @type {Record<string, unknown>} */ (sceneSpec);
  const max =
    typeof opts.maxProtons === "number" && opts.maxProtons > 0
      ? Math.floor(opts.maxProtons)
      : MAX_PROTONS;
  const intentId =
    typeof opts.intentId === "string"
      ? opts.intentId
      : typeof spec.intentId === "string"
        ? spec.intentId
        : undefined;

  /** @type {unknown[]} */
  const raw = [];

  if (Array.isArray(spec.hyperspheres)) {
    for (const h of spec.hyperspheres) raw.push(h);
  }
  if (Array.isArray(spec.spheres)) {
    for (const s of spec.spheres) {
      raw.push({
        kind: "hypersphere",
        ...(s && typeof s === "object" ? s : {}),
      });
    }
  }

  const materials = Array.isArray(spec.materials) ? spec.materials : [];
  const matById = new Map(
    materials
      .filter((m) => m && typeof m === "object" && typeof m.id === "string")
      .map((m) => [m.id, m]),
  );

  for (const e of Array.isArray(spec.entities) ? spec.entities : []) {
    if (!e || typeof e !== "object") continue;
    const ent = /** @type {Record<string, unknown>} */ (e);
    const geom =
      ent.geometry && typeof ent.geometry === "object"
        ? /** @type {Record<string, unknown>} */ (ent.geometry)
        : {};
    const mat =
      (typeof ent.materialId === "string" && matById.get(ent.materialId)) ||
      materials[0];
    const color =
      hexToRgb01(
        mat && typeof mat === "object"
          ? /** @type {Record<string, unknown>} */ (mat).color
          : undefined,
      ) ??
      (Array.isArray(ent.color) ? ent.color : undefined);

    if (geom.kind === "hypersphere") {
      raw.push({
        kind: "hypersphere",
        id: ent.id,
        center: geom.center ?? geom.mu,
        mu: geom.mu ?? geom.center,
        radius: geom.radius ?? 0.5,
        color,
      });
      continue;
    }
    if (geom.kind === "oriented-capsule") {
      raw.push({
        kind: "oriented-capsule",
        id: ent.id,
        a: geom.a,
        b: geom.b,
        radius: geom.radius ?? 0.25,
        color,
      });
      continue;
    }
    if (geom.kind === "surface" && typeof geom.surfaceId === "string") {
      const transform4d =
        ent.transform4d && typeof ent.transform4d === "object"
          ? ent.transform4d
          : {};
      for (const s of expandSurfaceToSpheres(geom.surfaceId, transform4d)) {
        raw.push({
          kind: "hypersphere",
          center: s.center,
          radius: s.radius,
          id: ent.id ? `${ent.id}-${raw.length}` : undefined,
          color,
        });
      }
    }
  }

  if (typeof spec.surfaceId === "string" && raw.length === 0) {
    for (const s of expandSurfaceToSpheres(spec.surfaceId, {})) {
      raw.push({
        kind: "hypersphere",
        center: s.center,
        radius: s.radius,
      });
    }
  }

  return fromHyperspheres(raw, {
    ...opts,
    intentId,
    maxProtons: max,
    sampleCapsules: opts.sampleCapsules !== false,
  });
}
