/**
 * Quad-loop humanoid topology (AMUL edge flow).
 *
 * STATUS: partial — procedural lofted rings; Blender/ZBrush retopo declared.
 *
 * Density profiles:
 *   sparse  — legacy low-poly (~300–400 quads)
 *   base    — chamber ~2K middle-panel AMUL base (silicon-tuner input)
 *   amul    — denser silhouette loops (~5–6K), PARTIAL, no beauty claim
 *
 * Chamber: voss-bind → silicon-tuner (density:amul) → SoT print (material_key only).
 * Every face is a quad. Named AMUL loops match Bios-Ai-Lane-V2.json.
 */
export const SPECIES = Object.freeze(["human", "anthro"]);

export const DENSITY = Object.freeze({
  sparse: "sparse",
  base: "base",
  amul: "amul",
});

/** Radial / ring budgets per density. Tuned so base≈2K, amul≈5–6K. */
const DENSITY_PARAMS = Object.freeze({
  sparse: {
    N: 8,
    headLat: 6,
    torsoYs: [0.95, 1.18, 1.38, 1.55, 1.68],
    armSegs: 2,
    legSegs: 2,
    neckSegs: 2,
    tailExtra: 0,
    fingerRadial: 4,
  },
  base: {
    N: 16,
    headLat: 10,
    torsoYs: [0.95, 1.05, 1.18, 1.28, 1.38, 1.48, 1.55, 1.62, 1.68],
    armSegs: 6,
    legSegs: 6,
    neckSegs: 3,
    tailExtra: 2,
    fingerRadial: 4,
  },
  amul: {
    // Tuned toward Bios-Ai-Lane-V2 target_quads ≈ 5500 (PARTIAL silhouette base)
    N: 36,
    headLat: 16,
    // AMUL inserts: clavicle/acromion/deltoid (shoulder), pec, lat→oblique, glute fold
    torsoYs: [
      0.95, 0.98, 1.02, 1.06, 1.10, 1.14, 1.18, 1.22, 1.26, 1.30,
      1.34, 1.38, 1.42, 1.46, 1.50, 1.53, 1.55, 1.58, 1.61, 1.64,
      1.66, 1.68, 1.71,
    ],
    armSegs: 14,
    legSegs: 14,
    neckSegs: 5,
    tailExtra: 8,
    fingerRadial: 8,
  },
});

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

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function torsoHxHz(y) {
  // V-taper: hips narrower, chest/shoulders wider (superhero silhouette parity).
  if (y < 1.18) return { hx: lerp(0.16, 0.14, (y - 0.95) / 0.23), hz: lerp(0.10, 0.09, (y - 0.95) / 0.23) };
  if (y < 1.55) return { hx: lerp(0.14, 0.18, (y - 1.18) / 0.37), hz: lerp(0.09, 0.12, (y - 1.18) / 0.37) };
  return { hx: lerp(0.18, 0.20, Math.min(1, (y - 1.55) / 0.16)), hz: lerp(0.12, 0.11, Math.min(1, (y - 1.55) / 0.16)) };
}

/**
 * @param {object} opts
 * @param {"human"|"anthro"} [opts.species]
 * @param {"sparse"|"base"|"amul"} [opts.density]
 * @returns {{ positions: number[][], quads: number[][], regions: string[], loops: object, amulLoops: object }}
 */
export function buildQuadHumanoid(opts = {}) {
  const species = opts.species === "anthro" ? "anthro" : "human";
  const density = DENSITY[opts.density] ? opts.density : (opts.amul ? "amul" : "sparse");
  // Universal AMUL body: base/amul share topology across fox+humanoid (material_key only differs)
  const universal =
    opts.amulUniversal === true || density === "amul" || density === "base";
  const bodySpecies = universal ? "anthro" : species;
  const P = DENSITY_PARAMS[density] || DENSITY_PARAMS.sparse;
  const N = P.N;

  const positions = [];
  const quads = [];
  const regions = [];
  const loops = {};
  const amulLoops = {};

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
    for (let i = 0; i < n; i += 2) {
      const a = ringRef.indices[i];
      const b = ringRef.indices[(i + 1) % n];
      const c = ringRef.indices[(i + 2) % n];
      quads.push(inward ? [cIdx, c, b, a] : [cIdx, a, b, c]);
      regions.push(region);
    }
  }

  function loftChain(ringList, region, tagPairs = []) {
    for (let i = 0; i < ringList.length - 1; i++) {
      loft(ringList[i], ringList[i + 1], region);
    }
    for (const [name, idx] of tagPairs) {
      if (ringList[idx]) {
        loops[name] = ringList[idx];
        amulLoops[name] = ringList[idx];
      }
    }
  }

  // --- Torso (hips → waist → lats/oblique → chest/pec → shoulders/trap) ---
  const torsoRings = [];
  for (const y of P.torsoYs) {
    const { hx, hz } = torsoHxHz(y);
    torsoRings.push(addRing(boxRing(0, y, 0, hx, hz, N)));
  }
  loftChain(torsoRings, "torso");

  const hips = torsoRings[0];
  const waist = torsoRings[Math.min(2, torsoRings.length - 1)];
  const chest = torsoRings[Math.max(0, torsoRings.length - 4)];
  const shoulders = torsoRings[torsoRings.length - 1];
  loops.hips = hips;
  loops.waist = waist;
  loops.chest = chest;
  loops.shoulders = shoulders;

  // Tag AMUL silhouette loops by torso Y landmarks
  function nearestTorso(yTarget) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < P.torsoYs.length; i++) {
      const d = Math.abs(P.torsoYs[i] - yTarget);
      if (d < bestD) { bestD = d; best = i; }
    }
    return torsoRings[best];
  }
  amulLoops["AMUL::CHEST"] = nearestTorso(1.55);
  amulLoops["AMUL::LAT_L"] = nearestTorso(1.30);
  amulLoops["AMUL::LAT_R"] = nearestTorso(1.30);
  // Shoulder / trap: clavicle → acromion (two rings near top)
  amulLoops["AMUL::SHOULDER_L"] = nearestTorso(1.62);
  amulLoops["AMUL::SHOULDER_R"] = nearestTorso(1.68);
  loops.latOblique = nearestTorso(1.30);
  loops.pec = nearestTorso(1.55);
  loops.trap = nearestTorso(1.65);

  // --- Neck + head ---
  const neckRings = [];
  for (let i = 0; i < P.neckSegs; i++) {
    const t = (i + 1) / (P.neckSegs + 1);
    const y = lerp(1.70, 1.88, t);
    const r = lerp(0.07, 0.062, t);
    neckRings.push(addRing(ring(0, y, 0, r, N)));
  }
  loft(shoulders, neckRings[0], "neck");
  for (let i = 0; i < neckRings.length - 1; i++) loft(neckRings[i], neckRings[i + 1], "neck");
  loops.neck = neckRings[neckRings.length - 1];

  const headLat = P.headLat;
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

  // --- Arms: clavicle → acromion → deltoid → humerus → radius ---
  function arm(side) {
    const s = side === "L" ? -1 : 1;
    const prefix = side === "L" ? "arm.L" : "arm.R";
    const amulShoulder = side === "L" ? "AMUL::SHOULDER_L" : "AMUL::SHOULDER_R";
    const sx0 = s * 0.20;
    const segs = P.armSegs;
    const rings = [];
    // clavicle / acromion / deltoid insertion (2–3 extra silhouette loops)
    const path = [
      [sx0, 1.66, 0.02, 0.058],
      [sx0 * 1.05, 1.64, 0.01, 0.056],
      [sx0 * 1.12, 1.58, 0.0, 0.055],
      [sx0 * 1.18, 1.42, 0.01, 0.050],
      [sx0 * 1.20, 1.28, 0.02, 0.045],
      [sx0 * 1.22, 1.12, 0.03, 0.040],
      [sx0 * 1.25, 0.98, 0.04, 0.035],
    ];
    // densify path into segs samples
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const f = t * (path.length - 1);
      const i0 = Math.min(path.length - 2, Math.floor(f));
      const lt = f - i0;
      const a = path[i0];
      const b = path[i0 + 1];
      const x = lerp(a[0], b[0], lt);
      const y = lerp(a[1], b[1], lt);
      const z = lerp(a[2], b[2], lt);
      const r = lerp(a[3], b[3], lt);
      rings.push(addRing(ring(x, y, z, r, N, "x")));
    }
    for (let i = 0; i < rings.length - 1; i++) loft(rings[i], rings[i + 1], prefix);
    amulLoops[amulShoulder] = rings[Math.min(2, rings.length - 1)];
    loops[`wrist.${side}`] = rings[rings.length - 1];

    const palm = addRing(ring(sx0 * 1.28, 0.88, 0.05, 0.04, N, "x"));
    loft(rings[rings.length - 1], palm, `hand.${side}`);

    const fr = P.fingerRadial;
    const fingerXs = [-0.03, -0.01, 0.01, 0.03];
    for (let f = 0; f < 4; f++) {
      const fx = sx0 * 1.28 + s * 0.01;
      const fz = fingerXs[f];
      let prev = addRing(ring(fx, 0.84, 0.06 + fz, 0.012, fr, "x"));
      for (let seg = 1; seg <= 3; seg++) {
        const next = addRing(ring(fx, 0.84 - seg * 0.045, 0.07 + fz, 0.01 - seg * 0.001, fr, "x"));
        loft(prev, next, `finger.${side}.${f}`);
        prev = next;
      }
    }
    let tPrev = addRing(ring(sx0 * 1.22, 0.90, 0.09, 0.014, fr, "x"));
    for (let seg = 1; seg <= 2; seg++) {
      const next = addRing(ring(sx0 * 1.18, 0.88 - seg * 0.03, 0.11, 0.012, fr, "x"));
      loft(tPrev, next, `thumb.${side}`);
      tPrev = next;
    }
  }
  arm("L");
  arm("R");

  // --- Legs: pelvis → glute fold → mid-thigh → femur → tibia ---
  function leg(side) {
    const s = side === "L" ? -1 : 1;
    const prefix = side === "L" ? "leg.L" : "leg.R";
    const amulHip = side === "L" ? "AMUL::HIP_L" : "AMUL::HIP_R";
    const amulKnee = side === "L" ? "AMUL::KNEE_L" : "AMUL::KNEE_R";
    const hx = s * 0.09;
    const segs = P.legSegs;
    const path = [
      [hx, 0.92, 0.0, 0.075],   // pelvis / femur head
      [hx, 0.86, 0.01, 0.078],  // glute fold
      [hx, 0.72, 0.02, 0.070],  // mid-thigh mass
      [hx, 0.58, 0.02, 0.060],
      [hx, 0.50, 0.02, 0.055],  // knee
      [hx, 0.32, 0.01, 0.048],
      [hx, 0.12, 0.0, 0.040],   // ankle
    ];
    const rings = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const f = t * (path.length - 1);
      const i0 = Math.min(path.length - 2, Math.floor(f));
      const lt = f - i0;
      const a = path[i0];
      const b = path[i0 + 1];
      rings.push(addRing(ring(
        lerp(a[0], b[0], lt),
        lerp(a[1], b[1], lt),
        lerp(a[2], b[2], lt),
        lerp(a[3], b[3], lt),
        N,
      )));
    }
    for (let i = 0; i < rings.length - 1; i++) loft(rings[i], rings[i + 1], prefix);
    amulLoops[amulHip] = rings[Math.min(1, rings.length - 1)];
    amulLoops[amulKnee] = rings[Math.min(Math.floor(segs * 0.55), rings.length - 1)];
    loops[`glute.${side}`] = amulLoops[amulHip];
    loops[`midThigh.${side}`] = rings[Math.min(Math.floor(segs * 0.35), rings.length - 1)];
    loops[`ankle.${side}`] = rings[rings.length - 1];

    const foot = addRing(ring(hx, 0.04, 0.06, 0.045, N));
    loft(rings[rings.length - 1], foot, `foot.${side}`);
    cap(foot, [hx, 0.02, 0.10], `foot.${side}`);
  }
  leg("L");
  leg("R");

  // --- Tail: 3 radial root loops + weight region to pelvis / lower spine ---
  // Universal AMUL (base/amul): always anthro-length tail topology; species is material_key only.
  const tailLen = bodySpecies === "anthro"
    ? (density === "amul" ? 10 : density === "base" ? 7 : 5)
    : (density === "amul" ? 3 : 1);
  const tailRadius = bodySpecies === "anthro" ? 0.048 : 0.02;
  const rootLoops = density === "sparse" ? 1 : 3;
  let prevTail = null;
  const tailRootRings = [];
  for (let r = 0; r < rootLoops; r++) {
    const t = r / Math.max(1, rootLoops - 1);
    const y = 0.98 - t * 0.02;
    const z = -0.10 - t * 0.04;
    const rad = tailRadius * (1.05 - t * 0.08);
    const ringRef = addRing(ring(0, y, z, rad, N));
    tailRootRings.push(ringRef);
    if (r === 0) loft(hips, ringRef, "tail.root");
    else loft(prevTail, ringRef, "tail.root");
    prevTail = ringRef;
  }
  amulLoops["AMUL::TAIL_ROOT"] = tailRootRings[0] || prevTail;
  loops.tailRoot = amulLoops["AMUL::TAIL_ROOT"];
  loops.tailRootRings = tailRootRings;

  for (let i = 1; i <= tailLen + P.tailExtra; i++) {
    const t = i / (tailLen + P.tailExtra);
    const y = 0.96 - t * (bodySpecies === "anthro" ? 0.18 : 0.05);
    const z = -0.14 - t * (bodySpecies === "anthro" ? 0.58 : 0.08);
    const r = tailRadius * (1 - t * 0.7);
    const next = addRing(ring(0, y, z, Math.max(r, 0.008), N));
    loft(prevTail, next, "tail");
    prevTail = next;
  }
  loops.tailTip = prevTail;

  const requiredAmul = [
    "AMUL::SHOULDER_L", "AMUL::SHOULDER_R", "AMUL::CHEST",
    "AMUL::LAT_L", "AMUL::LAT_R", "AMUL::HIP_L", "AMUL::HIP_R",
    "AMUL::KNEE_L", "AMUL::KNEE_R", "AMUL::TAIL_ROOT",
  ];
  const amulPresent = Object.fromEntries(
    requiredAmul.map((id) => [id, Boolean(amulLoops[id])]),
  );

  return {
    species,
    bodySpecies,
    universalAmul: universal,
    materialKeyHint: species === "anthro" ? "fur.fox" : "skin.humanoid",
    density,
    status: density === "sparse" ? "enforced" : "partial",
    positions,
    quads,
    regions,
    loops,
    amulLoops,
    amulPresent,
    vertexCount: positions.length,
    faceCount: quads.length,
    note: density === "amul"
      ? "AMUL denser silhouette topology (PARTIAL). Universal body — material_key distinguishes fox/humanoid. No beauty / SoT print claim."
      : density === "base"
        ? "AMUL ~2K chamber base (PARTIAL). Universal body for replay parity."
        : "Legacy sparse quad loft.",
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
  if (loops.hips && loops.chest && loops.shoulders && loops.waist) {
    const n = Math.min(
      loops.hips.count,
      loops.waist.count,
      loops.chest.count,
      loops.shoulders.count,
    );
    for (let i = 0; i < n; i++) {
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

/** Report AMUL loop presence + quad counts for verification. */
export function reportAmulTopology(mesh) {
  const required = [
    "AMUL::SHOULDER_L", "AMUL::SHOULDER_R", "AMUL::CHEST",
    "AMUL::LAT_L", "AMUL::LAT_R", "AMUL::HIP_L", "AMUL::HIP_R",
    "AMUL::KNEE_L", "AMUL::KNEE_R", "AMUL::TAIL_ROOT",
  ];
  const present = {};
  for (const id of required) present[id] = Boolean(mesh.amulLoops?.[id] || mesh.loops?.[id]);
  return {
    density: mesh.density,
    species: mesh.species,
    quads: mesh.faceCount,
    verts: mesh.vertexCount,
    allQuads: isAllQuads(mesh),
    amulLoopsPresent: present,
    allAmulLoops: Object.values(present).every(Boolean),
    status: mesh.status || "partial",
  };
}
