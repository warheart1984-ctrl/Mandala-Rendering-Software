/**
 * Convert SceneSpecification → WorldDocument (PLP) + RT4D render descriptor.
 * Deterministic: same spec → same output (P4).
 */

import { createHash } from "node:crypto";
import { normalizeSurfaceId } from "./validate.js";

/**
 * Canonical JSON for hashing (sorted keys, no whitespace variance).
 * @param {unknown} value
 */
export function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      out[k] = sortKeys(value[k]);
    }
    return out;
  }
  return value;
}

/** @param {unknown} spec */
export function hashSceneSpecification(spec) {
  return createHash("sha256").update(canonicalJson(spec)).digest("hex");
}

/** FNV-1a uint32 from string — stable seed fallback. */
export function hashIdToSeed(text) {
  let h = 0x811c9dc5;
  const s = String(text ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hexToAlbedo(hex) {
  if (typeof hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return [0.55, 0.72, 0.92];
  }
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Expand a surfaceId (+ transform) into RT4D hypersphere centers/radii.
 * @param {string} surfaceId
 * @param {object} [transform4d]
 */
export function expandSurfaceToSpheres(surfaceId, transform4d = {}) {
  const sid = normalizeSurfaceId(surfaceId) ?? surfaceId;
  const translate = transform4d.translate ?? [0, 0, 0, 0];
  const scale = transform4d.scale ?? [1, 1, 1, 1];
  const rotate = transform4d.rotate ?? {};
  const sx = scale[0] ?? 1;

  /** Apply translate only here; rotation is applied as a scene-level note for RT4D
   *  (hypersphere centers are rotated in convert via rotatePoint4d). */
  const spheres = [];

  const push = (x, y, z, w, r) => {
    spheres.push({
      center: [x, y, z, w],
      radius: Math.max(1e-4, r * Math.abs(sx)),
    });
  };

  switch (sid) {
    case "tesseract": {
      const s = 0.9;
      for (let i = 0; i < 16; i++) {
        push(
          (i & 1 ? s : -s),
          (i & 2 ? s : -s) + 0.1,
          i & 4 ? s : -s,
          i & 8 ? s : -s,
          0.28,
        );
      }
      break;
    }
    case "lattice-grid": {
      const spacing = 1.15;
      for (let ix = -1; ix <= 1; ix++) {
        for (let iz = -1; iz <= 1; iz++) {
          push(ix * spacing, 0.1, iz * spacing, ((ix + iz) & 1) * 0.5, 0.34);
        }
      }
      break;
    }
    case "torus-ring":
    case "clifford-torus": {
      const count = 14;
      const R = 1.65;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        push(Math.cos(a) * R, 0.15, Math.sin(a) * R, 0.45 * Math.sin(a * 2), 0.34);
      }
      break;
    }
    case "orbital-cluster": {
      const count = 6;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const r = 1.7;
        push(Math.cos(a) * r, 0.1, Math.sin(a) * r, 0.3 * Math.sin(a), 0.5);
      }
      push(0, 0.1, 0, 0, 0.7);
      break;
    }
    case "hopf-surface":
    case "trefoil-4d":
    case "torus-3d":
    case "central-orb":
    default: {
      push(0, 0.1, 0, 0, 1.15);
      break;
    }
  }

  // Apply SO(4) plane rotations (same order as PLP: XY→XZ→XW→YZ→YW→ZW) then translate.
  return spheres.map((sp) => {
    let p = rotatePoint4d(sp.center, rotate);
    p = [
      p[0] + translate[0],
      p[1] + translate[1],
      p[2] + translate[2],
      p[3] + translate[3],
    ];
    return { center: p, radius: sp.radius };
  });
}

const PLANE_ORDER = ["xy", "xz", "xw", "yz", "yw", "zw"];

/** @param {number[]} p @param {Record<string, number>} rotate */
export function rotatePoint4d(p, rotate) {
  let [x, y, z, w] = p;
  for (const plane of PLANE_ORDER) {
    const angle = rotate[plane];
    if (!angle) continue;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    switch (plane) {
      case "xy": {
        const nx = c * x - s * y;
        const ny = s * x + c * y;
        x = nx;
        y = ny;
        break;
      }
      case "xz": {
        const nx = c * x - s * z;
        const nz = s * x + c * z;
        x = nx;
        z = nz;
        break;
      }
      case "xw": {
        const nx = c * x - s * w;
        const nw = s * x + c * w;
        x = nx;
        w = nw;
        break;
      }
      case "yz": {
        const ny = c * y - s * z;
        const nz = s * y + c * z;
        y = ny;
        z = nz;
        break;
      }
      case "yw": {
        const ny = c * y - s * w;
        const nw = s * y + c * w;
        y = ny;
        w = nw;
        break;
      }
      case "zw": {
        const nz = c * z - s * w;
        const nw = s * z + c * w;
        z = nz;
        w = nw;
        break;
      }
      default:
        break;
    }
  }
  return [x, y, z, w];
}

/**
 * @param {object} spec — validated SceneSpecification
 * @returns {{
 *   worldDocument: object,
 *   rt4d: object,
 *   specHash: string,
 *   seed: number
 * }}
 */
export function convertSceneSpecification(spec) {
  const specHash = hashSceneSpecification(spec);
  const seed =
    spec.output?.seed != null && Number.isFinite(Number(spec.output.seed))
      ? Number(spec.output.seed) >>> 0
      : hashIdToSeed(spec.id);

  const materials = Array.isArray(spec.materials)
    ? spec.materials.map((m) => ({
        id: m.id,
        color: m.color,
        opacity: m.opacity,
        wireframe: m.wireframe,
      }))
    : [];

  // PLP WorldDocument: map hypersphere/hyperplane → empty + userData (mesh path
  // still uses surface entities). Keep surface entities as-is.
  const worldEntities = (spec.entities ?? []).map((e) => {
    const geom = e.geometry ?? { kind: "empty" };
    if (geom.kind === "hypersphere" || geom.kind === "hyperplane") {
      return {
        ...e,
        geometry: { kind: "empty" },
        userData: { ...(e.userData ?? {}), rt4dPrimitive: geom },
      };
    }
    return {
      id: e.id,
      name: e.name,
      transform4d: e.transform4d,
      geometry: geom,
      materialId: e.materialId,
      tags: e.tags,
      userData: e.userData,
    };
  });

  const worldDocument = {
    schemaVersion: "1.0",
    id: spec.id,
    name: spec.name,
    description: spec.description,
    units: spec.units,
    materials,
    entities: worldEntities.length
      ? worldEntities
      : [{ id: "empty", geometry: { kind: "empty" } }],
    defaultObservation: spec.defaultObservation ?? {
      modeId: "perspective_w",
      params: { d4: 4 },
    },
    metadata: {
      ...(spec.metadata ?? {}),
      sceneSpecHash: specHash,
      kind: "SceneSpecification",
    },
  };

  const matById = new Map(materials.map((m) => [m.id, m]));
  const defaultAlbedo = hexToAlbedo(materials[0]?.color);
  const primitives = [];
  const planes = [];

  for (const e of spec.entities ?? []) {
    const geom = e.geometry ?? { kind: "empty" };
    const mat = e.materialId ? matById.get(e.materialId) : materials[0];
    const albedo = hexToAlbedo(mat?.color) ?? defaultAlbedo;
    const materialType = mat?.wireframe ? "lambertian" : "lambertian";

    if (geom.kind === "hypersphere") {
      const center = geom.center
        ? rotatePoint4d(geom.center, e.transform4d?.rotate ?? {})
        : rotatePoint4d([0, 0, 0, 0], e.transform4d?.rotate ?? {});
      const t = e.transform4d?.translate ?? [0, 0, 0, 0];
      primitives.push({
        kind: "hypersphere",
        center: [
          center[0] + t[0],
          center[1] + t[1],
          center[2] + t[2],
          center[3] + t[3],
        ],
        radius: geom.radius ?? 0.5,
        albedo,
        materialType,
        materialId: e.materialId ?? mat?.id ?? "surf",
        entityId: e.id,
      });
    } else if (geom.kind === "hyperplane") {
      planes.push({
        kind: "hyperplane",
        normal: geom.normal ?? [0, 1, 0, 0],
        offset: geom.offset ?? -1.4,
        albedo: hexToAlbedo(mat?.color ?? "#525666"),
        materialId: e.materialId ?? "ground",
        entityId: e.id,
      });
    } else if (geom.kind === "surface") {
      const spheres = expandSurfaceToSpheres(geom.surfaceId, e.transform4d);
      for (const sp of spheres) {
        primitives.push({
          kind: "hypersphere",
          center: sp.center,
          radius: sp.radius,
          albedo,
          materialType,
          materialId: e.materialId ?? mat?.id ?? "surf",
          entityId: e.id,
        });
      }
    }
  }

  // Default ground plane if none specified
  if (planes.length === 0) {
    planes.push({
      kind: "hyperplane",
      normal: [0, 1, 0, 0],
      offset: -1.4,
      albedo: [0.32, 0.34, 0.4],
      materialId: "ground",
      entityId: "_ground",
    });
  }

  const lights = Array.isArray(spec.lights)
    ? spec.lights.map((L) => ({
        id: L.id,
        center: L.center,
        radius: L.radius,
        emission: L.emission ?? [17, 16, 14.5],
      }))
    : [
        {
          id: "keylight",
          center: [2.4, 3.3, -1.6, 0.7],
          radius: 0.95,
          emission: [17, 16, 14.5],
        },
      ];

  const camera = spec.camera
    ? {
        position4d: spec.camera.position4d ?? [0, 1.4, 4.3, 0],
        target4d: spec.camera.target4d ?? [0, 0.1, 0, 0],
        fovX: spec.camera.fovX ?? 52,
        fovY: spec.camera.fovY ?? 52,
        fovZ: spec.camera.fovZ ?? 45,
        fovW: spec.camera.fovW ?? 28,
      }
    : null;

  const output = {
    width: spec.output?.width ?? 448,
    height: spec.output?.height ?? 448,
    samples: spec.output?.samples ?? 24,
    maxDepth: spec.output?.maxDepth ?? 5,
    exposure: spec.output?.exposure ?? 1.35,
    seed,
  };

  const rt4d = {
    primitives,
    planes,
    lights,
    camera,
    output,
    paletteAlbedo: defaultAlbedo,
    observation: worldDocument.defaultObservation,
  };

  return { worldDocument, rt4d, specHash, seed };
}
