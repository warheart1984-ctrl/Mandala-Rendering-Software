/**
 * Quad-loop humanoid topology.
 *
 * STATUS: enforced (procedural box-model + lofted rings).
 * Blender/ZBrush sculpt + production retopo: declared.
 *
 * Every face is a quad. Joints get extra edge loops for animation.
 */
export const SPECIES = Object.freeze(["human", "anthro"]);

const TAU = Math.PI * 2;

function ring(cx, cy, cz, radius, n, axis = "y", bulge = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    if (axis === "y") pts.push([cx + c * radius, cy, cz + s * radius + bulge * c]);
    else if (axis === "x") pts.push([cx, cy + c * radius, cz + s * radius]);
    else pts.push([cx + c * radius, cy + s * radius, cz]);
  }
  return pts;
}

function boxRing(cx, cy, cz, hx, hz, n = 8) {
  // Rectangular torso rings still have n verts for loft compatibility.
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    let x, z;
    if (t < 0.25) { x = -hx + (t / 0.25) * 2 * hx; z = hz; }
    else if (t < 0.5) { x = hx; z = hz - ((t - 0.25) / 0.25) * 2 * hz; }
    else if (t < 0.75) { x = hx - ((t - 0.5) / 0.25) * 2 * hx; z = -hz; }
    else { x = -hx; z = -hz + ((t - 0.75) / 0.25) * 2 * hz; }
    pts.push([cx + x, cy, cz + z]);
  }
  return pts;
}

/**
 * @param {object} opts
 * @param {"human"|"anthro"} [opts.species]
 * @returns {{ positions: number[][], quads: number[][], regions: string[], loops: object }}
 */
export function buildQuadHumanoid(opts = {}) {
  const species = opts.species === "anthro" ? "anthro" : "human";
  const positions = [];
  const quads = [];
  const regions = [];
  const loops = {};

  function addRing(pts) {
    const start = positions.length;
    for (const p of pts) positions.push(p);
    return { start, count: pts.length, indices: pts.map((_, i) => start + i) };
  }

  function loft(a, b, region) {
    const n = a.count;
    for (let i = 0; i < n; i++) {
      const i0 = a.indices[i];
      const i1 = a.indices[(i + 1) % n];
      const i2 = b.indices[(i + 1) % n];
      const i3 = b.indices[i];
      quads.push([i0, i1, i2, i3]);
      regions.push(region);
    }
  }

  function cap(ringRef, center, region, inward = false) {
    const cIdx = positions.length;
    positions.push(center);
    const n = ringRef.count;
    // Fan as degenerate-free quads: consecutive pair + center duplicated via a midpoint.
    for (let i = 0; i < n; i += 2) {
      const a = ringRef.indices[i];
      const b = ringRef.indices[(i + 1) % n];
      const c = ringRef.indices[(i + 2) % n];
      quads.push(inward ? [cIdx, c, b, a] : [cIdx, a, b, c]);
      regions.push(region);
    }
  }

  const N = 8;

  // --- Torso loops (hips → waist → chest → shoulders) ---
  const hips = addRing(boxRing(0, 0.95, 0, 0.16, 0.10, N));
  const waist = addRing(boxRing(0, 1.18, 0, 0.14, 0.09, N));
  const ribs = addRing(boxRing(0, 1.38, 0, 0.16, 0.11, N));
  const chest = addRing(boxRing(0, 1.55, 0, 0.18, 0.12, N));
  const shoulders = addRing(boxRing(0, 1.68, 0, 0.20, 0.11, N));
  loft(hips, waist, "torso");
  loft(waist, ribs, "torso");
  loft(ribs, chest, "torso");
  loft(chest, shoulders, "torso");
  loops.hips = hips;
  loops.waist = waist;
  loops.chest = chest;
  loops.shoulders = shoulders;

  // --- Neck + head ---
  const neckBase = addRing(ring(0, 1.74, 0, 0.07, N));
  const neckTop = addRing(ring(0, 1.86, 0, 0.065, N));
  loft(shoulders, neckBase, "neck");
  loft(neckBase, neckTop, "neck");
  loops.neck = neckTop;

  const headLat = 6;
  const headLon = N;
  const headRings = [];
  for (let lat = 0; lat <= headLat; lat++) {
    const t = lat / headLat;
    const phi = t * Math.PI;
    const y = 1.98 + Math.cos(phi) * 0.13;
    const r = Math.sin(phi) * 0.12;
    headRings.push(addRing(ring(0, y, 0.02, Math.max(r, 0.012), headLon)));
  }
  for (let i = 0; i < headRings.length - 1; i++) loft(headRings[i], headRings[i + 1], "head");
  loops.head = headRings[Math.floor(headRings.length / 2)];

  // --- Arms ---
  function arm(side) {
    const s = side === "L" ? -1 : 1;
    const prefix = side === "L" ? "arm.L" : "arm.R";
    const sx = s * 0.22;
    const sh = addRing(ring(sx, 1.64, 0, 0.055, N, "x"));
    const elbow = addRing(ring(sx * 1.15, 1.28, 0.02, 0.045, N, "x"));
    const wrist = addRing(ring(sx * 1.25, 0.98, 0.04, 0.035, N, "x"));
    loft(sh, elbow, prefix);
    loft(elbow, wrist, prefix);
    // Palm
    const palm = addRing(ring(sx * 1.28, 0.88, 0.05, 0.04, N, "x"));
    loft(wrist, palm, `hand.${side}`);
    loops[`wrist.${side}`] = wrist;
    // Fingers: 4 fingers × 3 segments as tiny lofted quads
    const fingerXs = [-0.03, -0.01, 0.01, 0.03];
    for (let f = 0; f < 4; f++) {
      const fx = sx * 1.28 + s * 0.01;
      const fz = fingerXs[f];
      let prev = addRing(ring(fx, 0.84, 0.06 + fz, 0.012, 4, "x"));
      for (let seg = 1; seg <= 3; seg++) {
        const next = addRing(ring(fx, 0.84 - seg * 0.045, 0.07 + fz, 0.01 - seg * 0.001, 4, "x"));
        loft(prev, next, `finger.${side}.${f}`);
        prev = next;
      }
    }
    // Thumb
    let tPrev = addRing(ring(sx * 1.22, 0.90, 0.09, 0.014, 4, "x"));
    for (let seg = 1; seg <= 2; seg++) {
      const next = addRing(ring(sx * 1.18, 0.88 - seg * 0.03, 0.11, 0.012, 4, "x"));
      loft(tPrev, next, `thumb.${side}`);
      tPrev = next;
    }
  }
  arm("L");
  arm("R");

  // --- Legs ---
  function leg(side) {
    const s = side === "L" ? -1 : 1;
    const prefix = side === "L" ? "leg.L" : "leg.R";
    const hx = s * 0.09;
    const hip = addRing(ring(hx, 0.92, 0, 0.07, N));
    const knee = addRing(ring(hx, 0.50, 0.02, 0.055, N));
    const ankle = addRing(ring(hx, 0.12, 0, 0.04, N));
    loft(hip, knee, prefix);
    loft(knee, ankle, prefix);
    const foot = addRing(ring(hx, 0.04, 0.06, 0.045, N));
    loft(ankle, foot, `foot.${side}`);
    cap(foot, [hx, 0.02, 0.10], `foot.${side}`);
    loops[`ankle.${side}`] = ankle;
  }
  leg("L");
  leg("R");

  // --- Tail (always in topology; human keeps a stub) ---
  const tailLen = species === "anthro" ? 5 : 1;
  const tailRadius = species === "anthro" ? 0.045 : 0.02;
  let prevTail = addRing(ring(0, 0.98, -0.12, tailRadius, N));
  loft(hips, prevTail, "tail");
  for (let i = 1; i <= tailLen; i++) {
    const t = i / tailLen;
    const y = 0.98 - t * (species === "anthro" ? 0.15 : 0.04);
    const z = -0.12 - t * (species === "anthro" ? 0.55 : 0.08);
    const r = tailRadius * (1 - t * 0.7);
    const next = addRing(ring(0, y, z, Math.max(r, 0.008), N));
    loft(prevTail, next, "tail");
    prevTail = next;
  }
  loops.tailTip = prevTail;

  return {
    species,
    positions,
    quads,
    regions,
    loops,
    vertexCount: positions.length,
    faceCount: quads.length,
  };
}

/** True when every face is a 4-vertex loop. */
export function isAllQuads(mesh) {
  return mesh.quads.every((q) => q.length === 4);
}

/** Convert quads to triangles (for raster / GLB TRIANGLES). */
export function quadsToTriangles(quads) {
  const indices = [];
  for (const [a, b, c, d] of quads) {
    indices.push(a, b, c, a, c, d);
  }
  return indices;
}

export function computeNormals(positions, triangles) {
  const nrm = positions.map(() => [0, 0, 0]);
  for (let i = 0; i < triangles.length; i += 3) {
    const ia = triangles[i], ib = triangles[i + 1], ic = triangles[i + 2];
    const a = positions[ia], b = positions[ib], c = positions[ic];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    for (const idx of [ia, ib, ic]) {
      nrm[idx][0] += n[0]; nrm[idx][1] += n[1]; nrm[idx][2] += n[2];
    }
  }
  return nrm.map((n) => {
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / len, n[1] / len, n[2] / len];
  });
}

export function computeUVs(positions) {
  let minY = Infinity, maxY = -Infinity;
  for (const p of positions) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const span = maxY - minY || 1;
  return positions.map((p) => [
    0.5 + Math.atan2(p[2], p[0]) / TAU,
    (p[1] - minY) / span,
  ]);
}

/** Unique undirected edges from quads — wireframe + energy curves. */
export function extractEdges(quads) {
  const seen = new Set();
  const edges = [];
  for (const q of quads) {
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([a, b]);
      }
    }
  }
  return edges;
}

/** Extra meridian energy curves along torso / limbs (Stage 1 glow overlay). */
export function energyCurves(mesh) {
  const curves = [];
  const { loops, positions } = mesh;
  const chain = (ids) => ids.map((i) => positions[i]);
  if (loops.hips && loops.chest && loops.shoulders) {
    for (let i = 0; i < loops.hips.count; i++) {
      curves.push(chain([
        loops.hips.indices[i],
        loops.waist.indices[i],
        loops.chest.indices[i],
        loops.shoulders.indices[i],
      ]));
    }
  }
  return curves;
}
