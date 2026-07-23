import { Ray4D } from "./Ray4D.js";

export class MeshPicker4D {
  constructor(mesh, options = {}) {
    this.mesh = mesh;
    this.transformFn = options.transform ?? null;
  }

  pick(ray) {
    const verts = this.mesh.vertices;
    const faces = this.mesh.faces;
    let closestT = Infinity;
    let hitResult = null;

    for (let i = 0; i < faces.length; i++) {
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

    return hitResult;
  }

  _getVertex(index) {
    const v = this.mesh.vertices[index];
    if (this.transformFn) return this.transformFn(v);
    return v;
  }

  _rayTriangle4D(ray, v0, v1, v2) {
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
    const v2p = { x: p.x - v2.x, y: p.y - v2.y, z: p.z - v2.z, w: p.w - v2.w };

    const n1 = this._cross4D(e1, v0p);
    const n2 = this._cross4D(e2, v1p);
    const n3 = this._cross4D(
      { x: v0.x - v2.x, y: v0.y - v2.y, z: v0.z - v2.z, w: v0.w - v2.w },
      { x: v1.x - v2.x, y: v1.y - v2.y, z: v1.z - v2.z, w: v1.w - v2.w }
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

  _cross4D(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.w - a.w * b.z,
      z: a.w * b.x - a.x * b.w,
      w: a.x * b.y - a.y * b.x,
    };
  }

  updateMesh(mesh) {
    this.mesh = mesh;
  }
}
