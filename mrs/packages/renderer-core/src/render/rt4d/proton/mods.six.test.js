/**
 * CECP six-mod + pipeline acceptance tests.
 * STATUS target: **enforced**
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sceneToProtonField,
  assertProtonFieldInvariants,
} from "./sceneToProtonField.js";
import { applyLighting4D } from "./lighting4d.js";
import {
  projectProtonField,
  defaultCamera4D,
} from "./projectProtonField.js";
import { rasterizeProtons } from "./rasterizeProtons.js";
import {
  depthFromRaster,
  assertDepthFieldInvariants,
} from "./depthField.js";
import {
  normalsFromRaster,
  assertNormalFieldInvariants,
} from "./normalField.js";
import { rasterToImage } from "./rasterToImage.js";
import { runProtonPipeline, demoSceneSpec } from "./pipeline.js";

const INTENT = "intent-cecp-proton-test";

describe("Mod1 Scene→ProtonField", () => {
  it("emits ≥1 proton per entity and no orphans", () => {
    const field = sceneToProtonField(demoSceneSpec(), { intentId: INTENT });
    const inv = assertProtonFieldInvariants(field);
    assert.equal(inv.ok, true, inv.errors.join("; "));
    assert.ok(field.protons.length >= field.entityIds.length);
    assert.ok(field.protons.every((p) => p.metadata.sourceEntityId));
    assert.ok(field.protons.every((p) => Array.isArray(p.center) && p.center.length === 4));
    assert.ok(field.protons.every((p) => typeof p.density === "number"));
  });

  it("is deterministic (same fieldHash)", () => {
    const a = sceneToProtonField(demoSceneSpec(), { intentId: INTENT });
    const b = sceneToProtonField(demoSceneSpec(), { intentId: INTENT });
    assert.equal(a.fieldHash, b.fieldHash);
  });
});

describe("Mod6 ProtonField→Lighting4D", () => {
  it("is deterministic and changes color under light", () => {
    const field = sceneToProtonField(demoSceneSpec(), { intentId: INTENT });
    const litA = applyLighting4D(field, [
      { position: [2, 2, -3, 0], intensity: 1.5, falloff: 0.2 },
    ]);
    const litB = applyLighting4D(field, [
      { position: [2, 2, -3, 0], intensity: 1.5, falloff: 0.2 },
    ]);
    assert.equal(litA.fieldHash, litB.fieldHash);
    assert.notEqual(litA.fieldHash, field.fieldHash);
  });
});

describe("Mod2 ProtonField→4DProjection", () => {
  it("does not silently lose protons", () => {
    const field = sceneToProtonField(demoSceneSpec(), { intentId: INTENT });
    const projected = projectProtonField(field, defaultCamera4D({ width: 64, height: 64 }));
    assert.equal(
      projected.protons.length + projected.dropped.length,
      field.protons.length,
    );
    assert.ok(projected.protons.length > 0);
    assert.ok(projected.protons.every((p) => p.depth >= 0));
  });
});

describe("Mod3 ProjectedProtonField→ProtonRaster", () => {
  it("refuses without intentId", () => {
    const field = sceneToProtonField(demoSceneSpec(), { intentId: INTENT });
    const projected = projectProtonField(field, defaultCamera4D({ width: 32, height: 32 }));
    assert.throws(
      () => rasterizeProtons(projected, /** @type {any} */ ({ width: 32, height: 32 })),
      /intentId/,
    );
  });

  it("same inputs → same frameSha256", () => {
    const field = applyLighting4D(
      sceneToProtonField(demoSceneSpec(), { intentId: INTENT }),
    );
    const cam = defaultCamera4D({ width: 48, height: 48 });
    const projected = projectProtonField(field, cam);
    const a = rasterizeProtons(projected, { intentId: INTENT, width: 48, height: 48 });
    const b = rasterizeProtons(projected, { intentId: INTENT, width: 48, height: 48 });
    assert.equal(a.evidence.frameSha256, b.evidence.frameSha256);
    assert.equal(a.evidence.protonCount, projected.protons.length);
  });
});

describe("Mod4 ProtonRaster→DepthField", () => {
  it("non-negative finite depths", () => {
    const result = runProtonPipeline(demoSceneSpec(), {
      intentId: INTENT,
      width: 40,
      height: 40,
    });
    const inv = assertDepthFieldInvariants(result.depth);
    assert.equal(inv.ok, true, inv.errors.join("; "));
    assert.ok(result.depth.min >= 0);
    assert.ok(result.depth.max >= result.depth.min);
  });
});

describe("Mod5 ProtonRaster→NormalField", () => {
  it("no NaNs; unit or zero", () => {
    const result = runProtonPipeline(demoSceneSpec(), {
      intentId: INTENT,
      width: 40,
      height: 40,
    });
    const inv = assertNormalFieldInvariants(result.normals);
    assert.equal(inv.ok, true, inv.errors.join("; "));
  });
});

describe("E2E pipeline + PNG", () => {
  it("writes stable frameSha256 and png bytes", () => {
    const a = runProtonPipeline(demoSceneSpec(), {
      intentId: INTENT,
      width: 64,
      height: 64,
    });
    const b = runProtonPipeline(demoSceneSpec(), {
      intentId: INTENT,
      width: 64,
      height: 64,
    });
    assert.equal(a.evidence.frameSha256, b.evidence.frameSha256);
    assert.equal(a.evidence.pngSha256, b.evidence.pngSha256);
    assert.ok(a.image.png.length > 100);
    assert.equal(a.evidence.mods.sceneToProtonField, "enforced");
    const img = rasterToImage(a.raster);
    assert.equal(img.sha256, a.evidence.pngSha256);
  });
});
