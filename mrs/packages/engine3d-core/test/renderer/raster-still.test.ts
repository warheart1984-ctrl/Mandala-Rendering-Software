/**
 * Soft-raster still tests (C-1, C-2, R-3).
 * Status: **enforced** for HeadlessStillRenderer / demo box.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  HeadlessGLStillRenderer,
  encodePngRgba,
  renderStillBuffers,
  sha256Hex,
  type RasterCamera,
} from "../../src/renderer/raster/HeadlessStillRenderer.js";
import { buildBoxMesh, buildDemoPortraitMeshes } from "../../src/renderer/raster/portraitMeshes.js";
import { IDENTITY_MAT4 } from "../../src/human/mat4.js";

function cam(overrides: Partial<RasterCamera> = {}): RasterCamera {
  return {
    id: "test-cam",
    eye: [0, 0.4, 3.2],
    lookAt: [0, 0.2, 0],
    up: [0, 1, 0],
    fovY: 0.7,
    near: 0.1,
    far: 20,
    width: 64,
    height: 48,
    ...overrides,
  };
}

describe("HeadlessStillRenderer", () => {
  it("C-1: rejects non-positive resolution", () => {
    assert.throws(() =>
      renderStillBuffers({
        camera: cam({ width: 0 }),
        meshes: [buildBoxMesh("b")],
      }),
    );
  });

  it("C-2: rejects invalid near/far", () => {
    assert.throws(() =>
      renderStillBuffers({
        camera: cam({ near: 0 }),
        meshes: [buildBoxMesh("b")],
      }),
    );
    assert.throws(() =>
      renderStillBuffers({
        camera: cam({ near: 5, far: 1 }),
        meshes: [buildBoxMesh("b")],
      }),
    );
  });

  it("R-2/R-3: beauty+depth+normal match camera resolution", () => {
    const camera = cam({ width: 80, height: 60 });
    const buffers = renderStillBuffers({
      camera,
      meshes: [buildBoxMesh("box", [1.2, 1.2, 1.2], [0.8, 0.3, 0.2])],
      aov: { depth: true, normal: true },
    });
    assert.equal(buffers.width, 80);
    assert.equal(buffers.height, 60);
    assert.equal(buffers.beautyRgba.length, 80 * 60 * 4);
    assert.ok(buffers.depthRgba);
    assert.ok(buffers.normalRgba);
    assert.equal(buffers.depthRgba!.length, 80 * 60 * 4);
    assert.equal(buffers.normalRgba!.length, 80 * 60 * 4);
    // Non-clear pixels exist (box visible)
    let lit = 0;
    for (let i = 0; i < buffers.beautyRgba.length; i += 4) {
      if (buffers.beautyRgba[i]! > 40) lit += 1;
    }
    assert.ok(lit > 50, `expected lit pixels, got ${lit}`);
  });

  it("is deterministic for same camera+mesh", () => {
    const req = {
      camera: cam(),
      meshes: [buildBoxMesh("box")],
      aov: { depth: true, normal: true },
    };
    const a = renderStillBuffers(req);
    const b = renderStillBuffers(req);
    assert.equal(sha256Hex(a.beautyRgba), sha256Hex(b.beautyRgba));
    assert.equal(sha256Hex(a.depthRgba!), sha256Hex(b.depthRgba!));
  });

  it("writes PNG files via HeadlessGLStillRenderer", () => {
    const dir = mkdtempSync(join(tmpdir(), "e3d-still-"));
    try {
      const renderer = new HeadlessGLStillRenderer({
        camera: cam({ width: 32, height: 32 }),
        meshes: buildDemoPortraitMeshes(),
        aov: { depth: true, normal: true },
      });
      const files = renderer.renderToDir(dir);
      const beauty = readFileSync(files.beautyPath);
      assert.equal(beauty[0], 0x89);
      assert.equal(beauty[1], 0x50);
      assert.equal(files.beautySha256.length, 64);
      assert.ok(files.depthPath);
      assert.ok(files.normalPath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("encodePngRgba produces valid signature", () => {
    const rgba = new Uint8Array(4 * 2 * 2);
    rgba.fill(128);
    const png = encodePngRgba(2, 2, rgba);
    assert.equal(png[0], 0x89);
    assert.ok(png.length > 40);
  });

  it("IDENTITY box uses identity model matrix", () => {
    const m = buildBoxMesh("x", [1, 1, 1], [1, 1, 1], IDENTITY_MAT4);
    assert.equal(m.modelMatrix[0], 1);
    assert.equal(m.indices.length % 3, 0);
  });
});
