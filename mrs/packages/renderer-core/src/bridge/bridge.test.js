import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Body3D } from "../math3d/physics.js";
import { vec3 } from "../math3d/vec3.js";
import {
  FieldRegistry,
  WaveBridge,
  WaveBridgeV2,
  WaveBridgeV3,
  bridgeMap3Dto4D,
  createTensorField3D,
  createVectorField3D,
  createWaveField3D,
  createWaveField4D,
  idx,
  runBridgeFrame,
  sampleWaveAtPosition,
  setTensorAtCell,
  shouldDimensionalShift,
  stepWaveField3D,
  tensor3x3,
  tensorCurvature,
  tensorGradientAtPosition,
  transitionSignal,
  waveGradientAtPosition,
} from "./index.js";

const closeTo = (actual, expected, epsilon = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${actual} != ${expected} (eps=${epsilon})`,
  );
};

describe("stepWaveField3D", () => {
  it("propagates a center impulse to neighbors (not all zeros)", () => {
    const field = createWaveField3D({ nx: 9, ny: 9, nz: 9, dx: 1, c: 1, dt: 0.3 });
    field.psi[idx(field, 4, 4, 4)] = 1;
    field.psiPrev[idx(field, 4, 4, 4)] = 1;
    for (let s = 0; s < 4; s++) stepWaveField3D(field);
    assert.notEqual(field.psi[idx(field, 5, 4, 4)], 0);
    let any = false;
    for (let i = 0; i < field.psi.length; i++) if (field.psi[i] !== 0) any = true;
    assert.equal(any, true);
  });

  it("default dt (no options.dt) is finite and one step stays finite (Math.sqrt(3) regression)", () => {
    const field = createWaveField3D({ nx: 8, ny: 8, nz: 8, dx: 1, c: 1 });
    assert.equal(Number.isFinite(field.dt), true);
    field.psi[idx(field, 4, 4, 4)] = 1;
    field.psiPrev[idx(field, 4, 4, 4)] = 1;
    stepWaveField3D(field);
    for (let i = 0; i < field.psi.length; i++) {
      assert.equal(Number.isFinite(field.psi[i]), true);
    }
  });
});

describe("bridgeMap3Dto4D", () => {
  it("sets w = alpha * psi", () => {
    assert.deepEqual(bridgeMap3Dto4D(vec3(1, 2, 3), 0.5, 4), { x: 1, y: 2, z: 3, w: 2 });
  });
});

describe("sampleWaveAtPosition", () => {
  it("returns 0 for out-of-bounds positions", () => {
    const field = createWaveField3D({ nx: 4, ny: 4, nz: 4, dx: 1, origin: vec3() });
    field.psi[idx(field, 1, 1, 1)] = 7;
    assert.equal(sampleWaveAtPosition(field, vec3(-1, 0, 0)), 0);
    assert.equal(sampleWaveAtPosition(field, vec3(10, 10, 10)), 0);
  });
});

describe("waveGradientAtPosition", () => {
  it("recovers an approximate known gradient on a linear ramp field", () => {
    const field = createWaveField3D({ nx: 8, ny: 8, nz: 8, dx: 1, origin: vec3() });
    for (let k = 0; k < field.nz; k++) {
      for (let j = 0; j < field.ny; j++) {
        for (let i = 0; i < field.nx; i++) {
          field.psi[idx(field, i, j, k)] = i;
        }
      }
    }
    const grad = waveGradientAtPosition(field, vec3(3.5, 3.5, 3.5));
    closeTo(grad.x, 1, 1e-6);
    closeTo(grad.y, 0, 1e-6);
    closeTo(grad.z, 0, 1e-6);
  });
});

describe("WaveBridge v1", () => {
  it("returns lifted4D, forces, visualMod with matching lengths (M=γψ)", () => {
    const field = createWaveField3D({ nx: 7, ny: 7, nz: 7, dx: 1, c: 1, dt: 0.25 });
    field.psi[idx(field, 3, 3, 3)] = 1;
    field.psiPrev[idx(field, 3, 3, 3)] = 1;
    const bodies = [
      new Body3D({ position: vec3(3, 3, 3), mass: 2 }),
      new Body3D({ position: vec3(2, 3, 3), mass: 1 }),
    ];
    bodies[0].id = "a";
    bodies[1].id = "b";
    const geometryVertices = [vec3(3, 3, 3), vec3(2, 3, 3), vec3(4, 3, 3)];
    const bridge = new WaveBridge(field, 2, 1.5, 1);
    const out = bridge.evaluate({ bodies, geometryVertices, deltaTime: 0.25 });
    assert.equal(out.lifted4D.length, geometryVertices.length);
    assert.equal(out.visualMod.length, geometryVertices.length);
    assert.equal(out.forces.size, bodies.length);
    for (let i = 0; i < geometryVertices.length; i++) {
      closeTo(out.lifted4D[i].w, 2 * out.visualMod[i], 1e-9);
    }
  });

  it("is deterministic for identical setups", () => {
    const setup = () => {
      const field = createWaveField3D({ nx: 6, ny: 6, nz: 6, dx: 1, c: 1, dt: 0.2 });
      field.psi[idx(field, 2, 2, 2)] = 0.8;
      field.psiPrev[idx(field, 2, 2, 2)] = 0.8;
      const bodies = [new Body3D({ position: vec3(2, 2, 2), mass: 1 })];
      bodies[0].id = 0;
      return { field, bodies, geometryVertices: [vec3(2, 2, 2), vec3(3, 2, 2)] };
    };
    const aIn = setup();
    const bIn = setup();
    const a = new WaveBridge(aIn.field, 1, 1, 1).evaluate({
      bodies: aIn.bodies,
      geometryVertices: aIn.geometryVertices,
    });
    const b = new WaveBridge(bIn.field, 1, 1, 1).evaluate({
      bodies: bIn.bodies,
      geometryVertices: bIn.geometryVertices,
    });
    assert.deepEqual(a.visualMod, b.visualMod);
    assert.deepEqual(a.lifted4D, b.lifted4D);
  });

  it("runBridgeFrame returns evaluate outputs", () => {
    const field = createWaveField3D({ nx: 5, ny: 5, nz: 5, dt: 0.1 });
    const bridge = new WaveBridge(field, 1, 1, 1);
    const out = runBridgeFrame(bridge, { geometryVertices: [vec3(2, 2, 2)] });
    assert.equal(out.lifted4D.length, 1);
  });
});

describe("transitions (declared)", () => {
  it("shouldDimensionalShift uses Θ > τ", () => {
    assert.equal(shouldDimensionalShift(0.5, 1), false);
    assert.equal(shouldDimensionalShift(1.5, 1), true);
    closeTo(transitionSignal(-2, 0.5), 1);
  });
});

describe("WaveBridgeV2", () => {
  it("with 2 scalar fields returns layered outputs", () => {
    const f0 = createWaveField3D({ nx: 5, ny: 5, nz: 5, dt: 0.15 });
    const f1 = createWaveField3D({ nx: 5, ny: 5, nz: 5, dt: 0.15 });
    f0.psi[idx(f0, 2, 2, 2)] = 1;
    f1.psi[idx(f1, 2, 2, 2)] = 0.5;
    const registry = new FieldRegistry({ scalarFields: [f0, f1] });
    const bridge = new WaveBridgeV2(registry, {
      alphaLift: [1, 2],
      kForce: [1, 1],
      ampVisual: [1, 1],
      sigmaTransition: [1, 1],
    });
    const body = new Body3D({ position: vec3(2, 2, 2), mass: 1 });
    body.id = "b0";
    const out = bridge.evaluate({
      bodies: [body],
      geometryVertices: [vec3(2, 2, 2), vec3(1, 2, 2)],
    });
    assert.equal(out.lifted4D.length, 2);
    assert.equal(out.visualMod.length, 2);
    assert.equal(out.transitions.length, 2);
    assert.equal(out.forces.get("b0").length, 2);
    assert.equal(out.lifted4D[0].length, 2);
  });

  it("registry with empty vector/tensor/4D does not crash", () => {
    const f0 = createWaveField3D({ nx: 4, ny: 4, nz: 4, dt: 0.1 });
    const registry = new FieldRegistry({
      scalarFields: [f0],
      vectorFields: [],
      tensorFields: [],
      waveFields4D: [createWaveField4D({ nx: 2, ny: 2, nz: 2, nw: 2 })],
    });
    const bridge = new WaveBridgeV2(registry);
    const out = bridge.evaluate({
      geometryVertices: [vec3(1, 1, 1)],
      geometryNormals: [],
      geometryTangents: [],
    });
    assert.equal(out.lifted4D.length, 1);
    assert.equal(out.visualMod[0].length, 1);
  });
});

describe("tensor helpers (v3)", () => {
  it("tensorCurvature equals xx+yy+zz", () => {
    closeTo(tensorCurvature(tensor3x3(1, 0, 0, 0, 2, 0, 0, 0, 3)), 6);
  });

  it("tensorGradient on linear xx field ≈ known ∂κ", () => {
    const field = createTensorField3D({ nx: 8, ny: 8, nz: 8, dx: 1, origin: vec3() });
    for (let k = 0; k < field.nz; k++) {
      for (let j = 0; j < field.ny; j++) {
        for (let i = 0; i < field.nx; i++) {
          // κ = xx = i → ∂κ/∂x ≈ 1
          setTensorAtCell(field, i, j, k, tensor3x3(i, 0, 0, 0, 0, 0, 0, 0, 0));
        }
      }
    }
    const g = tensorGradientAtPosition(field, vec3(3, 3, 3));
    closeTo(g.x, 1, 1e-6);
    closeTo(g.y, 0, 1e-6);
    closeTo(g.z, 0, 1e-6);
  });
});

describe("WaveBridgeV3", () => {
  it("lift w includes βκ with 1 scalar + 1 static tensor", () => {
    const scalar = createWaveField3D({ nx: 6, ny: 6, nz: 6, dx: 1, dt: 0.1, origin: vec3() });
    // Hold field still: equal psi/psiPrev so step keeps sample usable; set after construct
    const tensor = createTensorField3D({ nx: 6, ny: 6, nz: 6, dx: 1, origin: vec3() });
    for (let k = 0; k < 6; k++) {
      for (let j = 0; j < 6; j++) {
        for (let i = 0; i < 6; i++) {
          setTensorAtCell(tensor, i, j, k, tensor3x3(2, 0, 0, 0, 3, 0, 0, 0, 4)); // κ=9
        }
      }
    }
    // Uniform ψ=1 at cell (3,3,3) and neighbors for stable sample
    for (let k = 2; k <= 4; k++) {
      for (let j = 2; j <= 4; j++) {
        for (let i = 2; i <= 4; i++) {
          scalar.psi[idx(scalar, i, j, k)] = 1;
          scalar.psiPrev[idx(scalar, i, j, k)] = 1;
        }
      }
    }
    const registry = new FieldRegistry({
      scalarFields: [scalar],
      tensorFields: [tensor],
      vectorFields: [createVectorField3D({ nx: 6, ny: 6, nz: 6 })],
    });
    const bridge = new WaveBridgeV3(registry, {
      alpha: [1],
      beta: [0.5],
      kForce: [0],
      lambdaDiv: [0],
      muTensor: [0],
      gammaVisual: [1],
      deltaVisual: [0],
      epsilonVisual: [0],
      sigmaTransition: [1],
    });
    const out = bridge.evaluate({
      geometryVertices: [vec3(3, 3, 3)],
      deltaTime: 0.1,
    });
    // w = αψ + βκ ≈ 1*1 + 0.5*9 = 5.5 (after one FD step ψ may drift slightly)
    assert.equal(out.lifted4D.length, 1);
    const w = out.lifted4D[0][0].w;
    assert.ok(w > 4.5, `expected βκ contribution in w, got ${w}`);
    closeTo(out.transitions[0][0], out.visualMod[0][0] * 9, 1.5);
  });
});
