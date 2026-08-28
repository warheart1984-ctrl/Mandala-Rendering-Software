import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  rot4FromAngles,
  rot4Compose,
  rot4Apply,
  ROT4_IDENTITY,
  validateSO4,
  createHyperplane,
  signedDistance,
  intersectSegment,
  projectOntoHyperplane,
  hyperplaneBasis,
  clipTriangle,
  projectToSlice3D,
  evaluateSlice,
  sampleTrack4,
  transformChainSmoke,
  transformPipeline,
  toCameraSpace,
  sliceTo3D,
  toClipSpace,
  clipToNdc,
  ndcToScreen,
  perspectiveP3D,
  PIPELINE_STAGES,
  PIPELINE_STAGE_STATUS,
  createPipelineCamera,
  quat4ToMat4,
  quat,
  quatIdentity,
  quatExp,
  quatLog,
  quatSlerp,
  quat4SlerpMat,
  bivecExp,
  bivecLog,
  bivecExpMat,
  MATH4D_STATUS,
  MATH_FIRST_CONTRACT,
  MATH_FIRST_LAYERS,
  MATH_FIRST_EQUATION,
  evaluateMathContract,
  JOBS,
  ROSETTA_STATUS,
  ROSETTA_HOLO_GPU_STATUS,
  SHARED_STATE_KEYS,
  buildSharedState,
  compareSharedState,
  BRDF_LAMBERT_FACTOR,
  lambertPdf,
  phaseAlbedo,
  phaseAlbedoFromPosition,
  anisotropy4dHint,
  hyperVolumeDensity,
  BSDF4D_EXTENSIONS,
  createTemporalExtrusion,
  extrudeBetween,
  sliceExtrudedAtW,
  TEMPORAL_EXTRUSION_STATUS,
  TEMPORAL_REMESHING_STATUS,
  slerpSO4,
} from "./index.js";

const close = (a, b, eps = 1e-9) => {
  assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
};

describe("Rot4 compose", () => {
  it("identity has det 1 and is SO(4)", () => {
    const R = rot4FromAngles({});
    const v = validateSO4(R);
    assert.equal(v.valid, true);
    assert.deepEqual([...R], [...ROT4_IDENTITY]);
  });

  it("composes plane rotations into valid SO(4)", () => {
    const R = rot4Compose([
      { plane: "xy", angle: Math.PI / 4 },
      { plane: "zw", angle: Math.PI / 6 },
      { plane: "xw", angle: 0.3 },
    ]);
    assert.equal(validateSO4(R).valid, true);
    const p = rot4Apply(R, { x: 1, y: 0, z: 0, w: 0 });
    const len = Math.hypot(p.x, p.y, p.z, p.w);
    close(len, 1, 1e-9);
  });
});

describe("Hyperplane", () => {
  it("signedDistance and projectOntoHyperplane", () => {
    const plane = createHyperplane({ x: 0, y: 0, z: 0, w: 1 }, 0);
    close(signedDistance(plane, { x: 0, y: 0, z: 0, w: 2 }), 2);
    const on = projectOntoHyperplane(plane, { x: 1, y: 2, z: 3, w: 2 });
    close(on.w, 0);
    close(on.x, 1);
  });

  it("intersectSegment hits mid crossing", () => {
    const plane = createHyperplane({ x: 0, y: 0, z: 0, w: 1 }, 0);
    const hit = intersectSegment(
      plane,
      { x: 0, y: 0, z: 0, w: -1 },
      { x: 0, y: 0, z: 0, w: 1 }
    );
    assert.ok(hit);
    close(hit.t, 0.5);
    close(hit.point.w, 0);
  });

  it("intersectSegment returns null when same side", () => {
    const plane = createHyperplane({ x: 0, y: 0, z: 0, w: 1 }, 0);
    assert.equal(
      intersectSegment(
        plane,
        { x: 0, y: 0, z: 0, w: 1 },
        { x: 0, y: 0, z: 0, w: 2 }
      ),
      null
    );
  });

  it("clipTriangle yields 0–2 tris", () => {
    const plane = createHyperplane({ x: 0, y: 0, z: 0, w: 1 }, 0);
    const allIn = clipTriangle(
      plane,
      { x: 0, y: 0, z: 0, w: -1 },
      { x: 1, y: 0, z: 0, w: -1 },
      { x: 0, y: 1, z: 0, w: -1 }
    );
    assert.equal(allIn.length, 1);
    const allOut = clipTriangle(
      plane,
      { x: 0, y: 0, z: 0, w: 1 },
      { x: 1, y: 0, z: 0, w: 1 },
      { x: 0, y: 1, z: 0, w: 1 }
    );
    assert.equal(allOut.length, 0);
    const split = clipTriangle(
      plane,
      { x: 0, y: 0, z: 0, w: -1 },
      { x: 1, y: 0, z: 0, w: 1 },
      { x: 0, y: 1, z: 0, w: 1 }
    );
    assert.ok(split.length >= 1 && split.length <= 2);
  });
});

describe("Projection basis", () => {
  it("expresses on-plane points in orthonormal e1,e2,e3", () => {
    const plane = createHyperplane({ x: 0, y: 0, z: 0, w: 1 }, 0);
    const basis = hyperplaneBasis(plane.n);
    assert.equal(basis.length, 3);
    for (const e of basis) {
      close(e.x * plane.n.x + e.y * plane.n.y + e.z * plane.n.z + e.w * plane.n.w, 0, 1e-9);
    }
    const { p3 } = projectToSlice3D(plane, { x: 2, y: -1, z: 0.5, w: 3 });
    assert.ok(Number.isFinite(p3.x) && Number.isFinite(p3.y) && Number.isFinite(p3.z));
  });
});

describe("Slice modes", () => {
  it("static / orbit / slide evaluate", () => {
    const base = { normal: { x: 0, y: 0, z: 0, w: 1 }, offset: 0 };
    assert.equal(evaluateSlice({ ...base, mode: "static" }, 1).mode, "static");
    const orb = evaluateSlice({ ...base, mode: "orbit", orbitSpeed: 1 }, 0.5);
    assert.equal(orb.mode, "orbit");
    close(Math.hypot(orb.normal.x, orb.normal.y, orb.normal.z, orb.normal.w), 1, 1e-9);
    const slid = evaluateSlice({ ...base, mode: "slide", slideSpeed: 2 }, 1.5);
    close(slid.offset, 3);
  });
});

describe("Camera transform chain smoke", () => {
  it("World→camera→slice→screen→ndc is finite", () => {
    const cam = createPipelineCamera({
      position: { x: 0, y: 0, z: 0, w: 0 },
      normal: { x: 0, y: 0, z: 0, w: 1 },
      d: 0,
      width: 640,
      height: 480,
      fovY: 60,
    });
    const out = transformChainSmoke(cam, { x: 1, y: 0.5, z: 0, w: 0.2 });
    assert.ok(Number.isFinite(out.ndc.x));
    assert.ok(Number.isFinite(out.screen.X));
    assert.ok(Number.isFinite(out.slice3.x));
  });
});

describe("Infographic 4D→3D→2D pipeline", () => {
  const C0 = { x: 0, y: 0, z: 0, w: 0 };
  const planeW = () => createHyperplane({ x: 0, y: 0, z: 0, w: 1 }, 0);

  it("names the six stages plus temporal extrusion", () => {
    assert.equal(PIPELINE_STAGES.world, "4D World Space");
    assert.equal(PIPELINE_STAGES.camera, "4D Camera Space");
    assert.equal(PIPELINE_STAGES.slice, "Hyperplane Slice (4D → 3D)");
    assert.equal(PIPELINE_STAGES.clip, "3D Clip Space");
    assert.equal(PIPELINE_STAGES.ndc, "NDC Space");
    assert.equal(PIPELINE_STAGES.screen, "Screen Space");
    assert.equal(PIPELINE_STAGES.temporal, "Temporal Extrusion");
    assert.equal(PIPELINE_STAGE_STATUS.clip, "enforced");
    assert.equal(PIPELINE_STAGE_STATUS.screen, "partial");
    assert.equal(PIPELINE_STAGE_STATUS.screenRaster, "declared");
    assert.equal(PIPELINE_STAGE_STATUS.holographicRecorder, "declared");
  });

  it("camera space is x_c = R(x − C)", () => {
    const x = { x: 1.5, y: -0.5, z: 0.25, w: 2 };
    const identity = rot4FromAngles({});
    const xc = toCameraSpace(x, identity, C0);
    close(xc.x, 1.5);
    close(xc.y, -0.5);
    close(xc.z, 0.25);
    close(xc.w, 2);

    const translated = toCameraSpace(x, identity, { x: 0.5, y: 0, z: 0, w: 0 });
    close(translated.x, 1);
    close(translated.y, -0.5);

    const Rxy = rot4FromAngles({ xy: Math.PI / 2 });
    const rotated = toCameraSpace({ x: 1, y: 0, z: 0, w: 0 }, Rxy, C0);
    close(rotated.x, 0, 1e-12);
    close(rotated.y, 1, 1e-12);
    close(rotated.z, 0, 1e-12);
    close(rotated.w, 0, 1e-12);
  });

  it("composes world → camera → slice → clip → ndc (deterministic fixture)", () => {
    const world = { x: 0.5, y: -0.25, z: 1, w: 2 };
    const C = { x: 0.1, y: 0, z: 0, w: 0 };
    const R = rot4FromAngles({ zw: 0.2 });
    const hyperplane = planeW();
    const P3D = perspectiveP3D({
      fovY: Math.PI / 3,
      aspect: 640 / 480,
      near: 0.1,
      far: 100,
    });

    const camera = toCameraSpace(world, R, C);
    const sliced = sliceTo3D(hyperplane, camera);
    const clip = toClipSpace(sliced.p3, P3D);
    const ndc = clipToNdc(clip);

    assert.ok(Number.isFinite(clip.w) && Math.abs(clip.w) > 1e-12);
    close(ndc.x, clip.x / clip.w);
    close(ndc.y, clip.y / clip.w);
    close(ndc.z, clip.z / clip.w);

    const composed = transformPipeline(world, {
      C,
      R,
      hyperplane,
      P3D,
      width: 640,
      height: 480,
    });
    close(composed.camera.x, camera.x);
    close(composed.camera.y, camera.y);
    close(composed.camera.z, camera.z);
    close(composed.camera.w, camera.w);
    close(composed.slice3.x, sliced.p3.x);
    close(composed.slice3.y, sliced.p3.y);
    close(composed.slice3.z, sliced.p3.z);
    close(composed.clip.x, clip.x);
    close(composed.clip.w, clip.w);
    close(composed.ndc.x, ndc.x);
    close(composed.ndc.y, ndc.y);
    close(composed.ndc.z, ndc.z);

    const screen = ndcToScreen(ndc, 640, 480);
    close(composed.screen.X, screen.X);
    close(composed.screen.Y, screen.Y);
    close(composed.screen.X, (ndc.x * 0.5 + 0.5) * 640);
    close(composed.screen.Y, (1 - (ndc.y * 0.5 + 0.5)) * 480);
  });
});

describe("Math-first contract", () => {
  it("encodes axiom chain, equation, and three layers", () => {
    assert.deepEqual(MATH_FIRST_CONTRACT.axiomChain, [
      "Axioms",
      "State space",
      "Transforms",
      "Invariants",
      "Projection",
      "Implementation",
      "Tests",
    ]);
    assert.equal(
      MATH_FIRST_EQUATION,
      "I = ℛ( Π_{3→2}[ Π_{4→3}( R_4 X ) ] )"
    );
    assert.equal(
      MATH_FIRST_CONTRACT.composition,
      "transformPipeline ≡ Π_{3→2} ∘ Π_{4→3} ∘ R_4"
    );
    assert.equal(MATH_FIRST_LAYERS.mathematical, "enforced");
    assert.equal(MATH_FIRST_LAYERS.numerical, "partial");
    assert.equal(MATH_FIRST_LAYERS.physical, "declared");
    assert.equal(MATH_FIRST_CONTRACT.holographic, false);
    assert.equal(MATH_FIRST_CONTRACT.backends.jsCpu, "enforced");
    assert.equal(MATH_FIRST_CONTRACT.backends.cuda, "declared");
    assert.equal(MATH_FIRST_CONTRACT.map.scriptR.status, "declared");
  });

  it("backend must preserve mathematical contract", () => {
    const world = { x: 0.5, y: -0.25, z: 1, w: 2 };
    const report = evaluateMathContract(world, {
      C: { x: 0.1, y: 0, z: 0, w: 0 },
      R: rot4FromAngles({ zw: 0.2 }),
      hyperplane: createHyperplane({ x: 0, y: 0, z: 0, w: 1 }, 0),
      P3D: perspectiveP3D({
        fovY: Math.PI / 3,
        aspect: 640 / 480,
        near: 0.1,
        far: 100,
      }),
      width: 640,
      height: 480,
    });

    assert.equal(report.backend, "jsCpu");
    assert.equal(
      report.backendQuestion,
      "Does implementation B preserve the mathematical contract?"
    );
    assert.equal(report.preservesMathematicalContract, true);
    assert.equal(report.checks.so4, true);
    assert.equal(report.checks.compositionIdentity, true);
    assert.equal(report.checks.sliceIsR3, true);
    assert.equal(report.checks.pi32IsViewport, true);
    assert.equal(report.checks.scriptRNotInPipeline, true);
    assert.equal(report.layers.physical, "declared");
  });
});

describe("Compose vs compiler vs Rosetta", () => {
  it("keeps three jobs and does not claim holography is Π", () => {
    assert.equal(JOBS.compose.contractId, MATH_FIRST_CONTRACT.id);
    assert.equal(JOBS.compose.status, "enforced");
    assert.equal(JOBS.compiler.projection.status, "enforced");
    assert.equal(JOBS.compiler.holography.status, "partial");
    assert.equal(JOBS.compiler.holography.gpu, "declared");
    assert.equal(JOBS.rosetta.status, "partial");
    assert.equal(JOBS.rosetta.holographicIsNotPi, true);
    assert.equal(ROSETTA_STATUS, "partial");
    assert.equal(ROSETTA_HOLO_GPU_STATUS, "declared");
    assert.equal(MATH_FIRST_CONTRACT.holographic, false);
  });

  it("maps shared state without sharing Π", () => {
    const a = buildSharedState({
      X: { x: 1, y: 0, z: 0, w: 4 },
      t: 4,
      timeAsW: { value: 4, usedBy: "projection", extrusion: true },
      camera: { kind: "camera4d" },
      provenance: { worldId: "w1" },
      outDir: "/tmp/proj",
      source: "projection",
    });
    const b = buildSharedState({
      X: { x: 1, y: 0, z: 0, w: 4 },
      t: 4,
      timeAsW: { value: 4, usedBy: "holo-clock-only", extrusion: false },
      camera: { kind: "movie-lane-observer" },
      provenance: { worldId: "w1" },
      outDir: "/tmp/holo",
      source: "holography",
    });
    for (const key of SHARED_STATE_KEYS) {
      assert.ok(key in a, `missing ${key}`);
    }
    const cmp = compareSharedState(a, b);
    assert.equal(cmp.shareClock, true);
    assert.equal(cmp.sharePi, false);
    assert.equal(a.sharePi, false);
    assert.equal(b.holographicIsNotPi, true);
  });
});

describe("Track4", () => {
  it("samples pos and sliceOffset", () => {
    const s = sampleTrack4(
      [
        { time: 0, pos: { x: 0, y: 0, z: 0, w: 0 }, sliceOffset: 0 },
        { time: 2, pos: { x: 2, y: 0, z: 0, w: 0 }, sliceOffset: 4 },
      ],
      1
    );
    close(s.pos.x, 1);
    close(s.sliceOffset, 2);
  });

  it("uses Quat4 double-cover SLERP when qL/qR present", () => {
    const qL1 = quat(Math.cos(0.4), Math.sin(0.4), 0, 0);
    const s = sampleTrack4(
      [
        { time: 0, qL: quatIdentity(), qR: quatIdentity() },
        { time: 1, qL: qL1, qR: quatIdentity() },
      ],
      0.5
    );
    assert.equal(validateSO4(s.rot, 1e-5).valid, true);
    const mid = quat4SlerpMat(quatIdentity(), quatIdentity(), qL1, quatIdentity(), 0.5);
    for (let i = 0; i < 16; i++) close(s.rot[i], mid[i], 1e-9);
  });
});

describe("Quat4 exp/log/SLERP", () => {
  it("identity quaternions yield near-identity SO(4)", () => {
    const m = quat4ToMat4(quatIdentity(), quatIdentity());
    assert.equal(validateSO4(m, 1e-5).valid, true);
  });

  it("left rotation changes a basis vector", () => {
    const qL = quat(Math.cos(0.2), Math.sin(0.2), 0, 0);
    const m = quat4ToMat4(qL, quatIdentity());
    assert.equal(validateSO4(m, 1e-5).valid, true);
  });

  it("quatExp/quatLog roundtrip on pure imag", () => {
    const pure = quat(0, 0.1, -0.2, 0.05);
    const q = quatExp(pure);
    const back = quatLog(q);
    close(back.w, 0, 1e-12);
    close(back.x, pure.x, 1e-9);
    close(back.y, pure.y, 1e-9);
    close(back.z, pure.z, 1e-9);
  });

  it("quatSlerp endpoints and double-cover shortest path", () => {
    const a = quatIdentity();
    const b = quat(Math.cos(0.3), Math.sin(0.3), 0, 0);
    const mid = quatSlerp(a, b, 0.5);
    close(quatSlerp(a, b, 0).w, 1, 1e-12);
    close(quatSlerp(a, b, 1).x, b.x, 1e-12);
    // Negated b should take same short arc
    const midNeg = quatSlerp(a, quat(-b.w, -b.x, -b.y, -b.z), 0.5);
    close(mid.w, midNeg.w, 1e-9);
    close(mid.x, midNeg.x, 1e-9);
  });

  it("bivecExp/Log packing roundtrip", () => {
    const b = { xy: 0.2, xz: -0.1, xw: 0.05, yz: 0.15, yw: -0.08, zw: 0.3 };
    const { qL, qR } = bivecExp(b);
    const back = bivecLog(qL, qR);
    for (const k of Object.keys(b)) close(back[k], b[k], 1e-9);
    assert.equal(validateSO4(bivecExpMat(b), 1e-5).valid, true);
  });

  it("quat4SlerpMat stays in SO(4)", () => {
    const qL1 = quat(Math.cos(0.5), 0, Math.sin(0.5), 0);
    const qR1 = quat(Math.cos(0.2), Math.sin(0.2), 0, 0);
    const m = quat4SlerpMat(quatIdentity(), quatIdentity(), qL1, qR1, 0.3);
    assert.equal(validateSO4(m, 1e-5).valid, true);
  });

  it("slerpSO4 endpoints and validity (partial geodesic)", () => {
    const R0 = rot4FromAngles({ xy: 0.2 });
    const R1 = rot4FromAngles({ zw: 0.4, xw: 0.1 });
    assert.equal(validateSO4(slerpSO4(R0, R1, 0), 1e-5).valid, true);
    assert.equal(validateSO4(slerpSO4(R0, R1, 1), 1e-5).valid, true);
    assert.equal(validateSO4(slerpSO4(R0, R1, 0.5), 1e-4).valid, true);
  });
});

describe("BSDF audit constants", () => {
  it("preserves Lambert factor and pdf shape", () => {
    close(BRDF_LAMBERT_FACTOR, 3 / (4 * Math.PI));
    close(lambertPdf(1), 3 / (4 * Math.PI));
    assert.equal(lambertPdf(-0.1), 0);
  });

  it("phaseAlbedo modulates RGB without changing BRDF factor", () => {
    const base = { x: 0.5, y: 0.4, z: 0.3, w: 1 };
    const same = phaseAlbedo(base, 1.2, { amplitude: 0 });
    close(same.x, 0.5);
    const tinted = phaseAlbedo(base, 0, { amplitude: 0.2 });
    close(tinted.x, 0.5 * 1.2, 1e-12);
    close(BRDF_LAMBERT_FACTOR, 3 / (4 * Math.PI));
    const fromPos = phaseAlbedoFromPosition({ x: 1, y: 0, z: 0, w: 0 }, base, {
      amplitude: 0.1,
    });
    close(fromPos.x, 0.5 * 1.1, 1e-12);
  });

  it("anisotropy4dHint and hyperVolumeDensity honest tags", () => {
    const plane = createHyperplane({ x: 0, y: 0, z: 0, w: 1 }, 0);
    const hint = anisotropy4dHint(
      { position: { x: 0, y: 0, z: 0, w: 0 } },
      plane,
      { strength: 0.5 }
    );
    assert.equal(hint.status, "partial");
    assert.ok(Number.isFinite(hint.tangent3.x));
    assert.equal(hyperVolumeDensity({ x: 0, y: 0, z: 0, w: 1 }).status, "declared");
    assert.equal(BSDF4D_EXTENSIONS.phaseDependentColor, "partial");
    assert.equal(BSDF4D_EXTENSIONS.hyperVolumeDensity, "declared");
  });
});

describe("Temporal extrusion", () => {
  it("embedFrame skeleton and extrudeBetween prismatic solid", () => {
    assert.equal(TEMPORAL_EXTRUSION_STATUS, "partial");
    const te = createTemporalExtrusion();
    const frame = te.embedFrame(1.5, {
      vertices: [{ x: 0, y: 0, z: 0 }],
      faces: [],
    });
    close(frame.vertices[0].w, 1.5);
    assert.equal(frame.status, "skeleton");

    const mesh0 = {
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ],
      faces: [[0, 1, 2]],
    };
    const mesh1 = {
      vertices: [
        { x: 0, y: 0, z: 0.2 },
        { x: 1.1, y: 0, z: 0.2 },
        { x: 0, y: 1.1, z: 0.2 },
      ],
      faces: [[0, 1, 2]],
    };
    const solid = extrudeBetween(0, mesh0, 1, mesh1);
    assert.equal(solid.status, "partial");
    assert.equal(solid.vertices.length, 6);
    close(solid.vertices[0].w, 0);
    close(solid.vertices[3].w, 1);
    assert.equal(solid.tets.length, 3);

    const mid = sliceExtrudedAtW(solid, 0.5);
    assert.equal(mid.status, "partial");
    assert.equal(mid.vertices.length, 3);
    close(mid.vertices[0].z, 0.1, 1e-9);
    close(mid.vertices[1].x, 1.05, 1e-9);
    assert.equal(TEMPORAL_REMESHING_STATUS, "declared");
  });
});

describe("MATH4D_STATUS", () => {
  it("exposes honest tags", () => {
    assert.equal(MATH4D_STATUS.rot4, "enforced");
    assert.equal(MATH4D_STATUS.temporalExtrusion, "partial");
    assert.equal(MATH4D_STATUS.quat4, "partial");
    assert.equal(MATH4D_STATUS.quatExpLog, "enforced");
    assert.equal(MATH4D_STATUS.bivec, "partial");
    assert.equal(MATH4D_STATUS.bsdfExtensions, "partial");
    assert.equal(MATH4D_STATUS.pipelineCamera, "enforced");
    assert.equal(MATH4D_STATUS.pipelineClip, "enforced");
    assert.equal(MATH4D_STATUS.pipelineScreen, "partial");
    assert.equal(MATH4D_STATUS.mathFirstContract, "enforced");
    assert.equal(MATH4D_STATUS.mathLayer, "enforced");
    assert.equal(MATH4D_STATUS.numericLayer, "partial");
    assert.equal(MATH4D_STATUS.physicalLayer, "declared");
    assert.equal(MATH4D_STATUS.scriptR, "declared");
    assert.equal(MATH4D_STATUS.holographicRecorder, "declared");
    assert.equal(MATH4D_STATUS.rosetta, "partial");
  });
});
