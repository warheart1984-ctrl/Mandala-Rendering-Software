/**
 * Axiom Vision — L3/L4 Object Detection & Spatial Relations Test.
 *
 * Tests:
 * - L3 detection processing with evidence generation
 * - L3 providers (Static, External interface)
 * - L4 spatial relation computation
 * - L4 temporal tracking
 * - L4 semantic grouping
 * - Integration: L3 detections → L4 relations
 * - Conformance with L3/L4 present
 */

import { analyzeRGBA } from "../bindings/axiomVision.js";
import {
  processDetections,
  StaticDetectionProvider,
  detectObjects,
} from "../kernels/objectDetection.js";
import {
  computeSpatialRelations,
  computeTrackingRelations,
  computeSemanticGroups,
} from "../kernels/spatialRelations.js";
import { runAllVisionChecks, checkModelEvidencePresent } from "../conformance/visionChecks.js";
import { resetFeatureCounter } from "../evidence/evidenceBuilder.js";
import { buildEvidence } from "../evidence/evidenceBuilder.js";

// ===== Mock Model Evidence =====

const MOCK_MODEL_EVIDENCE = {
  model_name: "yolov8n-lora",
  model_version: "1.0.0",
  checksum_sha256: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  quantization: "INT8",
  parameter_count: 3_100_000,
  input_shape: [1, 3, 640, 640],
  training_method: "lora",
  lora_rank: "8",
  base_model: "yolov8n",
  training_dataset: "custom_dataset_v1",
  training_epochs: 50,
};

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

  // ===== L3 Tests =====

  test("processDetections creates L3 evidence with bounding boxes", () => {
    const rawDets = [
      { label: "person", label_id: 0, confidence: 0.95, x: 100, y: 50, w: 200, h: 300 },
      { label: "car", label_id: 1, confidence: 0.87, x: 400, y: 200, w: 150, h: 100 },
    ];

    const evidence = processDetections(
      rawDets,
      MOCK_MODEL_EVIDENCE,
      { width: 640, height: 480, image_hash: "abc123" },
      ["hash_parent_1"]
    );

    assertEqual(evidence.length, 2, "Expected 2 detections");
    assertEqual(evidence[0].level, 3, "Level should be 3");
    assertEqual(evidence[0].type, "detection", "Type should be detection");
    assertEqual(evidence[0].label, "person");
    assertEqual(evidence[0].confidence, 0.95);
    assertEqual(evidence[0].constitutional_tag, "inference");
    assert(evidence[0].geometry.bounding_box, "Missing bounding_box");
    assertEqual(evidence[0].geometry.bounding_box.x, 100);
    assertEqual(evidence[0].geometry.bounding_box.w, 200);
    assert(evidence[0].provenance.feature_hash, "Missing feature_hash");
    assert(evidence[0].provenance.model_hash, "Missing model_hash");
    assert(evidence[0].model_evidence, "Missing model_evidence");
    assertEqual(evidence[0].model_evidence.model_name, "yolov8n-lora");
    assertEqual(evidence[0].model_evidence.checksum_sha256, MOCK_MODEL_EVIDENCE.checksum_sha256);
  });

  test("processDetections sorts by confidence descending", () => {
    const rawDets = [
      { label: "low", label_id: 0, confidence: 0.3, x: 0, y: 0, w: 10, h: 10 },
      { label: "high", label_id: 1, confidence: 0.99, x: 100, y: 100, w: 50, h: 50 },
      { label: "mid", label_id: 2, confidence: 0.6, x: 200, y: 200, w: 30, h: 30 },
    ];

    const evidence = processDetections(rawDets, MOCK_MODEL_EVIDENCE, { width: 640, height: 480 });

    assertEqual(evidence[0].confidence, 0.99);
    assertEqual(evidence[1].confidence, 0.6);
    assertEqual(evidence[2].confidence, 0.3);
  });

  test("processDetections clamps out-of-bounds boxes", () => {
    const rawDets = [
      { label: "oob", label_id: 0, confidence: 0.8, x: 600, y: 400, w: 100, h: 100 },
    ];

    const evidence = processDetections(rawDets, MOCK_MODEL_EVIDENCE, { width: 640, height: 480 });

    const bbox = evidence[0].geometry.bounding_box;
    assert(bbox.x + bbox.w <= 640, "Box width exceeds image");
    assert(bbox.y + bbox.h <= 480, "Box height exceeds image");
  });

  test("StaticDetectionProvider returns pre-set detections", async () => {
    const dets = [
      { label: "test", label_id: 0, confidence: 0.9, x: 10, y: 10, w: 50, h: 50 },
    ];
    const provider = new StaticDetectionProvider(dets, MOCK_MODEL_EVIDENCE);

    const result = await provider.detect(new Uint8Array(100), 10, 10);
    assertEqual(result.length, 1);
    assertEqual(result[0].label, "test");

    const modelEvidence = provider.getModelEvidence();
    assertEqual(modelEvidence.model_name, "yolov8n-lora");
  });

  test("detectObjects produces L3 evidence from provider", async () => {
    const dets = [
      { label: "obj1", label_id: 0, confidence: 0.92, x: 50, y: 50, w: 100, h: 100 },
    ];
    const provider = new StaticDetectionProvider(dets, MOCK_MODEL_EVIDENCE);

    const evidence = await detectObjects(provider, new Uint8Array(100), 10, 10, {
      imageHash: "img_hash_123",
      parentHashes: ["p1", "p2"],
    });

    assertEqual(evidence.length, 1);
    assertEqual(evidence[0].level, 3);
    assert(evidence[0].provenance.parent_hash, "Missing parent_hash");
  });

  test("L3 evidence carries LoRA training provenance", () => {
    const rawDets = [
      { label: "custom_object", label_id: 0, confidence: 0.88, x: 0, y: 0, w: 50, h: 50 },
    ];

    const evidence = processDetections(rawDets, MOCK_MODEL_EVIDENCE, { width: 100, height: 100 });

    const me = evidence[0].model_evidence;
    assertEqual(me.training_method, "lora");
    assertEqual(me.lora_rank, "8");
    assertEqual(me.base_model, "yolov8n");
    assertEqual(me.training_epochs, 50);
    assertEqual(me.parameter_count, 3_100_000);
  });

  // ===== L4 Tests =====

  test("computeSpatialRelations detects above/below", () => {
    const dets = [
      buildEvidence({ level: 3, type: "detection", label: "top", label_id: 0, confidence: 0.9, geometry: { bounding_box: { x: 100, y: 10, w: 50, h: 50 } } }),
      buildEvidence({ level: 3, type: "detection", label: "bottom", label_id: 1, confidence: 0.8, geometry: { bounding_box: { x: 100, y: 200, w: 50, h: 50 } } }),
    ];

    const relations = computeSpatialRelations(dets, { width: 640, height: 480 });

    const aboveRel = relations.find(r => r.relation === "above");
    const belowRel = relations.find(r => r.relation === "below");

    assert(aboveRel, "Should find 'above' relation");
    assert(belowRel, "Should find 'below' relation");
    assertEqual(aboveRel.level, 4);
    assertEqual(aboveRel.type, "spatial_relation");
    assertEqual(aboveRel.subject, dets[0].feature_id);
    assertEqual(aboveRel.object, dets[1].feature_id);
  });

  test("computeSpatialRelations detects left/right", () => {
    const dets = [
      buildEvidence({ level: 3, type: "detection", label: "left", label_id: 0, confidence: 0.9, geometry: { bounding_box: { x: 10, y: 100, w: 50, h: 50 } } }),
      buildEvidence({ level: 3, type: "detection", label: "right", label_id: 1, confidence: 0.8, geometry: { bounding_box: { x: 300, y: 100, w: 50, h: 50 } } }),
    ];

    const relations = computeSpatialRelations(dets, { width: 640, height: 480 });

    const leftRel = relations.find(r => r.relation === "left_of");
    assert(leftRel, "Should find 'left_of' relation");
    assertEqual(leftRel.relation, "left_of");
  });

  test("computeSpatialRelations detects containment", () => {
    const dets = [
      buildEvidence({ level: 3, type: "detection", label: "outer", label_id: 0, confidence: 0.9, geometry: { bounding_box: { x: 50, y: 50, w: 300, h: 300 } } }),
      buildEvidence({ level: 3, type: "detection", label: "inner", label_id: 1, confidence: 0.8, geometry: { bounding_box: { x: 100, y: 100, w: 50, h: 50 } } }),
    ];

    const relations = computeSpatialRelations(dets, { width: 640, height: 480 });

    const insideRel = relations.find(r => r.relation === "inside");
    const containsRel = relations.find(r => r.relation === "contains");

    assert(insideRel, "Should find 'inside' relation");
    assert(containsRel, "Should find 'contains' relation");
    assert(insideRel.confidence >= 0.99, "Containment should have high confidence");
  });

  test("computeSpatialRelations detects near", () => {
    const dets = [
      buildEvidence({ level: 3, type: "detection", label: "a", label_id: 0, confidence: 0.9, geometry: { bounding_box: { x: 100, y: 100, w: 50, h: 50 } } }),
      buildEvidence({ level: 3, type: "detection", label: "b", label_id: 1, confidence: 0.8, geometry: { bounding_box: { x: 130, y: 130, w: 50, h: 50 } } }),
    ];

    const relations = computeSpatialRelations(dets, { width: 640, height: 480 });

    const nearRel = relations.find(r => r.relation === "near");
    assert(nearRel, "Should find 'near' relation for close objects");
  });

  test("computeSpatialRelations returns empty for single detection", () => {
    const dets = [
      buildEvidence({ level: 3, type: "detection", label: "solo", label_id: 0, confidence: 0.9, geometry: { bounding_box: { x: 10, y: 10, w: 50, h: 50 } } }),
    ];

    const relations = computeSpatialRelations(dets, { width: 640, height: 480 });
    assertEqual(relations.length, 0, "Single detection should have no relations");
  });

  test("computeTrackingRelations matches by IoU", () => {
    const prev = [
      buildEvidence({ level: 3, type: "detection", label: "obj", label_id: 0, confidence: 0.9, geometry: { bounding_box: { x: 100, y: 100, w: 50, h: 50 } } }),
    ];
    const curr = [
      buildEvidence({ level: 3, type: "detection", label: "obj", label_id: 0, confidence: 0.85, geometry: { bounding_box: { x: 105, y: 102, w: 50, h: 50 } } }),
    ];

    const tracks = computeTrackingRelations(prev, curr, 0.3);

    assert(tracks.length > 0, "Should find tracking match");
    assertEqual(tracks[0].type, "temporal_track");
    assertEqual(tracks[0].relation, "same_object_as");
    assert(tracks[0].velocity, "Should have velocity");
  });

  test("computeSemanticGroups clusters same-class objects", () => {
    const dets = [
      buildEvidence({ level: 3, type: "detection", label: "person", label_id: 0, confidence: 0.9, geometry: { bounding_box: { x: 100, y: 100, w: 50, h: 50 } } }),
      buildEvidence({ level: 3, type: "detection", label: "person", label_id: 0, confidence: 0.85, geometry: { bounding_box: { x: 130, y: 130, w: 50, h: 50 } } }),
      buildEvidence({ level: 3, type: "detection", label: "person", label_id: 0, confidence: 0.8, geometry: { bounding_box: { x: 115, y: 115, w: 50, h: 50 } } }),
    ];

    const groups = computeSemanticGroups(dets);

    assert(groups.length > 0, "Should find semantic group");
    assertEqual(groups[0].relation, "grouped_with");
    assert(groups[0].group_size >= 2, "Group should have multiple members");
    assertEqual(groups[0].group_class, "person");
  });

  // ===== Integration Tests =====

  test("L3 detections feed L4 relations", async () => {
    resetFeatureCounter();
    const rgba = new Uint8Array(100 * 100 * 4).fill(128);
    const vision = await analyzeRGBA(rgba, 100, 100, { sobelThreshold: 0.05 });

    // Create L3 detections from static provider
    const dets = [
      { label: "region_a", label_id: 0, confidence: 0.9, x: 10, y: 10, w: 30, h: 30 },
      { label: "region_b", label_id: 1, confidence: 0.85, x: 60, y: 60, w: 30, h: 30 },
    ];
    const provider = new StaticDetectionProvider(dets, MOCK_MODEL_EVIDENCE);
    const l3Evidence = await detectObjects(provider, rgba, 100, 100, {
      parentHashes: vision.evidence_graph.L1.slice(0, 3).map(f => f.provenance.feature_hash),
    });

    // Feed L3 into L4
    const l4Relations = computeSpatialRelations(l3Evidence, { width: 100, height: 100 });

    assert(l3Evidence.length > 0, "Should have L3 detections");
    assert(l4Relations.length > 0, "Should have L4 relations");

    // L4 should reference L3 feature IDs
    const rel = l4Relations[0];
    assert(l3Evidence.some(f => f.feature_id === rel.subject), "L4 subject should be L3 detection");
    assert(l3Evidence.some(f => f.feature_id === rel.object), "L4 object should be L3 detection");
  });

  test("full pipeline L0-L4 with conformance", async () => {
    resetFeatureCounter();
    const rgba = new Uint8Array(128 * 128 * 4);
    // Create distinct regions
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const i = (y * 128 + x) * 4;
        if (x < 64 && y < 64) {
          rgba[i] = 255; rgba[i + 1] = 0; rgba[i + 2] = 0; rgba[i + 3] = 255;
        } else if (x >= 64 && y >= 64) {
          rgba[i] = 0; rgba[i + 1] = 0; rgba[i + 2] = 255; rgba[i + 3] = 255;
        } else {
          rgba[i] = 128; rgba[i + 1] = 128; rgba[i + 2] = 128; rgba[i + 3] = 255;
        }
      }
    }

    const vision = await analyzeRGBA(rgba, 128, 128, { sobelThreshold: 0.05 });

    // Add L3 detections
    const dets = [
      { label: "red_region", label_id: 0, confidence: 0.92, x: 10, y: 10, w: 40, h: 40 },
      { label: "blue_region", label_id: 1, confidence: 0.88, x: 80, y: 80, w: 40, h: 40 },
    ];
    const provider = new StaticDetectionProvider(dets, MOCK_MODEL_EVIDENCE);
    vision.evidence_graph.L3 = await detectObjects(provider, rgba, 128, 128, {
      parentHashes: vision.evidence_graph.L2.slice(0, 2).map(f => f.provenance.feature_hash),
    });

    // Add L4 relations
    vision.evidence_graph.L4 = computeSpatialRelations(
      vision.evidence_graph.L3,
      { width: 128, height: 128 }
    );

    // Run conformance
    const conformance = runAllVisionChecks(vision);
    assert(conformance.failed === 0, `${conformance.failed} checks failed: ${JSON.stringify(conformance.results.filter(r => !r.passed))}`);

    // Verify structure
    assert(vision.evidence_graph.L1.length > 0, "Should have L1");
    assert(vision.evidence_graph.L2.length > 0, "Should have L2");
    assert(vision.evidence_graph.L3.length > 0, "Should have L3");
    assert(vision.evidence_graph.L4.length > 0, "Should have L4");
  });

  test("L3 model evidence present check passes", () => {
    const graph = {
      L1: [],
      L2: [],
      L3: [
        {
          feature_id: "det1",
          level: 3,
          model_evidence: {
            model_name: "test",
            checksum_sha256: "abc",
            quantization: "INT8",
            parameter_count: 1000,
          },
        },
      ],
      L4: [],
    };

    const result = checkModelEvidencePresent(graph.L3, graph.L4);
    assert(result.passed, "L3 with model evidence should pass");
  });

  // ===== Results =====
  await Promise.all(testPromises);

  console.log(`\n=== Axiom Vision L3/L4 Test Results ===`);
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
