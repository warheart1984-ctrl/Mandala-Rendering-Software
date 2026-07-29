import { test } from "node:test";
import assert from "node:assert/strict";

import {
  renderStill,
  encodePNG,
  hashPromptToSeed,
  resolveSceneDescriptor,
  parseArgs,
  TESSERACT_EDGES,
  TESSERACT_RING_SPECS,
  tesseractProjectedVertices,
  beamChain,
  ringNodesTouch,
} from "../render-still.mjs";
import { Camera4D } from "../../src/render/rt4d/camera/Camera4D.js";
import { Hypersphere } from "../../src/render/rt4d/geometry/hypersurface.js";

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
  assert.equal(d1.scene, "tesseract-lattice");
  const d2 = resolveSceneDescriptor({ prompt: "warm torus ring", seed });
  assert.equal(d2.scene, "torus-ring");
  assert.equal(d2.palette.name, "warm");
});

test("legacy tesseract-vertices alias resolves to tesseract-lattice", () => {
  const d = resolveSceneDescriptor({
    prompt: "anything",
    scene: "tesseract-vertices",
    seed: 7,
  });
  assert.equal(d.scene, "tesseract-lattice");
});

test("tesseract keywords outrank mandala / neural-lattice in the same prompt", () => {
  // Exact user-reported prompt shape: tesseract subject inside a radial mandala grid.
  // The lattice archetype owns the composition (with its own ring accents); a
  // generic neural-lattice would drop the 8-cell entirely.
  const prompt =
    "A floating tesseract made of neon-blue lattice beams, suspended inside a radial " +
    "mandala grid. The core emits a pulsing white energy sphere, illuminating the structure " +
    "with studio-grade rim lighting. Surrounding geometry forms concentric fractal rings, " +
    "each with reflective metallic surfaces and soft volumetric glow.";
  assert.equal(
    resolveSceneDescriptor({ prompt, seed: hashPromptToSeed(prompt) }).scene,
    "tesseract-lattice",
  );
  // Word-anchored: "Rendering" must not steal via infix `ring`, and tesseract
  // still wins when both families are present as whole words.
  assert.equal(
    resolveSceneDescriptor({
      prompt: "tesseract neural-lattice mandala Rendering System",
      seed: 11,
    }).scene,
    "tesseract-lattice",
  );
});

test("creature battle prompts select the procedural mythic tableau before tesseract accents", () => {
  const prompt = "mythic dragon battle on a mountain with wolves and tesseract-light cores";
  const descriptor = resolveSceneDescriptor({ prompt, seed: hashPromptToSeed(prompt) });
  assert.equal(descriptor.scene, "mythic-tableau");
});

test("keywords only match at word starts (no infix hijacking)", () => {
  // "Rendering" must not match `ring`. With neural-lattice keywords present,
  // the dedicated archetype wins over plain lattice-grid.
  const neural = "a luminous neural lattice, Rendering System plate";
  assert.equal(
    resolveSceneDescriptor({ prompt: neural, seed: hashPromptToSeed(neural) }).scene,
    "neural-lattice",
  );
  // Plain lattice without mandala/neural/glyph cues still selects lattice-grid,
  // and "Rendering" alone must not force torus-ring via infix `ring`.
  const plainLattice = "a luminous lattice, Rendering System plate";
  assert.equal(
    resolveSceneDescriptor({ prompt: plainLattice, seed: hashPromptToSeed(plainLattice) }).scene,
    "lattice-grid",
  );
  // "lattice" must not match `ice` and force the cool palette.
  assert.notEqual(
    resolveSceneDescriptor({ prompt: plainLattice, seed: 11 }).palette.name,
    "cool",
  );
  // "machine" must not match `shine` and force a glossy material.
  assert.equal(
    resolveSceneDescriptor({ prompt: "a lattice machine", seed: 11 }).materialType,
    "lambertian",
  );
  // Suffixed forms still match: rings / lattices / orbital / crystalline.
  assert.equal(
    resolveSceneDescriptor({ prompt: "concentric rings", seed: 11 }).scene,
    "torus-ring",
  );
  assert.equal(
    resolveSceneDescriptor({ prompt: "crystalline glyphs", seed: 11 }).materialType,
    "ggx",
  );
  assert.equal(
    resolveSceneDescriptor({ prompt: "crystalline glyphs", seed: 11 }).scene,
    "neural-lattice",
  );
});

test("mandala / neural-lattice prompts select the neural-lattice archetype", () => {
  const prompt =
    "A Sovereign-grade Mandala Rendering System scene: a luminous neural lattice " +
    "suspended in deep space, geometric glyphs rotating around a central energy core, " +
    "architected like a constitutional machine.";
  assert.equal(
    resolveSceneDescriptor({ prompt, seed: hashPromptToSeed(prompt) }).scene,
    "neural-lattice",
  );
  assert.equal(
    resolveSceneDescriptor({ prompt: "cyan neural-lattice circuit", seed: 7 }).scene,
    "neural-lattice",
  );
  assert.equal(
    resolveSceneDescriptor({ prompt: "simple mandala still", seed: 7 }).scene,
    "neural-lattice",
  );
});

test("neural-lattice archetype renders above blank luminance", () => {
  const { provenance } = renderStill({
    prompt: "sovereign mandala neural lattice energy core",
    seed: 4242,
    width: 48,
    height: 48,
    samples: 6,
    maxDepth: 3,
  });
  assert.equal(provenance.scene, "neural-lattice");
  assert.ok(
    provenance.mean_luminance > 8,
    `mean luminance ${provenance.mean_luminance} should exceed 8`,
  );
});

test("tesseract lattice has 16 vertices, 32 edges, and a bounded beam chain", () => {
  assert.equal(TESSERACT_EDGES.length, 32);
  for (const [i, j] of TESSERACT_EDGES) {
    const d = i ^ j;
    assert.ok((d & (d - 1)) === 0, `edge ${i}-${j} must differ in exactly one bit`);
  }
  const verts = tesseractProjectedVertices();
  assert.equal(verts.length, 16);
  // Every projected vertex sits on the camera's central W-slice.
  for (const v of verts) assert.equal(v.w, 0);

  const a = verts[0];
  const b = verts[1];
  const chain = beamChain(a, b, 0.1, 0.1);
  assert.ok(chain.length >= 2);
  assert.ok(chain.length <= 64, `beam chain length ${chain.length} must stay bounded`);
  assert.ok(chain.every((p) => p instanceof Hypersphere));
  // Endpoints land on the segment endpoints (within float noise).
  assert.ok(Math.abs(chain[0].center.x - a.x) < 1e-9);
  assert.ok(Math.abs(chain[chain.length - 1].center.x - b.x) < 1e-9);
});

test("tesseract mandala rings satisfy the node-touch continuity inequality", () => {
  assert.ok(TESSERACT_RING_SPECS.length >= 2);
  let expectedNodes = 0;
  for (const { radius, count, nodeRadius } of TESSERACT_RING_SPECS) {
    const need = radius * Math.sin(Math.PI / count);
    assert.ok(
      ringNodesTouch(radius, count, nodeRadius),
      `ring R=${radius} n=${count} r=${nodeRadius}: need >= ${need.toFixed(4)}`,
    );
    // Prefer denser counts over ballooning nodeRadius (review: increase n).
    assert.ok(count >= 50, `ring count ${count} too sparse for continuity at R=${radius}`);
    expectedNodes += count;
  }
  assert.equal(expectedNodes, 52 + 76);
  // Helper sanity: the prior dotted 32/40 specs fail the same predicate.
  assert.equal(ringNodesTouch(2.05, 32, 0.13), false);
  assert.equal(ringNodesTouch(2.55, 40, 0.11), false);
});

test("tesseract-lattice archetype reports composition and stays above blank luminance", () => {
  const exactPrompt =
    "A floating tesseract made of neon-blue lattice beams, suspended inside a radial " +
    "mandala grid. The core emits a pulsing white energy sphere, illuminating the structure " +
    "with studio-grade rim lighting. Surrounding geometry forms concentric fractal rings, " +
    "each with reflective metallic surfaces and soft volumetric glow.";
  assert.equal(
    resolveSceneDescriptor({ prompt: exactPrompt, seed: 526562436 }).scene,
    "tesseract-lattice",
  );

  const { provenance } = renderStill({
    prompt: exactPrompt,
    seed: 526562436,
    width: 48,
    height: 48,
    samples: 4,
    maxDepth: 3,
  });
  assert.equal(provenance.scene, "tesseract-lattice");
  assert.equal(provenance.composition.tesseract_vertices, 16);
  assert.equal(provenance.composition.tesseract_edges, 32);
  assert.equal(provenance.composition.beam_capsules, 32);
  assert.equal(provenance.composition.ring_capsules, 48);
  assert.equal(provenance.composition.ring_tori, 2);
  // Bound the CPU cost: ~32 beam capsules + 48 ring capsules + 16 joints +
  // 6 spokes + core ≈ 103 primitives, well under the 800 draft budget.
  assert.ok(
    provenance.object_count <= 200,
    `object_count ${provenance.object_count} should stay under 200 with capsule rings`,
  );
  assert.ok(
    provenance.object_count >= 80,
    `object_count ${provenance.object_count} unexpectedly low after capsule rings`,
  );
  assert.equal(provenance.composition.emissive_cores, 1);
  // Draft sample counts use soft emissive rings, not black GGX silhouettes.
  assert.equal(provenance.composition.ring_material, "ring-glow");
  assert.ok(
    provenance.mean_luminance > 8,
    `mean luminance ${provenance.mean_luminance} should exceed 8`,
  );
  assert.ok(
    provenance.mean_luminance_center > 12,
    `center ROI ${provenance.mean_luminance_center} should exceed 12`,
  );
  assert.ok(typeof provenance.dark_pixel_fraction === "number");
  // Camera locked on the energy core (elevated look-at).
  assert.ok(provenance.camera.look_at.y > 0.4);
});

test("camera screen-up follows world-up", () => {
  const camera = new Camera4D({
    x: 5.2,
    y: 1.4,
    z: 1.9,
    lx: 0,
    ly: 0.55,
    lz: 0,
    width: 128,
    height: 128,
    fovX: 48,
    fovY: 48,
  });
  assert.ok(camera.basis.up.y > 0, `basis up.y ${camera.basis.up.y} must be positive`);
  const top = camera.generateRay(64, 0, 0.5, 0.5, 0.5, 0.5);
  const bottom = camera.generateRay(64, 127, 0.5, 0.5, 0.5, 0.5);
  assert.ok(top.direction.y > bottom.direction.y, "top-of-frame ray must point above bottom-of-frame ray");
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
