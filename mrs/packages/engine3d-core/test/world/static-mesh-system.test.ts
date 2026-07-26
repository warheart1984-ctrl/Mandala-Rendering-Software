import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashStaticMesh, instantiateStaticMesh, validateStaticMeshes } from "../../src/world/StaticMeshSystem.js";
import { importStaticMeshesFromGlb, importStaticMeshesFromObj } from "../../src/world/StaticMeshImporter.js";
import { hashAssetProvenance } from "../../src/world/AssetProvenanceLedger.js";
import type { StaticMeshAsset } from "../../src/world/WorldObject.js";
import { DEFAULT_TRANSFORM } from "../../src/world/WorldObject.js";

function triangle(): StaticMeshAsset {
  return {
    id: "tri",
    vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
    indices: new Uint16Array([0, 1, 2]),
    materialId: "mat",
  };
}

describe("StaticMeshSystem", () => {
  it("validates static mesh assets and hashes them deterministically", () => {
    const mesh = triangle();
    assert.equal(validateStaticMeshes([mesh]).ok, true);
    assert.equal(hashStaticMesh(mesh), hashStaticMesh(mesh));
  });

  it("instantiates mesh vertices with scale and translation", () => {
    const primitive = instantiateStaticMesh(triangle(), {
      ...DEFAULT_TRANSFORM,
      position: [10, 0, 0],
      scale: [2, 2, 2],
    }, "tri-instance-a", "tri");
    assert.deepEqual(Array.from(primitive.vertices), [10, 0, 0, 12, 0, 0, 10, 2, 0]);
    assert.equal(typeof primitive.evidence.meshAssetHash, "string");
    assert.equal(typeof primitive.evidence.instanceHash, "string");
    assert.equal(typeof primitive.evidence.bakedGeometryHash, "string");
  });

  it("bakes Euler rotation into static mesh vertices and normals", () => {
    const primitive = instantiateStaticMesh(triangle(), {
      ...DEFAULT_TRANSFORM,
      rotation: [0, 0, Math.PI / 2],
    }, "tri-instance-rotated", "tri");
    const rounded = Array.from(primitive.vertices).map((value) => Math.round(value * 1000) / 1000);
    assert.deepEqual(rounded, [0, 0, 0, 0, 1, 0, -1, 0, 0]);
    assert.deepEqual(Array.from(primitive.normals ?? []).map((value) => Math.round(value * 1000) / 1000), [0, 0, 1, 0, 0, 1, 0, 0, 1]);
  });

  it("rejects invalid triangle indices", () => {
    const mesh = { ...triangle(), indices: new Uint16Array([0, 1, 99]) };
    const result = validateStaticMeshes([mesh]);
    assert.equal(result.ok, false);
    assert.deepEqual(result.issues.map((issue) => issue.code), ["mesh-index-out-of-range"]);
  });

  it("imports static meshes from OBJ and emits governed asset manifests", () => {
    const result = importStaticMeshesFromObj(`
o first
v 0 0 0
v 1 0 0
v 0 1 0
vt 0 0
vt 1 0
vt 0 1
vn 0 0 1
usemtl red
f 1/1/1 2/2/1 3/3/1
g second
usemtl blue
f 1/1/1 3/3/1 2/2/1
`, { idPrefix: "obj-tri", defaultMaterialId: "mat", sourceUri: "memory://tri.obj" });
    assert.equal(result.issues.length, 0);
    assert.equal(result.meshes.length, 2);
    assert.equal(result.meshes[0]!.id, "obj-tri:first");
    assert.equal(result.meshes[0]!.materialId, "red");
    assert.equal(result.meshes[1]!.id, "obj-tri:second:1");
    assert.equal(result.meshes[1]!.materialId, "blue");
    assert.deepEqual(Array.from(result.meshes[0]!.indices), [0, 1, 2]);
    assert.equal(result.assets[0]!.kind, "mesh");
    assert.equal(result.assets[0]!.uri, "memory://tri.obj");
    assert.equal(result.provenance[0]!.assetId, "asset:obj-tri:first");
    assert.equal(typeof hashAssetProvenance(result.provenance), "string");
  });

  it("parses OBJ MTL material properties and texture maps", () => {
    const result = importStaticMeshesFromObj(`
v 0 0 0
v 1 0 0
v 0 1 0
usemtl red
f 1 2 3
`, {
      idPrefix: "obj-mtl",
      mtlText: `
newmtl red
Kd 1 0.25 0.1
Ke 0.1 0 0
Ks 0.8 0.7 0.6
d 0.5
Ns 100
map_Kd albedo.png
norm normal.png
map_Pr roughness.png
`,
    });
    assert.equal(result.issues.length, 0);
    assert.equal(result.materials[0]!.id, "red");
    assert.equal(result.materials[0]!.type, "glass");
    assert.deepEqual(result.materials[0]!.baseColor, [1, 0.25, 0.1]);
    assert.equal(result.textures.length, 3);
    assert.deepEqual(result.materials[0]!.textureRefs.map((ref) => ref.role), ["color", "normal", "roughness"]);
    assert.ok(result.provenance.some((record) => record.kind === "material" && record.assetId === "asset:material:red"));
    assert.ok(result.provenance.some((record) => record.kind === "texture" && record.assetId === "asset:texture:red:color"));
  });

  it("imports static meshes from a minimal GLB", () => {
    const glb = tinyStaticMeshGlb();
    const result = importStaticMeshesFromGlb(glb, {
      idPrefix: "glb-tri",
      defaultMaterialId: "fallback",
      decodeTexturePixels: (bytes, mimeType) => mimeType === "image/png"
        ? { width: 2, height: 3, pixels: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]) }
        : null,
    });
    assert.equal(result.issues.length, 0);
    assert.equal(result.meshes[0]!.id, "tri-prim");
    assert.equal(result.meshes[0]!.materialId, "mat");
    assert.deepEqual(Array.from(result.meshes[0]!.indices), [0, 1, 2]);
    assert.equal(result.assets[0]!.kind, "mesh");
    assert.equal(result.materials[0]!.id, "mat");
    assert.equal(result.materials[0]!.type, "metal");
    assert.equal(result.materials[0]!.metallic, 0.8);
    assert.equal(result.materials[0]!.roughness, 0.25);
    assert.deepEqual(result.materials[0]!.textureRefs.map((ref) => ref.role), ["color", "roughness", "metallic", "normal", "emissive"]);
    assert.equal(result.textures[0]!.id, "albedo");
    assert.equal(result.textures[0]!.width, 2);
    assert.equal(result.textures[0]!.height, 3);
    assert.deepEqual(Array.from(result.textures[0]!.decodedPixels ?? []), [255, 0, 0, 255, 0, 255, 0, 255]);
    assert.deepEqual(Array.from((result.textures[0]!.embeddedBytes ?? []).slice(0, 4)), [137, 80, 78, 71]);
    assert.ok(result.provenance.some((record) => record.kind === "texture" && record.transforms[0]!.details.decoded === true));
  });
});

function align4(value: number): number {
  return (value + 3) & ~3;
}

function tinyStaticMeshGlb(): Uint8Array {
  const chunks: Uint8Array[] = [];
  const push = (array: Uint8Array): number => {
    const offset = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    chunks.push(array);
    const padding = align4(array.byteLength) - array.byteLength;
    if (padding) chunks.push(new Uint8Array(padding));
    return offset;
  };
  const floats = (values: number[]) => new Uint8Array(new Float32Array(values).buffer);
  const u16 = (values: number[]) => new Uint8Array(new Uint16Array(values).buffer);
  const positionOffset = push(floats([0, 0, 0, 1, 0, 0, 0, 1, 0]));
  const normalOffset = push(floats([0, 0, 1, 0, 0, 1, 0, 0, 1]));
  const uvOffset = push(floats([0, 0, 1, 0, 0, 1]));
  const indexOffset = push(u16([0, 1, 2]));
  const pngBytes = new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    0, 0, 0, 13, 73, 72, 68, 82,
    0, 0, 0, 2,
    0, 0, 0, 3,
    8, 6, 0, 0, 0,
  ]);
  const imageOffset = push(pngBytes);
  const bin = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  const json = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: positionOffset, byteLength: 36 },
      { buffer: 0, byteOffset: normalOffset, byteLength: 36 },
      { buffer: 0, byteOffset: uvOffset, byteLength: 24 },
      { buffer: 0, byteOffset: indexOffset, byteLength: 6 },
      { buffer: 0, byteOffset: imageOffset, byteLength: pngBytes.byteLength },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 3, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    images: [{ name: "albedo-img", bufferView: 4, mimeType: "image/png" }],
    textures: [
      { name: "albedo", source: 0 },
      { name: "metalrough", source: 0 },
      { name: "normal", source: 0 },
      { name: "emissive", source: 0 },
    ],
    materials: [{
      name: "mat",
      pbrMetallicRoughness: {
        baseColorFactor: [0.25, 0.5, 0.75, 1],
        metallicFactor: 0.8,
        roughnessFactor: 0.25,
        baseColorTexture: { index: 0 },
        metallicRoughnessTexture: { index: 1 },
      },
      normalTexture: { index: 2 },
      emissiveTexture: { index: 3 },
    }],
    meshes: [{
      name: "glb-tri",
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0, extras: { engine3dMeshId: "tri-prim" } }],
    }],
  };
  const jsonText = JSON.stringify(json);
  const jsonChunkLength = align4(Buffer.byteLength(jsonText));
  const jsonChunk = Buffer.alloc(jsonChunkLength, 0x20);
  jsonChunk.write(jsonText);
  const totalLength = 12 + 8 + jsonChunk.byteLength + 8 + bin.byteLength;
  const out = Buffer.alloc(totalLength);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLength, 8);
  out.writeUInt32LE(jsonChunk.byteLength, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(out, 20);
  const binHeader = 20 + jsonChunk.byteLength;
  out.writeUInt32LE(bin.byteLength, binHeader);
  out.writeUInt32LE(0x004e4942, binHeader + 4);
  bin.copy(out, binHeader + 8);
  return out;
}
