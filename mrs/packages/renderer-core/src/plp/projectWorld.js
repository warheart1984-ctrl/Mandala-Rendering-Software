/**
 * PLP v1 — thin projectWorld stub.
 *
 * Status: skeleton. Returns Scene3D-shaped + lineage stubs.
 * Does NOT claim full PLP conformance or host-ready meshes for all geometry kinds.
 *
 * Spec: docs/4d-engine/v1/plp/PLP_V1.md
 */

import { project4Dto3D } from "../math/project.js";
import { getSurface, sampleSurface, surfaces } from "../surfaces/index.js";

/** @typedef {{ modeId: string, params?: Record<string, number>, label?: string }} ObservationMode */

/**
 * Apply observation to a 4D point → 3D.
 * @param {{x:number,y:number,z:number,w:number}} p
 * @param {ObservationMode} mode
 */
function observePoint(p, mode) {
  const params = mode.params ?? {};
  const modeId = mode.modeId ?? "perspective_w";
  switch (modeId) {
    case "drop_w":
      return { x: p.x, y: p.y, z: p.z, visible: true };
    case "scale_by_w": {
      const s = params.s ?? 0.25;
      const k = 1 + s * p.w;
      return { x: p.x * k, y: p.y * k, z: p.z * k, visible: true };
    }
    case "offset_y_by_w": {
      const s = params.s ?? 1;
      return { x: p.x, y: p.y + s * p.w, z: p.z, visible: true };
    }
    case "slice_hyperplane":
      // Skeleton: fall through to perspective; full clip is roadmap.
      return project4Dto3D(p, params.d4 ?? 4);
    case "perspective_w":
    default:
      return project4Dto3D(p, params.d4 ?? 4);
  }
}

function applyTranslateScale(p, transform4d) {
  const t = transform4d?.translate ?? [0, 0, 0, 0];
  const s = transform4d?.scale ?? [1, 1, 1, 1];
  return {
    x: (p.x ?? 0) * s[0] + t[0],
    y: (p.y ?? 0) * s[1] + t[1],
    z: (p.z ?? 0) * s[2] + t[2],
    w: (p.w ?? 0) * s[3] + t[3],
  };
}

function resolveSurfaceId(surfaceId) {
  if (!surfaceId) return null;
  if (surfaces[surfaceId]) return surfaceId;
  // Scene4DDTO-style underscore aliases → core ids (minimal map)
  const aliases = {
    clifford_torus: "clifford-torus",
    hopf_surface: "hopf-surface",
    trefoil_4d: "trefoil-4d",
    torus_3d: "torus-3d",
  };
  return aliases[surfaceId] ?? surfaceId;
}

/**
 * Project a WorldDocument-like object to Scene3D + LineageBundle.
 * @param {object} world
 * @param {ObservationMode} [mode]
 * @returns {{ status: "skeleton", scene3D: object, lineageBundle: object }}
 */
export function projectWorld(world, mode) {
  const observation = mode ??
    world?.defaultObservation ?? { modeId: "perspective_w", params: { d4: 4 } };

  const meshes = [];
  const nodes = [];
  const entries = [];
  const materials = Array.isArray(world?.materials)
    ? world.materials.map((m) => ({
        id: m.id,
        color: m.color,
        opacity: m.opacity,
        wireframe: m.wireframe,
      }))
    : [];

  const entities = Array.isArray(world?.entities) ? world.entities : [];

  for (const entity of entities) {
    const nodeId = `node.${entity.id}`;
    const geom = entity.geometry ?? { kind: "empty" };
    let meshId = null;

    if (geom.kind === "surface" && geom.surfaceId) {
      const coreId = resolveSurfaceId(geom.surfaceId);
      try {
        if (surfaces[coreId]) {
          const surface = getSurface(coreId);
          const resolution = Math.min(geom.resolution ?? 16, 32);
          const sampled = sampleSurface(surface, resolution);
          const positions = [];
          for (const v of sampled.vertices ?? []) {
            const p4 = applyTranslateScale(v, entity.transform4d);
            const p3 = observePoint(p4, observation);
            if (p3.visible === false) continue;
            positions.push(p3.x, p3.y, p3.z);
          }
          const indices = [];
          for (const face of sampled.faces ?? []) {
            if (face.length >= 3) indices.push(face[0], face[1], face[2]);
          }
          meshId = `mesh.${entity.id}`;
          meshes.push({
            id: meshId,
            positions,
            indices: indices.length ? indices : undefined,
            primitive: indices.length ? "triangles" : "points",
          });
        }
      } catch {
        // Leave empty mesh; lineage still records attempt.
        meshId = `mesh.${entity.id}.empty`;
        meshes.push({ id: meshId, positions: [], primitive: "points" });
      }
    }

    nodes.push({
      id: nodeId,
      name: entity.name ?? entity.id,
      meshId: meshId ?? undefined,
      materialId: entity.materialId,
      meta: { status: "skeleton", sourceEntityId: entity.id },
    });

    entries.push({
      projectedNodeId: nodeId,
      sourceEntityId: entity.id,
      geometryKind: geom.kind,
      notes: "PLP stub — skeleton projection",
    });
  }

  const scene3D = {
    schemaVersion: "1.0",
    id: `scene3d.${world?.id ?? "unknown"}`,
    nodes,
    meshes,
    materials,
    meta: { plpStatus: "skeleton" },
  };

  const lineageBundle = {
    schemaVersion: "1.0",
    worldId: world?.id ?? "unknown",
    observation: {
      modeId: observation.modeId,
      params: observation.params ?? {},
    },
    entries,
    status: "skeleton",
  };

  return { status: "skeleton", scene3D, lineageBundle };
}

export default projectWorld;
