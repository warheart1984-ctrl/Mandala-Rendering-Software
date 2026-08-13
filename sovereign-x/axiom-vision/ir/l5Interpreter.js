/**
 * Axiom Vision — L5 Interpreter.
 *
 * The top of the evidence pipeline: feeds structured evidence to an LLM
 * and converts its semantic interpretations into L5 evidence objects.
 *
 * Constitutional constraints:
 *   - LLM never sees raw pixels — only structured evidence
 *   - Every interpretation must be grounded to specific feature IDs
 *   - All L5 outputs tagged as interpretation_not_fact
 *   - Confidence reflects LLM uncertainty, not measurement precision
 */

import { evidenceToLLMContext, llmSystemPrompt } from "./llmContext.js";
import { parseL5Response } from "./l5Parser.js";
import { LLMProvider, createDefaultProvider } from "./llmProvider.js";

export class L5Interpreter {
  /**
   * @param {Object} config
   * @param {LLMProvider} [config.provider] - LLM provider instance
   * @param {string} [config.analysisType="scene_description"] - Type of analysis to perform
   * @param {number} [options.maxClaims=10] - Max interpretations to request
   */
  constructor(config = {}) {
    this.provider = config.provider || createDefaultProvider();
    this.analysisType = config.analysisType || "scene_description";
    this.maxClaims = config.maxClaims || 10;
  }

  /**
   * Interpret the evidence graph and produce L5 features.
   *
   * @param {Object} visionIR - Full Vision IR (output of analyze())
   * @returns {Promise<Object>} { interpretations, unverifiable, summary }
   */
  async interpret(visionIR) {
    // Extract structured context for the LLM
    const context = evidenceToLLMContext(visionIR, {
      maxObservations: 100,
      maxDetections: 50,
      includeLineage: true,
    });

    // Build the prompt
    const messages = [
      { role: "system", content: this._buildSystemPrompt() },
      { role: "user", content: this._buildUserPrompt(context) },
    ];

    // Call LLM
    const rawResponse = await this.provider.chat(messages);

    // Parse into L5 evidence (needs evidence graph for grounding validation)
    const result = parseL5Response(rawResponse, visionIR.evidence_graph, {
      model: this.provider.model,
      model_version: "1.0.0",
      analysis_type: this.analysisType,
      timestamp: new Date().toISOString(),
    });

    return result;
  }

  /**
   * Interpret and append L5 to the Vision IR in place.
   *
   * @param {Object} visionIR
   * @returns {Promise<Object>} Updated visionIR with L5 populated
   */
  async interpretInto(visionIR) {
    const result = await this.interpret(visionIR);

    if (!visionIR.evidence_graph.L5) {
      visionIR.evidence_graph.L5 = [];
    }
    visionIR.evidence_graph.L5.push(...result.interpretations);

    if (result.summary && !visionIR.metadata.scene_summary) {
      visionIR.metadata.scene_summary = result.summary;
    }

    return visionIR;
  }

  _buildSystemPrompt() {
    return llmSystemPrompt() + `

## Analysis Type: ${this.analysisType}
Provide up to ${this.maxClaims} grounded interpretations.

## Response Format (JSON only):
{
  "interpretations": [
    {
      "claim": "string — a factual statement about the scene",
      "confidence": 0.0-1.0,
      "grounded_by": ["feature_id_1", "feature_id_2"],
      "category": "scene_description" | "object_behavior" | "spatial_layout" | "anomaly" | "other"
    }
  ],
  "unverifiable_claims": ["string — claims you cannot ground in evidence"],
  "summary": "One sentence overall scene summary"
}`;
  }

  _buildUserPrompt(context) {
    return `Analyze the following structured visual evidence and provide grounded interpretations.

## Evidence
${JSON.stringify(context, null, 2)}

Remember: Every claim must reference specific feature IDs from the evidence above. If you cannot ground a claim, put it in unverifiable_claims.`;
  }
}

/**
 * Convenience function: analyze + interpret in one call.
 *
 * @param {Uint8Array} rgba - Raw RGBA pixel buffer
 * @param {number} width
 * @param {number} height
 * @param {Object} [options] - Passed to analyzeRGBA + L5Interpreter
 * @returns {Promise<Object>} Full Vision IR with L5 populated
 */
export async function analyzeWithInterpretation(rgba, width, height, options = {}) {
  const { analyzeRGBA } = await import("../bindings/axiomVision.js");
  const visionIR = await analyzeRGBA(rgba, width, height, options);

  const interpreter = new L5Interpreter({
    provider: options.provider,
    analysisType: options.analysisType || "scene_description",
    maxClaims: options.maxClaims || 10,
  });

  return interpreter.interpretInto(visionIR);
}
