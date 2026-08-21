import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createHexLattice,
  createSquareLattice,
  fillGroundState,
  addDefect,
  flipEdgeParity,
  allHexLoopsConsistent,
  inconsistentHexCount,
  meanForce,
  maxForceMagnitude,
  localForceNear,
  stepEuler,
  netDrift,
  etaMean,
} from "../dual-lattice.mjs";
import {
  moebiusParity,
  moebiusTwistGradient,
  gradientField,
  twist,
  hexLoopConsistent,
} from "../moebius.mjs";
import { sppMean, boxDownsample, BLOCK_AVERAGE } from "../block-average.mjs";
import { surrogateForce, describeChamberSubstrate } from "../chamber-hook.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("rhfd-mandala substrate ground state", () => {
  it("hex vacuum: zero-mean eta, ∇V≈0, no net drift, all petal loops consistent", () => {
    const lattice = fillGroundState(createHexLattice({ radius: 2 }), { seed: 7 });
    assert.equal(lattice.kind, "hex-dual-lattice");
    assert.ok(lattice.nodes.length >= 19);
    assert.ok(Math.abs(etaMean(lattice)) < 1e-12);
    assert.ok(maxForceMagnitude(lattice) < 1e-12);
    assert.ok(meanForce(lattice).mag < 1e-12);
    assert.equal(allHexLoopsConsistent(lattice), true);
    assert.equal(inconsistentHexCount(lattice), 0);

    for (let s = 0; s < 4; s++) stepEuler(lattice, 0.1);
    assert.ok(netDrift(lattice).mag < 1e-12);
  });

  it("square vacuum analogue: mean force ~0 and no drift", () => {
    const lattice = fillGroundState(createSquareLattice({ nx: 8, ny: 8 }), { seed: 3 });
    assert.ok(maxForceMagnitude(lattice) < 1e-12);
    for (let s = 0; s < 4; s++) stepEuler(lattice, 0.1);
    assert.ok(netDrift(lattice).mag < 1e-12);
  });

  it("potential-well defect produces local non-zero ∇V", () => {
    const lattice = fillGroundState(createHexLattice({ radius: 2 }), { seed: 1 });
    addDefect(lattice, { q: 0, r: 0, amplitude: 1.5, sigma: 0.9 });
    const local = localForceNear(lattice, 0, 0, 1);
    const far = localForceNear(lattice, 2, 0, 0);
    assert.ok(local > 1e-4, `local |∇V| should be non-zero, got ${local}`);
    assert.ok(local > far, "defect field should be stronger near the well than far away");
    assert.ok(maxForceMagnitude(lattice) > 1e-4);
  });

  it("parity-flip defect breaks hex-loop consistency", () => {
    const lattice = fillGroundState(createHexLattice({ radius: 2 }), { seed: 1 });
    assert.equal(allHexLoopsConsistent(lattice), true);
    flipEdgeParity(lattice, 0, 0, 1, 0);
    assert.equal(allHexLoopsConsistent(lattice), false);
    assert.ok(inconsistentHexCount(lattice) >= 1);
    assert.equal(hexLoopConsistent(lattice.edgeParity, 0, 0), false);
  });
});

describe("möbius parity / twist (JS = WGSL formula)", () => {
  it("f(x,y)=(x+y) mod 2", () => {
    assert.equal(moebiusParity(0, 0), 0);
    assert.equal(moebiusParity(1, 0), 1);
    assert.equal(moebiusParity(1, 1), 0);
    assert.equal(moebiusParity(2, 3), 1);
  });

  it("twist = normalize(gradientField) is a real function", () => {
    const g = gradientField(0, 0);
    assert.equal(g.length, 4);
    assert.deepEqual(g, moebiusTwistGradient(0, 0));
    const t = twist(0, 0);
    const n = Math.hypot(...t);
    assert.ok(Math.abs(n - 1) < 1e-12);
    // Checkerboard forward-difference is never the vacuum: |g| > 0.
    assert.ok(Math.hypot(...g) > 0);
  });
});

describe("B_L named stages", () => {
  it("spp mean and box downsample are real; TAA is not claimed", () => {
    assert.equal(sppMean([1, 3, 5]), 3);
    const src = new Float32Array([
      1, 1, 3, 3,
      1, 1, 3, 3,
      5, 5, 7, 7,
      5, 5, 7, 7,
    ]);
    const dst = boxDownsample(src, 4, 4, 2, 2, 1);
    assert.equal(dst.length, 4);
    assert.equal(dst[0], 1);
    assert.equal(dst[1], 3);
    assert.equal(dst[2], 5);
    assert.equal(dst[3], 7);
    assert.equal(BLOCK_AVERAGE.stages.B_L.taa, false);
  });
});

describe("chamber defect framing", () => {
  it("idle pose delta is ~0; motion surrogate is tagged notGradV", () => {
    const idle = surrogateForce([0, 2, 0, 0], [0, 2, 0, 0], 1 / 12);
    assert.ok(idle.mag < 1e-12);
    assert.equal(idle.notGradV, true);
    const moving = surrogateForce([0, 0, 0, 0], [1, 0, 0, 0], 0.5);
    assert.ok(moving.mag > 0);
    const desc = describeChamberSubstrate({
      actors: [{ id: "a", name: "A", position: [0, 2, 0, 0] }],
    });
    assert.equal(desc.motionDriverActual, "pose_interpolation");
    assert.equal(desc.gradVStatus, "partial");
    assert.equal(desc.defects[0].kind, "defect");
  });
});

describe("contract JSON", () => {
  it("names nodes, links, eta, gradV, defects, B_L, vacuum, moebius", () => {
    const raw = JSON.parse(
      readFileSync(resolve(__dirname, "../contract.json"), "utf8"),
    );
    assert.equal(raw.status, "partial");
    for (const k of ["nodes", "links", "eta", "gradV", "defects", "B_L", "vacuum"]) {
      assert.ok(raw.fieldNames[k], `missing fieldNames.${k}`);
    }
    assert.ok(raw.fieldNames.moebiusParity || raw.moebius);
    assert.equal(raw.rt4dFieldNames.taa, false);
    assert.equal(raw.organs.pixels, "Mandala");
    assert.equal(raw.organs.motion, "Simulation Chamber");
  });
});
