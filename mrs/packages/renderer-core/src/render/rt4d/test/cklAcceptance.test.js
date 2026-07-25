/**
 * CKL-backed PI-* acceptance gate.
 * Soft attach vs opt-in enforce deny.
 * Run: node src/render/rt4d/test/cklAcceptance.test.js
 */
import assert from "assert";
import {
  REQUIRED_INVARIANT_IDS,
  ACCEPTANCE_DECISION_SCHEMA,
  listConstitutionalContracts,
  createMathHost,
  createSovereignXHost,
  runCrossRuntimeConformance,
  acceptConformanceReport,
  attachAcceptanceToDecision,
  resolvePiConformanceDecision,
  PI_ACCEPTANCE_EVIDENCE_ID,
  PI_CONFORMANCE_POLICIES,
  PI_ACCEPTANCE_INTENT_TYPE,
} from "../invariants/crossRuntime/index.js";

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

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${name}: ${e.message}`);
  }
}

console.log("\n--- CKL PI-* acceptance gate ---");

test("listConstitutionalContracts covers required PI-*", () => {
  const contracts = listConstitutionalContracts();
  assert.strictEqual(contracts.length, REQUIRED_INVARIANT_IDS.length);
  for (const id of REQUIRED_INVARIANT_IDS) {
    const c = contracts.find((x) => x.id === id);
    assert.ok(c, id);
    assert.strictEqual(c.kind, "ConstitutionalContract");
    assert.strictEqual(c.binding, "implementation-independent");
  }
});

test("ConformanceReport is first-class with independentVerification", () => {
  const report = runCrossRuntimeConformance({
    hosts: [createMathHost(), createSovereignXHost()],
  });
  assert.strictEqual(report.kind, "ConformanceReport");
  assert.ok(report.independentVerification);
  assert.ok(Array.isArray(report.contracts));
  assert.strictEqual(
    report.independentVerification.verifiedContractIds.length,
    REQUIRED_INVARIANT_IDS.length,
  );
  assert.ok(report.acceptance);
  assert.strictEqual(report.acceptance.soft, "accepted");
  assert.strictEqual(report.acceptance.enforce, "enforced");
});

test("soft mode attaches acceptance without deny on passing report", () => {
  const report = runCrossRuntimeConformance({
    hosts: [createMathHost(), createSovereignXHost()],
  });
  const decision = acceptConformanceReport(report);
  assert.strictEqual(decision.schema, ACCEPTANCE_DECISION_SCHEMA);
  assert.strictEqual(decision.ok, true);
  assert.strictEqual(decision.verdict, "attach");
  assert.strictEqual(decision.enforce, false);
  assert.strictEqual(decision.status, "accepted");
  assert.strictEqual(decision.acceptanceEvidence.id, PI_ACCEPTANCE_EVIDENCE_ID);
  assert.ok(decision.acceptanceEvidence.contractIds.includes("PI-GEO-LENGTH"));
});

test("soft mode still attaches (no deny) when a required claim fails", () => {
  const report = runCrossRuntimeConformance({
    hosts: [createMathHost(), createSovereignXHost()],
    invariantIds: ["PI-CALC-ENERGY"],
    measurements: {
      "PI-CALC-ENERGY": { eBefore: 1, eAfter: 2, tol: 1e-9 },
    },
  });
  assert.strictEqual(report.allRequiredPassed, false);
  const decision = acceptConformanceReport(report);
  assert.strictEqual(decision.ok, true);
  assert.strictEqual(decision.verdict, "attach");
  assert.strictEqual(decision.status, "accepted");
  assert.ok(decision.acceptanceEvidence.failing.length > 0);
});

test("enforce mode denies incomplete/failing report", () => {
  const report = runCrossRuntimeConformance({
    hosts: [createMathHost(), createSovereignXHost()],
    invariantIds: ["PI-CALC-ENERGY"],
    measurements: {
      "PI-CALC-ENERGY": { eBefore: 1, eAfter: 2, tol: 1e-9 },
    },
  });
  const decision = acceptConformanceReport(report, {
    enforcePhysicalInvariantConformance: true,
  });
  assert.strictEqual(decision.ok, false);
  assert.strictEqual(decision.verdict, "deny");
  assert.strictEqual(decision.status, "enforced");
  assert.strictEqual(decision.enforce, true);
});

test("enforce mode accepts passing dual-host required PI-* report", () => {
  const report = runCrossRuntimeConformance({
    hosts: [createMathHost(), createSovereignXHost()],
  });
  const decision = acceptConformanceReport(report, {
    enforce: true,
  });
  assert.strictEqual(decision.ok, true);
  assert.strictEqual(decision.verdict, "attach");
  assert.strictEqual(decision.status, "enforced");
  assert.strictEqual(decision.allRequiredPassed, true);
});

test("attachAcceptanceToDecision merges evidence ref on soft path", () => {
  const report = runCrossRuntimeConformance({
    hosts: [createMathHost(), createSovereignXHost()],
  });
  const out = attachAcceptanceToDecision(
    { action: "dispatch", evidenceRefs: ["e-existing"] },
    report,
  );
  assert.ok(out.evidenceRefs.includes("e-existing"));
  assert.ok(out.evidenceRefs.includes(PI_ACCEPTANCE_EVIDENCE_ID));
  assert.strictEqual(out.physicalInvariantAcceptance.ok, true);
  assert.strictEqual(out.attachProvenance, true);
});

test("attachAcceptanceToDecision throws under enforce + failing report", () => {
  const report = runCrossRuntimeConformance({
    hosts: [createMathHost()],
    invariantIds: ["PI-GEO-LENGTH"],
    measurements: {
      "PI-GEO-LENGTH": {
        before: { x: 1, y: 0, z: 0, w: 0 },
        after: { x: 2, y: 0, z: 0, w: 0 },
        tol: 1e-9,
      },
    },
  });
  let threw = false;
  try {
    attachAcceptanceToDecision({ action: "dispatch" }, report, { enforce: true });
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, "PI_CONFORMANCE_DENIED");
  }
  assert.ok(threw, "expected PI_CONFORMANCE_DENIED");
});

test("package-local resolvePiConformanceDecision soft attaches", () => {
  const report = runCrossRuntimeConformance({
    hosts: [createMathHost(), createSovereignXHost()],
  });
  const d = resolvePiConformanceDecision(
    {
      id: "intent-pi-accept",
      type: PI_ACCEPTANCE_INTENT_TYPE,
      params: { enforcePhysicalInvariantConformance: false },
    },
    { conformanceReport: report },
  );
  assert.strictEqual(d.ok, true);
  assert.ok(d.attachAcceptance);
});

await testAsync("engine resolveDecision honors merged PI policies under enforce", async () => {
  const { resolveDecision } = await import(
    "../../../../../../../engine/governance/ConstitutionalKnowledgeLayer.js"
  );
  const report = runCrossRuntimeConformance({
    hosts: [createMathHost(), createSovereignXHost()],
    invariantIds: ["PI-CALC-ENERGY"],
    measurements: {
      "PI-CALC-ENERGY": { eBefore: 1, eAfter: 9, tol: 1e-9 },
    },
  });
  const decision = acceptConformanceReport(report, {
    enforcePhysicalInvariantConformance: true,
    resolveDecision,
    policies: [...PI_CONFORMANCE_POLICIES],
  });
  assert.strictEqual(decision.ok, false);
  assert.strictEqual(decision.verdict, "deny");

  const passReport = runCrossRuntimeConformance({
    hosts: [createMathHost(), createSovereignXHost()],
  });
  const pass = acceptConformanceReport(passReport, {
    enforcePhysicalInvariantConformance: true,
    resolveDecision,
    policies: [...PI_CONFORMANCE_POLICIES],
  });
  assert.strictEqual(pass.ok, true);
});

console.log(`\n=== CKL acceptance: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
