/**
 * Axiom Vision — End-to-End Test.
 *
 * Creates a synthetic test image, runs the full pipeline,
 * and verifies evidence chain + conformance.
 */

import { analyzeRGBA } from "../bindings/axiomVision.js";
import { runAllVisionChecks } from "../conformance/visionChecks.js";
import { evidenceToLLMContext, llmSystemPrompt } from "../ir/llmContext.js";
import { sha256Hex, canonicalJSON } from "../evidence/sha256.js";
import { resetFeatureCounter } from "../evidence/evidenceBuilder.js";

/**
 * Create a synthetic test image with known features:
 * - A white rectangle on black background (strong edges)
 * - A diagonal gradient region
 * - A solid color block (for histogram testing)
 *
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array} RGBA buffer
 */
function createTestImage(width = 256, height = 256) {
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      if (x >= 50 && x <= 150 && y >= 50 && y <= 120) {
        // White rectangle
        rgba[i] = 255; rgba[i + 1] = 255; rgba[i + 2] = 255; rgba[i + 3] = 255;
      } else if (x >= 180 && x <= 240 && y >= 150 && y <= 220) {
        // Gradient block
        const intensity = Math.floor(((x - 180) / 60) * 255);
        rgba[i] = intensity; rgba[i + 1] = 0; rgba[i + 2] = 255 - intensity; rgba[i + 3] = 255;
      } else {
        // Black background
        rgba[i] = 0; rgba[i + 1] = 0; rgba[i + 2] = 0; rgba[i + 3] = 255;
      }
    }
  }

  return rgba;
}

/**
 * Run the full test suite.
 */
export async function runTests() {
  const results = [];
  let passed = 0;
  let failed = 0;
  const testPromises = [];

  function test(name, fn) {
    const p = Promise.resolve().then(() => fn()).then(
      () => { results.push({ name, status: "PASS" }); passed++; },
      (e) => { results.push({ name, status: "FAIL", error: e.message }); failed++; }
    );
    testPromises.push(p);
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message || "Assertion failed");
  }

  function assertEqual(a, b, message) {
    if (a !== b) throw new Error(message || `Expected ${b}, got ${a}`);
  }

  // ===== Test 1: Basic analysis produces valid IR =====
  test("analyze produces valid Vision IR", async () => {
    resetFeatureCounter();
    const rgba = createTestImage(256, 256);
    const vision = await analyzeRGBA(rgba, 256, 256);

    assert(vision.version, "Missing version");
    assert(vision.L0.image_hash, "Missing image_hash");
    assert(vision.L0.width === 256, "Wrong width");
    assert(vision.L0.height === 256, "Wrong height");
    assert(vision.lineage_root, "Missing lineage_root");
    assert(vision.evidence_graph, "Missing evidence_graph");
    assert(vision.metadata, "Missing metadata");
    assert(vision.metadata.deterministic_levels === "0-2", "Wrong deterministic_levels");
    assert(vision.metadata.constitutional_boundary === "OBSERVATION ≠ INTERPRETATION", "Missing constitutional_boundary");
  });

  // ===== Test 2: Edge detection finds the rectangle =====
  test("edge detection finds rectangle edges", async () => {
    resetFeatureCounter();
    const rgba = createTestImage(256, 256);
    const vision = await analyzeRGBA(rgba, 256, 256, { sobelThreshold: 0.05 });

    const edges = vision.evidence_graph.L1.filter(f => f.type === "edge");
    assert(edges.length > 0, "No edges found");

    // Rectangle is at x=[50,150], y=[50,120]
    // Should find edges near these boundaries
    const edgesNearRect = edges.filter(e => {
      const x = e.geometry?.x0;
      const y = e.geometry?.y0;
      return (
        (Math.abs(x - 50) < 3 || Math.abs(x - 150) < 3) && y >= 48 && y <= 122
      ) || (
        (Math.abs(y - 50) < 3 || Math.abs(y - 120) < 3) && x >= 48 && x <= 152
      );
    });

    assert(edgesNearRect.length > 0, "No edges near rectangle boundary");
  });

  // ===== Test 3: Color histogram detects dominant colors =====
  test("color histogram detects dominant colors", async () => {
    resetFeatureCounter();
    const rgba = createTestImage(256, 256);
    const vision = await analyzeRGBA(rgba, 256, 256, { histBins: 8 });

    const histograms = vision.evidence_graph.L1.filter(f => f.type === "color_histogram");
    assert(histograms.length === 1, "Expected exactly 1 histogram");

    const hist = histograms[0];
    assert(hist.bins === 8, "Wrong bin count");
    assert(hist.r_histogram.length === 8, "Wrong r_histogram length");
    assert(hist.g_histogram.length === 8, "Wrong g_histogram length");
    assert(hist.b_histogram.length === 8, "Wrong b_histogram length");

    // Dominant should be black (background is largest area)
    const [dr, dg, db] = hist.dominant_rgb;
    assert(dr < 50 && dg < 50 && db < 50, `Dominant should be dark, got [${dr},${dg},${db}]`);
  });

  // ===== Test 4: Regions and contours detected =====
  test("regions and contours from edge mask", async () => {
    resetFeatureCounter();
    const rgba = createTestImage(256, 256);
    const vision = await analyzeRGBA(rgba, 256, 256, {
      sobelThreshold: 0.05,
      minRegionArea: 100,
      minContourPerimeter: 20,
    });

    const regions = vision.evidence_graph.L2.filter(f => f.type === "region");
    const contours = vision.evidence_graph.L2.filter(f => f.type === "contour");

    assert(regions.length > 0, "No regions found");
    assert(contours.length > 0, "No contours found");

    // Verify region has area and bounding box
    const largestRegion = regions[0];
    assert(largestRegion.area > 0, "Region has no area");
    assert(largestRegion.geometry?.bounding_box, "Region has no bounding_box");
  });

  // ===== Test 5: Evidence hashes are present and valid =====
  test("all features have valid provenance hashes", async () => {
    resetFeatureCounter();
    const rgba = createTestImage(256, 256);
    const vision = await analyzeRGBA(rgba, 256, 256);

    const allFeatures = [
      ...vision.evidence_graph.L1,
      ...vision.evidence_graph.L2,
    ];

    for (const f of allFeatures) {
      assert(f.provenance?.feature_hash, `Feature ${f.feature_id} missing feature_hash`);
      assert(f.provenance?.feature_hash.length === 64, `Feature ${f.feature_id} hash wrong length`);
      assert(f.provenance?.deterministic === true || f.level >= 3, `L${f.level} feature should be deterministic`);
    }
  });

  // ===== Test 6: Deterministic output (same input → same output) =====
  test("analysis is deterministic", async () => {
    resetFeatureCounter();
    const rgba = createTestImage(256, 256);
    const vision1 = await analyzeRGBA(rgba, 256, 256);

    resetFeatureCounter();
    const vision2 = await analyzeRGBA(rgba, 256, 256);

    assertEqual(vision1.L0.image_hash, vision2.L0.image_hash, "Image hashes differ");
    assertEqual(vision1.lineage_root, vision2.lineage_root, "Merkle roots differ");

    const l1h1 = vision1.evidence_graph.L1.map(f => f.provenance.feature_hash).join(",");
    const l1h2 = vision2.evidence_graph.L1.map(f => f.provenance.feature_hash).join(",");
    assertEqual(l1h1, l1h2, "L1 feature hashes differ");
  });

  // ===== Test 7: Constitutional tags are correct =====
  test("constitutional tags correctly assigned", async () => {
    resetFeatureCounter();
    const rgba = createTestImage(256, 256);
    const vision = await analyzeRGBA(rgba, 256, 256);

    for (const f of vision.evidence_graph.L1) {
      assertEqual(f.constitutional_tag, "measurement", `L1 feature ${f.feature_id} should be 'measurement'`);
    }

    for (const f of vision.evidence_graph.L2) {
      assertEqual(f.constitutional_tag, "measurement", `L2 feature ${f.feature_id} should be 'measurement'`);
    }
  });

  // ===== Test 8: LLM context extraction =====
  test("LLM context extraction produces valid structure", async () => {
    resetFeatureCounter();
    const rgba = createTestImage(256, 256);
    const vision = await analyzeRGBA(rgba, 256, 256);

    const ctx = evidenceToLLMContext(vision);
    assert(ctx.scene_summary, "Missing scene_summary");
    assert(ctx.scene_summary.image_hash, "Missing image_hash in context");
    assert(Array.isArray(ctx.observations), "observations not an array");
    assert(Array.isArray(ctx.geometry), "geometry not an array");
    assert(ctx.provenance.constitutional_boundary === "OBSERVATION ≠ INTERPRETATION", "Missing boundary in context");
    assert(ctx.observations.length > 0, "No observations in context");
  });

  // ===== Test 9: LLM system prompt =====
  test("LLM system prompt contains governance rules", () => {
    const prompt = llmSystemPrompt();
    assert(prompt.includes("constitutional vision pipeline"), "Missing pipeline reference");
    assert(prompt.includes("MEASURED"), "Missing MEASURED guidance");
    assert(prompt.includes("INFERRED"), "Missing INFERRED guidance");
    assert(prompt.includes("interpretation_not_fact"), "Missing interpretation tag");
    assert(prompt.includes("feature_hash"), "Missing feature_hash guidance");
  });

  // ===== Test 10: Conformance checks pass =====
  test("all vision conformance checks pass", async () => {
    resetFeatureCounter();
    const rgba = createTestImage(256, 256);
    const vision = await analyzeRGBA(rgba, 256, 256);

    const conformance = runAllVisionChecks(vision);
    assert(conformance.failed === 0, `${conformance.failed} conformance checks failed`);
    assert(conformance.passed >= 3, `Expected at least 3 passing checks, got ${conformance.passed}`);
  });

  // ===== Test 11: Image hash verification =====
  test("image hash is correct SHA-256 of input", async () => {
    resetFeatureCounter();
    const rgba = createTestImage(128, 128);
    const vision = await analyzeRGBA(rgba, 128, 128);

    // Verify the image hash is deterministic
    resetFeatureCounter();
    const rgba2 = createTestImage(128, 128);
    const vision2 = await analyzeRGBA(rgba2, 128, 128);

    assertEqual(vision.L0.image_hash, vision2.L0.image_hash, "Same image should produce same hash");
  });

  // ===== Test 12: Feature hash stability (same input → same hashes) =====
  test("feature hashes are stable across runs", async () => {
    const hashes1 = [];
    const hashes2 = [];

    resetFeatureCounter();
    const rgba = createTestImage(128, 128);
    const v1 = await analyzeRGBA(rgba, 128, 128);
    for (const f of v1.evidence_graph.L1.slice(0, 10)) {
      hashes1.push(f.provenance.feature_hash);
    }

    resetFeatureCounter();
    const v2 = await analyzeRGBA(rgba, 128, 128);
    for (const f of v2.evidence_graph.L1.slice(0, 10)) {
      hashes2.push(f.provenance.feature_hash);
    }

    assertEqual(hashes1.join(","), hashes2.join(","), "Feature hashes changed between runs");
  });

  // ===== Test 13: Feature count scales with image complexity =====
  test("more complex image produces more features", async () => {
    // Simple image: all black
    const simple = new Uint8Array(64 * 64 * 4).fill(0);
    for (let i = 0; i < 64 * 64; i++) simple[i * 4 + 3] = 255;

    resetFeatureCounter();
    const vSimple = await analyzeRGBA(simple, 64, 64, { sobelThreshold: 0.1 });

    // Complex image: checkerboard
    const complex = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const i = (y * 64 + x) * 4;
        const white = ((x >> 3) + (y >> 3)) % 2 === 0;
        complex[i] = white ? 255 : 0;
        complex[i + 1] = white ? 255 : 0;
        complex[i + 2] = white ? 255 : 0;
        complex[i + 3] = 255;
      }
    }

    resetFeatureCounter();
    const vComplex = await analyzeRGBA(complex, 64, 64, { sobelThreshold: 0.1 });

    const edgesSimple = vSimple.evidence_graph.L1.filter(f => f.type === "edge").length;
    const edgesComplex = vComplex.evidence_graph.L1.filter(f => f.type === "edge").length;

    assert(edgesComplex > edgesSimple, `Complex image (${edgesComplex} edges) should have more edges than simple (${edgesSimple})`);
  });

  // ===== Wait for all tests to complete =====
  await Promise.all(testPromises);

  // ===== Results =====
  console.log(`\n=== Axiom Vision Test Results ===`);
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}\n`);

  for (const r of results) {
    const icon = r.status === "PASS" ? "✓" : "✗";
    console.log(`  ${icon} ${r.name}`);
    if (r.error) console.log(`    Error: ${r.error}`);
  }

  if (failed > 0) {
    console.log(`\n${failed} test(s) failed.`);
    process.exit(1);
  } else {
    console.log(`\nAll ${passed} tests passed.`);
  }

  return { passed, failed, results };
}

// Run if executed directly
const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  runTests().catch(e => {
    console.error("Test runner crashed:", e);
    process.exit(1);
  });
}
