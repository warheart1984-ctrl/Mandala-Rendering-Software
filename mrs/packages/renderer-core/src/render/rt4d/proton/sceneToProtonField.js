/**
 * CECP Mod 1 — Scene→ProtonField
 *
 * STATUS: **enforced**
 *
 * Proton { id, center∈R⁴, radius, density, color, metadata }
 * Every SceneSpecification.entities[] entry → ≥1 proton.
 * No orphan protons (every proton.metadata.sourceEntityId ∈ entity ids,
 *   or sourceEntityId === "__scene__" for top-level hyperspheres only).
 * Deterministic: stable entity order + stable ids.
 */

import { createHash } from "node:crypto";
import { expandSurfaceToSpheres } from "../../../scene-spec/convert.js";
import { MAX_PROTONS, resolveMu } from "./types.js";

/**
 * @typedef {object} Proton
 * @property {string} id
 * @property {[number, number, number, number]} center
 * @property {number} radius
 * @property {number} density
 * @property {[number, number, number]} color
 * @property {Record<string, unknown>} metadata
 */

/**
 * @typedef {object} ProtonField
 * @property {Proton[]} protons
 * @property {string} fieldHash
 * @property {string[]} entityIds
 * @property {string} [intentId]
 * @property {string} status
 */

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
 * Canonical JSON for hashing.
 * @param {unknown} value
 */
function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k]);
    return out;
  }
  return value;
}

/**
 * @param {string} id
 * @param {[number, number, number, number]} center
 * @param {number} radius
 * @param {number} density
 * @param {[number, number, number]} color
 * @param {Record<string, unknown>} metadata
 * @returns {Proton}
 */
export function makeProton(id, center, radius, density, color, metadata) {
  return {
    id: String(id),
    center: [
      Number(center[0]) || 0,
      Number(center[1]) || 0,
      Number(center[2]) || 0,
      Number(center[3]) || 0,
    ],
    radius: typeof radius === "number" && radius > 0 ? radius : 0.5,
    density: typeof density === "number" && density >= 0 ? density : 1,
    color: rgb01(color),
    metadata: metadata && typeof metadata === "object" ? { ...metadata } : {},
  };
}

/**
 * Map Proton → legacy Proton4D shape (mu + opacity).
 * @param {Proton} p
 */
export function protonToLegacy(p) {
  return {
    id: p.id,
    mu: p.center,
    center: p.center,
    radius: p.radius,
    color: p.color,
    opacity: Math.min(1, Math.max(0, p.density)),
    meta: p.metadata,
  };
}

/**
 * SceneSpecification → ProtonField (Mod 1).
 *
 * @param {unknown} sceneSpec
 * @param {{ intentId?: string, maxProtons?: number, worldId?: string }} [opts]
 * @returns {ProtonField}
 */
export function sceneToProtonField(sceneSpec, opts = {}) {
  if (!sceneSpec || typeof sceneSpec !== "object") {
    throw new Error("sceneToProtonField: sceneSpec object required");
  }
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

  const materials = Array.isArray(spec.materials) ? spec.materials : [];
  const matById = new Map(
    materials
      .filter((m) => m && typeof m === "object" && typeof m.id === "string")
      .map((m) => [m.id, m]),
  );

  /** @type {Proton[]} */
  const protons = [];
  /** @type {string[]} */
  const entityIds = [];

  /**
   * @param {string} entityId
   * @param {unknown} color
   * @param {[number, number, number, number]} center
   * @param {number} radius
   * @param {number} density
   * @param {Record<string, unknown>} [extraMeta]
   */
  function pushProton(entityId, color, center, radius, density, extraMeta = {}) {
    if (protons.length >= max) return;
    const idx = protons.filter((p) => p.metadata.sourceEntityId === entityId)
      .length;
    const id =
      idx === 0 ? String(entityId) : `${entityId}#${idx}`;
    protons.push(
      makeProton(id, center, radius, density, rgb01(color), {
        sourceEntityId: entityId,
        ...(intentId ? { intentId } : {}),
        ...(opts.worldId ? { worldId: opts.worldId } : {}),
        ...extraMeta,
      }),
    );
  }

  const entities = Array.isArray(spec.entities) ? spec.entities : [];
  for (let ei = 0; ei < entities.length; ei++) {
    const e = entities[ei];
    if (!e || typeof e !== "object") continue;
    const ent = /** @type {Record<string, unknown>} */ (e);
    const entityId =
      typeof ent.id === "string" && ent.id.length > 0
        ? ent.id
        : `entity-${ei}`;
    entityIds.push(entityId);

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
      (Array.isArray(ent.color) ? ent.color : undefined) ??
      [0.85, 0.9, 1];
    const density =
      typeof ent.density === "number"
        ? ent.density
        : typeof geom.density === "number"
          ? geom.density
          : 1;

    let emitted = 0;
    const before = protons.length;

    if (geom.kind === "hypersphere") {
      const mu = resolveMu({
        mu: geom.mu ?? geom.center,
        center: geom.center ?? geom.mu,
      }) ?? [0, 0, 0, 0];
      pushProton(
        entityId,
        color,
        mu,
        typeof geom.radius === "number" ? geom.radius : 0.5,
        density,
        { geomKind: "hypersphere" },
      );
    } else if (geom.kind === "oriented-capsule") {
      const a = Array.isArray(geom.a) ? geom.a : [0, 0, 0, 0];
      const b = Array.isArray(geom.b) ? geom.b : [0, 0, 0.5, 0];
      const radius =
        typeof geom.radius === "number" && geom.radius > 0 ? geom.radius : 0.25;
      for (const t of [0, 0.5, 1]) {
        const center = [
          Number(a[0]) + (Number(b[0]) - Number(a[0])) * t,
          Number(a[1]) + (Number(b[1]) - Number(a[1])) * t,
          Number(a[2]) + (Number(b[2]) - Number(a[2])) * t,
          (Number(a[3]) || 0) +
            ((Number(b[3]) || 0) - (Number(a[3]) || 0)) * t,
        ];
        pushProton(entityId, color, /** @type {[number,number,number,number]} */ (center), radius, density, {
          geomKind: "oriented-capsule",
          sampleT: t,
        });
      }
    } else if (geom.kind === "surface" && typeof geom.surfaceId === "string") {
      const transform4d =
        ent.transform4d && typeof ent.transform4d === "object"
          ? ent.transform4d
          : {};
      const spheres = expandSurfaceToSpheres(geom.surfaceId, transform4d);
      for (const s of spheres) {
        if (protons.length >= max) break;
        const c = Array.isArray(s.center)
          ? s.center
          : [0, 0, 0, 0];
        pushProton(
          entityId,
          color,
          [
            Number(c[0]) || 0,
            Number(c[1]) || 0,
            Number(c[2]) || 0,
            Number(c[3]) || 0,
          ],
          typeof s.radius === "number" ? s.radius : 0.2,
          density,
          { geomKind: "surface", surfaceId: geom.surfaceId },
        );
      }
    }

    emitted = protons.length - before;
    // Guarantee ≥1 proton per entity (no silent entity drop)
    if (emitted === 0) {
      pushProton(entityId, color, [0, 0, 0, 0], 0.35, density, {
        geomKind: geom.kind ?? "fallback",
        fallback: true,
      });
    }
  }

  // Top-level hyperspheres (no entity) — tagged __scene__, not orphans of entities
  if (Array.isArray(spec.hyperspheres)) {
    for (let i = 0; i < spec.hyperspheres.length; i++) {
      if (protons.length >= max) break;
      const h = spec.hyperspheres[i];
      if (!h || typeof h !== "object") continue;
      const hs = /** @type {Record<string, unknown>} */ (h);
      const mu = resolveMu(hs) ?? [0, 0, 0, 0];
      pushProton(
        "__scene__",
        hs.color,
        mu,
        typeof hs.radius === "number" ? hs.radius : 0.5,
        typeof hs.density === "number" ? hs.density : 1,
        { geomKind: "hypersphere", sceneLevel: true, index: i },
      );
    }
  }

  // Sort by id for determinism
  protons.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const fieldHash = createHash("sha256")
    .update(canonicalJson(protons))
    .digest("hex");

  /** @type {ProtonField} */
  const field = {
    protons,
    fieldHash,
    entityIds: [...entityIds],
    status: "enforced",
  };
  if (intentId) field.intentId = intentId;
  return field;
}

/**
 * Invariant checks for Mod 1.
 * @param {ProtonField} field
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function assertProtonFieldInvariants(field) {
  /** @type {string[]} */
  const errors = [];
  if (!field || !Array.isArray(field.protons)) {
    return { ok: false, errors: ["missing protons"] };
  }
  const entitySet = new Set(field.entityIds ?? []);
  const covered = new Set();
  for (const p of field.protons) {
    const sid = p?.metadata?.sourceEntityId;
    if (typeof sid !== "string") {
      errors.push(`orphan proton ${p?.id}: missing sourceEntityId`);
      continue;
    }
    if (sid !== "__scene__" && entitySet.size > 0 && !entitySet.has(sid)) {
      errors.push(`orphan proton ${p.id}: sourceEntityId ${sid} not in entities`);
    }
    if (sid !== "__scene__") covered.add(sid);
  }
  for (const eid of entitySet) {
    if (!covered.has(eid)) {
      errors.push(`entity ${eid} has no protons`);
    }
  }
  return { ok: errors.length === 0, errors };
}
