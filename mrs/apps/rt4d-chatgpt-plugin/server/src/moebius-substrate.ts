/**
 * Möbius Flower Substrate — hexagonal lattice with twist assignments.
 *
 * Maps RHFD vacuum physics → Möbius topology → Mandala wire mesh:
 *   - Each hexagonal cell = one local equilibrium loop
 *   - The torus = global topology of the vacuum substrate
 *   - Twist assignment f(x,y) = (x + y) mod 2 → η(t) parity
 *   - Twist gradient → ∇V (torus curvature)
 *
 * Deterministic: seeded via sceneSeedHex. P4 replayable.
 */

import { createHash } from "node:crypto";

/** Type import — reuse the existing Vec4Tuple from scene-store. */
type Vec4Tuple = [number, number, number, number];
type Edge = readonly [number, number];

// ── Helpers ──────────────────────────────────────────────────────

function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function unitFromHash(hex: string, offset: number): number {
  const slice = hex.slice(offset % 56, (offset % 56) + 8);
  return (Number.parseInt(slice, 16) >>> 0) / 0x1_0000_0000;
}

/**
 * Möbius twist parity: f(x, y) = (x + y) mod 2.
 * Returns 0 or 1 — the orientation parity of the hex cell.
 * This is the discrete form of η(t).
 */
export function moebiusParity(x: number, y: number): number {
  return (x + y) & 1;
}

/**
 * Twist gradient: ∇V as the discrete curl of the parity field.
 * Returns a 4D vector representing the local torus curvature.
 * This is the discrete form of ∇V.
 */
export function moebiusTwistGradient(
  x: number,
  y: number,
  _seed: number
): Vec4Tuple {
  // Discrete gradient of parity field
  const p00 = moebiusParity(x, y);
  const p10 = moebiusParity(x + 1, y);
  const p01 = moebiusParity(x, y + 1);

  // Gradient components (forward difference)
  const gx = p10 - p00; // ±1 or 0
  const gy = p01 - p00; // ±1 or 0

  // Curl into 4D (twist on ZW plane from XY gradient)
  const gz = (gx + gy) * 0.5;
  const gw = (gx - gy) * 0.5;

  return [gx, gy, gz, gw];
}

// ── Hexagonal Lattice Generation ─────────────────────────────────

/**
 * Axial hex coordinates to 4D position on a torus.
 *
 * The hex lattice sits on the surface of a torus with:
 *   - Major radius R (tube center distance from torus center)
 *   - Minor radius r (tube radius)
 *   - Hex grid mapped to toroidal angles (θ, φ)
 *
 * Each hex cell gets a w-coordinate from the twist parity.
 */
function hexToTorus4d(
  q: number,
  r: number,
  R: number,
  radiusScale: number,
  seed: number
): Vec4Tuple {
  // Hex spacing on flat grid
  const spacing = R * 0.6;
  const xFlat = spacing * (q + r * 0.5);
  const yFlat = spacing * (r * Math.sqrt(3) / 2);

  // Map to torus angles
  const theta = xFlat / R; // toroidal angle
  const phi = yFlat / R; // poloidal angle

  // Torus surface point
  const rr = R + radiusScale * Math.cos(phi);
  const x = rr * Math.cos(theta);
  const y = rr * Math.sin(theta);
  const z = radiusScale * Math.sin(phi);

  // w-coordinate from twist parity + seed offset
  const parity = moebiusParity(q, r);
  const wOffset = (unitFromHash(sha256Hex(`${q},${r},${seed}`), 0) - 0.5) * 0.3;
  const w = (parity === 0 ? -0.15 : 0.15) + wOffset;

  return [x, y, z, w];
}

/**
 * Generate hex neighbors in axial coordinates.
 * Standard hex grid: 6 neighbors per cell.
 */
function hexNeighbors(q: number, r: number): Array<[number, number]> {
  return [
    [q + 1, r],
    [q - 1, r],
    [q, r + 1],
    [q, r - 1],
    [q + 1, r - 1],
    [q - 1, r + 1],
  ];
}

/**
 * Generate a hexagonal lattice grid within a radius.
 *
 * @param gridRadius - Number of hex rings around origin (default 3)
 * @param R - Torus major radius (default 1.5)
 * @param sceneSeedHex - Deterministic seed from scene
 * @returns Vertices and edges of the Möbius substrate
 */
export function generateMoebiusSubstrate(
  gridRadius: number = 3,
  R: number = 1.5,
  sceneSeedHex: string = "0".repeat(64)
): {
  vertices: Vec4Tuple[];
  edges: Edge[];
  parityMap: Map<string, number>; // "q,r" → parity
} {
  const vertices: Vec4Tuple[] = [];
  const edges: Edge[] = [];
  const parityMap = new Map<string, number>();
  const indexMap = new Map<string, number>(); // "q,r" → vertex index

  // Generate hex cells in a hexagonal region
  for (let qr = -gridRadius; qr <= gridRadius; qr++) {
    for (let q = Math.max(-gridRadius, -qr - gridRadius);
         q <= Math.min(gridRadius, -qr + gridRadius);
         q++) {
      const r = -qr - q;
      const key = `${q},${r}`;
      const parity = moebiusParity(q, r);

      parityMap.set(key, parity);
      indexMap.set(key, vertices.length);

      const v = hexToTorus4d(q, r, R, 1.0, sceneSeedHex);
      vertices.push(v);
    }
  }

  // Generate edges (hex neighbor connections)
  for (const [key, idx] of indexMap) {
    const [q, r] = key.split(",").map(Number);
    for (const [nq, nr] of hexNeighbors(q, r)) {
      const nKey = `${nq},${nr}`;
      const nIdx = indexMap.get(nKey);
      if (nIdx !== undefined && idx < nIdx) {
        edges.push([idx, nIdx]);
      }
    }
  }

  return { vertices, edges, parityMap };
}

/**
 * Compute twist gradient field over the hex lattice.
 * Each vertex gets a 4D twist vector from the local parity gradient.
 */
export function computeTwistGradientField(
  parityMap: Map<string, number>,
  seed: string
): Vec4Tuple[] {
  const gradients: Vec4Tuple[] = [];
  const seedNum = Number.parseInt(seed.slice(0, 8), 16) || 0;

  for (const [key] of parityMap) {
    const [q, r] = key.split(",").map(Number);
    const grad = moebiusTwistGradient(q, r, seedNum);
    gradients.push(grad);
  }

  return gradients;
}

/**
 * Build a complete Möbius Flower wire mesh compatible with WireMesh4D.
 * Combines hex lattice + twist assignments + gradient field.
 */
export function buildMoebiusWireMesh4d(input: {
  sceneSeedHex: string;
  gridRadius?: number;
  torusRadius?: number;
}): {
  schemaVersion: string;
  kind: string;
  vertices: Vec4Tuple[];
  edges: Edge[];
  vertexCount: number;
  edgeCount: number;
  meshSha256: string;
  includesRigPolylines: boolean;
  moebiusParityMap: Map<string, number>;
  twistGradients: Vec4Tuple[];
} {
  const gridRadius = input.gridRadius ?? 3;
  const torusRadius = input.torusRadius ?? 1.5;

  const { vertices, edges, parityMap } = generateMoebiusSubstrate(
    gridRadius,
    torusRadius,
    input.sceneSeedHex
  );

  const twistGradients = computeTwistGradientField(
    parityMap,
    input.sceneSeedHex
  );

  const payload = {
    vertices,
    edges,
    includesRigPolylines: false,
    moebiusGridRadius: gridRadius,
    moebiusTorusRadius: torusRadius,
  };
  const meshSha256 = sha256Hex(JSON.stringify(payload));

  return {
    schemaVersion: "rt4d-wire-mesh/v0.1",
    kind: "moebius_substrate",
    vertices,
    edges,
    vertexCount: vertices.length,
    edgeCount: edges.length,
    meshSha256,
    includesRigPolylines: false,
    moebiusParityMap: parityMap,
    twistGradients,
  };
}
