import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const DEMO_DIR = resolve(import.meta.dirname, '..', '..', '..', 'demo');
mkdirSync(DEMO_DIR, { recursive: true });

function alignTo4(n) {
  return (n + 3) & ~3;
}

function buildGLB(json, bin) {
  const jsonPadded = alignTo4(json.length);
  const binPadded = alignTo4(bin.length);
  const totalLength = 12 + 8 + jsonPadded + 8 + binPadded;
  const buf = Buffer.alloc(totalLength);
  let off = 0;

  // Header
  buf.writeUInt32LE(0x46546C67, off); off += 4;
  buf.writeUInt32LE(2, off); off += 4;
  buf.writeUInt32LE(totalLength, off); off += 4;

  // JSON chunk
  buf.writeUInt32LE(jsonPadded, off); off += 4;
  buf.writeUInt32LE(0x4E4F534A, off); off += 4;
  buf.write(json, off); off += jsonPadded;

  // BIN chunk
  buf.writeUInt32LE(binPadded, off); off += 4;
  buf.writeUInt32LE(0x004E4942, off); off += 4;
  bin.copy(buf, off);

  return buf;
}

function makeMaterial(emissive, baseColor, metallic, roughness) {
  const m = {
    pbrMetallicRoughness: {
      baseColorFactor: baseColor || [1, 1, 1, 1],
      metallicFactor: metallic ?? 1.0,
      roughnessFactor: roughness ?? 0.5,
    },
  };
  if (emissive) m.emissiveFactor = emissive;
  return m;
}

function buildScene(meshDefs, materialDefs) {
  const nodes = meshDefs.map((_, i) => ({ mesh: i }));
  return {
    asset: { version: '2.0', generator: 'mandala-demo-gen' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes: meshDefs,
    materials: materialDefs,
    accessors: [],
    bufferViews: [],
    buffers: [{ byteLength: 0 }],
  };
}

function buildAccessor(binData, offset, count, componentType, type, byteStride) {
  let min, max;
  if (type === 'VEC3' && byteStride === 12) {
    min = [Infinity, Infinity, Infinity];
    max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) {
      const x = binData.readFloatLE(offset + i * 12);
      const y = binData.readFloatLE(offset + i * 12 + 4);
      const z = binData.readFloatLE(offset + i * 12 + 8);
      min[0] = Math.min(min[0], x); max[0] = Math.max(max[0], x);
      min[1] = Math.min(min[1], y); max[1] = Math.max(max[1], y);
      min[2] = Math.min(min[2], z); max[2] = Math.max(max[2], z);
    }
  }
  return {
    bufferView: 0,
    byteOffset: offset,
    componentType,
    count,
    type,
    ...(min ? { min, max } : {}),
  };
}

function quadMesh(positions, normals, indices, materialIdx) {
  return {
    primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: materialIdx }],
  };
}

function buildQuadGLB(quads, materialDefs) {
  const vertices = [];
  const norms = [];
  const inds = [];
  let vertexOffset = 0;

  for (const { positions, normals } of quads) {
    for (let i = 0; i < positions.length; i += 3) {
      vertices.push(positions[i], positions[i + 1], positions[i + 2]);
      norms.push(normals[i], normals[i + 1], normals[i + 2]);
    }
    inds.push(
      vertexOffset, vertexOffset + 1, vertexOffset + 2,
      vertexOffset, vertexOffset + 2, vertexOffset + 3
    );
    vertexOffset += 4;
  }

  const posBytes = new Float32Array(vertices).buffer;
  const normBytes = new Float32Array(norms).buffer;
  const indBytes = new Uint16Array(inds).buffer;
  const bin = Buffer.concat([
    Buffer.from(posBytes),
    Buffer.from(normBytes),
    Buffer.from(indBytes),
  ]);

  const posOffset = 0;
  const normOffset = posBytes.byteLength;
  const indOffset = normOffset + normBytes.byteLength;

  const vertexCount = vertices.length / 3;
  const useUint32 = vertexCount > 65535;
  const indComponentType = useUint32 ? 5125 : 5123;

  // Rebuild bin with Uint32 indices if needed
  let finalBin;
  if (useUint32) {
    const indBytes32 = new Uint32Array(inds).buffer;
    finalBin = Buffer.concat([
      Buffer.from(posBytes),
      Buffer.from(normBytes),
      Buffer.from(indBytes32),
    ]);
  } else {
    finalBin = bin;
  }

  const finalIndOffset = normOffset + normBytes.byteLength;
  const indByteLen = useUint32 ? inds.length * 4 : inds.length * 2;

  const meshDefs = quads.map((_, i) => ({
    primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: i }],
  }));

  const accessors = [
    buildAccessor(finalBin, posOffset, vertexCount, 5126, 'VEC3', 12),
    buildAccessor(finalBin, normOffset, vertexCount, 5126, 'VEC3', 12),
    buildAccessor(finalBin, finalIndOffset, inds.length, indComponentType, 'SCALAR', 0),
  ];

  const posBytesLen = vertexCount * 12;
  const normBytesLen = vertexCount * 12;
  const bufViews = [
    { buffer: 0, byteOffset: posOffset, byteLength: posBytesLen, byteStride: 12, target: 34962 },
    { buffer: 0, byteOffset: normOffset, byteLength: normBytesLen, byteStride: 12, target: 34962 },
    { buffer: 0, byteOffset: finalIndOffset, byteLength: indByteLen, target: 34963 },
  ];

  const nodes = meshDefs.map((_, i) => ({ mesh: i }));
  const gltf = {
    asset: { version: '2.0', generator: 'mandala-demo-gen' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes: meshDefs,
    materials: materialDefs,
    accessors,
    bufferViews: bufViews,
    buffers: [{ byteLength: finalBin.length }],
  };

  return buildGLB(JSON.stringify(gltf), finalBin);
}

// --- Scene 1: emissive-quad.glb ---
function genEmissiveQuad() {
  const quads = [
    { // floating emissive quad at y=2
      positions: [-1, 2, -1, 1, 2, -1, 1, 2, 1, -1, 2, 1],
      normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    },
    { // floor triangle (degenerate quad: two tris, but we make a single tri as quad)
      // Actually user says "one lambertian floor triangle at y=0"
      // We'll make a full quad at y=0 as floor
      positions: [-3, 0, -3, 3, 0, -3, 3, 0, 3, -3, 0, 3],
      normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    },
  ];
  const materials = [
    makeMaterial([1, 1, 1], [1, 1, 1, 1], 0.0, 1.0),
    makeMaterial(null, [0.8, 0.8, 0.8, 1], 0.0, 1.0),
  ];
  return buildQuadGLB(quads, materials);
}

// --- Scene 2: cornell4d.glb ---
function genCornell4d() {
  const quads = [];
  const materials = [];
  const boxMin = [-1.5, 0, -2];
  const boxMax = [1.5, 3, 0];
  const [x0, y0, z0] = boxMin;
  const [x1, y1, z1] = boxMax;

  function addWall(px, nx, py, ny, pz, nz, mat) {
    quads.push({
      positions: px.flat(),
      normals: nx.map((_, i) => [0, 1, 0]).flat(),
    });
    // normals should be the face normal repeated per vertex
    const faceNormal = [0, 1, 0]; // placeholder
    const normals = [];
    for (let i = 0; i < px.length; i++) normals.push(0, 1, 0);
  }

  // Left wall (red) - at x = x0, facing +X
  quads.push({
    positions: [x0, y0, z1, x0, y0, z0, x0, y1, z0, x0, y1, z1].flat(),
    normals: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0],
  });
  materials.push(makeMaterial(null, [0.8, 0.1, 0.1, 1], 0.0, 1.0));

  // Right wall (green) - at x = x1, facing -X
  quads.push({
    positions: [x1, y0, z0, x1, y0, z1, x1, y1, z1, x1, y1, z0].flat(),
    normals: [-1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0],
  });
  materials.push(makeMaterial(null, [0.1, 0.8, 0.1, 1], 0.0, 1.0));

  // Floor (white diffuse) - at y = y0, facing +Y
  quads.push({
    positions: [x0, y0, z1, x1, y0, z1, x1, y0, z0, x0, y0, z0].flat(),
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  });
  materials.push(makeMaterial(null, [0.9, 0.9, 0.9, 1], 0.0, 1.0));

  // Ceiling (white diffuse) - at y = y1, facing -Y
  quads.push({
    positions: [x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1].flat(),
    normals: [0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0],
  });
  materials.push(makeMaterial(null, [0.9, 0.9, 0.9, 1], 0.0, 1.0));

  // Back wall (white diffuse) - at z = z0, facing +Z
  quads.push({
    positions: [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0].flat(),
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
  });
  materials.push(makeMaterial(null, [0.9, 0.9, 0.9, 1], 0.0, 1.0));

  // Emissive area light on ceiling (small quad near center of ceiling)
  const lx0 = -0.5, lx1 = 0.5, lz0 = -1.0, lz1 = -0.2;
  quads.push({
    positions: [lx0, y1 - 0.001, lz1, lx1, y1 - 0.001, lz1, lx1, y1 - 0.001, lz0, lx0, y1 - 0.001, lz0].flat(),
    normals: [0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0],
  });
  materials.push(makeMaterial([5.0, 5.0, 5.0], [1, 1, 1, 1], 0.0, 1.0));

  return buildQuadGLB(quads, materials);
}

// --- Scene 3: normal-map-test.glb ---
function genNormalMapTest() {
  const positions = new Float32Array([
    -2, 0, -1,
     2, 0, -1,
     0, 0,  3,
  ]);
  const normals = new Float32Array([
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
  ]);
  const tangents = new Float32Array([
    1, 0, 0, 1,
    1, 0, 0, 1,
    1, 0, 0, 1,
  ]);
  const indices = new Uint16Array([0, 1, 2]);

  const posBuf = Buffer.from(positions.buffer);
  const normBuf = Buffer.from(normals.buffer);
  const tangBuf = Buffer.from(tangents.buffer);
  const indBuf = Buffer.from(indices.buffer);

  const posOff = 0;
  const normOff = posBuf.length;
  const tangOff = normOff + normBuf.length;
  const indOff = tangOff + tangBuf.length;
  const bin = Buffer.concat([posBuf, normBuf, tangBuf, indBuf]);

  const accessors = [
    { bufferView: 0, byteOffset: posOff, componentType: 5126, count: 3, type: 'VEC3',
      min: [-2, 0, -1], max: [2, 0, 3] },
    { bufferView: 1, byteOffset: normOff, componentType: 5126, count: 3, type: 'VEC3',
      min: [0, 1, 0], max: [0, 1, 0] },
    { bufferView: 2, byteOffset: tangOff, componentType: 5126, count: 3, type: 'VEC4' },
    { bufferView: 3, byteOffset: indOff, componentType: 5123, count: 3, type: 'SCALAR' },
  ];

  const bufferViews = [
    { buffer: 0, byteOffset: posOff, byteLength: posBuf.length, byteStride: 12, target: 34962 },
    { buffer: 0, byteOffset: normOff, byteLength: normBuf.length, byteStride: 12, target: 34962 },
    { buffer: 0, byteOffset: tangOff, byteLength: tangBuf.length, byteStride: 16, target: 34962 },
    { buffer: 0, byteOffset: indOff, byteLength: indBuf.length, target: 34963 },
  ];

  const gltf = {
    asset: { version: '2.0', generator: 'mandala-demo-gen' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, TANGENT: 2 },
        indices: 3,
        material: 0,
      }],
    }],
    materials: [makeMaterial(null, [0.5, 0.5, 1.0, 1], 0.0, 1.0)],
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };

  return buildGLB(JSON.stringify(gltf), bin);
}

// --- Scene 4: glb-import-scene.glb ---
function genImportScene() {
  // 3 triangles in a row, different materials
  const vertices = new Float32Array([
    // Triangle 0: lambertian red, centered at x=-3
    -4, 0, 0,   -3, 0, 0,   -3.5, 0, 1,
    // Triangle 1: GGX metallic, centered at x=0
    -1, 0, 0,    0, 0, 0,   -0.5, 0, 1,
    // Triangle 2: emissive, centered at x=3
     2, 0, 0,    3, 0, 0,    2.5, 0, 1,
  ]);
  const normals = new Float32Array([
    0, 1, 0,  0, 1, 0,  0, 1, 0,
    0, 1, 0,  0, 1, 0,  0, 1, 0,
    0, 1, 0,  0, 1, 0,  0, 1, 0,
  ]);
  const indices = new Uint16Array([0, 1, 2, 3, 4, 5, 6, 7, 8]);

  const posBuf = Buffer.from(vertices.buffer);
  const normBuf = Buffer.from(normals.buffer);
  const indBuf = Buffer.from(indices.buffer);

  const posOff = 0;
  const normOff = posBuf.length;
  const indOff = normOff + normBuf.length;
  const bin = Buffer.concat([posBuf, normBuf, indBuf]);

  const accessors = [
    { bufferView: 0, byteOffset: posOff, componentType: 5126, count: 9, type: 'VEC3',
      min: [-4, 0, 0], max: [3, 0, 1] },
    { bufferView: 1, byteOffset: normOff, componentType: 5126, count: 9, type: 'VEC3',
      min: [0, 1, 0], max: [0, 1, 0] },
    { bufferView: 2, byteOffset: indOff, componentType: 5123, count: 9, type: 'SCALAR' },
  ];

  const bufferViews = [
    { buffer: 0, byteOffset: posOff, byteLength: posBuf.length, byteStride: 12, target: 34962 },
    { buffer: 0, byteOffset: normOff, byteLength: normBuf.length, byteStride: 12, target: 34962 },
    { buffer: 0, byteOffset: indOff, byteLength: indBuf.length, target: 34963 },
  ];

  const materials = [
    makeMaterial(null, [0.8, 0.1, 0.1, 1], 0.0, 1.0),   // lambertian red
    makeMaterial(null, [0.9, 0.9, 0.9, 1], 1.0, 0.1),    // GGX metallic
    makeMaterial([3.0, 3.0, 3.0], [1, 1, 1, 1], 0.0, 1.0), // emissive
  ];

  const gltf = {
    asset: { version: '2.0', generator: 'mandala-demo-gen' },
    scene: 0,
    scenes: [{ nodes: [0, 1, 2] }],
    nodes: [
      { mesh: 0 },
      { mesh: 1 },
      { mesh: 2 },
    ],
    meshes: [0, 1, 2].map(() => ({
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }],
    })),
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };

  return buildGLB(JSON.stringify(gltf), bin);
}

// --- Scene 5: stress-scene.glb ---
function genStressScene() {
  const gridSize = 16;
  const triCount = gridSize * gridSize * 2; // 2 triangles per quad
  const vertexCount = triCount * 3; // 1536
  const indexCount = triCount * 3; // 1536

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const indices = new Uint16Array(indexCount);

  const spacing = 0.125;
  const offsetX = -(gridSize * spacing) / 2;
  const offsetZ = -(gridSize * spacing) / 2;

  let vi = 0;
  let ii = 0;
  for (let gz = 0; gz < gridSize; gz++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const x0 = offsetX + gx * spacing;
      const z0 = offsetZ + gz * spacing;
      const x1 = x0 + spacing;
      const z1 = z0 + spacing;
      const base = vi / 3;

      // Triangle 0
      positions[vi] = x0; positions[vi + 1] = -0.5; positions[vi + 2] = z0; vi += 3;
      positions[vi] = x1; positions[vi + 1] = -0.5; positions[vi + 2] = z0; vi += 3;
      positions[vi] = x1; positions[vi + 1] = -0.5; positions[vi + 2] = z1; vi += 3;
      // Triangle 1
      positions[vi] = x0; positions[vi + 1] = -0.5; positions[vi + 2] = z0; vi += 3;
      positions[vi] = x1; positions[vi + 1] = -0.5; positions[vi + 2] = z1; vi += 3;
      positions[vi] = x0; positions[vi + 1] = -0.5; positions[vi + 2] = z1; vi += 3;

      // All normals point up
      for (let k = 0; k < 6; k++) {
        const nvi = (base + k) * 3;
        normals[nvi] = 0; normals[nvi + 1] = 1; normals[nvi + 2] = 0;
      }

      indices[ii] = base; indices[ii + 1] = base + 1; indices[ii + 2] = base + 2; ii += 3;
      indices[ii] = base + 3; indices[ii + 1] = base + 4; indices[ii + 2] = base + 5; ii += 3;
    }
  }

  const posBuf = Buffer.from(positions.buffer);
  const normBuf = Buffer.from(normals.buffer);
  const indBuf = Buffer.from(indices.buffer);

  const posOff = 0;
  const normOff = posBuf.length;
  const indOff = normOff + normBuf.length;
  const bin = Buffer.concat([posBuf, normBuf, indBuf]);

  const accessors = [
    { bufferView: 0, byteOffset: posOff, componentType: 5126, count: vertexCount, type: 'VEC3',
      min: [offsetX, -0.5, offsetZ], max: [offsetX + gridSize * spacing, -0.5, offsetZ + gridSize * spacing] },
    { bufferView: 1, byteOffset: normOff, componentType: 5126, count: vertexCount, type: 'VEC3',
      min: [0, 1, 0], max: [0, 1, 0] },
    { bufferView: 2, byteOffset: indOff, componentType: 5123, count: indexCount, type: 'SCALAR' },
  ];

  const bufferViews = [
    { buffer: 0, byteOffset: posOff, byteLength: posBuf.length, byteStride: 12, target: 34962 },
    { buffer: 0, byteOffset: normOff, byteLength: normBuf.length, byteStride: 12, target: 34962 },
    { buffer: 0, byteOffset: indOff, byteLength: indBuf.length, target: 34963 },
  ];

  const gltf = {
    asset: { version: '2.0', generator: 'mandala-demo-gen' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1 },
        indices: 2,
        material: 0,
      }],
    }],
    materials: [makeMaterial(null, [0.5, 0.5, 0.5, 1], 0.0, 1.0)],
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };

  return buildGLB(JSON.stringify(gltf), bin);
}

// --- Main ---
const scenes = [
  ['emissive-quad', genEmissiveQuad],
  ['cornell4d', genCornell4d],
  ['normal-map-test', genNormalMapTest],
  ['glb-import-scene', genImportScene],
  ['stress-scene', genStressScene],
];

for (const [name, gen] of scenes) {
  const filePath = join(DEMO_DIR, `${name}.glb`);
  if (existsSync(filePath)) {
    console.log(`SKIP (exists): ${filePath}`);
    continue;
  }
  const glb = gen();
  writeFileSync(filePath, glb);
  console.log(`Generated: ${filePath} (${glb.length} bytes)`);
}

console.log('\nDone. Generated files:');
for (const [name] of scenes) {
  console.log(`  ${join(DEMO_DIR, `${name}.glb`)}`);
}
