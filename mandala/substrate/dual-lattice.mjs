/**
 * Mandala dual-lattice analogue (RHFD vacuum → pixels).
 *
 * Primary topology: hex / Flower-of-Life cells (Möbius layer).
 * Optional square grid: voxel-field analogue (not the RHFD Hamiltonian).
 *
 * Status: **partial**
 *   - Real CPU lattice: nodes, 6-neighbor links, η, V, ∇V, hex loops.
 *   - Not the RHFD continuum dual lattice. Not renderer-core lattice4d.
 *   - η is hashed zero-mean noise, not Perlin-as-vacuum.
 */

import {
  HEX_DIRS,
  axialToCartesian,
  cellKey,
  edgeKey,
  hexCellsInRadius,
  hexLoopConsistent,
  hexLoopXor,
  moebiusParity,
} from "./moebius.mjs";

/** Hashed zero-mean-capable η analogue. Exported so proto reuses this polynomial, not a second theory. */
export function hashNoise(i, j, seed) {
  let n = Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(seed | 0, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n >>> 0) / 4294967296) * 2 - 1;
}

/** 4D extension of hashNoise for proto lattice (x,y,z,t). Same family, extra lattice axes. */
export function hashNoise4(i, j, k, t, seed) {
  let n =
    Math.imul(i | 0, 374761393) +
    Math.imul(j | 0, 668265263) +
    Math.imul(k | 0, 3628273133) +
    Math.imul(t | 0, 1442665583) +
    Math.imul(seed | 0, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n >>> 0) / 4294967296) * 2 - 1;
}

function indexByKey(nodes) {
  const map = new Map();
  for (const n of nodes) map.set(cellKey(n.q, n.r), n);
  return map;
}

/**
 * Hex dual lattice. Node = petal center (DoF). Link = hex edge (interaction).
 */
export function createHexLattice({ radius = 2, spacing = 1 } = {}) {
  const cells = hexCellsInRadius(radius);
  const nodes = cells.map((c, id) => {
    const position = axialToCartesian(c.q, c.r, spacing);
    return {
      id,
      q: c.q,
      r: c.r,
      i: c.q,
      j: c.r,
      position,
      eta: 0,
      V: 0,
      gradV: [0, 0],
      force: [0, 0],
      velocity: [0, 0],
      state: "ground",
      vertexParity: moebiusParity(c.q, c.r),
    };
  });

  const byKey = indexByKey(nodes);
  const links = [];
  const edgeParity = new Map();

  for (const n of nodes) {
    for (const [dq, dr] of HEX_DIRS) {
      const nq = n.q + dq;
      const nr = n.r + dr;
      const nb = byKey.get(cellKey(nq, nr));
      if (!nb || n.id >= nb.id) continue;
      const key = edgeKey(n.q, n.r, nq, nr);
      links.push({
        a: n.id,
        b: nb.id,
        channel: "hex-edge",
        key,
        q1: n.q,
        r1: n.r,
        q2: nq,
        r2: nr,
      });
      edgeParity.set(key, 0);
    }
  }

  return {
    kind: "hex-dual-lattice",
    topology: "moebius-flower",
    status: "partial",
    radius,
    spacing,
    nodes,
    links,
    byKey,
    edgeParity,
    defects: [],
  };
}

/**
 * Square 4-neighbor grid — Mandala voxel-field analogue only.
 * Not a replacement for the hex Möbius layer.
 */
export function createSquareLattice({ nx = 8, ny = 8, spacing = 1 } = {}) {
  const nodes = [];
  const links = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const id = j * nx + i;
      nodes.push({
        id,
        i,
        j,
        q: i,
        r: j,
        position: [i * spacing, j * spacing],
        eta: 0,
        V: 0,
        gradV: [0, 0],
        force: [0, 0],
        velocity: [0, 0],
        state: "ground",
        vertexParity: moebiusParity(i, j),
      });
      if (i + 1 < nx) links.push({ a: id, b: id + 1, channel: "neighbor" });
      if (j + 1 < ny) links.push({ a: id, b: id + nx, channel: "neighbor" });
    }
  }
  return {
    kind: "square-dual-lattice",
    topology: "cartesian-voxel-analogue",
    status: "partial",
    nx,
    ny,
    spacing,
    nodes,
    links,
    byKey: null,
    edgeParity: null,
    defects: [],
  };
}

export function createDualLattice(options = {}) {
  if (options.kind === "square" || options.nx != null) return createSquareLattice(options);
  return createHexLattice(options);
}

function recomputeHexForces(lattice) {
  const { byKey, nodes } = lattice;
  for (const n of nodes) {
    let gx = 0;
    let gy = 0;
    let w = 0;
    for (const [dq, dr] of HEX_DIRS) {
      const nb = byKey.get(cellKey(n.q + dq, n.r + dr));
      if (!nb) continue;
      const dx = nb.position[0] - n.position[0];
      const dy = nb.position[1] - n.position[1];
      const dist = Math.hypot(dx, dy) || 1;
      const dV = nb.V - n.V;
      gx += (dV / dist) * (dx / dist);
      gy += (dV / dist) * (dy / dist);
      w++;
    }
    if (w > 0) {
      gx /= w;
      gy /= w;
    }
    n.gradV = [gx, gy];
    n.force = [-gx, -gy];
  }
}

function recomputeSquareForces(lattice) {
  const { nx, ny, nodes, spacing } = lattice;
  const at = (i, j) => nodes[j * nx + i];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const n = at(i, j);
      const Vxm = i > 0 ? at(i - 1, j).V : n.V;
      const Vxp = i < nx - 1 ? at(i + 1, j).V : n.V;
      const Vym = j > 0 ? at(i, j - 1).V : n.V;
      const Vyp = j < ny - 1 ? at(i, j + 1).V : n.V;
      const dx = spacing * (i > 0 && i < nx - 1 ? 2 : 1);
      const dy = spacing * (j > 0 && j < ny - 1 ? 2 : 1);
      n.gradV = [(Vxp - Vxm) / dx, (Vyp - Vym) / dy];
      n.force = [-n.gradV[0], -n.gradV[1]];
    }
  }
}

export function recomputeForces(lattice) {
  if (lattice.kind === "hex-dual-lattice") recomputeHexForces(lattice);
  else recomputeSquareForces(lattice);
  return lattice;
}

/**
 * Ground / vacuum: V = 0, zero-mean η, edge parities 0 (all hex loops consistent).
 * Vertex checkerboard parity is stored as latent Möbius map, not coupled into V.
 */
export function fillGroundState(lattice, { seed = 1, etaAmplitude = 0.25 } = {}) {
  for (const n of lattice.nodes) {
    n.V = 0;
    n.eta = hashNoise(n.q ?? n.i, n.r ?? n.j, seed) * etaAmplitude;
    n.state = "ground";
    n.velocity = [0, 0];
    n.positionRest = [n.position[0], n.position[1]];
  }
  const mean = lattice.nodes.reduce((s, n) => s + n.eta, 0) / lattice.nodes.length;
  for (const n of lattice.nodes) n.eta -= mean;
  if (lattice.edgeParity) {
    for (const key of lattice.edgeParity.keys()) lattice.edgeParity.set(key, 0);
  }
  lattice.defects = [];
  recomputeForces(lattice);
  return lattice;
}

/**
 * Local rupture: Gaussian well in V. Character/prop analogue.
 */
export function addDefect(lattice, { q = 0, r = 0, i, j, amplitude = 1, sigma = 1.25 } = {}) {
  const cq = q ?? i ?? 0;
  const cr = r ?? j ?? 0;
  const [cx, cy] = lattice.kind === "hex-dual-lattice"
    ? axialToCartesian(cq, cr, lattice.spacing)
    : [cq * lattice.spacing, cr * lattice.spacing];

  const defect = {
    kind: "local_rupture",
    q: cq,
    r: cr,
    amplitude,
    sigma,
    organ: "Mandala",
    motion: "Simulation Chamber",
  };
  lattice.defects.push(defect);

  for (const n of lattice.nodes) {
    const dx = n.position[0] - cx;
    const dy = n.position[1] - cy;
    const r2 = dx * dx + dy * dy;
    n.V -= amplitude * Math.exp(-r2 / (2 * sigma * sigma));
    if (r2 < sigma * sigma * 4) n.state = "defect_field";
  }
  const origin = lattice.byKey?.get(cellKey(cq, cr))
    ?? lattice.nodes.find((n) => n.q === cq && n.r === cr);
  if (origin) origin.state = "defect";
  recomputeForces(lattice);
  return defect;
}

/**
 * Möbius petal rupture: flip one hex-edge parity → odd loop XOR on the two cells.
 */
export function flipEdgeParity(lattice, q1, r1, q2, r2) {
  if (!lattice.edgeParity) {
    throw new Error("flipEdgeParity requires a hex lattice");
  }
  const key = edgeKey(q1, r1, q2, r2);
  if (!lattice.edgeParity.has(key)) {
    throw new Error(`edge not in lattice: ${key}`);
  }
  lattice.edgeParity.set(key, (lattice.edgeParity.get(key) ^ 1) & 1);
  lattice.defects.push({
    kind: "parity_flip",
    key,
    q1,
    r1,
    q2,
    r2,
    organ: "Mandala",
  });
  return key;
}

export function allHexLoopsConsistent(lattice) {
  if (!lattice.edgeParity) return true;
  for (const n of lattice.nodes) {
    if (!hexLoopConsistent(lattice.edgeParity, n.q, n.r)) return false;
  }
  return true;
}

export function inconsistentHexCount(lattice) {
  if (!lattice.edgeParity) return 0;
  let c = 0;
  for (const n of lattice.nodes) {
    if (hexLoopXor(lattice.edgeParity, n.q, n.r) !== 0) c++;
  }
  return c;
}

export function meanForce(lattice) {
  let fx = 0;
  let fy = 0;
  for (const n of lattice.nodes) {
    fx += n.force[0];
    fy += n.force[1];
  }
  const n = lattice.nodes.length;
  return { fx: fx / n, fy: fy / n, mag: Math.hypot(fx / n, fy / n) };
}

export function maxForceMagnitude(lattice) {
  let m = 0;
  for (const n of lattice.nodes) m = Math.max(m, Math.hypot(n.force[0], n.force[1]));
  return m;
}

export function localForceNear(lattice, q, r, radius = 1) {
  let mag = 0;
  let count = 0;
  for (const n of lattice.nodes) {
    const dq = Math.abs((n.q ?? n.i) - q);
    const dr = Math.abs((n.r ?? n.j) - r);
    if (Math.max(dq, dr) <= radius) {
      mag += Math.hypot(n.force[0], n.force[1]);
      count++;
    }
  }
  return count ? mag / count : 0;
}

export function stepEuler(lattice, dt = 0.1) {
  for (const n of lattice.nodes) {
    n.velocity[0] += n.force[0] * dt;
    n.velocity[1] += n.force[1] * dt;
    n.position[0] += n.velocity[0] * dt;
    n.position[1] += n.velocity[1] * dt;
  }
}

export function netDrift(lattice) {
  let dx = 0;
  let dy = 0;
  for (const n of lattice.nodes) {
    const rest = n.positionRest || n.position;
    dx += n.position[0] - rest[0];
    dy += n.position[1] - rest[1];
  }
  const n = lattice.nodes.length;
  return { dx: dx / n, dy: dy / n, mag: Math.hypot(dx / n, dy / n) };
}

export function etaMean(lattice) {
  return lattice.nodes.reduce((s, n) => s + n.eta, 0) / lattice.nodes.length;
}
