/**
 * Scene4D / RT4D primitives → GLB exporter.
 *
 * Exports governed geometry (spheres, planes, meshes, lights, camera)
 * to a binary GLB file for Blender/Cycles photoreal rendering.
 *
 * Usage:
 *   const glb = exportSceneToGLB(rt4dScene, camera);
 *   writeFileSync("scene.glb", glb);
 */

import { vec4 } from "../math/vec4.js";
import { Hypersphere } from "../geometry/hypersurface.js";
import { Hyperplane } from "../geometry/hypersurface.js";
import { TriangleMesh4D } from "../geometry/TriangleMesh4D.js";

function uint8(str) {
  const enc = new TextEncoder();
  return enc.encode(str);
}

function padTo4(len) {
  return (4 - (len % 4)) % 4;
}

function concatBuffers(...bufs) {
  const total = bufs.reduce((sum, b) => sum + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of bufs) {
    out.set(b, off);
    off += b.length;
  }
  return out;
}

function packVEC3(arr) {
  return new Float32Array(arr).buffer;
}

function packVEC4(arr) {
  return new Float32Array(arr).buffer;
}

function packUint32(val) {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setUint32(0, val, true);
  return buf;
}

function packUint16(val) {
  const buf = new ArrayBuffer(2);
  new DataView(buf).setUint16(0, val, true);
  return buf;
}

function packFloat(val) {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, val, true);
  return buf;
}

function buildGLTFJSON(sceneData) {
  const { meshes, materials, nodes, lights, camera } = sceneData;

  const accessors = [];
  const bufferViews = [];
  const buffers = [{ byteLength: sceneData.totalBytes }];

  let accessorIndex = 0;
  let bufferViewIndex = 0;
  let byteOffset = 0;

  const addAccessor = (bufferView, componentType, count, type, min, max) => {
    const acc = {
      bufferView,
      componentType,
      count,
      type,
      byteOffset: 0,
    };
    if (min) acc.min = min;
    if (max) acc.max = max;
    accessors.push(acc);
    return accessorIndex++;
  };

  const addBufferView = (buffer, byteOffset, byteLength, target) => {
    const bv = { buffer, byteOffset, byteLength };
    if (target) bv.target = target;
    bufferViews.push(bv);
    return bufferViewIndex++;
  };

  // Per-mesh buffers
  const meshPrimitives = meshes.map((mesh, mi) => {
    const attrs = {};

    const posBV = addBufferView(0, mesh.posOffset, mesh.posLength, 34962);
    attrs.POSITION = addAccessor(posBV, 5126, mesh.vertexCount, "VEC3",
      mesh.posMin, mesh.posMax);

    if (mesh.normalLength > 0) {
      const nBV = addBufferView(0, mesh.normOffset, mesh.normLength, 34962);
      attrs.NORMAL = addAccessor(nBV, 5126, mesh.vertexCount, "VEC3");
    }

    if (mesh.uvLength > 0) {
      const uvBV = addBufferView(0, mesh.uvOffset, mesh.uvLength, 34962);
      attrs.TEXCOORD_0 = addAccessor(uvBV, 5126, mesh.vertexCount, "VEC2");
    }

    const idxBV = addBufferView(0, mesh.idxOffset, mesh.idxLength, 34963);
    const idxAccessor = addAccessor(idxBV, 5125, mesh.indexCount, "SCALAR");

    return {
      attributes: attrs,
      indices: idxAccessor,
      material: mesh.materialIndex,
      mode: 4,
    };
  });

  const gltfMaterials = materials.map((m, i) => ({
    name: `mat_${i}`,
    pbrMetallicRoughness: {
      baseColorFactor: m.albedo,
      metallicFactor: m.metallic,
      roughnessFactor: m.roughness,
    },
    emissiveFactor: m.emission.slice(0, 3),
    doubleSided: true,
  }));

  const gltfNodes = nodes.map((n) => {
    const node = {
      name: n.name,
      translation: n.translation,
      rotation: n.rotation,
      scale: n.scale,
    };
    if (typeof n.meshIndex === "number" && n.meshIndex >= 0) node.mesh = n.meshIndex;
    if (Array.isArray(n.children) && n.children.length > 0) node.children = n.children;
    if (typeof n.camera === "number") node.camera = n.camera;
    if (n.extensions) node.extensions = n.extensions;
    return node;
  });

  const sceneNodes = nodes.filter((n) => n.parent === -1).map((n) => nodes.indexOf(n));

  const json = {
    asset: { version: "2.0", generator: "MRS-RT4D-GLB-Exporter" },
    scene: 0,
    scenes: [{ nodes: sceneNodes }],
    nodes: gltfNodes,
    meshes: meshPrimitives.map((p, i) => ({ primitives: [p], name: `mesh_${i}` })),
    materials: gltfMaterials,
    accessors,
    bufferViews,
    buffers,
  };

  if (lights.length > 0) {
    json.extensionsUsed = ["KHR_lights_punctual"];
    json.extensions = { KHR_lights_punctual: { lights } };
  }

  if (camera) {
    json.cameras = [{
      type: "perspective",
      perspective: {
        aspectRatio: camera.aspectRatio,
        yfov: camera.yfov,
        znear: camera.znear,
        zfar: camera.zfar,
      },
    }];
  }

  return json;
}

/** Copy a TypedArray into a tight Uint8Array (avoids oversized .buffer shares). */
function typedArrayBytes(ta) {
  return new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength);
}

function meshFromHypersphere(sphere, materialIndex) {
  // Icosphere subdivision for sphere approximation
  const subdivisions = 2; // 2^2 * 20 = 80 faces
  const verts = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  // Golden ratio for icosahedron
  const t = (1 + Math.sqrt(5)) / 2;
  const baseVerts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => {
    const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    return v.map((x) => x / len * sphere.radius);
  });

  const baseFaces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  function subdivide(face) {
    const a = face[0], b = face[1], c = face[2];
    const ab = normalize(vecAdd(baseVerts[a], baseVerts[b]));
    const bc = normalize(vecAdd(baseVerts[b], baseVerts[c]));
    const ca = normalize(vecAdd(baseVerts[c], baseVerts[a]));
    const iab = baseVerts.push(ab) - 1;
    const ibc = baseVerts.push(bc) - 1;
    const ica = baseVerts.push(ca) - 1;
    return [
      [a, iab, ica],
      [b, ibc, iab],
      [c, ica, ibc],
      [iab, ibc, ica],
    ];
  }

  let faces = baseFaces;
  for (let i = 0; i < subdivisions; i++) {
    faces = faces.flatMap(subdivide);
  }

  for (const face of faces) {
    const baseIdx = verts.length / 3;
    for (const vi of face) {
      const v = baseVerts[vi];
      verts.push(v[0], v[1], v[2]);
      normals.push(v[0], v[1], v[2]);
      uvs.push(0.5 + Math.atan2(v[2], v[0]) / (2 * Math.PI), 0.5 - Math.asin(v[1]) / Math.PI);
    }
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
  }

  return {
    vertices: new Float32Array(verts),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    materialIndex,
  };
}

function meshFromHyperplane(plane, materialIndex) {
  // Large quad for plane
  const extent = 100;
  const n = plane.normal;
  // Find two orthogonal vectors in plane
  const absN = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
  const u = absN[0] < absN[1] ? (absN[0] < absN[2] ? [1, 0, 0] : [0, 0, 1]) : (absN[1] < absN[2] ? [0, 1, 0] : [0, 0, 1]);
  const uVec = normalize3(cross3(n, u));
  const vVec = normalize3(cross3(n, uVec));
  const d = plane.offset;

  const verts = [
    [extent, extent, 0], [-extent, extent, 0], [-extent, -extent, 0], [extent, -extent, 0],
  ].map(([x, y]) => {
    const px = n.x * d + uVec[0] * x + vVec[0] * y;
    const py = n.y * d + uVec[1] * x + vVec[1] * y;
    const pz = n.z * d + uVec[2] * x + vVec[2] * y;
    return [px, py, pz];
  });

  const faces = [[0, 1, 2], [0, 2, 3]];
  const vertices = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (const face of faces) {
    const baseIdx = vertices.length / 3;
    for (const vi of face) {
      const v = verts[vi];
      vertices.push(v[0], v[1], v[2]);
      normals.push(n.x, n.y, n.z);
      uvs.push((face.indexOf(vi) % 2), Math.floor(face.indexOf(vi) / 2));
    }
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
  }

  return {
    vertices: new Float32Array(vertices),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    materialIndex,
  };
}

function meshFromTriangleMesh(mesh, materialIndex) {
  const vertices = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i < mesh.indices.length; i += 3) {
    const baseIdx = vertices.length / 3;
    for (let j = 0; j < 3; j++) {
      const idx = mesh.indices[i + j];
      const v = mesh.vertices[idx];
      vertices.push(v.x, v.y, v.z);
      if (mesh.normals && mesh.normals[idx]) {
        const n = mesh.normals[idx];
        normals.push(n.x, n.y, n.z);
      } else {
        normals.push(0, 1, 0);
      }
      uvs.push(0, 0);
    }
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
  }

  return {
    vertices: new Float32Array(vertices),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    materialIndex,
  };
}

function normalize(v) {
  const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
  return v.map((x) => x / len);
}

function vecAdd(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function cross3(a, b) {
  return [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0],
  ];
}

function normalize3(v) {
  const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
  return v.map((x) => x / len);
}

export function exportSceneToGLB(scene, camera, options = {}) {
  const primitives = scene.primitives ?? [];
  const lights = scene.lights ?? [];
  const materials = scene.materials ?? { listIds: () => [], get: () => null };

  const materialIds = materials.listIds?.() ?? [];
  const materialMap = new Map();
  materialIds.forEach((id, i) => materialMap.set(id, i));

  const meshes = [];
  const gltfMaterials = [];
  const nodes = [];
  const gltfLights = [];
  let vertexCount = 0;
  let indexCount = 0;
  // Absolute offsets into the packed BIN chunk (pos|norm|uv|idx per mesh).
  let binByteOffset = 0;

  // Materials
  for (const matId of materialIds) {
    const m = materials.get(matId);
    const albedo = m?.params?.albedo ?? vec4(0.8, 0.8, 0.8, 1);
    const em = m?.emission ?? vec4(0, 0, 0, 0);
    const typeCode = m?.type === "ggx" ? 1 : m?.type === "light" ? 2 : m?.type === "volume" ? 3 : 0;
    gltfMaterials.push({
      albedo: [albedo.x, albedo.y, albedo.z, albedo.w],
      metallic: typeCode === 1 ? (m?.params?.f0?.x ?? 0.04) : 0,
      roughness: m?.params?.roughness ?? 0.5,
      emission: [em.x, em.y, em.z],
    });
  }

  // Primitives → meshes
  for (let i = 0; i < primitives.length; i++) {
    const p = primitives[i];
    const matIdx = materialMap.get(p.materialId) ?? 0;
    let mesh;

    if (p.center && p.radius != null && !p.normal) {
      mesh = meshFromHypersphere({ center: p.center, radius: p.radius }, matIdx);
    } else if (p.normal && p.offset != null) {
      mesh = meshFromHyperplane({ normal: p.normal, offset: p.offset }, matIdx);
    } else if (p.faces || p.v0 != null || p.kind === "poly" || p.kind === "skinned-mesh") {
      const tempMesh = {
        vertices: p.vertices ?? p.faces?.flatMap((f) => f.map((vi) => p.vertices[vi])) ?? [],
        normals: p.normals ?? null,
        indices: p.indices ?? p.faces?.flat() ?? [],
      };
      mesh = meshFromTriangleMesh(tempMesh, matIdx);
    }

    if (mesh) {
      const vCount = mesh.vertices.length / 3;
      const iCount = mesh.indices.length;
      const posOffset = binByteOffset;
      const posLength = mesh.vertices.byteLength;
      const normOffset = posOffset + posLength;
      const normLength = mesh.normals.byteLength;
      const uvOffset = normOffset + normLength;
      const uvLength = mesh.uvs.byteLength;
      const idxOffset = uvOffset + uvLength;
      const idxLength = mesh.indices.byteLength;

      meshes.push({
        vertices: mesh.vertices,
        normals: mesh.normals,
        uvs: mesh.uvs,
        indices: mesh.indices,
        materialIndex: matIdx,
        vertexCount: vCount,
        indexCount: iCount,
        posOffset,
        posLength,
        normOffset,
        normLength,
        uvOffset,
        uvLength,
        idxOffset,
        idxLength,
        posMin: computeMin(mesh.vertices),
        posMax: computeMax(mesh.vertices),
      });

      nodes.push({
        name: p.id ?? `prim_${i}`,
        meshIndex: meshes.length - 1,
        translation: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
        parent: -1,
        children: [],
      });

      binByteOffset = idxOffset + idxLength;
      vertexCount += vCount;
      indexCount += iCount;
    }
  }

  // Lights
  for (let i = 0; i < lights.length; i++) {
    const l = lights[i];
    const mat = materials.get(l.materialId);
    const em = mat?.emission ?? vec4(1, 1, 1, 0);
    const c = l.center;
    gltfLights.push({
      type: "point",
      color: [em.x, em.y, em.z],
      intensity: Math.max(em.x, em.y, em.z) * 1000 * l.radius,
      range: 1000,
    });
    nodes.push({
      name: `light_${l.id ?? i}`,
      // glTF translation is VEC3 (XYZ); W is projection-only and not exported here.
      translation: [c.x, c.y, c.z],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      parent: -1,
      children: [],
      extensions: { KHR_lights_punctual: { light: i } },
    });
  }

  // Camera node
  let gltfCamera = null;
  if (camera) {
    const p = camera.position;
    const fwd = camera.basis?.forward ?? { x: 0, y: 0, z: -1, w: 0 };
    const up = camera.basis?.up ?? { x: 0, y: 1, z: 0, w: 0 };
    const right = camera.basis?.right ?? { x: 1, y: 0, z: 0, w: 0 };

    // Convert to GLTF camera
    const aspect = camera.width / camera.height;
    const yfov = (camera.fovY ?? 60) * Math.PI / 180;
    gltfCamera = {
      aspectRatio: aspect,
      yfov,
      znear: 0.01,
      zfar: 10000,
    };

    nodes.push({
      name: "camera",
      translation: [p.x, p.y, p.z],
      rotation: quatFromBasis(right, up, fwd),
      scale: [1, 1, 1],
      parent: -1,
      children: [],
      camera: 0,
    });
  }

  // Build binary buffer (same order as absolute offsets above)
  const binaryParts = [];
  for (const mesh of meshes) {
    binaryParts.push(typedArrayBytes(mesh.vertices));
    binaryParts.push(typedArrayBytes(mesh.normals));
    binaryParts.push(typedArrayBytes(mesh.uvs));
    binaryParts.push(typedArrayBytes(mesh.indices));
  }

  const binaryData = binaryParts.length ? concatBuffers(...binaryParts) : new Uint8Array(0);
  const binaryPadded = new Uint8Array(binaryData.length + padTo4(binaryData.length));
  binaryPadded.set(binaryData);

  const json = buildGLTFJSON({
    meshes,
    materials: gltfMaterials,
    nodes,
    lights: gltfLights,
    camera: gltfCamera,
    totalBytes: binaryPadded.length,
  });

  const jsonStr = JSON.stringify(json);
  const jsonData = uint8(jsonStr);
  const jsonPad = padTo4(jsonData.length);
  const jsonPadded = new Uint8Array(jsonData.length + jsonPad);
  jsonPadded.set(jsonData);
  // glTF 2.0: JSON chunk must be padded with 0x20 spaces (not nulls).
  for (let i = jsonData.length; i < jsonPadded.length; i++) jsonPadded[i] = 0x20;

  // GLB total length = header + JSON chunk header + JSON + BIN chunk header + BIN
  const totalLength = 12 + 8 + jsonPadded.length + 8 + binaryPadded.length;

  // GLB header
  const header = new ArrayBuffer(12);
  const headerView = new DataView(header);
  headerView.setUint32(0, 0x46546C67, true); // "glTF"
  headerView.setUint32(4, 2, true); // version
  headerView.setUint32(8, totalLength, true);

  // JSON chunk
  const jsonChunkHeader = new ArrayBuffer(8);
  const jsonChunkView = new DataView(jsonChunkHeader);
  jsonChunkView.setUint32(0, jsonPadded.length, true);
  jsonChunkView.setUint32(4, 0x4E4F534A, true); // "JSON"

  // BIN chunk
  const binChunkHeader = new ArrayBuffer(8);
  const binChunkView = new DataView(binChunkHeader);
  binChunkView.setUint32(0, binaryPadded.length, true);
  binChunkView.setUint32(4, 0x004E4942, true); // "BIN\0"

  return concatBuffers(
    new Uint8Array(header),
    new Uint8Array(jsonChunkHeader),
    jsonPadded,
    new Uint8Array(binChunkHeader),
    binaryPadded,
  );
}

function computeMin(arr) {
  const f = new Float32Array(arr.buffer, arr.byteOffset, arr.length);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  for (let i = 0; i < f.length; i += 3) {
    minX = Math.min(minX, f[i]);
    minY = Math.min(minY, f[i + 1]);
    minZ = Math.min(minZ, f[i + 2]);
  }
  return [
    Number.isFinite(minX) ? minX : 0,
    Number.isFinite(minY) ? minY : 0,
    Number.isFinite(minZ) ? minZ : 0,
  ];
}

function computeMax(arr) {
  const f = new Float32Array(arr.buffer, arr.byteOffset, arr.length);
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < f.length; i += 3) {
    maxX = Math.max(maxX, f[i]);
    maxY = Math.max(maxY, f[i + 1]);
    maxZ = Math.max(maxZ, f[i + 2]);
  }
  return [
    Number.isFinite(maxX) ? maxX : 0,
    Number.isFinite(maxY) ? maxY : 0,
    Number.isFinite(maxZ) ? maxZ : 0,
  ];
}

function quatFromBasis(right, up, forward) {
  // GLTF uses right-handed, Y-up. Convert from camera basis.
  const m = [
    right.x, right.y, right.z, 0,
    up.x, up.y, up.z, 0,
    -forward.x, -forward.y, -forward.z, 0,
    0, 0, 0, 1,
  ];
  const trace = m[0] + m[5] + m[10];
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return [(m[6] - m[9]) * s, (m[8] - m[2]) * s, (m[1] - m[4]) * s, 0.25 / s];
  }
  if (m[0] > m[5] && m[0] > m[10]) {
    const s = 2 * Math.sqrt(1 + m[0] - m[5] - m[10]);
    return [0.25 * s, (m[1] + m[4]) / s, (m[8] + m[2]) / s, (m[6] - m[9]) / s];
  }
  if (m[5] > m[10]) {
    const s = 2 * Math.sqrt(1 + m[5] - m[0] - m[10]);
    return [(m[1] + m[4]) / s, 0.25 * s, (m[9] + m[6]) / s, (m[8] - m[2]) / s];
  }
  const s = 2 * Math.sqrt(1 + m[10] - m[0] - m[5]);
  return [(m[8] + m[2]) / s, (m[9] + m[6]) / s, 0.25 * s, (m[1] - m[4]) / s];
}