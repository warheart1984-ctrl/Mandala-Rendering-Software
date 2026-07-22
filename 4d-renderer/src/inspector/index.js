import { MeshPicker4D } from "../picking/MeshPicker4D.js";
import { Ray4D } from "../picking/Ray4D.js";
import {
  emptyInspectorResult,
  dropWProjectionMatrix,
  vec4,
} from "./types.js";
import {
  normalFromEdges,
  orthonormalTangentBasis,
  jacobianFromEdges,
  principalCurvatureStub,
  signedHyperplaneDistance,
  sub,
} from "./differential.js";
import { resultToWire, buildInspectorEvidenceBundle } from "./serialize.js";

/**
 * MRSInspector4D — skeleton inspector (MRS-IC v1.1).
 * Status: skeleton — curvature second forms not computed; BVH path optional.
 */
export class MRSInspector4D {
  constructor(options = {}) {
    this.mesh = options.mesh ?? null;
    this.picker = options.picker ?? (this.mesh ? new MeshPicker4D(this.mesh) : null);
    this.camera = options.camera ?? { d4: 4, d3: 4, scale: 80 };
    this.projectionMatrix = options.projectionMatrix ?? dropWProjectionMatrix();
    this.hyperplanes = options.hyperplanes ?? [];
    this.rotationPlanes = options.rotationPlanes ?? [
      {
        axisA: vec4(1, 0, 0, 0),
        axisB: vec4(0, 0, 0, 1),
        angle: 0,
        label: "x-w",
      },
    ];
    this.epsilon = options.epsilon ?? 1e-4;
  }

  inspectAtScreenPoint(sx, sy, width = 1, height = 1) {
    const ray = Ray4D.from2DMouse(sx * width, sy * height, width, height, this.camera);
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
    return this._fromTriangle(p, v0, v1, v2, primitiveId, []);
  }

  handleWireMessage(msg) {
    if (!msg || typeof msg !== "object") return { type: "inspect_result", ok: false, error: "bad_message" };
    if (msg.type === "inspect_screen") {
      return resultToWire(
        this.inspectAtScreenPoint(msg.sx ?? 0.5, msg.sy ?? 0.5, msg.width ?? 1, msg.height ?? 1),
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

  _fromMeshHit(hit, ray) {
    const face = hit.face;
    const v0 = this._vertex(face[0]);
    const v1 = this._vertex(face[1]);
    const v2 = this._vertex(face[2]);
    return this._fromTriangle(hit.point, v0, v1, v2, hit.faceIndex, []);
  }

  _fromTriangle(p, v0, v1, v2, faceIndex, bvhPath) {
    const e1 = sub(v1, v0);
    const e2 = sub(v2, v0);
    const n = normalFromEdges(e1, e2);
    const tangents = orthonormalTangentBasis(e1, e2, n);
    const out = emptyInspectorResult();
    out.ok = true;
    out.position = { ...p };
    out.normal4D = n;
    out.tangentBasis = tangents;
    out.curvature = principalCurvatureStub(tangents.t1, tangents.t2);
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

  /** Möller–Trumbore on XYZ; interpolate w. Used when MeshPicker4D 4D-cross misses planar faces. */
  _pickMeshSpatial(ray) {
    let best = null;
    const faces = this.mesh.faces;
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
    return best;
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
