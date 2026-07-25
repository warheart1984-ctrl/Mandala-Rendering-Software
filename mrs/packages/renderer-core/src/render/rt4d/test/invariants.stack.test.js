/**
 * Catalog integrity for the 4DRS invariant stack.
 * Run: node src/render/rt4d/test/invariants.stack.test.js
 */
import assert from "assert";
import {
  FOUNDATIONAL_INVARIANTS,
  ENGINE_INVARIANTS,
  MEASUREMENTS,
  listInvariantCatalog,
  getFoundationalInvariant,
  getEngineInvariant,
  engineInvariantsDerivedFrom,
  measurementsForInvariant,
} from "../invariants/index.js";
import { PHYSICAL_INVARIANTS } from "../math/physicalInvariants.js";

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

console.log("\n--- Invariant stack catalog ---");

test("foundational PI-* mirrors PHYSICAL_INVARIANTS ids", () => {
  assert.strictEqual(FOUNDATIONAL_INVARIANTS.length, PHYSICAL_INVARIANTS.length);
  for (let i = 0; i < PHYSICAL_INVARIANTS.length; i++) {
    assert.strictEqual(FOUNDATIONAL_INVARIANTS[i].id, PHYSICAL_INVARIANTS[i].id);
    assert.strictEqual(FOUNDATIONAL_INVARIANTS[i].layer, "foundational");
    assert.strictEqual(FOUNDATIONAL_INVARIANTS[i].status, "tested");
  }
});

test("engine invariants declare derived_from → existing PI-*", () => {
  const piIds = new Set(FOUNDATIONAL_INVARIANTS.map((i) => i.id));
  for (const ei of ENGINE_INVARIANTS) {
    assert.strictEqual(ei.layer, "engine");
    assert.ok(Array.isArray(ei.derived_from) && ei.derived_from.length > 0, ei.id);
    for (const parent of ei.derived_from) {
      assert.ok(piIds.has(parent), `${ei.id} derived_from unknown ${parent}`);
    }
  }
});

test("no catalog row claims enforced (gate is AcceptanceDecision, not catalog)", () => {
  for (const row of listInvariantCatalog()) {
    assert.notStrictEqual(
      row.status,
      "enforced",
      `${row.id}: catalog stays tested/declared/skeleton; use acceptConformanceReport for soft/enforce`,
    );
  }
});

test("status tags are from the allowed vocabulary", () => {
  const allowed = new Set(["enforced", "tested", "declared", "skeleton", "accepted"]);
  for (const row of listInvariantCatalog()) {
    assert.ok(allowed.has(row.status), `${row.id} status=${row.status}`);
  }
});

test("expected engine IDs exist with documented statuses", () => {
  assert.strictEqual(getEngineInvariant("EI-PROJ-FIDELITY").status, "tested");
  assert.strictEqual(getEngineInvariant("EI-RADIOMETRIC").status, "tested");
  assert.strictEqual(getEngineInvariant("EI-LENGTH-PARENT").status, "tested");
  assert.strictEqual(getEngineInvariant("EI-REPLAY-DETERMINISM").status, "declared");
  assert.strictEqual(getEngineInvariant("EI-TOPOLOGY").status, "skeleton");
});

test("engineInvariantsDerivedFrom(PI-GEO-LENGTH) non-empty", () => {
  const kids = engineInvariantsDerivedFrom("PI-GEO-LENGTH");
  assert.ok(kids.length >= 2);
  assert.ok(kids.some((k) => k.id === "EI-TOPOLOGY"));
  assert.ok(kids.some((k) => k.id === "EI-PROJ-FIDELITY" || k.id === "EI-LENGTH-PARENT"));
});

test("measurements support their declared invariants", () => {
  assert.ok(MEASUREMENTS.length >= 6);
  for (const m of MEASUREMENTS) {
    assert.ok(m.id.startsWith("M-"));
    assert.ok(m.supports.length > 0);
    for (const invId of m.supports) {
      assert.ok(
        getFoundationalInvariant(invId) || getEngineInvariant(invId),
        `${m.id} supports unknown ${invId}`,
      );
    }
  }
  assert.ok(measurementsForInvariant("EI-RADIOMETRIC").length >= 2);
});

test("listInvariantCatalog returns foundational + engine rows", () => {
  const rows = listInvariantCatalog();
  assert.strictEqual(
    rows.length,
    FOUNDATIONAL_INVARIANTS.length + ENGINE_INVARIANTS.length,
  );
});

console.log(`\n=== Invariant stack: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
