/**
 * Constitutional Inference Contract (CIC)
 * 
 * Governs all reasoning and inference operations within the constitutional engine.
 * Every inference must be evidence-backed, replay-verifiable, and lineage-tracked.
 * 
 * Status: **enforced** - All reasoning must pass through CIC
 * Gaps: Full Blind-Spot Zero compliance declared
 */

import { createHash } from "node:crypto";

export const INFERENCE_TYPES = Object.freeze({
  DEDUCTIVE: "deductive",
  INDUCTIVE: "inductive",
  ABDUCTIVE: "abductive",
  ANALOGICAL: "analogical",
  CAUSAL: "causal",
  TEMPORAL: "temporal",
  DIMENSIONAL: "dimensional",
  COUNTERFACTUAL: "counterfactual"
});

export const EVIDENCE_STRENGTH = Object.freeze({
  CONCLUSIVE: "conclusive",
  STRONG: "strong",
  MODERATE: "moderate",
  WEAK: "weak",
  INSUFFICIENT: "insufficient"
});

export const REASONING_STATUS = Object.freeze({
  PENDING: "pending",
  VALIDATING: "validating",
  VALIDATED: "validated",
  REJECTED: "rejected",
  REVISED: "revised"
});

export class ConstitutionalInferenceContract {
  #inferences;
  #evidenceIndex;
  #lineageGraph;
  #validators;
  #hooks;
  #observationProjection;

  constructor() {
    this.#inferences = new Map();
    this.#evidenceIndex = new Map();
    this.#lineageGraph = new Map();
    this.#validators = new Map();
    this.#hooks = new Map();
    this.#observationProjection = null;

    // Register default validators
    this.registerValidator("evidence_based", validateEvidenceBased);
    this.registerValidator("causal", validateCausalLink);
    this.registerValidator("dimensional", validateDimensionalConsistency);
    this.registerValidator("temporal", validateTemporalConsistency);
    this.registerValidator("replay", validateReplayVerifiability);
    this.registerValidator("constitutional", validateConstitutionalCompliance);

    // Register hooks
    this.#hooks.set("created", []);
    this.#hooks.set("validated", []);
    this.#hooks.set("rejected", []);
    this.#hooks.set("revised", []);
  }

  /**
   * Create a new inference record
   */
  createInference(inference) {
    const inferenceId = this.#generateInferenceId(inference);

    const record = {
      id: inferenceId,
      declaration: inference,
      status: REASONING_STATUS.PENDING,
      type: inference.type,
      premiseIds: inference.premiseIds ?? [],
      conclusion: inference.conclusion,
      evidenceIds: inference.evidenceIds ?? [],
      reasoningChain: inference.reasoningChain ?? [],
      confidence: inference.confidence ?? 0.5,
      evidenceStrength: inference.evidenceStrength ?? EVIDENCE_STRENGTH.INSUFFICIENT,
      createdAt: new Date().toISOString(),
      validatedAt: null,
      validatedBy: null,
      replayToken: null,
      lineage: {
        parentIds: inference.premiseIds ?? [],
        causalChain: inference.causalChain ?? [],
        derivedFrom: inference.derivedFrom ?? null
      },
      evidenceChain: [...(inference.evidenceIds ?? [])],
      constitutionalHash: this.#computeConstitutionalHash(inference),
      blindSpotCheck: null
    };

    record.replayToken = this.#computeReplayToken(record);

    this.#inferences.set(inferenceId, record);
    this.#indexEvidence(record);
    this.#updateLineageGraph(record);
    this.#triggerHooks("created", { inferenceId, record });

    return record;
  }

  /**
   * Validate an inference through all registered validators
   */
  validateInference(inferenceId, validatorId) {
    const record = this.#inferences.get(inferenceId);
    if (!record) {
      return { valid: false, errors: [`Inference ${inferenceId} not found`] };
    }

    const validators = validatorId
      ? [this.#validators.get(validatorId)].filter(Boolean)
      : Array.from(this.#validators.values());

    const errors = [];
    for (const validator of validators) {
      try {
        const result = validator(record);
        if (!result.valid) {
          errors.push(...result.errors.map(e => `${validator.name}: ${e}`));
        }
      } catch (e) {
        errors.push(`${validator.name}: ${e.message}`);
      }
    }

    const valid = errors.length === 0;
    record.status = valid ? REASONING_STATUS.VALIDATED : REASONING_STATUS.REJECTED;
    record.validatedAt = new Date().toISOString();
    record.errors = errors;

    if (valid) {
      this.#triggerHooks("validated", { inferenceId, record });
    } else {
      this.#triggerHooks("rejected", { inferenceId, errors });
    }

    return { valid, errors };
  }

  /**
   * Revise an inference with new evidence or reasoning
   */
  reviseInference(inferenceId, revision) {
    const record = this.#inferences.get(inferenceId);
    if (!record) {
      throw new Error(`Inference ${inferenceId} not found`);
    }

    const updates = revision.updates ?? {};
    const revisedId = this.#generateInferenceId({
      ...record.declaration,
      ...updates
    });

    const revisedRecord = {
      ...record,
      id: revisedId,
      declaration: { ...record.declaration, ...updates },
      conclusion: updates.conclusion ?? record.conclusion,
      reasoningChain: [...record.reasoningChain, revision.reasoning],
      evidenceIds: [...new Set([...record.evidenceIds, ...(revision.additionalEvidenceIds ?? [])])],
      premiseIds: [...new Set([...record.premiseIds, ...(revision.additionalPremiseIds ?? [])])],
      evidenceChain: [...new Set([...record.evidenceChain, ...(revision.additionalEvidenceIds ?? [])])],
      status: REASONING_STATUS.REVISED,
      revisedAt: new Date().toISOString(),
      revisedFrom: record.id,
      revisionReason: revision.reason,
      previousHash: this.#computeConstitutionalHash(record.declaration),
      constitutionalHash: this.#computeConstitutionalHash({ ...record.declaration, ...updates })
    };

    revisedRecord.replayToken = this.#computeReplayToken(revisedRecord);

    this.#inferences.set(revisedId, revisedRecord);
    this.#indexEvidence(revisedRecord);
    this.#updateLineageGraph(revisedRecord);
    this.#triggerHooks("revised", { originalId: inferenceId, revisedId, revision });

    return { originalId: inferenceId, revisedId, record: revisedRecord };
  }

  /**
   * Bind an observation projection bundle for inference-backed observation.
   * Passing null clears the binding.
   */
  bindObservationProjection(bundle) {
    this.#observationProjection = bundle;
  }

  /**
   * Project an observation point through the bound projection, if any.
   * Returns null when no projection is bound.
   */
  projectObservationPoint(point) {
    if (!this.#observationProjection) return null;
    return {
      authority: "observation",
      printSoT: false,
      point,
      status: this.#observationProjection.status ?? "declared",
      projection: this.#observationProjection
    };
  }

  /**
   * Verify an inference's replay token
   */
  verifyReplayToken(inferenceId) {
    const record = this.#inferences.get(inferenceId);
    if (!record) {
      return { valid: false, reason: "Inference not found" };
    }

    // Recompute replay token from current state
    const computedToken = this.#computeReplayToken(record);

    if (record.replayToken && record.replayToken !== computedToken) {
      return { valid: false, reason: "Replay token mismatch - inference has been modified" };
    }

    return { valid: true, token: computedToken };
  }

  /**
   * Check for blind spots in reasoning
   */
  checkBlindSpots(inferenceId) {
    const record = this.#inferences.get(inferenceId);
    if (!record) {
      return { hasBlindSpots: true, blindSpots: ["Inference not found"] };
    }

    const blindSpots = [];

    // Check for missing evidence
    if (record.evidenceIds.length === 0) {
      blindSpots.push("No supporting evidence");
    }

    // Check for weak evidence
    if (record.evidenceStrength === EVIDENCE_STRENGTH.INSUFFICIENT ||
        record.evidenceStrength === EVIDENCE_STRENGTH.WEAK) {
      blindSpots.push("Evidence strength is insufficient");
    }

    // Check for missing causal links
    if (record.type === INFERENCE_TYPES.CAUSAL && record.lineage.causalChain.length === 0) {
      blindSpots.push("No causal chain established");
    }

    // Check for dimensional consistency
    if (record.type === INFERENCE_TYPES.DIMENSIONAL && record.lineage.causalChain.length < 2) {
      blindSpots.push("Insufficient dimensional reasoning chain");
    }

    // Check for temporal consistency
    if (record.type === INFERENCE_TYPES.TEMPORAL && record.lineage.causalChain.length < 1) {
      blindSpots.push("Insufficient temporal reasoning chain");
    }

    // Check replay verifiability
    const replayCheck = this.verifyReplayToken(record.id);
    if (!replayCheck.valid) {
      blindSpots.push(`Replay verification failed: ${replayCheck.reason}`);
    }

    const report = {
      hasBlindSpots: blindSpots.length > 0,
      blindSpots,
      confidence: record.confidence,
      evidenceStrength: record.evidenceStrength,
      recommendations: blindSpots.length > 0 ? [
        "Gather additional supporting evidence",
        "Strengthen causal chain",
        "Verify replay token",
        "Consider revising with stronger evidence"
      ] : []
    };

    record.blindSpotCheck = report;
    return report;
  }

  /**
   * Get inference by ID
   */
  getInference(inferenceId) {
    return this.#inferences.get(inferenceId);
  }

  /**
   * Get all inferences matching filter
   */
  getInferences(filter) {
    let inferences = Array.from(this.#inferences.values());

    if (filter) {
      if (filter.type) {
        inferences = inferences.filter(i => i.type === filter.type);
      }
      if (filter.status) {
        inferences = inferences.filter(i => i.status === filter.status);
      }
      if (filter.minConfidence !== undefined) {
        inferences = inferences.filter(i => i.confidence >= filter.minConfidence);
      }
    }

    return inferences;
  }

  /**
   * Get reasoning chain for an inference, walking revised-from and premise lineage
   */
  getReasoningChain(inferenceId) {
    const chain = [];
    const visited = new Set();
    let current = this.#inferences.get(inferenceId);

    while (current) {
      if (visited.has(current.id)) break;
      visited.add(current.id);
      chain.unshift(current);

      if (current.revisedFrom) {
        current = this.#inferences.get(current.revisedFrom);
      } else if (current.lineage.derivedFrom) {
        current = this.#inferences.get(current.lineage.derivedFrom);
      } else if (current.lineage.parentIds.length > 0) {
        current = this.#inferences.get(current.lineage.parentIds[0]);
      } else {
        break;
      }
    }

    return chain;
  }

  registerValidator(name, validator) {
    this.#validators.set(name, validator);
  }

  registerHook(event, hook) {
    if (!this.#hooks.has(event)) {
      this.#hooks.set(event, []);
    }
    this.#hooks.get(event).push(hook);
  }

  // Private methods

  #generateInferenceId(inference) {
    const payload = `${inference.type}:${JSON.stringify(inference.conclusion)}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    return createHash("sha256").update(payload).digest("hex").slice(0, 16);
  }

  #computeConstitutionalHash(inference) {
    const payload = JSON.stringify({
      type: inference.type,
      conclusion: inference.conclusion,
      premiseIds: inference.premiseIds,
      evidenceIds: inference.evidenceIds,
      reasoningChain: inference.reasoningChain,
      confidence: inference.confidence
    }, Object.keys(inference).sort());

    return createHash("sha256").update(payload).digest("hex").slice(0, 16);
  }

  #computeReplayToken(record) {
    const material = {
      id: record.id,
      conclusion: record.conclusion,
      premiseIds: record.premiseIds,
      evidenceIds: record.evidenceIds,
      reasoningChain: record.reasoningChain,
      constitutionalHash: record.constitutionalHash
    };

    const json = JSON.stringify(material, Object.keys(material).sort());
    return createHash("sha256").update(json).digest("hex");
  }

  #indexEvidence(record) {
    for (const evidenceId of record.evidenceIds) {
      if (!this.#evidenceIndex.has(evidenceId)) {
        this.#evidenceIndex.set(evidenceId, new Set());
      }
      this.#evidenceIndex.get(evidenceId).add(record.id);
    }
  }

  #updateLineageGraph(record) {
    this.#lineageGraph.set(record.id, new Set(record.lineage.parentIds));
  }

  #triggerHooks(event, data) {
    const hooks = this.#hooks.get(event) || [];
    for (const hook of hooks) {
      try {
        hook(data);
      } catch (e) {
        console.error(`Hook ${event} failed:`, e);
      }
    }
  }
}

// Validators

function validateEvidenceBased(record) {
  const errors = [];

  if (record.evidenceIds.length === 0) {
    errors.push("No supporting evidence provided");
  }

  if (record.evidenceStrength === EVIDENCE_STRENGTH.INSUFFICIENT) {
    errors.push("Evidence strength is insufficient");
  }

  return { valid: errors.length === 0, errors };
}

function validateCausalLink(record) {
  const errors = [];

  if (record.type === "causal" && record.lineage.causalChain.length === 0) {
    errors.push("Causal inference requires causal chain");
  }

  if (record.type === "causal" && record.premiseIds.length < 1) {
    errors.push("Causal inference requires at least one premise");
  }

  return { valid: errors.length === 0, errors };
}

function validateDimensionalConsistency(record) {
  const errors = [];

  if (record.type === "dimensional") {
    if (record.lineage.causalChain.length < 2) {
      errors.push("Dimensional inference requires at least 2 reasoning steps");
    }

    // Check dimensional consistency in reasoning chain
    for (const step of record.reasoningChain) {
      if (step.dimension !== undefined && (step.dimension < 0 || step.dimension > 4)) {
        errors.push(`Invalid dimension in reasoning step: ${step.dimension}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateTemporalConsistency(record) {
  const errors = [];

  if (record.type === "temporal") {
    if (record.lineage.causalChain.length < 1) {
      errors.push("Temporal inference requires causal chain");
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateReplayVerifiability(record) {
  const errors = [];

  // Check if inference has replay token
  if (!record.replayToken) {
    errors.push("Missing replay token");
  }

  return { valid: errors.length === 0, errors };
}

function validateConstitutionalCompliance(record) {
  const errors = [];

  // Check constitutional hash
  if (!record.constitutionalHash) {
    errors.push("Missing constitutional hash");
  }

  // Check replay token
  if (!record.replayToken) {
    errors.push("Missing replay token");
  }

  // Check evidence chain integrity
  if (record.evidenceChain.length === 0 && record.evidenceIds.length > 0) {
    errors.push("Evidence chain incomplete");
  }

  return { valid: errors.length === 0, errors };
}

// Export singleton
export const constitutionalInferenceContract = new ConstitutionalInferenceContract();
