/**
 * Minimal glTF 2.0 GLB encoder for RT4D projected wire meshes.
 * Status: partial — convex / energy-field hull, not an anatomical fox sculpt.
 */

export type Vec3 = [number, number, number];

export const GLB_MESH_NAME = "body";
export const GLB_MODEL_ROOT = "rt4d-model";
export const GLB_FIXTURE_STATUS = "core-enforced-fixture-not-production-glb";

/** Named animation targets. Mesh `body` is parented under `spine` so XW motion is visible. */
export const POSE_BONE_IDS = [
  "root",
  "pelvis",
  "spine",
  "chest",
  "neck",
  "head",
  "jaw",
  "ear_L",
  "ear_R",
  "shoulder_L",
  "arm_L",
  "paw_L",
  "shoulder_R",
  "arm_R",
  "paw_R",
  "leg_L",
  "foot_L",
  "leg_R",
  "foot_R",
  "tail",
] as const;

export type PoseBoneId = (typeof POSE_BONE_IDS)[number];

const PARENT_OF: Record<PoseBoneId, PoseBoneId | null> = {
  root: null,
  pelvis: "root",
  spine: "pelvis",
  chest: "spine",
  neck: "chest",
  head: "neck",
  jaw: "head",
  ear_L: "head",
  ear_R: "head",
  shoulder_L: "chest",
  arm_L: "shoulder_L",
  paw_L: "arm_L",
  shoulder_R: "chest",
  arm_R: "shoulder_R",
  paw_R: "arm_R",
  leg_L: "pelvis",
  foot_L: "leg_L",
  leg_R: "pelvis",
  foot_R: "leg_R",
  tail: "pelvis",
};

function padTo4(bytes: Uint8Array, padByte: number): Uint8Array {
  const extra = (4 - (bytes.length % 4)) % 4;
  if (extra === 0) return bytes;
  const out = new Uint8Array(bytes.length + extra);
  out.set(bytes);
  out.fill(padByte, bytes.length);
  return out;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function tetrahedron(): { positions: Vec3[]; triangles: [number, number, number][] } {
  return {
    positions: [
      [0, 1, 0],
      [1, -0.4, 0.7],
      [-1, -0.4, 0.7],
      [0, -0.4, -1],
    ],
    triangles: [
      [0, 1, 2],
      [0, 2, 3],
      [0, 3, 1],
      [1, 3, 2],
    ],
  };
}

/** Tiny local-demo hull so the widget can load a GLB without MCP. */
export function encodeDemoFixtureGlb(): Uint8Array {
  const t = tetrahedron();
  return encodeProjectedMeshToGlb(t.positions, t.triangles);
}

export function encodeProjectedMeshToGlb(
  positionsIn: ReadonlyArray<readonly [number, number, number]>,
  trianglesIn: ReadonlyArray<readonly [number, number, number]>
): Uint8Array {
  let positions = positionsIn.map((p) => [p[0], p[1], p[2]] as Vec3);
  let triangles = trianglesIn.map((t) => [t[0], t[1], t[2]] as [number, number, number]);
  if (positions.length < 3 || triangles.length < 1) {
    const fallback = tetrahedron();
    positions = fallback.positions;
    triangles = fallback.triangles;
  }

  const pos = new Float32Array(positions.length * 3);
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < positions.length; i++) {
    const [x, y, z] = positions[i];
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  const idx = new Uint32Array(triangles.length * 3);
  for (let i = 0; i < triangles.length; i++) {
    idx[i * 3] = triangles[i][0];
    idx[i * 3 + 1] = triangles[i][1];
    idx[i * 3 + 2] = triangles[i][2];
  }

  const posBytes = new Uint8Array(pos.buffer, pos.byteOffset, pos.byteLength);
  const idxBytes = new Uint8Array(idx.buffer, idx.byteOffset, idx.byteLength);
  const posPadded = padTo4(posBytes, 0);
  const idxPadded = padTo4(idxBytes, 0);
  const bin = concat([posPadded, idxPadded]);

  const boneIndex = new Map<string, number>();
  const nodes: Record<string, unknown>[] = [];
  for (let i = 0; i < POSE_BONE_IDS.length; i++) {
    boneIndex.set(POSE_BONE_IDS[i], i);
    nodes.push({ name: POSE_BONE_IDS[i], children: [] as number[] });
  }
  for (const id of POSE_BONE_IDS) {
    const parent = PARENT_OF[id];
    if (!parent) continue;
    const p = boneIndex.get(parent)!;
    const c = boneIndex.get(id)!;
    (nodes[p].children as number[]).push(c);
  }

  const spine = boneIndex.get("spine")!;
  const bodyNode = nodes.length;
  nodes.push({ name: GLB_MESH_NAME, mesh: 0 });
  (nodes[spine].children as number[]).push(bodyNode);

  for (const n of nodes) {
    if (Array.isArray(n.children) && n.children.length === 0) delete n.children;
  }

  const json: Record<string, unknown> = {
    asset: {
      version: "2.0",
      generator: "rt4d-chatgpt-plugin/partial-fixture",
    },
    extras: {
      status: GLB_FIXTURE_STATUS,
      visualKind: "projected_energy_hull",
      note: "Convex/adjacency hull from 4D wire mesh — not an anatomical fox or production sculpt.",
    },
    scene: 0,
    scenes: [{ nodes: [boneIndex.get("root")!] }],
    nodes,
    meshes: [
      {
        name: GLB_MESH_NAME,
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: GLB_MESH_NAME,
        pbrMetallicRoughness: {
          baseColorFactor: [0.83, 0.46, 0.23, 1],
          metallicFactor: 0,
          roughnessFactor: 0.85,
        },
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length,
        type: "VEC3",
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      },
      {
        bufferView: 1,
        componentType: 5125,
        count: triangles.length * 3,
        type: "SCALAR",
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: posPadded.length, byteLength: idxBytes.length, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length }],
  };

  const jsonBytes = padTo4(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  const binHeader = 20 + jsonBytes.length;
  view.setUint32(binHeader, bin.length, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  out.set(bin, binHeader + 8);
  return out;
}

export function glbMagicOk(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(0, true) === 0x46546c67 && view.getUint32(4, true) === 2;
}
