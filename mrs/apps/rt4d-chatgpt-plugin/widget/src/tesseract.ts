import * as THREE from "three";

/** 16 vertices of a unit tesseract (±1 on each of x,y,z,w). */
export function tesseractVertices4(): Float32Array {
  const verts: number[] = [];
  for (let i = 0; i < 16; i++) {
    verts.push(
      (i & 1) !== 0 ? 1 : -1,
      (i & 2) !== 0 ? 1 : -1,
      (i & 4) !== 0 ? 1 : -1,
      (i & 8) !== 0 ? 1 : -1
    );
  }
  return new Float32Array(verts);
}

/** Edges connecting vertices that differ by exactly one bit. */
export function tesseractEdges(): Array<[number, number]> {
  const edges: Array<[number, number]> = [];
  for (let a = 0; a < 16; a++) {
    for (let b = a + 1; b < 16; b++) {
      let diff = 0;
      let x = a ^ b;
      while (x) {
        diff += x & 1;
        x >>= 1;
      }
      if (diff === 1) edges.push([a, b]);
    }
  }
  return edges;
}

function rotatePlane(
  v: [number, number, number, number],
  i: number,
  j: number,
  angle: number
): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const a = v[i];
  const b = v[j];
  v[i] = a * c - b * s;
  v[j] = a * s + b * c;
}

/** Perspective project 4D → 3D with distance d4. */
export function project4to3(
  x: number,
  y: number,
  z: number,
  w: number,
  distance4d: number
): THREE.Vector3 {
  const d = Math.max(0.15, distance4d);
  const factor = d / (d - w);
  return new THREE.Vector3(x * factor, y * factor, z * factor);
}

export type PlaneAngles = {
  xw: number;
  yw: number;
  zw: number;
};

/**
 * Build / update a Three.js LineSegments mesh for the projected tesseract.
 * Visual = dimensional preview only — not AnimeStylizer / photoreal.
 */
export function buildTesseractGeometry(
  angles: PlaneAngles,
  distance4d: number
): THREE.BufferGeometry {
  const base = tesseractVertices4();
  const edges = tesseractEdges();
  const positions = new Float32Array(edges.length * 2 * 3);

  for (let e = 0; e < edges.length; e++) {
    const [ia, ib] = edges[e];
    for (const [vi, offset] of [
      [ia, 0],
      [ib, 1],
    ] as const) {
      const v: [number, number, number, number] = [
        base[vi * 4],
        base[vi * 4 + 1],
        base[vi * 4 + 2],
        base[vi * 4 + 3],
      ];
      rotatePlane(v, 0, 3, angles.xw);
      rotatePlane(v, 1, 3, angles.yw);
      rotatePlane(v, 2, 3, angles.zw);
      const p = project4to3(v[0], v[1], v[2], v[3], distance4d);
      const o = (e * 2 + offset) * 3;
      positions[o] = p.x;
      positions[o + 1] = p.y;
      positions[o + 2] = p.z;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geo;
}
