// mandala/engine/chamber/vision-integration.mjs
/**
 * Vision Bridge integration for Holographic Simulation Chamber.
 *
 * After each frame is written, optionally inspect it via the Vision Bridge
 * to create a closed visual feedback loop:
 *   render → write .bin → inspect_image → reason → adjust → re-render
 *
 * The stub provider returns deterministic test scenarios for contract validation.
 * Real providers (OpenAI, Qwen, LLaVA, Ollama) can be swapped via the provider abstraction.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { createStubVisionBridge, VisionBridge } from "../../../mrs/mcp/vision/bridge.js";
import { VisionProviderFactory, StubVisionProvider } from "../../../mrs/mcp/vision/providers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "../../..");

export const VISION_INTEGRATION_STATUS = "skeleton";
export const VISION_INTEGRATION_CLAIM =
  "Vision Bridge wired into holo chamber — inspect_image on rendered frames; stub provider for deterministic testing";

/**
 * Vision inspection configuration
 */
export const VISION_CONFIG = {
  /** Enable vision inspection on frames */
  enabled: true,
  /** Inspect every N frames (1 = every frame) */
  interval: 4,
  /** Detail level for inspection */
  detail: "medium",
  /** Default question for anatomical frames */
  defaultQuestion: "What anatomical features and anomalies are visible in this holographic boundary projection?",
  /** Scenario to use with stub provider */
  stubScenario: "rt4d-holographic-frame",
};

/**
 * Create a vision bridge instance
 * @param {Object} options
 * @param {string} [options.provider='stub'] - Provider type
 * @param {Object} [options.providerOptions] - Provider-specific options
 */
export function createVisionBridge(options = {}) {
  const { provider = "stub", providerOptions = {} } = options;

  if (provider === "stub") {
    const scenario = providerOptions.scenario || VISION_CONFIG.stubScenario;
    return createStubVisionBridge(scenario);
  }

  const visionProvider = VisionProviderFactory.create(provider, providerOptions);
  return new VisionBridge(visionProvider);
}

/**
 * Generate a visual representation of a frame for vision inspection.
 * In production, this would render the .bin data to an image (PNG/WebP).
 * For the stub, we return a data URI placeholder.
 *
 * @param {Object} frameData - Frame data from holoBuffers
 * @param {number} frameIndex
 * @returns {Promise<string>} Image data URI or file path
 */
export async function generateFrameVisual(frameData, frameIndex) {
  // For the stub provider, we don't need a real image - it returns
  // deterministic scenarios based on the scenario name.
  // Real implementation would:
  // 1. Read the .bin frame
  // 2. Render to a canvas/buffer (position + entanglementDensity + curvature)
  // 3. Encode as PNG/WebP
  // 4. Return base64 data URI or save to temp file

  // Placeholder: return a minimal 1x1 transparent PNG data URI
  // The stub provider ignores the actual image content
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
}

/**
 * Inspect a rendered frame using the Vision Bridge
 * @param {Object} visionBridge - VisionBridge instance
 * @param {Object} frameData - Frame data from renderer
 * @param {number} frameIndex
 * @param {Object} [options]
 * @param {string} [options.question] - Custom question
 * @param {string} [options.detail] - Detail level
 * @returns {Promise<Object>} VisionResult
 */
export async function inspectFrame(visionBridge, frameData, frameIndex, options = {}) {
  const { question, detail } = options;

  // Generate visual representation
  const imageDataUri = await generateFrameVisual(frameData, frameIndex);

  // Inspect via vision bridge
  const result = await visionBridge.inspect({
    image: imageDataUri,
    question: question || VISION_CONFIG.defaultQuestion,
    detail: detail || VISION_CONFIG.detail,
  });

  // Attach frame metadata
  result._meta = {
    ...result._meta,
    frameIndex,
    frameTimestamp: new Date().toISOString(),
    source: "holo-chamber",
  };

  return result;
}

/**
 * Active vision: inspect a specific region of a frame in detail
 * @param {Object} visionBridge
 * @param {Object} frameData
 * @param {number} frameIndex
 * @param {Object} bbox - Normalized bbox {x, y, width, height}
 * @param {string} question
 * @returns {Promise<Object>} VisionResult for the region
 */
export async function inspectFrameRegion(visionBridge, frameData, frameIndex, bbox, question) {
  const imageDataUri = await generateFrameVisual(frameData, frameIndex);

  const result = await visionBridge.inspectRegion(
    { image: imageDataUri, detail: "high" },
    bbox,
    question
  );

  result._meta = {
    ...result._meta,
    frameIndex,
    frameTimestamp: new Date().toISOString(),
    source: "holo-chamber",
    activeVision: true,
  };

  return result;
}

/**
 * Determine if a vision result indicates an anomaly requiring attention
 * @param {Object} visionResult
 * @returns {Object} { isAnomaly: boolean, reasons: string[], severity: 'low'|'medium'|'high' }
 */
export function analyzeVisionForAnomalies(visionResult) {
  const reasons = [];
  let severity = "low";

  // Check uncertainties for concerning patterns
  for (const uncertainty of visionResult.uncertainties || []) {
    if (/anomalous|defect|unstable|unexpected|missing|corrupt/i.test(uncertainty)) {
      reasons.push(`Uncertainty flag: ${uncertainty}`);
      severity = "medium";
    }
  }

  // Check inferences for concerning patterns
  for (const inference of visionResult.inferences || []) {
    if (/anomaly|defect|unstable|violation|threshold|exceed/i.test(inference)) {
      reasons.push(`Inference flag: ${inference}`);
      severity = "high";
    }
  }

  // Check observations for low confidence on critical features
  for (const obs of visionResult.observations || []) {
    if (obs.confidence < 0.5 && /anatomy|muscle|bone|joint|boundary/i.test(obs.description)) {
      reasons.push(`Low confidence on critical feature: ${obs.description} (${obs.confidence})`);
      if (severity === "low") severity = "medium";
    }
  }

  return {
    isAnomaly: reasons.length > 0,
    reasons,
    severity,
  };
}

/**
 * Write vision inspection results alongside frame
 * @param {string} outDir
 * @param {number} frameIndex
 * @param {Object} visionResult
 */
export function writeVisionResult(outDir, frameIndex, visionResult) {
  const visionDir = join(outDir, "vision");
  mkdirSync(visionDir, { recursive: true });
  writeFileSync(
    join(visionDir, `frame-${String(frameIndex).padStart(6, "0")}.vision.json`),
    JSON.stringify(visionResult, null, 2)
  );
}

/**
 * Aggregate vision results across frames for receipt
 * @param {Array} visionResults
 * @returns {Object} Vision summary for receipt
 */
export function buildVisionReceipt(visionResults) {
  if (!visionResults.length) return { inspected: 0 };

  const totalFrames = visionResults.length;
  const withAnomalies = visionResults.filter(r => {
    const analysis = analyzeVisionForAnomalies(r);
    return analysis.isAnomaly;
  }).length;

  const allUncertainties = visionResults.flatMap(r => r.uncertainties || []);
  const allInferences = visionResults.flatMap(r => r.inferences || []);
  const avgObservations = visionResults.reduce((sum, r) => sum + (r.observations?.length || 0), 0) / totalFrames;

  return {
    inspected: totalFrames,
    withAnomalies,
    anomalyRate: +(withAnomalies / totalFrames).toFixed(3),
    avgObservationsPerFrame: +avgObservations.toFixed(1),
    topUncertainties: [...new Set(allUncertainties)].slice(0, 10),
    topInferences: [...new Set(allInferences)].slice(0, 10),
    provider: visionResults[0]?._meta?.provider || "unknown",
    detail: visionResults[0]?._meta?.detail || "medium",
    status: VISION_INTEGRATION_STATUS,
    claim: VISION_INTEGRATION_CLAIM,
  };
}