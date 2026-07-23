/**
 * 4D triangle clipping against a hyperplane.
 *
 * Given a triangle (v0, v1, v2) and a hyperplane H = { x | n·x = d },
 * clip the triangle to the half-space n·x ≤ d (inside).
 *
 * Returns an array of triangles (0-2) that lie entirely inside.
 */

import { signedDistance, edgeIntersect, edgeIntersectT } from "./hyperplane.js";

const EPSILON = 1e-10;

/**
 * Clip a single 4D triangle against a hyperplane.
 * @param {import('./hyperplane.js').Hyperplane} plane
 * @param {{x,y,z,w}} v0
 * @param {{x,y,z,w}} v1
 * @param {{x,y,z,w}} v2
 * @returns {Array<[{x,y,z,w},{x,y,z,w},{x,y,z,w}]>} clipped triangles (0-2)
 */
export function clipTriangle(plane, v0, v1, v2) {
  const d0 = signedDistance(plane, v0);
  const d1 = signedDistance(plane, v1);
  const d2 = signedDistance(plane, v2);

  const inside0 = d0 <= EPSILON;
  const inside1 = d1 <= EPSILON;
  const inside2 = d2 <= EPSILON;

  const count = (inside0 ? 1 : 0) + (inside1 ? 1 : 0) + (inside2 ? 1 : 0);

  switch (count) {
    case 3:
      // All inside — keep entire triangle
      return [[v0, v1, v2]];

    case 0:
      // All outside — discard
      return [];

    case 1: {
      // One inside, two outside → triangle
      if (inside0) {
        const i1 = edgeIntersect(plane, v0, v1);
        const i2 = edgeIntersect(plane, v0, v2);
        return [[v0, i1, i2]];
      }
      if (inside1) {
        const i0 = edgeIntersect(plane, v1, v0);
        const i2 = edgeIntersect(plane, v1, v2);
        return [[i0, v1, i2]];
      }
      // inside2
      const i0 = edgeIntersect(plane, v2, v0);
      const i1 = edgeIntersect(plane, v2, v1);
      return [[i0, i1, v2]];
    }

    case 2: {
      // Two inside, one outside → quadrilateral (split into 2 triangles)
      if (!inside0) {
        // v0 is outside
        const i01 = edgeIntersect(plane, v0, v1);
        const i02 = edgeIntersect(plane, v0, v2);
        return [
          [i01, v1, v2],
          [i01, v2, i02],
        ];
      }
      if (!inside1) {
        // v1 is outside
        const i10 = edgeIntersect(plane, v1, v0);
        const i12 = edgeIntersect(plane, v1, v2);
        return [
          [v0, i10, v2],
          [i10, i12, v2],
        ];
      }
      // v2 is outside
      const i20 = edgeIntersect(plane, v2, v0);
      const i21 = edgeIntersect(plane, v2, v1);
      return [
        [v0, v1, i20],
        [v1, i21, i20],
      ];
    }

    default:
      return [];
  }
}

/**
 * Clip an entire mesh against a hyperplane.
 * @param {import('./hyperplane.js').Hyperplane} plane
 * @param {Array<{x,y,z,w}>} vertices
 * @param {Array<[number,number,number]>} faces - triangle index triples
 * @returns {{ vertices: Array<{x,y,z,w}>, faces: Array<[number,number,number]> }}
 */
export function clipMesh(plane, vertices, faces) {
  const newVertices = [];
  const newFaces = [];

  // Index map for deduplication of intersection points
  const intersectionCache = new Map();

  function getOrCreateIntersection(v0Idx, v1Idx) {
    const key = v0Idx < v1Idx ? `${v0Idx}-${v1Idx}` : `${v1Idx}-${v0Idx}`;
    if (intersectionCache.has(key)) {
      return intersectionCache.get(key);
    }
    const idx = newVertices.length;
    newVertices.push(edgeIntersect(plane, vertices[v0Idx], vertices[v1Idx]));
    intersectionCache.set(key, idx);
    return idx;
  }

  for (const [i0, i1, i2] of faces) {
    const v0 = vertices[i0];
    const v1 = vertices[i1];
    const v2 = vertices[i2];

    const d0 = signedDistance(plane, v0);
    const d1 = signedDistance(plane, v1);
    const d2 = signedDistance(plane, v2);

    const inside0 = d0 <= EPSILON;
    const inside1 = d1 <= EPSILON;
    const inside2 = d2 <= EPSILON;

    const count = (inside0 ? 1 : 0) + (inside1 ? 1 : 0) + (inside2 ? 1 : 0);

    switch (count) {
      case 3: {
        // All inside
        const base = newVertices.length;
        newVertices.push(v0, v1, v2);
        newFaces.push([base, base + 1, base + 2]);
        break;
      }

      case 1: {
        // One inside, two outside → triangle
        const base = newVertices.length;
        if (inside0) {
          newVertices.push(v0);
          newVertices.push(edgeIntersect(plane, v0, v1));
          newVertices.push(edgeIntersect(plane, v0, v2));
        } else if (inside1) {
          newVertices.push(edgeIntersect(plane, v1, v0));
          newVertices.push(v1);
          newVertices.push(edgeIntersect(plane, v1, v2));
        } else {
          newVertices.push(edgeIntersect(plane, v2, v0));
          newVertices.push(edgeIntersect(plane, v2, v1));
          newVertices.push(v2);
        }
        newFaces.push([base, base + 1, base + 2]);
        break;
      }

      case 2: {
        // Two inside, one outside → two triangles
        if (!inside0) {
          const i01 = edgeIntersect(plane, v0, v1);
          const i02 = edgeIntersect(plane, v0, v2);
          const base = newVertices.length;
          newVertices.push(i01, v1, v2, i02);
          newFaces.push([base, base + 1, base + 2]);
          newFaces.push([base, base + 2, base + 3]);
        } else if (!inside1) {
          const i10 = edgeIntersect(plane, v1, v0);
          const i12 = edgeIntersect(plane, v1, v2);
          const base = newVertices.length;
          newVertices.push(v0, i10, i12, v2);
          newFaces.push([base, base + 1, base + 3]);
          newFaces.push([base + 1, base + 2, base + 3]);
        } else {
          const i20 = edgeIntersect(plane, v2, v0);
          const i21 = edgeIntersect(plane, v2, v1);
          const base = newVertices.length;
          newVertices.push(v0, v1, i21, i20);
          newFaces.push([base, base + 1, base + 2]);
          newFaces.push([base, base + 2, base + 3]);
        }
        break;
      }

      // count === 0: all outside, discard
    }
  }

  return { vertices: newVertices, faces: newFaces };
}

/**
 * Clip a mesh and also compute edges from the clipped faces.
 */
export function clipMeshWithEdges(plane, vertices, faces) {
  const { vertices: newVerts, faces: newFaces } = clipMesh(plane, vertices, faces);

  // Extract unique edges from faces
  const edgeSet = new Set();
  for (const [i, j, k] of newFaces) {
    addEdge(edgeSet, i, j);
    addEdge(edgeSet, j, k);
    addEdge(edgeSet, k, i);
  }

  const edges = [...edgeSet].map((s) => {
    const [a, b] = s.split(",").map(Number);
    return [a, b];
  });

  return { vertices: newVerts, faces: newFaces, edges };
}

function addEdge(edgeSet, a, b) {
  const key = a < b ? `${a},${b}` : `${b},${a}`;
  edgeSet.add(key);
}
