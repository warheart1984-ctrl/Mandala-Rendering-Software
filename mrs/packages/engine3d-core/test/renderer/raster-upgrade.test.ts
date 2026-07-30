/**
 * Soft-raster upgrade: multi-light, supersample AA, SSAO post.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyDepthFog,
  applyScreenSpaceAo,
  applyDepthOfFieldProxy,
  applyTemporalMotionBlur,
  applyCinematicColorGrade,
  applyVolumetricDust,
  applyContactShadowBoost,
} from "../../src/renderer/raster/RasterPostProcess.js";
import {
  createCinematicLightRig,
  createDramaticCinematicLightRig,
  createDefaultMaterialCatalog,
  rasterMaterialFromUniversal,
  shadeRasterFragment,
  shadeRasterFragmentLights,
} from "../../src/renderer/raster/RasterMaterial.js";
import {
  buildBoxMesh,
  buildUvSphereMesh,
} from "../../src/renderer/raster/portraitMeshes.js";
import { renderStillBuffers } from "../../src/renderer/raster/HeadlessStillRenderer.js";
import { IDENTITY_MAT4 } from "../../src/human/mat4.js";

const cam = {
  id: "c",
  eye: [0, 1.2, 4] as const,
  lookAt: [0, 0.2, 0] as const,
  up: [0, 1, 0] as const,
  fovY: 0.9,
  near: 0.1,
  far: 40,
  width: 96,
  height: 64,
};

describe("soft-raster upgrade — multi-light", () => {
  it("cinematic light rig has key + fill + rim", () => {
    const lights = createCinematicLightRig([-0.2, -1, -0.3]);
    assert.equal(lights.length, 3);
    assert.ok((lights[0]!.intensity ?? 0) > (lights[1]!.intensity ?? 0));
  });

  it("multi-light skin is brighter than single key on lit side", () => {
    const skin = rasterMaterialFromUniversal(
      createDefaultMaterialCatalog().find((m) => m.type === "skin")!,
    );
    const n: [number, number, number] = [0.2, 0.8, 0.4];
    const v: [number, number, number] = [0, 0.2, 1];
    const single = shadeRasterFragment(skin, n, [-0.35, -1, -0.45], v);
    const multi = shadeRasterFragmentLights(
      skin,
      n,
      createCinematicLightRig([-0.35, -1, -0.45]),
      v,
    );
    const sLum = (single[0] + single[1] + single[2]) / 3;
    const mLum = (multi[0] + multi[1] + multi[2]) / 3;
    assert.ok(mLum >= sLum * 0.95, `single=${sLum} multi=${mLum}`);
    assert.ok(multi.every((c) => c >= 0 && c <= 1));
  });

  it("renderStillBuffers cinematicLighting changes beauty vs single light", () => {
    const mats = createDefaultMaterialCatalog();
    const skin = rasterMaterialFromUniversal(mats.find((m) => m.type === "skin")!);
    const cloth = rasterMaterialFromUniversal(mats.find((m) => m.type === "cloth")!);
    const meshes = [
      { ...buildUvSphereMesh("head", 0.4, 16, 12, skin.baseColor, IDENTITY_MAT4), material: skin },
      { ...buildBoxMesh("torso", [0.6, 0.7, 0.35], cloth.baseColor, IDENTITY_MAT4), material: cloth },
    ];
    const single = renderStillBuffers({
      camera: cam,
      meshes,
      lightDir: [-0.35, -1, -0.45],
      aov: { depth: true, normal: true },
    });
    const cine = renderStillBuffers({
      camera: cam,
      meshes,
      lightDir: [-0.35, -1, -0.45],
      cinematicLighting: true,
      gatherEmissiveLights: false,
      aov: { depth: true, normal: true },
    });
    assert.equal(single.width, cine.width);
    let diff = 0;
    for (let i = 0; i < single.beautyRgba.length; i += 4) {
      diff += Math.abs(single.beautyRgba[i]! - cine.beautyRgba[i]!);
    }
    assert.ok(diff > 50, `expected visible lighting delta, got ${diff}`);
  });
});

describe("soft-raster upgrade — supersample", () => {
  it("supersample=2 returns requested width/height", () => {
    const mesh = buildBoxMesh("b", [1, 1, 1], [0.7, 0.7, 0.75], IDENTITY_MAT4);
    const out = renderStillBuffers({
      camera: cam,
      meshes: [mesh],
      supersample: 2,
      cinematicLighting: true,
      aov: { depth: true, normal: false },
    });
    assert.equal(out.width, cam.width);
    assert.equal(out.height, cam.height);
    assert.ok(out.beautyRgba.length === cam.width * cam.height * 4);
    assert.ok(out.depthRgba != null);
  });
});

describe("soft-raster upgrade — SSAO / fog post", () => {
  it("SSAO darkens some pixels vs input", () => {
    const mesh = buildBoxMesh("b", [2, 1, 1], [0.8, 0.8, 0.8], IDENTITY_MAT4);
    const buf = renderStillBuffers({
      camera: cam,
      meshes: [mesh],
      cinematicLighting: true,
      aov: { depth: true, normal: true },
    });
    const ao = applyScreenSpaceAo(
      buf.beautyRgba,
      buf.depthRgba!,
      buf.width,
      buf.height,
      { strength: 0.6 },
      buf.normalRgba,
    );
    let darker = 0;
    for (let i = 0; i < ao.length; i += 4) {
      if (ao[i]! < buf.beautyRgba[i]!) darker += 1;
    }
    assert.ok(darker > 10, `expected some AO darkening, got ${darker}`);
  });

  it("depth fog blends toward fog color", () => {
    const mesh = buildBoxMesh("b", [1, 1, 1], [0.2, 0.2, 0.2], IDENTITY_MAT4);
    const buf = renderStillBuffers({
      camera: { ...cam, eye: [0, 0.5, 8] },
      meshes: [mesh],
      aov: { depth: true, normal: false },
    });
    const fogged = applyDepthFog(
      buf.beautyRgba,
      buf.depthRgba!,
      buf.width,
      buf.height,
      [0.5, 0.6, 0.8],
      0.8,
    );
    assert.equal(fogged.length, buf.beautyRgba.length);
  });
});

describe("buildBoxMesh UVs", () => {
  it("boxes expose UV0 for texture path", () => {
    const box = buildBoxMesh("uvbox", [1, 1, 1]);
    assert.ok(box.uvs != null && box.uvs.length === (box.positions.length / 3) * 2);
  });
});

describe("soft-raster cinematic-v2 posts", () => {
  it("dramatic light rig has stronger key / weaker fill than default", () => {
    const base = createCinematicLightRig();
    const drama = createDramaticCinematicLightRig();
    assert.equal(drama.length, 3);
    assert.ok((drama[0]!.intensity ?? 0) > (base[0]!.intensity ?? 0));
    assert.ok((drama[1]!.intensity ?? 0) < (base[1]!.intensity ?? 0));
  });

  it("DOF proxy differs from input when depth varies", () => {
    const mesh = buildBoxMesh("b", [2, 1.2, 1], [0.75, 0.75, 0.8], IDENTITY_MAT4);
    const buf = renderStillBuffers({
      camera: cam,
      meshes: [mesh],
      cinematicLighting: true,
      aov: { depth: true, normal: false },
    });
    const dof = applyDepthOfFieldProxy(
      buf.beautyRgba,
      buf.depthRgba!,
      buf.width,
      buf.height,
      { focusDepth: 0.35, cocScale: 6, maxRadius: 2, strength: 1 },
    );
    let diff = 0;
    for (let i = 0; i < dof.length; i += 4) {
      diff += Math.abs(dof[i]! - buf.beautyRgba[i]!);
    }
    assert.ok(diff > 20, `expected DOF delta, got ${diff}`);
  });

  it("temporal motion blur blends toward previous frame", () => {
    const cur = new Uint8Array(16);
    const prev = new Uint8Array(16);
    for (let i = 0; i < 16; i += 4) {
      cur[i] = 200;
      cur[i + 1] = 100;
      cur[i + 2] = 50;
      cur[i + 3] = 255;
      prev[i] = 0;
      prev[i + 1] = 0;
      prev[i + 2] = 0;
      prev[i + 3] = 255;
    }
    const blurred = applyTemporalMotionBlur(cur, prev, { amount: 0.3 });
    assert.ok(blurred[0]! < 200 && blurred[0]! > 100);
    const identity = applyTemporalMotionBlur(cur, null);
    assert.equal(identity[0], 200);
  });

  it("cinematic color grade changes pixels", () => {
    const src = new Uint8Array(4 * 8 * 8);
    for (let i = 0; i < src.length; i += 4) {
      src[i] = 120;
      src[i + 1] = 110;
      src[i + 2] = 100;
      src[i + 3] = 255;
    }
    const graded = applyCinematicColorGrade(src, 8, 8, { vignette: 0.5 });
    let diff = 0;
    for (let i = 0; i < graded.length; i += 4) {
      diff += Math.abs(graded[i]! - src[i]!);
    }
    assert.ok(diff > 10, `expected grade delta, got ${diff}`);
  });

  it("volumetric dust changes some pixels", () => {
    const src = new Uint8Array(4 * 64 * 48);
    const depth = new Uint8Array(src.length);
    for (let i = 0; i < src.length; i += 4) {
      src[i] = 40;
      src[i + 1] = 40;
      src[i + 2] = 45;
      src[i + 3] = 255;
      depth[i] = 160;
      depth[i + 1] = 160;
      depth[i + 2] = 160;
      depth[i + 3] = 255;
    }
    const dusty = applyVolumetricDust(src, depth, 64, 48, {
      density: 1,
      brightness: 1,
      seed: 3,
    });
    let brighter = 0;
    for (let i = 0; i < dusty.length; i += 4) {
      if (dusty[i]! > src[i]!) brighter += 1;
    }
    assert.ok(brighter > 0, `expected dust motes, brighter=${brighter}`);
  });

  it("contact shadow boost darkens some edge pixels", () => {
    const mesh = buildBoxMesh("b", [1.5, 1, 1], [0.85, 0.85, 0.85], IDENTITY_MAT4);
    const buf = renderStillBuffers({
      camera: cam,
      meshes: [mesh],
      cinematicLighting: true,
      aov: { depth: true, normal: false },
    });
    const boosted = applyContactShadowBoost(
      buf.beautyRgba,
      buf.depthRgba!,
      buf.width,
      buf.height,
      0.4,
    );
    let darker = 0;
    for (let i = 0; i < boosted.length; i += 4) {
      if (boosted[i]! < buf.beautyRgba[i]!) darker += 1;
    }
    assert.ok(darker > 5, `expected contact darkening, got ${darker}`);
  });
});
