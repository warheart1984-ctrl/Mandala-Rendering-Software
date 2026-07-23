import fs from "node:fs";
import path from "node:path";

export class MorphTargetExporter {
  constructor(options = {}) {
    this.morphPrecision = options.morphPrecision ?? "float32";
  }

  async export(meshSamples, outputPath, options = {}) {
    const baseMesh = meshSamples[0];
    const numFrames = meshSamples.length;
    const numVerts = baseMesh.vertices.length;

    const basePos = new Float32Array(numVerts * 3);
    for (let i = 0; i < numVerts; i++) {
      basePos[i * 3] = baseMesh.vertices[i].x;
      basePos[i * 3 + 1] = baseMesh.vertices[i].y;
      basePos[i * 3 + 2] = baseMesh.vertices[i].z;
    }

    const indices = new Uint32Array(baseMesh.faces.length * 3);
    for (let i = 0; i < baseMesh.faces.length; i++) {
      indices[i * 3] = baseMesh.faces[i][0];
      indices[i * 3 + 1] = baseMesh.faces[i][1];
      indices[i * 3 + 2] = baseMesh.faces[i][2];
    }

    const targets = [];
    let totalTargetBytes = 0;
    const targetByteOffsets = [];
    const targetByteLengths = [];

    for (let f = 0; f < numFrames; f++) {
      const mesh = meshSamples[f];
      const delta = new Float32Array(numVerts * 3);
      for (let i = 0; i < numVerts; i++) {
        delta[i * 3] = mesh.vertices[i].x - basePos[i * 3];
        delta[i * 3 + 1] = mesh.vertices[i].y - basePos[i * 3 + 1];
        delta[i * 3 + 2] = mesh.vertices[i].z - basePos[i * 3 + 2];
      }
      targets.push(delta);
      targetByteOffsets.push(totalTargetBytes);
      targetByteLengths.push(delta.byteLength);
      totalTargetBytes += delta.byteLength;
    }

    const binSize = basePos.byteLength + indices.byteLength + totalTargetBytes;
    const bin = Buffer.alloc(binSize);
    let offset = 0;
    bin.set(Buffer.from(basePos.buffer), offset); offset += basePos.byteLength;
    const indexOffset = offset;
    bin.set(Buffer.from(indices.buffer), offset); offset += indices.byteLength;

    const morphOffsets = [];
    for (let f = 0; f < numFrames; f++) {
      morphOffsets.push(offset);
      bin.set(Buffer.from(targets[f].buffer), offset);
      offset += targets[f].byteLength;
    }

    const uri = path.basename(outputPath, ".gltf") + ".bin";
    fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
    fs.writeFileSync(path.resolve(outputPath.replace(/\.gltf$/, ".bin")), bin);

    const accessors = [
      { bufferView: 0, componentType: 5126, count: numVerts, type: "VEC3" },
      { bufferView: 1, componentType: 5125, count: indices.length, type: "SCALAR" },
    ];

    const bufferViews = [
      { buffer: 0, byteOffset: 0, byteLength: basePos.byteLength, target: 34962 },
      { buffer: 0, byteOffset: indexOffset, byteLength: indices.byteLength, target: 34963 },
    ];

    const morphAccessors = [];
    const primitiveTargets = [];

    for (let f = 0; f < numFrames; f++) {
      const accessorIdx = accessors.length;
      accessors.push({ bufferView: 2 + f, componentType: 5126, count: numVerts, type: "VEC3" });
      morphAccessors.push(accessorIdx);

      bufferViews.push({
        buffer: 0,
        byteOffset: morphOffsets[f],
        byteLength: targetByteLengths[f],
        target: 34962,
      });

      primitiveTargets.push({ POSITION: accessorIdx });
    }

    const gltf = {
      asset: { version: "2.0", generator: "4D Renderer Morph" },
      buffers: [{ uri, byteLength: binSize }],
      bufferViews,
      accessors,
      meshes: [{
        primitives: [{
          attributes: { POSITION: 0 },
          indices: 1,
          targets: primitiveTargets,
        }],
      }],
      nodes: [{ mesh: 0, name: options.name ?? "Animated4D" }],
      scenes: [{ nodes: [0] }],
    };

    const gltfPath = outputPath.endsWith(".gltf") ? outputPath : outputPath + ".gltf";
    fs.writeFileSync(gltfPath, JSON.stringify(gltf, null, 2));

    const frameTimes = options.frameTimes ?? meshSamples.map((_, i) => i / numFrames);

    return {
      gltfPath,
      binPath: path.resolve(outputPath.replace(/\.gltf$/, ".bin")),
      frameCount: numFrames,
      morphTargetNames: frameTimes.map((t, i) => `frame_${String(i).padStart(3, "0")}_t${t.toFixed(3)}`),
    };
  }
}
