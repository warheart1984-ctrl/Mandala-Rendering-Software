/**
 * Cross-runtime conformance: invariant IDs as contract;
 * math/4DRS and Sovereign X each emit native evidence → normalized claims.
 * Run: node src/render/rt4d/test/crossRuntime.conformance.test.js
 */
import assert from "assert";
import {
  REQUIRED_INVARIANT_IDS,
  CROSS_RUNTIME_CONTRACT_VERSION,
  CONFORMANCE_CLAIM_SCHEMA,
  CROSS_RUNTIME_REPORT_SCHEMA,
  getCrossRuntimeContract,
  createMathHost,
  createSovereignXHost,
  runCrossRuntimeConformance,
  validateCrossRuntimeReport,
  normalizeEvidence,
  createUnevaluatedClaim,
  MATH_HOST_RUNTIME_ID,
  SOVEREIGNX_HOST_RUNTIME_ID,
} from "../invariants/crossRuntime/index.js";
import { EVIDENCE_SCHEMA } from "../invariants/evidence.js";
import { SOVEREIGNX_PHYSICAL_INVARIANT_EVIDENCE_SCHEMA } from "../../../gpu/SovereignXPhysicalInvariants.js";

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

console.log("\n--- Cross-runtime conformance suite ---");

test("contract lists required PI-* ids", () => {
  const c = getCrossRuntimeContract();
  assert.strictEqual(c.version, CROSS_RUNTIME_CONTRACT_VERSION);
  assert.strictEqual(c.status, "tested");
  assert.deepStrictEqual([...c.required], [...REQUIRED_INVARIANT_IDS]);
  assert.strictEqual(REQUIRED_INVARIANT_IDS.length, 3);
});

test("both hosts pass all required PI-* under known-good defaults", () => {
  const report = runCrossRuntimeConformance({
    hosts: [createMathHost(), createSovereignXHost()],
  });
  assert.strictEqual(report.schema, CROSS_RUNTIME_REPORT_SCHEMA);
  assert.ok(report.allRequiredPassed);
  assert.strictEqual(report.claims.length, REQUIRED_INVARIANT_IDS.length * 2);
  for (const id of REQUIRED_INVARIANT_IDS) {
    for (const rid of [MATH_HOST_RUNTIME_ID, SOVEREIGNX_HOST_RUNTIME_ID]) {
      const claim = report.claims.find(
        (c) => c.invariantId === id && c.runtimeId === rid,
      );
      assert.ok(claim, `missing claim ${rid}/${id}`);
      assert.strictEqual(claim.verdict, "pass");
      assert.strictEqual(claim.schema, CONFORMANCE_CLAIM_SCHEMA);
      assert.strictEqual(claim.gate, false);
      assert.strictEqual(claim.catalogStatus, "tested");
    }
  }
});

test("native source schemas remain distinct after normalize", () => {
  const report = runCrossRuntimeConformance({
    hosts: [createMathHost(), createSovereignXHost()],
    invariantIds: ["PI-GEO-LENGTH"],
  });
  const math = report.claims.find((c) => c.runtimeId === MATH_HOST_RUNTIME_ID);
  const sx = report.claims.find((c) => c.runtimeId === SOVEREIGNX_HOST_RUNTIME_ID);
  assert.strictEqual(math.sourceSchema, EVIDENCE_SCHEMA);
  assert.strictEqual(sx.sourceSchema, SOVEREIGNX_PHYSICAL_INVARIANT_EVIDENCE_SCHEMA);
  assert.notStrictEqual(math.sourceSchema, sx.sourceSchema);
});

test("bad energy measurement fails on both hosts", () => {
  const bad = {
    "PI-CALC-ENERGY": { eBefore: 1, eAfter: 2, tol: 1e-9 },
  };
  const report = runCrossRuntimeConformance({
    hosts: [createMathHost(), createSovereignXHost()],
    invariantIds: ["PI-CALC-ENERGY"],
    measurements: bad,
  });
  assert.strictEqual(report.allRequiredPassed, false);
  for (const claim of report.claims) {
    assert.strictEqual(claim.verdict, "fail");
  }
});

test("sovereignx host: EI-* capability missing → unevaluated", () => {
  const report = runCrossRuntimeConformance({
    hosts: [createSovereignXHost()],
    invariantIds: ["EI-PROJ-FIDELITY"],
  });
  assert.strictEqual(report.claims.length, 1);
  assert.strictEqual(report.claims[0].verdict, "unevaluated");
  assert.ok(report.claims[0].note.includes("capability"));
});

test("math host can speak optional EI under includeOptionalEngine", () => {
  const report = runCrossRuntimeConformance({
    hosts: [createMathHost(), createSovereignXHost()],
    includeOptionalEngine: true,
  });
  const mathEi = report.claims.find(
    (c) => c.runtimeId === MATH_HOST_RUNTIME_ID && c.invariantId === "EI-PROJ-FIDELITY",
  );
  const sxEi = report.claims.find(
    (c) => c.runtimeId === SOVEREIGNX_HOST_RUNTIME_ID && c.invariantId === "EI-PROJ-FIDELITY",
  );
  assert.ok(mathEi);
  assert.strictEqual(mathEi.verdict, "pass");
  assert.ok(sxEi);
  assert.strictEqual(sxEi.verdict, "unevaluated");
});

test("partial host with empty capabilities yields unevaluated", () => {
  const stub = {
    runtimeId: "stub-empty",
    capabilities: [],
    supports: () => false,
    provideEvidence: () => null,
  };
  const report = runCrossRuntimeConformance({
    hosts: [stub],
    invariantIds: ["PI-GEO-LENGTH"],
  });
  assert.strictEqual(report.claims[0].verdict, "unevaluated");
  assert.strictEqual(report.summary.unevaluated, 1);
});

test("validateCrossRuntimeReport accepts dual-host PI run", () => {
  const report = runCrossRuntimeConformance({
    hosts: [createMathHost(), createSovereignXHost()],
  });
  const v = validateCrossRuntimeReport(report);
  assert.ok(v.ok, v.errors.join("; "));
});

test("normalizeEvidence maps 4drs and sovereignx records", () => {
  const mathEv = createMathHost().provideEvidence("PI-TRIG-RADIAL");
  const sxEv = createSovereignXHost().provideEvidence("PI-TRIG-RADIAL");
  const m = normalizeEvidence(mathEv, { runtimeId: "rt4d-math" });
  const s = normalizeEvidence(sxEv, { runtimeId: "sovereignx" });
  assert.strictEqual(m.verdict, "pass");
  assert.strictEqual(s.verdict, "pass");
  assert.strictEqual(m.sourceSchema, EVIDENCE_SCHEMA);
  assert.strictEqual(s.sourceSchema, SOVEREIGNX_PHYSICAL_INVARIANT_EVIDENCE_SCHEMA);
});

test("createUnevaluatedClaim is honest and gate:false", () => {
  const c = createUnevaluatedClaim({
    invariantId: "PI-GEO-LENGTH",
    runtimeId: "none",
    reason: "no host",
  });
  assert.strictEqual(c.verdict, "unevaluated");
  assert.strictEqual(c.gate, false);
  assert.strictEqual(c.sourceEvidence, null);
});

test("report notes suite tested; acceptance is separate API", () => {
  const report = runCrossRuntimeConformance({
    hosts: [createMathHost(), createSovereignXHost()],
  });
  assert.ok(report.note.includes("acceptConformanceReport"));
  assert.ok(report.contractStatus === "tested");
  assert.strictEqual(report.kind, "ConformanceReport");
  assert.ok(report.independentVerification);
});

test("summary counts match claims length", () => {
  const report = runCrossRuntimeConformance({
    hosts: [createMathHost(), createSovereignXHost()],
  });
  const total =
    report.summary.pass +
    report.summary.fail +
    report.summary.partial +
    report.summary.unevaluated;
  assert.strictEqual(total, report.claims.length);
  assert.strictEqual(report.summary.pass, 6);
});

console.log(`\n=== Cross-runtime conformance: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
