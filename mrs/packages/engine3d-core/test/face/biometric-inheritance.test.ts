/**
 * Gap-3 patches + CKL Amendment VII wiring.
 * Status: validators **partial**; CKL gates **enforced** (see engine/governance/test/amendment-vii.test.js).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadBiometricCatalog,
  getBiometricProfile,
  validateAgainstProfile,
  validateAabbAgainstProfile,
  metricsFromAabb,
  enforceBiometricConformance,
  HALT_BIOMETRIC,
} from "../../src/face/BiometricProfile.js";
import {
  inheritMetricsFromContext,
  requireScaleContext,
  HALT_MISSING_SCALE,
} from "../../src/face/MetricInheritance.js";
import { registerFixtureFace } from "../../src/face/FixtureFaceRegistry.js";
import {
  auditSoftRasterNormalization,
  rejectSymmetryFlatten,
  unitizeNormal,
  positionOrganicVariance,
  enforceOrganicVarianceAtRender,
  HALT_ORGANIC_VARIANCE,
  EI_ORGANIC_VARIANCE,
} from "../../src/renderer/raster/OrganicVariance.js";

const here = dirname(fileURLToPath(import.meta.url));

function resolveRepoRoot(): string {
  let dir = resolve(here);
  for (let i = 0; i < 12; i++) {
    if (
      existsSync(join(dir, "constitution", "CHARTER.md")) ||
      existsSync(join(dir, "mrs", "assets", "human"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(here, "..", "..", "..", "..", "..");
}

describe("Biometric profiles", () => {
  it("loads catalog with human and canine scale classes", () => {
    const cat = loadBiometricCatalog();
    assert.equal(cat.schemaVersion, "biometric-profile/1.0");
    assert.equal(cat.status, "partial");
    assert.ok(getBiometricProfile("human-sized", cat));
    assert.ok(getBiometricProfile("canine-scale", cat));
    assert.ok(getBiometricProfile("human-adult-v1", cat));
  });

  it("validates lawful ranges and rejects flattened organic variance", () => {
    const profile = getBiometricProfile("human-adult-v1")!;
    const ok = validateAgainstProfile(profile, {
      headToHeight: 0.13,
      asymmetry: 0.02,
      organicVariance: 0.01,
      surfaceCurvatureProxy: 0.6,
      centerOfMassHeightFraction: 0.55,
      shoulderToHipWidth: 1.1,
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.status, "partial");

    const flat = validateAgainstProfile(profile, {
      organicVariance: 0,
      asymmetry: 0,
    });
    assert.equal(flat.ok, false);
    assert.ok(
      flat.issues.some((i) => i.includes("organic-variance") || i.includes("organicVariance")),
    );
  });

  it("enforceBiometricConformance returns HALT:BIOMETRIC-NONCONFORMANCE", () => {
    const profile = getBiometricProfile("human-adult-v1")!;
    const bad = enforceBiometricConformance(profile, { headToHeight: 0.9 });
    assert.equal(bad.ok, false);
    assert.equal(bad.status, "enforced");
    assert.equal(bad.haltCode, HALT_BIOMETRIC);
  });

  it("AABB face fixture validates curvature proxies without inventing limbs", () => {
    const entry = registerFixtureFace("HumanFaceRigged", { strict: true });
    const profile = getBiometricProfile("human-sized")!;
    const result = validateAabbAgainstProfile(profile, entry.aabb);
    assert.equal(result.status, "partial");
    assert.ok(result.checks.length >= 2);
    const limbsRequired = validateAabbAgainstProfile(profile, entry.aabb, {
      requireLimbMetrics: true,
    });
    assert.equal(limbsRequired.ok, false);
    assert.ok(limbsRequired.issues[0]?.includes("limb-metrics-unavailable"));
  });
});

describe("Adaptive metric inheritance", () => {
  it("inherits smaller scale for canine vs human context height", () => {
    const human = inheritMetricsFromContext({
      scaleClassOrProfileId: "human-sized",
      contextHeightMeters: 1.7,
    });
    const canine = inheritMetricsFromContext({
      scaleClassOrProfileId: "canine-scale",
      contextHeightMeters: 1.7,
    });
    assert.equal(human.basis, "context-height");
    assert.ok(Math.abs(human.uniformScale - 1) < 1e-9);
    assert.ok(canine.uniformScale < human.uniformScale);
    assert.equal(canine.scaleClass, "canine-scale");
    assert.equal(canine.status, "partial");
  });

  it("uses defaultUniformScale when no context height", () => {
    const toy = inheritMetricsFromContext({ scaleClassOrProfileId: "toy-scale" });
    assert.equal(toy.basis, "defaultUniformScale");
    assert.ok(toy.uniformScale < 0.2);
  });

  it("requireScaleContext HALTs when scale missing", () => {
    const missing = requireScaleContext({});
    assert.equal(missing.ok, false);
    assert.equal(missing.haltCode, HALT_MISSING_SCALE);
    const inherited = requireScaleContext({ worldScaleClass: "human-sized" });
    assert.equal(inherited.ok, true);
    assert.equal(inherited.source, "world");
  });

  it("inheritMetricsFromContext requireScaleClass throws HALT", () => {
    assert.throws(
      () => inheritMetricsFromContext({ requireScaleClass: true }),
      (err: Error & { haltCode?: string }) =>
        err.message === HALT_MISSING_SCALE || err.haltCode === HALT_MISSING_SCALE,
    );
  });
});

describe("Soft-raster normalization audit + render gate", () => {
  it("reports that renderer does not over-normalize organic positions", () => {
    const report = auditSoftRasterNormalization();
    assert.equal(report.status, "partial");
    assert.equal(report.overNormalizesOrganicVariance, false);
    assert.ok(report.findings.length >= 3);
  });

  it("forbids symmetry-average mix", () => {
    const r = rejectSymmetryFlatten([0, 1, 0], [0, 1, 0.1], { maxAverageMix: 0.5 });
    assert.equal(r.ok, false);
  });

  it("unitizeNormal preserves direction up to length", () => {
    const n = unitizeNormal([3, 0, 0]);
    assert.ok(Math.abs(n[0]! - 1) < 1e-9);
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 2, 0]);
    assert.ok(positionOrganicVariance(positions) > 0);
  });

  it("enforceOrganicVarianceAtRender HALTs below min (EI-ORGANIC-VARIANCE)", () => {
    const pass = enforceOrganicVarianceAtRender({
      measured: 0.01,
      minOrganicVariance: 0.002,
    });
    assert.equal(pass.ok, true);
    assert.equal(pass.invariantId, EI_ORGANIC_VARIANCE);
    assert.equal(pass.status, "enforced");

    const fail = enforceOrganicVarianceAtRender({
      measured: 0.0001,
      minOrganicVariance: 0.002,
    });
    assert.equal(fail.ok, false);
    assert.equal(fail.haltCode, HALT_ORGANIC_VARIANCE);

    const averaged = enforceOrganicVarianceAtRender({
      measured: 0.01,
      minOrganicVariance: 0.002,
      lrAveraged: true,
    });
    assert.equal(averaged.ok, false);
    assert.equal(averaged.haltCode, HALT_ORGANIC_VARIANCE);
  });

  it("writes proof JSON", () => {
    const outDir = join(
      resolveRepoRoot(),
      "docs",
      "4d-engine",
      "proofs",
      "sx-arch-gaps-2026-07",
    );
    mkdirSync(outDir, { recursive: true });
    const catalog = loadBiometricCatalog();
    const audit = auditSoftRasterNormalization();
    const face = registerFixtureFace("HumanFaceRigged");
    const metrics = metricsFromAabb(face.aabb);
    const inheritance = {
      human: inheritMetricsFromContext({
        scaleClassOrProfileId: "human-sized",
        contextHeightMeters: 1.7,
      }),
      canine: inheritMetricsFromContext({
        scaleClassOrProfileId: "canine-scale",
        contextHeightMeters: 1.7,
      }),
    };
    writeFileSync(
      join(outDir, "gap3-biometric-inheritance-audit.json"),
      JSON.stringify(
        {
          status: "partial",
          amendmentVII: {
            cklGates: "enforced",
            policies: [
              "policy-biometric-conformance",
              "policy-adaptive-scale",
              "policy-organic-variance",
            ],
            cisScal: "declared",
          },
          catalogStatus: catalog.status,
          profileIds: catalog.profiles.map((p) => p.id),
          faceLawful: face.lawfulForRaster,
          aabbMetrics: metrics,
          inheritance: {
            humanScale: inheritance.human.uniformScale,
            canineScale: inheritance.canine.uniformScale,
          },
          normalizationAudit: audit,
          antiOverclaim:
            "CKL gates enforced when biometricAmendment present; catalog/AABB proxies remain partial; CIS SCAL declared",
        },
        null,
        2,
      ),
    );
  });
});
