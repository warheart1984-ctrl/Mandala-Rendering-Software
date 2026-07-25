/**
 * Conformance suite: foundational PI predicates produce evidence records;
 * selected engine predicates evaluated honestly (pass / partial / unevaluated).
 * Run: node src/render/rt4d/test/invariants.conformance.test.js
 */
import assert from "assert";
import {
  runInvariantConformanceSuite,
  validateConformanceResult,
  createDefaultAdapter,
  createEvidenceRecord,
  validateEvidenceRecord,
  EVIDENCE_SCHEMA,
  runPredicate,
  projectionFidelityHolds,
  radiometricLambertianHolds,
  whiteFurnaceLambertianHolds,
  cpuReferenceHashDeterministic,
  orthogonalLengthPreserved,
  topologyPreservationHolds,
  LAMBERTIAN_BRDF_FACTOR,
} from "../invariants/index.js";
import { vec4 } from "../math/vec4.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}: ${e.message}`);
  }
}

console.log("\n--- Invariant conformance suite ---");

test("default suite: all foundational PI records pass", () => {
  const result = runInvariantConformanceSuite(createDefaultAdapter());
  assert.strictEqual(result.schema, "4drs.invariant.conformance.v1");
  assert.ok(result.allFoundationalPassed);
  const foundational = result.records.filter((r) => r.layer === "foundational");
  assert.strictEqual(foundational.length, 3);
  for (const rec of foundational) {
    assert.strictEqual(rec.schema, EVIDENCE_SCHEMA);
    assert.strictEqual(rec.verdict, "pass");
    assert.strictEqual(rec.catalogStatus, "tested");
    assert.strictEqual(rec.predicateResult.ok, true);
  }
});

test("validateConformanceResult accepts default suite", () => {
  const result = runInvariantConformanceSuite();
  const v = validateConformanceResult(result);
  assert.ok(v.ok, v.errors.join("; "));
});

test("engine tested predicates pass under default adapter", () => {
  const result = runInvariantConformanceSuite();
  const byId = Object.fromEntries(result.records.map((r) => [r.invariantId, r]));
  assert.strictEqual(byId["EI-PROJ-FIDELITY"].verdict, "pass");
  assert.strictEqual(byId["EI-RADIOMETRIC"].verdict, "pass");
  assert.strictEqual(byId["EI-LENGTH-PARENT"].verdict, "pass");
});

test("EI-REPLAY-DETERMINISM is partial (supporting hash only)", () => {
  const result = runInvariantConformanceSuite(createDefaultAdapter(), {
    invariantIds: ["EI-REPLAY-DETERMINISM"],
  });
  assert.strictEqual(result.records.length, 1);
  const rec = result.records[0];
  assert.strictEqual(rec.catalogStatus, "declared");
  assert.strictEqual(rec.verdict, "partial");
  assert.strictEqual(rec.predicateResult.ok, null);
  assert.strictEqual(rec.predicateResult.supporting.ok, true);
});

test("EI-TOPOLOGY is unevaluated skeleton", () => {
  const result = runInvariantConformanceSuite(createDefaultAdapter(), {
    invariantIds: ["EI-TOPOLOGY"],
  });
  const rec = result.records[0];
  assert.strictEqual(rec.catalogStatus, "skeleton");
  assert.strictEqual(rec.verdict, "unevaluated");
  assert.strictEqual(topologyPreservationHolds().ok, null);
});

test("projectionFidelityHolds matches Projector4D closed form", () => {
  const r = projectionFidelityHolds(vec4(1.5, -2, 3.25, 0.75), {
    d4: 5,
    d3: 4,
    scale: 80,
    width: 640,
    height: 480,
  });
  assert.ok(r.ok);
});

test("radiometricLambertianHolds anchors 3ρ/(4π)", () => {
  const r = radiometricLambertianHolds(1);
  assert.ok(r.ok);
  assert.ok(Math.abs(r.expectedBrdf - LAMBERTIAN_BRDF_FACTOR) < 1e-12);
  assert.ok(Math.abs(r.brdf - LAMBERTIAN_BRDF_FACTOR) < 1e-9);
});

test("whiteFurnaceLambertianHolds seeded estimate ≈ albedo", () => {
  const r = whiteFurnaceLambertianHolds({ albedo: 0.8, samples: 2048, seed: 0x4d5253 });
  assert.ok(r.ok, `estimate=${r.estimate}`);
});

test("cpuReferenceHashDeterministic: same seed → same hash", () => {
  const r = cpuReferenceHashDeterministic({ width: 4, height: 4, seed: 42 });
  assert.ok(r.ok);
  assert.strictEqual(r.hashA, r.hashB);
});

test("orthogonalLengthPreserved under Transform4D", () => {
  const r = orthogonalLengthPreserved(vec4(1, 2, 3, 4), "zw", Math.PI / 2);
  assert.ok(r.ok);
});

test("failing foundational measurement yields fail evidence", () => {
  const adapter = {
    id: "test-bad-energy",
    provideMeasurement: (id) =>
      id === "PI-CALC-ENERGY" ? { eBefore: 1, eAfter: 2, tol: 1e-9 } : {},
  };
  const result = runInvariantConformanceSuite(adapter, {
    invariantIds: ["PI-CALC-ENERGY"],
  });
  assert.strictEqual(result.records[0].verdict, "fail");
  assert.strictEqual(result.allFoundationalPassed, false);
});

test("createEvidenceRecord + validateEvidenceRecord round-trip", () => {
  const pred = runPredicate("PI-GEO-LENGTH", {});
  const rec = createEvidenceRecord({
    invariantId: "PI-GEO-LENGTH",
    layer: "foundational",
    catalogStatus: "tested",
    predicateResult: pred,
    measurementIds: ["M-SQ-NORM-PAIR"],
    evidenceAnchors: ["physicalInvariants.js"],
    runtimeId: "unit-test",
  });
  const v = validateEvidenceRecord(rec);
  assert.ok(v.ok, v.errors.join("; "));
  assert.strictEqual(rec.verdict, "pass");
});

test("suite summary counts are consistent", () => {
  const result = runInvariantConformanceSuite();
  const total =
    result.summary.pass +
    result.summary.fail +
    result.summary.partial +
    result.summary.unevaluated;
  assert.strictEqual(total, result.records.length);
  assert.ok(result.summary.pass >= 5);
  assert.ok(result.summary.partial >= 1);
  assert.ok(result.summary.unevaluated >= 1);
  assert.ok(result.note.includes("not a production"));
});

console.log(`\n=== Invariant conformance: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
