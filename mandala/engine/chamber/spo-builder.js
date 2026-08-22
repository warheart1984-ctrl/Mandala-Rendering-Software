// mandala/engine/chamber/spo-builder.js
// Semantic Perception Object (SPO) builder — convert VisionResult to certified SPO

import { canonicalJSON } from "./cpo-types.js";
import { sha256 } from "./cpo-types.js";

export const SPO_BUILDER_STATUS = "skeleton";
export const SPO_BUILDER_CLAIM = "SPO builder — VisionResult to certified semantic overlay with governance metadata";

/**
 * Convert VisionResult observations to SPO regions
 * @param {Object} visionResult - VisionBridge result
 * @param {Object} options
 * @param {number} options.frameIndex
 * @param {Object} options.provenance - renderIdentity, etc.
 * @returns {Promise<Object>} SPO
 */
export async function buildSPOFromVision(visionResult, options = {}) {
  const { frameIndex = 0, provenance = {}, providerInfo = {} } = options;

  const regions = [];
  const regionMap = new Map(); // deduplicate by bbox

  // Convert observations to regions
  for (const obs of visionResult.observations || []) {
    const bbox = obs.bbox || { x: 0, y: 0, width: 1, height: 1 };
    const key = `${bbox.x.toFixed(3)},${bbox.y.toFixed(3)},${bbox.width.toFixed(3)},${bbox.height.toFixed(3)}`;

    if (!regionMap.has(key)) {
      regionMap.set(key, {
        region_id: regions.length,
        label: obs.description,
        confidence: obs.confidence,
        bbox: [bbox.x, bbox.y, bbox.width, bbox.height],
        evidence_ref: `obs-${obs.type}-${regions.length}`,
        observation_type: obs.type,
      });
      regions.push(regionMap.get(key));
    } else {
      // Merge: keep higher confidence
      const existing = regionMap.get(key);
      if (obs.confidence > existing.confidence) {
        existing.label = obs.description;
        existing.confidence = obs.confidence;
        existing.observation_type = obs.type;
      }
    }
  }

  // Add visible text as regions
  for (const textObj of visionResult.visible_text || []) {
    const bbox = textObj.bbox || { x: 0, y: 0, width: 0.1, height: 0.05 };
    const key = `text-${bbox.x.toFixed(3)},${bbox.y.toFixed(3)}`;
    regions.push({
      region_id: regions.length,
      label: `text: "${textObj.text}"`,
      confidence: textObj.confidence,
      bbox: [bbox.x, bbox.y, bbox.width, bbox.height],
      evidence_ref: `ocr-${regions.length}`,
      observation_type: "text",
      _source: textObj._source,
      _trusted: textObj._trusted,
      _potential_injection: textObj._potential_injection,
    });
  }

  // Provider metadata
  const provider = {
    name: visionResult._meta?.provider || "unknown",
    version: visionResult._meta?.provider_version || "1.0.0",
    config: {
      detail: visionResult._meta?.detail || "medium",
      question: visionResult._meta?.question || null,
    },
  };

  // Governance metadata from vision result uncertainties/inferences
  const uncertaintyPenalty = Math.min(0.3, (visionResult.uncertainties?.length || 0) * 0.05);
  const injectionPenalty = visionResult.visible_text?.some(t => t._potential_injection) ? 0.2 : 0;

  const governance = {
    intent_confidence: Math.max(0, 0.9 - uncertaintyPenalty),
    evidence_confidence: Math.max(0, 0.85 - uncertaintyPenalty - injectionPenalty),
    conformance_score: Math.max(0, 0.88 - uncertaintyPenalty),
    stewardship_score: injectionPenalty > 0 ? 0.5 : 1.0,
  };

  const spo = {
    protocol: "mandala-link/1",
    version: "1.0.0",
    type: "semantic-overlay",
    source_hash: visionResult._meta?.cpo_hash || "pending",
    regions,
    relationships: visionResult.relationships || [],
    uncertainties: visionResult.uncertainties || [],
    inferences: visionResult.inferences || [],
    provider,
    governance,
    metadata: {
      created: new Date().toISOString(),
      frameIndex,
      provenance,
      content_hash: "", // filled below
    },
  };

  spo.metadata.content_hash = await sha256(canonicalJSON(spo));
  return spo;
}

/**
 * Build SPO from VisionResult with CPO hash binding
 * @param {Object} visionResult
 * @param {string} cpoHash - content_hash of parent CPO
 * @param {Object} options
 * @returns {Promise<Object>} SPO
 */
export async function attachSPOToCPO(visionResult, cpoHash, options = {}) {
  const spo = await buildSPOFromVision(visionResult, options);
  spo.source_hash = cpoHash;
  // Recompute hash with correct source_hash
  spo.metadata.content_hash = await sha256(canonicalJSON(spo));
  return spo;
}

/**
 * Validate SPO against CPO
 * @param {Object} spo
 * @param {Object} cpo
 * @param {Object} opts - { governanceThreshold: { intent, evidence, conformance, stewardship } }
 * @returns {Object} { valid: boolean, errors: string[], governanceValid: boolean, governanceErrors: string[] }
 */
export function validateSPO(spo, cpo, opts = {}) {
  const errors = [];
  const governanceErrors = [];
  const threshold = opts.governanceThreshold || { intent: 0.1, evidence: 0.1, conformance: 0.3, stewardship: 0.3 };

  if (spo.source_hash !== cpo.metadata.content_hash) {
    errors.push(`SPO source_hash (${spo.source_hash}) does not match CPO content_hash (${cpo.metadata.content_hash})`);
  }

  if (spo.regions) {
    for (const region of spo.regions) {
      if (region.bbox) {
        const [x, y, w, h] = region.bbox;
        if (x < 0 || x > 1 || y < 0 || y > 1 || w <= 0 || w > 1 || h <= 0 || h > 1 || x + w > 1 || y + h > 1) {
          errors.push(`Region ${region.region_id} has invalid bbox: [${x}, ${y}, ${w}, ${h}]`);
        }
      }
      if (region.confidence < 0 || region.confidence > 1) {
        errors.push(`Region ${region.region_id} has invalid confidence: ${region.confidence}`);
      }
    }
  }

  if (!spo.provider || !spo.provider.name) {
    errors.push("SPO missing provider metadata");
  }

  if (!spo.governance) {
    errors.push("SPO missing governance metadata");
  }

  // G7: Governance threshold validation
  let governanceValid = true;
  if (spo.governance) {
    const gov = spo.governance;
    if (typeof gov.intent_confidence === 'number' && gov.intent_confidence < threshold.intent) {
      governanceErrors.push(`intent_confidence=${gov.intent_confidence.toFixed(3)}<${threshold.intent}`);
      governanceValid = false;
    }
    if (typeof gov.evidence_confidence === 'number' && gov.evidence_confidence < threshold.evidence) {
      governanceErrors.push(`evidence_confidence=${gov.evidence_confidence.toFixed(3)}<${threshold.evidence}`);
      governanceValid = false;
    }
    if (typeof gov.conformance_score === 'number' && gov.conformance_score < threshold.conformance) {
      governanceErrors.push(`conformance_score=${gov.conformance_score.toFixed(3)}<${threshold.conformance}`);
      governanceValid = false;
    }
    if (typeof gov.stewardship_score === 'number' && gov.stewardship_score < threshold.stewardship) {
      governanceErrors.push(`stewardship_score=${gov.stewardship_score.toFixed(3)}<${threshold.stewardship}`);
      governanceValid = false;
    }
  }

  return { valid: errors.length === 0, errors, governanceValid, governanceErrors };
}