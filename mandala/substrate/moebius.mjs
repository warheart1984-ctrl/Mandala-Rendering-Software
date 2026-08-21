/**
 * Möbius Flower layer — hex dual-lattice topology.
 *
 * Canonical CPU copy of formulas already in:
 *   mrs/apps/rt4d-chatgpt-plugin/server/src/moebius-substrate.ts
 *   mrs/packages/renderer-core/src/gpu/shaders/moebius-substrate.wgsl
 *
 * Status: **partial**
 *   - Parity f(x,y)=(x+y) mod 2 and twist gradient are real functions (JS + WGSL).
 *   - Checkerboard parity is a twist *map*, not vacuum ∇V. Vacuum forces come from V.
 *   - Hex-loop consistency is tested here. Plugin wire-mesh is a visualization, not RHFD.
 *   - WGSL is source, not a wired GPU pass in this RT4D CPU path.
 */

/** Axial hex neighbor directions (pointy-top, cube-consistent). */
export const HEX_DIRS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

/**
 * Möbius twist parity: f(x, y) = (x + y) mod 2.
 * Discrete η(t) orientation on a cell. Returns 0 or 1.
 */
export function moebiusParity(x, y) {
  return (x + y) & 1;
}

/**
 * Discrete forward-difference of the parity field, curled into 4D.
 * Named ∇V in the Möbius shader, but this is torus-orientation gradient,
 * not the energy-potential gradient used for vacuum tests.
 *
 * @returns {[number, number, number, number]}
 */
export function moebiusTwistGradient(x, y, _seed = 0) {
  const p00 = moebiusParity(x, y);
  const p10 = moebiusParity(x + 1, y);
  const p01 = moebiusParity(x, y + 1);
  const gx = p10 - p00;
  const gy = p01 - p00;
  const gz = (gx + gy) * 0.5;
  const gw = (gx - gy) * 0.5;
  return [gx, gy, gz, gw];
}

/** Shader equivalent: twist = normalize(gradientField(x, y)). */
export function gradientField(x, y, seed = 0) {
  return moebiusTwistGradient(x, y, seed);
}

export function normalizeVec4(v) {
  const n = Math.hypot(v[0], v[1], v[2], v[3]);
  if (n < 1e-12) return [0, 0, 0, 0];
  return [v[0] / n, v[1] / n, v[2] / n, v[3] / n];
}

export function twist(x, y, seed = 0) {
  return normalizeVec4(gradientField(x, y, seed));
}

export function axialToCartesian(q, r, spacing = 1) {
  return [spacing * (q + r * 0.5), spacing * (r * Math.sqrt(3) / 2)];
}

export function hexNeighbors(q, r) {
  return HEX_DIRS.map(([dq, dr]) => [q + dq, r + dr]);
}

export function cellKey(q, r) {
  return `${q},${r}`;
}

export function edgeKey(q1, r1, q2, r2) {
  if (q1 < q2 || (q1 === q2 && r1 < r2)) return `${q1},${r1}|${q2},${r2}`;
  return `${q2},${r2}|${q1},${r1}`;
}

/**
 * Hex cells in a hexagonal region (cube coordinates, q+r+s=0).
 * Same iteration as generateMoebiusSubstrate in the plugin.
 */
export function hexCellsInRadius(radius) {
  const cells = [];
  for (let s = -radius; s <= radius; s++) {
    for (
      let q = Math.max(-radius, -s - radius);
      q <= Math.min(radius, -s + radius);
      q++
    ) {
      const r = -s - q;
      cells.push({ q, r });
    }
  }
  return cells;
}

/**
 * Six boundary edges of hex cell (q,r), in winding order.
 * Each side is the dual link from this cell to one neighbor.
 */
export function hexBoundaryEdges(q, r) {
  return HEX_DIRS.map(([dq, dr]) => ({
    q1: q,
    r1: r,
    q2: q + dq,
    r2: r + dr,
    key: edgeKey(q, r, q + dq, r + dr),
  }));
}

/**
 * Loop consistency: XOR of the six edge parities around a cell.
 * Even (0) = consistent petal loop. Odd (1) = rupture / defect.
 * A 6-cycle of identical twists is even — checkerboard vertex coloring
 * and the all-zero assignment are both consistent.
 */
export function hexLoopXor(edgeParity, q, r) {
  let x = 0;
  for (const e of hexBoundaryEdges(q, r)) {
    x ^= edgeParity.get(e.key) ?? 0;
  }
  return x & 1;
}

export function hexLoopConsistent(edgeParity, q, r) {
  return hexLoopXor(edgeParity, q, r) === 0;
}
