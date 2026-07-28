/**
 * 4D star world → RT4D primitives (Draft 0.1 implementation tests).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  create4dStarWorld,
  worldDocumentToRt4dStar,
  generateStarArmDirections,
} from "../../src/world/StarWorld.js";
import {
  worldDocumentToRt4dPrimitives,
  worldDocumentToBridgePrimitives,
  worldDocumentToRt4dStarBridge,
} from "../../src/scene/WorldDocumentRt4d.js";
import { createWorldGenerator, generateWorldFromGenerator } from "../../src/world/WorldGenerator.js";
import { worldDocumentToRasterMeshes } from "../../src/renderer/raster/worldDocumentMeshes.js";
import { renderStillBuffers } from "../../src/renderer/raster/HeadlessStillRenderer.js";
import { MATERIAL_CATALOG_VERSION } from "../../src/materials/StarMaterials.js";

describe("create4dStarWorld", () => {
  it("is deterministic for identical seed/params", () => {
    const a = create4dStarWorld({ seed: 42, armCount: 8, includeHalo: true });
    const b = create4dStarWorld({ seed: 42, armCount: 8, includeHalo: true });
    assert.equal(a.id, b.id);
    assert.deepEqual(
      a.objects.map((o) => [o.id, o.transform, o.material?.materialId]),
      b.objects.map((o) => [o.id, o.transform, o.material?.materialId]),
    );
    const pa = worldDocumentToRt4dPrimitives(a);
    const pb = worldDocumentToRt4dPrimitives(b);
    assert.deepEqual(
      pa.map((p) => ({ id: p.id, kind: p.kind, role: p.materialRole })),
      pb.map((p) => ({ id: p.id, kind: p.kind, role: p.materialRole })),
    );
  });

  it("attaches full catalog + star presets", () => {
    const world = create4dStarWorld({ seed: 7, armCount: 6 });
    const ids = new Set(world.materials.map((m) => m.id));
    assert.ok(ids.has("um_star_core"));
    assert.ok(ids.has("um_star_arm"));
    assert.ok(ids.has("um_star_halo"));
    assert.ok(ids.has("default_basic"));
    assert.ok(world.materials.length >= 15);
  });

  it("emits Rt4dStar composite + decomposed capsules with provenance", () => {
    const world = create4dStarWorld({ seed: 99, armCount: 8, armLength: 2 });
    const star = worldDocumentToRt4dStarBridge(world);
    assert.ok(star);
    assert.equal(star!.kind, "rt4d_star");
    assert.equal(star!.arms.length, 8);
    assert.equal(star!.provenance.catalogVersion, MATERIAL_CATALOG_VERSION);
    assert.ok(star!.provenance.hash.startsWith("sha256:"));

    const prims = worldDocumentToRt4dPrimitives(world);
    const capsules = prims.filter((p) => p.kind === "oriented-capsule");
    assert.equal(capsules.length, 8);
    assert.ok(prims.every((p) => p.provenance.originNode));
    assert.ok(prims.every((p) => p.provenance.integrityHash));
    assert.ok(prims.some((p) => p.provenance.specRole === "glass_capsule"));
    assert.ok(prims.some((p) => p.provenance.specRole === "emissive_capsule"));

    // True 4D: at least one arm has non-zero w endpoint
    const dirs = generateStarArmDirections(99, 8);
    assert.ok(dirs.some((d) => Math.abs(d[3]) > 1e-6));
    const bridge = worldDocumentToBridgePrimitives(world);
    assert.ok(bridge.some((p) => p.kind === "oriented_capsule"));
    assert.ok(bridge.every((p) => p.provenance?.catalogVersion === MATERIAL_CATALOG_VERSION));
  });

  it("soft-rasters star worldDocument", () => {
    const world = create4dStarWorld({ seed: 3, armCount: 6, includeHalo: false });
    const meshes = worldDocumentToRasterMeshes(world);
    assert.ok(meshes.length >= 7);
    const buffers = renderStillBuffers({
      camera: {
        id: "c",
        eye: [0, 3, 8],
        lookAt: [0, 0.6, 0],
        up: [0, 1, 0],
        fovY: 0.7,
        near: 0.1,
        far: 40,
        width: 48,
        height: 36,
      },
      meshes,
    });
    let lit = 0;
    for (let i = 0; i < buffers.beautyRgba.length; i += 4) {
      if ((buffers.beautyRgba[i]! + buffers.beautyRgba[i + 1]! + buffers.beautyRgba[i + 2]!) / 3 > 25) {
        lit += 1;
      }
    }
    assert.ok(lit > 10, `lit=${lit}`);
  });

  it("createWorldGenerator('star') routes to create4dStarWorld", () => {
    const world = generateWorldFromGenerator(
      createWorldGenerator("star", 11, { armCount: 5, includeHalo: 0 }),
    );
    assert.equal(world.generator?.type, "star");
    assert.ok(world.objects.some((o) => o.id === "star-core"));
    assert.equal(worldDocumentToRt4dStar(world)?.arms.length, 5);
  });
});
