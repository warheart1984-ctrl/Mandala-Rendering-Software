/**
 * Unit tesseract (hypercube) mesh — discrete 4D geometry used by the
 * constitutional browser demo (not a continuous parametric surface).
 *
 * 16 vertices ∈ {−1,+1}⁴, 32 Hamming-distance-1 edges.
 */

export const tesseract = {
  name: "Unit Tesseract",
  id: "tesseract",
  /** Marker: sampleSurface uses sample() instead of u/v grid. */
  discrete: true,
  defaultResolution: 1,

  /**
   * @returns {{ vertices: Array<{x,y,z,w}>, faces: Array<[number,number,number]>, edges: Array<[number,number]> }}
   */
  sample() {
    const vertices = [];
    for (const x of [-1, 1]) {
      for (const y of [-1, 1]) {
        for (const z of [-1, 1]) {
          for (const w of [-1, 1]) {
            vertices.push({ x, y, z, w });
          }
        }
      }
    }

    const edges = [];
    for (let i = 0; i < vertices.length; i++) {
      for (let j = i + 1; j < vertices.length; j++) {
        let diff = 0;
        if (vertices[i].x !== vertices[j].x) diff++;
        if (vertices[i].y !== vertices[j].y) diff++;
        if (vertices[i].z !== vertices[j].z) diff++;
        if (vertices[i].w !== vertices[j].w) diff++;
        if (diff === 1) edges.push([i, j]);
      }
    }

    // 24 square 2-faces → 48 triangles for solid draw (projected 4D→3D).
    const faces = buildTesseractFaces(vertices);
    return { vertices, faces, edges };
  },
};

/** Index of vertex with exact ±1 coords. */
function vertIndex(vertices, x, y, z, w) {
  return vertices.findIndex(
    (v) => v.x === x && v.y === y && v.z === z && v.w === w,
  );
}

/**
 * Each pair of free axes + each assignment of the other two axes
 * yields a square; emit two triangles.
 */
function buildTesseractFaces(vertices) {
  const faces = [];
  const vals = [-1, 1];
  for (let d1 = 0; d1 < 4; d1++) {
    for (let d2 = d1 + 1; d2 < 4; d2++) {
      const fixed = [0, 1, 2, 3].filter((d) => d !== d1 && d !== d2);
      for (const f0 of vals) {
        for (const f1 of vals) {
          const corners = [];
          for (const a of vals) {
            for (const b of vals) {
              const c = [0, 0, 0, 0];
              c[d1] = a;
              c[d2] = b;
              c[fixed[0]] = f0;
              c[fixed[1]] = f1;
              corners.push(vertIndex(vertices, c[0], c[1], c[2], c[3]));
            }
          }
          // (-1,-1), (1,-1), (-1,1), (1,1) in (d1,d2)
          faces.push([corners[0], corners[1], corners[2]]);
          faces.push([corners[1], corners[3], corners[2]]);
        }
      }
    }
  }
  return faces;
}
