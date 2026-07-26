/**
 * Shared tesseract-lattice sphere descriptors for SceneSpecification expansion.
 *
 * Drive-G-1: this is a procedural hypersphere approximation of an 8-cell
 * projection (vertices + edge beams + core + rings). It is NOT mesh recovery
 * from a photo and NOT diffusion. Kept denser than the old 16-vertex-only
 * `tesseract` expand so NVIDIA→SceneSpec re-renders of RT4D lattice stills
 * remain recognizable.
 */

const HALF = 0.85;
const PROJ_DIST = 2.4;
const PROJ_SCALE = 2.1;
const CENTER_Y = 0.55;
const BEAM_RADIUS = 0.155;
const BEAM_STEP_SCALE = 1.55; // slightly sparser than render-still (CPU budget)

/** @returns {Array<[number, number]>} */
export function tesseractEdges() {
  const edges = [];
  for (let i = 0; i < 16; i++) {
    for (let j = i + 1; j < 16; j++) {
      const d = i ^ j;
      if ((d & (d - 1)) === 0) edges.push([i, j]);
    }
  }
  return edges;
}

/** @returns {Array<{x:number,y:number,z:number,w:number}>} */
export function tesseractProjectedVerts() {
  const out = [];
  for (let i = 0; i < 16; i++) {
    const x = i & 1 ? HALF : -HALF;
    const y = i & 2 ? HALF : -HALF;
    const z = i & 4 ? HALF : -HALF;
    const w = i & 8 ? HALF : -HALF;
    const k = PROJ_SCALE / (PROJ_DIST + w);
    out.push({ x: x * k, y: y * k + CENTER_Y, z: z * k, w: 0 });
  }
  return out;
}

/**
 * @param {{x:number,y:number,z:number,w:number}} a
 * @param {{x:number,y:number,z:number,w:number}} b
 * @param {number} radius
 * @param {number} step
 * @returns {Array<{center:number[], radius:number}>}
 */
export function beamChainSpheres(a, b, radius, step = radius) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const dw = b.w - a.w;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz + dw * dw);
  const n = Math.max(1, Math.ceil(len / Math.max(1e-6, step)));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({
      center: [
        a.x + dx * t,
        a.y + dy * t,
        a.z + dz * t,
        a.w + dw * t,
      ],
      radius,
    });
  }
  return out;
}

const RING_SPECS = [
  { radius: 2.05, count: 40, y: CENTER_Y - 0.05, nodeRadius: 0.165 },
  { radius: 2.55, count: 48, y: CENTER_Y - 0.12, nodeRadius: 0.17 },
];

/**
 * Build hypersphere descriptors for a readable tesseract lattice.
 * @returns {Array<{center:number[], radius:number, role?:string}>}
 */
export function buildTesseractLatticeSpheres() {
  const verts = tesseractProjectedVerts();
  const edges = tesseractEdges();
  /** @type {Array<{center:number[], radius:number, role?:string}>} */
  const spheres = [];

  for (const v of verts) {
    spheres.push({
      center: [v.x, v.y, v.z, v.w],
      radius: 0.22,
      role: "vertex",
    });
  }

  const step = BEAM_RADIUS * BEAM_STEP_SCALE;
  for (const [i, j] of edges) {
    for (const s of beamChainSpheres(verts[i], verts[j], BEAM_RADIUS, step)) {
      spheres.push({ ...s, role: "beam" });
    }
  }

  // Central energy core (larger so it reads after W-slice projection).
  spheres.push({
    center: [0, CENTER_Y, 0, 0],
    radius: 0.42,
    role: "core",
  });

  for (const ring of RING_SPECS) {
    for (let i = 0; i < ring.count; i++) {
      const a = (i / ring.count) * Math.PI * 2;
      spheres.push({
        center: [
          Math.cos(a) * ring.radius,
          ring.y,
          Math.sin(a) * ring.radius,
          0,
        ],
        radius: ring.nodeRadius,
        role: "ring",
      });
    }
  }

  return spheres;
}

/**
 * Lighter lattice-grid: 3×3×2 nodes + sparse spokes + small core.
 * @returns {Array<{center:number[], radius:number, role?:string}>}
 */
export function buildLatticeGridSpheres() {
  /** @type {Array<{center:number[], radius:number, role?:string}>} */
  const spheres = [];
  const spacing = 1.05;
  const nodes = [];
  for (let ix = -1; ix <= 1; ix++) {
    for (let iy = 0; iy <= 1; iy++) {
      for (let iz = -1; iz <= 1; iz++) {
        const p = {
          x: ix * spacing,
          y: 0.15 + iy * spacing,
          z: iz * spacing,
          w: 0,
        };
        nodes.push(p);
        spheres.push({
          center: [p.x, p.y, p.z, p.w],
          radius: 0.28,
          role: "node",
        });
      }
    }
  }
  // Connect nearest-neighbour axis edges only (keep object count bounded).
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      const dz = Math.abs(a.z - b.z);
      const axisHits =
        (dx < 1e-6 ? 0 : 1) + (dy < 1e-6 ? 0 : 1) + (dz < 1e-6 ? 0 : 1);
      const dist = Math.sqrt(
        (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2,
      );
      if (axisHits === 1 && dist < spacing * 1.1) {
        for (const s of beamChainSpheres(a, b, 0.12, 0.2)) {
          spheres.push({ ...s, role: "spoke" });
        }
      }
    }
  }
  spheres.push({
    center: [0, 0.65, 0, 0],
    radius: 0.35,
    role: "core",
  });
  return spheres;
}
