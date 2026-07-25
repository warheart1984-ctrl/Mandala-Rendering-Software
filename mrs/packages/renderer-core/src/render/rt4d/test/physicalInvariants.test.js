/**
 * Unit tests for physical invariants sourced from Physical Invariant note.
 * Run: node src/render/rt4d/test/physicalInvariants.test.js
 */
import assert from "assert";
import { vec4, len2 } from "../math/vec4.js";
import { Transform4D } from "../math/transform.js";
import {
  PHYSICAL_INVARIANT_TOL,
  PHYSICAL_INVARIANTS,
  lengthPreserved,
  lengthPreserved4,
  energyConserved,
  radialDistanceInvariant,
  rotate2d,
  pythagoreanIdentityHolds,
  lengthPreservedUnder2dRotation,
  invariantPredicateResult,
} from "../math/physicalInvariants.js";

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

console.log("\n--- Physical Invariants (document predicates) ---");

test("catalog lists three document invariants with tested status", () => {
  assert.strictEqual(PHYSICAL_INVARIANTS.length, 3);
  for (const inv of PHYSICAL_INVARIANTS) {
    assert.strictEqual(inv.status, "tested");
    assert.ok(inv.id && inv.predicate && inv.statement);
  }
});

test("lengthPreserved: identical vectors", () => {
  const v = { x: 3, y: 4 };
  assert.ok(lengthPreserved(v, v));
});

test("lengthPreserved: 2D rotation (document trig formulas)", () => {
  const x = 3;
  const y = 4;
  for (const theta of [0, Math.PI / 6, Math.PI / 4, Math.PI / 2, 1.234, -2.5, 2 * Math.PI]) {
    const r = rotate2d(x, y, theta);
    assert.ok(lengthPreserved({ x, y }, r), `theta=${theta}`);
    assert.ok(radialDistanceInvariant(x, y, r.x, r.y), `radial theta=${theta}`);
    assert.ok(lengthPreservedUnder2dRotation(x, y, theta));
  }
});

test("lengthPreserved rejects stretched vector", () => {
  assert.ok(!lengthPreserved({ x: 1, y: 0 }, { x: 2, y: 0 }));
});

test("pythagoreanIdentityHolds for many angles", () => {
  for (let i = 0; i < 100; i++) {
    const theta = (i / 100) * 4 * Math.PI - 2 * Math.PI;
    assert.ok(pythagoreanIdentityHolds(theta), `theta=${theta}`);
  }
});

test("explicit rotate2d matches document expansion numerically", () => {
  const x = 1.5;
  const y = -2.25;
  const theta = 0.37;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const xp = x * c - y * s;
  const yp = x * s + y * c;
  const r = rotate2d(x, y, theta);
  assert.ok(Math.abs(r.x - xp) < PHYSICAL_INVARIANT_TOL);
  assert.ok(Math.abs(r.y - yp) < PHYSICAL_INVARIANT_TOL);
  const expanded =
    x * x * (c * c + s * s) + y * y * (s * s + c * c);
  assert.ok(Math.abs(expanded - (x * x + y * y)) < PHYSICAL_INVARIANT_TOL);
  assert.ok(Math.abs(xp * xp + yp * yp - (x * x + y * y)) < PHYSICAL_INVARIANT_TOL);
});

test("energyConserved: equal energies", () => {
  assert.ok(energyConserved(42.5, 42.5));
  assert.ok(energyConserved(1, 1 + 1e-12));
});

test("energyConserved rejects drift beyond tol", () => {
  assert.ok(!energyConserved(1, 1.001, 1e-9));
  assert.ok(energyConserved(1, 1.001, 0.01));
});

test("lengthPreserved4 under Transform4D plane rotations", () => {
  const v = vec4(1.1, -0.7, 0.3, 2.2);
  const planes = ["xy", "xz", "xw", "yz", "yw", "zw"];
  for (const plane of planes) {
    for (const angle of [0.1, 1.0, Math.PI / 2, Math.PI, 4.2]) {
      const R = Transform4D.rotate(plane, angle);
      const vRot = R.applyDir(v);
      assert.ok(
        lengthPreserved4(v, vRot, 1e-9),
        `plane=${plane} angle=${angle} |v|^2=${len2(v)} |Rv|^2=${len2(vRot)}`,
      );
      assert.ok(lengthPreserved(v, vRot, 1e-9));
    }
  }
});

test("invariantPredicateResult meta-pattern", () => {
  const ok = invariantPredicateResult("PI-CALC-ENERGY", energyConserved(3, 3), {
    E_before: 3,
    E_after: 3,
  });
  assert.strictEqual(ok.id, "PI-CALC-ENERGY");
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.evidence.E_before, 3);

  const bad = invariantPredicateResult("PI-GEO-LENGTH", false, {});
  assert.strictEqual(bad.ok, false);
});

console.log(`\n=== Physical invariants: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
