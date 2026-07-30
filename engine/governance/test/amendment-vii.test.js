/**
 * CKL Amendment VII — biometric / adaptive-scale / organic-variance gates.
 * Proves CKL deny/halt with audit receipts. Drive-G-1: **enforced** for these paths.
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
  AMENDMENT_VII_ORDER,
  HALT_CODES,
  POLICY_IDS,
  evaluateAmendmentVIIOrdered,
  verifyScalStep,
} from "../biometric/amendmentVII.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const defaultPolicies = JSON.parse(
  readFileSync(join(root, "engine/governance/policies/default.policies.json"), "utf-8"),
);

/** Minimal human-adult-v1 profile slice for fixtures (mirrors catalog ranges). */
const HUMAN_PROFILE = {
  id: "human-adult-v1",
  scaleClass: "human-sized",
  limbRatios: {
    armToHeight: { min: 0.3, max: 0.48 },
    legToHeight: { min: 0.4, max: 0.55 },
    torsoToHeight: { min: 0.28, max: 0.4 },
    headToHeight: { min: 0.1, max: 0.16 },
  },
  curvature: {
    maxAsymmetry: { min: 0, max: 0.08 },
    minOrganicVariance: { min: 0.002, max: 1 },
    surfaceCurvatureProxy: { min: 0.35, max: 1.2 },
  },
  massDistribution: {
    centerOfMassHeightFraction: { min: 0.45, max: 0.62 },
    shoulderToHipWidth: { min: 0.85, max: 1.45 },
  },
};

const LAWFUL_METRICS = {
  armToHeight: 0.4,
  legToHeight: 0.48,
  torsoToHeight: 0.34,
  headToHeight: 0.13,
  asymmetry: 0.02,
  organicVariance: 0.01,
  surfaceCurvatureProxy: 0.6,
  centerOfMassHeightFraction: 0.55,
  shoulderToHipWidth: 1.1,
};

function makeRenderIntent(overrides = {}) {
  return {
    id: "intent-amendment-vii",
    type: "render_fixture",
    actor: "4dce.renderer",
    action: "render.session.start",
    world: "world-bio",
    ...overrides,
  };
}

function makeEvidence(fixtures, extra = {}) {
  return {
    id: "ev-amendment-vii",
    worldId: "world-bio",
    timelineId: "tl-bio",
    biometricAmendment: {
      enforce: true,
      fixtures,
    },
    ...extra,
  };
}

function lawfulFixture(overrides = {}) {
  return {
    id: "fixture-lawful",
    scaleClass: "human-sized",
    biometricProfileId: "human-adult-v1",
    profile: HUMAN_PROFILE,
    metrics: { ...LAWFUL_METRICS },
    organicVarianceMeasured: 0.01,
    ...overrides,
  };
}

describe("Amendment VII — policy registration", () => {
  it("registers three policies in biometric → adaptive-scale → organic-variance order", () => {
    const ids = defaultPolicies.map((p) => p.id);
    assert.ok(ids.includes(POLICY_IDS.BIOMETRIC));
    assert.ok(ids.includes(POLICY_IDS.ADAPTIVE_SCALE));
    assert.ok(ids.includes(POLICY_IDS.ORGANIC_VARIANCE));
    const bio = ids.indexOf(POLICY_IDS.BIOMETRIC);
    const scale = ids.indexOf(POLICY_IDS.ADAPTIVE_SCALE);
    const organic = ids.indexOf(POLICY_IDS.ORGANIC_VARIANCE);
    assert.ok(bio < scale && scale < organic, "execution order in default.policies.json");
    assert.deepEqual(AMENDMENT_VII_ORDER, [
      POLICY_IDS.BIOMETRIC,
      POLICY_IDS.ADAPTIVE_SCALE,
      POLICY_IDS.ORGANIC_VARIANCE,
    ]);
  });

  it("loadDefault includes Amendment VII policies", async () => {
    const ckl = await ConstitutionalKnowledgeLayer.loadDefault(async (url) => {
      const text = readFileSync(new URL(url), "utf-8");
      return { ok: true, json: async () => JSON.parse(text) };
    });
    assert.ok(ckl.policies.some((p) => p.id === POLICY_IDS.BIOMETRIC));
    assert.ok(ckl.policies.some((p) => p.id === POLICY_IDS.ADAPTIVE_SCALE));
    assert.ok(ckl.policies.some((p) => p.id === POLICY_IDS.ORGANIC_VARIANCE));
  });
});

describe("Amendment VII — CKL lawful pass", () => {
  it("allows lawful fixture (all three gates)", () => {
    const policies = { policies: defaultPolicies };
    const intent = makeRenderIntent();
    const evidence = makeEvidence([lawfulFixture()]);
    const decision = resolveDecision(intent, evidence, policies);
    assert.equal(decision.ok, true, JSON.stringify(decision));
    assert.equal(decision.verdict, "allow");
    assert.equal(decision.haltCode, null);
    assert.ok(!decision.violations.includes(POLICY_IDS.BIOMETRIC));
    assert.ok(!decision.violations.includes(POLICY_IDS.ADAPTIVE_SCALE));
    assert.ok(!decision.violations.includes(POLICY_IDS.ORGANIC_VARIANCE));
  });

  it("does not apply Amendment VII to legacy play_timeline without biometric context", () => {
    const policies = { policies: defaultPolicies };
    const intent = {
      id: "i-legacy",
      type: "play_timeline",
      actor: "4dce.renderer",
      action: "render.session.start",
      world: "w1",
    };
    const evidence = {
      id: "ev1",
      worldId: "w1",
      timelineId: "tl1",
    };
    const decision = resolveDecision(intent, evidence, policies);
    assert.equal(decision.ok, true);
    assert.ok(!decision.violations.includes(POLICY_IDS.BIOMETRIC));
  });
});

describe("Amendment VII — HALT paths", () => {
  it("HALT:BIOMETRIC-NONCONFORMANCE on out-of-range metrics", () => {
    const policies = { policies: defaultPolicies };
    const intent = makeRenderIntent();
    const evidence = makeEvidence([
      lawfulFixture({
        metrics: {
          ...LAWFUL_METRICS,
          headToHeight: 0.5, // outside [0.1, 0.16]
        },
      }),
    ]);
    const decision = resolveDecision(intent, evidence, policies);
    assert.equal(decision.ok, false);
    assert.equal(decision.verdict, "halt");
    assert.equal(decision.haltCode, HALT_CODES.BIOMETRIC);
    assert.ok(decision.violations.includes(POLICY_IDS.BIOMETRIC));
    assert.ok(decision.auditReceipt);
    assert.equal(decision.auditReceipt.haltCode, HALT_CODES.BIOMETRIC);
    assert.equal(decision.auditReceipt.schema, "ckl.amendment-vii.audit-receipt.v1");
  });

  it("HALT:MISSING-SCALE-CONTEXT when scaleClass absent", () => {
    const policies = { policies: defaultPolicies };
    const intent = makeRenderIntent();
    const evidence = makeEvidence([
      {
        id: "fixture-no-scale",
        // no scaleClass
        biometricProfileId: "human-adult-v1",
        profile: HUMAN_PROFILE,
        metrics: { ...LAWFUL_METRICS },
        organicVarianceMeasured: 0.01,
      },
    ]);
    const decision = resolveDecision(intent, evidence, policies);
    assert.equal(decision.ok, false);
    assert.equal(decision.haltCode, HALT_CODES.MISSING_SCALE);
    assert.ok(decision.violations.includes(POLICY_IDS.ADAPTIVE_SCALE));
    assert.ok(decision.auditReceipt);
    assert.equal(decision.auditReceipt.policyId, POLICY_IDS.ADAPTIVE_SCALE);
  });

  it("inherits worldScaleClass and passes adaptive-scale", () => {
    const policies = { policies: defaultPolicies };
    const intent = makeRenderIntent();
    const evidence = {
      id: "ev-inherit",
      worldId: "world-bio",
      timelineId: "tl-bio",
      biometricAmendment: {
        enforce: true,
        worldScaleClass: "human-sized",
        fixtures: [
          {
            id: "fixture-inherit",
            profile: HUMAN_PROFILE,
            metrics: { ...LAWFUL_METRICS },
            organicVarianceMeasured: 0.01,
          },
        ],
      },
    };
    const decision = resolveDecision(intent, evidence, policies);
    assert.equal(decision.ok, true, JSON.stringify(decision));
  });

  it("HALT:ORGANIC-VARIANCE-VIOLATION when variance flattened below min", () => {
    const policies = { policies: defaultPolicies };
    const intent = makeRenderIntent();
    const evidence = makeEvidence([
      lawfulFixture({
        // biometric metrics stay lawful; post-raster measurement collapses
        organicVarianceMeasured: 0.0001,
      }),
    ]);
    const decision = resolveDecision(intent, evidence, policies);
    assert.equal(decision.ok, false);
    assert.equal(decision.haltCode, HALT_CODES.ORGANIC_VARIANCE);
    assert.ok(decision.violations.includes(POLICY_IDS.ORGANIC_VARIANCE));
    assert.ok(decision.auditReceipt);
  });

  it("HALT:ORGANIC-VARIANCE-VIOLATION when L/R vertices averaged", () => {
    const policies = { policies: defaultPolicies };
    const intent = makeRenderIntent();
    const evidence = makeEvidence([
      lawfulFixture({
        organicVarianceMeasured: 0.01,
        lrAveraged: true,
      }),
    ]);
    const decision = resolveDecision(intent, evidence, policies);
    assert.equal(decision.ok, false);
    assert.equal(decision.haltCode, HALT_CODES.ORGANIC_VARIANCE);
  });

  it("ordered evaluation returns biometric halt before scale/organic", () => {
    const intent = makeRenderIntent();
    const evidence = makeEvidence([
      {
        id: "multi-fail",
        // missing scale + bad metrics + flattened variance
        metrics: { headToHeight: 0.9 },
        profile: HUMAN_PROFILE,
        organicVarianceMeasured: 0,
        lrAveraged: true,
      },
    ]);
    // Without scaleClass: biometric skips → adaptive-scale is first halt
    const missingScale = evaluateAmendmentVIIOrdered(intent, evidence);
    assert.equal(missingScale.haltCode, HALT_CODES.MISSING_SCALE);

    const bioFirst = evaluateAmendmentVIIOrdered(
      intent,
      makeEvidence([
        lawfulFixture({
          metrics: { ...LAWFUL_METRICS, headToHeight: 0.9 },
          organicVarianceMeasured: 0,
        }),
      ]),
    );
    assert.equal(bioFirst.haltCode, HALT_CODES.BIOMETRIC);
  });
});

describe("Amendment VII — SCAL helper (partial via VIII world.scaleContext)", () => {
  it("verifyScalStep accepts SCAL with scaleClass (partial status)", () => {
    const ok = verifyScalStep({ opcode: "SCAL", scaleClass: "human-sized" });
    assert.equal(ok.ok, true);
    assert.equal(ok.status, "partial");
  });

  it("verifyScalStep uses world.scaleContext when scaleClass omitted", () => {
    const viaCatalog = verifyScalStep({ phase: "ENRG-SCALE" });
    // Catalog stub supplies worldScaleClass → partial pass, or HALT if unloadable
    if (viaCatalog.ok) {
      assert.equal(viaCatalog.status, "partial");
      assert.ok(viaCatalog.scaleClass);
    } else {
      assert.equal(viaCatalog.haltCode, HALT_CODES.MISSING_SCALE);
    }
  });
});
