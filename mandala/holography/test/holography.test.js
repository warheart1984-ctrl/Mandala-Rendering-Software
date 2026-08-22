import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialCertifiedState, rehash } from "../../proto/certified-state.mjs";
import { PROTO_SHAPE } from "../../proto/constitution.mjs";
import {
  encodeBoundary,
  reconstructBulkPreview,
  projectBulkFromBoundary,
  projectCertifiedHolography,
  computeBoundaryScreen,
  bulkToBoundaryInformation,
  FACE_IDS,
  MINKOWSKI_ETA,
  inducedMetric3,
  inducedMetricOnSlice,
  naiveProjectDropTime,
  minkowskiIntervalSquared,
  INDUCED_METRIC_IDS,
  g_munu,
  PROJECTOR_C,
  assertNormalUnit,
  staticObserverNormal,
  projectNaive,
  projectWithNormal,
  inducedMetricHij,
  spatialDistanceH,
  flatInducedDelta,
  spacetimeIntervalSquared,
  buildEGT,
  updateEGT,
  evolveEGTSequence,
  recomputeCurvature,
  entropyProxyS,
  DEFAULT_ALPHA,
  DEFAULT_BETA,
  createBulkSpacetimeEngine,
  createBoundaryProjection,
  createHolographicEncoder,
  createEntanglementRenderer,
  EFR_MODES,
} from "../index.mjs";

describe("mandala holography — cube-faces bulk/boundary (Claim A)", () => {
  it("encode → reconstruct is deterministic", () => {
    const state = createInitialCertifiedState({ seed: 7 });
    const a = encodeBoundary(state.scalar, state.shape);
    const b = encodeBoundary(state.scalar, state.shape);
    assert.equal(a.hash, b.hash);
    for (const id of FACE_IDS) {
      assert.deepEqual(a.faces[id], b.faces[id]);
    }
    const r1 = reconstructBulkPreview(a);
    const r2 = reconstructBulkPreview(b);
    assert.equal(r1.length, PROTO_SHAPE.cellCount);
    for (let i = 0; i < r1.length; i++) assert.equal(r1[i], r2[i]);
  });

  it("boundary byte size < full volume for cube-faces encoding", () => {
    const state = createInitialCertifiedState({ seed: 3 });
    const boundary = encodeBoundary(state.scalar, state.shape);
    assert.ok(boundary.byteLength < boundary.bulkByteLength);
    assert.equal(boundary.byteLength, 6 * 32 * 32 * 4);
  });

  it("certified bulk hash unchanged after holography ops", () => {
    const state = createInitialCertifiedState({ seed: 11 });
    const hash0 = state.hash;
    const { receipt } = projectBulkFromBoundary(state);
    assert.equal(state.hash, hash0);
    assert.equal(receipt.liveScalarUnchanged, true);
    const again = projectCertifiedHolography(state);
    assert.equal(state.hash, hash0);
    assert.equal(again.receipt.certifiedUnchanged, true);
    rehash(state);
    assert.equal(state.hash, hash0);
  });

  it("reconstruct does not equal certified bulk (honest toy gap)", () => {
    const state = createInitialCertifiedState({ seed: 7 });
    const { preview, receipt } = projectBulkFromBoundary(state);
    assert.notEqual(receipt.previewHash, receipt.bulkHash);
    let diff = 0;
    for (let i = 0; i < preview.length; i++) {
      diff += Math.abs(preview[i] - state.scalar[i]);
    }
    assert.ok(diff > 1e-3);
  });
});

describe("projector SoT — P and h_μν", () => {
  it("g(n,n)=−1 for static observer", () => {
    assert.equal(PROJECTOR_C, 1);
    assertNormalUnit(staticObserverNormal(), g_munu);
  });

  it("projectWithNormal ≡ projectNaive spatially (flat static)", () => {
    const samples = [
      [0, 1, 2, 3],
      [5, -1, 0, 4],
      [2.5, 7, 8, 9],
    ];
    for (const v of samples) {
      const n = projectNaive(v);
      const p = projectWithNormal(v);
      assert.equal(p.x, n.x);
      assert.equal(p.y, n.y);
      assert.equal(p.z, n.z);
    }
  });

  it("h_ij = δ_ij on Minkowski t=const slice", () => {
    const h = inducedMetricHij(g_munu);
    assert.deepEqual([...h], [...flatInducedDelta()]);
    const { id } = inducedMetric3(MINKOWSKI_ETA);
    assert.equal(id, INDUCED_METRIC_IDS.FLAT_DELTA);
  });

  it("spatial distances use h, not g (timelike separation contrast)", () => {
    const dx3 = [3, 4, 0];
    const dH = spatialDistanceH(dx3, flatInducedDelta());
    assert.equal(dH, 5);
    // Full g on (dt=0, dx) equals spatial; with dt≠0 g-interval differs
    const gOnlySpace = spacetimeIntervalSquared([0, 3, 4, 0]);
    assert.equal(gOnlySpace, 25);
    const gWithTime = spacetimeIntervalSquared([10, 3, 4, 0]);
    assert.notEqual(gWithTime, 25);
  });

  it("naive alone documented insufficient", () => {
    const p = projectNaive({ t: 9, x: 1, y: 2, z: 3 });
    assert.equal(p.insufficientAlone, true);
    assert.match(p.warning, /causality|time/i);
    const d = naiveProjectDropTime({ t: 9, x: 1, y: 2, z: 3 });
    assert.equal(d.insufficientAlone, true);
  });
});

describe("EGT / EFR / architecture", () => {
  it("architecture modules export and wire", () => {
    const bulk = createBulkSpacetimeEngine({ seed: 7 });
    const bp = createBoundaryProjection();
    const enc = createHolographicEncoder({ stride: 4 });
    const ren = createEntanglementRenderer();
    assert.ok(bulk.g_mu_nu);
    assert.ok(bp.h_mu_nu);
    const egt = enc.buildEGT(bulk.state);
    const img = ren.render(egt, EFR_MODES.HEATMAP);
    assert.ok(img.rgb.length > 0);
    assert.equal(DEFAULT_ALPHA, 1.0);
    assert.equal(DEFAULT_BETA, 0.25);
  });

  it("EGT build deterministic; certified hash unchanged", () => {
    const state = createInitialCertifiedState({ seed: 7 });
    const hash0 = state.hash;
    const a = buildEGT(state, { stride: 4 });
    const b = buildEGT(state, { stride: 4 });
    assert.equal(a.hash, b.hash);
    assert.ok(a.nodes.length > 0);
    assert.ok(a.edges.length > 0);
    assert.ok(a.rho.length === a.nodes.length);
    assert.ok(a.K.length === a.nodes.length);
    assert.equal(state.hash, hash0);
  });

  it("updateEGT changes when bulk φ changes", () => {
    const state = createInitialCertifiedState({ seed: 7 });
    const e0 = buildEGT(state, { stride: 4 });
    const copy = new Float32Array(state.scalar);
    copy[0] += 1.5;
    copy[100] -= 0.8;
    const e1 = updateEGT(e0, { ...state, scalar: copy }, { stride: 4 });
    assert.notEqual(e0.hash, e1.hash);
    let rhoDiff = 0;
    for (let i = 0; i < e0.rho.length; i++) rhoDiff += Math.abs(e0.rho[i] - e1.rho[i]);
    assert.ok(rhoDiff > 1e-6 || e0.edges.some((e, i) => e.w_ij !== e1.edges[i]?.w_ij));
  });

  it("{EGT_t} length matches requested frames", () => {
    const state = createInitialCertifiedState({ seed: 3 });
    const seq = evolveEGTSequence(state, 5, { stride: 8 });
    assert.equal(seq.length, 5);
    assert.equal(seq.frames.length, 5);
  });

  it("S(A) cut-edge sum; K flat when uniform; K rises with gradient", () => {
    const nodes = [
      { id: 0, x: 0, y: 0 },
      { id: 1, x: 1, y: 0 },
      { id: 2, x: 0, y: 1 },
    ];
    // Triangle, equal weights → uniform ε → K≈0
    const uniform = {
      nodes,
      edges: [
        { i: 0, j: 1, w_ij: 1 },
        { i: 1, j: 2, w_ij: 1 },
        { i: 2, j: 0, w_ij: 1 },
      ],
      rho: new Float64Array([1, 1, 1]),
      K: new Float64Array(3),
      epsilon: new Float64Array(3),
    };
    recomputeCurvature(uniform, { alpha: 1, beta: 0.25 });
    const maxKU = Math.max(...uniform.K.map(Math.abs));
    assert.ok(maxKU < 1e-9, `uniform K should ~0, got ${maxKU}`);

    const graded = {
      nodes,
      edges: [
        { i: 0, j: 1, w_ij: 0.05 },
        { i: 1, j: 2, w_ij: 1.0 },
        { i: 2, j: 0, w_ij: 0.05 },
      ],
      rho: new Float64Array([1, 1, 1]),
      K: new Float64Array(3),
      epsilon: new Float64Array(3),
    };
    recomputeCurvature(graded, { alpha: 1, beta: 0.25 });
    const maxKG = Math.max(...graded.K.map(Math.abs));
    assert.ok(maxKG > maxKU + 1e-6);

    const S = entropyProxyS(uniform, [0]);
    // cut edges from {0}: 0-1 and 0-2
    assert.equal(S, 2);
  });

  it("BoundaryInformation + screen still work", () => {
    const state = createInitialCertifiedState({ seed: 5 });
    const hash0 = state.hash;
    const info = bulkToBoundaryInformation(state, { t: 0 });
    assert.ok(info.causalStamp && info.infoDensity);
    const { receipt } = computeBoundaryScreen(state, 0);
    assert.equal(state.hash, hash0);
    assert.ok(receipt.inducedMetricId);
  });

  it("Minkowski interval helpers", () => {
    assert.equal(minkowskiIntervalSquared({ dt: 1, dx: 1, dy: 0, dz: 0 }), 0);
    const m = inducedMetricOnSlice({ scalar: new Float32Array(4) }, 0, {
      conformal: true,
      omegaFromPhi: () => 1.1,
    });
    assert.ok(Math.abs(m.h[0] - 1.21) < 1e-12);
  });
});

function hashFloatProxy(arr) {
  let h = 0;
  for (let i = 0; i < arr.length; i++) h = (h * 31 + (arr[i] * 1e6) | 0) | 0;
  return h;
}
void hashFloatProxy;
