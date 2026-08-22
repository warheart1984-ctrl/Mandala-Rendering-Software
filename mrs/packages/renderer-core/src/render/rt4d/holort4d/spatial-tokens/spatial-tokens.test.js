/**
 * Spatial token tests — determinism, 16×16 grid, depth bins, Holo-Scheme V1, formatForLLM.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SPATIAL_TOKEN_SCHEME,
  SPATIAL_TOKEN_STATUS,
  tokenizeFromDepthGrid,
  hashSpatialToken,
  faceRigFromLandmarkXYZ,
  canonicalTokenJson,
  buildHoloSchemeV1,
  hashHoloScheme,
  HOLO_SCHEME_AUTH,
  formatForLLM,
  formatHoloSchemeForLLM,
} from "./index.js";

function rampDepth(w, h) {
  const d = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      d[y * w + x] = (x + y) / (w + h);
    }
  }
  return d;
}

describe("spatial-tokens HoloRT4D-Spatial-V1", () => {
  it("exports honest status tags", () => {
    assert.equal(SPATIAL_TOKEN_SCHEME, "HoloRT4D-Spatial-V1");
    assert.equal(SPATIAL_TOKEN_STATUS.tokenizeFromDepthGrid, "enforced");
    assert.equal(SPATIAL_TOKEN_STATUS.holoSchemeV1, "enforced");
    assert.equal(SPATIAL_TOKEN_STATUS.imageBase64ToDepth, "declared");
    assert.equal(SPATIAL_TOKEN_STATUS.billingUsdPerCall, "declared");
    assert.equal(SPATIAL_TOKEN_STATUS.metersCalibration, "declared");
  });

  it("partitions into 16×16 = 256 cells", () => {
    const depth = rampDepth(64, 64);
    const token = tokenizeFromDepthGrid(depth, { width: 64, height: 64, resolution: 16 });
    assert.equal(token.resolution, 16);
    assert.equal(token.cells.length, 256);
    assert.equal(token.scheme, SPATIAL_TOKEN_SCHEME);
  });

  it("supports 8×8 = 64 cells", () => {
    const depth = rampDepth(32, 32);
    const token = tokenizeFromDepthGrid(depth, { width: 32, height: 32, resolution: 8 });
    assert.equal(token.cells.length, 64);
  });

  it("bins depth to 0–255", () => {
    const depth = rampDepth(32, 32);
    const token = tokenizeFromDepthGrid(depth, { width: 32, height: 32, resolution: 16 });
    for (const c of token.cells) {
      assert.ok(c.depth >= 0 && c.depth <= 255);
      assert.equal(c.depth, c.depth | 0);
    }
  });

  it("produces finite normals and curvature", () => {
    const depth = rampDepth(48, 48);
    const token = tokenizeFromDepthGrid(depth, { width: 48, height: 48, resolution: 16 });
    for (const c of token.cells) {
      assert.ok(Number.isFinite(c.curvature));
      assert.equal(c.normal.length, 3);
      for (const n of c.normal) assert.ok(Number.isFinite(n));
      const len = Math.hypot(c.normal[0], c.normal[1], c.normal[2]);
      assert.ok(Math.abs(len - 1) < 1e-5 || len === 0);
    }
  });

  it("is deterministic: same depth → same hash", () => {
    const depth = rampDepth(40, 40);
    const a = tokenizeFromDepthGrid(depth, { width: 40, height: 40, resolution: 16 });
    const b = tokenizeFromDepthGrid(depth, { width: 40, height: 40, resolution: 16 });
    assert.equal(hashSpatialToken(a), hashSpatialToken(b));
    assert.equal(canonicalTokenJson(a), canonicalTokenJson(b));
  });

  it("changes hash when depth changes", () => {
    const d1 = rampDepth(40, 40);
    const d2 = rampDepth(40, 40);
    d2[0] = 9;
    const h1 = hashSpatialToken(tokenizeFromDepthGrid(d1, { width: 40, height: 40, resolution: 16 }));
    const h2 = hashSpatialToken(tokenizeFromDepthGrid(d2, { width: 40, height: 40, resolution: 16 }));
    assert.notEqual(h1, h2);
  });

  it("attaches face object labels when FaceRig provided (partial)", () => {
    const depth = rampDepth(32, 32);
    const xyz = new Float32Array(68 * 3);
    for (let i = 0; i < 68; i++) {
      xyz[i * 3] = (i % 8) / 8 * 2 - 1;
      xyz[i * 3 + 1] = Math.floor(i / 8) / 9 * 2 - 1;
      xyz[i * 3 + 2] = 0.1;
    }
    const faceRig = faceRigFromLandmarkXYZ(xyz);
    const token = tokenizeFromDepthGrid(depth, {
      width: 32,
      height: 32,
      resolution: 16,
      faceRig,
    });
    const labeled = token.cells.filter((c) => c.object);
    assert.ok(labeled.length > 0);
    assert.ok(labeled.every((c) => String(c.object).startsWith("face.")));
  });

  it("attaches motion when prevDepth provided (partial)", () => {
    const cur = rampDepth(32, 32);
    const prev = rampDepth(32, 32);
    for (let i = 0; i < prev.length; i++) prev[i] *= 0.5;
    const token = tokenizeFromDepthGrid(cur, {
      width: 32,
      height: 32,
      resolution: 16,
      prevDepth: prev,
    });
    const withMotion = token.cells.filter((c) => c.motion);
    assert.ok(withMotion.length > 0);
    for (const c of withMotion) {
      assert.ok(Number.isFinite(c.motion.dx));
      assert.ok(Number.isFinite(c.motion.dy));
      assert.ok(Number.isFinite(c.motion.mag));
    }
  });

  it("formatForLLM is deterministic", () => {
    const depth = rampDepth(32, 32);
    const token = tokenizeFromDepthGrid(depth, { width: 32, height: 32, resolution: 8 });
    const a = formatForLLM(token);
    const b = formatForLLM(token);
    assert.equal(a, b);
    assert.match(a, /^SCHEME HoloRT4D-Spatial-V1 hash=sha256:[a-f0-9]{64}/);
    assert.match(a, /GRID 8x8 depth_bins=256/);
    assert.match(a, /CELL\(0,0\):/);
  });
});

describe("Holo-Scheme V1", () => {
  it("builds 8×8 grid of length 64 with bins in 0–255", () => {
    const depth = rampDepth(64, 64);
    const scheme = buildHoloSchemeV1({ depthGrid: depth, width: 64, height: 64 });
    assert.equal(scheme.spatial_grid_8x8.length, 8);
    assert.ok(scheme.spatial_grid_8x8.every((row) => row.length === 8));
    const flat = scheme.spatial_grid_8x8.flat();
    assert.equal(flat.length, 64);
    for (const v of flat) {
      assert.ok(v >= 0 && v <= 255);
      assert.equal(v, v | 0);
    }
  });

  it("always sets scheme_auth constant and unit_cost", () => {
    const depth = rampDepth(32, 32);
    const scheme = buildHoloSchemeV1({ depthGrid: depth, width: 32, height: 32 });
    assert.equal(scheme.scheme_auth, HOLO_SCHEME_AUTH);
    assert.equal(scheme.scheme_auth, "VERIFIED_MATH_ENGINE_RX580");
    assert.equal(scheme.unit_cost, "$1.00");
    assert.match(scheme.execution_instruction, /Z-numbers/);
  });

  it("hash is deterministic", () => {
    const depth = rampDepth(48, 48);
    const a = buildHoloSchemeV1({ depthGrid: depth, width: 48, height: 48 });
    const b = buildHoloSchemeV1({ depthGrid: depth, width: 48, height: 48 });
    assert.equal(a.hash, b.hash);
    assert.equal(a.hash, hashHoloScheme(a));
    assert.match(a.hash, /^[a-f0-9]{64}$/);
  });

  it("hash changes when depth changes", () => {
    const d1 = rampDepth(32, 32);
    const d2 = rampDepth(32, 32);
    d2[100] = 9;
    const h1 = buildHoloSchemeV1({ depthGrid: d1, width: 32, height: 32 }).hash;
    const h2 = buildHoloSchemeV1({ depthGrid: d2, width: 32, height: 32 }).hash;
    assert.notEqual(h1, h2);
  });

  it("formatHoloSchemeForLLM is deterministic", () => {
    const depth = rampDepth(32, 32);
    const scheme = buildHoloSchemeV1({ depthGrid: depth, width: 32, height: 32 });
    assert.equal(formatHoloSchemeForLLM(scheme), formatHoloSchemeForLLM(scheme));
    assert.equal(formatForLLM(scheme), formatHoloSchemeForLLM(scheme));
  });

  it("uses faceRig landmarks when provided (partial)", () => {
    const depth = rampDepth(32, 32);
    const xyz = new Float32Array(68 * 3);
    for (let i = 0; i < 68; i++) {
      xyz[i * 3] = 0;
      xyz[i * 3 + 1] = 0;
      xyz[i * 3 + 2] = 0.2 + (i === 30 ? 0.5 : 0);
    }
    const faceRig = faceRigFromLandmarkXYZ(xyz);
    const scheme = buildHoloSchemeV1({
      depthGrid: depth,
      width: 32,
      height: 32,
      faceRig,
    });
    assert.equal(scheme.subject_analysis.face_topography.source, "face_rig_landmarks");
    assert.equal(scheme.subject_analysis.face_topography.status, "partial");
    assert.ok(scheme.subject_analysis.face_topography.realism_index <= 0.98);
  });
});
