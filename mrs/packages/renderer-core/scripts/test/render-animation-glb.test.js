import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readdirSync, readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SCRIPT_PATH = join(import.meta.dirname, "..", "render-animation.mjs");

function buildTestGlb() {
  const vertices = new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1.5, 0]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const indices = new Uint16Array([0, 1, 2]);

  const vertexBytes = vertices.buffer;
  const normalBytes = normals.buffer;
  const indexBytes = indices.buffer;

  const vertexOffset = 0;
  const normalOffset = vertexBytes.byteLength;
  const indexOffset = normalOffset + normalBytes.byteLength;
  const totalBinLength = indexOffset + indexBytes.byteLength;
  const paddedBinLength = totalBinLength + ((4 - (totalBinLength % 4)) % 4);

  const gltfJson = {
    asset: { version: "2.0", generator: "test" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      name: "test-tri",
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1 },
        indices: 2,
        material: 0,
      }],
    }],
    accessors: [
      { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: "VEC3", max: [1, 1.5, 0], min: [-1, 0, 0] },
      { bufferView: 1, byteOffset: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, byteOffset: 0, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: vertexOffset, byteLength: vertexBytes.byteLength },
      { buffer: 0, byteOffset: normalOffset, byteLength: normalBytes.byteLength },
      { buffer: 0, byteOffset: indexOffset, byteLength: indexBytes.byteLength },
    ],
    buffers: [{ byteLength: paddedBinLength }],
    materials: [{
      name: "red",
      pbrMetallicRoughness: { baseColorFactor: [0.8, 0.2, 0.2, 1], roughnessFactor: 0.5, metallicFactor: 0 },
    }],
  };

  const jsonStr = JSON.stringify(gltfJson);
  const jsonBytes = new TextEncoder().encode(jsonStr);
  const paddedJsonLength = jsonBytes.byteLength + ((4 - (jsonBytes.byteLength % 4)) % 4);

  const binData = new Uint8Array(paddedBinLength);
  binData.set(new Uint8Array(vertexBytes), vertexOffset);
  binData.set(new Uint8Array(normalBytes), normalOffset);
  binData.set(new Uint8Array(indexBytes), indexOffset);

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

  return new Uint8Array(glb);
}

function runScript(args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = execFile("node", [SCRIPT_PATH, ...args], { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        err.stdout = stdout;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

test("render-animation renders GLB frames and manifest", async () => {
  const tmpDir = join(tmpdir(), "mrs-anim-glb-" + Date.now());
  const outDir = join(tmpDir, "frames");
  const glbPath = join(tmpDir, "test.glb");
  try {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(glbPath, buildTestGlb());

    const { stdout } = await runScript([
      "--glb", glbPath,
      "--frames", "4",
      "--width", "32",
      "--height", "32",
      "--samples", "1",
      "--seed", "42",
      "--output-dir", outDir,
    ]);

    assert.ok(existsSync(join(outDir, "manifest.json")), "manifest.json should exist");

    const manifest = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8"));
    assert.equal(manifest.frames, 4);
    assert.equal(manifest.frames_meta.length, 4);
    assert.equal(manifest.kind, "glb-animation-orbit");
    assert.ok(typeof manifest.manifest_hash === "string");
    assert.ok(manifest.manifest_hash.length === 64);

    for (const fm of manifest.frames_meta) {
      const fp = join(outDir, fm.file);
      assert.ok(existsSync(fp), `${fm.file} should exist`);
      const png = readFileSync(fp);
      assert.ok(png.subarray(0, 8).equals(PNG_SIG), `${fm.file} should be valid PNG`);
      assert.ok(typeof fm.sha256 === "string");
      assert.equal(fm.sha256.length, 64);
      assert.ok(fm.orbit >= 0 && fm.orbit <= 360, `orbit ${fm.orbit} should be in [0,360]`);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("render-animation is deterministic across runs", async () => {
  const tmpDir = join(tmpdir(), "mrs-anim-det-" + Date.now());
  const outA = join(tmpDir, "a");
  const outB = join(tmpDir, "b");
  const glbPath = join(tmpDir, "test.glb");
  try {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(glbPath, buildTestGlb());

    const run = async (outDir) => runScript([
      "--glb", glbPath,
      "--frames", "2",
      "--width", "32",
      "--height", "32",
      "--samples", "1",
      "--seed", "99",
      "--output-dir", outDir,
    ]);

    await run(outA);
    await run(outB);

    const manifestA = JSON.parse(readFileSync(join(outA, "manifest.json"), "utf8"));
    const manifestB = JSON.parse(readFileSync(join(outB, "manifest.json"), "utf8"));
    assert.equal(manifestA.manifest_hash, manifestB.manifest_hash, "same seed should produce same manifest hash");

    for (let i = 0; i < 2; i++) {
      const fileA = join(outA, manifestA.frames_meta[i].file);
      const fileB = join(outB, manifestB.frames_meta[i].file);
      assert.ok(readFileSync(fileA).equals(readFileSync(fileB)), `frame ${i} PNG bytes should be identical`);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("render-animation CLI requires --glb or --prompt", async () => {
  try {
    await runScript(["--frames", "2", "--output-dir", "/tmp/nope"]);
    assert.fail("should have thrown for missing --glb/--prompt");
  } catch (err) {
    assert.ok(err.code !== 0 || err.message.includes("exit"), "should fail with non-zero exit");
  }
});
