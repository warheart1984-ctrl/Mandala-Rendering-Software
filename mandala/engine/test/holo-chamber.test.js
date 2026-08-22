import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EFR_MODES, createEntanglementRenderer } from "../../holography/index.mjs";
import { runHoloChamber, HOLO_CHAMBER_STATUS } from "../chamber/holo-loop.mjs";
import {
  BIN_FRAME_CODEC,
  BIN_FRAME_HEADER_BYTES,
  BIN_FLOATS_PER_NODE,
  encodeBinFrame,
  parseBinFrame,
  buildBinHeader,
  RHO_SPARSE,
} from "../chamber/bin-frame.mjs";
import {
  selectSparseKeepMask,
  compactEgtByMask,
} from "../chamber/sparse-cull.mjs";
import {
  spawnMythar,
  constitutionalFrameStep,
  detectEntanglementJoints,
  JOINT_ALIGN_COS,
} from "../../../character/holography/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("bin-frame roundtrip", () => {
  it("header packs count/t as u32 and h_ij as f32[9] without overlap", () => {
    const h = buildBinHeader(7, 42, [1, 0, 0, 0, 2, 0, 0, 0, 3]);
    const u32 = new Uint32Array(h, 0, 2);
    const hij = new Float32Array(h, 8, 9);
    assert.equal(u32[0], 7);
    assert.equal(u32[1], 42);
    assert.equal(hij[0], 1);
    assert.equal(hij[4], 2);
    assert.equal(hij[8], 3);
    assert.equal(h.byteLength, BIN_FRAME_HEADER_BYTES);
  });

  it("encode then parse preserves count and float lengths", () => {
    const count = 4;
    const buffers = {
      count,
      h_ij: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
      position: new Float32Array(count * 3).map((_, i) => i * 0.1),
      entanglementDensity: Float32Array.from([0.9, 0.01, 0.5, 0.02]),
      entanglementDirection: new Float32Array(count * 3),
      curvature: new Float32Array(count),
      entanglementWeight: new Float32Array(count),
      governance: new Float32Array(count * 4),
      baseNormal: new Float32Array(count * 3),
    };
    const enc = encodeBinFrame({ buffers, t: 3, sparse: true, vacuumRho: 0.05 });
    assert.ok(enc.sparseApplied);
    assert.equal(enc.count, 2);
    const parsed = parseBinFrame(enc.buffer);
    assert.equal(parsed.count, 2);
    assert.equal(parsed.t, 3);
    assert.equal(parsed.position.length, 2 * 3);
    assert.equal(parsed.entanglementDensity.length, 2);
    assert.equal(parsed.governance.length, 2 * 4);
    assert.equal(
      parsed.byteLength,
      BIN_FRAME_HEADER_BYTES + 2 * BIN_FLOATS_PER_NODE * 4,
    );
    assert.equal(parsed.codec, BIN_FRAME_CODEC);
  });
});

describe("holo chamber loop", () => {
  it("COMPOSITE is the record mode and not a heatmap alias", () => {
    assert.equal(EFR_MODES.COMPOSITE, "COMPOSITE");
    assert.notEqual(EFR_MODES.COMPOSITE, EFR_MODES.HEATMAP);
    assert.notEqual(EFR_MODES.COMPOSITE, EFR_MODES.COMBINED);
    const r = createEntanglementRenderer({ mode: "composite" });
    assert.equal(r.mode, EFR_MODES.COMPOSITE);
  });

  it("walk primitive moves leg ρ; joints use 60° d-hat flip", () => {
    const spawned = spawnMythar({ individualId: "walk-t", synthesizeBulk: true });
    const a = constitutionalFrameStep(spawned.egt, "walk", 0, { amp: 0.12 });
    const b = constitutionalFrameStep(a.egt, "walk", 0.25, { amp: 0.12 });
    let d = 0;
    for (let i = 0; i < a.egt.rho.length; i++) d += Math.abs(a.egt.rho[i] - b.egt.rho[i]);
    assert.ok(d > 1e-6, "walk should change ρ");
    assert.ok(!a.trace.stages.stub, "walk is not a stub");
    const joints = detectEntanglementJoints(b.egt);
    assert.ok(JOINT_ALIGN_COS > 0.49 && JOINT_ALIGN_COS < 0.51);
    assert.ok(Array.isArray(joints));
  });

  it("default --holo path writes raw-float32 .bin + meta.json + watch.html", async () => {
    const outDir = join(__dirname, "../../../output/simulation/holo-chamber-bin-test");
    const r = await runHoloChamber({
      sceneCard: { id: "holo-bin-test", name: "holo-bin-test" },
      outDir,
      creature: "Mythar",
      record: "composite",
      durationSec: 0.25,
      fps: 8,
      width: 96,
      height: 128,
      seed: 21,
      vision: false,
    });
    assert.equal(r.receipt.status, HOLO_CHAMBER_STATUS);
    assert.equal(r.codec, BIN_FRAME_CODEC);
    assert.equal(r.receipt.codec, BIN_FRAME_CODEC);
    assert.equal(r.receipt.pngEncode, false);
    assert.equal(r.receipt.capsulesSkipped, true);
    assert.equal(r.receipt.tags.movieLaneOwnsTime, false);
    assert.equal(r.receipt.tags.gpuThreeRaster, "declared");
    assert.equal(r.receipt.tags.binStreaming, "partial");
    assert.equal(r.receipt.tags.sparseRho, "partial");
    assert.ok(Number.isFinite(r.receipt.genFpsEstimate));
    assert.ok(r.receipt.timing);
    assert.ok(Number.isFinite(r.receipt.timing.end_to_end_ms));
    assert.ok(Number.isFinite(r.receipt.timing.streaming_io_ms));
    assert.equal(r.receipt.timing.shader_fps, "declared");
    assert.ok(existsSync(join(outDir, "meta.json")));
    assert.ok(existsSync(join(outDir, "watch.html")));
    assert.ok(existsSync(join(outDir, "shaders", "holographic.vert")));
    const meta = JSON.parse(readFileSync(join(outDir, "meta.json"), "utf8"));
    assert.equal(meta.codec, BIN_FRAME_CODEC);
    assert.equal(meta.sparseRhoThreshold, RHO_SPARSE);
    assert.ok(meta.nodeCountFull >= meta.nodeCountSparse);
    const bins = readdirSync(join(outDir, "frames")).filter((f) => f.endsWith(".bin"));
    assert.ok(bins.length >= 2);
    const parsed = parseBinFrame(readFileSync(join(outDir, "frames", bins[0])));
    assert.ok(parsed.count >= 0);
    assert.equal(parsed.t, 0);
    assert.ok(r.ok);
  });

  it("sparse cull reduces count vs full; ρ=0 excluded unless structural", () => {
    const n = 6;
    const egt = {
      nodes: Array.from({ length: n }, (_, i) => ({
        id: i,
        position: { x: i, y: 0, z: 0 },
      })),
      rho: Float64Array.from([0, 0.9, 0.01, 0.2, 0, 0.8]),
      K: Float64Array.from([0, 0.1, 0, 0.5, 0, 0.1]),
      edges: [
        { i: 1, j: 3, w_ij: 0.05 },
        { i: 3, j: 5, w_ij: 0.2 }, // keeps 3 and 5 structural
      ],
    };
    const keep = selectSparseKeepMask(egt, null);
    assert.equal(keep[0], 0, "ρ=0 K=0 non-structural excluded");
    assert.equal(keep[1], 1);
    assert.equal(keep[2], 0, "ρ=0.01 below thresh, low K");
    assert.equal(keep[3], 1, "K>0.3 or structural");
    assert.equal(keep[4], 0);
    assert.equal(keep[5], 1);
    const { nodeCountFull, nodeCountSparse, egt: c } = compactEgtByMask(egt, keep);
    assert.equal(nodeCountFull, 6);
    assert.ok(nodeCountSparse < nodeCountFull);
    assert.equal(c.nodes.length, nodeCountSparse);
    assert.deepEqual(Array.from(c.rho), [0.9, 0.2, 0.8]);
  });

  it("--record-png still writes PNG frames for regression", async () => {
    const outDir = join(__dirname, "../../../output/simulation/holo-chamber-png-test");
    const r = await runHoloChamber({
      sceneCard: { id: "holo-png-test", name: "holo-png-test" },
      outDir,
      creature: "Mythar",
      record: "composite",
      durationSec: 0.25,
      fps: 8,
      width: 96,
      height: 128,
      seed: 21,
      recordPng: true,
      vision: false,
    });
    assert.equal(r.receipt.pngEncode, true);
    assert.equal(r.receipt.codec, "png");
    assert.ok(existsSync(join(outDir, "frames", r.receipt.artifacts.frames[0])));
    assert.ok(r.receipt.artifacts.frames[0].endsWith(".png"));
    assert.ok(r.ok);
  });
});
