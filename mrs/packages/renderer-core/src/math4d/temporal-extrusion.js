/**
 * Temporal extrusion V = {(x,w) | x ∈ M(t), w = t}.
 * Status: **partial** — embedFrame + prismatic extrudeBetween for matching topology;
 * sliceAtW recovers interpolated M(w) from a single prism segment;
 * continuous remeshing / non-matching topology remain **declared**.
 */

/**
 * @typedef {{ x: number, y: number, z: number }} Vec3
 * @typedef {{ x: number, y: number, z: number, w: number }} Vec4
 * @typedef {{ vertices: Vec3[], faces: number[][] }} Mesh3
 * @typedef {{
 *   vertices: Vec4[],
 *   faces: number[][],
 *   tets?: number[][],
 *   t0?: number,
 *   t1?: number,
 *   status: string,
 *   note?: string,
 * }} ExtrusionSolid
 */

/**
 * Embed a single 3D mesh snapshot at time t as 4D verts with w=t.
 * @param {number} t
 * @param {Mesh3} mesh
 * @returns {ExtrusionSolid}
 */
export function embedFrame(t, mesh) {
  if (!mesh?.vertices) {
    return { vertices: [], faces: [], t0: t, t1: t, status: "skeleton" };
  }
  return {
    vertices: mesh.vertices.map((v) => ({ x: v.x, y: v.y, z: v.z, w: t })),
    faces: mesh.faces ?? [],
    t0: t,
    t1: t,
    status: "skeleton",
    note: "Single-time embedding only; use extrudeBetween for a motion prism.",
  };
}

/**
 * Triangular prism → 3 tetrahedra (fixed split; deterministic).
 * Indices: a,b,c at t0; a',b',c' at t1 (ap,bp,cp).
 * @returns {number[][]}
 */
function prismToTets(a, b, c, ap, bp, cp) {
  return [
    [a, b, c, ap],
    [b, c, ap, bp],
    [c, ap, bp, cp],
  ];
}

/**
 * Build a prismatic 4D motion solid between two mesh snapshots.
 * Requires equal vertex counts; faces must be triangles (index triples).
 * Status: **partial**.
 *
 * @param {number} t0
 * @param {Mesh3} mesh0
 * @param {number} t1
 * @param {Mesh3} mesh1
 * @returns {ExtrusionSolid}
 */
export function extrudeBetween(t0, mesh0, t1, mesh1) {
  const v0 = mesh0?.vertices ?? [];
  const v1 = mesh1?.vertices ?? [];
  if (v0.length === 0 || v1.length === 0) {
    return {
      vertices: [],
      faces: [],
      tets: [],
      t0,
      t1,
      status: "partial",
      note: "Empty mesh; nothing to extrude.",
    };
  }
  if (v0.length !== v1.length) {
    return {
      vertices: [],
      faces: [],
      tets: [],
      t0,
      t1,
      status: "partial",
      note: `Vertex count mismatch (${v0.length} vs ${v1.length}); remeshing not implemented.`,
    };
  }

  const n = v0.length;
  /** @type {Vec4[]} */
  const vertices = [];
  for (const v of v0) vertices.push({ x: v.x, y: v.y, z: v.z, w: t0 });
  for (const v of v1) vertices.push({ x: v.x, y: v.y, z: v.z, w: t1 });

  const faces0 = mesh0.faces ?? [];
  /** @type {number[][]} */
  const tets = [];
  /** @type {number[][]} */
  const faces = [];

  for (const face of faces0) {
    if (!face || face.length < 3) continue;
    // Fan triangulation for n-gons (deterministic)
    for (let i = 1; i < face.length - 1; i++) {
      const a = face[0];
      const b = face[i];
      const c = face[i + 1];
      if (a < 0 || b < 0 || c < 0 || a >= n || b >= n || c >= n) continue;
      const ap = a + n;
      const bp = b + n;
      const cp = c + n;
      tets.push(...prismToTets(a, b, c, ap, bp, cp));
      faces.push([a, b, c], [ap, bp, cp]);
    }
  }

  // Correspondance edges (optional wireframe of the solid)
  for (let i = 0; i < n; i++) {
    faces.push([i, i + n]);
  }

  return {
    vertices,
    faces,
    tets,
    t0,
    t1,
    status: "partial",
    note:
      "Prismatic extrusion V={(x,w)|x∈M(t), w=t} between two frames; " +
      "tet cells for triangular faces. Not a general 4D mesher.",
  };
}

/**
 * Sample meshAtTime on a time grid and concatenate consecutive extrusions.
 * @param {(t: number) => Mesh3 | null} meshAtTime
 * @param {number[]} times - sorted sample times
 * @returns {ExtrusionSolid}
 */
export function extrudePath(meshAtTime, times) {
  const sorted = [...(times ?? [])].sort((a, b) => a - b);
  if (sorted.length < 2) {
    const t = sorted[0] ?? 0;
    const m = meshAtTime?.(t);
    return m
      ? { ...embedFrame(t, m), status: "skeleton" }
      : { vertices: [], faces: [], tets: [], status: "partial", note: "Need ≥2 times." };
  }

  /** @type {Vec4[]} */
  const vertices = [];
  /** @type {number[][]} */
  const tets = [];
  /** @type {number[][]} */
  const faces = [];
  let vertOffset = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const t0 = sorted[i];
    const t1 = sorted[i + 1];
    const m0 = meshAtTime(t0);
    const m1 = meshAtTime(t1);
    if (!m0 || !m1) continue;
    const solid = extrudeBetween(t0, m0, t1, m1);
    if (!solid.vertices.length) continue;
    for (const v of solid.vertices) vertices.push(v);
    for (const tet of solid.tets ?? []) {
      tets.push(tet.map((idx) => idx + vertOffset));
    }
    for (const f of solid.faces ?? []) {
      faces.push(f.map((idx) => idx + vertOffset));
    }
    vertOffset += solid.vertices.length;
  }

  return {
    vertices,
    faces,
    tets,
    t0: sorted[0],
    t1: sorted[sorted.length - 1],
    status: "partial",
    note: "Path extrusion: concatenated prism segments along sample times.",
  };
}

/**
 * Recover a 3D mesh by slicing a single-segment prismatic solid at time w.
 * Layout from {@link extrudeBetween}: verts [0..n) at t0, [n..2n) at t1.
 * Status: **partial** — matching topology only; remeshing still declared.
 *
 * @param {ExtrusionSolid} solid
 * @param {number} w
 * @returns {Mesh3 & { status: string, note?: string, w: number }}
 */
export function sliceExtrudedAtW(solid, w) {
  const verts = solid?.vertices ?? [];
  const t0 = solid?.t0 ?? 0;
  const t1 = solid?.t1 ?? 1;
  if (verts.length < 2 || verts.length % 2 !== 0) {
    return {
      vertices: [],
      faces: [],
      w,
      status: "partial",
      note: "sliceExtrudedAtW expects a single-segment extrudeBetween solid (even vertex count).",
    };
  }
  const n = verts.length / 2;
  const span = t1 - t0;
  const u = span === 0 ? 0 : Math.min(1, Math.max(0, (w - t0) / span));
  /** @type {Vec3[]} */
  const vertices = [];
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[i + n];
    vertices.push({
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
      z: a.z + (b.z - a.z) * u,
    });
  }
  // Prefer face rings from t0 half (first n faces that are triangles on the base)
  const faces = (solid.faces ?? []).filter(
    (f) => f.length >= 3 && f.every((idx) => idx >= 0 && idx < n)
  );
  return {
    vertices,
    faces: faces.length ? faces : [],
    w,
    status: "partial",
    note:
      "Hyperplane slice w=const of prismatic motion solid → interpolated M(w). " +
      "Not a general tet/isosurface remesher.",
  };
}

/**
 * Slice a multi-segment path solid by locating the segment containing w,
 * then calling {@link sliceExtrudedAtW} on that segment's layout.
 * Requires solids from {@link extrudePath} with equal verts-per-frame.
 *
 * @param {ExtrusionSolid} solid
 * @param {number} w
 * @param {{ times?: number[], vertsPerFrame?: number }} [opts]
 */
export function slicePathExtrudedAtW(solid, w, opts = {}) {
  const times = opts.times;
  const vpf = opts.vertsPerFrame;
  if (!times || times.length < 2 || !vpf) {
    return {
      vertices: [],
      faces: [],
      w,
      status: "partial",
      note: "slicePathExtrudedAtW needs opts.times (≥2) and opts.vertsPerFrame.",
    };
  }
  let seg = 0;
  for (let i = 0; i < times.length - 1; i++) {
    if (w >= times[i] - 1e-12 && w <= times[i + 1] + 1e-12) {
      seg = i;
      break;
    }
    if (w > times[i + 1]) seg = i;
  }
  const t0 = times[seg];
  const t1 = times[seg + 1];
  const base = seg * 2 * vpf;
  const verts = (solid.vertices ?? []).slice(base, base + 2 * vpf);
  const faces0 = (solid.faces ?? []).filter(
    (f) =>
      f.length >= 3 &&
      f.every((idx) => idx >= base && idx < base + vpf)
  );
  const remappedFaces = faces0.map((f) => f.map((idx) => idx - base));
  return sliceExtrudedAtW(
    {
      vertices: verts,
      faces: remappedFaces,
      t0,
      t1,
      status: "partial",
    },
    w
  );
}

/**
 * Create a temporal-extrusion handle.
 * @param {{ meshAtTime?: (t: number) => Mesh3 | null }} [opts]
 */
export function createTemporalExtrusion(opts = {}) {
  return {
    status: "partial",
    note:
      "Temporal extrusion V={(x,w)|x∈M(t), w=t} — partial prismatic solid between matching meshes.",
    remeshing: "declared",
    embedFrame(t, mesh) {
      const m = mesh ?? (opts.meshAtTime ? opts.meshAtTime(t) : null);
      if (!m) return { vertices: [], faces: [], t, status: "declared" };
      return embedFrame(t, m);
    },
    extrudeBetween(t0, mesh0, t1, mesh1) {
      return extrudeBetween(t0, mesh0, t1, mesh1);
    },
    extrudePath(times) {
      if (!opts.meshAtTime) {
        return {
          vertices: [],
          faces: [],
          tets: [],
          status: "partial",
          note: "extrudePath requires meshAtTime in createTemporalExtrusion opts.",
        };
      }
      return extrudePath(opts.meshAtTime, times);
    },
    sliceAtW(solid, w, sliceOpts) {
      if (sliceOpts?.times && sliceOpts?.vertsPerFrame) {
        return slicePathExtrudedAtW(solid, w, sliceOpts);
      }
      return sliceExtrudedAtW(solid, w);
    },
  };
}

export const TEMPORAL_EXTRUSION_STATUS = "partial";
export const TEMPORAL_REMESHING_STATUS = "declared";
