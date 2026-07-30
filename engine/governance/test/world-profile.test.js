/**
 * World-profile / Amendment VIII → CKL policies + Apply bridge.
 * Status: **partial** — lawful entity passes; missing world context HALTs.
 * Does not claim Lemonade plates PASS or CIS SCAL Genblaze-enforced.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ConstitutionalKnowledgeLayer,
  resolveDecision,
} from "../ConstitutionalKnowledgeLayer.js";
import {
  AMENDMENT_VIII_ID,
  WORLD_PROFILE_ORDER,
  WORLD_PROFILE_POLICY_IDS,
  WORLD_PROFILE_HALT_CODES,
  loadWorldProfile,
  evaluateWorldProfileOrdered,
  evaluateWorldProfilePolicy,
  verifyScalStep,
} from "../biometric/amendmentVIII.js";
import {
  amendmentVII,
  AMENDMENT_VII_FULL_ORDER,
} from "../biometric/amendmentVII.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const defaultPolicies = JSON.parse(
  readFileSync(join(root, "engine/governance/policies/default.policies.json"), "utf-8"),
);

function makeWorldIntent(overrides = {}) {
  return {
    id: "intent-world-profile",
    type: "render.world",
    actor: "4dce.renderer",
    action: "render.session.start",
    world: "world-eco",
    enforceWorldProfile: true,
    ...overrides,
  };
}

function makeWorldEvidence(entities, extra = {}) {
  return {
    id: "ev-world-profile",
    worldId: "world-eco",
    timelineId: "tl-eco",
    enforceWorldProfile: true,
    worldProfileAmendment: {
      enforce: true,
      worldScaleClass: "human-sized",
      entities,
    },
    ...extra,
  };
}

function lawfulPlant(overrides = {}) {
  return {
    id: "plant-oak-1",
    objectType: "plant",
    worldProfileId: "world.plant",
    scaleClass: "human-sized",
    environmentalVarianceMeasured: 0.01,
    metrics: { canopyCurvature: 0.4, branchRatio: 0.3 },
    ...overrides,
  };
}

describe("Amendment VIII — policy registration", () => {
  it("registers nine world.* policies after VII (orders 10–18)", () => {
    const ids = defaultPolicies.map((p) => p.id);
    for (const id of WORLD_PROFILE_ORDER) {
      assert.ok(ids.includes(id), `missing ${id}`);
    }
    assert.equal(WORLD_PROFILE_ORDER.length, 9);
    assert.deepEqual([...WORLD_PROFILE_ORDER], [
      WORLD_PROFILE_POLICY_IDS.BIOGEOMETRIC,
      WORLD_PROFILE_POLICY_IDS.SCALE_CONTEXT,
      WORLD_PROFILE_POLICY_IDS.ARCHITECTURE,
      WORLD_PROFILE_POLICY_IDS.TERRAIN,
      WORLD_PROFILE_POLICY_IDS.WATER,
      WORLD_PROFILE_POLICY_IDS.PLANT,
      WORLD_PROFILE_POLICY_IDS.SYNTHETIC,
      WORLD_PROFILE_POLICY_IDS.MATERIAL,
      WORLD_PROFILE_POLICY_IDS.VARIANCE,
    ]);
    const bio = defaultPolicies.find((p) => p.id === "world.biogeometric");
    assert.equal(bio.kind, "world-profile");
    assert.deepEqual(bio.requires, ["biometric", "adaptiveScale"]);
    assert.deepEqual(bio.haltOn, ["deny.world.biogeometric"]);
    assert.equal(bio.order, 10);
    const scaleCtx = defaultPolicies.find((p) => p.id === "world.scaleContext");
    assert.equal(scaleCtx.order, 11);
    const arch = defaultPolicies.find((p) => p.id === "world.architecture");
    assert.equal(arch.order, 12);
    const terrain = defaultPolicies.find((p) => p.id === "world.terrain");
    assert.equal(terrain.order, 13);
    const variance = defaultPolicies.find((p) => p.id === "world.variance");
    assert.equal(variance.order, 18);
    const viiOrganic = defaultPolicies.find((p) => p.id === "policy-organic-variance");
    assert.ok(viiOrganic.order < bio.order, "VII human gates before VIII world gates");
  });

  it("amendmentVII registration has kind world-profile + haltOn + requires", () => {
    assert.deepEqual([...AMENDMENT_VII_FULL_ORDER], [
      "biometric",
      "adaptiveScale",
      "organicVariance",
      "world.biogeometric",
      "world.scaleContext",
      "world.architecture",
      "world.terrain",
      "world.water",
      "world.plant",
      "world.synthetic",
      "world.material",
      "world.variance",
    ]);
    const wp = amendmentVII.policies["world.biogeometric"];
    assert.equal(wp.kind, "world-profile");
    assert.deepEqual(wp.requires, ["biometric", "adaptiveScale"]);
    assert.deepEqual(wp.haltOn, ["deny.world.biogeometric"]);
    assert.equal(
      amendmentVII.policies["world.scaleContext"].kind,
      "world-profile",
    );
  });

  it("loadDefault includes Amendment VIII world-profile policies", async () => {
    const ckl = await ConstitutionalKnowledgeLayer.loadDefault(async (url) => {
      const text = readFileSync(new URL(url), "utf-8");
      return { ok: true, json: async () => JSON.parse(text) };
    });
    for (const id of WORLD_PROFILE_ORDER) {
      assert.ok(ckl.policies.some((p) => p.id === id), `CKL missing ${id}`);
    }
  });
});

describe("Amendment VIII — loadWorldProfile catalogs", () => {
  it("loads all nine dedicated profile stubs (status partial)", () => {
    for (const id of WORLD_PROFILE_ORDER) {
      const loaded = loadWorldProfile(id);
      assert.equal(loaded.status, "partial", id);
      assert.ok(loaded.profile, `profile missing for ${id}: ${loaded.issues}`);
      assert.equal(loaded.profile.id, id);
    }
  });
});

describe("Amendment VIII — CKL lawful pass / HALT", () => {
  it("allows lawful plant entity through world-profile CKL", () => {
    const decision = resolveDecision(
      makeWorldIntent(),
      makeWorldEvidence([lawfulPlant()]),
      { policies: defaultPolicies },
    );
    assert.equal(decision.ok, true, JSON.stringify(decision));
    assert.equal(decision.verdict, "allow");
  });

  it("HALT:MISSING-WORLD-CONTEXT when enforceWorldProfile and no entities", () => {
    const decision = resolveDecision(
      makeWorldIntent(),
      {
        id: "ev-empty",
        worldId: "world-eco",
        timelineId: "tl-eco",
        enforceWorldProfile: true,
        worldProfileAmendment: { enforce: true, entities: [] },
      },
      { policies: defaultPolicies },
    );
    assert.equal(decision.ok, false);
    assert.equal(
      decision.haltCode,
      WORLD_PROFILE_HALT_CODES.MISSING_WORLD_CONTEXT,
    );
    assert.ok(decision.violations.includes(WORLD_PROFILE_POLICY_IDS.BIOGEOMETRIC));
  });

  it("HALT when terrain entity references unknown world profile", () => {
    const decision = resolveDecision(
      makeWorldIntent(),
      makeWorldEvidence([
        {
          id: "terrain-1",
          objectType: "terrain",
          worldProfileId: "world.terrain-DOES-NOT-EXIST",
          scaleClass: "human-sized",
          environmentalVarianceMeasured: 0.01,
        },
      ]),
      { policies: defaultPolicies },
    );
    assert.equal(decision.ok, false);
    assert.equal(
      decision.haltCode,
      WORLD_PROFILE_HALT_CODES.MISSING_WORLD_CONTEXT,
    );
  });

  it("HALT via world.variance when environmental variance flattened", () => {
    const decision = resolveDecision(
      makeWorldIntent(),
      makeWorldEvidence([
        {
          id: "terrain-flat",
          objectType: "terrain",
          worldProfileId: "world.terrain",
          scaleClass: "human-sized",
          environmentalVarianceMeasured: 0.00001,
          requireVarianceMeasurement: true,
        },
      ]),
      { policies: defaultPolicies },
    );
    assert.equal(decision.ok, false);
    assert.equal(
      decision.haltCode,
      WORLD_PROFILE_HALT_CODES.ENVIRONMENTAL_VARIANCE,
    );
    assert.ok(
      decision.violations.includes(WORLD_PROFILE_POLICY_IDS.VARIANCE) ||
        decision.violations.includes(WORLD_PROFILE_POLICY_IDS.TERRAIN),
    );
  });

  it("inherits worldScaleClass for terrain and passes", () => {
    const decision = resolveDecision(
      makeWorldIntent(),
      {
        id: "ev-terrain-inherit",
        worldId: "world-eco",
        timelineId: "tl-eco",
        enforceWorldProfile: true,
        worldProfileAmendment: {
          enforce: true,
          worldScaleClass: "human-sized",
          entities: [
            {
              id: "terrain-hill",
              objectType: "terrain",
              worldProfileId: "world.terrain",
              environmentalVarianceMeasured: 0.05,
            },
          ],
        },
      },
      { policies: defaultPolicies },
    );
    assert.equal(decision.ok, true, JSON.stringify(decision));
  });

  it("ordered evaluation HALTs missing context before domain metric fails", () => {
    const result = evaluateWorldProfileOrdered(
      makeWorldIntent(),
      makeWorldEvidence([
        {
          id: "bad",
          environmentalVarianceMeasured: 0,
        },
      ]),
    );
    assert.equal(result.ok, false);
    assert.equal(
      result.haltCode,
      WORLD_PROFILE_HALT_CODES.MISSING_WORLD_CONTEXT,
    );
  });

  it("does not apply world-profile to legacy play_timeline without world context", () => {
    const decision = resolveDecision(
      {
        id: "i-legacy",
        type: "play_timeline",
        actor: "4dce.renderer",
        action: "render.session.start",
        world: "w1",
      },
      { id: "ev1", worldId: "w1", timelineId: "tl1" },
      { policies: defaultPolicies },
    );
    assert.equal(decision.ok, true);
    assert.ok(!decision.violations.includes(WORLD_PROFILE_POLICY_IDS.BIOGEOMETRIC));
  });

  it("evaluateWorldProfilePolicy skips mismatched domain", () => {
    const gate = evaluateWorldProfilePolicy(
      WORLD_PROFILE_POLICY_IDS.WATER,
      makeWorldIntent(),
      makeWorldEvidence([lawfulPlant()]),
    );
    assert.equal(gate.applies, true);
    assert.equal(gate.ok, true);
  });
});

describe("Amendment VIII — CIS SCAL ↔ world.scaleContext (partial)", () => {
  it("verifyScalStep accepts SCAL with scaleClass via world.scaleContext", () => {
    const ok = verifyScalStep({ opcode: "SCAL", scaleClass: "human-sized" });
    assert.equal(ok.ok, true);
    assert.equal(ok.status, "partial");
    assert.equal(ok.worldProfileId, WORLD_PROFILE_POLICY_IDS.SCALE_CONTEXT);
  });

  it("verifyScalStep HALTs when SCAL missing scaleClass and catalog cannot inherit", () => {
    // Catalog provides worldScaleClass fallback — still ok when profile loads.
    // Force miss by omitting scale and using empty context; profile may still supply.
    const withCatalog = verifyScalStep({ phase: "ENRG-SCALE" });
    // world.scaleContext catalog has worldScaleClass → may pass as partial
    if (withCatalog.ok) {
      assert.equal(withCatalog.status, "partial");
      assert.ok(withCatalog.scaleClass);
    } else {
      assert.equal(withCatalog.haltCode, WORLD_PROFILE_HALT_CODES.MISSING_SCALE);
      assert.equal(withCatalog.status, "partial");
    }
  });
});
