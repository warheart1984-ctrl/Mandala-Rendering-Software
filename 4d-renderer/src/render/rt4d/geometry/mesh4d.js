import { vec4, sub, dot, length, normalize, cross4D } from "../math/vec4.js";

export class Mesh4D {
  constructor(vertices, faces) {
    this.vertices = vertices;
    this.faces = faces;
    this._bvh = null;
  }

  static fromSamples(surfaceFn, uSteps = 16, vSteps = 16, wSteps = 16) {
    const verts = [];
    const idx = (i, j, k) => i * (vSteps + 1) * (wSteps + 1) + j * (wSteps + 1) + k;

    for (let i = 0; i <= uSteps; i++) {
      const u = (i / uSteps) * 2 * Math.PI;
      for (let j = 0; j <= vSteps; j++) {
        const v = (j / vSteps) * Math.PI;
        for (let k = 0; k <= wSteps; k++) {
          const w = (k / wSteps) * 2 * Math.PI;
          verts.push(surfaceFn(u, v, w));
        }
      }
    }

    const faces = [];
    for (let i = 0; i < uSteps; i++) {
      for (let j = 0; j < vSteps; j++) {
        for (let k = 0; k < wSteps; k++) {
          const a = idx(i, j, k), b = idx(i + 1, j, k);
          const c = idx(i + 1, j + 1, k), d = idx(i, j + 1, k);
          const e = idx(i, j, k + 1), f = idx(i + 1, j, k + 1);
          const g = idx(i + 1, j + 1, k + 1), h = idx(i, j + 1, k + 1);
          faces.push([a, b, c, d]);
          faces.push([e, f, g, h]);
          faces.push([a, b, f, e]);
          faces.push([c, d, h, g]);
          faces.push([a, d, h, e]);
          faces.push([b, c, g, f]);
        }
      }
    }

    return new Mesh4D(verts, faces);
  }
}

export class HyperTriangle {
  constructor(v0, v1, v2) {
    this.v0 = v0; this.v1 = v1; this.v2 = v2;
    const e1 = sub(v1, v0), e2 = sub(v2, v0);
    this.normal = normalize(cross4D(e1, e2, vec4(0, 0, 0, 0)));
  }

  intersect(ray) {
    const e1 = sub(this.v1, this.v0);
    const e2 = sub(this.v2, this.v0);
    const pVec = cross4D(ray.direction, e2, vec4(0, 0, 0, 0));
    const det = dot(e1, pVec);
    if (Math.abs(det) < 1e-9) return null;
    const invDet = 1 / det;
    const tVec = sub(ray.origin, this.v0);
    const u = dot(tVec, pVec) * invDet;
    if (u < 0 || u > 1) return null;
    const qVec = cross4D(tVec, e1, vec4(0, 0, 0, 0));
    const v = dot(ray.direction, qVec) * invDet;
    if (v < 0 || u + v > 1) return null;
    const t = dot(e2, qVec) * invDet;
    if (t < ray.tMin || t > ray.tMax) return null;
    const pos = vec4(
      ray.origin.x + t * ray.direction.x,
      ray.origin.y + t * ray.direction.y,
      ray.origin.z + t * ray.direction.z,
      ray.origin.w + t * ray.direction.w,
    );
    return { t, position: pos, normal: this.normal, materialId: "mesh" };
  }
}
