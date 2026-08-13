/**
 * Axiom Vision — Public API.
 *
 * sovereign-x/axiom-vision
 * Provenance-preserving computational vision substrate.
 *
 * Usage:
 *   import { analyze, analyzeRGBA } from "axiom-vision";
 *   const vision = await analyzeRGBA(rgbaBuffer, 512, 512);
 *   console.log(vision.evidence_graph.L1.length, "edges detected");
 */

// Core analysis
export { analyze, analyzeRGBA } from "./bindings/axiomVision.js";
export { AXIOM_VISION_VERSION } from "./bindings/axiomVision.js";

// IR construction
export { buildVisionIR, VISION_IR_VERSION } from "./ir/visionIR.js";

// LLM integration (L5 interpretation)
export { evidenceToLLMContext, llmSystemPrompt } from "./ir/llmContext.js";
export { L5Interpreter, analyzeWithInterpretation } from "./ir/l5Interpreter.js";
export { parseL5Response } from "./ir/l5Parser.js";
export { LLMProvider, createDefaultProvider, createLemonadeProvider } from "./ir/llmProvider.js";

// Evidence building
export { buildEvidence, resetFeatureCounter } from "./evidence/evidenceBuilder.js";
export { sha256Hex, sha256Bytes, canonicalJSON } from "./evidence/sha256.js";

// Lineage tracking
export { computeMerkleRoot, computeLevelHash, traceLineage, verifyLineage } from "./evidence/lineageTracker.js";

// Conformance
export { runAllVisionChecks } from "./conformance/visionChecks.js";

// Kernel registry
export { registerVisionKernels, getVisionKernelEntries } from "./bindings/kernelRegistry.js";

// Sovereign X integration
export { createVisionHandler, VisionWorkload } from "./bindings/sovereignXVision.js";

// Tile utilities
export { computeTileGrid, getTileBounds, featureTouchesTileBoundary } from "./tile/tileSplitter.js";
export { mergeTileFeatures, mergeHistograms, mergeGradientFields } from "./tile/featureMerger.js";

// Kernels (for direct use / testing)
export { sobelFull, sobelDetect } from "./kernels/sobel.js";
export { colorHistogram } from "./kernels/colorHistogram.js";
export { gradientField } from "./kernels/gradientField.js";
export { connectedComponents, edgeMagnitudeToMask } from "./kernels/connectedComponents.js";
export { extractContours } from "./kernels/contours.js";

// L3 Object Detection
export {
  processDetections,
  detectObjects,
  DetectionProvider,
  StaticDetectionProvider,
  ExternalDetectionProvider,
  ONNXDetectionProvider,
} from "./kernels/objectDetection.js";

// L4 Spatial Relations
export {
  computeSpatialRelations,
  computeTrackingRelations,
  computeSemanticGroups,
} from "./kernels/spatialRelations.js";
