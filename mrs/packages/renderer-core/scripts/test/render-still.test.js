import { test } from "node:test";
import assert from "node:assert/strict";

import {
  renderStill,
  encodePNG,
  hashPromptToSeed,
  resolveSceneDescriptor,
  parseArgs,
} from "../render-still.mjs";

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readIHDR(png) {
  // signature (8) + length (4) + "IHDR" (4) → width/height as UInt32BE
  const off = 16;
  return { width: png.readUInt32BE(off), height: png.readUInt32BE(off + 4) };
}

test("parseArgs consumes prompt values that start with --", () => {
  const args = parseArgs([
    "--",
    "--prompt",
    "--weird-keyword-tesseract",
    "--seed",
    "99",
    "--width",
    "64",
    "--height",
    "48",
    "--samples",
    "4",
    "--max-depth",
    "3",
    "--output",
    "/tmp/out.png",
  ]);
  assert.equal(args.prompt, "--weird-keyword-tesseract");
  assert.equal(args.seed, "99");
  assert.equal(args.width, "64");
  assert.equal(args.height, "48");
  assert.equal(args.samples, "4");
  assert.equal(args["max-depth"], "3");
  assert.equal(args.output, "/tmp/out.png");
});

test("parseArgs keeps numeric-looking values as strings for clampInt", () => {
  const args = parseArgs(["--seed", "0", "--width", "128", "--samples", "24"]);
  assert.equal(args.seed, "0");
  assert.equal(Number(args.seed), 0);
  assert.equal(Number(args.width), 128);
  assert.equal(Number(args.samples), 24);
});

test("parseArgs treats unknown flags without values as booleans", () => {
  const args = parseArgs(["--verbose", "--output", "x.png"]);
  assert.equal(args.verbose, true);
  assert.equal(args.output, "x.png");
});

test("renderStill writes a valid PNG with requested dimensions", () => {
  const { png, provenance } = renderStill({
    prompt: "cyan tesseract",
    width: 48,
    height: 32,
    samples: 4,
    maxDepth: 3,
  });
  assert.ok(Buffer.isBuffer(png));
  assert.ok(png.subarray(0, 8).equals(PNG_SIG), "PNG signature present");
  const { width, height } = readIHDR(png);
  assert.equal(width, 48);
  assert.equal(height, 32);
  assert.equal(provenance.width, 48);
  assert.equal(provenance.height, 32);
  assert.equal(provenance.sha256.length, 64);
  assert.equal(provenance.kind, "deterministic-procedural-4d-render");
});

test("renderStill is deterministic for the same seed", () => {
  const a = renderStill({ prompt: "warm torus ring", seed: 4242, width: 40, height: 40, samples: 5 });
  const b = renderStill({ prompt: "warm torus ring", seed: 4242, width: 40, height: 40, samples: 5 });
  assert.ok(a.png.equals(b.png), "identical PNG bytes for identical seed");
  assert.equal(a.provenance.sha256, b.provenance.sha256);
});

test("different seeds produce different renders", () => {
  const a = renderStill({ prompt: "abstract", seed: 1, width: 40, height: 40, samples: 5 });
  const b = renderStill({ prompt: "abstract", seed: 2, width: 40, height: 40, samples: 5 });
  assert.notEqual(a.provenance.sha256, b.provenance.sha256);
});

test("render is not near-black (mean luminance well above blank threshold)", () => {
  const { provenance } = renderStill({ prompt: "neon lattice grid", width: 48, height: 48, samples: 6 });
  assert.ok(provenance.mean_luminance > 8, `mean luminance ${provenance.mean_luminance} should exceed 8`);
});

test("center ROI is lit (NEE — ground band alone must not pass)", () => {
  const { provenance } = renderStill({
    prompt: "cyan tesseract",
    seed: 1234,
    width: 64,
    height: 64,
    samples: 8,
    maxDepth: 4,
  });
  assert.ok(
    provenance.mean_luminance_center > 12,
    `center ROI luminance ${provenance.mean_luminance_center} should exceed 12 (got full-frame ${provenance.mean_luminance})`,
  );
});

test("prompt keywords drive scene + palette selection (procedural, not generative)", () => {
  const seed = hashPromptToSeed("tesseract");
  const d1 = resolveSceneDescriptor({ prompt: "a glowing tesseract hypercube", seed });
  assert.equal(d1.scene, "tesseract-vertices");
  const d2 = resolveSceneDescriptor({ prompt: "warm torus ring", seed });
  assert.equal(d2.scene, "torus-ring");
  assert.equal(d2.palette.name, "warm");
});

test("explicit scene + palette overrides win", () => {
  const d = resolveSceneDescriptor({
    prompt: "anything",
    scene: "lattice-grid",
    palette: "gold",
    seed: 7,
  });
  assert.equal(d.scene, "lattice-grid");
  assert.equal(d.palette.name, "gold");
});

test("encodePNG accepts a plain Uint8Array", () => {
  const w = 2;
  const h = 2;
  const rgba = new Uint8Array(w * h * 4).fill(200);
  const png = encodePNG(w, h, rgba);
  assert.ok(png.subarray(0, 8).equals(PNG_SIG));
  const dims = readIHDR(png);
  assert.equal(dims.width, 2);
  assert.equal(dims.height, 2);
});
