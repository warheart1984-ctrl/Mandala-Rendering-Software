import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync, crc32 } from "node:zlib";
import { decodeGlbTextureImage } from "../../src/asset-pipeline/GLBTextureDecoder.js";

function buildMinimalPng(width, height, rgba) {
  const raw = [];
  for (let y = 0; y < height; y++) {
    raw.push(0);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raw.push(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]);
    }
  }
  const rawBytes = Uint8Array.from(raw);

  const compressed = deflateSync(rawBytes);

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  function makeChunk(type, data) {
    const len = new Uint8Array(4);
    len[0] = (data.length >>> 24) & 0xff;
    len[1] = (data.length >>> 16) & 0xff;
    len[2] = (data.length >>> 8) & 0xff;
    len[3] = data.length & 0xff;

    const typeBytes = new Uint8Array([...type].map((c) => c.charCodeAt(0)));

    const crcInput = new Uint8Array(typeBytes.length + data.length);
    crcInput.set(typeBytes, 0);
    crcInput.set(data, typeBytes.length);

    const crcVal = crc32(crcInput) >>> 0;
    const crcBytes = new Uint8Array(4);
    crcBytes[0] = (crcVal >>> 24) & 0xff;
    crcBytes[1] = (crcVal >>> 16) & 0xff;
    crcBytes[2] = (crcVal >>> 8) & 0xff;
    crcBytes[3] = crcVal & 0xff;

    const chunk = new Uint8Array(4 + 4 + data.length + 4);
    chunk.set(len, 0);
    chunk.set(typeBytes, 4);
    chunk.set(data, 8);
    chunk.set(crcBytes, 8 + data.length);
    return chunk;
  }

  const ihdr = new Uint8Array(13);
  const ihdrDv = new DataView(ihdr.buffer);
  ihdrDv.setUint32(0, width, false);
  ihdrDv.setUint32(4, height, false);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const ihdrChunk = makeChunk("IHDR", ihdr);
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", new Uint8Array(0));

  const total = signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
  const png = new Uint8Array(total);
  let off = 0;
  png.set(signature, off); off += signature.length;
  png.set(ihdrChunk, off); off += ihdrChunk.length;
  png.set(idatChunk, off); off += idatChunk.length;
  png.set(iendChunk, off);
  return png;
}

function buildGlbWithPngImage(pngBytes) {
  const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2]);

  const vertexBytes = vertices.buffer;
  const indexBytes = indices.buffer;
  const imageBytes = pngBytes.buffer;

  const vertexOffset = 0;
  const indexOffset = vertexBytes.byteLength;
  const imageOffset = indexOffset + indexBytes.byteLength;
  const totalBinLength = imageOffset + imageBytes.byteLength;
  const paddedBinLength = totalBinLength + ((4 - (totalBinLength % 4)) % 4);

  const gltfJson = {
    asset: { version: "2.0", generator: "test" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      name: "textured",
      primitives: [{
        attributes: { POSITION: 0 },
        indices: 1,
        material: 0,
      }],
    }],
    accessors: [
      { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: "VEC3", max: [1, 1, 0], min: [0, 0, 0] },
      { bufferView: 1, byteOffset: 0, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: vertexOffset, byteLength: vertexBytes.byteLength },
      { buffer: 0, byteOffset: indexOffset, byteLength: indexBytes.byteLength },
      { buffer: 0, byteOffset: imageOffset, byteLength: imageBytes.byteLength },
    ],
    buffers: [{ byteLength: paddedBinLength }],
    materials: [{
      name: "textured-mat",
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
      },
    }],
    textures: [{ source: 0 }],
    images: [{ mimeType: "image/png", bufferView: 2 }],
  };

  const jsonStr = JSON.stringify(gltfJson);
  const jsonBytes = new TextEncoder().encode(jsonStr);
  const paddedJsonLength = jsonBytes.byteLength + ((4 - (jsonBytes.byteLength % 4)) % 4);

  const binData = new Uint8Array(paddedBinLength);
  binData.set(new Uint8Array(vertexBytes), vertexOffset);
  binData.set(new Uint8Array(indexBytes), indexOffset);
  binData.set(new Uint8Array(imageBytes), imageOffset);

  const totalLength = 12 + 8 + paddedJsonLength + 8 + paddedBinLength;
  const glb = new ArrayBuffer(totalLength);
  const view = new DataView(glb);
  const out = new Uint8Array(glb);

  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);

  let offset = 12;
  view.setUint32(offset, paddedJsonLength, true);
  view.setUint32(offset + 4, 0x4e4f534a, true);
  offset += 8;
  out.set(jsonBytes, offset);
  for (let i = jsonBytes.byteLength; i < paddedJsonLength; i++) out[offset + i] = 0x20;
  offset += paddedJsonLength;

  view.setUint32(offset, paddedBinLength, true);
  view.setUint32(offset + 4, 0x004e4942, true);
  offset += 8;
  out.set(binData, offset);

  return { glb: new Uint8Array(glb), gltfJson: gltfJson, imageOffset, imageLength: imageBytes.byteLength };
}

test("decodeGlbTextureImage decodes a PNG from GLB buffer", async () => {
  const w = 2, h = 2;
  const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]);
  const pngBytes = await buildMinimalPng(w, h, rgba);

  const { glb, gltfJson } = buildGlbWithPngImage(pngBytes);
  const { parseGlb } = await import("../../src/asset-pipeline/GLBMeshImporter4D.js");
  const { bins } = parseGlb(glb);

  const decoded = await decodeGlbTextureImage(gltfJson, bins, 0);
  assert.equal(decoded.width, w);
  assert.equal(decoded.height, h);
  assert.ok(decoded.data instanceof Uint8Array);
  assert.equal(decoded.data.length, w * h * 4);

  assert.equal(decoded.data[0], 255);
  assert.equal(decoded.data[1], 0);
  assert.equal(decoded.data[2], 0);
  assert.equal(decoded.data[3], 255);
});

test("decodeGlbTextureImage rejects unsupported mimeType", async () => {
  const gltf = {
    images: [{ mimeType: "image/webp", bufferView: 0 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }],
  };
  try {
    await decodeGlbTextureImage(gltf, [new Uint8Array(4)], 0);
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(err.message.includes("Unsupported"));
  }
});

test("decodeGlbTextureImage rejects missing image", async () => {
  try {
    await decodeGlbTextureImage({ images: [] }, [], 0);
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(err.message.includes("Missing"));
  }
});
