/**
 * UV multi-map texture sampling + WorldDocument soft-raster coverage.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderStillBuffers } from "../../src/renderer/raster/HeadlessStillRenderer.js";
import {
  TextureBinder,
  applySampledMapsToMaterial,
  ensureTextureAssetsForMaterials,
} from "../../src/renderer/raster/TextureSampler.js";
import {
  rasterMaterialFromUniversal,
} from "../../src/renderer/raster/RasterMaterial.js";
import { buildUvSphereMesh } from "../../src/renderer/raster/portraitMeshes.js";
import { createUniversalMaterial } from "../../src/world/WorldObject.js";
import { IDENTITY_MAT4 } from "../../src/human/mat4.js";

describe("UV texture sampling (max soft-raster path)", () => {
  it("bilinear color + roughness maps change shade vs untextured", () => {
    const binder = new TextureBinder();
    const assets = ensureTextureAssetsForMaterials([
      createUniversalMaterial({
        id: "tex_plastic",
        type: "plastic",
        baseColor: [1, 1, 1],
        textureRefs: [
          { id: "albedo_check", role: "color" },
          { id: "norm_bump", role: "normal" },
          { id: "rough_map", role: "roughness" },
          { id: "ao_map", role: "ao" },
        ],
      }),
    ]);
    binder.loadAll(assets);

    const mat = rasterMaterialFromUniversal(
      createUniversalMaterial({
        id: "tex_plastic",
        type: "plastic",
        baseColor: [1, 1, 1],
        roughness: 0.5,
        textureRefs: [
          { id: "albedo_check", role: "color" },
          { id: "norm_bump", role: "normal" },
          { id: "rough_map", role: "roughness" },
          { id: "ao_map", role: "ao" },
        ],
      }),
    );
    const maps = binder.sampleMaps(mat, mat.textureRefs, [0.25, 0.25], [0, 0, 1]);
    assert.ok(maps.albedo);
    assert.ok(maps.normal);
    assert.ok(maps.roughness != null);
    assert.ok(maps.ao != null);
    const shaded = applySampledMapsToMaterial(mat, maps);
    assert.notDeepEqual(shaded.baseColor, mat.baseColor);
  });

  it("per-pixel UV mesh render produces lit pixels with textures bound", () => {
    const binder = new TextureBinder();
    binder.loadAll(
      ensureTextureAssetsForMaterials([
        createUniversalMaterial({
          id: "m",
          type: "basic",
          baseColor: [0.9, 0.9, 0.9],
          textureRefs: [{ id: "c0", role: "color" }],
        }),
      ]),
    );
    const mesh = buildUvSphereMesh("s", 0.6, 12, 8, [0.9, 0.9, 0.9], IDENTITY_MAT4);
    mesh.material = rasterMaterialFromUniversal(
      createUniversalMaterial({
        id: "m",
        type: "basic",
        baseColor: [0.9, 0.9, 0.9],
        textureRefs: [{ id: "c0", role: "color" }],
      }),
    );
    assert.ok(mesh.uvs && mesh.uvs.length > 0);

    const buffers = renderStillBuffers({
      camera: {
        id: "c",
        eye: [0, 0, 3],
        lookAt: [0, 0, 0],
        up: [0, 1, 0],
        fovY: 0.8,
        near: 0.1,
        far: 20,
        width: 48,
        height: 36,
      },
      meshes: [mesh],
      textures: binder,
      aov: { depth: true, normal: true },
    });
    let lit = 0;
    for (let i = 0; i < buffers.beautyRgba.length; i += 4) {
      if ((buffers.beautyRgba[i]! + buffers.beautyRgba[i + 1]! + buffers.beautyRgba[i + 2]!) / 3 > 20) {
        lit += 1;
      }
    }
    assert.ok(lit > 10, `expected textured lit pixels, got ${lit}`);
  });
});
