/**
 * Axiom Vision — L5 Interpretation Test.
 *
 * Tests the LLM interpretation layer including:
 * - Response parsing with grounding validation
 * - Unverifiable claim detection
 * - Mock provider (no real LLM needed)
 * - Full interpret() flow
 * - analyzeWithInterpretation() convenience function
 */

import { analyzeRGBA } from "../bindings/axiomVision.js";
import { L5Interpreter } from "../ir/l5Interpreter.js";
import { parseL5Response } from "../ir/l5Parser.js";
import { LLMProvider } from "../ir/llmProvider.js";
import { runAllVisionChecks } from "../conformance/visionChecks.js";
import { resetFeatureCounter } from "../evidence/evidenceBuilder.js";
import { sha256Hex } from "../evidence/sha256.js";

// ===== Mock LLM Provider =====

class MockLLMProvider extends LLMProvider {
  constructor(responses) {
    super({ baseUrl: "http://mock", model: "mock-llm-v1" });
    this.responses = responses;
    this.callIndex = 0;
    this.lastMessages = null;
  }

  async chat(messages) {
    this.lastMessages = messages;
    const response = this.responses[this.callIndex % this.responses.length];
    this.callIndex++;
    return response;
  }
}

// ===== Test Image =====

function createTestImage(width = 128, height = 128) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (x >= 30 && x <= 90 && y >= 30 && y <= 90) {
        rgba[i] = 255; rgba[i + 1] = 255; rgba[i + 2] = 255; rgba[i + 3] = 255;
      } else {
        rgba[i] = 0; rgba[i + 1] = 0; rgba[i + 2] = 0; rgba[i + 3] = 255;
      }
    }
  }
  return rgba;
}

// ===== Tests =====

export async function runTests() {
  const results = [];
  let passed = 0;
  let failed = 0;
  const testPromises = [];

  function test(name, fn) {
    const p = Promise.resolve().then(() => fn()).then(
      () => { results.push({ name, status: "PASS" }); passed++; },
      (e) => { results.push({ name, status: "FAIL", error: e.message, stack: e.stack }); failed++; }
    );
    testPromises.push(p);
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message || "Assertion failed");
  }

  function assertEqual(a, b, message) {
    if (a !== b) throw new Error(message || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }

  // ===== Test 1: Parse valid L5 response =====
  test("parseL5Response extracts interpretations with grounding", () => {
    const graph = {
      L1: [
        { feature_id: "feat_edg_000001", type: "edge", provenance: { feature_hash: "abc123" } },
        { feature_id: "feat_edg_000002", type: "edge", provenance: { feature_hash: "def456" } },
      ],
      L2: [
        { feature_id: "feat_con_000003", type: "contour", provenance: { feature_hash: "ghi789" } },
      ],
    };

    const raw = JSON.stringify({
      interpretations: [
        {
          claim: "A white square occupies the center of the image.",
          confidence: 0.92,
          grounded_by: ["feat_edg_000001", "feat_edg_000002", "feat_con_000003"],
          category: "scene_description",
        },
        {
          claim: "The square has four strong edges.",
          confidence: 0.99,
          grounded_by: ["feat_edg_000001", "feat_edg_000002"],
          category: "spatial_layout",
        },
      ],
      unverifiable_claims: ["The square might be a picture frame."],
      summary: "A centered white square on black background.",
    });

    const result = parseL5Response(raw, graph, { model: "mock-llm-v1" });

    assertEqual(result.interpretations.length, 2, "Expected 2 interpretations");
    assertEqual(result.unverifiable.length, 1, "Expected 1 unverifiable claim");
    assertEqual(result.summary, "A centered white square on black background.");

    const interp1 = result.interpretations[0];
    assertEqual(interp1.level, 5, "Level should be 5");
    assertEqual(interp1.type, "interpretation", "Type should be interpretation");
    assertEqual(interp1.constitutional_tag, "interpretation_not_fact", "Tag should be interpretation_not_fact");
    assertEqual(interp1.claim, "A white square occupies the center of the image.");
    assertEqual(interp1.confidence, 0.92);
    assertEqual(interp1.grounded_by.length, 3, "Should have 3 grounding refs");
    assert(interp1.provenance.feature_hash, "Missing feature_hash");
    assert(interp1.provenance.parent_hash, "Missing parent_hash");
  });

  // ===== Test 2: Invalid grounding refs are flagged =====
  test("parseL5Response flags invalid grounding references", () => {
    const graph = {
      L1: [
        { feature_id: "feat_edg_000001", type: "edge", provenance: { feature_hash: "abc123" } },
      ],
    };

    const raw = JSON.stringify({
      interpretations: [
        {
          claim: "Something about the image.",
          confidence: 0.7,
          grounded_by: ["nonexistent_id_1", "nonexistent_id_2"],
          category: "other",
        },
      ],
    });

    const result = parseL5Response(raw, graph, { model: "mock" });

    // Should be moved to unverifiable since all refs are invalid
    assertEqual(result.interpretations.length, 0, "No valid interpretations");
    assertEqual(result.unverifiable.length, 1, "Should be flagged as unverifiable");
    assert(result.unverifiable[0].invalid_refs.length === 2, "Should have 2 invalid refs");
  });

  // ===== Test 3: Partial grounding is preserved =====
  test("parseL5Response preserves partial grounding", () => {
    const graph = {
      L1: [
        { feature_id: "feat_edg_000001", type: "edge", provenance: { feature_hash: "abc" } },
      ],
    };

    const raw = JSON.stringify({
      interpretations: [
        {
          claim: "Partially grounded claim.",
          confidence: 0.6,
          grounded_by: ["feat_edg_000001", "invalid_ref"],
          category: "other",
        },
      ],
    });

    const result = parseL5Response(raw, graph, { model: "mock" });

    assertEqual(result.interpretations.length, 1, "Should keep partially grounded interpretation");
    assertEqual(result.interpretations[0].grounded_by.length, 1, "Should have 1 valid grounding ref");
    assertEqual(result.interpretations[0].grounded_by[0], "feat_edg_000001");
    assert(result.interpretations[0].ungrounded_refs?.length === 1, "Should track ungrounded refs");
  });

  // ===== Test 4: JSON in markdown code block =====
  test("parseL5Response handles JSON in markdown blocks", () => {
    const graph = {
      L1: [{ feature_id: "f1", provenance: { feature_hash: "h1" } }],
    };

    const raw = `Here is my analysis:

\`\`\`json
{
  "interpretations": [
    {
      "claim": "Test claim.",
      "confidence": 0.8,
      "grounded_by": ["f1"],
      "category": "scene_description"
    }
  ],
  "summary": "Test summary"
}
\`\`\`

That's my analysis.`;

    const result = parseL5Response(raw, graph, { model: "mock" });
    assertEqual(result.interpretations.length, 1);
    assertEqual(result.summary, "Test summary");
  });

  // ===== Test 5: Confidence clamping =====
  test("parseL5Response clamps confidence to [0,1]", () => {
    const graph = {
      L1: [{ feature_id: "f1", provenance: { feature_hash: "h1" } }],
    };

    const raw = JSON.stringify({
      interpretations: [
        { claim: "Overconfident.", confidence: 1.5, grounded_by: ["f1"] },
        { claim: "Underconfident.", confidence: -0.5, grounded_by: ["f1"] },
      ],
    });

    const result = parseL5Response(raw, graph, { model: "mock" });
    assert(result.interpretations[0].confidence === 1.0, "Should clamp to 1.0");
    assert(result.interpretations[1].confidence === 0.0, "Should clamp to 0.0");
  });

  // ===== Test 6: Empty/malformed response =====
  test("parseL5Response handles empty interpretations array", () => {
    const graph = { L1: [] };
    const raw = JSON.stringify({ interpretations: [], summary: "" });
    const result = parseL5Response(raw, graph, { model: "mock" });
    assertEqual(result.interpretations.length, 0);
    assertEqual(result.unverifiable.length, 0);
  });

  // ===== Test 7: LLM provider construction =====
  test("LLMProvider constructs with correct defaults", () => {
    const p1 = new LLMProvider({ baseUrl: "http://example.com/", model: "test" });
    assertEqual(p1.baseUrl, "http://example.com", "Trailing slash stripped");
    assertEqual(p1.maxTokens, 2048, "Default maxTokens");
    assertEqual(p1.temperature, 0.3, "Default temperature");
    assertEqual(p1.responseFormat, "json_object", "Default responseFormat");
  });

  // ===== Test 8: Mock provider records messages =====
  test("MockLLMProvider records messages and returns responses", async () => {
    const mock = new MockLLMProvider(['{"interpretations":[],"summary":"ok"}']);
    const response = await mock.chat([{ role: "user", content: "test" }]);
    assertEqual(response, '{"interpretations":[],"summary":"ok"}');
    assertEqual(mock.lastMessages.length, 1);
    assertEqual(mock.lastMessages[0].role, "user");
  });

  // ===== Test 9: Full L5 interpret flow =====
  test("L5Interpreter.interpret produces L5 evidence", async () => {
    resetFeatureCounter();
    const rgba = createTestImage(128, 128);
    const vision = await analyzeRGBA(rgba, 128, 128, { sobelThreshold: 0.05 });

    // Get valid feature IDs
    const l1Ids = vision.evidence_graph.L1.filter(f => f.type === "edge").slice(0, 3).map(f => f.feature_id);
    const l2Ids = vision.evidence_graph.L2.slice(0, 2).map(f => f.feature_id);
    const groundedIds = [...l1Ids, ...l2Ids];

    const mockResponse = JSON.stringify({
      interpretations: [
        {
          claim: "A light rectangular region contrasts with a dark background.",
          confidence: 0.88,
          grounded_by: groundedIds,
          category: "scene_description",
        },
      ],
      unverifiable_claims: ["The region could be a photograph."],
      summary: "A centered light rectangle on dark background.",
    });

    const mockProvider = new MockLLMProvider([mockResponse]);
    const interpreter = new L5Interpreter({ provider: mockProvider });
    const result = await interpreter.interpret(vision);

    assert(result.interpretations.length > 0, "Should produce interpretations");
    assert(result.unverifiable.length > 0, "Should have unverifiable claims");

    const interp = result.interpretations[0];
    assertEqual(interp.level, 5);
    assertEqual(interp.constitutional_tag, "interpretation_not_fact");
    assert(interp.parent_features.length > 0, "Should have parent features");
    assert(interp.provenance.feature_hash, "Should have feature hash");

    // Verify system prompt includes governance rules
    const systemMsg = mockProvider.lastMessages[0].content;
    assert(systemMsg.includes("constitutional vision pipeline"), "System prompt should reference pipeline");
    assert(systemMsg.includes("interpretation_not_fact"), "System prompt should mention interpretation tag");
  });

  // ===== Test 10: interpretInto appends L5 to Vision IR =====
  test("L5Interpreter.interpretInto appends L5 in place", async () => {
    resetFeatureCounter();
    const rgba = createTestImage(64, 64);
    const vision = await analyzeRGBA(rgba, 64, 64, { sobelThreshold: 0.1 });

    const groundedIds = vision.evidence_graph.L1.slice(0, 2).map(f => f.feature_id);

    const mockResponse = JSON.stringify({
      interpretations: [
        {
          claim: "Dark image with some edges.",
          confidence: 0.75,
          grounded_by: groundedIds,
          category: "scene_description",
        },
      ],
      summary: "Dark image.",
    });

    const mockProvider = new MockLLMProvider([mockResponse]);
    const interpreter = new L5Interpreter({ provider: mockProvider });
    await interpreter.interpretInto(vision);

    assert(vision.evidence_graph.L5, "L5 should exist");
    assert(vision.evidence_graph.L5.length > 0, "L5 should have interpretations");
    assertEqual(vision.metadata.scene_summary, "Dark image.", "Summary should be stored");
  });

  // ===== Test 11: Conformance checks with L5 =====
  test("vision conformance checks pass with L5 present", async () => {
    resetFeatureCounter();
    const rgba = createTestImage(64, 64);
    const vision = await analyzeRGBA(rgba, 64, 64);

    const groundedIds = vision.evidence_graph.L1.slice(0, 2).map(f => f.feature_id);

    // Manually add L5
    const mockResponse = JSON.stringify({
      interpretations: [
        {
          claim: "Test interpretation.",
          confidence: 0.8,
          grounded_by: groundedIds,
          category: "scene_description",
        },
      ],
      summary: "Test.",
    });

    const result = parseL5Response(mockResponse, vision.evidence_graph, { model: "mock" });
    vision.evidence_graph.L5 = result.interpretations;

    const conformance = runAllVisionChecks(vision);
    assert(conformance.failed === 0, `${conformance.failed} checks failed: ${JSON.stringify(conformance.results.filter(r => !r.passed))}`);
  });

  // ===== Test 12: L5 feature hash stability =====
  test("L5 feature hashes are deterministic given same input", () => {
    const graph = {
      L1: [{ feature_id: "f1", type: "edge", provenance: { feature_hash: "h1" } }],
    };

    const raw = JSON.stringify({
      interpretations: [
        {
          claim: "Deterministic claim.",
          confidence: 0.9,
          grounded_by: ["f1"],
          category: "scene_description",
        },
      ],
      summary: "Summary.",
    });

    const result1 = parseL5Response(raw, graph, { model: "test" });
    const result2 = parseL5Response(raw, graph, { model: "test" });

    assertEqual(
      result1.interpretations[0].provenance.feature_hash,
      result2.interpretations[0].provenance.feature_hash,
      "Feature hashes should be deterministic"
    );
  });

  // ===== Test 13: Grounding chain integrity =====
  test("L5 interpretations maintain hash lineage to L1", () => {
    const graph = {
      L1: [
        { feature_id: "f1", type: "edge", provenance: { feature_hash: "hash_f1" } },
        { feature_id: "f2", type: "edge", provenance: { feature_hash: "hash_f2" } },
      ],
    };

    const raw = JSON.stringify({
      interpretations: [
        {
          claim: "Grounded claim.",
          confidence: 0.85,
          grounded_by: ["f1", "f2"],
          category: "scene_description",
        },
      ],
    });

    const result = parseL5Response(raw, graph, { model: "test" });
    const interp = result.interpretations[0];

    assert(interp.provenance.parent_hash, "Should have parent hash");
    // parent_hash is computed from sorted parent hashes
    const expectedParentHash = sha256Hex(
      ["hash_f1", "hash_f2"].sort().join("")
    );
    assertEqual(interp.provenance.parent_hash, expectedParentHash, "Parent hash should match");
  });

  // ===== Results =====
  await Promise.all(testPromises);

  console.log(`\n=== Axiom Vision L5 Test Results ===`);
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
