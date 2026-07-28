/**
 * TriangleMesh4D — first-class triangle mesh primitive for RT4D path tracing.
 *
 * Wraps SkinnedMeshIntersector (which already has Moller-Trumbore, per-mesh BVH,
 * normal/UV interpolation) and adds the getBounds()/getCenter() methods that
 * Scene4D.build() needs to place the mesh in the top-level BVH4D.
 *
 * HONEST SCOPE:
 *   - Meshes live in 3D (x,y,z) with w=0 (same as SkinnedMeshIntersector).
 *   - The top-level BVH4D is 4D; the mesh's AABB extends across all 4 axes
 *     (w is always 0, so the w extent is zero — but HyperBox needs min/max).
 *   - Per-triangle material slots are supported via materialSlots[].
 *   - Normal interpolation, UV mapping, and texture lookup all work through
 *     the existing PathTracer4D → Scene4D → TextureShading pipeline.
 */

import { vec4, min, max, add, scale } from "../math/vec4.js";
import { SkinnedMeshIntersector } from "../intersection/SkinnedMeshIntersector.js";

/**
 * Read a vertex from a flat or nested array.
 * Supports: [[x,y,z,w], ...]  or  [x,y,z, x,y,z, ...]  or  [x,y,z, ...] (w=0).
 */
function readVertex(vertices, index) {
  if (Array.isArray(vertices[index])) {
    const v = vertices[index];
    return vec4(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0);
  }
  const o = index * 3;
  return vec4(vertices[o] ?? 0, vertices[o + 1] ?? 0, vertices[o + 2] ?? 0, 0);
}

export class TriangleMesh4D {
  /**
   * @param {object} options
   * @param {Array|Float32Array} options.vertices  - Flat [x,y,z, x,y,z,...] or nested [[x,y,z],...]
   * @param {Array|Uint32Array}  options.indices   - Triangle indices [i0,i1,i2, ...]
 * @param {Array|Float32Array} [options.normals] - Per-vertex normals (same layout as vertices)
 * @param {Array|Float32Array} [options.uvs]     - Per-vertex UVs [u,v, u,v,...] or [[u,v],...]
 * @param {Array|Float32Array} [options.colors]  - Per-vertex colors [r,g,b, r,g,b,...] or [[r,g,b],...]
 * @param {Array|Float32Array} [options.tangents] - Per-vertex tangents (4 components)
   * @param {string}             [options.materialId] - Default material for all triangles
   * @param {Array<string>}      [options.materialSlots] - Per-triangle material override
   * @param {Float32Array|Array} [options.instanceMatrix] - 4×4 column-major local→world
   * @param {Float32Array|Array} [options.inverseInstanceMatrix] - inverse of above
   * @param {string}             [options.localBvhKey] - Cache key for shared BVH
   */
  constructor(options = {}) {
    this.kind = "triangle-mesh";
    this.vertices = options.vertices ?? [];
    this.indices = options.indices ?? [];
    this.normals = options.normals ?? null;
    this.uvs = options.uvs ?? null;
    this.colors = options.colors ?? null;
    this.tangents = options.tangents ?? null;
    this.materialId = options.materialId ?? "default";
    this.materialSlots = options.materialSlots ?? null;
    this.instanceMatrix = options.instanceMatrix ?? null;
    this.inverseInstanceMatrix = options.inverseInstanceMatrix ?? null;
    this.localBvhKey = options.localBvhKey ?? null;

    // Build the SkinnedMeshIntersector (handles per-mesh BVH + intersection).
    this._intersector = new SkinnedMeshIntersector(this);

    // Precompute AABB and centroid (cached, only built once).
    this._bounds = null;
    this._center = null;
    this._computeBounds();
  }

  /** Compute AABB and centroid from vertices. */
  _computeBounds() {
    const verts = this.vertices;
    const idx = this.indices;
    if (!verts.length || !idx.length) {
      this._bounds = { min: vec4(0, 0, 0, 0), max: vec4(0, 0, 0, 0) };
      this._center = [0, 0, 0, 0];
      return;
    }

    const bmin = vec4(Infinity, Infinity, Infinity, Infinity);
    const bmax = vec4(-Infinity, -Infinity, -Infinity, -Infinity);
    let cx = 0, cy = 0, cz = 0, cw = 0;
    let count = 0;

    // Track unique vertex indices so centroid is over unique vertices, not repeated.
    const seen = new Set();
    for (let i = 0; i < idx.length; i++) {
      const vi = idx[i];
      if (seen.has(vi)) continue;
      seen.add(vi);

      const v = readVertex(verts, vi);
      bmin.x = Math.min(bmin.x, v.x);
      bmin.y = Math.min(bmin.y, v.y);
      bmin.z = Math.min(bmin.z, v.z);
      bmin.w = Math.min(bmin.w, v.w);
      bmax.x = Math.max(bmax.x, v.x);
      bmax.y = Math.max(bmax.y, v.y);
      bmax.z = Math.max(bmax.z, v.z);
      bmax.w = Math.max(bmax.w, v.w);
      cx += v.x;
      cy += v.y;
      cz += v.z;
      cw += v.w;
      count++;
    }

    this._bounds = { min: bmin, max: bmax };
    const inv = 1 / (count || 1);
    this._center = [cx * inv, cy * inv, cz * inv, cw * inv];
  }

  /** AABB for top-level BVH4D. */
  getBounds() {
    return this._bounds;
  }

  /** Centroid for BVH splitting. */
  getCenter() {
    return this._center;
  }

  /** Ray-mesh intersection (delegates to SkinnedMeshIntersector). */
  intersect(ray) {
    return this._intersector.intersect(ray);
  }
}

/**
 * Factory function for creating a TriangleMesh4D with a clean API.
 *
 * @example
 *   const mesh = triangleMesh({
 *     vertices: [0,0,0, 1,0,0, 0.5,1,0],
 *     indices: [0, 1, 2],
 *     materialId: "gold",
 *   });
 *   scene.addPrimitive(mesh, "gold");
 */
export function triangleMesh(options) {
  return new TriangleMesh4D(options);
}
