import { Ray4D } from "./Ray4D.js";
import { BVH4D } from "../render/rt4d/accel/BVH4D.js";
import { HyperBox } from "../render/rt4d/accel/HyperBox.js";
import { packBVH4D, traverseBVH4DPacked } from "../render/rt4d/accel/gpu/bvh4dPacked.js";

/** Meshes with this many faces (or more) use packed BVH4D picking. */
export const BVH_FACE_THRESHOLD = 32;

function toVec4(v) {
  if (!v) return { x: 0, y: 0, z: 0, w: 0 };
  if (Array.isArray(v)) return { x: v[0] ?? 0, y: v[1] ?? 0, z: v[2] ?? 0, w: v[3] ?? 0 };
  return { x: v.x ?? 0, y: v.y ?? 0, z: v.z ?? 0, w: v.w ?? 0 };
}

/**
 * MeshPicker4D — triangle pick with optional BVH acceleration.
 * Status: tested — ≥32 faces uses BVH4D + traverseBVH4DPacked; <32 brute-force.
 */
export class MeshPicker4D {
  constructor(mesh, options = {}) {
    this.mesh = mesh;
    this.transformFn = options.transform ?? null;
    this.bvhThreshold = options.bvhThreshold ?? BVH_FACE_THRESHOLD;
    /** @type {{ nodeVisits: number, faceCount: number, usedBVH: boolean } | null} */
    this.lastPickStats = null;
    this._bvh = null;
    this._packed = null;
    this._prims = null;
    this._rebuildAccel();
  }

  hasBVH() {
    return Array.isArray(this._packed) && this._packed.length > 0;
  }

  updateMesh(mesh) {
    this.mesh = mesh;
    this._rebuildAccel();
  }

  _rebuildAccel() {
    this._bvh = null;
    this._packed = null;
    this._prims = null;
    const faces = this.mesh?.faces;
    if (!faces || faces.length < this.bvhThreshold) return;

    const prims = [];
    for (let i = 0; i < faces.length; i++) {
      const face = faces[i];
      const v0 = this._getVertex(face[0]);
      const v1 = this._getVertex(face[1]);
      const v2 = this._getVertex(face[2]);
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
    this._prims = prims;
    this._bvh = new BVH4D(prims);
    this._packed = packBVH4D(this._bvh);
  }

  pick(ray) {
    const faceCount = this.mesh?.faces?.length ?? 0;
    if (this.hasBVH()) {
      return this._pickBVH(ray, faceCount);
    }
    return this._pickBrute(ray, faceCount);
  }

  _pickBVH(ray, faceCount) {
    const stats = { nodeVisits: 0, faceCount, usedBVH: true };
    const prims = this._prims;
    const hit = traverseBVH4DPacked(
      this._packed,
      ray,
      (primId) => {
        const prim = prims[primId];
        if (!prim) return null;
        const tri = this._rayTriangle4D(ray, prim.v0, prim.v1, prim.v2);
        if (!tri) return null;
        return {
          t: tri.t,
          point: tri.point,
          barycentric: tri.barycentric,
          faceIndex: prim.faceIndex,
          face: prim.face,
          distance: tri.t,
        };
      },
      { stats },
    );
    this.lastPickStats = stats;
    if (!hit) return null;
    return {
      t: hit.t,
      point: hit.point,
      barycentric: hit.barycentric,
      faceIndex: hit.faceIndex,
      face: hit.face,
      distance: hit.distance ?? hit.t,
      pickStats: { ...stats },
    };
  }

  _pickBrute(ray, faceCount) {
    const faces = this.mesh.faces;
    let closestT = Infinity;
    let hitResult = null;
    let faceTests = 0;

    for (let i = 0; i < faces.length; i++) {
      faceTests++;
      const face = faces[i];
      const v0 = this._getVertex(face[0]);
      const v1 = this._getVertex(face[1]);
      const v2 = this._getVertex(face[2]);

      const hit = this._rayTriangle4D(ray, v0, v1, v2);
      if (hit && hit.t < closestT && hit.t > 0) {
        closestT = hit.t;
        hitResult = {
          t: hit.t,
          point: hit.point,
          barycentric: hit.barycentric,
          faceIndex: i,
          face,
          distance: hit.t,
        };
      }
    }

    this.lastPickStats = { nodeVisits: faceTests, faceCount, usedBVH: false };
    if (hitResult) hitResult.pickStats = { ...this.lastPickStats };
    return hitResult;
  }

  _getVertex(index) {
    const v = this.mesh.vertices[index];
    const raw = toVec4(v);
    if (this.transformFn) return this.transformFn(raw);
    return raw;
  }

  _rayTriangle4D(ray, v0, v1, v2) {
    const hit4 = this._rayTriangle4DCross(ray, v0, v1, v2);
    if (hit4) return hit4;
    // Planar XYZ faces often miss the 4D-cross test — fall back to Möller–Trumbore.
    return this._mollerTrumboreXYZ(ray, v0, v1, v2);
  }

  _rayTriangle4DCross(ray, v0, v1, v2) {
    const e1 = { x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z, w: v1.w - v0.w };
    const e2 = { x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z, w: v2.w - v0.w };

    const n = this._cross4D(e1, e2);
    const ndotDir = n.x * ray.direction.x + n.y * ray.direction.y + n.z * ray.direction.z + n.w * ray.direction.w;

    if (Math.abs(ndotDir) < 1e-9) return null;

    const to = { x: ray.origin.x - v0.x, y: ray.origin.y - v0.y, z: ray.origin.z - v0.z, w: ray.origin.w - v0.w };
    const t = -(n.x * to.x + n.y * to.y + n.z * to.z + n.w * to.w) / ndotDir;
    if (t < 0) return null;

    const p = ray.pointAt(t);

    const v0p = { x: p.x - v0.x, y: p.y - v0.y, z: p.z - v0.z, w: p.w - v0.w };
    const v1p = { x: p.x - v1.x, y: p.y - v1.y, z: p.z - v1.z, w: p.w - v1.w };

    const n1 = this._cross4D(e1, v0p);
    const n2 = this._cross4D(e2, v1p);
    const n3 = this._cross4D(
      { x: v0.x - v2.x, y: v0.y - v2.y, z: v0.z - v2.z, w: v0.w - v2.w },
      { x: v1.x - v2.x, y: v1.y - v2.y, z: v1.z - v2.z, w: v1.w - v2.w },
    );

    const d1 = n1.x * n.x + n1.y * n.y + n1.z * n.z + n1.w * n.w;
    const d2 = n2.x * n.x + n2.y * n.y + n2.z * n.z + n2.w * n.w;
    const d3 = n3.x * n.x + n3.y * n.y + n3.z * n.z + n3.w * n.w;

    if (d1 < 0 || d2 < 0 || d3 < 0) return null;

    const nLen2 = n.x * n.x + n.y * n.y + n.z * n.z + n.w * n.w;
    const denom = nLen2 || 1;
    const u = d1 / denom;
    const v = d2 / denom;
    const w = 1 - u - v;

    return { t, point: p, barycentric: { u, v, w } };
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
      point: {
        x: v0.x * w + v1.x * u + v2.x * v,
        y: v0.y * w + v1.y * u + v2.y * v,
        z: v0.z * w + v1.z * u + v2.z * v,
        w: v0.w * w + v1.w * u + v2.w * v,
      },
      barycentric: { u, v, w },
    };
  }

  _cross4D(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.w - a.w * b.z,
      z: a.w * b.x - a.x * b.w,
      w: a.x * b.y - a.y * b.x,
    };
  }
}
