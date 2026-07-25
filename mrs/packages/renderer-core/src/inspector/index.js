import { MeshPicker4D, BVH_FACE_THRESHOLD } from "../picking/MeshPicker4D.js";
import { Ray4D } from "../picking/Ray4D.js";
import { BVH4D } from "../render/rt4d/accel/BVH4D.js";
import { HyperBox } from "../render/rt4d/accel/HyperBox.js";
import { packBVH4D, traverseBVH4DPacked } from "../render/rt4d/accel/gpu/bvh4dPacked.js";
import {
  emptyInspectorResult,
  vec4,
} from "./types.js";
import {
  normalFromEdges,
  orthonormalTangentBasis,
  jacobianFromEdges,
  principalCurvatureStub,
  principalCurvatureReal,
  signedHyperplaneDistance,
  sub,
  computeMeshCurvature,
} from "./differential.js";
import { resultToWire, buildInspectorEvidenceBundle } from "./serialize.js";
import {
  createDefaultSceneBinding,
  resolveSceneBindMessage,
  sceneBoundWire,
  sceneStatusWire,
  DEFAULT_SCENE_ID,
} from "./sceneBind.js";

/**
 * MRSInspector4D — mesh inspect (MRS-IC).
 * Status: tested — discrete CPU curvature when topology allows; BVH pick for ≥32 faces.
 * Not GPU curvature. Scene bind wires local session mesh (not multi-user sync).
 */
export class MRSInspector4D {
  constructor(options = {}) {
    const defaults = createDefaultSceneBinding();
    this.mesh = options.mesh ?? defaults.mesh;
    this.picker = options.picker ?? (this.mesh ? new MeshPicker4D(this.mesh) : null);
    this.camera = options.camera ?? defaults.camera;
    this.projectionMatrix = options.projectionMatrix ?? defaults.projectionMatrix;
    this.hyperplanes = options.hyperplanes ?? defaults.hyperplanes;
    this.rotationPlanes = options.rotationPlanes ?? defaults.rotationPlanes;
    this.epsilon = options.epsilon ?? 1e-4;
    this.meshesRoot = options.meshesRoot ?? undefined;
    this.bvhThreshold = options.bvhThreshold ?? BVH_FACE_THRESHOLD;
    /** @type {{ nodeVisits: number, faceCount: number, usedBVH: boolean } | null} */
    this.lastPickStats = null;
    this._curvatureCache = null;
    this._spatialPacked = null;
    this._spatialPrims = null;
    this._rebuildSpatialAccel();
    this._rebuildCurvature();
    /** @type {import("./sceneBind.js").SceneBindingStatus} */
    this.sceneStatus =
      options.sceneStatus ??
      options.status ??
      (options.mesh
        ? {
            id: options.sceneId ?? "custom",
            source: options.sceneSource ?? "constructor",
            label: `scene: ${options.sceneId ?? "custom"}`,
            meshAssetId: options.meshAssetId ?? null,
            vertexCount: this.mesh?.vertices?.length ?? 0,
            faceCount: this.mesh?.faces?.length ?? 0,
            boundAt: Date.now(),
          }
        : defaults.status);
  }

  /** True when MeshPicker4D or spatial fallback holds a packed BVH. */
  hasBVH() {
    return Boolean(this.picker?.hasBVH?.() || this._spatialPacked?.length);
  }

  /** Current bind label for UI / logs (`scene: default_test_mesh` | `scene: unity_bound`). */
  getSceneLabel() {
    return this.sceneStatus?.label ?? `scene: ${DEFAULT_SCENE_ID}`;
  }

  getSceneStatus() {
    return { ...this.sceneStatus };
  }

  /**
   * Replace active inspect mesh + camera from a resolved binding.
   * Rebuilds MeshPicker4D. Status: binds local session scene — not production sync.
   */
  applySceneBinding(binding) {
    if (!binding?.mesh) return false;
    this.mesh = binding.mesh;
    this.picker = new MeshPicker4D(this.mesh, { bvhThreshold: this.bvhThreshold });
    this._rebuildSpatialAccel();
    this._rebuildCurvature();
    if (binding.camera) this.camera = { ...binding.camera };
    if (binding.projectionMatrix) {
      this.projectionMatrix = binding.projectionMatrix.map((row) => [...row]);
    }
    if (binding.hyperplanes) this.hyperplanes = binding.hyperplanes;
    if (binding.rotationPlanes) this.rotationPlanes = binding.rotationPlanes;
    this.sceneStatus = { ...binding.status };
    return true;
  }

  /**
   * Handle scene_push / scene_bind wire message.
   * @returns {object} scene_bound wire ack
   */
  bindSceneFromWire(msg) {
    const resolved = resolveSceneBindMessage(msg, { meshesRoot: this.meshesRoot });
    if (!resolved.ok) return sceneBoundWire(resolved.error, false);
    this.applySceneBinding(resolved.binding);
    return sceneBoundWire(this.sceneStatus, true);
  }

  /** Reset to labeled default test fixture. */
  resetToDefaultScene() {
    const defaults = createDefaultSceneBinding();
    this.applySceneBinding(defaults);
    this.sceneStatus = { ...defaults.status, boundAt: null };
    return sceneBoundWire(this.sceneStatus, true);
  }

  inspectAtScreenPoint(sx, sy, width = 1, height = 1, cameraOverride = null) {
    const cam = cameraOverride ?? this.camera;
    const ray = Ray4D.from2DMouse(sx * width, sy * height, width, height, cam);
    const out = this.inspectAtRay(ray.origin, ray.direction);
    if (out.ok) {
      out.screenInput = { sx, sy, width, height };
    }
    return out;
  }

  inspectAtRay(origin, direction) {
    const ray = new Ray4D(origin, direction);
    if (!this.mesh?.faces?.length) {
      const miss = emptyInspectorResult();
      miss.error = "no_picker";
      return miss;
    }
    let hit = this.picker?.pick(ray) ?? null;
    if (hit?.pickStats) this.lastPickStats = hit.pickStats;
    else if (this.picker?.lastPickStats) this.lastPickStats = this.picker.lastPickStats;
    if (!hit) hit = this._pickMeshSpatial(ray);
    if (!hit) {
      const miss = emptyInspectorResult();
      miss.error = "no_hit";
      return miss;
    }
    return this._fromMeshHit(hit, ray);
  }

  inspectPrimitive(primitiveId, localParams = vec4(0.5, 0.5, 0, 0)) {
    if (!this.mesh?.faces?.[primitiveId]) {
      const miss = emptyInspectorResult();
      miss.error = "unknown_primitive";
      return miss;
    }
    const face = this.mesh.faces[primitiveId];
    const v0 = this._vertex(face[0]);
    const v1 = this._vertex(face[1]);
    const v2 = this._vertex(face[2]);
    const u = localParams.x ?? 0.5;
    const v = localParams.y ?? 0.5;
    const w = Math.max(0, 1 - u - v);
    const p = vec4(
      v0.x * w + v1.x * u + v2.x * v,
      v0.y * w + v1.y * u + v2.y * v,
      v0.z * w + v1.z * u + v2.z * v,
      v0.w * w + v1.w * u + v2.w * v,
    );
    return this._fromTriangle(p, v0, v1, v2, primitiveId, [], { u, v, w });
  }

  handleWireMessage(msg) {
    if (!msg || typeof msg !== "object") return { type: "inspect_result", ok: false, error: "bad_message" };
    if (msg.type === "scene_push" || msg.type === "scene_bind") {
      return this.bindSceneFromWire(msg);
    }
    if (msg.type === "scene_status" || msg.type === "get_scene_status") {
      return sceneStatusWire(this.sceneStatus);
    }
    if (msg.type === "scene_reset") {
      return this.resetToDefaultScene();
    }
    if (msg.type === "inspect_screen") {
      const cam =
        msg.camera && typeof msg.camera === "object"
          ? {
              d4: Number(msg.camera.d4 ?? this.camera.d4),
              d3: Number(msg.camera.d3 ?? this.camera.d3),
              scale: Number(msg.camera.scale ?? this.camera.scale),
            }
          : null;
      return resultToWire(
        this.inspectAtScreenPoint(msg.sx ?? 0.5, msg.sy ?? 0.5, msg.width ?? 1, msg.height ?? 1, cam),
      );
    }
    if (msg.type === "inspect_ray") {
      const o = arrToVec4(msg.origin);
      const d = arrToVec4(msg.direction);
      return resultToWire(this.inspectAtRay(o, d));
    }
    if (msg.type === "inspect_primitive") {
      return resultToWire(
        this.inspectPrimitive(msg.primitiveId ?? 0, arrToVec4(msg.localParams)),
      );
    }
    return { type: "inspect_result", ok: false, error: "unknown_type" };
  }

  evidenceBundle(result, meta) {
    return buildInspectorEvidenceBundle(result, meta);
  }

  _rebuildCurvature() {
    this._curvatureCache = null;
    if (this.mesh?.vertices?.length && this.mesh?.faces?.length) {
      this._curvatureCache = computeMeshCurvature(this.mesh);
    }
  }

  _rebuildSpatialAccel() {
    this._spatialPacked = null;
    this._spatialPrims = null;
    const faces = this.mesh?.faces;
    if (!faces || faces.length < this.bvhThreshold) return;

    const prims = [];
    for (let i = 0; i < faces.length; i++) {
      const face = faces[i];
      const v0 = this._vertex(face[0]);
      const v1 = this._vertex(face[1]);
      const v2 = this._vertex(face[2]);
      prims.push({
        faceIndex: i,
        face,
        v0,
        v1,
        v2,
        getCenter() {
          return [
            (v0.x + v1.x + v2.x) / 3,
            (v0.y + v1.y + v2.y) / 3,
            (v0.z + v1.z + v2.z) / 3,
            (v0.w + v1.w + v2.w) / 3,
          ];
        },
        getBounds() {
          const box = new HyperBox();
          box.expand(v0);
          box.expand(v1);
          box.expand(v2);
          return box;
        },
      });
    }
    this._spatialPrims = prims;
    this._spatialPacked = packBVH4D(new BVH4D(prims));
  }

  _fromMeshHit(hit, ray) {
    const face = hit.face;
    const v0 = this._vertex(face[0]);
    const v1 = this._vertex(face[1]);
    const v2 = this._vertex(face[2]);
    const bvhPath = hit.pickStats?.usedBVH ? ["bvh"] : [];
    return this._fromTriangle(hit.point, v0, v1, v2, hit.faceIndex, bvhPath, hit.barycentric);
  }

  _fromTriangle(p, v0, v1, v2, faceIndex, bvhPath, bary = { u: 1 / 3, v: 1 / 3, w: 1 / 3 }) {
    const e1 = sub(v1, v0);
    const e2 = sub(v2, v0);
    const n = normalFromEdges(e1, e2);
    const tangents = orthonormalTangentBasis(e1, e2, n);
    const out = emptyInspectorResult();
    out.ok = true;
    out.position = { ...p };
    out.normal4D = n;
    out.tangentBasis = tangents;

    const discrete = this._curvatureCache?.sampleAtFace?.(faceIndex, bary);
    if (discrete && Number.isFinite(discrete.k1) && Number.isFinite(discrete.k2)) {
      out.curvature = principalCurvatureReal(tangents.t1, tangents.t2, discrete);
    } else {
      out.curvature = principalCurvatureStub(tangents.t1, tangents.t2);
    }

    out.jacobian = jacobianFromEdges(e1, e2);
    out.projectionMatrix = this.projectionMatrix.map((row) => [...row]);
    out.rotationPlanes = this.rotationPlanes.map((r) => ({ ...r, axisA: { ...r.axisA }, axisB: { ...r.axisB } }));
    out.hyperplanes = this.hyperplanes.map((h) => {
      const distance = signedHyperplaneDistance(p, h.normal, h.d);
      return {
        normal: { ...h.normal },
        d: h.d,
        distance,
        onPlane: Math.abs(distance) < this.epsilon,
      };
    });
    out.topology = this._topology(faceIndex);
    out.provenance = {
      primitiveId: faceIndex,
      faceIndex,
      bvhPath: [...bvhPath],
      pickStats: this.lastPickStats ? { ...this.lastPickStats } : null,
    };
    return out;
  }

  _topology(faceIndex) {
    const faces = this.mesh?.faces ?? [];
    const face = faces[faceIndex];
    if (!face) {
      return { incidentCellIds: [], neighborCellIds: [], isBoundary: false };
    }
    const set = new Set(face);
    const neighbors = [];
    for (let i = 0; i < faces.length; i++) {
      if (i === faceIndex) continue;
      const f = faces[i];
      let shared = 0;
      for (const idx of f) if (set.has(idx)) shared++;
      if (shared >= 2) neighbors.push(i);
    }
    return {
      incidentCellIds: [faceIndex],
      neighborCellIds: neighbors,
      isBoundary: neighbors.length < 3,
    };
  }

  _vertex(i) {
    const v = this.mesh.vertices[i];
    return vec4(v.x ?? v[0], v.y ?? v[1], v.z ?? v[2], v.w ?? v[3] ?? 0);
  }

  /**
   * Möller–Trumbore on XYZ; interpolate w.
   * ≥32 faces: packed BVH4D + traverseBVH4DPacked; else brute-force.
   */
  _pickMeshSpatial(ray) {
    const faces = this.mesh.faces;
    const faceCount = faces.length;
    if (this._spatialPacked?.length) {
      return this._pickBVH(ray, faceCount);
    }
    let best = null;
    for (let i = 0; i < faces.length; i++) {
      const face = faces[i];
      const v0 = this._vertex(face[0]);
      const v1 = this._vertex(face[1]);
      const v2 = this._vertex(face[2]);
      const hit = this._mollerTrumboreXYZ(ray, v0, v1, v2);
      if (hit && (!best || hit.t < best.t)) {
        best = { ...hit, faceIndex: i, face };
      }
    }
    this.lastPickStats = { nodeVisits: faceCount, faceCount, usedBVH: false };
    if (best) best.pickStats = { ...this.lastPickStats };
    return best;
  }

  _pickBVH(ray, faceCount) {
    const stats = { nodeVisits: 0, faceCount, usedBVH: true };
    const prims = this._spatialPrims;
    const hit = traverseBVH4DPacked(
      this._spatialPacked,
      ray,
      (primId) => {
        const prim = prims[primId];
        if (!prim) return null;
        const tri = this._mollerTrumboreXYZ(ray, prim.v0, prim.v1, prim.v2);
        if (!tri) return null;
        return { ...tri, faceIndex: prim.faceIndex, face: prim.face };
      },
      { stats },
    );
    this.lastPickStats = stats;
    if (!hit) return null;
    return { ...hit, pickStats: { ...stats } };
  }

  _mollerTrumboreXYZ(ray, v0, v1, v2) {
    const EPS = 1e-8;
    const o = ray.origin;
    const d = ray.direction;
    const e1x = v1.x - v0.x, e1y = v1.y - v0.y, e1z = v1.z - v0.z;
    const e2x = v2.x - v0.x, e2y = v2.y - v0.y, e2z = v2.z - v0.z;
    const hx = d.y * e2z - d.z * e2y;
    const hy = d.z * e2x - d.x * e2z;
    const hz = d.x * e2y - d.y * e2x;
    const a = e1x * hx + e1y * hy + e1z * hz;
    if (Math.abs(a) < EPS) return null;
    const f = 1 / a;
    const sx = o.x - v0.x, sy = o.y - v0.y, sz = o.z - v0.z;
    const u = f * (sx * hx + sy * hy + sz * hz);
    if (u < 0 || u > 1) return null;
    const qx = sy * e1z - sz * e1y;
    const qy = sz * e1x - sx * e1z;
    const qz = sx * e1y - sy * e1x;
    const v = f * (d.x * qx + d.y * qy + d.z * qz);
    if (v < 0 || u + v > 1) return null;
    const t = f * (e2x * qx + e2y * qy + e2z * qz);
    if (t < EPS) return null;
    const w = 1 - u - v;
    return {
      t,
      point: vec4(
        v0.x * w + v1.x * u + v2.x * v,
        v0.y * w + v1.y * u + v2.y * v,
        v0.z * w + v1.z * u + v2.z * v,
        v0.w * w + v1.w * u + v2.w * v,
      ),
      barycentric: { u, v, w },
      distance: t,
    };
  }
}

function arrToVec4(a) {
  if (!a) return vec4();
  if (Array.isArray(a)) return vec4(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, a[3] ?? 0);
  return vec4(a.x ?? 0, a.y ?? 0, a.z ?? 0, a.w ?? 0);
}

export { resultToWire, buildInspectorEvidenceBundle, resultToJSON, vecToArr } from "./serialize.js";
export { emptyInspectorResult, dropWProjectionMatrix } from "./types.js";
export { createDefaultInspectorTestMesh } from "./defaultTestMesh.js";
export {
  createDefaultSceneBinding,
  resolveSceneBindMessage,
  loadMeshAsset,
  defaultMeshesRoot,
  DEFAULT_SCENE_ID,
  sceneBoundWire,
  sceneStatusWire,
} from "./sceneBind.js";
export {
  buildEdgeAdjacency,
  gaussianCurvature,
  meanCurvatureVector,
  meanCurvatureScalar,
  principalFromKH,
  computeMeshCurvature,
} from "./discreteGeometry.js";
export {
  principalCurvatureStub,
  principalCurvatureReal,
} from "./differential.js";
export { BVH_FACE_THRESHOLD } from "../picking/MeshPicker4D.js";
