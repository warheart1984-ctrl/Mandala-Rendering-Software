#!/usr/bin/env node
/**
 * build-face-fixture-glb.mjs — synthetic HumanFace*.glb for CI / demos.
 *
 * Status: **fixture** (low tris). NOT a production 20k–40k sculpt.
 * Compatible with HumanRigLoader extras (humanRigBone, morph ids, mesh roles).
 *
 * Usage:
 *   node scripts/build-face-fixture-glb.mjs
 *   node scripts/build-face-fixture-glb.mjs --out-dir ../../assets/human
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ASSETS = join(__dirname, "..", "..", "..", "assets", "human");

const BONES = [
  "Head",
  "Jaw",
  "LeftEye",
  "RightEye",
  "LeftBrow",
  "RightBrow",
  "UpperLip",
  "LowerLip",
];

const BLENDSHAPES = [
  "Smile",
  "Frown",
  "BlinkLeft",
  "BlinkRight",
  "Squint",
  "WideEyes",
  "MouthOpen",
  "MouthNarrow",
];

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function align4(n) {
  return (n + 3) & ~3;
}

function concatBytes(chunks) {
  const total = chunks.reduce((s, c) => s + c.byteLength, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

function u32(v) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, v, true);
  return out;
}

function f32(values) {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((v, i) => view.setFloat32(i * 4, v, true));
  return out;
}

function u16(values) {
  const out = new Uint8Array(values.length * 2);
  const view = new DataView(out.buffer);
  values.forEach((v, i) => view.setUint16(i * 2, v, true));
  return out;
}

function pad(bytes, padByte = 0) {
  const out = new Uint8Array(align4(bytes.byteLength));
  out.fill(padByte);
  out.set(bytes);
  return out;
}

/** Low-poly UV sphere (fixture). */
function buildSphere(latBands = 8, lonBands = 12, radius = 0.55) {
  const positions = [];
  const normals = [];
  for (let lat = 0; lat <= latBands; lat++) {
    const theta = (lat * Math.PI) / latBands;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    for (let lon = 0; lon <= lonBands; lon++) {
      const phi = (lon * 2 * Math.PI) / lonBands;
      const x = radius * Math.cos(phi) * sinT;
      const y = radius * cosT + 0.15; // slight upward bias (head)
      const z = radius * Math.sin(phi) * sinT;
      positions.push(x, y, z);
      const len = Math.hypot(x, y - 0.15, z) || 1;
      normals.push(x / len, (y - 0.15) / len, z / len);
    }
  }
  const indices = [];
  for (let lat = 0; lat < latBands; lat++) {
    for (let lon = 0; lon < lonBands; lon++) {
      const first = lat * (lonBands + 1) + lon;
      const second = first + lonBands + 1;
      indices.push(first, second, first + 1);
      indices.push(second, second + 1, first + 1);
    }
  }
  return { positions, normals, indices, vertexCount: positions.length / 3 };
}

function morphDeltas(vertexCount, kind) {
  const d = new Array(vertexCount * 3).fill(0);
  for (let i = 0; i < vertexCount; i++) {
    const o = i * 3;
    // Synthetic deltas — not anatomical; enough for deform tests.
    switch (kind) {
      case "Smile":
        d[o] = (i % 3 === 0 ? 0.04 : -0.02);
        d[o + 1] = 0.02;
        break;
      case "Frown":
        d[o + 1] = -0.03;
        break;
      case "BlinkLeft":
        if (i % 5 === 0) d[o + 1] = -0.05;
        break;
      case "BlinkRight":
        if (i % 5 === 1) d[o + 1] = -0.05;
        break;
      case "Squint":
        d[o + 2] = 0.02;
        break;
      case "WideEyes":
        d[o + 1] = 0.04;
        break;
      case "MouthOpen":
        d[o + 1] = i > vertexCount / 2 ? -0.06 : 0.02;
        break;
      case "MouthNarrow":
        d[o] *= 0;
        d[o] = (i % 2 === 0 ? -0.03 : 0.03);
        break;
      default:
        break;
    }
  }
  return d;
}

function buildGlb({ withMorphs }) {
  const sphere = buildSphere();
  const bufferViews = [];
  const accessors = [];
  const binChunks = [];
  let byteOffset = 0;

  function addAccessor(bytes, componentType, count, type) {
    const padded = pad(bytes);
    const bv = bufferViews.length;
    bufferViews.push({ byteOffset, byteLength: bytes.byteLength });
    binChunks.push(padded);
    byteOffset += padded.byteLength;
    const ai = accessors.length;
    accessors.push({ bufferView: bv, componentType, count, type });
    return ai;
  }

  const position = addAccessor(f32(sphere.positions), 5126, sphere.vertexCount, "VEC3");
  const normal = addAccessor(f32(sphere.normals), 5126, sphere.vertexCount, "VEC3");

  // All verts → Head (joint 0)
  const jointsArr = [];
  const weightsArr = [];
  for (let i = 0; i < sphere.vertexCount; i++) {
    jointsArr.push(0, 0, 0, 0);
    weightsArr.push(1, 0, 0, 0);
  }
  const joints = addAccessor(u16(jointsArr), 5123, sphere.vertexCount, "VEC4");
  const weights = addAccessor(f32(weightsArr), 5126, sphere.vertexCount, "VEC4");
  const indices = addAccessor(u16(sphere.indices), 5123, sphere.indices.length, "SCALAR");

  const ibm = [];
  for (let i = 0; i < BONES.length; i++) ibm.push(...IDENTITY);
  const inverseBind = addAccessor(f32(ibm), 5126, BONES.length, "MAT4");

  const targets = [];
  if (withMorphs) {
    for (const name of BLENDSHAPES) {
      const deltaAcc = addAccessor(
        f32(morphDeltas(sphere.vertexCount, name)),
        5126,
        sphere.vertexCount,
        "VEC3",
      );
      targets.push({ POSITION: deltaAcc, extras: { humanRigMorphId: name } });
    }
  }

  // Nodes: Armature root (not a joint) + bone joints + mesh node
  // Skin joints = bone node indices 1..8 (Head..LowerLip)
  // Node 0 = Armature (extras capabilities)
  // Nodes 1..8 = bones
  // Node 9 = mesh

  const boneNodes = BONES.map((name, i) => {
    const parentChild =
      i === 0
        ? { children: [2, 3, 4, 5, 6, 7, 8] } // Head children: Jaw..LowerLip (indices 2..8)
        : {};
    // Fix hierarchy: Head is root bone (index 1), others parented to Head.
    if (i === 0) {
      return {
        name,
        matrix: IDENTITY,
        children: [2, 3, 4, 5, 6, 7, 8],
        extras: { humanRigBone: true },
      };
    }
    return {
      name,
      matrix: IDENTITY,
      extras: { humanRigBone: true },
      ...parentChild,
    };
  });

  // Rebuild bone nodes cleanly
  const nodes = [
    {
      name: "Armature",
      children: [1],
      matrix: IDENTITY,
      extras: {
        humanRigCapabilities: {
          morphTargets: withMorphs,
          multiSkin: false,
          microMotion: true,
        },
      },
    },
    {
      name: "Head",
      matrix: IDENTITY,
      children: [2, 3, 4, 5, 6, 7, 8],
      extras: { humanRigBone: true },
    },
    ...BONES.slice(1).map((name) => ({
      name,
      matrix: IDENTITY,
      extras: { humanRigBone: true },
    })),
    {
      name: "FaceMesh",
      mesh: 0,
      skin: 0,
      extras: {
        humanRigMeshRole: "face",
        humanRigMeshSkinId: "face_skin",
      },
    },
  ];

  // joints: nodes 1..8
  const jointIndices = [1, 2, 3, 4, 5, 6, 7, 8];

  const gltf = {
    asset: {
      version: "2.0",
      generator: "engine3d-core/build-face-fixture-glb",
    },
    buffers: [{ byteLength: byteOffset }],
    bufferViews,
    accessors,
    nodes,
    skins: [
      {
        name: "Armature",
        joints: jointIndices,
        skeleton: 1,
        inverseBindMatrices: inverseBind,
      },
    ],
    meshes: [
      {
        name: "HumanFace",
        primitives: [
          {
            attributes: {
              POSITION: position,
              NORMAL: normal,
              JOINTS_0: joints,
              WEIGHTS_0: weights,
            },
            indices,
            material: 0,
            ...(targets.length ? { targets } : {}),
            extras: {
              humanRigMorphIds: withMorphs ? [...BLENDSHAPES] : [],
            },
          },
        ],
        extras: { humanRigMeshRole: "face" },
      },
    ],
    materials: [
      {
        name: "face_skin",
        extras: { humanRigMaterialType: "skin" },
        pbrMetallicRoughness: {
          baseColorFactor: [0.9, 0.74, 0.62, 1],
          roughnessFactor: 0.55,
          metallicFactor: 0,
        },
      },
      {
        name: "eye",
        extras: { humanRigMaterialType: "eyes" },
        pbrMetallicRoughness: {
          baseColorFactor: [0.15, 0.2, 0.35, 1],
          roughnessFactor: 0.1,
          metallicFactor: 0,
        },
      },
      {
        name: "mouth",
        extras: { humanRigMaterialType: "skin" },
        pbrMetallicRoughness: {
          baseColorFactor: [0.75, 0.35, 0.35, 1],
          roughnessFactor: 0.45,
          metallicFactor: 0,
        },
      },
    ],
    animations: [
      {
        name: "neutral",
        extras: {
          humanRigPoseId: "neutral",
          ...(withMorphs
            ? { humanRigMorphCurveIds: [...BLENDSHAPES] }
            : {}),
        },
      },
    ],
  };

  const enc = new TextEncoder();
  const json = pad(enc.encode(JSON.stringify(gltf)), 0x20);
  // Fix buffer byteLength after final pad of bin
  const bin = concatBytes(binChunks);
  gltf.buffers[0].byteLength = bin.byteLength;
  const json2 = pad(enc.encode(JSON.stringify(gltf)), 0x20);
  const totalLength = 12 + 8 + json2.byteLength + 8 + bin.byteLength;
  return concatBytes([
    u32(0x46546c67),
    u32(2),
    u32(totalLength),
    u32(json2.byteLength),
    u32(0x4e4f534a),
    json2,
    u32(bin.byteLength),
    u32(0x004e4942),
    bin,
  ]);
}

function parseArgs(argv) {
  let outDir = REPO_ASSETS;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out-dir" && argv[i + 1]) {
      outDir = argv[++i];
    }
  }
  return { outDir };
}

const { outDir } = parseArgs(process.argv.slice(2));
mkdirSync(outDir, { recursive: true });

const rigged = buildGlb({ withMorphs: true });
const neutral = buildGlb({ withMorphs: false });

const riggedPath = join(outDir, "HumanFaceRigged.glb");
const neutralPath = join(outDir, "HumanFaceNeutral.glb");
writeFileSync(riggedPath, rigged);
writeFileSync(neutralPath, neutral);

process.stdout.write(
  JSON.stringify(
    {
      status: "ok",
      kind: "face-fixture-glb",
      note: "Synthetic low-tris fixture — NOT production anatomy",
      HumanFaceRigged: riggedPath,
      HumanFaceNeutral: neutralPath,
      bones: BONES,
      blendshapes: BLENDSHAPES,
      bytes: { rigged: rigged.byteLength, neutral: neutral.byteLength },
    },
    null,
    2,
  ) + "\n",
);
