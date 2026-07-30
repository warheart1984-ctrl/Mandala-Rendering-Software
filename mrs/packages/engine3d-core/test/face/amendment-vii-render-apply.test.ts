/**
 * Amendment VII soft apply — CKL↔Apply wiring + world-profile path.
 * Status: **partial** (soft cinematic; gate deny authority is CKL).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyAmendmentVIIToMeshes,
  applyControlledOrganicAsymmetry,
} from "../../src/face/AmendmentVIIRenderApply.js";
import {
  CKL_AMENDMENT_VII_POLICY_IDS,
  CKL_WORLD_PROFILE_POLICY_IDS,
  evaluateCklAmendmentVIIGate,
  evaluateCklWorldProfileOrdered,
  getCklAmendmentVII,
  loadAmendmentVIIPolicyManifest,
  loadWorldProfile,
} from "../../src/face/CklAmendmentVIIBridge.js";
import {
  toWorldEntityForCkl,
  createWorldObject,
  worldProfileIdForObjectType,
} from "../../src/world/WorldObject.js";
import { buildUvSphereMesh } from "../../src/renderer/raster/portraitMeshes.js";
import { positionOrganicVariance } from "../../src/renderer/raster/OrganicVariance.js";

describe("Amendment VII render apply", () => {
  it("requires scale context — CKL policy-adaptive-scale deny, no silent default", () => {
    const mesh = buildUvSphereMesh("human:head", 0.55, 12, 8);
    const bad = applyAmendmentVIIToMeshes({
      meshes: [mesh],
      scaleClassOrProfileId: "   ",
      mode: "soft",
    });
    assert.equal(bad.ok, false);
    const ckl = getCklAmendmentVII();
    assert.equal(bad.haltCode, ckl.HALT_CODES.MISSING_SCALE);
    assert.equal(bad.gates.adaptiveScale, "halt");
    assert.ok(bad.ckl.policies.includes("policy-adaptive-scale"));
  });

  it("soft-applies lawful head scale + organic asymmetry to face mesh", () => {
    const mesh = buildUvSphereMesh("human:head", 0.55, 16, 12);
    const beforeVar = positionOrganicVariance(mesh.positions);
    const result = applyAmendmentVIIToMeshes({
      meshes: [mesh],
      scaleClassOrProfileId: "human-sized",
      mode: "soft",
      bakeScale: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.gates.adaptiveScale, "applied");
    assert.equal(result.gates.biometric, "applied");
    assert.equal(result.gates.organicVariance, "applied");
    assert.equal(result.gates.worldProfile, "skipped");
    assert.ok(
      result.uniformScale < 0.5,
      `expected shrink, got ${result.uniformScale}`,
    );
    assert.ok(result.asymmetryApplied, "expected organic nudge on symmetric sphere");
    assert.ok(
      (result.organicVarianceAfter ?? 0) >= beforeVar * 0.99,
      "organic variance should not collapse",
    );
    assert.ok(
      Math.abs(result.meshes[0]!.modelMatrix[0]! - result.uniformScale) < 1e-6,
    );
    assert.equal(
      result.ckl.source,
      "engine/governance/biometric/amendmentVII.js",
    );
  });

  it("controlled asymmetry is deterministic", () => {
    const mesh = buildUvSphereMesh("human:head", 0.5, 10, 8);
    const a = applyControlledOrganicAsymmetry(mesh.positions, {
      seed: 7,
      strength: 0.02,
    });
    const b = applyControlledOrganicAsymmetry(mesh.positions, {
      seed: 7,
      strength: 0.02,
    });
    assert.deepEqual([...a.positions], [...b.positions]);
    assert.ok(a.varianceAfter >= a.varianceBefore * 0.99);
  });
});

describe("Amendment VII CKL↔Apply wiring", () => {
  it("loads the three Amendment VII + nine world-profile policies from default.policies.json", () => {
    const manifest = loadAmendmentVIIPolicyManifest();
    assert.equal(manifest.policyIds.length, 3);
    assert.equal(manifest.worldProfileIds.length, 9);
    for (const id of CKL_AMENDMENT_VII_POLICY_IDS) {
      assert.ok(manifest.order.includes(id), `missing ${id}`);
    }
    for (const id of CKL_WORLD_PROFILE_POLICY_IDS) {
      assert.ok(manifest.worldProfileOrder.includes(id), `missing ${id}`);
    }
    assert.equal(manifest.order[0], "policy-biometric-conformance");
    assert.equal(manifest.worldProfileOrder[0], "world.biogeometric");
    assert.equal(manifest.worldProfileOrder[1], "world.scaleContext");
    assert.equal(manifest.worldProfileOrder[2], "world.architecture");
    assert.equal(manifest.worldProfileOrder[3], "world.terrain");
    assert.equal(manifest.worldProfileOrder[8], "world.variance");
  });

  it("Apply halt codes match CKL HALT_CODES (same module)", () => {
    const ckl = getCklAmendmentVII();
    assert.equal(ckl.POLICY_IDS.BIOMETRIC, "policy-biometric-conformance");
    assert.equal(ckl.POLICY_IDS.ADAPTIVE_SCALE, "policy-adaptive-scale");
    assert.equal(ckl.POLICY_IDS.ORGANIC_VARIANCE, "policy-organic-variance");
    const denied = evaluateCklAmendmentVIIGate("policy-adaptive-scale", [
      {
        id: "no-scale",
        scaleClass: null,
        metrics: {},
        organicVarianceMeasured: 0.01,
        minOrganicVariance: 0.002,
      },
    ]);
    assert.equal(denied.ok, false);
    assert.equal(denied.haltCode, ckl.HALT_CODES.MISSING_SCALE);
  });
});

describe("World-profile → CKL Apply path", () => {
  it("loadWorldProfile returns partial catalogs for nine domains", () => {
    for (const id of CKL_WORLD_PROFILE_POLICY_IDS) {
      const loaded = loadWorldProfile(id);
      assert.equal(loaded.status, "partial");
      assert.ok(loaded.profile, id);
    }
  });

  it("lawful world plant entity passes Apply + CKL world-profile", () => {
    const mesh = buildUvSphereMesh("plant:canopy", 0.4, 10, 8);
    const result = applyAmendmentVIIToMeshes({
      meshes: [mesh],
      scaleClassOrProfileId: "human-sized",
      mode: "soft",
      worldProfileId: "world.plant",
      worldEntities: [
        {
          id: "plant-1",
          objectType: "plant",
          worldProfileId: "world.plant",
          scaleClass: "human-sized",
          environmentalVarianceMeasured: 0.01,
        },
      ],
    });
    assert.equal(result.ok, true, result.issues.join(";"));
    assert.equal(result.gates.worldProfile, "applied");
    assert.equal(result.worldProfileOk, true);
    assert.ok(
      result.ckl.worldProfilePolicies.includes("world.plant"),
      "manifest should list world.plant",
    );
  });

  it("missing world context HALTs when requireWorldContext", () => {
    const mesh = buildUvSphereMesh("human:head", 0.5, 8, 6);
    const result = applyAmendmentVIIToMeshes({
      meshes: [mesh],
      scaleClassOrProfileId: "human-sized",
      mode: "soft",
      requireWorldContext: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.gates.worldProfile, "halt");
    assert.equal(result.haltCode, "HALT:MISSING-WORLD-CONTEXT");
  });

  it("Engine3D entityContext maps to CKL world entity", () => {
    assert.equal(worldProfileIdForObjectType("terrain"), "world.terrain");
    const obj = createWorldObject({
      id: "rock-1",
      kind: "mesh",
      geometry: { primitiveType: "box" },
      material: { materialId: "stone" },
      entityContext: {
        objectType: "terrain",
        worldProfileId: "world.terrain",
        scaleClass: "human-sized",
        terrainContext: { worldScaleClass: "human-sized" },
        worldContext: { worldId: "w1", biomeTag: "rocky" },
      },
    });
    const entity = toWorldEntityForCkl(obj);
    assert.equal(entity.worldProfileId, "world.terrain");
    assert.equal(entity.objectType, "terrain");
    const gate = evaluateCklWorldProfileOrdered([
      {
        ...entity,
        environmentalVarianceMeasured: 0.05,
      },
    ]);
    assert.equal(gate.ok, true, JSON.stringify(gate));
  });
});
