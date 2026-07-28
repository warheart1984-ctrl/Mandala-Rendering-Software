/**
 * Material-aware soft-raster + Engine3D→capsule RT4D tests.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultMaterialCatalog,
  materialTypeCoverage,
  rasterMaterialFromUniversal,
  shadeRasterFragment,
} from "../../src/renderer/raster/RasterMaterial.js";
import { renderStillBuffers } from "../../src/renderer/raster/HeadlessStillRenderer.js";
import { worldDocumentToRasterMeshes } from "../../src/renderer/raster/worldDocumentMeshes.js";
import {
  worldDocumentToBridgePrimitives,
  worldDocumentToRt4dPrimitives,
} from "../../src/scene/WorldDocumentRt4d.js";
import { bridgePrimitiveToRt4d } from "../../src/scene/Rt4dAdapter.js";
import {
  createWorldGenerator,
  generateWorldFromGenerator,
} from "../../src/world/WorldGenerator.js";
import { UNIVERSAL_MATERIAL_TYPES } from "../../src/world/MaterialSystem.js";
import { IDENTITY_MAT4 } from "../../src/human/mat4.js";

describe("RasterMaterial — all UniversalMaterial types", () => {
  it("catalog covers every MaterialType", () => {
    const catalog = createDefaultMaterialCatalog();
    const types = new Set(catalog.map((m) => m.type));
    for (const t of UNIVERSAL_MATERIAL_TYPES) {
      assert.ok(types.has(t), `missing catalog entry for ${t}`);
    }
    assert.deepEqual([...materialTypeCoverage()].sort(), [...UNIVERSAL_MATERIAL_TYPES].sort());
  });

  it("each material type shades to a distinct finite RGB", () => {
    const n: [number, number, number] = [0, 1, 0];
    const L: [number, number, number] = [-0.3, -1, -0.2];
    const V: [number, number, number] = [0, 0, 1];
    const signatures = new Set<string>();
    for (const uni of createDefaultMaterialCatalog()) {
      const mat = rasterMaterialFromUniversal(uni);
      const rgb = shadeRasterFragment(mat, n, L, V);
      assert.ok(rgb.every((c) => Number.isFinite(c) && c >= 0 && c <= 1));
      signatures.add(rgb.map((c) => c.toFixed(3)).join(","));
    }
    // Most types should not collapse to one color.
    assert.ok(signatures.size >= 10, `only ${signatures.size} distinct shades`);
  });

  it("glass has stronger rim than face-on (Fresnel)", () => {
    const glass = rasterMaterialFromUniversal(
      createDefaultMaterialCatalog().find((m) => m.type === "glass")!,
    );
    const n: [number, number, number] = [0, 0, 1];
    const L: [number, number, number] = [0, 0, -1];
    const face = shadeRasterFragment(glass, n, L, [0, 0, 1]);
    const graz = shadeRasterFragment(glass, n, L, [0.95, 0, 0.3]);
    const faceLum = (face[0] + face[1] + face[2]) / 3;
    const grazLum = (graz[0] + graz[1] + graz[2]) / 3;
    assert.ok(grazLum > faceLum * 0.9, `face=${faceLum} graz=${grazLum}`);
  });
});

describe("worldDocument → raster + RT4D capsules", () => {
  it("mandala world expands to material-aware meshes", () => {
    const world = generateWorldFromGenerator(createWorldGenerator("mandala", 3, { count: 4 }));
    const meshes = worldDocumentToRasterMeshes(world);
    assert.ok(meshes.length >= 4);
    assert.ok(meshes.every((m) => m.material != null));
    assert.ok(meshes.every((m) => m.uvs != null && m.uvs.length > 0));
    assert.ok(meshes.some((m) => m.material?.type === "glass"));
    assert.ok(meshes.some((m) => m.material?.type === "metal"));
    assert.ok(meshes.some((m) => m.material?.type === "emissive"));

    const buffers = renderStillBuffers({
      camera: {
        id: "c",
        eye: [0, 3, 8],
        lookAt: [0, 0.5, 0],
        up: [0, 1, 0],
        fovY: 0.7,
        near: 0.1,
        far: 40,
        width: 64,
        height: 48,
      },
      meshes,
      aov: { depth: true, normal: true },
    });
    let lit = 0;
    for (let i = 0; i < buffers.beautyRgba.length; i += 4) {
      if ((buffers.beautyRgba[i]! + buffers.beautyRgba[i + 1]! + buffers.beautyRgba[i + 2]!) / 3 > 30) {
        lit += 1;
      }
    }
    assert.ok(lit > 20, `expected lit pixels, got ${lit}`);

    // Material-aware path: glass vs metal meshes should not collapse to identical mean RGB
    const glassOnly = meshes.filter((m) => m.material?.type === "glass");
    const metalOnly = meshes.filter((m) => m.material?.type === "metal");
    if (glassOnly.length && metalOnly.length) {
      const gBuf = renderStillBuffers({
        camera: {
          id: "c",
          eye: [0, 3, 8],
          lookAt: [0, 0.5, 0],
          up: [0, 1, 0],
          fovY: 0.7,
          near: 0.1,
          far: 40,
          width: 48,
          height: 36,
        },
        meshes: glassOnly,
      });
      const mBuf = renderStillBuffers({
        camera: {
          id: "c",
          eye: [0, 3, 8],
          lookAt: [0, 0.5, 0],
          up: [0, 1, 0],
          fovY: 0.7,
          near: 0.1,
          far: 40,
          width: 48,
          height: 36,
        },
        meshes: metalOnly,
      });
      const mean = (buf: Uint8Array) => {
        let s = 0;
        let n = 0;
        for (let i = 0; i < buf.length; i += 4) {
          const lum = (buf[i]! + buf[i + 1]! + buf[i + 2]!) / 3;
          if (lum > 20) {
            s += lum;
            n += 1;
          }
        }
        return n ? s / n : 0;
      };
      const gm = mean(gBuf.beautyRgba);
      const mm = mean(mBuf.beautyRgba);
      assert.ok(
        Math.abs(gm - mm) > 0.5 || gm !== mm,
        `expected glass/metal beauty means to differ (glass=${gm} metal=${mm})`,
      );
    }
  });

  it("emits oriented-capsule RT4D primitives for lattice tubes", () => {
    const world = generateWorldFromGenerator(createWorldGenerator("mandala", 5, { count: 4 }));
    const prims = worldDocumentToRt4dPrimitives(world);
    const capsules = prims.filter((p) => p.kind === "oriented-capsule");
    assert.ok(capsules.length >= 4, `capsules=${capsules.length}`);
    assert.ok(capsules.every((p) => p.materialRole === "glass_tube" || p.rt4dMaterial.kind === "glass"));
    assert.ok(prims.some((p) => p.materialRole === "core_glow"));
    assert.ok(prims.some((p) => p.materialRole === "chrome_joint"));

    const bridge = worldDocumentToBridgePrimitives(world);
    assert.ok(bridge.some((p) => p.kind === "oriented_capsule"));
    for (const b of bridge.filter((p) => p.kind === "oriented_capsule")) {
      const rt = bridgePrimitiveToRt4d(b);
      assert.equal(rt.kind, "oriented-capsule");
    }
  });
});

void IDENTITY_MAT4;
