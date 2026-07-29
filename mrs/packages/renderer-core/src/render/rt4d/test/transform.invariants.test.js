import { test } from "node:test";
import assert from "assert";
import { Transform4D } from "../math/transform.js";

// R5: Compact 4×4 transform invariant
//   out_i = dot(row_i, v) + m[12+i]   ∀ i ∈ {0,1,2,3}
// Row 3 (m[12..15]) aliases linear w-coefficients with the translation column.
// The formula applies the translation term exactly once per component.

function mulMat4Vec4(m, v) {
  const x = v.x, y = v.y, z = v.z, w = v.w;
  return {
    x: m[0]*x + m[1]*y + m[2]*z + m[3]*w + m[12],
    y: m[4]*x + m[5]*y + m[6]*z + m[7]*w + m[13],
    z: m[8]*x + m[9]*y + m[10]*z + m[11]*w + m[14],
    w: m[12]*x + m[13]*y + m[14]*z + m[15]*w + m[15],
  };
}

test("R5: translation applied once, math self-consistent", () => {
  // row 3 = (2,3,4,1) serves as both linear w-coeffs and translation
  const m = [
    1,0,0,0,
    0,1,0,0,
    0,0,1,0,
    2,3,4,1,
  ];
  const v = { x: 10, y: 20, z: 30, w: 1 };
  const expected = {
    x: 12,    // 10 + 2
    y: 23,    // 20 + 3
    z: 34,    // 30 + 4
    w: 202,   // 2·10 + 3·20 + 4·30 + 1·1 + 1
  };
  assert.deepEqual(mulMat4Vec4(m, v), expected);
});

test("R5: Transform4D.apply matches mulMat4Vec4", () => {
  const t = new Transform4D();
  const m = t.m;
  m[0] = 2; m[1] = 0; m[2] = 0; m[3] = 0;
  m[4] = 0; m[5] = 3; m[6] = 0; m[7] = 0;
  m[8] = 0; m[9] = 0; m[10]= 4; m[11]= 0;
  m[12]= 5; m[13]= 6; m[14]= 7; m[15]= 1;

  const v = { x: 1, y: 2, z: 3, w: 1 };
  assert.deepEqual(t.apply(v), mulMat4Vec4(m, v));
});

test("identity: w = dot(row3, v) + m[15] = w + 1 (alias artifact)", () => {
  const t = new Transform4D();
  const out = t.apply({ x: 10, y: 20, z: 30, w: 1 });
  assert.equal(out.x, 10);
  assert.equal(out.y, 20);
  assert.equal(out.z, 30);
  assert.equal(out.w, 2);
});

test("translate defaults tw=1, w output reflects alias", () => {
  const t = Transform4D.translate(2, 3, 4);
  const out = t.apply({ x: 0, y: 0, z: 0, w: 1 });
  assert.equal(out.x, 2);
  assert.equal(out.y, 3);
  assert.equal(out.z, 4);
  // row 3 = (0,0,0,1), tw=1 → out_w = 0+0+0+1·1+1 = 2
  assert.equal(out.w, 2);
});

test("applyDir: no translation addition in w output", () => {
  // applyDir does not add m[12+i], but m[12..15] still linear w-coeffs
  const t = Transform4D.translate(0, 0, 0, 0);
  const out = t.applyDir({ x: 1, y: 0, z: 0, w: 1 });
  assert.equal(out.x, 1);
  assert.equal(out.y, 0);
  assert.equal(out.z, 0);
  // m[15]=0 → out_w = 0*1+0*0+0*0+0*1 = 0
  assert.equal(out.w, 0);
});

test("m[15] translation term applied exactly once (no double)", () => {
  const t = new Transform4D();
  // If spurious +m[15] were added, w would be 3 not 2.
  assert.equal(t.apply({ x: 0, y: 0, z: 0, w: 1 }).w, 2);
});

test("applyDir applies linear part without translation addition", () => {
  // xy rotation: rows 0-1 use m[0..7], m[12..15] unaffected (=identity)
  const t = Transform4D.rotate("xy", Math.PI / 4);
  const v = { x: 1, y: 0, z: 0, w: 0 };
  const out = t.applyDir(v);
  // out = (cos, sin, 0, 0)
  assert.ok(Math.abs(out.x - Math.cos(Math.PI/4)) < 1e-10);
  assert.ok(Math.abs(out.y - Math.sin(Math.PI/4)) < 1e-10);
  assert.equal(out.z, 0);
  assert.equal(out.w, 0);
});

test("xw rotation exercises row 3 alias in apply and applyDir", () => {
  // xw rotation by π/2: row 3 = (1,0,0,0), m[12]=1
  // apply adds translation: out_x = dot(row0,v) + m[12] = 0 + 1 = 1
  // applyDir no translation: out_x = dot(row0,v) = 0
  const t = Transform4D.rotate("xw", Math.PI / 2);
  const v = { x: 1, y: 0, z: 0, w: 0 };
  const a = t.apply(v);
  const d = t.applyDir(v);
  assert.ok(Math.abs(a.x - 1) < 1e-10);  // m[12]=1 added as translation
  assert.ok(Math.abs(d.x) < 1e-10);      // no translation
  assert.ok(Math.abs(a.w - 1) < 1e-10);  // sin(π/2)·1 → w=1
  assert.ok(Math.abs(d.w - 1) < 1e-10);
});
