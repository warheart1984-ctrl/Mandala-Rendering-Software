import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  compareImages,
  maxPixelDelta,
  mse,
  psnr,
  ssim,
} from "../../src/render/rt4d/compare/imageMetrics.js";

import {
  generateReplayReceipt,
  hashSceneConfig,
  hashIntent,
  hashExecution,
  verifyReplayReceipt,
} from "../../src/render/rt4d/compare/replayReceipt.js";

import {
  probeWebGpuAvailability,
  probeVendorGpuHonesty,
  printParitySceneConfig,
} from "../../src/render/rt4d/compare/printParity.js";

// ── Helpers ────────────────────────────────────────────────────────────

function makeRgba(width, height, fillFn) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b] = fillFn(x, y);
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

const W = 8;
const H = 8;

// ── imageMetrics ───────────────────────────────────────────────────────

describe("imageMetrics — identical images", () => {
  const img = makeRgba(W, H, (x, y) => [128, 64, 32]);

  test("maxPixelDelta is 0 for identical images", () => {
    const result = maxPixelDelta(img, img, W, H);
    assert.equal(result.maxDelta, 0);
  });

  test("mse is 0 for identical images", () => {
    assert.equal(mse(img, img, W, H), 0);
  });

  test("psnr is Infinity for identical images", () => {
    assert.equal(psnr(img, img, W, H), Infinity);
  });

  test("ssim is 1 for identical images", () => {
    assert.ok(Math.abs(ssim(img, img, W, H) - 1) < 0.001);
  });
});

describe("imageMetrics — different images", () => {
  const imgA = makeRgba(W, H, () => [255, 0, 0]);
  const imgB = makeRgba(W, H, () => [0, 0, 255]);

  test("maxPixelDelta reports large difference", () => {
    const result = maxPixelDelta(imgA, imgB, W, H);
    assert.ok(result.maxDelta > 0.5, `expected large delta, got ${result.maxDelta}`);
    assert.ok(result.perChannelMax[0] > 0.5, "red channel should differ");
    assert.ok(result.perChannelMax[2] > 0.5, "blue channel should differ");
  });

  test("mse is non-zero", () => {
    const err = mse(imgA, imgB, W, H);
    assert.ok(err > 0, `expected positive MSE, got ${err}`);
  });

  test("psnr is finite", () => {
    const val = psnr(imgA, imgB, W, H);
    assert.ok(val < Infinity);
    assert.ok(val > 0);
  });

  test("ssim is less than 1", () => {
    const val = ssim(imgA, imgB, W, H);
    assert.ok(val < 1, `expected SSIM < 1, got ${val}`);
  });
});

describe("imageMetrics — near-identical images", () => {
  const imgA = makeRgba(W, H, () => [128, 128, 128]);
  const imgB = makeRgba(W, H, () => [130, 128, 128]);

  test("maxPixelDelta is small for near-identical", () => {
    const result = maxPixelDelta(imgA, imgB, W, H);
    assert.ok(result.maxDelta < 0.05, `expected small delta, got ${result.maxDelta}`);
  });
});

describe("compareImages — threshold evaluation", () => {
  const img = makeRgba(W, H, () => [128, 128, 128]);
  const thresholds = { maxPixelDelta: 0.01, mse: 0.0001, ssim: 0.99 };

  test("returns pass for identical images", () => {
    const result = compareImages(img, img, W, H, thresholds);
    assert.equal(result.status, "pass");
    assert.equal(result.maxPixelDelta, 0);
    assert.equal(result.mse, 0);
  });

  test("returns fail when images differ", () => {
    const img2 = makeRgba(W, H, () => [200, 128, 128]);
    const result = compareImages(img, img2, W, H, thresholds);
    assert.equal(result.status, "fail");
  });
});

// ── replayReceipt ──────────────────────────────────────────────────────

describe("replayReceipt — hashSceneConfig", () => {
  test("returns deterministic hash", () => {
    const cfg = { sceneId: "test", seed: 42, width: 64 };
    const h1 = hashSceneConfig(cfg);
    const h2 = hashSceneConfig(cfg);
    assert.equal(h1, h2);
    assert.equal(h1.length, 64); // SHA-256 hex
  });

  test("returns different hash for different config", () => {
    const h1 = hashSceneConfig({ sceneId: "a", seed: 1 });
    const h2 = hashSceneConfig({ sceneId: "b", seed: 1 });
    assert.notEqual(h1, h2);
  });
});

describe("replayReceipt — hashIntent", () => {
  test("returns deterministic hash", () => {
    const cfg = { sceneId: "test", seed: 42, width: 64, height: 64, spp: 8, glbPath: "x.glb", camera: {} };
    const h1 = hashIntent(cfg, "1.0.0");
    const h2 = hashIntent(cfg, "1.0.0");
    assert.equal(h1, h2);
  });
});

describe("replayReceipt — hashExecution", () => {
  test("returns deterministic hash", () => {
    const buf = Buffer.from([1, 2, 3, 4]);
    const h1 = hashExecution({ backendName: "CPU", rendererVersion: "1.0", pngBuffer: buf, provenance: {} });
    const h2 = hashExecution({ backendName: "CPU", rendererVersion: "1.0", pngBuffer: buf, provenance: {} });
    assert.equal(h1, h2);
  });

  test("differs for different PNG data", () => {
    const buf1 = Buffer.from([1, 2, 3, 4]);
    const buf2 = Buffer.from([1, 2, 3, 5]);
    const h1 = hashExecution({ backendName: "CPU", rendererVersion: "1.0", pngBuffer: buf1, provenance: {} });
    const h2 = hashExecution({ backendName: "CPU", rendererVersion: "1.0", pngBuffer: buf2, provenance: {} });
    assert.notEqual(h1, h2);
  });
});

describe("replayReceipt — generateReplayReceipt", () => {
  const cfg = {
    sceneId: "test-scene",
    seed: 42,
    width: 4,
    height: 4,
    spp: 1,
    glbPath: "test.glb",
    thresholds: { maxPixelDelta: 0.01 },
  };
  const pngA = Buffer.from([137, 80, 78, 71, 0, 0, 0, 0]);
  const pngB = Buffer.from([137, 80, 78, 71, 0, 0, 0, 1]);

  test("generates a complete receipt", () => {
    const receipt = generateReplayReceipt({
      sceneConfig: cfg,
      cpu: { pngBuffer: pngA, provenance: { backend: "CPU" }, rendererVersion: "1.0.0" },
      gpu: { pngBuffer: pngB, provenance: { backend: "GPU" }, rendererVersion: "1.0.0" },
      comparison: { maxPixelDelta: 0.005, mse: 0.00001, ssim: 0.995, status: "pass" },
    });

    assert.ok(receipt.replayId);
    assert.equal(typeof receipt.sceneConfigHash, "string");
    assert.equal(receipt.sceneConfigHash.length, 64);
    assert.equal(typeof receipt.intentHash, "string");
    assert.equal(receipt.backends.cpu.name, "PathTracer4D_CPU");
    assert.equal(receipt.backends.gpu.name, "PathTracer4D_GPU");
    assert.equal(receipt.backends.cpu.pngChecksum.length, 64);
    assert.equal(receipt.backends.gpu.pngChecksum.length, 64);
    assert.equal(receipt.comparison.status, "pass");
    assert.equal(receipt.comparison.maxPixelDelta, 0.005);
  });
});

describe("replayReceipt — verifyReplayReceipt", () => {
  const cfg = {
    sceneId: "verify-test",
    seed: 99,
    width: 8,
    height: 8,
    spp: 4,
    glbPath: "verify.glb",
    camera: {},
    thresholds: {},
  };
  const png = Buffer.from([137, 80, 78, 71, 42]);

  test("verifies a valid receipt", () => {
    const receipt = generateReplayReceipt({
      sceneConfig: cfg,
      cpu: { pngBuffer: png, provenance: {}, rendererVersion: "1.0.0" },
      gpu: { pngBuffer: png, provenance: {}, rendererVersion: "1.0.0" },
      comparison: { maxPixelDelta: 0, mse: 0, ssim: 1, status: "pass" },
    });

    const result = verifyReplayReceipt(receipt, cfg);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  test("detects sceneConfigHash mismatch", () => {
    const receipt = generateReplayReceipt({
      sceneConfig: cfg,
      cpu: { pngBuffer: png, provenance: {}, rendererVersion: "1.0.0" },
      gpu: { pngBuffer: png, provenance: {}, rendererVersion: "1.0.0" },
      comparison: { maxPixelDelta: 0, mse: 0, ssim: 1, status: "pass" },
    });

    // Tamper with sceneConfig
    const tamperedCfg = { ...cfg, seed: 777 };
    const result = verifyReplayReceipt(receipt, tamperedCfg);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes("sceneConfigHash mismatch"));
  });
});

// ── print-oriented parity (Task 4) ─────────────────────────────────────

describe("printParity — WebGPU probe honesty", () => {
  test("Node without navigator.gpu reports unavailable (skip ≠ pass)", () => {
    const probe = probeWebGpuAvailability();
    assert.equal(probe.available, false);
    assert.equal(probe.statusTag, "partial");
    assert.match(probe.reason, /skip/);
  });

  test("vendor honesty map marks CUDA/HIP print absent and cuTile N/A", () => {
    const honesty = probeVendorGpuHonesty();
    assert.equal(honesty.cudaPrintPath.statusTag, "absent");
    assert.equal(honesty.hipPrintPath.statusTag, "absent");
    assert.equal(honesty.cutile.statusTag, "na");
    assert.equal(honesty.nim.statusTag, "assist");
    assert.equal(honesty.nvenc.statusTag, "partial");
    assert.equal(honesty.webgpu.available, false);
  });
});

describe("printParity — mock GPU receipt verifies", () => {
  test("CPU vs mock-identical GPU plate yields valid pass receipt", () => {
    const cfg = printParitySceneConfig();
    const rgba = makeRgba(cfg.width, cfg.height, (x, y) => [
      (x * 17) & 255,
      (y * 13) & 255,
      90,
    ]);
    const png = Buffer.from(rgba);
    const comparison = compareImages(
      rgba,
      rgba,
      cfg.width,
      cfg.height,
      cfg.thresholds,
    );
    assert.equal(comparison.status, "pass");

    const receipt = generateReplayReceipt({
      sceneConfig: cfg,
      cpu: {
        pngBuffer: png,
        provenance: { backend: "PathTracer4D_CPU", seed: cfg.seed },
        rendererVersion: "1.1.0",
      },
      gpu: {
        pngBuffer: png,
        provenance: {
          backend: "PathTracer4D_GPU_MOCK",
          seed: cfg.seed,
          note: "mock identity — not live WebGPU",
        },
        rendererVersion: "1.1.0",
      },
      comparison,
      replayId: `receipt-${cfg.sceneId}-${cfg.seed}`,
    });

    const verified = verifyReplayReceipt(receipt, cfg);
    assert.equal(verified.valid, true);
    assert.equal(receipt.comparison.status, "pass");
    assert.equal(receipt.replayId, `receipt-${cfg.sceneId}-${cfg.seed}`);
  });

  test("does not claim live WebGPU pass when probe unavailable", () => {
    const probe = probeWebGpuAvailability();
    assert.equal(probe.available, false);
    // Harness may still validate receipt schema with mocks; live GPU is partial.
    assert.notEqual(probe.statusTag, "enforced");
  });
});
