import fs from "node:fs";
import path from "node:path";

export class SequentialGLBExporter {
  constructor(options = {}) {
    this.precision = options.precision ?? "float32";
    this.outputDir = options.outputDir ?? "output/glb-sequence";
  }

  async export(meshSamples, outputDir, options = {}) {
    const dir = path.resolve(outputDir ?? this.outputDir);
    fs.mkdirSync(dir, { recursive: true });

    const files = [];
    for (let i = 0; i < meshSamples.length; i++) {
      const mesh = meshSamples[i];
      const glb = this._meshToGLB(mesh, options);
      const filename = `${options.prefix ?? "frame"}-${String(i).padStart(6, "0")}.glb`;
      const filepath = path.join(dir, filename);
      fs.writeFileSync(filepath, glb);
      files.push(filepath);
    }

    return { files, outputDir: dir, frameCount: meshSamples.length };
  }

  _meshToGLB(mesh, options = {}) {
    const numVerts = mesh.vertices.length;
    const numFaces = mesh.faces.length;

    const positions = new Float32Array(numVerts * 3);
    const normals = new Float32Array(numVerts * 3);
    for (let i = 0; i < numVerts; i++) {
      positions[i * 3] = mesh.vertices[i].x;
      positions[i * 3 + 1] = mesh.vertices[i].y;
      positions[i * 3 + 2] = mesh.vertices[i].z;
      const len = Math.sqrt(mesh.vertices[i].x ** 2 + mesh.vertices[i].y ** 2 + mesh.vertices[i].z ** 2 + mesh.vertices[i].w ** 2) || 1;
      normals[i * 3] = mesh.vertices[i].x / len;
      normals[i * 3 + 1] = mesh.vertices[i].y / len;
      normals[i * 3 + 2] = mesh.vertices[i].z / len;
    }

    const indices = new Uint32Array(numFaces * 3);
    for (let i = 0; i < numFaces; i++) {
      indices[i * 3] = mesh.faces[i][0];
      indices[i * 3 + 1] = mesh.faces[i][1];
      indices[i * 3 + 2] = mesh.faces[i][2];
    }

    const posBytes = Buffer.from(positions.buffer);
    const normBytes = Buffer.from(normals.buffer);
    const idxBytes = Buffer.from(indices.buffer);

    const pad = (n) => Math.ceil(n / 4) * 4;

    const json = {
      asset: { version: "2.0", generator: "4D Renderer GLB" },
      buffers: [{ byteLength: posBytes.length + normBytes.length + idxBytes.length }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
        { buffer: 0, byteOffset: posBytes.length, byteLength: normBytes.length, target: 34962 },
        { buffer: 0, byteOffset: posBytes.length + normBytes.length, byteLength: idxBytes.length, target: 34963 },
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: numVerts, type: "VEC3", max: this._maxVec3(mesh.vertices), min: this._minVec3(mesh.vertices) },
        { bufferView: 1, componentType: 5126, count: numVerts, type: "VEC3" },
        { bufferView: 2, componentType: 5125, count: indices.length, type: "SCALAR" },
      ],
      meshes: [{
        primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }],
      }],
      nodes: [{ mesh: 0, name: options.name ?? "4D_Surface" }],
      scenes: [{ nodes: [0] }],
    };

    const jsonStr = JSON.stringify(json);
    const jsonBuf = Buffer.from(jsonStr);
    const jsonPad = pad(jsonBuf.length);

    const binData = Buffer.concat([posBytes, normBytes, idxBytes]);
    const binPadBytes = pad(binData.length) - binData.length;

    const glbHeader = Buffer.alloc(12);
    glbHeader.writeUInt32LE(0x46546C67, 0);
    glbHeader.writeUInt32LE(2, 4);
    glbHeader.writeUInt32LE(12 + 8 + jsonPad + 8 + binData.length + binPadBytes, 8);

    const jsonChunk = Buffer.alloc(8 + jsonPad);
    jsonChunk.writeUInt32LE(jsonPad, 0);
    jsonChunk.writeUInt32LE(0x4E4F534A, 4);
    jsonBuf.copy(jsonChunk, 8);

    const binChunk = Buffer.alloc(8 + binData.length + binPadBytes);
    binChunk.writeUInt32LE(binData.length + binPadBytes, 0);
    binChunk.writeUInt32LE(0x004E4942, 4);
    binData.copy(binChunk, 8);

    return Buffer.concat([glbHeader, jsonChunk, binChunk]);
  }

  _maxVec3(verts) {
    let mx = -Infinity, my = -Infinity, mz = -Infinity;
    for (const v of verts) { if (v.x > mx) mx = v.x; if (v.y > my) my = v.y; if (v.z > mz) mz = v.z; }
    return [mx, my, mz];
  }

  _minVec3(verts) {
    let mx = Infinity, my = Infinity, mz = Infinity;
    for (const v of verts) { if (v.x < mx) mx = v.x; if (v.y < my) my = v.y; if (v.z < mz) mz = v.z; }
    return [mx, my, mz];
  }
}
