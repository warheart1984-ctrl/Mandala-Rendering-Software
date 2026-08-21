import { createHash } from "node:crypto";
import type {
  CharacterRigBinding,
  Vec3Tuple,
  Vec4Tuple,
  WireMesh4D,
} from "./scene-store.js";
import {
  buildMoebiusWireMesh4d,
  type moebiusParity,
  type moebiusTwistGradient,
} from "./moebius-substrate.js";

function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/** Hash-derived unit interval in [0, 1). Replay-stable; not Math.random. */
function unitFromHash(hex: string, offset: number): number {
  const slice = hex.slice(offset % 56, (offset % 56) + 8);
  return (Number.parseInt(slice, 16) >>> 0) / 0x1_0000_0000;
}

function tesseractVertices(): Vec4Tuple[] {
  const verts: Vec4Tuple[] = [];
  for (let i = 0; i < 16; i++) {
    verts.push([
      i & 1 ? 1 : -1,
      i & 2 ? 1 : -1,
      i & 4 ? 1 : -1,
      i & 8 ? 1 : -1,
    ]);
  }
  return verts;
}

function tesseractEdges(): Array<readonly [number, number]> {
  const edges: Array<readonly [number, number]> = [];
  for (let a = 0; a < 16; a++) {
    for (let bit = 0; bit < 4; bit++) {
      const b = a ^ (1 << bit);
      if (a < b) edges.push([a, b]);
    }
  }
  return edges;
}

/**
 * Six great-circle filaments on coordinate 4-planes (energy field).
 * Count and positions are deterministic from sceneSeedHex.
 */
function energyFilaments(sceneSeedHex: string): {
  vertices: Vec4Tuple[];
  edges: Array<readonly [number, number]>;
} {
  const planes: Array<readonly [number, number]> = [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 3],
  ];
  const samples = 12;
  const vertices: Vec4Tuple[] = [];
  const edges: Array<readonly [number, number]> = [];
  let radius = 1.35 + unitFromHash(sceneSeedHex, 0) * 0.25;

  for (let p = 0; p < planes.length; p++) {
    const [i, j] = planes[p]!;
    const phase = unitFromHash(sceneSeedHex, 8 + p * 8) * Math.PI * 2;
    const start = vertices.length;
    for (let s = 0; s < samples; s++) {
      const t = (s / samples) * Math.PI * 2 + phase;
      const v: [number, number, number, number] = [0, 0, 0, 0];
      v[i] = Math.cos(t) * radius;
      v[j] = Math.sin(t) * radius;
      vertices.push(v);
    }
    for (let s = 0; s < samples; s++) {
      edges.push([start + s, start + ((s + 1) % samples)]);
    }
    radius *= 0.97;
  }
  return { vertices, edges };
}

function rigPolylines(binding: CharacterRigBinding): {
  vertices: Vec4Tuple[];
  edges: Array<readonly [number, number]>;
} {
  const indexById = new Map<string, number>();
  const vertices: Vec4Tuple[] = [];
  const edges: Array<readonly [number, number]> = [];

  for (const bone of binding.bones) {
    const w = (unitFromHash(sha256Hex(bone.id), 0) - 0.5) * 0.4;
    indexById.set(bone.id, vertices.length);
    vertices.push([bone.position3d[0], bone.position3d[1], bone.position3d[2], w]);
  }
  for (const bone of binding.bones) {
    if (bone.parentId === null) continue;
    const a = indexById.get(bone.parentId);
    const b = indexById.get(bone.id);
    if (a !== undefined && b !== undefined) edges.push([a, b]);
  }
  return { vertices, edges };
}

function offsetEdges(
  edges: Array<readonly [number, number]>,
  offset: number
): Array<readonly [number, number]> {
  return edges.map(([a, b]) => [a + offset, b + offset] as const);
}

/**
 * Build the energy wire mesh for a scene.
 *
 * @param input.topology - "tesseract" (default) or "moebius" for Möbius Flower substrate
 * @param input.gridRadius - Hex grid radius for Möbius topology (default 3)
 * @param input.torusRadius - Torus major radius for Möbius topology (default 1.5)
 */
export function buildEnergyWireMesh4d(input: {
  sceneSeedHex: string;
  rigBinding?: CharacterRigBinding;
  topology?: "tesseract" | "moebius";
  gridRadius?: number;
  torusRadius?: number;
}): WireMesh4D {
  // ── Möbius Flower topology ──
  if (input.topology === "moebius") {
    const moebius = buildMoebiusWireMesh4d({
      sceneSeedHex: input.sceneSeedHex,
      gridRadius: input.gridRadius ?? 3,
      torusRadius: input.torusRadius ?? 1.5,
    });

    // Append rig polylines if bound
    let includesRigPolylines = false;
    const vertices: Vec4Tuple[] = [...moebius.vertices];
    const edges: Array<readonly [number, number]> = [...moebius.edges];

    if (input.rigBinding) {
      const rig = rigPolylines(input.rigBinding);
      const off = vertices.length;
      vertices.push(...rig.vertices);
      edges.push(...offsetEdges(rig.edges, off));
      includesRigPolylines = true;
    }

    const payload = { vertices, edges, includesRigPolylines };
    const meshSha256 = sha256Hex(JSON.stringify(payload));

    return {
      schemaVersion: "rt4d-wire-mesh/v0.1",
      statusTag: "partial",
      kind: "moebius_substrate",
      vertices,
      edges,
      vertexCount: vertices.length,
      edgeCount: edges.length,
      meshSha256,
      includesRigPolylines,
    };
  }

  // ── Default tesseract + filaments topology ──
  const tessV = tesseractVertices();
  const tessE = tesseractEdges();
  const filaments = energyFilaments(input.sceneSeedHex);

  const vertices: Vec4Tuple[] = [...tessV, ...filaments.vertices];
  const edges: Array<readonly [number, number]> = [
    ...tessE,
    ...offsetEdges(filaments.edges, tessV.length),
  ];

  let includesRigPolylines = false;
  if (input.rigBinding) {
    const rig = rigPolylines(input.rigBinding);
    const off = vertices.length;
    vertices.push(...rig.vertices);
    edges.push(...offsetEdges(rig.edges, off));
    includesRigPolylines = true;
  }

  const payload = { vertices, edges, includesRigPolylines };
  const meshSha256 = sha256Hex(JSON.stringify(payload));

  return {
    schemaVersion: "rt4d-wire-mesh/v0.1",
    statusTag: "partial",
    kind: "energy_field",
    vertices,
    edges,
    vertexCount: vertices.length,
    edgeCount: edges.length,
    meshSha256,
    includesRigPolylines,
  };
}

/** Perspective project 4D → 3D using the scene's d₄ (replay-stable). */
export function projectWireMeshTo3d(
  mesh: WireMesh4D,
  distance4d: number
): Array<Vec3Tuple> {
  const d4 = distance4d === 0 ? 4 : distance4d;
  return mesh.vertices.map(([x, y, z, w]) => {
    const k = d4 / (d4 - w);
    return [x * k, y * k, z * k];
  });
}
